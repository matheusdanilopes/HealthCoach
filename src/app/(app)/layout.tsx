import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { sql } from '@/lib/db';
import BottomNav from '@/components/layout/BottomNav';
import ThemeToggle from '@/components/ui/ThemeToggle';
import { LogoIcon } from '@/components/ui/Logo';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const [data] = await sql`SELECT target_calories FROM users WHERE id = ${session.user.id}`;

  if (data?.target_calories == null) redirect('/register');

  return (
    <div className="min-h-screen bg-[#f4f4f6] dark:bg-[#0c0c0e]">
      {/* Header */}
      <header className="sticky top-0 z-30 h-[56px] bg-white/90 dark:bg-[#141416]/95 backdrop-blur-xl border-b border-zinc-200/50 dark:border-zinc-800/40">
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
        className="max-w-2xl mx-auto px-4 sm:px-5"
        style={{ paddingBottom: 'calc(5.5rem + env(safe-area-inset-bottom))' }}
      >
        {children}
      </main>

      <BottomNav />
    </div>
  );
}
