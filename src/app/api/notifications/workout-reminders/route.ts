import { NextResponse } from 'next/server';
import { supabase } from '@/lib/db';
import { brazilToday } from '@/lib/timezone';
import { verifyCronSecret } from '@/lib/cron-auth';
import {
  sendNotificationToUser,
  getUsersWithSubscriptions,
  isBrazilQuietHour,
  brazilHour,
} from '@/lib/notification-sender';

// Workout burns in food_logs are stored as negative calories
async function hasWorkoutToday(userId: string): Promise<boolean> {
  const { data } = await supabase
    .from('food_logs')
    .select('id')
    .eq('user_id', userId)
    .eq('log_date', brazilToday())
    .lt('calories', 0)
    .limit(1);
  return (data ?? []).length > 0;
}

async function checkUserWorkoutReminder(userId: string): Promise<'notified' | 'ok' | 'skipped' | 'no_sub' | 'error' | 'opt_out'> {
  if (isBrazilQuietHour()) return 'skipped';

  const bHour = brazilHour();

  // Morning motivational window: 7–9h Brazil time
  const inMorningWindow = bHour >= 7 && bHour <= 9;
  // Evening reminder: 17–19h if no workout recorded yet
  const inEveningWindow = bHour >= 17 && bHour <= 19;

  if (!inMorningWindow && !inEveningWindow) return 'skipped';

  const alreadyWorkedOut = await hasWorkoutToday(userId);
  if (alreadyWorkedOut) return 'ok';

  const isMorning = inMorningWindow;

  const result = await sendNotificationToUser(
    userId,
    {
      title:    isMorning ? 'Bom dia! Hora de se mover 💪' : 'Que tal um treino hoje? 🏃',
      body:     isMorning
        ? 'Comece o dia com energia! Registre seu treino e mantenha o ritmo.'
        : 'Você ainda não registrou nenhuma atividade hoje. Que tal fazer uma caminhada ou treino rápido?',
      tag:      'hc-workout',
      url:      '/dashboard',
      category: 'workout',
    },
    { urgency: 'normal', ttl: 3 * 3600, topic: 'hc-workout' },
  );

  return result;
}

// GET /api/notifications/workout-reminders?cron=1
export async function GET(req: Request) {
  const authErr = verifyCronSecret(req);
  if (authErr) return authErr;

  const bHour = brazilHour();
  if (isBrazilQuietHour()) {
    return NextResponse.json({ skipped: true, reason: 'quiet_hours', brazilHour: bHour });
  }

  const uniqueUsers = await getUsersWithSubscriptions();
  const results = await Promise.allSettled(
    uniqueUsers.map((uid) => checkUserWorkoutReminder(uid)),
  );

  const counts = { notified: 0, ok: 0, skipped: 0, no_sub: 0, error: 0, opt_out: 0 };
  results.forEach((r) => {
    if (r.status === 'fulfilled') {
      const k = r.value as keyof typeof counts;
      if (k in counts) counts[k]++;
    } else {
      counts.error++;
    }
  });

  console.info(`[workout-reminders] cron done brazilHour=${bHour} users=${uniqueUsers.length}`, counts);
  return NextResponse.json({ checked: uniqueUsers.length, brazilHour: bHour, ...counts });
}
