import { supabase } from '@/lib/db';
import { deleteMessage, sendMessage, type InlineKeyboard, type TelegramResult } from '@/lib/telegram';

// Keeps the chat clean: every bot message is recorded with an expiry and
// deleted by cleanupExpiredMessages() (cron every 10 min + opportunistically
// on each incoming update).

export type MessageKind = 'reminder' | 'reply' | 'summary';

// Telegram refuses to delete messages older than 48h; stay safely below it.
const MAX_LIFETIME_MIN = 47 * 60;

const DEFAULT_TTL_MIN: Record<MessageKind, number> = {
  reminder: 120,              // stale once the moment has passed
  reply:    10,               // command answers
  summary:  MAX_LIFETIME_MIN, // replaced by the next summary (see expireSummaries)
};

export async function trackMessage(chatId: number, messageId: number, kind: MessageKind, ttlMin = DEFAULT_TTL_MIN[kind]): Promise<void> {
  const deleteAfter = new Date(Date.now() + Math.min(ttlMin, MAX_LIFETIME_MIN) * 60_000).toISOString();
  const { error } = await supabase
    .from('telegram_messages')
    .upsert({ chat_id: chatId, message_id: messageId, kind, delete_after: deleteAfter }, { onConflict: 'chat_id,message_id' });
  if (error) console.error('[telegram-messages] track failed:', error.message);
}

export async function sendTracked(
  chatId: number,
  html: string,
  kind: MessageKind,
  keyboard?: InlineKeyboard,
  ttlMin?: number,
): Promise<TelegramResult<{ message_id: number }>> {
  const result = await sendMessage(chatId, html, keyboard);
  if (result.ok) await trackMessage(chatId, result.result.message_id, kind, ttlMin);
  return result;
}

// Deletes a message right away (user commands, acted-on notifications).
export async function deleteNow(chatId: number, messageId: number): Promise<void> {
  await deleteMessage(chatId, messageId);
  await supabase.from('telegram_messages').delete().eq('chat_id', chatId).eq('message_id', messageId);
}

// A new summary makes the previous summaries and insights obsolete.
export async function expireSummaries(chatId: number): Promise<void> {
  await supabase
    .from('telegram_messages')
    .update({ delete_after: new Date().toISOString() })
    .eq('chat_id', chatId)
    .eq('kind', 'summary');
}

export async function cleanupExpiredMessages(chatId?: number): Promise<{ deleted: number; failed: number }> {
  let query = supabase
    .from('telegram_messages')
    .select('chat_id, message_id')
    .lte('delete_after', new Date().toISOString())
    .order('delete_after', { ascending: true })
    .limit(300);
  if (chatId !== undefined) query = query.eq('chat_id', chatId);

  const { data } = await query;
  const due = (data ?? []) as Array<{ chat_id: number; message_id: number }>;
  const counts = { deleted: 0, failed: 0 };

  for (const m of due) {
    const res = await deleteMessage(m.chat_id, m.message_id);
    // Already gone, too old or chat blocked: nothing more we can do, so drop the row either way.
    if (res.ok) counts.deleted++;
    else counts.failed++;
    await supabase.from('telegram_messages').delete().eq('chat_id', m.chat_id).eq('message_id', m.message_id);
  }
  return counts;
}
