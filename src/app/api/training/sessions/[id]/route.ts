import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { sql } from '@/lib/db';
import { getExerciseHistory } from '@/lib/training-data';

// Deletes a logged session, its sets and the diary workout entry it created.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  const [row] = await sql`
    SELECT food_log_id FROM workout_sessions WHERE id = ${id} AND user_id = ${session.user.id}
  `;
  if (!row) return NextResponse.json({ error: 'Treino não encontrado.' }, { status: 404 });

  try {
    await sql`DELETE FROM workout_sessions WHERE id = ${id} AND user_id = ${session.user.id}`;
  } catch {
    return NextResponse.json({ error: 'Não foi possível excluir o treino.' }, { status: 500 });
  }

  if (row.food_log_id) {
    await sql`DELETE FROM food_logs WHERE id = ${row.food_log_id} AND user_id = ${session.user.id}`;
  }

  return NextResponse.json({ success: true, history: await getExerciseHistory(session.user.id) });
}
