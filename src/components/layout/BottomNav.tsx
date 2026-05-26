'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, BookOpen, TrendingUp, Scale, User } from 'lucide-react';
import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  { href: '/dashboard',    icon: LayoutDashboard, label: 'Início'  },
  { href: '/diary',        icon: BookOpen,         label: 'Diário'  },
  { href: '/body-metrics', icon: Scale,            label: 'Corpo'   },
  { href: '/history',      icon: TrendingUp,       label: 'Evolução'},
  { href: '/profile',      icon: User,             label: 'Perfil'  },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 bg-white/90 dark:bg-zinc-950/95 backdrop-blur-xl border-t border-zinc-200/60 dark:border-zinc-800/50"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="flex items-center max-w-2xl mx-auto h-[56px] px-3">
        {NAV_ITEMS.map(({ href, icon: Icon, label }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'relative flex flex-col items-center justify-center gap-1 flex-1 h-full transition-all duration-200',
                active
                  ? 'text-blue-600 dark:text-blue-400'
                  : 'text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300'
              )}
            >
              {active && (
                <span className="absolute top-0 left-1/2 -translate-x-1/2 h-[2px] w-6 rounded-full bg-blue-600 dark:bg-blue-400" />
              )}
              <Icon
                size={19}
                strokeWidth={active ? 2.25 : 1.75}
                className="transition-all duration-200"
              />
              <span className={cn(
                'text-[10px] font-medium tracking-tight transition-all duration-200',
                active ? 'opacity-100' : 'opacity-60'
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
