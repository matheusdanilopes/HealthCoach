import { NextResponse } from 'next/server';
import { supabase } from '@/lib/db';
import { verifyCronSecret } from '@/lib/cron-auth';

// GET /api/notifications/cleanup?cron=1
// Removes stale push subscriptions and old notification logs.
export async function GET(req: Request) {
  const authErr = verifyCronSecret(req);
  if (authErr) return authErr;

  const results = { staleSubscriptions: 0, oldLogs: 0, exhaustedRetries: 0 };

  // Remove push subscriptions not used in 60 days
  const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
  const { data: stale } = await supabase
    .from('push_subscriptions')
    .delete()
    .lt('last_used_at', sixtyDaysAgo)
    .select('id');
  results.staleSubscriptions = (stale ?? []).length;

  // Remove notification logs older than 90 days
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const { data: oldLogs } = await supabase
    .from('notification_logs')
    .delete()
    .lt('sent_at', ninetyDaysAgo)
    .select('id');
  results.oldLogs = (oldLogs ?? []).length;

  // Cleanup retry queue where attempts >= max_attempts
  const { data: queueRows } = await supabase
    .from('notification_retry_queue')
    .select('id, attempts, max_attempts');
  const toDelete = (queueRows ?? []) as Array<{ id: string; attempts: number; max_attempts: number }>;
  const exhaustedIds = toDelete
    .filter((r) => r.attempts >= r.max_attempts)
    .map((r) => r.id);

  if (exhaustedIds.length > 0) {
    await supabase
      .from('notification_retry_queue')
      .delete()
      .in('id', exhaustedIds);
    results.exhaustedRetries = exhaustedIds.length;
  }

  console.info('[cleanup] done', results);
  return NextResponse.json(results);
}
