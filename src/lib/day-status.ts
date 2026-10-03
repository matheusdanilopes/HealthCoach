import { supabase } from '@/lib/db';
import { brazilNDaysAgo } from '@/lib/timezone';

// Snapshot of one user's day — the single source of numbers for Telegram
// reminders, daily summaries and the /resumo command.

export type UserTargets = {
  firstName: string;
  calories: number | null;
  protein: number | null;
  waterMl: number;
};

export type DayStatus = {
  date: string;
  waterMl: number;           // water logs + beverages from meals
  lastHydrationAt: string | null;
  consumedKcal: number;      // positive food entries
  burnedKcal: number;        // workouts (stored as negative calories)
  protein: number;
  carbs: number;
  fat: number;
  meals: Set<string>;        // meal_type values with at least one food entry
  hasWorkout: boolean;
};

type ProfileRow = {
  full_name: string | null;
  target_calories: number | null;
  target_protein_g: number | null;
  target_water_ml: number | null;
};

export function toTargets(p: ProfileRow | null): UserTargets {
  return {
    firstName: (p?.full_name ?? '').trim().split(' ')[0] || 'você',
    calories:  p?.target_calories ?? null,
    protein:   p?.target_protein_g != null ? Number(p.target_protein_g) : null,
    waterMl:   p?.target_water_ml ?? 2500,
  };
}

export const PROFILE_COLUMNS = 'id, full_name, target_calories, target_protein_g, target_water_ml';

export async function getUserTargets(userId: string): Promise<UserTargets> {
  const { data } = await supabase.from('users').select(PROFILE_COLUMNS).eq('id', userId).single();
  return toTargets(data as ProfileRow | null);
}

export async function getDayStatus(userId: string, date: string): Promise<DayStatus> {
  const [{ data: water }, { data: food }] = await Promise.all([
    supabase.from('water_logs').select('amount_ml, created_at').eq('user_id', userId).eq('log_date', date),
    supabase.from('food_logs')
      .select('meal_type, calories, protein, carbs, fat, hydration_ml, created_at')
      .eq('user_id', userId)
      .eq('log_date', date),
  ]);

  type FoodRow = {
    meal_type: string; calories: number; protein: number | null; carbs: number | null;
    fat: number | null; hydration_ml: number | null; created_at: string;
  };
  const waterRows = (water ?? []) as Array<{ amount_ml: number; created_at: string }>;
  const foodRows  = (food ?? []) as FoodRow[];

  const status: DayStatus = {
    date,
    waterMl: waterRows.reduce((s, r) => s + r.amount_ml, 0),
    lastHydrationAt: null,
    consumedKcal: 0,
    burnedKcal: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
    meals: new Set(),
    hasWorkout: false,
  };

  const hydrationTimes = waterRows.map((r) => r.created_at);
  for (const f of foodRows) {
    if (f.calories < 0) {
      status.burnedKcal += -f.calories;
      status.hasWorkout = true;
      continue;
    }
    status.consumedKcal += f.calories;
    status.protein += Number(f.protein ?? 0);
    status.carbs   += Number(f.carbs ?? 0);
    status.fat     += Number(f.fat ?? 0);
    status.meals.add(f.meal_type);
    if ((f.hydration_ml ?? 0) > 0) {
      status.waterMl += f.hydration_ml ?? 0;
      hydrationTimes.push(f.created_at);
    }
  }
  status.lastHydrationAt = hydrationTimes.sort().at(-1) ?? null;
  return status;
}

// Days since the last workout entry (0 = today, capped at 14).
export async function daysSinceLastWorkout(userId: string, today: string): Promise<number> {
  const { data } = await supabase
    .from('food_logs')
    .select('log_date')
    .eq('user_id', userId)
    .lt('calories', 0)
    .gte('log_date', brazilNDaysAgo(14, today))
    .order('log_date', { ascending: false })
    .limit(1);

  const last = (data as Array<{ log_date: string }> | null)?.[0]?.log_date;
  if (!last) return 14;
  const diff = new Date(today + 'T12:00:00').getTime() - new Date(last + 'T12:00:00').getTime();
  return Math.max(0, Math.round(diff / 86_400_000));
}
