import { supabase } from '@/lib/db';
import { brazilToday } from '@/lib/timezone';

export const MAX_WATER_ML = 2000;

// Inserts a water entry for today (Brazil time). Same limits as the water_logs CHECK constraint.
export async function addWaterLog(userId: string, amountMl: number): Promise<boolean> {
  if (!Number.isInteger(amountMl) || amountMl <= 0 || amountMl > MAX_WATER_ML) return false;
  const { error } = await supabase
    .from('water_logs')
    .insert({ user_id: userId, amount_ml: amountMl, log_date: brazilToday() });
  if (error) console.error('[water] insert failed:', error.message);
  return !error;
}
