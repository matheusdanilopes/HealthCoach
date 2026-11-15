'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, HeartPulse, Scale, User, Ruler, BookOpen, TrendingUp, ChefHat, Brain, Dumbbell } from 'lucide-react';
import { cn } from '@/lib/utils';
import { COACH_NAME } from '@/lib/coach-persona';
import CoachAvatar from '@/components/chat/CoachAvatar';

const BODY_PATHS = ['/body-metrics', '/body-measurements', '/treinos'];
const SAUDE_PATHS = ['/diary', '/history', '/marmitas', '/coach'];
const NINA_PATH = '/nina';

const BODY_SUB_ITEMS = [
  { href: '/body-metrics',      icon: Scale,  label: 'Pesagem',  desc: 'Peso e composição' },
  { href: '/body-measurements', icon: Ruler,  label: 'Medidas',  desc: 'Circunferências'   },
  { href: '/treinos',           icon: Dumbbell, label: 'Treinos IA', desc: 'Plano semanal'   },
];

const SAUDE_SUB_ITEMS = [
  { href: '/diary',    icon: BookOpen,   label: 'Diário',               desc: 'Refeições e hábitos' },
  { href: '/history',  icon: TrendingUp, label: 'Evolução',             desc: 'Gráficos e progresso' },
  { href: '/marmitas', icon: ChefHat,    label: 'Marmitas IA',          desc: 'Planejamento semanal' },
  { href: '/coach',    icon: Brain,      label: 'Análise Nina',         desc: 'Análise comportamental' },
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
      <div className="submenu-stagger bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800/60 rounded-2xl shadow-xl shadow-black/10 dark:shadow-black/50 overflow-hidden min-w-[210px]">
        {items.map(({ href, icon: Icon, label, desc }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              onClick={onClose}
              className={cn(
                'flex items-center gap-3 px-4 py-3 transition-[background-color,transform] duration-150 active:scale-[0.98]',
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

/** Conteúdo de uma aba comum: indicador, ícone e rótulo. */
function TabContent({ icon: Icon, label, active }: { icon: typeof Scale; label: string; active: boolean }) {
  return (
    <>
      {active && (
        <span className="nav-indicator absolute top-1.5 left-1/2 -translate-x-1/2 h-[3px] w-5 rounded-full bg-emerald-600 dark:bg-emerald-400" />
      )}
      <Icon size={20} strokeWidth={active ? 2.25 : 1.75} className={cn('transition-all duration-200', active && 'nav-icon-active')} />
      <span className={cn('text-[10px] font-semibold tracking-tight transition-all duration-200', active ? 'opacity-100' : 'opacity-55')}>
        {label}
      </span>
    </>
  );
}

const tabClass = (active: boolean) => cn(
  'relative flex flex-col items-center justify-center gap-1 w-full h-full transition-all duration-200 rounded-xl active:scale-90',
  active
    ? 'text-emerald-600 dark:text-emerald-400'
    : 'text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300'
);

/** Botão central, elevado acima da barra, que abre o chat com a Nina. */
function NinaTab({ active }: { active: boolean }) {
  return (
    <Link
      href={NINA_PATH}
      aria-label={`Conversar com a ${COACH_NAME}`}
      aria-current={active ? 'page' : undefined}
      className="group relative flex flex-col items-center justify-end w-full h-full pb-[7px] outline-none"
    >
      <span className="absolute left-1/2 -translate-x-1/2 -top-[22px] h-[60px] w-[60px]">
        {/* Halo que "respira" — chama atenção sem pedir */}
        <span
          aria-hidden
          className={cn(
            'nina-nav-halo absolute inset-0 rounded-full bg-emerald-400/35 dark:bg-emerald-400/25',
            active && 'opacity-0'
          )}
        />
        {/* Anel em gradiente: gira quando a Nina está aberta */}
        <span
          aria-hidden
          className={cn(
            'absolute inset-0 rounded-full p-[3px] transition-[box-shadow,transform] duration-300',
            'bg-[conic-gradient(from_0deg,#34d399,#059669,#a7f3d0,#10b981,#34d399)]',
            'shadow-lg shadow-emerald-600/30 dark:shadow-emerald-500/20',
            'group-hover:-translate-y-0.5 group-active:scale-90',
            active ? 'nina-ring shadow-emerald-500/50' : ''
          )}
        />
        <span
          className={cn(
            'absolute inset-[3px] rounded-full bg-white dark:bg-zinc-950 p-[2px] transition-transform duration-300',
            'group-hover:-translate-y-0.5 group-active:scale-90',
            active && 'nina-nav-pop'
          )}
        >
          <CoachAvatar size={50} className="h-full w-full" />
        </span>
      </span>
      <span
        className={cn(
          'text-[10px] font-semibold tracking-tight transition-all duration-200',
          active ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-500 dark:text-zinc-400'
        )}
      >
        {COACH_NAME}
      </span>
    </Link>
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
  const isNinaActive  = pathname === NINA_PATH;

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
        <div className="flex-1 h-full px-0.5">
          <Link href="/dashboard" className={tabClass(pathname === '/dashboard')}>
            <TabContent icon={LayoutDashboard} label="Início" active={pathname === '/dashboard'} />
          </Link>
        </div>

        {/* Saúde */}
        <div ref={saudeRef} className="relative flex-1 flex items-center justify-center h-full px-0.5">
          {saudeOpen && (
            <SubMenu items={SAUDE_SUB_ITEMS} pathname={pathname} onClose={() => setSaudeOpen(false)} />
          )}
          <button
            onClick={() => { setSaudeOpen((v) => !v); setBodyOpen(false); }}
            aria-expanded={saudeOpen}
            className={tabClass(isSaudeActive || saudeOpen)}
          >
            <TabContent icon={HeartPulse} label="Saúde" active={isSaudeActive || saudeOpen} />
          </button>
        </div>

        {/* Nina (centro) */}
        <div className="relative flex-1 h-full">
          <NinaTab active={isNinaActive} />
        </div>

        {/* Corpo */}
        <div ref={bodyRef} className="relative flex-1 flex items-center justify-center h-full px-0.5">
          {bodyOpen && (
            <SubMenu items={BODY_SUB_ITEMS} pathname={pathname} onClose={() => setBodyOpen(false)} />
          )}
          <button
            onClick={() => { setBodyOpen((v) => !v); setSaudeOpen(false); }}
            aria-expanded={bodyOpen}
            className={tabClass(isBodyActive || bodyOpen)}
          >
            <TabContent icon={Scale} label="Corpo" active={isBodyActive || bodyOpen} />
          </button>
        </div>

        {/* Perfil */}
        <div className="flex-1 h-full px-0.5">
          <Link href="/profile" className={tabClass(pathname === '/profile')}>
            <TabContent icon={User} label="Perfil" active={pathname === '/profile'} />
          </Link>
        </div>

      </div>
    </nav>
  );
}
