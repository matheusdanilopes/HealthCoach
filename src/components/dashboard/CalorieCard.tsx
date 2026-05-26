'use client';

import { useMemo } from 'react';
import { cn } from '@/lib/utils';

interface CalorieCardProps {
  consumed: number;
  burned: number;
  target: number;
}

export default function CalorieCard({ consumed, burned, target }: CalorieCardProps) {
  const net = consumed - burned;
  const remaining = target - net;
  const pct = target > 0 ? Math.min((net / target) * 100, 100) : 0;
  const isOver = net > target;

  const circumference = 2 * Math.PI * 48;
  const strokeDashoffset = circumference - (pct / 100) * circumference;

  const statusColor = useMemo(() => {
    if (isOver) return '#ef4444';
    if (pct > 85) return '#f59e0b';
    return '#2563eb';
  }, [isOver, pct]);

  const statusColorLight = useMemo(() => {
    if (isOver) return '#fef2f2';
    if (pct > 85) return '#fffbeb';
    return '#eff6ff';
  }, [isOver, pct]);

  return (
    <div className="bg-white dark:bg-zinc-900/80 border border-zinc-100 dark:border-zinc-800 rounded-2xl p-5 shadow-[0_1px_3px_0_rgb(0,0,0,0.04)] dark:shadow-none">
      <div className="flex items-start justify-between mb-5">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-1">
            Calorias
          </p>
          <p className="text-3xl font-bold tabular-nums text-zinc-900 dark:text-zinc-100 leading-none">
            {consumed.toLocaleString('pt-BR')}
          </p>
          <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">
            de {target.toLocaleString('pt-BR')} kcal
          </p>
        </div>

        <div className="relative flex-shrink-0">
          <svg width="88" height="88" className="-rotate-90">
            <circle
              cx="44" cy="44" r="36"
              fill="none"
              stroke={statusColorLight}
              strokeWidth="7"
              className="dark:opacity-20"
            />
            <circle
              cx="44" cy="44" r="36"
              fill="none"
              stroke={statusColor}
              strokeWidth="7"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={circumference - (pct / 100) * circumference}
              style={{ transition: 'stroke-dashoffset 0.7s cubic-bezier(0.4,0,0.2,1), stroke 0.3s ease' }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-lg font-bold tabular-nums text-zinc-900 dark:text-zinc-100 leading-none">
              {Math.round(pct)}%
            </span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className={cn(
          'flex-1 rounded-xl p-3',
          remaining >= 0
            ? 'bg-blue-50 dark:bg-blue-900/20'
            : 'bg-red-50 dark:bg-red-900/20'
        )}>
          <p className="text-[10px] uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-0.5">
            {remaining >= 0 ? 'Restante' : 'Excedido'}
          </p>
          <p className={cn(
            'text-base font-bold tabular-nums leading-none',
            remaining >= 0 ? 'text-blue-600 dark:text-blue-400' : 'text-red-500'
          )}>
            {Math.abs(remaining).toLocaleString('pt-BR')}
            <span className="text-xs font-normal ml-1 text-zinc-400">kcal</span>
          </p>
        </div>

        {burned > 0 && (
          <div className="flex-1 rounded-xl p-3 bg-orange-50 dark:bg-orange-900/20">
            <p className="text-[10px] uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-0.5">Treino</p>
            <p className="text-base font-bold tabular-nums text-orange-500 leading-none">
              +{burned.toLocaleString('pt-BR')}
              <span className="text-xs font-normal ml-1 text-zinc-400">kcal</span>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
