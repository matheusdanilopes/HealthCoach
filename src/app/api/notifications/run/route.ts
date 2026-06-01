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
import {
  buildHydrationMessage,
  buildMealMessage,
  buildWorkoutMessage,
  buildInsightMessage,
} from '@/lib/notification-messages';

// ─── Shared helpers ───────────────────────────────────────────────────────────

const HYDRATION_DEDUP_MINUTES = 90;
const HYDRATION_DAILY_CAP     = 4;

async function getTotalHydration(userId: string, date: string) {
  const [{ data: water }, { data: food }] = await Promise.all([
    supabase.from('water_logs').select('amount_ml, created_at').eq('user_id', userId).eq('log_date', date).limit(50),
    supabase.from('food_logs').select('hydration_ml, created_at').eq('user_id', userId).eq('log_date', date).gt('hydration_ml', 0),
  ]);
  const waterMl = (water ?? []).reduce((s: number, r: { amount_ml: number }) => s + r.amount_ml, 0);
  const mealMl  = (food  ?? []).reduce((s: number, r: { hydration_ml: number }) => s + r.hydration_ml, 0);
  const all = [
    ...(water ?? []).map((r: { created_at: string }) => r.created_at),
    ...(food  ?? []).map((r: { created_at: string }) => r.created_at),
  ].sort().reverse();
  return { totalMl: waterMl + mealMl, lastLogAt: all[0] ?? null };
}

async function minutesSinceLastHydrationNotif(userId: string): Promise<{ minutesAgo: number; dailyCount: number }> {
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

// ─── Hydration ────────────────────────────────────────────────────────────────

async function runHydrationCheck(
  userId: string,
  firstName: string,
  targetWaterMl: number,
): Promise<string> {
  const bHour = brazilHour();
  const today = brazilToday();
  const { totalMl, lastLogAt } = await getTotalHydration(userId, today);

  if (totalMl >= targetWaterMl) return 'ok';

  const minSince = lastLogAt ? Math.floor((Date.now() - new Date(lastLogAt).getTime()) / 60_000) : 9999;
  if (minSince < 120) return 'ok';

  const { minutesAgo, dailyCount } = await minutesSinceLastHydrationNotif(userId);
  if (dailyCount >= HYDRATION_DAILY_CAP) return 'ok';
  if (minutesAgo < HYDRATION_DEDUP_MINUTES) return 'ok';

  const { title, body, urgency } = buildHydrationMessage(
    { name: firstName, totalMl, targetMl: targetWaterMl, minSince, hour: bHour },
    userId,
    today,
  );

  const result = await sendNotificationToUser(
    userId,
    { title, body, tag: 'hc-hydration', url: '/dashboard', category: 'hydration' },
    { urgency, topic: 'hc-hydration', ttl: bHour >= 18 ? 4 * 3600 : 8 * 3600 },
  );

  if (result === 'notified') {
    console.info(`[cron-run:hydration] userId=${userId} minSince=${minSince} bHour=${bHour}`);
  }
  return result;
}

// ─── Meal reminders ───────────────────────────────────────────────────────────

async function runMealReminders(userId: string, firstName: string): Promise<string> {
  const bHour = brazilHour();
  const windows = [
    { key: 'breakfast', label: 'café da manhã', tag: 'hc-meal-breakfast', minH: 8,  maxH: 10 },
    { key: 'lunch',     label: 'almoço',        tag: 'hc-meal-lunch',     minH: 11, maxH: 14 },
    { key: 'snack',     label: 'lanche',         tag: 'hc-meal-snack',     minH: 15, maxH: 17 },
    { key: 'dinner',    label: 'jantar',         tag: 'hc-meal-dinner',    minH: 18, maxH: 21 },
  ];
  const win = windows.find((w) => bHour >= w.minH && bHour <= w.maxH);
  if (!win) return 'skipped';

  const today = brazilToday();
  const { data } = await supabase
    .from('food_logs')
    .select('meal_type, calories')
    .eq('user_id', userId)
    .eq('log_date', today);

  const meals = (data ?? []) as Array<{ meal_type: string; calories: number }>;
  if (meals.some((m) => m.meal_type === win.key)) return 'ok';
  const totalCals = meals.reduce((s, m) => s + m.calories, 0);

  const { title, body } = buildMealMessage(
    { name: firstName, mealLabel: win.label, totalCals },
    userId,
    win.key,
    today,
  );

  return await sendNotificationToUser(
    userId,
    { title, body, tag: win.tag, url: '/diary', category: 'meal' },
    { urgency: 'normal', ttl: 3600 },
  );
}

// ─── Workout reminders ────────────────────────────────────────────────────────

async function getDaysWithoutWorkout(userId: string, today: string): Promise<number> {
  const { data } = await supabase
    .from('food_logs')
    .select('log_date')
    .eq('user_id', userId)
    .lt('calories', 0)
    .order('log_date', { ascending: false })
    .limit(1);

  if (!data || data.length === 0) return 7;
  const last = new Date((data[0] as { log_date: string }).log_date + 'T12:00:00');
  const todayMs = new Date(today + 'T12:00:00').getTime();
  return Math.max(0, Math.floor((todayMs - last.getTime()) / (1000 * 60 * 60 * 24)));
}

async function runWorkoutReminders(userId: string, firstName: string): Promise<string> {
  const bHour = brazilHour();
  const inAM = bHour >= 7  && bHour <= 9;
  const inPM = bHour >= 17 && bHour <= 19;
  if (!inAM && !inPM) return 'skipped';

  const today = brazilToday();
  const { data } = await supabase
    .from('food_logs')
    .select('id')
    .eq('user_id', userId)
    .eq('log_date', today)
    .lt('calories', 0)
    .limit(1);

  if ((data ?? []).length > 0) return 'ok';

  const daysWithout = inPM ? await getDaysWithoutWorkout(userId, today) : 0;
  const period = inAM ? 'am' : 'pm';

  const { title, body } = buildWorkoutMessage(
    { name: firstName, daysWithout },
    userId,
    period,
    today,
  );

  return await sendNotificationToUser(
    userId,
    { title, body, tag: 'hc-workout', url: '/dashboard', category: 'workout' },
    { urgency: 'normal', ttl: 3 * 3600, topic: 'hc-workout' },
  );
}

// ─── Insights push ────────────────────────────────────────────────────────────

async function runInsightsPush(userId: string, firstName: string): Promise<string> {
  const since = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
  const { data } = await supabase
    .from('ai_insights')
    .select('id, priority, title')
    .eq('user_id', userId)
    .is('read_at', null)
    .gte('generated_at', since)
    .order('generated_at', { ascending: false })
    .limit(1);

  const rows = (data ?? []) as Array<{ id: string; priority: string; title: string }>;
  if (rows.length === 0) return 'ok';

  const insight = rows[0];
  const today = brazilToday();
  const { title, body } = buildInsightMessage(
    { name: firstName, insightTitle: insight.title, priority: insight.priority },
    userId,
    today,
  );

  return await sendNotificationToUser(
    userId,
    { title, body, tag: `hc-insight-${insight.id}`, url: '/dashboard', category: 'insight' },
    { urgency: 'normal', ttl: 6 * 3600, topic: 'hc-insight' },
  );
}

// ─── Retry queue ──────────────────────────────────────────────────────────────

async function runRetryQueue(): Promise<{ success: number; failed: number; exhausted: number }> {
  const counts = { success: 0, failed: 0, exhausted: 0 };
  const { data } = await supabase
    .from('notification_retry_queue')
    .select('id, user_id, category, payload, attempts, max_attempts')
    .lte('next_retry_at', new Date().toISOString())
    .order('next_retry_at', { ascending: true })
    .limit(50);

  type RetryRow = {
    id: string; user_id: string; category: string;
    payload: { notif: Parameters<typeof sendNotificationToUser>[1]; opts: Parameters<typeof sendNotificationToUser>[2] };
    attempts: number; max_attempts: number;
  };
  const queue = (data ?? []) as RetryRow[];

  for (const item of queue) {
    const newAttempts = item.attempts + 1;
    if (newAttempts > item.max_attempts) {
      await supabase.from('notification_retry_queue').delete().eq('id', item.id);
      counts.exhausted++;
      continue;
    }
    const result = await sendNotificationToUser(item.user_id, item.payload.notif, item.payload.opts, false);
    if (result === 'notified') {
      await supabase.from('notification_retry_queue').delete().eq('id', item.id);
      counts.success++;
    } else {
      const delay = Math.pow(2, newAttempts) * 60;
      await supabase.from('notification_retry_queue')
        .update({ attempts: newAttempts, next_retry_at: new Date(Date.now() + delay * 1000).toISOString(), last_error: result })
        .eq('id', item.id);
      counts.failed++;
    }
  }
  return counts;
}

// ─── Cleanup (weekly — runs only on Sundays) ──────────────────────────────────

async function runCleanup(): Promise<{ stale: number; oldLogs: number }> {
  const day = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' })).getDay();
  if (day !== 0) return { stale: 0, oldLogs: 0 };

  const sixtyDaysAgo  = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

  const [{ data: stale }, { data: logs }] = await Promise.all([
    supabase.from('push_subscriptions').delete().lt('last_used_at', sixtyDaysAgo).select('id'),
    supabase.from('notification_logs').delete().lt('sent_at', ninetyDaysAgo).select('id'),
  ]);
  return { stale: (stale ?? []).length, oldLogs: (logs ?? []).length };
}

// ─── Unified cron handler ─────────────────────────────────────────────────────

export async function GET(req: Request) {
  const authErr = verifyCronSecret(req);
  if (authErr) return authErr;

  if (isBrazilQuietHour()) {
    return NextResponse.json({ skipped: true, reason: 'quiet_hours' });
  }

  const users = await getUsersWithSubscriptions();

  // Batch-fetch all user profiles in one query to avoid N individual queries
  const { data: profileRows } = await supabase
    .from('users')
    .select('id, full_name, target_water_ml')
    .in('id', users);

  type ProfileRow = { id: string; full_name: string | null; target_water_ml: number | null };
  const profileMap = new Map<string, { firstName: string; targetWaterMl: number }>();
  for (const p of (profileRows ?? []) as ProfileRow[]) {
    const firstName = (p.full_name ?? '').trim().split(' ')[0] || 'você';
    profileMap.set(p.id, { firstName, targetWaterMl: p.target_water_ml ?? 2500 });
  }

  const counts = {
    hydration: { notified: 0, ok: 0, skipped: 0, error: 0 },
    meal:      { notified: 0, ok: 0, skipped: 0, error: 0 },
    workout:   { notified: 0, ok: 0, skipped: 0, error: 0 },
    insight:   { notified: 0, ok: 0, skipped: 0, error: 0 },
  };

  const chunkSize = 50;
  for (let ci = 0; ci < users.length; ci += chunkSize) {
    const chunk = users.slice(ci, ci + chunkSize);
    await Promise.allSettled(chunk.map(async (uid) => {
      const { firstName, targetWaterMl } = profileMap.get(uid) ?? { firstName: 'você', targetWaterMl: 2500 };

      const [h, m, w, i] = await Promise.allSettled([
        runHydrationCheck(uid, firstName, targetWaterMl),
        runMealReminders(uid, firstName),
        runWorkoutReminders(uid, firstName),
        runInsightsPush(uid, firstName),
      ]);

      for (const [key, res] of [['hydration', h], ['meal', m], ['workout', w], ['insight', i]] as const) {
        const val = res.status === 'fulfilled' ? res.value : 'error';
        const bucket = counts[key];
        if (val === 'notified')                                              bucket.notified++;
        else if (val === 'ok')                                               bucket.ok++;
        else if (val === 'skipped' || val === 'opt_out' || val === 'no_sub') bucket.skipped++;
        else                                                                  bucket.error++;
      }
    }));
  }

  const retry   = await runRetryQueue();
  const cleanup = await runCleanup();

  const bHour = brazilHour();
  console.info(`[cron-run] brazilHour=${bHour} users=${users.length}`, counts, { retry, cleanup });

  return NextResponse.json({ brazilHour: bHour, users: users.length, counts, retry, cleanup });
}
