import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { sendToUser } from '@/lib/notifications/webPush';

export async function POST() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  await sendToUser(session.user.id, {
    title: 'HealthCoach',
    body: 'Notificações funcionando perfeitamente!',
    category: 'updates',
    url: '/dashboard',
    tag: 'test',
  });

  return NextResponse.json({ ok: true });
}
