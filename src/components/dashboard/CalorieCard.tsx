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

  const r = 46;
  const circumference = 2 * Math.PI * r;

  const statusColor = useMemo(() => {
    if (isOver) return '#ef4444';
    if (pct > 85) return '#f59e0b';
    return '#2563eb';
  }, [isOver, pct]);

  const trackColor = useMemo(() => {
    if (isOver) return '#fef2f2';
    if (pct > 85) return '#fffbeb';
    return '#eff6ff';
  }, [isOver, pct]);

  return (
    <div className="bg-white dark:bg-zinc-900/80 border border-zinc-100 dark:border-zinc-800 rounded-2xl p-6 shadow-[0_1px_3px_0_rgb(0,0,0,0.04)] dark:shadow-none">
      <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-4">
        Calorias de hoje
      </p>

      <div className="flex items-center gap-5">
        {/* Left: numbers */}
        <div className="flex-1 min-w-0">
          <p className="text-4xl font-bold tabular-nums text-zinc-900 dark:text-zinc-100 leading-none">
            {consumed.toLocaleString('pt-BR')}
          </p>
          {/* Target — larger & more contrast */}
          <p className="text-sm font-semibold text-zinc-500 dark:text-zinc-400 mt-1.5">
            de{' '}
            <span className="text-zinc-700 dark:text-zinc-300">
              {target.toLocaleString('pt-BR')}
            </span>{' '}
            kcal
          </p>

          {/* Remaining / over chip */}
          <div className={cn(
            'inline-flex items-center gap-1.5 mt-3 px-3 py-1.5 rounded-lg text-sm font-semibold tabular-nums',
            remaining >= 0
              ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400'
              : 'bg-red-50 dark:bg-red-900/20 text-red-500'
          )}>
            <span className={cn(
              'h-1.5 w-1.5 rounded-full flex-shrink-0',
              remaining >= 0 ? 'bg-blue-500' : 'bg-red-500'
            )} />
            {remaining >= 0
              ? `${Math.abs(remaining).toLocaleString('pt-BR')} kcal restantes`
              : `${Math.abs(remaining).toLocaleString('pt-BR')} kcal excedidos`}
          </div>

          {burned > 0 && (
            <div className="inline-flex items-center gap-1.5 mt-2 px-3 py-1.5 rounded-lg bg-orange-50 dark:bg-orange-900/20 text-sm font-semibold tabular-nums text-orange-500">
              <span className="h-1.5 w-1.5 rounded-full bg-orange-500 flex-shrink-0" />
              +{burned.toLocaleString('pt-BR')} kcal treino
            </div>
          )}
        </div>

        {/* Right: circular progress */}
        <div className="relative flex-shrink-0">
          <svg width="108" height="108" className="-rotate-90">
            <circle
              cx="54" cy="54" r={r}
              fill="none"
              stroke={trackColor}
              strokeWidth="8"
              className="dark:opacity-[0.15]"
            />
            <circle
              cx="54" cy="54" r={r}
              fill="none"
              stroke={statusColor}
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={circumference - (pct / 100) * circumference}
              style={{ transition: 'stroke-dashoffset 0.7s cubic-bezier(0.4,0,0.2,1), stroke 0.3s ease' }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-xl font-bold tabular-nums text-zinc-900 dark:text-zinc-100 leading-none">
              {Math.round(pct)}%
            </span>
            <span className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-0.5">da meta</span>
          </div>
        </div>
      </div>
    </div>
  );
}
