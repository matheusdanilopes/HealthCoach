import { NextResponse } from 'next/server';
import { verifyCronSecret } from '@/lib/cron-auth';
import { isTelegramConfigured } from '@/lib/telegram';
import { cleanupExpiredMessages } from '@/lib/telegram-messages';

// GET /api/telegram/cleanup — deletes expired bot messages from users' chats
// (Supabase pg_cron, every 10 minutes).
export async function GET(req: Request) {
  const authErr = verifyCronSecret(req);
  if (authErr) return authErr;
  if (!isTelegramConfigured()) return NextResponse.json({ skipped: true, reason: 'telegram_not_configured' });

  const result = await cleanupExpiredMessages();
  if (result.deleted || result.failed) console.info('[telegram-cleanup]', result);
  return NextResponse.json(result);
}
