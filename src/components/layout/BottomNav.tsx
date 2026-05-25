'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, BookOpen, TrendingUp, User, Utensils } from 'lucide-react';
import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  { href: '/dashboard', icon: LayoutDashboard, label: 'Início' },
  { href: '/diary',     icon: BookOpen,         label: 'Diário' },
  { href: '/meal-log',  icon: Utensils,         label: 'Refeição' },
  { href: '/history',   icon: TrendingUp,        label: 'Evolução' },
  { href: '/profile',   icon: User,              label: 'Perfil' },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-zinc-900 border-t border-zinc-200 dark:border-zinc-800"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="flex items-center justify-around max-w-lg mx-auto h-16">
        {NAV_ITEMS.map(({ href, icon: Icon, label }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex flex-col items-center justify-center gap-0.5 px-1.5 py-1.5 transition-all duration-200',
                active
                  ? 'text-blue-600 dark:text-blue-400'
                  : 'text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300'
              )}
            >
              <div
                className={cn(
                  'flex items-center justify-center h-8 w-12 rounded-full transition-all duration-200',
                  active ? 'bg-blue-50 dark:bg-blue-900/30' : ''
                )}
              >
                <Icon size={20} strokeWidth={active ? 2.5 : 1.75} />
              </div>
              <span className="text-[10px] font-medium">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
