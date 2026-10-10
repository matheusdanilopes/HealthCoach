import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { buildCoachSnapshot } from '@/lib/coach-data';
import CoachClient from './CoachClient';

export default async function CoachPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');

  // Only the user's own numbers are loaded here — the AI is called from the
  // client when the user explicitly asks for an analysis.
  const snapshot = await buildCoachSnapshot(session.user.id);

  return <CoachClient userId={session.user.id} snapshot={snapshot} />;
}
