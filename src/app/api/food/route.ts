import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { sql } from '@/lib/db';

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { food_name, meal_type, calories, protein, carbs, fat } = await req.json();

  const today = new Date().toISOString().split('T')[0];
  const [row] = await sql<{ id: string; food_name: string; meal_type: string; calories: number; protein: number | null; carbs: number | null; fat: number | null; created_at: string }>`
    INSERT INTO food_logs (user_id, food_name, meal_type, calories, protein, carbs, fat, log_date)
    VALUES (${session.user.id}, ${food_name}, ${meal_type}, ${calories}, ${protein ?? null}, ${carbs ?? null}, ${fat ?? null}, ${today})
    RETURNING id, food_name, meal_type, calories, protein, carbs, fat, created_at
  `;

  return NextResponse.json({ ...row, user_id: session.user.id });
}

export async function DELETE(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  await sql`DELETE FROM food_logs WHERE id = ${id} AND user_id = ${session.user.id}`;
  return NextResponse.json({ ok: true });
}
