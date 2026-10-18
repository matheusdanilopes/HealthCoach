import { insertInto, sql } from '@/lib/db';

export type NotificationCategory = 'hydration' | 'meal' | 'workout' | 'goal' | 'system' | 'test';
export type NotificationStatus = 'sent' | 'failed';

export interface LogEntry {
  id?: string;
  user_id: string;
  category: NotificationCategory;
  ref?: string;           // dedup key, e.g. 'meal:lunch'
  title: string;
  body: string;
  status: NotificationStatus;
  error_msg?: string;
}

export async function logNotification(entry: LogEntry): Promise<void> {
  try {
    await insertInto('notification_logs', {
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
  } catch (err) {
    console.error('[notification-logger] failed to write log:', err instanceof Error ? err.message : err);
  }
}

// Records that the user acted on a notification (pressed one of its buttons).
// Stored in opened_at so engagement can be measured per category.
export async function markNotificationActed(logId: string, userId: string): Promise<void> {
  await sql`
    UPDATE notification_logs SET opened_at = ${new Date().toISOString()}
    WHERE id = ${logId} AND user_id = ${userId} AND opened_at IS NULL
  `;
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
  return (await sql`
    SELECT id, category, title, status, sent_at, opened_at, error_msg
    FROM notification_logs
    WHERE user_id = ${userId}
    ORDER BY sent_at DESC
    LIMIT ${limit}
  `) as RecentNotification[];
}
