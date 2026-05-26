import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { supabase } from '@/lib/db';
import BottomNav from '@/components/layout/BottomNav';
import ThemeToggle from '@/components/ui/ThemeToggle';
import { LogoIcon } from '@/components/ui/Logo';

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
    <div className="min-h-screen bg-[#f8f8f8] dark:bg-[#0a0a0b]">
      {/* Header */}
      <header className="sticky top-0 z-30 h-[54px] bg-white/85 dark:bg-zinc-950/90 backdrop-blur-xl border-b border-zinc-200/60 dark:border-zinc-800/50">
        <div className="max-w-2xl mx-auto px-5 h-full flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="h-7 w-7 rounded-[10px] bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center shadow-sm shadow-emerald-600/30">
              <LogoIcon size={14} />
            </div>
            <span className="text-[13px] font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">
              HealthCoach
            </span>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <main
        className="max-w-2xl mx-auto px-4 sm:px-6"
        style={{ paddingBottom: 'calc(5rem + env(safe-area-inset-bottom))' }}
      >
        {children}
      </main>

      <BottomNav />
    </div>
  );
}
