import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { sql } from '@/lib/db';
import ProfileClient from './ProfileClient';
import type { Profile } from '@/types';

export default async function ProfilePage() {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const rows = await sql<Profile>`SELECT * FROM users WHERE id = ${session.user.id}`;
  const profile = rows[0] ?? null;

  return (
    <ProfileClient
      profile={profile}
      userId={session.user.id}
      email={session.user.email ?? ''}
    />
  );
}
