import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { sql } from '@/lib/db';
import {
  calculateAge,
  calculateTMB,
  calculateTDEE,
  calculateTargetCalories,
  calculateWaterTarget,
} from '@/lib/calculations';

export async function PUT(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { fullName, birthDate, weight, height, activityLevel } = await req.json();

  const w = parseFloat(weight);
  const h = parseFloat(height);
  const age = calculateAge(birthDate);

  const rows = await sql<{ sex: string }>`SELECT sex FROM users WHERE id = ${session.user.id}`;
  const sex = (rows[0]?.sex ?? 'male') as 'male' | 'female';

  const tmb = calculateTMB(w, h, age, sex);
  const tdee = calculateTDEE(tmb, activityLevel);
  const targetCal = calculateTargetCalories(tdee);
  const targetWater = calculateWaterTarget(w);

  await sql`
    UPDATE users SET
      full_name = ${fullName},
      birth_date = ${birthDate},
      current_weight = ${w},
      height_cm = ${h},
      activity_level = ${activityLevel},
      tdee = ${tdee},
      target_calories = ${targetCal},
      target_water_ml = ${targetWater},
      updated_at = NOW()
    WHERE id = ${session.user.id}
  `;

  return NextResponse.json({ ok: true, tdee, targetCal, targetWater });
}
