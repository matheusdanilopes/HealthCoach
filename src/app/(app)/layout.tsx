import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { getSession, getUserRow } from '@/lib/session';
import BottomNav from '@/components/layout/BottomNav';
import ThemeToggle from '@/components/ui/ThemeToggle';
import { LogoIcon } from '@/components/ui/Logo';

// Runs inside a Suspense boundary so the app shell (header, nav and the
// route's loading skeleton) streams immediately instead of waiting on the
// database — the slowest part of a cold start. The same cached query is
// reused by pages that need the full user row.
async function OnboardingGuard({ userId }: { userId: string }) {
  const user = await getUserRow(userId);
  if (user?.target_calories == null) redirect('/register');
  return null;
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session?.user) redirect('/login');

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
        className="max-w-2xl mx-auto px-4 sm:px-5 overflow-x-clip"
        style={{ paddingBottom: 'calc(5.5rem + env(safe-area-inset-bottom))' }}
      >
        {children}
      </main>

      <BottomNav />

      <Suspense fallback={null}>
        <OnboardingGuard userId={session.user.id} />
      </Suspense>
    </div>
  );
}
