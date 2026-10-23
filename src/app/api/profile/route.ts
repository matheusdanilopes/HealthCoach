import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { updateWhere } from '@/lib/db';
import {
  calculateAge,
  calculateTMB,
  calculateTDEE,
  calculateTargetCalories,
  calculateWaterTarget,
  normalizeActivityLevel,
} from '@/lib/calculations';

export async function PUT(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const {
    fullName,
    birthDate,
    weight,
    height,
    sex,
    activityLevel,
    customTmb,
    customTargetCalories,
    targetProtein,
  } = await req.json();

  const w = parseFloat(weight);
  const h = parseFloat(height);
  const age = calculateAge(birthDate);
  const effectiveSex: 'male' | 'female' = sex === 'female' ? 'female' : 'male';

  const level = normalizeActivityLevel(activityLevel);
  const formulaTmb = calculateTMB(w, h, age, effectiveSex);
  // The screen always sends the TMB field; it only counts as manual when it
  // differs from the formula (same > 3 kcal threshold the screen uses).
  const manualTmb =
    customTmb != null && Number.isFinite(Number(customTmb)) && Math.abs(Math.round(Number(customTmb)) - formulaTmb) > 3
      ? Math.round(Number(customTmb))
      : null;
  const effectiveTmb = manualTmb ?? formulaTmb;
  const tdee = calculateTDEE(effectiveTmb, level);
  const formulaTarget = calculateTargetCalories(tdee);
  const targetCal =
    customTargetCalories != null && Number.isFinite(Number(customTargetCalories))
      ? Math.max(Math.round(Number(customTargetCalories)), 1200)
      : formulaTarget;
  const targetWater = calculateWaterTarget(w);
  // Optional: empty clears the goal; omitted (older clients) keeps it.
  const proteinNum = Number(targetProtein);
  const proteinUpdate =
    targetProtein === undefined
      ? {}
      : { target_protein_g: targetProtein === null || targetProtein === '' || !Number.isFinite(proteinNum) || proteinNum <= 0
          ? null
          : Math.min(Math.max(Math.round(proteinNum), 20), 400) };

  await updateWhere('users', {
      full_name: fullName,
      birth_date: birthDate,
      current_weight: w,
      height_cm: h,
      sex: effectiveSex,
      activity_level: level,
      custom_tmb: manualTmb,
      tdee,
      target_calories: targetCal,
      target_water_ml: targetWater,
      ...proteinUpdate,
      updated_at: new Date().toISOString(),
  }, { id: session.user.id });

  return NextResponse.json({ ok: true, tdee, targetCal, targetWater });
}
