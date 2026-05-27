import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { supabase } from '@/lib/db';

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data } = await supabase
    .from('notification_queue')
    .select('id, title, body, url, category, created_at')
    .eq('user_id', session.user.id)
    .eq('is_read', false)
    .gte('created_at', since)
    .order('created_at', { ascending: true });

  return NextResponse.json(data ?? []);
}
