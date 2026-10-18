import { insertInto } from '@/lib/db';
import { brazilToday } from '@/lib/timezone';

export const MAX_WATER_ML = 2000;

// Inserts a water entry for today (Brazil time). Same limits as the water_logs CHECK constraint.
export async function addWaterLog(userId: string, amountMl: number): Promise<boolean> {
  if (!Number.isInteger(amountMl) || amountMl <= 0 || amountMl > MAX_WATER_ML) return false;
  try {
    await insertInto('water_logs', { user_id: userId, amount_ml: amountMl, log_date: brazilToday() });
    return true;
  } catch (err) {
    console.error('[water] insert failed:', err instanceof Error ? err.message : err);
    return false;
  }
}
