import { supabase } from '@/lib/db';

export type NotificationCategory = 'hydration' | 'meal' | 'workout' | 'insight' | 'goal' | 'system' | 'test';
export type NotificationStatus = 'sent' | 'failed' | 'expired' | 'retrying';

export interface LogEntry {
  user_id: string;
  category: NotificationCategory;
  title: string;
  body: string;
  status: NotificationStatus;
  attempt?: number;
  error_msg?: string;
  endpoint_hint?: string;
}

export async function logNotification(entry: LogEntry): Promise<void> {
  const { error } = await supabase.from('notification_logs').insert({
    user_id:       entry.user_id,
    category:      entry.category,
    title:         entry.title,
    body:          entry.body,
    status:        entry.status,
    attempt:       entry.attempt ?? 1,
    error_msg:     entry.error_msg ?? null,
    endpoint_hint: entry.endpoint_hint ?? null,
    sent_at:       new Date().toISOString(),
  });
  if (error) {
    console.error('[notification-logger] failed to write log:', error.message);
  }
}

export async function markNotificationOpened(logId: string): Promise<void> {
  await supabase
    .from('notification_logs')
    .update({ opened_at: new Date().toISOString() })
    .eq('id', logId);
}

export async function getNotificationStats(userId: string): Promise<{
  totalSent: number;
  totalOpened: number;
  lastSentAt: string | null;
  lastOpenedAt: string | null;
}> {
  const { data } = await supabase
    .from('notification_logs')
    .select('sent_at, opened_at, status')
    .eq('user_id', userId)
    .eq('status', 'sent')
    .order('sent_at', { ascending: false })
    .limit(100);

  const rows = (data ?? []) as Array<{ sent_at: string; opened_at: string | null }>;
  return {
    totalSent:     rows.length,
    totalOpened:   rows.filter((r) => r.opened_at).length,
    lastSentAt:    rows[0]?.sent_at ?? null,
    lastOpenedAt:  rows.find((r) => r.opened_at)?.opened_at ?? null,
  };
}

export async function enqueueRetry(
  userId: string,
  category: NotificationCategory,
  payload: object,
  delaySeconds = 300,
): Promise<void> {
  const nextRetry = new Date(Date.now() + delaySeconds * 1000).toISOString();
  const { error } = await supabase.from('notification_retry_queue').insert({
    user_id:       userId,
    category,
    payload,
    attempts:      0,
    max_attempts:  3,
    next_retry_at: nextRetry,
  });
  if (error) {
    console.error('[notification-logger] failed to enqueue retry:', error.message);
  }
}
