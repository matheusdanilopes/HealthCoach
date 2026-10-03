// Minimal Telegram Bot API client (https://core.telegram.org/bots/api).

const API_BASE = 'https://api.telegram.org';

export type InlineButton =
  | { text: string; callback_data: string }
  | { text: string; url: string };

export type InlineKeyboard = InlineButton[][];

export type TelegramResult<T = unknown> =
  | { ok: true; result: T }
  | { ok: false; code: number; description: string; retryAfter?: number };

type ApiResponse<T> = {
  ok: boolean;
  result?: T;
  error_code?: number;
  description?: string;
  parameters?: { retry_after?: number };
};

export function isTelegramConfigured(): boolean {
  return !!process.env.TELEGRAM_BOT_TOKEN;
}

export function botUsername(): string | null {
  return process.env.TELEGRAM_BOT_USERNAME?.replace(/^@/, '') ?? null;
}

// Public base URL of the app, used for links inside messages.
export function appUrl(path = ''): string | null {
  const base = process.env.APP_URL
    ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : null);
  return base ? base.replace(/\/$/, '') + path : null;
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export async function callTelegram<T = unknown>(method: string, params: object): Promise<TelegramResult<T>> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return { ok: false, code: 0, description: 'TELEGRAM_BOT_TOKEN not configured' };

  // One retry when Telegram asks us to slow down (429 + retry_after).
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(`${API_BASE}/bot${token}/${method}`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(params),
        signal:  AbortSignal.timeout(10_000),
      });
      const data = await res.json() as ApiResponse<T>;
      if (data.ok) return { ok: true, result: data.result as T };

      const code = data.error_code ?? res.status;
      const retryAfter = data.parameters?.retry_after;
      if (code === 429 && retryAfter && retryAfter <= 5 && attempt === 1) {
        await new Promise((r) => setTimeout(r, retryAfter * 1000));
        continue;
      }
      return { ok: false, code, description: data.description ?? `HTTP ${res.status}`, retryAfter };
    } catch (err) {
      if (attempt === 2) {
        return { ok: false, code: 0, description: err instanceof Error ? err.message : String(err) };
      }
    }
  }
  return { ok: false, code: 0, description: 'unreachable' };
}

export async function sendMessage(
  chatId: number,
  html: string,
  keyboard?: InlineKeyboard,
): Promise<TelegramResult<{ message_id: number }>> {
  return callTelegram<{ message_id: number }>('sendMessage', {
    chat_id:    chatId,
    text:       html,
    parse_mode: 'HTML',
    link_preview_options: { is_disabled: true },
    ...(keyboard ? { reply_markup: { inline_keyboard: keyboard } } : {}),
  });
}

export async function answerCallbackQuery(callbackQueryId: string, text?: string): Promise<void> {
  await callTelegram('answerCallbackQuery', {
    callback_query_id: callbackQueryId,
    ...(text ? { text } : {}),
  });
}

// 403 = user blocked the bot / deleted the chat; 400 "chat not found" = invalid chat.
// Both mean the link is permanently unusable.
export function isChatGone(result: TelegramResult): boolean {
  if (result.ok) return false;
  return result.code === 403 || (result.code === 400 && /chat not found/i.test(result.description));
}

// Keyboard helpers ────────────────────────────────────────────────────────────

export function waterButtons(logId?: string, amounts = [250, 500]): InlineButton[] {
  return amounts.map((ml) => ({
    text:          `💧 +${ml}ml`,
    callback_data: logId ? `w:${ml}:${logId}` : `w:${ml}`,
  }));
}

export function openAppButton(text: string, path: string): InlineButton[] {
  const url = appUrl(path);
  return url ? [{ text, url }] : [];
}
