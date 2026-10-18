import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { supabase } from '@/lib/db';
import { getExerciseHistory } from '@/lib/training-data';

// Deletes a logged session, its sets and the diary workout entry it created.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  const { data: row } = await supabase
    .from('workout_sessions')
    .select('food_log_id')
    .eq('id', id)
    .eq('user_id', session.user.id)
    .maybeSingle();
  if (!row) return NextResponse.json({ error: 'Treino não encontrado.' }, { status: 404 });

  const { error } = await supabase.from('workout_sessions').delete().eq('id', id).eq('user_id', session.user.id);
  if (error) return NextResponse.json({ error: 'Não foi possível excluir o treino.' }, { status: 500 });

  if (row.food_log_id) {
    await supabase.from('food_logs').delete().eq('id', row.food_log_id).eq('user_id', session.user.id);
  }

  return NextResponse.json({ success: true, history: await getExerciseHistory(session.user.id) });
}
