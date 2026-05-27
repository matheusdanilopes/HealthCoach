import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { sendToUser } from '@/lib/notifications/notify';

export async function POST() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  await sendToUser(session.user.id, {
    title: 'HealthCoach',
    body: 'Notificações funcionando perfeitamente!',
    category: 'updates',
    url: '/dashboard',
  });

  return NextResponse.json({ ok: true });
}
