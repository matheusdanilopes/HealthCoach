import webpush from 'web-push';
import { supabase } from '@/lib/db';
import type { PushPayload, NotificationCategory } from './types';

let vapidConfigured = false;

function ensureVapid() {
  if (vapidConfigured) return;
  const pub = process.env.NEXT_PUBLIC_VAPID_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) throw new Error('VAPID keys not configured');
  webpush.setVapidDetails(
    `mailto:${process.env.VAPID_EMAIL ?? 'admin@healthcoach.app'}`,
    pub,
    priv,
  );
  vapidConfigured = true;
}

export async function sendToUser(
  userId: string,
  payload: PushPayload,
): Promise<void> {
  const { data: subs } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('user_id', userId);

  ensureVapid();
  if (!subs?.length) return;

  const { data: prefs } = await supabase
    .from('notification_preferences')
    .select('enabled, imports, processing, updates')
    .eq('user_id', userId)
    .single();

  if (prefs && !prefs.enabled) return;
  if (prefs && !prefs[payload.category as NotificationCategory]) return;

  const body = JSON.stringify({
    title: payload.title,
    body: payload.body,
    icon: payload.icon ?? '/icons/icon-192x192.png',
    badge: payload.badge ?? '/icons/icon-96x96.png',
    tag: payload.tag ?? payload.category,
    url: payload.url ?? '/',
    data: payload.data ?? {},
  });

  const staleIds: string[] = [];

  await Promise.allSettled(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          body,
          { TTL: 86400, urgency: 'normal' },
        );
        await logNotification(userId, sub.endpoint, payload, 'sent');
      } catch (err: unknown) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          staleIds.push(sub.id);
          await logNotification(userId, sub.endpoint, payload, 'expired');
        } else {
          await logNotification(userId, sub.endpoint, payload, 'failed', String(err));
        }
      }
    }),
  );

  if (staleIds.length) {
    await supabase.from('push_subscriptions').delete().in('id', staleIds);
  }
}

async function logNotification(
  userId: string,
  endpoint: string,
  payload: PushPayload,
  status: 'sent' | 'failed' | 'expired',
  error?: string,
) {
  await supabase.from('notification_logs').insert({
    user_id: userId,
    endpoint,
    title: payload.title,
    body: payload.body,
    category: payload.category,
    status,
    error: error ?? null,
  });
}
