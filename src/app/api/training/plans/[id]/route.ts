import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { sql } from '@/lib/db';
import { activatePlan, listPlans } from '@/lib/training-data';

// Makes an earlier plan the active one again.
export async function PATCH(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  try {
    const plan = await activatePlan(session.user.id, id);
    if (!plan) return NextResponse.json({ error: 'Plano não encontrado.' }, { status: 404 });
    return NextResponse.json({ plan, plans: await listPlans(session.user.id) });
  } catch (err) {
    console.error('[training-plan] activate failed:', err);
    return NextResponse.json({ error: 'Não foi possível ativar o plano.' }, { status: 500 });
  }
}

// Sessions keep their logged sets (plan_id becomes null), so progression
// history survives deleting the plan.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  try {
    await sql`DELETE FROM workout_plans WHERE id = ${id} AND user_id = ${session.user.id}`;
  } catch {
    return NextResponse.json({ error: 'Não foi possível excluir o plano.' }, { status: 500 });
  }

  return NextResponse.json({ plans: await listPlans(session.user.id) });
}
