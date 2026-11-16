import { sql } from '@/lib/db';
import { brazilNDaysAgo } from '@/lib/timezone';
import {
  normalizeProjectionDays,
  projectWeight,
  type DayEnergy,
  type WeighIn,
  type WeightProjection,
} from '@/lib/weight-projection';

// Loads the last N complete days (today is still being logged, so it is left
// out of the energy balance) and the weigh-ins of the same window, today included.
export async function getWeightProjection(
  userId: string,
  opts: { today: string; windowDays: unknown; tdee: number | null; currentWeight: number | null },
): Promise<WeightProjection | null> {
  const windowDays = normalizeProjectionDays(opts.windowDays);
  const start = brazilNDaysAgo(windowDays, opts.today);

  const [food, weights] = await Promise.all([
    sql`
      SELECT log_date,
             COALESCE(SUM(calories) FILTER (WHERE calories > 0), 0)  AS consumed,
             COALESCE(-SUM(calories) FILTER (WHERE calories < 0), 0) AS burned
      FROM food_logs
      WHERE user_id = ${userId} AND log_date >= ${start} AND log_date < ${opts.today}
      GROUP BY log_date
    `,
    sql`
      SELECT date, weight FROM body_metrics
      WHERE user_id = ${userId} AND date >= ${start} AND date <= ${opts.today}
      ORDER BY date
    `,
  ]);

  const days: DayEnergy[] = (food as Array<{ log_date: string; consumed: number; burned: number }>).map((r) => ({
    date: r.log_date,
    consumed: Number(r.consumed),
    burned: Number(r.burned),
  }));
  const weighIns: WeighIn[] = (weights as Array<{ date: string; weight: number }>).map((r) => ({
    date: r.date,
    weight: Number(r.weight),
  }));

  return projectWeight({
    windowDays,
    days,
    weighIns,
    tdee: opts.tdee != null ? Number(opts.tdee) : null,
    currentWeight: opts.currentWeight,
  });
}
