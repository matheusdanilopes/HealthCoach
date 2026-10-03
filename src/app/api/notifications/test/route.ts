import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getChatId, sendTelegramNotification } from '@/lib/notification-sender';

// POST /api/notifications/test — sends a test message to the user's Telegram
export async function POST() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const chatId = await getChatId(session.user.id);
  if (!chatId) return NextResponse.json({ result: 'not_connected' });

  const result = await sendTelegramNotification(session.user.id, chatId, {
    category: 'test',
    html:     '✅ <b>Teste de notificação</b>\nTudo certo! Experimente /resumo para ver o seu dia ou /agua 300 para registrar água.',
  });
  return NextResponse.json({ result });
}
