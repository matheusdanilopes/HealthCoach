import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { supabase } from '@/lib/db';

function detectPlatform(userAgent: string): string {
  const ua = userAgent.toLowerCase();
  if (ua.includes('iphone') || ua.includes('ipad') || ua.includes('ipod')) return 'ios';
  if (ua.includes('android')) return 'android';
  return 'desktop';
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { endpoint, keys } = body as { endpoint: string; keys: { p256dh: string; auth: string } };

  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return NextResponse.json({ error: 'Invalid subscription' }, { status: 400 });
  }

  const userAgent = req.headers.get('user-agent') ?? '';
  const platform  = detectPlatform(userAgent);

  const { error } = await supabase
    .from('push_subscriptions')
    .upsert(
      {
        user_id:      session.user.id,
        endpoint,
        p256dh:       keys.p256dh,
        auth:         keys.auth,
        platform,
        user_agent:   userAgent.slice(0, 512),
        updated_at:   new Date().toISOString(),
        last_used_at: new Date().toISOString(),
      },
      { onConflict: 'user_id, endpoint' }
    );

  if (error) {
    console.error('[push] Subscribe error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  console.log('[push] Subscription saved for user', session.user.id, 'platform:', platform);
  return NextResponse.json({ ok: true, platform });
}

export async function DELETE(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { endpoint } = await req.json();
  await supabase
    .from('push_subscriptions')
    .delete()
    .eq('user_id', session.user.id)
    .eq('endpoint', endpoint);

  return NextResponse.json({ ok: true });
}
