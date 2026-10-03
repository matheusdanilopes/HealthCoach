import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getRecentNotifications } from '@/lib/notification-logger';

// GET /api/notifications/history — latest notifications sent to the current user
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  return NextResponse.json({ items: await getRecentNotifications(session.user.id) });
}
