import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { supabase } from '@/lib/db';

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { weight_kg } = await req.json();
  const today = new Date().toISOString().split('T')[0];

  await supabase.from('weight_logs').upsert({
    user_id: session.user.id,
    weight_kg,
    log_date: today,
  });

  await supabase
    .from('users')
    .update({ current_weight: weight_kg, updated_at: new Date().toISOString() })
    .eq('id', session.user.id);

  return NextResponse.json({ ok: true });
}
