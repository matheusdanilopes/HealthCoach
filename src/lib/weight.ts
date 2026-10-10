import { supabase } from '@/lib/db';

// Weight is logged from two places: the dashboard quick log (weight_logs) and
// the "Pesagem" screen (body_metrics). The latest weight is whichever entry
// has the most recent date; on the same day, the most recently saved one.
export async function getLatestWeight(userId: string): Promise<number | null> {
  const [{ data: logRows }, { data: metricRows }] = await Promise.all([
    supabase
      .from('weight_logs')
      .select('weight_kg, log_date, created_at')
      .eq('user_id', userId)
      .order('log_date', { ascending: false })
      .limit(1),
    supabase
      .from('body_metrics')
      .select('weight, date, created_at, updated_at')
      .eq('user_id', userId)
      .order('date', { ascending: false })
      .limit(1),
  ]);

  const candidates = [
    ...(logRows ?? []).map((r) => ({
      weight: Number(r.weight_kg),
      date: String(r.log_date),
      savedAt: String(r.created_at ?? ''),
    })),
    ...(metricRows ?? []).map((r) => ({
      weight: Number(r.weight),
      date: String(r.date),
      savedAt: String(r.updated_at ?? r.created_at ?? ''),
    })),
  ].filter((c) => Number.isFinite(c.weight) && c.weight > 0);

  if (candidates.length === 0) return null;

  candidates.sort((a, b) =>
    b.date.localeCompare(a.date) || (Date.parse(b.savedAt) || 0) - (Date.parse(a.savedAt) || 0)
  );
  return candidates[0].weight;
}
