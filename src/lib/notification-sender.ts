import { supabase } from '@/lib/db';
import { sendPushToSubscriptions, type PushSendOptions } from '@/lib/webpush';
import { logNotification, enqueueRetry, type NotificationCategory } from '@/lib/notification-logger';

export type NotificationPayload = {
  title: string;
  body: string;
  tag: string;
  url?: string;
  category: NotificationCategory;
};

export type SendToUserResult = 'notified' | 'no_sub' | 'skipped' | 'error' | 'opt_out';

// Check if user has opted out of a notification category.
async function isOptedOut(userId: string, category: NotificationCategory): Promise<boolean> {
  const { data } = await supabase
    .from('notification_preferences')
    .select(category)
    .eq('user_id', userId)
    .single();
  // If no row exists, default is opted-in
  if (!data) return false;
  return data[category] === false;
}

// Send a notification to all devices of a user.
// Handles: subscription lookup, opt-out check, push, logging, retry enqueue.
export async function sendNotificationToUser(
  userId: string,
  notif: NotificationPayload,
  opts: PushSendOptions = {},
  withRetry = true,
): Promise<SendToUserResult> {
  const { data: subs } = await supabase
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('user_id', userId);

  if (!subs || subs.length === 0) return 'no_sub';

  const optedOut = await isOptedOut(userId, notif.category);
  if (optedOut) return 'opt_out';

  const subRows = subs as Array<{ endpoint: string; p256dh: string; auth: string }>;
  const subData = subRows.map((s) => ({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }));

  try {
    const { sent, expired, failed, errors } = await sendPushToSubscriptions(
      subData,
      { title: notif.title, body: notif.body, tag: notif.tag, url: notif.url ?? '/dashboard' },
      opts,
    );

    // Clean up expired subscriptions
    if (expired.length > 0) {
      await supabase
        .from('push_subscriptions')
        .delete()
        .in('endpoint', expired)
        .eq('user_id', userId);
    }

    // Log successful sends
    if (sent > 0) {
      await logNotification({
        user_id:  userId,
        category: notif.category,
        title:    notif.title,
        body:     notif.body,
        status:   'sent',
      });

      // Update last_used_at on subscriptions
      const activeEndpoints: string[] = subData
        .map((s) => s.endpoint)
        .filter((ep) => !expired.includes(ep));
      if (activeEndpoints.length > 0) {
        await supabase
          .from('push_subscriptions')
          .update({ last_used_at: new Date().toISOString() })
          .in('endpoint', activeEndpoints)
          .eq('user_id', userId);
      }

      return 'notified';
    }

    // All sends failed — log and optionally enqueue retry
    if (failed > 0) {
      const errMsg = errors.map((e) => `${e.code}:${e.message}`).join('; ');
      await logNotification({
        user_id:   userId,
        category:  notif.category,
        title:     notif.title,
        body:      notif.body,
        status:    withRetry ? 'retrying' : 'failed',
        error_msg: errMsg,
      });

      if (withRetry) {
        await enqueueRetry(userId, notif.category, { notif, opts }, 300);
      }

      return 'error';
    }

    return 'no_sub';
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[notification-sender] push error userId=${userId}:`, msg);
    await logNotification({
      user_id:   userId,
      category:  notif.category,
      title:     notif.title,
      body:      notif.body,
      status:    'failed',
      error_msg: msg,
    });
    return 'error';
  }
}

// Get all user IDs that have at least one push subscription.
export async function getUsersWithSubscriptions(): Promise<string[]> {
  const { data } = await supabase
    .from('push_subscriptions')
    .select('user_id')
    .limit(500);
  const rows = (data ?? []) as Array<{ user_id: string }>;
  return [...new Set(rows.map((r) => r.user_id))];
}

// Brazil quiet hours check (server-side, São Paulo timezone).
export function isBrazilQuietHour(quietStart = 22, quietEnd = 7): boolean {
  const bDate = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  const h = bDate.getHours();
  return h >= quietStart || h < quietEnd;
}

export function brazilHour(): number {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' })).getHours();
}
