import webpush from 'web-push';

let configured = false;

export function getWebPush(): typeof webpush {
  if (!configured) {
    const pub  = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    const priv = process.env.VAPID_PRIVATE_KEY;
    let   mail = process.env.VAPID_CONTACT_EMAIL ?? 'mailto:admin@healthcoach.app';
    if (!pub || !priv) throw new Error('VAPID keys not configured');
    // web-push requires subject as "mailto:email" or "https://url"
    if (!mail.startsWith('mailto:') && !mail.startsWith('https://')) mail = `mailto:${mail}`;
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
): Promise<{ sent: number; expired: string[]; lastError?: string }> {
  const wp      = getWebPush();
  const body    = JSON.stringify(payload);
  const results = await Promise.allSettled(
    subs.map((s) =>
      wp.sendNotification({ endpoint: s.endpoint, keys: s.keys }, body)
    )
  );
  const expired: string[] = [];
  let lastError: string | undefined;
  results.forEach((r, i) => {
    if (r.status === 'rejected') {
      const err = r.reason as { statusCode?: number; message?: string };
      const code = err?.statusCode ?? 0;
      console.warn('[push] sendNotification failed:', code, err?.message ?? r.reason);
      lastError = `${code}: ${err?.message ?? 'unknown'}`;
      // Only remove truly expired/gone subscriptions (410 = Gone, 404 = Not Found)
      if (code === 410 || code === 404) expired.push(subs[i].endpoint);
    }
  });
  return { sent: results.filter((r) => r.status === 'fulfilled').length, expired, lastError };
}
