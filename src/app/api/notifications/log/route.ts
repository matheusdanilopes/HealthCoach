import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { markNotificationOpened, getNotificationStats } from '@/lib/notification-logger';

// POST /api/notifications/log — mark a notification as opened
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { logId } = await req.json() as { logId?: string };
  if (!logId) return NextResponse.json({ error: 'logId required' }, { status: 400 });

  await markNotificationOpened(logId);
  return NextResponse.json({ ok: true });
}

// GET /api/notifications/log — fetch delivery stats for the current user
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const stats = await getNotificationStats(session.user.id);
  return NextResponse.json(stats);
}
