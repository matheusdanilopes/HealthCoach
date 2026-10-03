import { NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { auth } from '@/auth';
import { supabase } from '@/lib/db';
import { botUsername, isTelegramConfigured } from '@/lib/telegram';
import { sendTracked } from '@/lib/telegram-messages';

const TOKEN_TTL_MS = 15 * 60 * 1000;

// GET /api/telegram/link — connection status for the current user
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data } = await supabase
    .from('telegram_links')
    .select('chat_id, username, linked_at')
    .eq('user_id', session.user.id)
    .maybeSingle();
  const link = data as { chat_id: number | null; username: string | null; linked_at: string | null } | null;

  return NextResponse.json({
    configured: isTelegramConfigured() && !!botUsername(),
    bot:        botUsername(),
    connected:  !!link?.chat_id,
    username:   link?.chat_id ? link.username : null,
    linkedAt:   link?.chat_id ? link.linked_at : null,
  });
}

// POST /api/telegram/link — creates a one-time deep link (t.me/<bot>?start=<token>)
export async function POST() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const bot = botUsername();
  if (!isTelegramConfigured() || !bot) {
    return NextResponse.json({ error: 'Bot do Telegram não configurado no servidor.' }, { status: 503 });
  }

  const token = randomBytes(18).toString('base64url');
  const { error } = await supabase.from('telegram_links').upsert(
    {
      user_id:               session.user.id,
      link_token:            token,
      link_token_expires_at: new Date(Date.now() + TOKEN_TTL_MS).toISOString(),
      updated_at:            new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  );
  if (error) {
    console.error('[telegram] link token error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ url: `https://t.me/${bot}?start=${token}`, expiresInMin: TOKEN_TTL_MS / 60_000 });
}

// DELETE /api/telegram/link — disconnects the chat
export async function DELETE() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data } = await supabase
    .from('telegram_links')
    .select('chat_id')
    .eq('user_id', session.user.id)
    .maybeSingle();
  const chatId = (data as { chat_id: number | null } | null)?.chat_id;

  await supabase
    .from('telegram_links')
    .update({ chat_id: null, updated_at: new Date().toISOString() })
    .eq('user_id', session.user.id);

  if (chatId) {
    await sendTracked(chatId, '🔕 Notificações desconectadas pelo app. Para voltar, conecte de novo em <b>Notificações</b>.', 'reply');
  }
  return NextResponse.json({ ok: true });
}
