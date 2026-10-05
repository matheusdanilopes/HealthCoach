import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { supabase } from '@/lib/db';
import { brazilToday } from '@/lib/timezone';
import { addWaterLog, MAX_WATER_ML } from '@/lib/water';
import { getDayStatus, getUserTargets } from '@/lib/day-status';
import { buildStatusMessage } from '@/lib/notification-messages';
import { markNotificationActed } from '@/lib/notification-logger';
import {
  answerCallbackQuery,
  escapeHtml,
  openAppButton,
  waterButtons,
  type InlineKeyboard,
} from '@/lib/telegram';
import { cleanupExpiredMessages, deleteNow, sendTracked } from '@/lib/telegram-messages';

type TgUser = { id: number; username?: string; first_name?: string };
type TgChat = { id: number; type: string };
type TgUpdate = {
  update_id: number;
  message?: { message_id: number; chat: TgChat; from?: TgUser; text?: string };
  callback_query?: { id: string; from: TgUser; message?: { message_id: number; chat: TgChat }; data?: string };
};

const HELP = [
  '<b>Comandos</b>',
  '/resumo — como está o seu dia (água, calorias, proteína, treino)',
  '/agua 300 — registra 300ml de água (sem número, mostra atalhos)',
  '/desconectar — para de receber notificações aqui',
  '',
  'Preferências e horário silencioso: app → Notificações.',
].join('\n');

// Bot answers to commands are short-lived (10 min by default) to keep the chat clean.
async function reply(chatId: number, html: string, keyboard?: InlineKeyboard, ttlMin?: number) {
  await sendTracked(chatId, html, 'reply', keyboard, ttlMin);
}

function validSecret(req: Request): boolean {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  const got = req.headers.get('x-telegram-bot-api-secret-token') ?? '';
  if (!expected || got.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(got), Buffer.from(expected));
}

async function userIdForChat(chatId: number): Promise<string | null> {
  const { data } = await supabase.from('telegram_links').select('user_id').eq('chat_id', chatId).maybeSingle();
  return (data as { user_id: string } | null)?.user_id ?? null;
}

async function waterProgressText(userId: string): Promise<string> {
  const [targets, day] = await Promise.all([getUserTargets(userId), getDayStatus(userId, brazilToday())]);
  const pct = Math.round((day.waterMl / targets.waterMl) * 100);
  const total = (day.waterMl / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
  const goal  = (targets.waterMl / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
  return pct >= 100 ? `🎉 Meta batida! ${total}L de ${goal}L` : `${total}L de ${goal}L (${pct}%)`;
}

async function handleStart(chat: TgChat, from: TgUser | undefined, token: string | undefined) {
  if (!token) {
    const linked = await userIdForChat(chat.id);
    await reply(chat.id, linked
      ? `✅ Este chat já está conectado ao HealthCoach.\n\n${HELP}`
      : '👋 Olá! Para receber suas notificações aqui, abra o app em <b>Notificações → Conectar Telegram</b>.');
    return;
  }

  const { data } = await supabase
    .from('telegram_links')
    .select('user_id, link_token_expires_at')
    .eq('link_token', token)
    .maybeSingle();
  const link = data as { user_id: string; link_token_expires_at: string | null } | null;

  if (!link || !link.link_token_expires_at || new Date(link.link_token_expires_at) < new Date()) {
    await reply(chat.id, '⚠️ Este link expirou ou já foi usado. Gere um novo no app em <b>Notificações → Conectar Telegram</b>.');
    return;
  }

  // A chat belongs to a single account: detach it from any previous one.
  await supabase.from('telegram_links').update({ chat_id: null }).eq('chat_id', chat.id).neq('user_id', link.user_id);
  const { error } = await supabase
    .from('telegram_links')
    .update({
      chat_id:               chat.id,
      username:              from?.username ?? null,
      linked_at:             new Date().toISOString(),
      link_token:            null,
      link_token_expires_at: null,
      updated_at:            new Date().toISOString(),
    })
    .eq('user_id', link.user_id);

  if (error) {
    console.error('[telegram] link failed:', error.message);
    await reply(chat.id, '❌ Não consegui conectar agora. Tente gerar um novo link no app.');
    return;
  }

  const targets = await getUserTargets(link.user_id);
  await reply(
    chat.id,
    [
      `✅ <b>Pronto, ${escapeHtml(targets.firstName)}!</b> Seu HealthCoach está conectado.`,
      '',
      'Você vai receber aqui: resumo da manhã e da noite, lembretes de água no seu ritmo, refeições não registradas e treino.',
      '',
      HELP,
    ].join('\n'),
    [waterButtons(), openAppButton('⚙️ Preferências', '/notifications')].filter((r) => r.length > 0),
    60,
  );
}

async function handleCommand(chat: TgChat, from: TgUser | undefined, text: string) {
  const [rawCmd, ...args] = text.trim().split(/\s+/);
  const cmd = rawCmd.toLowerCase().replace(/@.*$/, '');

  if (cmd === '/start') return handleStart(chat, from, args[0]);

  const userId = await userIdForChat(chat.id);
  if (!userId) {
    await reply(chat.id, 'Este chat não está conectado. Abra o app em <b>Notificações → Conectar Telegram</b>.');
    return;
  }

  switch (cmd) {
    case '/resumo': {
      const [targets, day] = await Promise.all([getUserTargets(userId), getDayStatus(userId, brazilToday())]);
      await reply(chat.id, buildStatusMessage(targets, day), [waterButtons(), openAppButton('📊 Abrir o app', '/dashboard')].filter((r) => r.length > 0));
      return;
    }
    case '/agua':
    case '/água': {
      const ml = args[0] ? parseInt(args[0].replace(/\D/g, ''), 10) : NaN;
      if (Number.isNaN(ml)) {
        await reply(chat.id, '💧 Quanto você bebeu?', [waterButtons(undefined, [200, 300]), waterButtons(undefined, [500, 750])]);
        return;
      }
      if (!(await addWaterLog(userId, ml))) {
        await reply(chat.id, `⚠️ Informe um valor entre 1 e ${MAX_WATER_ML}ml. Ex.: /agua 300`);
        return;
      }
      await reply(chat.id, `✅ +${ml}ml registrados · ${await waterProgressText(userId)}`);
      return;
    }
    case '/desconectar': {
      await supabase.from('telegram_links').update({ chat_id: null, updated_at: new Date().toISOString() }).eq('user_id', userId);
      await reply(chat.id, '🔕 Desconectado. Você não vai mais receber notificações aqui. Para voltar, conecte de novo pelo app.');
      return;
    }
    case '/ajuda':
    case '/help':
      await reply(chat.id, HELP);
      return;
    default:
      await reply(chat.id, `Não entendi 🤔\n\n${HELP}`);
  }
}

async function handleCallback(cb: NonNullable<TgUpdate['callback_query']>) {
  const chatId = cb.message?.chat.id ?? cb.from.id;
  const userId = await userIdForChat(chatId);
  if (!userId) {
    await answerCallbackQuery(cb.id, 'Chat não conectado ao HealthCoach.');
    return;
  }

  const [kind, value, logId] = (cb.data ?? '').split(':');
  if (kind === 'w') {
    const ml = parseInt(value, 10);
    if (!(await addWaterLog(userId, ml))) {
      await answerCallbackQuery(cb.id, '❌ Não foi possível registrar.');
      return;
    }
    if (logId) await markNotificationActed(logId, userId);
    await answerCallbackQuery(cb.id, `✅ +${ml}ml · ${await waterProgressText(userId)}`);
    // The message did its job — remove it so the chat doesn't pile up.
    if (cb.message) await deleteNow(chatId, cb.message.message_id);
    return;
  }
  await answerCallbackQuery(cb.id);
}

// POST /api/telegram/webhook — registered with Telegram by /api/telegram/setup.
export async function POST(req: Request) {
  if (!validSecret(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let update: TgUpdate;
  try {
    update = await req.json() as TgUpdate;
  } catch {
    return NextResponse.json({ ok: true });
  }

  // Always answer 200: Telegram re-delivers failed updates, which would duplicate water logs.
  try {
    if (update.callback_query) {
      await handleCallback(update.callback_query);
    } else if (update.message?.text && update.message.chat.type === 'private') {
      const { chat, from, text, message_id } = update.message;
      await handleCommand(chat, from, text);
      // The user's own command is no longer useful once processed.
      await deleteNow(chat.id, message_id);
      await cleanupExpiredMessages(chat.id);
    }
  } catch (err) {
    console.error('[telegram] webhook error:', err);
  }
  return NextResponse.json({ ok: true });
}
