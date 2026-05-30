'use client';

import Link from 'next/link';
import { BookOpen, TrendingUp, ChefHat, ChevronRight } from 'lucide-react';

const ITEMS = [
  {
    href: '/diary',
    icon: BookOpen,
    emoji: '📖',
    label: 'Diário',
    desc: 'Acompanhamento diário de alimentação e hábitos',
    color: 'bg-blue-50 dark:bg-blue-950/20 text-blue-600 dark:text-blue-400',
    ring: 'ring-blue-100 dark:ring-blue-900/40',
  },
  {
    href: '/history',
    icon: TrendingUp,
    emoji: '📈',
    label: 'Evolução',
    desc: 'Indicadores, gráficos e progresso ao longo do tempo',
    color: 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400',
    ring: 'ring-emerald-100 dark:ring-emerald-900/40',
  },
  {
    href: '/marmitas',
    icon: ChefHat,
    emoji: '🍱',
    label: 'Marmitas Inteligentes',
    desc: 'Gere sugestões de marmitas personalizadas com IA',
    color: 'bg-orange-50 dark:bg-orange-950/20 text-orange-600 dark:text-orange-400',
    ring: 'ring-orange-100 dark:ring-orange-900/40',
  },
];

export default function SaudeClient() {
  return (
    <div className="flex flex-col gap-4 pt-8 pb-6 animate-fade-in">
      <div>
        <h1 className="text-[22px] font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">
          Saúde
        </h1>
        <p className="text-[13px] text-zinc-400 dark:text-zinc-500 mt-0.5 font-medium">
          Sua central de acompanhamento
        </p>
      </div>

      <div className="flex flex-col gap-3 mt-1">
        {ITEMS.map(({ href, icon: Icon, emoji, label, desc, color, ring }) => (
          <Link
            key={href}
            href={href}
            className={`flex items-center gap-4 bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800/80 rounded-2xl p-4 shadow-[0_1px_3px_0_rgb(0,0,0,0.04)] dark:shadow-none ring-1 ${ring} hover:ring-2 active:scale-[0.99] transition-all duration-150`}
          >
            <div className={`h-12 w-12 rounded-2xl flex items-center justify-center flex-shrink-0 ${color} ring-1 ${ring}`}>
              <Icon size={22} strokeWidth={1.75} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[15px] font-semibold text-zinc-900 dark:text-zinc-100 leading-tight">
                {label}
              </p>
              <p className="text-[12px] text-zinc-400 dark:text-zinc-500 mt-0.5 leading-snug">
                {desc}
              </p>
            </div>
            <ChevronRight size={16} className="text-zinc-300 dark:text-zinc-600 flex-shrink-0" />
          </Link>
        ))}
      </div>
    </div>
  );
}
