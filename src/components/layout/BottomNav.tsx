'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, BookOpen, TrendingUp, User } from 'lucide-react';
import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  { href: '/dashboard', icon: LayoutDashboard, label: 'Início' },
  { href: '/diary', icon: BookOpen, label: 'Diário' },
  { href: '/history', icon: TrendingUp, label: 'Evolução' },
  { href: '/profile', icon: User, label: 'Perfil' },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-zinc-200"
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
                'flex flex-col items-center justify-center gap-0.5 px-3 py-1.5 transition-all duration-200',
                active ? 'text-blue-600' : 'text-zinc-400 hover:text-zinc-600'
              )}
            >
              <div
                className={cn(
                  'flex items-center justify-center h-8 w-14 rounded-full transition-all duration-200',
                  active ? 'bg-blue-50' : ''
                )}
              >
                <Icon size={20} strokeWidth={active ? 2.5 : 1.75} />
              </div>
              <span className={cn('text-[10px] font-medium transition-all duration-200', active ? 'text-blue-600' : '')}>
                {label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
