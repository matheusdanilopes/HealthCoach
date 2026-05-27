import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { supabase } from '@/lib/db';

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { ids } = await req.json() as { ids: string[] };
  if (!ids?.length) return NextResponse.json({ ok: true });

  await supabase
    .from('notification_queue')
    .update({ is_read: true })
    .in('id', ids)
    .eq('user_id', session.user.id);

  return NextResponse.json({ ok: true });
}
