// Weight projection for the next 7 days, from the last N complete days.
//
// Two independent signals are combined:
//  1. Energy balance: average (eaten − workouts − TDEE) over the days with a
//     reasonably complete food log, converted at 7.700 kcal per kg.
//  2. Weigh-in trend: least-squares slope of the body_metrics entries in the
//     window (needs at least 2 weigh-ins a few days apart).
// When both exist they are blended — the weigh-ins get more say the more of
// them there are and the longer they span, since short trends are mostly water.

export const KCAL_PER_KG = 7700;
export const PROJECTION_HORIZON_DAYS = 7;
export const DEFAULT_PROJECTION_DAYS = 14;
export const MIN_PROJECTION_DAYS = 3;
export const MAX_PROJECTION_DAYS = 90;
// Days with less food than this are treated as not fully logged and ignored,
// otherwise a forgotten dinner reads as a huge deficit.
export const MIN_LOGGED_KCAL = 800;
// Below this weekly change (kg) the projection reads as "stable".
export const STABLE_THRESHOLD_KG = 0.05;

export type DayEnergy = { date: string; consumed: number; burned: number };
export type WeighIn = { date: string; weight: number };

export type ProjectionDirection = 'loss' | 'gain' | 'stable';
export type ProjectionConfidence = 'high' | 'medium' | 'low';

export type WeightProjection = {
  windowDays: number;
  horizonDays: number;
  direction: ProjectionDirection;
  changeKg: number;              // projected change over the horizon (negative = loss)
  projectedWeight: number | null;
  confidence: ProjectionConfidence;
  loggedDays: number;            // days used by the energy-balance signal
  avgBalanceKcal: number | null; // average daily balance (negative = deficit)
  calorieChangeKg: number | null;
  weighIns: number;
  trendChangeKg: number | null;
  signalsAgree: boolean | null;  // null when only one signal exists
};

export function normalizeProjectionDays(value: unknown): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_PROJECTION_DAYS;
  return Math.min(Math.max(n, MIN_PROJECTION_DAYS), MAX_PROJECTION_DAYS);
}

const DAY_MS = 86_400_000;
const dayIndex = (date: string) => Math.round(new Date(date + 'T12:00:00Z').getTime() / DAY_MS);
const round = (n: number, digits: number) => Math.round(n * 10 ** digits) / 10 ** digits;

function direction(changeKg: number): ProjectionDirection {
  if (Math.abs(changeKg) < STABLE_THRESHOLD_KG) return 'stable';
  return changeKg < 0 ? 'loss' : 'gain';
}

// Weekly change from a least-squares line through the weigh-ins.
export function weighInTrendPerWeek(weighIns: WeighIn[]): { perWeek: number; spanDays: number } | null {
  const points = weighIns
    .filter((w) => Number.isFinite(w.weight) && w.weight > 0)
    .map((w) => ({ x: dayIndex(w.date), y: w.weight }));
  if (points.length < 2) return null;

  const xs = points.map((p) => p.x);
  const spanDays = Math.max(...xs) - Math.min(...xs);
  if (spanDays < 3) return null;

  const meanX = xs.reduce((s, x) => s + x, 0) / points.length;
  const meanY = points.reduce((s, p) => s + p.y, 0) / points.length;
  let num = 0;
  let den = 0;
  for (const p of points) {
    num += (p.x - meanX) * (p.y - meanY);
    den += (p.x - meanX) ** 2;
  }
  if (den === 0) return null;
  return { perWeek: (num / den) * 7, spanDays };
}

export function projectWeight(input: {
  windowDays: number;
  days: DayEnergy[];
  weighIns: WeighIn[];
  tdee: number | null;
  currentWeight: number | null;
}): WeightProjection | null {
  const windowDays = normalizeProjectionDays(input.windowDays);
  const horizon = PROJECTION_HORIZON_DAYS;
  const tdee = input.tdee != null && input.tdee > 0 ? input.tdee : null;

  // ── Signal 1: energy balance ──
  const logged = input.days.filter((d) => d.consumed >= MIN_LOGGED_KCAL);
  let avgBalanceKcal: number | null = null;
  let calorieChangeKg: number | null = null;
  if (tdee && logged.length >= Math.min(3, windowDays)) {
    const total = logged.reduce((s, d) => s + d.consumed - Math.max(d.burned, 0) - tdee, 0);
    avgBalanceKcal = total / logged.length;
    calorieChangeKg = (avgBalanceKcal * horizon) / KCAL_PER_KG;
  }

  // ── Signal 2: weigh-in trend ──
  const trend = weighInTrendPerWeek(input.weighIns);
  const trendChangeKg = trend ? (trend.perWeek * horizon) / 7 : null;
  const weighIns = input.weighIns.length;

  if (calorieChangeKg == null && trendChangeKg == null) return null;

  // ── Blend ──
  let changeKg: number;
  let signalsAgree: boolean | null = null;
  if (calorieChangeKg != null && trendChangeKg != null) {
    // 3 weigh-ins over a week → ~0.35; daily weigh-ins over 2+ weeks → 0.6.
    const trendWeight =
      Math.min(trend!.spanDays / 14, 1) * Math.min(weighIns / 6, 1) * 0.6;
    changeKg = calorieChangeKg * (1 - trendWeight) + trendChangeKg * trendWeight;
    // Same direction, or close enough that the difference is noise.
    signalsAgree =
      direction(calorieChangeKg) === direction(trendChangeKg) ||
      Math.abs(calorieChangeKg - trendChangeKg) < 0.3;
  } else {
    changeKg = (calorieChangeKg ?? trendChangeKg)!;
  }

  // ── Confidence ──
  const coverage = logged.length / windowDays;
  let confidence: ProjectionConfidence;
  if (signalsAgree === false) confidence = 'low';
  else if (signalsAgree === true && coverage >= 0.6) confidence = 'high';
  else if (coverage >= 0.6 || (trend && weighIns >= 3)) confidence = 'medium';
  else confidence = 'low';

  const currentWeight = input.currentWeight && input.currentWeight > 0 ? input.currentWeight : null;

  return {
    windowDays,
    horizonDays: horizon,
    direction: direction(changeKg),
    changeKg: round(changeKg, 2),
    projectedWeight: currentWeight != null ? round(currentWeight + changeKg, 1) : null,
    confidence,
    loggedDays: logged.length,
    avgBalanceKcal: avgBalanceKcal != null ? Math.round(avgBalanceKcal) : null,
    calorieChangeKg: calorieChangeKg != null ? round(calorieChangeKg, 2) : null,
    weighIns,
    trendChangeKg: trendChangeKg != null ? round(trendChangeKg, 2) : null,
    signalsAgree,
  };
}
