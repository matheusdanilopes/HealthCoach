'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, HeartPulse, Scale, User, Ruler, BookOpen, TrendingUp, ChefHat } from 'lucide-react';
import { cn } from '@/lib/utils';

const BODY_PATHS = ['/body-metrics', '/body-measurements'];
const SAUDE_PATHS = ['/diary', '/history', '/marmitas'];

const BODY_SUB_ITEMS = [
  { href: '/body-metrics',      icon: Scale,  label: 'Pesagem',  desc: 'Peso e composição' },
  { href: '/body-measurements', icon: Ruler,  label: 'Medidas',  desc: 'Circunferências'   },
];

const SAUDE_SUB_ITEMS = [
  { href: '/diary',    icon: BookOpen,   label: 'Diário',               desc: 'Refeições e hábitos' },
  { href: '/history',  icon: TrendingUp, label: 'Evolução',             desc: 'Gráficos e progresso' },
  { href: '/marmitas', icon: ChefHat,    label: 'Marmitas IA',          desc: 'Planejamento semanal' },
];

function SubMenu({
  items,
  pathname,
  onClose,
}: {
  items: typeof SAUDE_SUB_ITEMS;
  pathname: string;
  onClose: () => void;
}) {
  return (
    <div className="absolute bottom-full mb-3 left-1/2 -translate-x-1/2 z-50 animate-slide-up">
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800/60 rounded-2xl shadow-xl shadow-black/10 dark:shadow-black/50 overflow-hidden min-w-[210px]">
        {items.map(({ href, icon: Icon, label, desc }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              onClick={onClose}
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
                  ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-600/25'
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
      {/* Arrow pointer */}
      <div className="flex justify-center">
        <div className="w-2.5 h-2.5 bg-white dark:bg-zinc-900 border-b border-r border-zinc-200/60 dark:border-zinc-800/60 rotate-45 -mt-[5px]" />
      </div>
    </div>
  );
}

export default function BottomNav() {
  const pathname = usePathname();
  const [saudeOpen, setSaudeOpen] = useState(false);
  const [bodyOpen,  setBodyOpen]  = useState(false);
  const saudeRef = useRef<HTMLDivElement>(null);
  const bodyRef  = useRef<HTMLDivElement>(null);

  const isSaudeActive = SAUDE_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'));
  const isBodyActive  = BODY_PATHS.includes(pathname);

  // Close both submenus whenever the route changes
  const [prevPathname, setPrevPathname] = useState(pathname);
  if (pathname !== prevPathname) {
    setPrevPathname(pathname);
    setSaudeOpen(false);
    setBodyOpen(false);
  }

  useEffect(() => {
    if (!saudeOpen && !bodyOpen) return;
    function onPointerDown(e: PointerEvent) {
      if (saudeRef.current && !saudeRef.current.contains(e.target as Node)) setSaudeOpen(false);
      if (bodyRef.current  && !bodyRef.current.contains(e.target as Node))  setBodyOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [saudeOpen, bodyOpen]);

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 bg-white/92 dark:bg-zinc-950/97 backdrop-blur-xl border-t border-zinc-200/50 dark:border-zinc-800/40"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="flex items-center max-w-2xl mx-auto h-[60px] px-2">

        {/* Início */}
        <Link
          href="/dashboard"
          className={cn(
            'relative flex flex-col items-center justify-center gap-1 flex-1 h-full transition-all duration-200 rounded-xl mx-0.5',
            pathname === '/dashboard'
              ? 'text-emerald-600 dark:text-emerald-400'
              : 'text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300'
          )}
        >
          {pathname === '/dashboard' && (
            <span className="absolute top-1.5 left-1/2 -translate-x-1/2 h-[3px] w-5 rounded-full bg-emerald-600 dark:bg-emerald-400" />
          )}
          <LayoutDashboard size={20} strokeWidth={pathname === '/dashboard' ? 2.25 : 1.75} className="transition-all duration-200" />
          <span className={cn('text-[10px] font-semibold tracking-tight transition-all duration-200', pathname === '/dashboard' ? 'opacity-100' : 'opacity-55')}>
            Início
          </span>
        </Link>

        {/* Saúde */}
        <div ref={saudeRef} className="relative flex-1 flex items-center justify-center h-full">
          {saudeOpen && (
            <SubMenu items={SAUDE_SUB_ITEMS} pathname={pathname} onClose={() => setSaudeOpen(false)} />
          )}
          <button
            onClick={() => { setSaudeOpen((v) => !v); setBodyOpen(false); }}
            className={cn(
              'relative flex flex-col items-center justify-center gap-1 w-full h-full transition-all duration-200 rounded-xl mx-0.5',
              isSaudeActive || saudeOpen
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300'
            )}
          >
            {(isSaudeActive || saudeOpen) && (
              <span className="absolute top-1.5 left-1/2 -translate-x-1/2 h-[3px] w-5 rounded-full bg-emerald-600 dark:bg-emerald-400" />
            )}
            <HeartPulse size={20} strokeWidth={isSaudeActive || saudeOpen ? 2.25 : 1.75} className="transition-all duration-200" />
            <span className={cn('text-[10px] font-semibold tracking-tight transition-all duration-200', isSaudeActive || saudeOpen ? 'opacity-100' : 'opacity-55')}>
              Saúde
            </span>
          </button>
        </div>

        {/* Corpo */}
        <div ref={bodyRef} className="relative flex-1 flex items-center justify-center h-full">
          {bodyOpen && (
            <SubMenu items={BODY_SUB_ITEMS} pathname={pathname} onClose={() => setBodyOpen(false)} />
          )}
          <button
            onClick={() => { setBodyOpen((v) => !v); setSaudeOpen(false); }}
            className={cn(
              'relative flex flex-col items-center justify-center gap-1 w-full h-full transition-all duration-200 rounded-xl mx-0.5',
              isBodyActive || bodyOpen
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300'
            )}
          >
            {(isBodyActive || bodyOpen) && (
              <span className="absolute top-1.5 left-1/2 -translate-x-1/2 h-[3px] w-5 rounded-full bg-emerald-600 dark:bg-emerald-400" />
            )}
            <Scale size={20} strokeWidth={isBodyActive || bodyOpen ? 2.25 : 1.75} className="transition-all duration-200" />
            <span className={cn('text-[10px] font-semibold tracking-tight transition-all duration-200', isBodyActive || bodyOpen ? 'opacity-100' : 'opacity-55')}>
              Corpo
            </span>
          </button>
        </div>

        {/* Perfil */}
        <Link
          href="/profile"
          className={cn(
            'relative flex flex-col items-center justify-center gap-1 flex-1 h-full transition-all duration-200 rounded-xl mx-0.5',
            pathname === '/profile'
              ? 'text-emerald-600 dark:text-emerald-400'
              : 'text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300'
          )}
        >
          {pathname === '/profile' && (
            <span className="absolute top-1.5 left-1/2 -translate-x-1/2 h-[3px] w-5 rounded-full bg-emerald-600 dark:bg-emerald-400" />
          )}
          <User size={20} strokeWidth={pathname === '/profile' ? 2.25 : 1.75} className="transition-all duration-200" />
          <span className={cn('text-[10px] font-semibold tracking-tight transition-all duration-200', pathname === '/profile' ? 'opacity-100' : 'opacity-55')}>
            Perfil
          </span>
        </Link>

      </div>
    </nav>
  );
}
