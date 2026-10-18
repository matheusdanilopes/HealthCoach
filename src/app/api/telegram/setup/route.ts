import { NextResponse } from 'next/server';
import { verifyCronSecret } from '@/lib/cron-auth';
import { appUrl, callTelegram, isTelegramConfigured } from '@/lib/telegram';

// GET /api/telegram/setup — registers the webhook and the command menu with Telegram.
// Run once after deploy (and after changing TELEGRAM_WEBHOOK_SECRET or the domain):
//   curl -H "Authorization: Bearer $CRON_SECRET" https://SEU-APP/api/telegram/setup
export async function GET(req: Request) {
  const authErr = verifyCronSecret(req);
  if (authErr) return authErr;

  const webhookUrl = appUrl('/api/telegram/webhook');
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!isTelegramConfigured() || !secret || !webhookUrl) {
    return NextResponse.json(
      { error: 'Configure TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET e APP_URL.' },
      { status: 503 },
    );
  }

  const [webhook, commands] = await Promise.all([
    callTelegram('setWebhook', {
      url:             webhookUrl,
      secret_token:    secret,
      allowed_updates: ['message', 'callback_query'],
      drop_pending_updates: true,
    }),
    callTelegram('setMyCommands', {
      commands: [
        { command: 'resumo',      description: 'Como está o seu dia' },
        { command: 'agua',        description: 'Registrar água (ex.: /agua 300)' },
        { command: 'ajuda',       description: 'Lista de comandos' },
        { command: 'desconectar', description: 'Parar de receber notificações' },
      ],
    }),
  ]);

  return NextResponse.json({ webhookUrl, webhook, commands });
}
