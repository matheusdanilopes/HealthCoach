import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { supabase } from '@/lib/db';
import BottomNav from '@/components/layout/BottomNav';
import ThemeToggle from '@/components/ui/ThemeToggle';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const { data } = await supabase
    .from('users')
    .select('target_calories')
    .eq('id', session.user.id)
    .single();

  if (data?.target_calories == null) redirect('/register');

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      {/* Thin top header */}
      <header className="sticky top-0 z-30 h-12 bg-white/90 dark:bg-zinc-900/90 backdrop-blur-sm border-b border-zinc-200 dark:border-zinc-800">
        <div className="max-w-lg mx-auto px-5 h-full flex items-center justify-between">
          <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 tracking-tight">
            HealthCoach
          </span>
          <ThemeToggle />
        </div>
      </header>

      <main
        className="max-w-lg mx-auto px-5"
        style={{ paddingBottom: 'calc(5.5rem + env(safe-area-inset-bottom))' }}
      >
        {children}
      </main>

      <BottomNav />
    </div>
  );
}
