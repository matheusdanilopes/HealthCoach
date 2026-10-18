export function calculateTMB(
  weight: number,
  height: number,
  age: number,
  sex: 'male' | 'female'
): number {
  const base = 10 * weight + 6.25 * height - 5 * age;
  return Math.round(sex === 'male' ? base + 5 : base - 161);
}

const ACTIVITY_MULTIPLIERS = {
  sedentary: 1.2,
  moderate: 1.55,
  active: 1.725,
};

export function calculateTDEE(
  tmb: number,
  activityLevel: 'sedentary' | 'moderate' | 'active'
): number {
  return Math.round(tmb * ACTIVITY_MULTIPLIERS[activityLevel]);
}

export function calculateTargetCalories(tdee: number): number {
  return Math.max(tdee - 500, 1200);
}

export function calculateAge(birthDate: string): number {
  const birth = new Date(birthDate);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

export function calculateWaterTarget(weight: number): number {
  return Math.round(weight * 35);
}

// Suggested daily protein: 1.8 g/kg, the middle of the 1.6–2.2 g/kg range
// used by the coach for both fat loss and muscle gain.
export function calculateProteinTarget(weight: number): number {
  return Math.round(weight * 1.8);
}

// Net energy cost of a day's step count (above resting, which the TMB already
// covers). Stride length is estimated from height (≈ 41.5% men / 41.3% women)
// and the ACSM walking equation gives a net cost of ~0.5 kcal per kg per km.
export function calculateStepsCalories(
  steps: number,
  weight: number,
  height: number | null,
  sex: 'male' | 'female' | null
): { calories: number; distanceKm: number; strideCm: number } {
  const strideCm = height ? height * (sex === 'female' ? 0.413 : 0.415) : 70;
  const distanceKm = (steps * strideCm) / 100_000;
  return {
    calories: Math.round(0.5 * weight * distanceKm),
    distanceKm: Math.round(distanceKm * 100) / 100,
    strideCm: Math.round(strideCm),
  };
}
