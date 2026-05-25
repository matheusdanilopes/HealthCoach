import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { supabase } from '@/lib/db';
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

  const { data: userData } = await supabase
    .from('users')
    .select('sex')
    .eq('id', session.user.id)
    .single();

  const sex = (userData?.sex ?? 'male') as 'male' | 'female';

  const tmb = calculateTMB(w, h, age, sex);
  const tdee = calculateTDEE(tmb, activityLevel);
  const targetCal = calculateTargetCalories(tdee);
  const targetWater = calculateWaterTarget(w);

  await supabase
    .from('users')
    .update({
      full_name: fullName,
      birth_date: birthDate,
      current_weight: w,
      height_cm: h,
      activity_level: activityLevel,
      tdee,
      target_calories: targetCal,
      target_water_ml: targetWater,
      updated_at: new Date().toISOString(),
    })
    .eq('id', session.user.id);

  return NextResponse.json({ ok: true, tdee, targetCal, targetWater });
}
