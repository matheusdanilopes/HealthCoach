import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { supabase } from '@/lib/db';
import { getNotificationStats } from '@/lib/notification-logger';
import { isBrazilQuietHour, brazilHour } from '@/lib/notification-sender';
import { getReminderState } from '@/lib/hydration-scheduler';
import { brazilToday } from '@/lib/timezone';

// GET /api/notifications/diagnostics — full diagnostic snapshot for the current user
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const userId = session.user.id;

  const todayStart = brazilToday() + 'T00:00:00.000-03:00';

  const [subsResult, prefsResult, stats, retryResult, schedulerState, recentHydration] = await Promise.all([
    supabase
      .from('push_subscriptions')
      .select('endpoint, platform, user_agent, created_at, updated_at, last_used_at')
      .eq('user_id', userId),
    supabase
      .from('notification_preferences')
      .select('*')
      .eq('user_id', userId)
      .single(),
    getNotificationStats(userId),
    supabase
      .from('notification_retry_queue')
      .select('id, category, attempts, max_attempts, next_retry_at, last_error')
      .eq('user_id', userId)
      .order('next_retry_at', { ascending: true })
      .limit(10),
    getReminderState(userId),
    supabase
      .from('notification_logs')
      .select('sent_at, title, status')
      .eq('user_id', userId)
      .eq('category', 'hydration')
      .gte('sent_at', todayStart)
      .order('sent_at', { ascending: false })
      .limit(5),
  ]);

  const subs = (subsResult.data ?? []) as Array<{
    endpoint: string;
    platform: string | null;
    user_agent: string | null;
    created_at: string;
    updated_at: string;
    last_used_at: string | null;
  }>;

  const devices = subs.map((s) => ({
    endpointHint:   s.endpoint.slice(-24),
    platform:       s.platform ?? 'unknown',
    registeredAt:   s.created_at,
    lastUpdated:    s.updated_at,
    lastUsed:       s.last_used_at,
  }));

  const preferences = prefsResult.data ?? {
    hydration: true,
    meals:     true,
    workouts:  true,
    insights:  true,
    goals:     true,
    quiet_start: 22,
    quiet_end:   7,
  };

  const bHour = brazilHour();
  const bNow  = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));

  return NextResponse.json({
    // Timezone
    timezone:          'America/Sao_Paulo',
    serverTimeUTC:     new Date().toISOString(),
    brazilTime:        bNow.toISOString(),
    brazilHour:        bHour,
    inQuietHours:      isBrazilQuietHour(preferences.quiet_start, preferences.quiet_end),

    // Push config
    vapidConfigured:   !!process.env.VAPID_PRIVATE_KEY && !!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    devices,
    deviceCount:       devices.length,

    // User preferences
    preferences,

    // Notification stats
    stats,
    retryQueue: retryResult.data ?? [],

    // Hydration scheduler state
    hydrationScheduler: {
      state:                schedulerState,
      nextReminderAt:       schedulerState?.next_reminder_at ?? null,
      lastComputedAt:       schedulerState?.last_computed_at ?? null,
      dailyConsumedMl:      schedulerState?.daily_consumed_ml ?? null,
      dailyTargetMl:        schedulerState?.daily_target_ml ?? null,
      lastWaterAt:          schedulerState?.last_water_at ?? null,
      schedulerLogDate:     schedulerState?.log_date ?? null,
      todaysSentCount:      (recentHydration.data ?? []).length,
      recentNotifications:  (recentHydration.data ?? []).map((r: { sent_at: string; title: string; status: string }) => ({
        sentAt: r.sent_at,
        title:  r.title,
        status: r.status,
      })),
    },

    // Cron schedule info (informational)
    cronSchedule: '0 */2 * * * (every 2 hours UTC)',
  });
}
