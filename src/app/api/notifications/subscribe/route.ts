import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { supabase } from '@/lib/db';

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { endpoint, keys } = body as { endpoint: string; keys: { p256dh: string; auth: string } };

  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return NextResponse.json({ error: 'Invalid subscription' }, { status: 400 });
  }

  const { error } = await supabase
    .from('push_subscriptions')
    .upsert(
      {
        user_id:    session.user.id,
        endpoint,
        p256dh:     keys.p256dh,
        auth:       keys.auth,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id, endpoint' }
    );

  if (error) {
    console.error('[push] Subscribe error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  console.log('[push] Subscription saved for user', session.user.id);
  return NextResponse.json({ ok: true });
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
