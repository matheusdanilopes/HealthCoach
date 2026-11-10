/**
 * Gravação do chat do Coach (tabela chat_messages, ver db/schema.sql).
 *
 * O chat continua funcionando sem a tabela (migration ainda não aplicada):
 * as funções de gravação só registram o erro. Sem ela, a recuperação da
 * resposta quando a conexão cai e o 👍/👎 ficam indisponíveis.
 */

import { sql } from '@/lib/db';
import type { TurnMeta } from '@/lib/chat/turn';

export function isMissingSchema(err: unknown): boolean {
  const code = (err as { code?: unknown })?.code;
  return code === '42P01' || code === '42703';
}

function logStoreError(action: string, err: unknown) {
  const hint = isMissingSchema(err) ? ' (tabela chat_messages ausente: aplique db/schema.sql)' : '';
  console.error(`[chat-store] ${action} failed${hint}:`, err instanceof Error ? err.message : err);
}

/** Grava a pergunta com o id gerado pelo app (é por ele que o app acha a resposta). */
export async function saveUserMessage(m: { id: string; userId: string; conversationId: string; content: string }): Promise<boolean> {
  try {
    await sql`
      INSERT INTO chat_messages (id, user_id, conversation_id, role, content)
      VALUES (${m.id}, ${m.userId}, ${m.conversationId}, 'user', ${m.content})
      ON CONFLICT (id) DO NOTHING
    `;
    return true;
  } catch (err) {
    logStoreError('save user message', err);
    return false;
  }
}

/** Grava a resposta; devolve o id (para o 👍/👎) ou null. */
export async function saveAssistantMessage(m: {
  userId: string;
  conversationId: string;
  content: string;
  foodLogId: string | null;
  meta: TurnMeta & { intent?: string };
}): Promise<string | null> {
  try {
    const [row] = await sql`
      INSERT INTO chat_messages (user_id, conversation_id, role, content, food_log_id, meta)
      VALUES (${m.userId}, ${m.conversationId}, 'assistant', ${m.content}, ${m.foodLogId}, ${JSON.stringify(m.meta)}::jsonb)
      RETURNING id
    `;
    return (row?.id as string) ?? null;
  } catch (err) {
    logStoreError('save assistant message', err);
    return null;
  }
}

export interface StoredMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
  rating: 1 | -1 | null;
  food_log: Record<string, unknown> | null;
}

export async function loadConversation(userId: string, conversationId: string): Promise<StoredMessage[]> {
  const rows = await sql`
    SELECT m.id, m.role, m.content, m.created_at, m.rating,
           CASE WHEN f.id IS NULL THEN NULL ELSE to_jsonb(f) END AS food_log
      FROM chat_messages m
      LEFT JOIN food_logs f ON f.id = m.food_log_id
     WHERE m.user_id = ${userId} AND m.conversation_id = ${conversationId}
     ORDER BY m.created_at ASC, m.role DESC
     LIMIT 200
  `;
  return rows as StoredMessage[];
}

/** Avalia uma resposta do próprio usuário; false = mensagem não encontrada. */
export async function rateMessage(userId: string, messageId: string, rating: 1 | -1 | null, comment: string | null): Promise<boolean> {
  const rows = await sql`
    UPDATE chat_messages
       SET rating = ${rating},
           rating_comment = ${rating === null ? null : comment},
           rated_at = ${rating === null ? null : new Date().toISOString()}
     WHERE id = ${messageId} AND user_id = ${userId} AND role = 'assistant'
    RETURNING id
  `;
  return rows.length > 0;
}
