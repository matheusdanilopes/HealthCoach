import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { supabase } from '@/lib/db';
import { getNotificationStats } from '@/lib/notification-logger';
import { isBrazilQuietHour, brazilHour } from '@/lib/notification-sender';

// GET /api/notifications/diagnostics — full diagnostic snapshot for the current user
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const userId = session.user.id;

  const [subsResult, prefsResult, stats, retryResult] = await Promise.all([
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

  return NextResponse.json({
    vapidConfigured:   !!process.env.VAPID_PRIVATE_KEY && !!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    serverTimeUTC:     new Date().toISOString(),
    brazilHour:        brazilHour(),
    inQuietHours:      isBrazilQuietHour(preferences.quiet_start, preferences.quiet_end),
    devices,
    deviceCount:       devices.length,
    preferences,
    stats,
    retryQueue:        retryResult.data ?? [],
  });
}
