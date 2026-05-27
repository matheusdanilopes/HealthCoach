import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { supabase } from '@/lib/db';

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { amount_ml, log_date } = await req.json();
  const today = new Date().toISOString().split('T')[0];
  const date = log_date ?? today;

  await supabase.from('water_logs').insert({
    user_id: session.user.id,
    amount_ml,
    log_date: date,
  });

  return NextResponse.json({ ok: true });
}
