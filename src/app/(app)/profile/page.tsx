import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { supabase } from '@/lib/db';
import ProfileClient from './ProfileClient';
import type { Profile } from '@/types';

export default async function ProfilePage() {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const { data: profile } = await supabase
    .from('users')
    .select('*')
    .eq('id', session.user.id)
    .single();

  return (
    <ProfileClient
      profile={(profile as Profile) ?? null}
      userId={session.user.id}
      email={session.user.email ?? ''}
    />
  );
}
