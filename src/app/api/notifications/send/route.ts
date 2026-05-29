import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { supabase } from '@/lib/db';
import { sendPushToSubscriptions } from '@/lib/webpush';

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { title, body, tag, url } = await req.json() as {
    title: string;
    body:  string;
    tag?:  string;
    url?:  string;
  };

  const { data: subs } = await supabase
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('user_id', session.user.id);

  if (!subs || subs.length === 0) {
    return NextResponse.json({ sent: 0, reason: 'no_subscriptions' });
  }

  let result = { sent: 0, expired: [] as string[] };
  try {
    result = await sendPushToSubscriptions(
      subs.map((s) => ({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } })),
      { title, body, tag: tag ?? 'hc-hydration', url: url ?? '/dashboard' }
    );
  } catch (err) {
    console.error('[push] Send error:', err instanceof Error ? err.message : err);
    return NextResponse.json({ sent: 0, reason: 'vapid_not_configured' });
  }

  // Remove expired/invalid subscriptions
  if (result.expired.length > 0) {
    await supabase
      .from('push_subscriptions')
      .delete()
      .in('endpoint', result.expired)
      .eq('user_id', session.user.id);
    console.log('[push] Removed', result.expired.length, 'expired subscriptions');
  }

  console.log('[push] Sent', result.sent, 'push(es) for user', session.user.id);
  return NextResponse.json({ sent: result.sent });
}
