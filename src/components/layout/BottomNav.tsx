'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, BookOpen, TrendingUp, User } from 'lucide-react';
import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  { href: '/dashboard', icon: LayoutDashboard, label: 'Início' },
  { href: '/diary',     icon: BookOpen,         label: 'Diário' },
  { href: '/history',   icon: TrendingUp,        label: 'Evolução' },
  { href: '/profile',   icon: User,              label: 'Perfil' },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 bg-white/90 dark:bg-zinc-950/90 backdrop-blur-md border-t border-zinc-100 dark:border-zinc-900"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="flex items-center justify-around max-w-2xl mx-auto h-[60px] px-2">
        {NAV_ITEMS.map(({ href, icon: Icon, label }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'relative flex flex-col items-center justify-center gap-1 flex-1 h-full transition-all duration-200',
                active
                  ? 'text-zinc-900 dark:text-zinc-100'
                  : 'text-zinc-400 hover:text-zinc-500 dark:text-zinc-500 dark:hover:text-zinc-400'
              )}
            >
              {active && (
                <span className="absolute top-0 left-1/2 -translate-x-1/2 h-0.5 w-8 rounded-full bg-blue-600 dark:bg-blue-500" />
              )}
              <Icon size={20} strokeWidth={active ? 2 : 1.75} />
              <span className={cn(
                'text-[10px] font-medium transition-all duration-200',
                active ? 'opacity-100' : 'opacity-70'
              )}>
                {label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
