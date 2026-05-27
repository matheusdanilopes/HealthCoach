import webpush from 'web-push';
import { supabase } from '@/lib/db';
import type { PushPayload, NotificationCategory } from './types';

let vapidReady = false;

function ensureVapid() {
  if (vapidReady) return;
  const pub = process.env.NEXT_PUBLIC_VAPID_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) throw new Error('VAPID keys not configured');
  webpush.setVapidDetails(
    `mailto:${process.env.VAPID_EMAIL ?? 'admin@healthcoach.app'}`,
    pub,
    priv,
  );
  vapidReady = true;
}

export async function sendToUser(userId: string, payload: PushPayload): Promise<void> {
  ensureVapid();

  const { data: subs } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('user_id', userId);

  if (!subs?.length) return;

  const { data: prefs } = await supabase
    .from('notification_preferences')
    .select('enabled, imports, processing, updates')
    .eq('user_id', userId)
    .single();

  if (prefs && !prefs.enabled) return;
  if (prefs && !prefs[payload.category as NotificationCategory]) return;

  const message = JSON.stringify({
    title: payload.title,
    body: payload.body ?? '',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-96x96.png',
    tag: payload.tag ?? payload.category,
    url: payload.url ?? '/',
  });

  const staleIds: string[] = [];

  await Promise.allSettled(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          message,
          { TTL: 86400, urgency: 'normal' },
        );
      } catch (err: unknown) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) staleIds.push(sub.id);
      }
    }),
  );

  if (staleIds.length) {
    await supabase.from('push_subscriptions').delete().in('id', staleIds);
  }
}
