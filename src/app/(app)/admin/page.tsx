import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { supabase } from '@/lib/db';
import AdminClient from './AdminClient';

type UserRow = {
  id: string;
  email: string;
  full_name: string;
  created_at: string;
};

export default async function AdminPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const { data: users } = await supabase
    .from('users')
    .select('id, email, full_name, created_at')
    .order('created_at', { ascending: false });

  return <AdminClient users={(users as UserRow[]) ?? []} currentUserId={session.user.id} />;
}
