import webpush from 'web-push';

let configured = false;

export function getWebPush(): typeof webpush {
  if (!configured) {
    const pub  = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    const priv = process.env.VAPID_PRIVATE_KEY;
    const mail = process.env.VAPID_CONTACT_EMAIL ?? 'mailto:admin@healthcoach.app';
    if (!pub || !priv) throw new Error('VAPID keys not configured');
    webpush.setVapidDetails(mail, pub, priv);
    configured = true;
  }
  return webpush;
}

export type PushSubscriptionData = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

export async function sendPushToSubscriptions(
  subs: PushSubscriptionData[],
  payload: object,
): Promise<{ sent: number; expired: string[] }> {
  const wp      = getWebPush();
  const body    = JSON.stringify(payload);
  const results = await Promise.allSettled(
    subs.map((s) =>
      wp.sendNotification({ endpoint: s.endpoint, keys: s.keys }, body)
    )
  );
  const expired = results
    .map((r, i) => (r.status === 'rejected' ? subs[i].endpoint : null))
    .filter((e): e is string => e !== null);
  return { sent: results.filter((r) => r.status === 'fulfilled').length, expired };
}
