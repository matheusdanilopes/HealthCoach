import { redirect } from 'next/navigation';
import { getSession, getUserRow } from '@/lib/session';
import { sql } from '@/lib/db';
import { brazilToday } from '@/lib/timezone';
import NinaChat from '@/components/chat/NinaChat';

export default async function NinaPage() {
  const session = await getSession();
  if (!session?.user) redirect('/login');

  const userId = session.user.id;
  const today = brazilToday();

  // Só os totais do dia: o resumo no topo do chat mostra o que a Nina "vê".
  const [profile, foodRows, waterRows] = await Promise.all([
    getUserRow(userId),
    sql`
      SELECT
        COALESCE(SUM(calories) FILTER (WHERE calories > 0), 0) AS calories,
        COALESCE(SUM(protein)  FILTER (WHERE calories > 0), 0) AS protein
      FROM food_logs
      WHERE user_id = ${userId} AND log_date = ${today}
    `,
    sql`
      SELECT COALESCE(SUM(amount_ml), 0) AS water
      FROM water_logs
      WHERE user_id = ${userId} AND log_date = ${today}
    `,
  ]);
  if (!profile) redirect('/login');

  const food = foodRows[0] as { calories: number | string; protein: number | string } | undefined;
  const water = waterRows[0] as { water: number | string } | undefined;

  return (
    <NinaChat
      userId={userId}
      day={today}
      profile={profile}
      initialCalories={Number(food?.calories ?? 0)}
      initialProtein={Number(food?.protein ?? 0)}
      initialWater={Number(water?.water ?? 0)}
    />
  );
}
