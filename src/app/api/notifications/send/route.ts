import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { supabase } from '@/lib/db';
import { sendPushToSubscriptions } from '@/lib/webpush';

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { title, body, tag, url, urgency, ttl } = await req.json() as {
    title:    string;
    body:     string;
    tag?:     string;
    url?:     string;
    urgency?: 'very-low' | 'low' | 'normal' | 'high';
    ttl?:     number;
  };

  const { data: subs } = await supabase
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('user_id', session.user.id);

  if (!subs || subs.length === 0) {
    return NextResponse.json({ sent: 0, reason: 'no_subscriptions' });
  }

  let result = { sent: 0, expired: [] as string[], failed: 0 };
  try {
    result = await sendPushToSubscriptions(
      subs.map((s) => ({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } })),
      { title, body, tag: tag ?? 'hc-hydration', url: url ?? '/dashboard' },
      { urgency, ttl },
    );
  } catch (err) {
    console.error('[push] send error:', err instanceof Error ? err.message : err);
    return NextResponse.json({ sent: 0, reason: 'vapid_not_configured' });
  }

  if (result.expired.length > 0) {
    await supabase
      .from('push_subscriptions')
      .delete()
      .in('endpoint', result.expired)
      .eq('user_id', session.user.id);
    console.info('[push] removed', result.expired.length, 'expired subscriptions for user', session.user.id);
  }

  console.info('[push] sent', result.sent, 'push(es) for user', session.user.id, 'failed:', result.failed);
  // Include reason when sent=0 so client can show a useful message
  if (result.sent === 0 && result.failed > 0) {
    return NextResponse.json({ sent: 0, failed: result.failed, reason: 'send_failed' });
  }
  return NextResponse.json({ sent: result.sent, failed: result.failed });
}
