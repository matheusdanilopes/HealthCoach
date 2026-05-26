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
      <header className="sticky top-0 z-30 h-14 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-md border-b border-zinc-100 dark:border-zinc-900">
        <div className="max-w-2xl mx-auto px-6 h-full flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded-lg bg-blue-600 flex items-center justify-center">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M7 1.5C4 1.5 1.5 4 1.5 7s2.5 5.5 5.5 5.5S12.5 10 12.5 7 10 1.5 7 1.5z" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
                <path d="M7 4.5v3l2 1.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">
              HealthCoach
            </span>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <main
        className="max-w-2xl mx-auto px-2"
        style={{ paddingBottom: 'calc(5.5rem + env(safe-area-inset-bottom))' }}
      >
        {children}
      </main>

      <BottomNav />
    </div>
  );
}
