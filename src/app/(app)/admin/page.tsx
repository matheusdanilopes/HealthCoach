import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { sql } from '@/lib/db';
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

  const users = await sql<UserRow>`
    SELECT id, email, full_name, created_at
    FROM users
    ORDER BY created_at DESC
  `;

  return <AdminClient users={users} currentUserId={session.user.id} />;
}
