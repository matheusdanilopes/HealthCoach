import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { supabase } from '@/lib/db';
import { brazilToday } from '@/lib/timezone';
import { verifyCronSecret } from '@/lib/cron-auth';
import {
  sendNotificationToUser,
  getUsersWithSubscriptions,
  isBrazilQuietHour,
  brazilHour,
} from '@/lib/notification-sender';

const HYDRATION_DEDUP_MINUTES = 90;
const HYDRATION_DAILY_CAP     = 4;

async function getTotalHydration(
  userId: string,
  date: string,
): Promise<{ totalMl: number; lastLogAt: string | null }> {
  const [{ data: waterData }, { data: foodData }] = await Promise.all([
    supabase
      .from('water_logs')
      .select('amount_ml, created_at')
      .eq('user_id', userId)
      .eq('log_date', date)
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('food_logs')
      .select('hydration_ml, created_at')
      .eq('user_id', userId)
      .eq('log_date', date)
      .gt('hydration_ml', 0),
  ]);

  const waterMl = (waterData ?? []).reduce((s: number, r: { amount_ml: number }) => s + r.amount_ml, 0);
  const mealMl  = (foodData  ?? []).reduce((s: number, r: { hydration_ml: number }) => s + r.hydration_ml, 0);

  const timestamps = [
    ...(waterData ?? []).map((r: { created_at: string }) => r.created_at),
    ...(foodData  ?? []).map((r: { created_at: string }) => r.created_at),
  ].sort().reverse();

  return { totalMl: waterMl + mealMl, lastLogAt: timestamps[0] ?? null };
}

// Returns minutes since last sent hydration notification today, and today's count.
async function minutesSinceLastHydrationNotif(
  userId: string,
): Promise<{ minutesAgo: number; dailyCount: number }> {
  const todayStart = brazilToday() + 'T00:00:00.000-03:00';
  const { data } = await supabase
    .from('notification_logs')
    .select('sent_at')
    .eq('user_id', userId)
    .eq('category', 'hydration')
    .eq('status', 'sent')
    .gte('sent_at', todayStart)
    .order('sent_at', { ascending: false })
    .limit(HYDRATION_DAILY_CAP + 1);

  const rows = (data ?? []) as Array<{ sent_at: string }>;
  const minutesAgo = rows.length > 0
    ? Math.floor((Date.now() - new Date(rows[0].sent_at).getTime()) / 60_000)
    : 9999;

  return { minutesAgo, dailyCount: rows.length };
}

function buildNotification(
  totalMl: number,
  target: number,
  minSince: number,
  bHour: number,
): { title: string; body: string; urgency: 'high' | 'normal' } {
  const remaining = Math.max(0, target - totalMl);
  const pct       = target > 0 ? Math.round((totalMl / target) * 100) : 0;

  if (minSince >= 240) {
    return {
      title:   'Sua meta diária está ficando comprometida 💧',
      body:    `Você está há mais de 4 horas sem se hidratar. Faltam ${remaining}ml para a meta!`,
      urgency: 'high',
    };
  }
  if (minSince >= 180) {
    return {
      title:   'Sua hidratação está atrasada hoje 💧',
      body:    `Você está há 3 horas sem tomar água. Faltam ${remaining}ml para completar a meta.`,
      urgency: 'high',
    };
  }
  if (bHour >= 19 && pct < 50) {
    return {
      title:   'Atenção com a hidratação 💧',
      body:    `Noite chegando e você só tomou ${pct}% da meta. Faltam ${remaining}ml!`,
      urgency: 'high',
    };
  }
  if (bHour >= 19) {
    return {
      title:   'Hidratação do dia quase completa 💧',
      body:    `Faltam apenas ${remaining}ml para completar a meta de hoje.`,
      urgency: 'normal',
    };
  }
  return {
    title:   'Você está há 2 horas sem registrar água 💧',
    body:    `Beba água agora! Faltam ${remaining}ml para a meta diária.`,
    urgency: 'normal',
  };
}

async function checkUserHydration(userId: string): Promise<'notified' | 'ok' | 'no_sub' | 'skipped' | 'error' | 'opt_out'> {
  if (isBrazilQuietHour()) return 'skipped';

  const bHour  = brazilHour();
  const target_ = await supabase.from('users').select('target_water_ml').eq('id', userId).single();
  const target  = (target_.data as { target_water_ml: number } | null)?.target_water_ml ?? 2500;

  const { totalMl, lastLogAt } = await getTotalHydration(userId, brazilToday());

  if (totalMl >= target) return 'ok';

  const minSince = lastLogAt
    ? Math.floor((Date.now() - new Date(lastLogAt).getTime()) / 60_000)
    : 9999;

  if (minSince < 120) return 'ok';

  // Deduplication: avoid sending a hydration notification sent very recently or over daily cap
  const { minutesAgo, dailyCount } = await minutesSinceLastHydrationNotif(userId);
  if (dailyCount >= HYDRATION_DAILY_CAP) return 'ok';
  if (minutesAgo < HYDRATION_DEDUP_MINUTES) return 'ok';

  const { title, body, urgency } = buildNotification(totalMl, target, minSince, bHour);
  const isEvening = bHour >= 19;

  const result = await sendNotificationToUser(
    userId,
    { title, body, tag: 'hc-hydration', url: '/dashboard', category: 'hydration' },
    { urgency, topic: 'hc-hydration', ttl: isEvening ? 4 * 3600 : 8 * 3600 },
  );

  if (result === 'notified') {
    console.info(`[hydration-check] notified userId=${userId} minSince=${minSince}`);
  } else if (result === 'error') {
    console.error(`[hydration-check] push failed userId=${userId}`);
  }

  return result;
}

// GET /api/notifications/hydration-check?cron=1  — Vercel Cron (requires Authorization header)
// GET /api/notifications/hydration-check          — manual self-check (authenticated user)
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const isCron = searchParams.get('cron') === '1';

  if (isCron) {
    const authErr = verifyCronSecret(req);
    if (authErr) return authErr;

    const uniqueUsers = await getUsersWithSubscriptions();
    const results = await Promise.allSettled(uniqueUsers.map((uid) => checkUserHydration(uid)));

    const counts = { notified: 0, ok: 0, skipped: 0, no_sub: 0, error: 0, opt_out: 0 };
    results.forEach((r) => {
      if (r.status === 'fulfilled') {
        const k = r.value as keyof typeof counts;
        if (k in counts) counts[k]++;
      } else {
        counts.error++;
      }
    });

    console.info(`[hydration-check] cron done users=${uniqueUsers.length}`, counts);
    return NextResponse.json({ checked: uniqueUsers.length, ...counts });
  }

  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const result = await checkUserHydration(session.user.id);
  return NextResponse.json({ result });
}
