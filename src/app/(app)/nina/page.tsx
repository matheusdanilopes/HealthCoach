import { redirect } from 'next/navigation';
import { getSession, getUserRow } from '@/lib/session';
import { sql } from '@/lib/db';
import { brazilToday } from '@/lib/timezone';
import NinaChat, { type SavedConversation } from '@/components/chat/NinaChat';
import { loadLatestConversation } from '@/lib/chat/store';

export default async function NinaPage() {
  const session = await getSession();
  if (!session?.user) redirect('/login');

  const userId = session.user.id;
  const today = brazilToday();

  // Totais do dia: as sugestões de pergunta usam o que ainda falta.
  const [profile, foodRows, waterRows, conversation] = await Promise.all([
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
    // O chat abre na conversa mais recente. Sem a tabela chat_messages (ou
    // com o banco instável), abre vazio em vez de quebrar a página.
    loadLatestConversation(userId).catch((err): SavedConversation | null => {
      console.error('[nina] latest conversation', err instanceof Error ? err.message : err);
      return null;
    }),
  ]);
  if (!profile) redirect('/login');

  const food = foodRows[0] as { calories: number | string; protein: number | string } | undefined;
  const water = waterRows[0] as { water: number | string } | undefined;

  return (
    <NinaChat
      profile={profile}
      initialConversation={conversation}
      initialCalories={Number(food?.calories ?? 0)}
      initialProtein={Number(food?.protein ?? 0)}
      initialWater={Number(water?.water ?? 0)}
    />
  );
}
