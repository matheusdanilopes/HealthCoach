import { supabase } from '@/lib/db';

export type NotificationCategory = 'hydration' | 'meal' | 'workout' | 'insight' | 'goal' | 'system' | 'test';
export type NotificationStatus = 'sent' | 'failed';

export interface LogEntry {
  id?: string;
  user_id: string;
  category: NotificationCategory;
  ref?: string;           // dedup key, e.g. 'meal:lunch' or 'insight:<uuid>'
  title: string;
  body: string;
  status: NotificationStatus;
  error_msg?: string;
}

export async function logNotification(entry: LogEntry): Promise<void> {
  const { error } = await supabase.from('notification_logs').insert({
    ...(entry.id ? { id: entry.id } : {}),
    user_id:   entry.user_id,
    category:  entry.category,
    ref:       entry.ref ?? null,
    title:     entry.title,
    body:      entry.body,
    status:    entry.status,
    error_msg: entry.error_msg ?? null,
    sent_at:   new Date().toISOString(),
  });
  if (error) {
    console.error('[notification-logger] failed to write log:', error.message);
  }
}

// Records that the user acted on a notification (pressed one of its buttons).
// Stored in opened_at so engagement can be measured per category.
export async function markNotificationActed(logId: string, userId: string): Promise<void> {
  await supabase
    .from('notification_logs')
    .update({ opened_at: new Date().toISOString() })
    .eq('id', logId)
    .eq('user_id', userId)
    .is('opened_at', null);
}

export type RecentNotification = {
  id: string;
  category: NotificationCategory;
  title: string;
  status: NotificationStatus;
  sent_at: string;
  opened_at: string | null;
  error_msg: string | null;
};

export async function getRecentNotifications(userId: string, limit = 15): Promise<RecentNotification[]> {
  const { data } = await supabase
    .from('notification_logs')
    .select('id, category, title, status, sent_at, opened_at, error_msg')
    .eq('user_id', userId)
    .order('sent_at', { ascending: false })
    .limit(limit);
  return (data ?? []) as RecentNotification[];
}
