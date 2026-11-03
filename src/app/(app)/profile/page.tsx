import { redirect } from 'next/navigation';
import { getSession, getUserRow } from '@/lib/session';
import ProfileClient from './ProfileClient';

export default async function ProfilePage() {
  const session = await getSession();
  if (!session?.user) redirect('/login');

  const profile = await getUserRow(session.user.id);

  return (
    <ProfileClient
      profile={profile}
      userId={session.user.id}
      email={session.user.email ?? ''}
    />
  );
}
