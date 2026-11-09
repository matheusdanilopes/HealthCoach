import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { sql } from '@/lib/db';
import { brazilToday } from '@/lib/timezone';
import { FOOD_LOG_WITH_REF_FROM, FOOD_LOG_WITH_REF_SELECT } from '@/lib/nutrition/foods';

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const date = searchParams.get('date') ?? brazilToday();

  const [foodData, waterData] = await Promise.all([
    sql.query(
      `SELECT ${FOOD_LOG_WITH_REF_SELECT} FROM ${FOOD_LOG_WITH_REF_FROM}
       WHERE f.user_id = $1 AND f.log_date = $2
       ORDER BY f.created_at`,
      [session.user.id, date],
    ),
    sql`
      SELECT id, amount_ml, created_at FROM water_logs
      WHERE user_id = ${session.user.id} AND log_date = ${date}
      ORDER BY created_at
    `,
  ]);

  const waterLogs = waterData as { id: string; amount_ml: number; created_at: string }[];
  const totalWater = waterLogs.reduce((s, r) => s + r.amount_ml, 0);

  return NextResponse.json({ foodLogs: foodData, water: totalWater, waterLogs });
}
