import webpush, { WebPushError } from 'web-push';

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

export type PushSendOptions = {
  ttl?:     number;                                    // seconds, default 24h
  urgency?: 'very-low' | 'low' | 'normal' | 'high';  // delivery priority
  topic?:   string;                                    // dedup key for queued messages
};

// 404 = endpoint not found, 410 = subscription explicitly unsubscribed.
// These are the only codes that definitively mean the subscription is permanently gone.
//
// 401 is intentionally excluded: for APNs (iOS Safari Web Push), 401 means the VAPID JWT
// was rejected — a server-side auth issue, NOT that the subscription is invalid.
// Deleting on 401 would silently wipe valid iOS subscriptions whenever the VAPID JWT
// has any issue. 403 is similarly ambiguous across push services.
const GONE_CODES = new Set([404, 410]);

export type SendResult = {
  sent: number;
  expired: string[];
  failed: number;
  errors: Array<{ endpoint: string; code: number; message: string }>;
};

export async function sendPushToSubscriptions(
  subs: PushSubscriptionData[],
  payload: object,
  opts: PushSendOptions = {},
): Promise<SendResult> {
  const wp   = getWebPush();
  const body = JSON.stringify(payload);
  const reqOpts: webpush.RequestOptions = {
    TTL:     opts.ttl     ?? 86_400,
    urgency: opts.urgency ?? 'normal',
    ...(opts.topic ? { topic: opts.topic } : {}),
  };

  const results = await Promise.allSettled(
    subs.map((s) => wp.sendNotification({ endpoint: s.endpoint, keys: s.keys }, body, reqOpts))
  );

  const expired: string[] = [];
  const errors: SendResult['errors'] = [];
  let sent = 0;
  let failed = 0;

  results.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      sent++;
    } else {
      const err  = r.reason as WebPushError;
      const code = typeof err?.statusCode === 'number' ? err.statusCode : 0;
      const hint = subs[i].endpoint.slice(-16);

      if (GONE_CODES.has(code)) {
        expired.push(subs[i].endpoint);
        console.info(`[webpush] subscription gone endpoint=…${hint} status=${code}`);
      } else if (code === 401 || code === 403) {
        failed++;
        console.error(`[webpush] VAPID auth rejected status=${code} — check VAPID keys/email config. endpoint=…${hint}`);
        errors.push({ endpoint: hint, code, message: err?.message ?? 'VAPID auth rejected' });
      } else {
        failed++;
        const msg = err?.message ?? String(err);
        console.error(`[webpush] send failed endpoint=…${hint} status=${code} msg=${msg}`);
        errors.push({ endpoint: hint, code, message: msg });
      }
    }
  });

  if (sent > 0 || expired.length > 0 || failed > 0) {
    console.info(`[webpush] result sent=${sent} expired=${expired.length} failed=${failed}`);
  }

  return { sent, expired, failed, errors };
}

// Single-subscription send with automatic retry on transient failures (5xx, 429).
// Returns true if delivered, false if permanently failed.
export async function sendPushWithRetry(
  sub: PushSubscriptionData,
  payload: object,
  opts: PushSendOptions = {},
  maxAttempts = 3,
): Promise<{ delivered: boolean; gone: boolean }> {
  const TRANSIENT = new Set([429, 500, 502, 503, 504]);

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const wp   = getWebPush();
      const body = JSON.stringify(payload);
      await wp.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, body, {
        TTL:     opts.ttl     ?? 86_400,
        urgency: opts.urgency ?? 'normal',
        ...(opts.topic ? { topic: opts.topic } : {}),
      });
      return { delivered: true, gone: false };
    } catch (err) {
      const code = typeof (err as WebPushError)?.statusCode === 'number'
        ? (err as WebPushError).statusCode
        : 0;

      if (GONE_CODES.has(code)) {
        return { delivered: false, gone: true };
      }

      if (TRANSIENT.has(code) && attempt < maxAttempts) {
        const delay = Math.pow(2, attempt) * 1000;
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }

      console.error(`[webpush] send failed after ${attempt} attempt(s) code=${code}:`, (err as Error)?.message ?? err);
      return { delivered: false, gone: false };
    }
  }
  return { delivered: false, gone: false };
}
