import { sql } from '@/lib/db';

// All weight entries live in body_metrics (dashboard quick log and the
// "Pesagem" screen). The latest weight is the entry with the most recent date.
export async function getLatestWeight(userId: string): Promise<number | null> {
  const [row] = await sql`
    SELECT weight FROM body_metrics
    WHERE user_id = ${userId} ORDER BY date DESC LIMIT 1
  `;
  const weight = Number(row?.weight);
  return Number.isFinite(weight) && weight > 0 ? weight : null;
}
