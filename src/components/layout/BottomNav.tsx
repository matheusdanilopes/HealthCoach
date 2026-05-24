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
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-zinc-900/95 backdrop-blur-md border-t border-zinc-800 safe-area-pb">
      <div className="flex items-center justify-around max-w-lg mx-auto h-16">
        {NAV_ITEMS.map(({ href, icon: Icon, label }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex flex-col items-center justify-center gap-0.5 px-4 py-2 rounded-xl transition-all duration-150',
                active ? 'text-emerald-400' : 'text-zinc-500 hover:text-zinc-300'
              )}
            >
              <Icon size={20} strokeWidth={active ? 2.5 : 2} />
              <span className="text-[10px] font-medium">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
