import { sql, updateWhere } from '@/lib/db';
import {
  calculateAge,
  calculateTDEE,
  calculateTMB,
  calculateTargetCalories,
  calculateWaterTarget,
  normalizeActivityLevel,
} from '@/lib/calculations';

// Saves a new current weight and keeps the weight-based targets in step with it:
// TDEE is recalculated (from the manual TMB when the user set one, otherwise
// from the formula with the new weight), the calorie target follows the TDEE
// only while it is still the formula value (a manual target is kept), and the
// water target is recalculated as on the profile screen.
export async function saveWeightAndRecalculateTargets(userId: string, weight: number): Promise<void> {
  const now = new Date().toISOString();
  const [user] = await sql`
    SELECT birth_date, sex, height_cm, activity_level, tdee, target_calories, custom_tmb
    FROM users WHERE id = ${userId}
  `;

  const patch: Record<string, unknown> = { current_weight: weight, updated_at: now };

  const height = Number(user?.height_cm);
  const age = user?.birth_date ? calculateAge(String(user.birth_date)) : NaN;
  if (user && height > 0 && age > 0) {
    const level = normalizeActivityLevel(user.activity_level);
    const sex = user.sex === 'female' ? 'female' : 'male';
    const tmb = user.custom_tmb != null
      ? Number(user.custom_tmb)
      : calculateTMB(weight, height, age, sex);
    const tdee = calculateTDEE(tmb, level);

    const oldTdee = user.tdee != null ? Number(user.tdee) : null;
    const oldTarget = user.target_calories != null ? Number(user.target_calories) : null;
    const targetIsFormula =
      oldTarget == null || (oldTdee != null && oldTarget === calculateTargetCalories(oldTdee));

    patch.activity_level = level;
    patch.tdee = tdee;
    if (targetIsFormula) patch.target_calories = calculateTargetCalories(tdee);
    patch.target_water_ml = calculateWaterTarget(weight);
  }

  await updateWhere('users', patch, { id: userId });
}
