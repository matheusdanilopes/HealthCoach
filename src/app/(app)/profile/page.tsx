import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { sql } from '@/lib/db';
import ProfileClient from './ProfileClient';
import type { Profile } from '@/types';

export default async function ProfilePage() {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const [profile] = await sql`SELECT * FROM users WHERE id = ${session.user.id}`;

  return (
    <ProfileClient
      profile={(profile as Profile) ?? null}
      userId={session.user.id}
      email={session.user.email ?? ''}
    />
  );
}
