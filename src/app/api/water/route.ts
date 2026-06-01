import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { supabase } from '@/lib/db';
import { brazilToday } from '@/lib/timezone';
import { recomputeReminderState } from '@/lib/hydration-scheduler';

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const date = searchParams.get('date') ?? brazilToday();

  const { data } = await supabase
    .from('water_logs')
    .select('id, amount_ml, created_at')
    .eq('user_id', session.user.id)
    .eq('log_date', date)
    .order('created_at', { ascending: true });

  const totalMl = (data ?? []).reduce((s: number, r: { amount_ml: number }) => s + r.amount_ml, 0);
  return NextResponse.json({ logs: data ?? [], totalMl });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { amount_ml, log_date, created_at } = await req.json();
  const date = log_date ?? brazilToday();

  const insertData: Record<string, unknown> = { user_id: session.user.id, amount_ml, log_date: date };
  if (created_at) insertData.created_at = created_at;

  const { data, error } = await supabase
    .from('water_logs')
    .insert(insertData)
    .select('id, amount_ml, created_at')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Recalculate next reminder time (fire-and-forget)
  void recomputeReminderState(session.user.id);

  return NextResponse.json({ ok: true, log: data });
}

export async function DELETE(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const { error } = await supabase
    .from('water_logs')
    .delete()
    .eq('id', id)
    .eq('user_id', session.user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Recalculate next reminder time after deletion (fire-and-forget)
  void recomputeReminderState(session.user.id);

  return NextResponse.json({ ok: true });
}
