'use client';

import Link from 'next/link';
import { BookOpen, BarChart2, ChefHat, ChevronRight, Droplets, Dumbbell, Scale } from 'lucide-react';

const ITEMS = [
  {
    href: '/diary',
    icon: BookOpen,
    label: 'Diário',
    desc: 'Registre refeições, hidratação e treinos do dia',
    highlights: ['Refeições', 'Água', 'Treinos'],
    color: 'bg-blue-50 dark:bg-blue-950/20 text-blue-600 dark:text-blue-400',
    ring: 'ring-blue-100 dark:ring-blue-900/40',
    highlightColor: 'bg-blue-50 dark:bg-blue-950/30 text-blue-500 dark:text-blue-400',
  },
  {
    href: '/history',
    icon: BarChart2,
    label: 'Evolução',
    desc: 'Painel analítico com peso, composição, hidratação e conquistas',
    highlights: ['Peso', 'Composição', 'Hidratação', 'Conquistas'],
    color: 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400',
    ring: 'ring-emerald-100 dark:ring-emerald-900/40',
    highlightColor: 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400',
  },
  {
    href: '/marmitas',
    icon: ChefHat,
    label: 'Marmitas Inteligentes',
    desc: 'Gere sugestões de marmitas personalizadas com IA',
    highlights: ['Gerado por IA', 'Metas calóricas'],
    color: 'bg-orange-50 dark:bg-orange-950/20 text-orange-600 dark:text-orange-400',
    ring: 'ring-orange-100 dark:ring-orange-900/40',
    highlightColor: 'bg-orange-50 dark:bg-orange-950/30 text-orange-500 dark:text-orange-400',
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
        {ITEMS.map(({ href, icon: Icon, label, desc, highlights, color, ring, highlightColor }) => (
          <Link
            key={href}
            href={href}
            className={`flex items-start gap-4 bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800/80 rounded-2xl p-4 shadow-[0_1px_3px_0_rgb(0,0,0,0.04)] dark:shadow-none ring-1 ${ring} hover:ring-2 active:scale-[0.99] transition-all duration-150`}
          >
            <div className={`h-12 w-12 rounded-2xl flex items-center justify-center flex-shrink-0 ${color} ring-1 ${ring} mt-0.5`}>
              <Icon size={22} strokeWidth={1.75} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[15px] font-semibold text-zinc-900 dark:text-zinc-100 leading-tight">
                {label}
              </p>
              <p className="text-[12px] text-zinc-400 dark:text-zinc-500 mt-0.5 leading-snug">
                {desc}
              </p>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {highlights.map((h) => (
                  <span key={h} className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${highlightColor}`}>
                    {h}
                  </span>
                ))}
              </div>
            </div>
            <ChevronRight size={16} className="text-zinc-300 dark:text-zinc-600 flex-shrink-0 mt-1" />
          </Link>
        ))}
      </div>
    </div>
  );
}
