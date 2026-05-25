import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { sql } from '@/lib/db';
import BottomNav from '@/components/layout/BottomNav';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const rows = await sql<{ target_calories: number | null }>`
    SELECT target_calories FROM users WHERE id = ${session.user.id}
  `;
  if (rows[0]?.target_calories == null) redirect('/register');

  return (
    <div className="min-h-screen bg-zinc-950">
      <main className="max-w-lg mx-auto px-4" style={{ paddingBottom: 'calc(5rem + env(safe-area-inset-bottom))' }}>{children}</main>
      <BottomNav />
    </div>
  );
}
