import { supabase } from '@/lib/db';
import { brazilToday } from '@/lib/timezone';

const TZ = 'America/Sao_Paulo';
const REMINDER_INTERVAL_MS = 2 * 60 * 60 * 1000; // 2 hours
const QUIET_START = 22;
const QUIET_END = 7;

function brazilNow(): Date {
  return new Date(new Date().toLocaleString('en-US', { timeZone: TZ }));
}

// Returns the next reminder time after a water log event.
// Null when the goal is already met or outside active hours.
function computeNextReminderAt(lastWaterAt: Date, totalMl: number, targetMl: number): Date | null {
  if (totalMl >= targetMl) return null;

  const bNow = brazilNow();
  const hour = bNow.getHours();
  if (hour >= QUIET_START || hour < QUIET_END) return null;

  const endOfActive = new Date(bNow);
  endOfActive.setHours(QUIET_START, 0, 0, 0);

  const candidate = new Date(lastWaterAt.getTime() + REMINDER_INTERVAL_MS);
  if (candidate > endOfActive) return null;

  // If the candidate is already in the past, schedule a near-future check
  return candidate > bNow ? candidate : new Date(bNow.getTime() + 5 * 60 * 1000);
}

async function fetchDailyHydration(
  userId: string,
  date: string,
): Promise<{ totalMl: number; lastWaterAt: string | null }> {
  const [{ data: water }, { data: food }] = await Promise.all([
    supabase.from('water_logs').select('amount_ml, created_at').eq('user_id', userId).eq('log_date', date).limit(50),
    supabase.from('food_logs').select('hydration_ml, created_at').eq('user_id', userId).eq('log_date', date).gt('hydration_ml', 0),
  ]);

  const waterMl = (water ?? []).reduce((s: number, r: { amount_ml: number }) => s + r.amount_ml, 0);
  const mealMl  = (food  ?? []).reduce((s: number, r: { hydration_ml: number }) => s + r.hydration_ml, 0);

  const timestamps = [
    ...(water ?? []).map((r: { created_at: string }) => r.created_at),
    ...(food  ?? []).map((r: { created_at: string }) => r.created_at),
  ].sort().reverse();

  return { totalMl: waterMl + mealMl, lastWaterAt: timestamps[0] ?? null };
}

// Recompute and persist the reminder schedule state for a user.
// Must be called after any water log change (create or delete).
export async function recomputeReminderState(userId: string): Promise<void> {
  try {
    const today = brazilToday();

    const [profileResult, hydration] = await Promise.all([
      supabase.from('users').select('target_water_ml').eq('id', userId).single(),
      fetchDailyHydration(userId, today),
    ]);

    const target = (profileResult.data as { target_water_ml: number } | null)?.target_water_ml ?? 2500;
    const { totalMl, lastWaterAt } = hydration;
    const lastAt = lastWaterAt ? new Date(lastWaterAt) : null;
    const nextAt = lastAt ? computeNextReminderAt(lastAt, totalMl, target) : null;

    await supabase.from('hydration_reminder_state').upsert(
      {
        user_id:           userId,
        log_date:          today,
        daily_target_ml:   target,
        daily_consumed_ml: totalMl,
        last_water_at:     lastWaterAt,
        next_reminder_at:  nextAt?.toISOString() ?? null,
        last_computed_at:  new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    );

    console.info(`[hydration-scheduler] recomputed userId=${userId} totalMl=${totalMl}/${target} nextAt=${nextAt?.toISOString() ?? 'null'}`);
  } catch (err) {
    // Non-fatal — the cron still works without this state via direct DB checks
    console.error('[hydration-scheduler] recomputeReminderState failed:', err);
  }
}

// Returns the saved reminder state for a user (used by diagnostics endpoint).
export async function getReminderState(userId: string): Promise<{
  log_date: string | null;
  daily_target_ml: number;
  daily_consumed_ml: number;
  last_water_at: string | null;
  next_reminder_at: string | null;
  last_computed_at: string | null;
} | null> {
  const { data } = await supabase
    .from('hydration_reminder_state')
    .select('log_date, daily_target_ml, daily_consumed_ml, last_water_at, next_reminder_at, last_computed_at')
    .eq('user_id', userId)
    .single();

  return (data as {
    log_date: string | null;
    daily_target_ml: number;
    daily_consumed_ml: number;
    last_water_at: string | null;
    next_reminder_at: string | null;
    last_computed_at: string | null;
  } | null);
}
