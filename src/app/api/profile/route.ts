import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { sql, updateWhere } from '@/lib/db';
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
    tmbManual,
    customTargetCalories,
    targetProtein,
  } = await req.json();

  const w = parseFloat(weight);
  const h = parseFloat(height);
  const age = calculateAge(birthDate);
  const effectiveSex: 'male' | 'female' = sex === 'female' ? 'female' : 'male';

  const level = normalizeActivityLevel(activityLevel);
  const formulaTmb = calculateTMB(w, h, age, effectiveSex);
  const tmbValue =
    customTmb != null && Number.isFinite(Number(customTmb)) ? Math.round(Number(customTmb)) : null;
  // The screen says whether the TMB is manual. Older clients don't, so fall
  // back to comparing with the formula (same > 3 kcal threshold the screen uses).
  const manualTmb =
    tmbValue == null
      ? null
      : typeof tmbManual === 'boolean'
        ? (tmbManual ? tmbValue : null)
        : (Math.abs(tmbValue - formulaTmb) > 3 ? tmbValue : null);
  const effectiveTmb = manualTmb ?? formulaTmb;
  const tdee = calculateTDEE(effectiveTmb, level);
  const formulaTarget = calculateTargetCalories(tdee);

  // The screen always sends the target it shows. When that is still the
  // automatic target saved before (TDEE − 500) and wasn't edited, follow the
  // new TDEE instead of freezing the old value as a manual target.
  const [prev] = await sql`SELECT tdee, target_calories FROM users WHERE id = ${session.user.id}`;
  const prevTdee = prev?.tdee != null ? Number(prev.tdee) : null;
  const prevTarget = prev?.target_calories != null ? Number(prev.target_calories) : null;
  const prevTargetWasFormula =
    prevTdee != null && prevTarget != null && prevTarget === calculateTargetCalories(prevTdee);
  const customTarget =
    customTargetCalories != null && Number.isFinite(Number(customTargetCalories))
      ? Math.max(Math.round(Number(customTargetCalories)), 1200)
      : null;
  const targetCal =
    customTarget == null || (prevTargetWasFormula && customTarget === prevTarget)
      ? formulaTarget
      : customTarget;
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
