import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { supabase } from '@/lib/db';

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { amount_ml } = await req.json();
  const today = new Date().toISOString().split('T')[0];

  await supabase.from('water_logs').insert({
    user_id: session.user.id,
    amount_ml,
    log_date: today,
  });

  return NextResponse.json({ ok: true });
}
