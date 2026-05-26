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
  const isWarning = !isOver && pct > 85;

  const r = 52;
  const circumference = 2 * Math.PI * r;

  const statusColor = useMemo(() => {
    if (isOver)    return '#ef4444';
    if (isWarning) return '#f59e0b';
    return '#2563eb';
  }, [isOver, isWarning]);

  const accentBar = isOver
    ? 'bg-gradient-to-r from-red-500 to-red-400'
    : isWarning
      ? 'bg-gradient-to-r from-amber-400 to-amber-300'
      : 'bg-gradient-to-r from-blue-600 to-blue-400';

  return (
    <div className="bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-2.5 shadow-[0_1px_3px_0_rgb(0,0,0,0.06)] dark:shadow-none">
      {/* Inner bordered content area */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-700/60 rounded-xl overflow-hidden">
        {/* Status accent bar */}
        <div className={cn('h-[3px] w-full', accentBar)} />

        <div className="p-5">
          <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-5">
            Calorias de hoje
          </p>

          <div className="flex items-center gap-4">
            {/* Left: numbers */}
            <div className="flex-1 min-w-0">
              <p className="text-5xl font-bold tabular-nums text-zinc-900 dark:text-zinc-100 leading-none tracking-tight">
                {consumed.toLocaleString('pt-BR')}
              </p>
              <p className="text-[13px] text-zinc-400 dark:text-zinc-500 mt-2 font-medium">
                de{' '}
                <span className="text-zinc-600 dark:text-zinc-300 font-semibold">
                  {target.toLocaleString('pt-BR')}
                </span>{' '}
                kcal
              </p>

              <div className="flex flex-col gap-1.5 mt-4">
                <div className={cn(
                  'inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-semibold tabular-nums w-fit',
                  remaining >= 0
                    ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-400 border border-blue-100 dark:border-blue-900/50'
                    : 'bg-red-50 dark:bg-red-950/60 text-red-600 dark:text-red-400 border border-red-100 dark:border-red-900/50'
                )}>
                  <span className={cn(
                    'h-1.5 w-1.5 rounded-full flex-shrink-0',
                    remaining >= 0 ? 'bg-blue-500' : 'bg-red-500'
                  )} />
                  {remaining >= 0
                    ? `${Math.abs(remaining).toLocaleString('pt-BR')} restantes`
                    : `${Math.abs(remaining).toLocaleString('pt-BR')} excedidos`}
                </div>

                {burned > 0 && (
                  <div className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-orange-50 dark:bg-orange-950/60 border border-orange-100 dark:border-orange-900/50 text-xs font-semibold tabular-nums text-orange-600 dark:text-orange-400 w-fit">
                    <span className="h-1.5 w-1.5 rounded-full bg-orange-500 flex-shrink-0" />
                    +{burned.toLocaleString('pt-BR')} queimados
                  </div>
                )}
              </div>
            </div>

            {/* Right: circular progress */}
            <div className="relative flex-shrink-0">
              <svg width="120" height="120" className="-rotate-90">
                <circle
                  cx="60" cy="60" r={r}
                  fill="none"
                  stroke={statusColor}
                  strokeWidth="9"
                  strokeOpacity="0.12"
                />
                <circle
                  cx="60" cy="60" r={r}
                  fill="none"
                  stroke={statusColor}
                  strokeWidth="9"
                  strokeLinecap="round"
                  strokeDasharray={circumference}
                  strokeDashoffset={circumference - (pct / 100) * circumference}
                  style={{ transition: 'stroke-dashoffset 0.7s cubic-bezier(0.4,0,0.2,1), stroke 0.3s ease' }}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5">
                <span className="text-2xl font-bold tabular-nums text-zinc-900 dark:text-zinc-100 leading-none">
                  {Math.round(pct)}%
                </span>
                <span className="text-[10px] font-medium text-zinc-400 dark:text-zinc-500">da meta</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
