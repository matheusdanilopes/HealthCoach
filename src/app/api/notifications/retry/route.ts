import { NextResponse } from 'next/server';
import { supabase } from '@/lib/db';
import { verifyCronSecret } from '@/lib/cron-auth';
import { sendNotificationToUser, type NotificationPayload } from '@/lib/notification-sender';
import type { PushSendOptions } from '@/lib/webpush';

type RetryRow = {
  id: string;
  user_id: string;
  category: string;
  payload: { notif: NotificationPayload; opts: PushSendOptions };
  attempts: number;
  max_attempts: number;
};

// GET /api/notifications/retry?cron=1
export async function GET(req: Request) {
  const authErr = verifyCronSecret(req);
  if (authErr) return authErr;

  const now = new Date().toISOString();

  const { data: retries } = await supabase
    .from('notification_retry_queue')
    .select('id, user_id, category, payload, attempts, max_attempts')
    .lte('next_retry_at', now)
    .order('next_retry_at', { ascending: true })
    .limit(50);

  const queue = (retries ?? []) as RetryRow[];
  const processed = { success: 0, failed: 0, exhausted: 0 };

  for (const item of queue) {
    const newAttempts = item.attempts + 1;

    if (newAttempts > item.max_attempts) {
      await supabase.from('notification_retry_queue').delete().eq('id', item.id);
      processed.exhausted++;
      continue;
    }

    const result = await sendNotificationToUser(
      item.user_id,
      item.payload.notif,
      item.payload.opts,
      false, // don't re-enqueue from within a retry
    );

    if (result === 'notified') {
      await supabase.from('notification_retry_queue').delete().eq('id', item.id);
      processed.success++;
    } else {
      const delay = Math.pow(2, newAttempts) * 60; // 2, 4, 8 minutes
      const nextRetry = new Date(Date.now() + delay * 1000).toISOString();
      await supabase
        .from('notification_retry_queue')
        .update({ attempts: newAttempts, next_retry_at: nextRetry, last_error: result })
        .eq('id', item.id);
      processed.failed++;
    }
  }

  console.info(`[retry] done queue=${queue.length}`, processed);
  return NextResponse.json({ queued: queue.length, ...processed });
}
