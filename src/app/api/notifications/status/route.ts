import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { supabase } from '@/lib/db';

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: subs, error } = await supabase
    .from('push_subscriptions')
    .select('endpoint, updated_at')
    .eq('user_id', session.user.id);

  if (error) {
    console.error('[push] status query error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    subscribed:  (subs ?? []).length > 0,
    devices:     (subs ?? []).length,
    lastUpdated: subs?.at(0)?.updated_at ?? null,
  });
}
