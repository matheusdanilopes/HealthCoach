import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { sql } from '@/lib/db';

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { amount_ml } = await req.json();
  const today = new Date().toISOString().split('T')[0];

  await sql`
    INSERT INTO water_logs (user_id, amount_ml, log_date)
    VALUES (${session.user.id}, ${amount_ml}, ${today})
  `;

  return NextResponse.json({ ok: true });
}
