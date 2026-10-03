import { NextResponse } from 'next/server';
import { supabase } from '@/lib/db';
import { brazilToday, brazilHour, brazilNDaysAgo } from '@/lib/timezone';
import { verifyCronSecret } from '@/lib/cron-auth';
import { isTelegramConfigured, openAppButton, waterButtons } from '@/lib/telegram';
import {
  DEFAULT_PREFERENCES,
  isCategoryEnabled,
  isQuietHour,
  sendTelegramNotification,
  type NotificationPreferences,
  type OutgoingNotification,
} from '@/lib/notification-sender';
import {
  getDayStatus,
  daysSinceLastWorkout,
  toTargets,
  PROFILE_COLUMNS,
  type DayStatus,
  type UserTargets,
} from '@/lib/day-status';
import {
  buildMorningMessage,
  buildEveningMessage,
  buildHydrationMessage,
  buildMealMessage,
  buildWorkoutMessage,
  buildInsightMessage,
  mealLabel,
  type MealKey,
} from '@/lib/notification-messages';

// Hourly scheduler (Supabase pg_cron → GET /api/notifications/run).
//
// Each user gets, at most:
//   • morning brief at the end of their quiet hours (yesterday recap + today's goals)
//   • up to 3 pace-based hydration nudges (only when behind the expected curve)
//   • a reminder per main meal not yet logged (10h, 14h, 20h)
//   • a workout nudge at 18h after 2+ days without training
//   • each new AI insight, once
//   • an evening wrap-up the hour before quiet hours start
// and never more than MAX_PER_RUN messages in the same hour.

const MAX_PER_RUN          = 2;
const HYDRATION_DAILY_CAP  = 3;
const HYDRATION_GAP_MIN    = 150;  // minimum minutes between hydration nudges
const HYDRATION_IDLE_MIN   = 90;   // don't nudge if the user drank recently
const WORKOUT_HOUR         = 18;
const WORKOUT_MIN_GAP_DAYS = 2;
const MEAL_HOURS: Array<{ hour: number; meal: MealKey }> = [
  { hour: 10, meal: 'breakfast' },
  { hour: 14, meal: 'lunch' },
  { hour: 20, meal: 'dinner' },
];

type TodayLog = { user_id: string; category: string; ref: string | null; sent_at: string };

type UserCtx = {
  userId: string;
  chatId: number;
  targets: UserTargets;
  prefs: NotificationPreferences;
  todayLogs: TodayLog[];
};

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

// Morning brief fires at the user's wake hour; the wrap-up one hour before bed.
function dayWindow(prefs: NotificationPreferences) {
  return {
    morningHour: clamp(prefs.quiet_end, 5, 11),
    eveningHour: clamp(prefs.quiet_start - 1, 18, 23),
  };
}

function alreadySent(ctx: UserCtx, ref: string): boolean {
  return ctx.todayLogs.some((l) => l.ref === ref);
}

function hydrationNudge(ctx: UserCtx, day: DayStatus, hour: number, today: string): OutgoingNotification | null {
  const { morningHour, eveningHour } = dayWindow(ctx.prefs);
  if (hour < morningHour + 2 || hour >= eveningHour) return null;

  const target = ctx.targets.waterMl;
  if (day.waterMl >= target) return null;

  const progress   = (hour - morningHour) / (eveningHour - morningHour);
  const expectedMl = Math.round(target * clamp(progress, 0, 1));
  if (expectedMl - day.waterMl < Math.max(250, target * 0.1)) return null;

  const minSinceLast = day.lastHydrationAt
    ? Math.floor((Date.now() - new Date(day.lastHydrationAt).getTime()) / 60_000)
    : null;
  if (minSinceLast !== null && minSinceLast < HYDRATION_IDLE_MIN) return null;

  const sent = ctx.todayLogs.filter((l) => l.category === 'hydration').map((l) => l.sent_at).sort();
  if (sent.length >= HYDRATION_DAILY_CAP) return null;
  const last = sent.at(-1);
  if (last && Date.now() - new Date(last).getTime() < HYDRATION_GAP_MIN * 60_000) return null;

  return {
    category: 'hydration',
    ref:      `hydration:${hour}`,
    html:     buildHydrationMessage(
      ctx.targets,
      { totalMl: day.waterMl, targetMl: target, expectedMl, minSinceLast, hour },
      ctx.userId,
      today,
    ),
    keyboard: (logId) => [waterButtons(logId)],
  };
}

async function planForUser(ctx: UserCtx, hour: number, today: string): Promise<OutgoingNotification[]> {
  const { prefs, userId, targets } = ctx;
  const { morningHour, eveningHour } = dayWindow(prefs);
  const out: OutgoingNotification[] = [];
  const day = await getDayStatus(userId, today);

  // 1. Morning brief
  if (hour === morningHour && !alreadySent(ctx, 'morning')) {
    const yesterday = await getDayStatus(userId, brazilNDaysAgo(1, today));
    out.push({
      category: 'goal',
      ref:      'morning',
      html:     buildMorningMessage(targets, yesterday, userId, today),
      keyboard: (logId) => [waterButtons(logId)],
    });
  }

  // 2. Evening wrap-up
  if (hour === eveningHour && !alreadySent(ctx, 'evening')) {
    out.push({
      category: 'goal',
      ref:      'evening',
      html:     buildEveningMessage(targets, day),
      keyboard: () => [openAppButton('📊 Abrir o app', '/dashboard')],
    });
  }

  // 3. Meal not logged (breakfast only when nothing was logged at all — some people skip it)
  const mealSlot = MEAL_HOURS.find((m) => m.hour === hour && m.hour < eveningHour);
  if (mealSlot && !alreadySent(ctx, `meal:${mealSlot.meal}`)) {
    const missing = mealSlot.meal === 'breakfast' ? day.consumedKcal === 0 : !day.meals.has(mealSlot.meal);
    if (missing) {
      out.push({
        category: 'meal',
        ref:      `meal:${mealSlot.meal}`,
        html:     buildMealMessage(targets, day, mealSlot.meal, userId, today),
        keyboard: () => [openAppButton(`📝 Registrar ${mealLabel(mealSlot.meal)}`, '/diary')],
      });
    }
  }

  // 4. Workout nudge
  if (hour === WORKOUT_HOUR && !day.hasWorkout && !alreadySent(ctx, 'workout')) {
    const days = await daysSinceLastWorkout(userId, today);
    if (days >= WORKOUT_MIN_GAP_DAYS) {
      out.push({
        category: 'workout',
        ref:      'workout',
        html:     buildWorkoutMessage(targets, days, userId, today),
        keyboard: () => [openAppButton('💪 Registrar treino', '/dashboard')],
      });
    }
  }

  // 5. Hydration
  const hyd = hydrationNudge(ctx, day, hour, today);
  if (hyd) out.push(hyd);

  // 6. New AI insight (one per run, never repeated)
  const { data: insights } = await supabase
    .from('ai_insights')
    .select('id, title, message, priority, cta')
    .eq('user_id', userId)
    .is('read_at', null)
    .gte('generated_at', new Date(Date.now() - 24 * 3600_000).toISOString())
    .order('generated_at', { ascending: false })
    .limit(5);
  type InsightRow = { id: string; title: string; message: string; priority: string; cta: string | null };
  const fresh = (insights ?? []) as InsightRow[];
  if (fresh.length > 0) {
    // Insights live up to 24h, so check the full log rather than only today's entries.
    const { data: notified } = await supabase
      .from('notification_logs')
      .select('ref')
      .eq('user_id', userId)
      .in('ref', fresh.map((i) => `insight:${i.id}`));
    const seen = new Set(((notified ?? []) as Array<{ ref: string }>).map((r) => r.ref));
    const insight = fresh.find((i) => !seen.has(`insight:${i.id}`));
    if (insight) {
      out.push({
        category: 'insight',
        ref:      `insight:${insight.id}`,
        html:     buildInsightMessage(insight),
        keyboard: () => [openAppButton('Ver no app', '/dashboard')],
      });
    }
  }

  return out.filter((n) => isCategoryEnabled(prefs, n.category)).slice(0, MAX_PER_RUN);
}

export async function GET(req: Request) {
  const authErr = verifyCronSecret(req);
  if (authErr) return authErr;

  if (!isTelegramConfigured()) {
    return NextResponse.json({ skipped: true, reason: 'telegram_not_configured' });
  }

  const hour  = brazilHour();
  const today = brazilToday();

  const { data: links } = await supabase
    .from('telegram_links')
    .select('user_id, chat_id')
    .not('chat_id', 'is', null);
  const linked = (links ?? []) as Array<{ user_id: string; chat_id: number }>;
  if (linked.length === 0) return NextResponse.json({ hour, users: 0 });

  const userIds = linked.map((l) => l.user_id);
  const [{ data: profiles }, { data: prefRows }, { data: logRows }] = await Promise.all([
    supabase.from('users').select(PROFILE_COLUMNS).in('id', userIds),
    supabase.from('notification_preferences').select('*').in('user_id', userIds),
    supabase
      .from('notification_logs')
      .select('user_id, category, ref, sent_at')
      .in('user_id', userIds)
      .eq('status', 'sent')
      .gte('sent_at', `${today}T00:00:00.000-03:00`),
  ]);

  type ProfileRow = Parameters<typeof toTargets>[0] & { id: string };
  const profileMap = new Map(((profiles ?? []) as ProfileRow[]).map((p) => [p.id, p]));
  const prefMap    = new Map(((prefRows ?? []) as Array<NotificationPreferences & { user_id: string }>).map((p) => [p.user_id, p]));
  const logs       = (logRows ?? []) as TodayLog[];

  const counts = { users: linked.length, quiet: 0, sent: 0, failed: 0, gone: 0, errors: 0 };

  await Promise.allSettled(linked.map(async ({ user_id: userId, chat_id: chatId }) => {
    try {
      const prefs = { ...DEFAULT_PREFERENCES, ...prefMap.get(userId) };
      if (isQuietHour(hour, prefs.quiet_start, prefs.quiet_end)) {
        counts.quiet++;
        return;
      }
      const ctx: UserCtx = {
        userId,
        chatId,
        targets:   toTargets(profileMap.get(userId) ?? null),
        prefs,
        todayLogs: logs.filter((l) => l.user_id === userId),
      };
      for (const notif of await planForUser(ctx, hour, today)) {
        const result = await sendTelegramNotification(userId, chatId, notif);
        counts[result]++;
        if (result === 'gone') break;
      }
    } catch (err) {
      counts.errors++;
      console.error(`[cron-run] userId=${userId}`, err);
    }
  }));

  console.info(`[cron-run] brazilHour=${hour}`, counts);
  return NextResponse.json({ hour, ...counts });
}
