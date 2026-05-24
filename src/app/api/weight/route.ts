import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { sql } from '@/lib/db';

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { weight_kg } = await req.json();
  const today = new Date().toISOString().split('T')[0];

  await sql`
    INSERT INTO weight_logs (user_id, weight_kg, log_date)
    VALUES (${session.user.id}, ${weight_kg}, ${today})
    ON CONFLICT (user_id, log_date) DO UPDATE SET weight_kg = EXCLUDED.weight_kg
  `;

  await sql`
    UPDATE users SET current_weight = ${weight_kg}, updated_at = NOW()
    WHERE id = ${session.user.id}
  `;

  return NextResponse.json({ ok: true });
}
