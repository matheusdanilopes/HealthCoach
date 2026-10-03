import { randomUUID } from 'crypto';
import { supabase } from '@/lib/db';
import { isChatGone, sendMessage, type InlineKeyboard } from '@/lib/telegram';
import { expireSummaries, trackMessage, type MessageKind } from '@/lib/telegram-messages';
import { logNotification, type NotificationCategory } from '@/lib/notification-logger';

export type OutgoingNotification = {
  category: NotificationCategory;
  ref?: string;
  html: string;
  // Receives the log id so buttons can report back which notification was acted on.
  keyboard?: (logId: string) => InlineKeyboard;
};

export type SendResult = 'sent' | 'failed' | 'gone';

export type NotificationPreferences = {
  hydration: boolean;
  meals: boolean;
  workouts: boolean;
  insights: boolean;
  goals: boolean;
  quiet_start: number;
  quiet_end: number;
};

export const DEFAULT_PREFERENCES: NotificationPreferences = {
  hydration:   true,
  meals:       true,
  workouts:    true,
  insights:    true,
  goals:       true,
  quiet_start: 22,
  quiet_end:   7,
};

// Log categories are singular, preference columns are plural.
const PREF_KEY: Partial<Record<NotificationCategory, keyof NotificationPreferences>> = {
  hydration: 'hydration',
  meal:      'meals',
  workout:   'workouts',
  insight:   'insights',
  goal:      'goals',
};

export function isCategoryEnabled(prefs: NotificationPreferences, category: NotificationCategory): boolean {
  const key = PREF_KEY[category];
  return key ? prefs[key] !== false : true;
}

// Quiet window may wrap midnight (22 → 7) or not (13 → 15). start === end disables it.
export function isQuietHour(hour: number, start: number, end: number): boolean {
  if (start === end) return false;
  return start > end ? hour >= start || hour < end : hour >= start && hour < end;
}

// How long each category stays in the chat before being deleted.
const MESSAGE_KIND: Record<NotificationCategory, MessageKind> = {
  hydration: 'reminder',
  meal:      'reminder',
  workout:   'reminder',
  insight:   'summary',
  goal:      'summary',
  system:    'reply',
  test:      'reply',
};

// Plain-text version of the HTML message, for the log table.
function splitForLog(html: string): { title: string; body: string } {
  const text = html.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  const [title, ...rest] = text.split('\n');
  return { title: title.slice(0, 200), body: rest.join('\n').trim().slice(0, 2000) };
}

export async function sendTelegramNotification(
  userId: string,
  chatId: number,
  notif: OutgoingNotification,
): Promise<SendResult> {
  const logId = randomUUID();
  const result = await sendMessage(chatId, notif.html, notif.keyboard?.(logId));
  const { title, body } = splitForLog(notif.html);

  if (result.ok) {
    const kind = MESSAGE_KIND[notif.category];
    // A new daily summary replaces the previous summaries and insights.
    if (notif.category === 'goal') await expireSummaries(chatId);
    await trackMessage(chatId, result.result.message_id, kind);
    await logNotification({ id: logId, user_id: userId, category: notif.category, ref: notif.ref, title, body, status: 'sent' });
    return 'sent';
  }

  const gone = isChatGone(result);
  if (gone) {
    // User blocked the bot or deleted the chat — stop trying until they reconnect.
    await supabase
      .from('telegram_links')
      .update({ chat_id: null, updated_at: new Date().toISOString() })
      .eq('user_id', userId);
    console.info(`[telegram] chat gone userId=${userId} code=${result.code} — link removed`);
  } else {
    console.error(`[telegram] send failed userId=${userId} code=${result.code} msg=${result.description}`);
  }

  await logNotification({
    id: logId, user_id: userId, category: notif.category, ref: notif.ref, title, body,
    status: 'failed', error_msg: `${result.code}: ${result.description}`,
  });
  return gone ? 'gone' : 'failed';
}

export async function getChatId(userId: string): Promise<number | null> {
  const { data } = await supabase
    .from('telegram_links')
    .select('chat_id')
    .eq('user_id', userId)
    .maybeSingle();
  return (data as { chat_id: number | null } | null)?.chat_id ?? null;
}
