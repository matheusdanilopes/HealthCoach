import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { sql } from '@/lib/db';

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const recipes = await sql`
      SELECT * FROM meal_prep_recipes
      WHERE user_id = ${session.user.id}
      ORDER BY created_at DESC
      LIMIT 20
    `;

    return NextResponse.json({ recipes });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[meal-prep/history] Error:', msg);
    return NextResponse.json({ error: 'Erro ao buscar histórico' }, { status: 500 });
  }
}
