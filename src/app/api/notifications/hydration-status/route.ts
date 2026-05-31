import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { supabase } from '@/lib/db';
import { brazilToday } from '@/lib/timezone';
import { sendNotificationToUser, isBrazilQuietHour, brazilHour } from '@/lib/notification-sender';
import { buildHydrationMessage } from '@/lib/notification-messages';

const HYDRATION_DEDUP_MINUTES = 90;
const HYDRATION_DAILY_CAP     = 4;

async function getTotalHydration(userId: string, date: string) {
  const [{ data: water }, { data: food }] = await Promise.all([
    supabase.from('water_logs').select('amount_ml, created_at').eq('user_id', userId).eq('log_date', date).limit(50),
    supabase.from('food_logs').select('hydration_ml, created_at').eq('user_id', userId).eq('log_date', date).gt('hydration_ml', 0),
  ]);
  const totalMl = (water ?? []).reduce((s: number, r: { amount_ml: number }) => s + r.amount_ml, 0)
                + (food  ?? []).reduce((s: number, r: { hydration_ml: number }) => s + r.hydration_ml, 0);
  const timestamps = [
    ...(water ?? []).map((r: { created_at: string }) => r.created_at),
    ...(food  ?? []).map((r: { created_at: string }) => r.created_at),
  ].sort().reverse();
  return { totalMl, lastLogAt: timestamps[0] ?? null };
}

async function getNotifHistory(userId: string) {
  const todayStart = brazilToday() + 'T00:00:00.000-03:00';
  const { data } = await supabase
    .from('notification_logs')
    .select('sent_at, title, status')
    .eq('user_id', userId)
    .eq('category', 'hydration')
    .gte('sent_at', todayStart)
    .order('sent_at', { ascending: false })
    .limit(HYDRATION_DAILY_CAP + 1);
  const rows = (data ?? []) as Array<{ sent_at: string; title: string; status: string }>;
  const lastSent = rows.find(r => r.status === 'sent');
  const minutesAgo = lastSent
    ? Math.floor((Date.now() - new Date(lastSent.sent_at).getTime()) / 60_000)
    : null;
  return { dailyCount: rows.filter(r => r.status === 'sent').length, minutesAgo, history: rows };
}

// GET /api/notifications/hydration-status
// Returns full diagnostic snapshot showing exactly why a notification would or would not be sent.
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const userId = session.user.id;
  const today  = brazilToday();
  const bHour  = brazilHour();
  const isQuiet = isBrazilQuietHour();

  const [profileResult, hydration, notifHistory, subsResult] = await Promise.all([
    supabase.from('users').select('full_name, target_water_ml').eq('id', userId).single(),
    getTotalHydration(userId, today),
    getNotifHistory(userId),
    supabase.from('push_subscriptions').select('endpoint, platform').eq('user_id', userId),
  ]);

  const profile    = profileResult.data as { full_name: string | null; target_water_ml: number } | null;
  const target     = profile?.target_water_ml ?? 2500;
  const { totalMl, lastLogAt } = hydration;
  const { dailyCount, minutesAgo, history } = notifHistory;
  const subs       = (subsResult.data ?? []) as Array<{ endpoint: string; platform: string | null }>;
  const minSince   = lastLogAt ? Math.floor((Date.now() - new Date(lastLogAt).getTime()) / 60_000) : null;

  const blocks = {
    quietHours:       isQuiet,
    noSubscription:   subs.length === 0,
    goalMet:          totalMl >= target,
    recentlyHydrated: (minSince ?? 9999) < 120,
    recentlySent:     minutesAgo !== null && minutesAgo < HYDRATION_DEDUP_MINUTES,
    dailyCapReached:  dailyCount >= HYDRATION_DAILY_CAP,
  };

  const canSend = !Object.values(blocks).some(Boolean);

  return NextResponse.json({
    canSend,
    blocks,
    hydration: {
      totalMl,
      targetMl:  target,
      remaining: Math.max(0, target - totalMl),
      pct:       target > 0 ? Math.round((totalMl / target) * 100) : 0,
      minutesSinceLastLog: minSince,
      lastLogAt,
    },
    notifications: {
      minutesSinceLastSent: minutesAgo,
      dailySentCount:       dailyCount,
      dailyCap:             HYDRATION_DAILY_CAP,
      dedupWindowMinutes:   HYDRATION_DEDUP_MINUTES,
      history,
    },
    timing: {
      brazilHour:  bHour,
      isQuietHours: isQuiet,
      quietWindow: '22h–7h BRT',
    },
    devices: subs.map(s => ({ platform: s.platform ?? 'unknown', endpointHint: s.endpoint.slice(-16) })),
  });
}

// POST /api/notifications/hydration-status
// Forces a test hydration notification bypassing dedup/threshold.
// For diagnosing the push stack only — not a production trigger.
export async function POST() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const userId  = session.user.id;
  const today   = brazilToday();
  const bHour   = brazilHour();

  const profileResult = await supabase
    .from('users')
    .select('full_name, target_water_ml')
    .eq('id', userId)
    .single();

  const profile    = profileResult.data as { full_name: string | null; target_water_ml: number } | null;
  const firstName  = (profile?.full_name ?? '').trim().split(' ')[0] || 'você';
  const targetMl   = profile?.target_water_ml ?? 2500;
  const { totalMl } = await getTotalHydration(userId, today);
  const remaining  = Math.max(0, targetMl - totalMl);

  const { title, body } = buildHydrationMessage(
    { name: firstName, totalMl, targetMl, minSince: 999, hour: bHour },
    userId,
    today,
  );

  // Use "test" tag so it doesn't affect deduplication state of real reminders
  const result = await sendNotificationToUser(
    userId,
    { title: `[Teste] ${title}`.slice(0, 60), body: body || `Faltam ${remaining}ml para a meta de hoje.`, tag: 'hc-hydration-test', url: '/notifications', category: 'hydration' },
    { urgency: 'normal', ttl: 300 },
    false, // no retry queue for tests
  );

  return NextResponse.json({ result, title, body });
}
