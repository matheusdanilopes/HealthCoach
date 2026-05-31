'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, HeartPulse, Scale, User, Ruler,
  Utensils, TrendingUp, ChefHat,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const BODY_PATHS = ['/body-metrics', '/body-measurements'];

const BODY_SUB_ITEMS = [
  { href: '/body-metrics',      icon: Scale, label: 'Pesagem', desc: 'Peso e composição' },
  { href: '/body-measurements', icon: Ruler, label: 'Medidas', desc: 'Circunferências'    },
];

const SAUDE_PATHS = ['/saude', '/diary', '/history', '/marmitas'];

const SAUDE_SUB_ITEMS = [
  { href: '/diary',    icon: Utensils,   label: 'Diário',   desc: 'Registro de refeições' },
  { href: '/history',  icon: TrendingUp, label: 'Histórico', desc: 'Meu progresso'        },
  { href: '/marmitas', icon: ChefHat,    label: 'Marmitas', desc: 'Planejamento semanal'  },
];

function NavItem({
  href, icon: Icon, label, active,
}: {
  href: string;
  icon: React.ElementType;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        'relative flex flex-col items-center justify-center gap-1 flex-1 h-full transition-all duration-200',
        active
          ? 'text-emerald-600 dark:text-emerald-400'
          : 'text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300'
      )}
    >
      {active && (
        <span className="absolute top-0 left-1/2 -translate-x-1/2 h-[2px] w-6 rounded-full bg-emerald-600 dark:bg-emerald-400" />
      )}
      <Icon size={19} strokeWidth={active ? 2.25 : 1.75} className="transition-all duration-200" />
      <span className={cn(
        'text-[10px] font-medium tracking-tight transition-all duration-200',
        active ? 'opacity-100' : 'opacity-60'
      )}>
        {label}
      </span>
    </Link>
  );
}

export default function BottomNav() {
  const pathname = usePathname();
  const [bodyOpen,  setBodyOpen]  = useState(false);
  const [saudeOpen, setSaudeOpen] = useState(false);
  const bodyRef  = useRef<HTMLDivElement>(null);
  const saudeRef = useRef<HTMLDivElement>(null);

  const isBodyActive  = BODY_PATHS.includes(pathname);
  const isSaudeActive = SAUDE_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'));

  // Close both menus on navigation
  useEffect(() => { setBodyOpen(false); setSaudeOpen(false); }, [pathname]);

  // Close body menu on outside click
  useEffect(() => {
    if (!bodyOpen) return;
    function onPointerDown(e: PointerEvent) {
      if (bodyRef.current && !bodyRef.current.contains(e.target as Node)) setBodyOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [bodyOpen]);

  // Close saúde menu on outside click
  useEffect(() => {
    if (!saudeOpen) return;
    function onPointerDown(e: PointerEvent) {
      if (saudeRef.current && !saudeRef.current.contains(e.target as Node)) setSaudeOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [saudeOpen]);

  function SubMenu({ items, activePath }: {
    items: { href: string; icon: React.ElementType; label: string; desc: string }[];
    activePath: string;
  }) {
    return (
      <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 z-50 animate-slide-up">
        <div className="bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-2xl shadow-xl shadow-black/10 dark:shadow-black/50 overflow-hidden min-w-[188px]">
          {items.map(({ href, icon: Icon, label, desc }) => {
            const active = activePath === href || activePath.startsWith(href + '/');
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  'flex items-center gap-3 px-4 py-3 transition-colors duration-150',
                  active
                    ? 'bg-emerald-50 dark:bg-emerald-950/20'
                    : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/60'
                )}
              >
                <div className={cn(
                  'h-8 w-8 rounded-[10px] flex items-center justify-center flex-shrink-0',
                  active
                    ? 'bg-emerald-600 text-white'
                    : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400'
                )}>
                  <Icon size={14} />
                </div>
                <div>
                  <p className={cn(
                    'text-[13px] font-semibold leading-none',
                    active ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-800 dark:text-zinc-200'
                  )}>
                    {label}
                  </p>
                  <p className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-0.5">{desc}</p>
                </div>
              </Link>
            );
          })}
        </div>
        {/* Arrow */}
        <div className="flex justify-center">
          <div className="w-2.5 h-2.5 bg-white dark:bg-zinc-900 border-b border-r border-zinc-100 dark:border-zinc-800 rotate-45 -mt-[5px]" />
        </div>
      </div>
    );
  }

  function MenuButton({
    icon: Icon, label, isActive, isOpen, onClick,
  }: {
    icon: React.ElementType;
    label: string;
    isActive: boolean;
    isOpen: boolean;
    onClick: () => void;
  }) {
    const lit = isActive || isOpen;
    return (
      <button
        onClick={onClick}
        className={cn(
          'relative flex flex-col items-center justify-center gap-1 w-full h-full transition-all duration-200',
          lit
            ? 'text-emerald-600 dark:text-emerald-400'
            : 'text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300'
        )}
      >
        {lit && (
          <span className="absolute top-0 left-1/2 -translate-x-1/2 h-[2px] w-6 rounded-full bg-emerald-600 dark:bg-emerald-400" />
        )}
        <Icon size={19} strokeWidth={lit ? 2.25 : 1.75} className="transition-all duration-200" />
        <span className={cn(
          'text-[10px] font-medium tracking-tight transition-all duration-200',
          lit ? 'opacity-100' : 'opacity-60'
        )}>
          {label}
        </span>
      </button>
    );
  }

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 bg-white/90 dark:bg-zinc-950/95 backdrop-blur-xl border-t border-zinc-200/60 dark:border-zinc-800/50"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="flex items-center max-w-2xl mx-auto h-[56px] px-3">

        <NavItem href="/dashboard" icon={LayoutDashboard} label="Início" active={pathname === '/dashboard'} />

        {/* Saúde — button with floating submenu */}
        <div ref={saudeRef} className="relative flex-1 flex items-center justify-center h-full">
          {saudeOpen && <SubMenu items={SAUDE_SUB_ITEMS} activePath={pathname} />}
          <MenuButton
            icon={HeartPulse}
            label="Saúde"
            isActive={isSaudeActive}
            isOpen={saudeOpen}
            onClick={() => { setBodyOpen(false); setSaudeOpen((v) => !v); }}
          />
        </div>

        {/* Corpo — button with floating submenu */}
        <div ref={bodyRef} className="relative flex-1 flex items-center justify-center h-full">
          {bodyOpen && <SubMenu items={BODY_SUB_ITEMS} activePath={pathname} />}
          <MenuButton
            icon={Scale}
            label="Corpo"
            isActive={isBodyActive}
            isOpen={bodyOpen}
            onClick={() => { setSaudeOpen(false); setBodyOpen((v) => !v); }}
          />
        </div>

        <NavItem href="/profile" icon={User} label="Perfil" active={pathname === '/profile'} />

      </div>
    </nav>
  );
}
