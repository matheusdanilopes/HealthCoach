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

  const r = 48;
  const stroke = 7;
  const circumference = 2 * Math.PI * r;
  const size = (r + stroke) * 2 + 4;

  const { ringColor, badgeClass, badgeDot } = useMemo(() => {
    if (isOver) return {
      ringColor: '#ef4444',
      badgeClass: 'bg-red-50 dark:bg-red-950/50 text-red-600 dark:text-red-400 border border-red-100 dark:border-red-900/50',
      badgeDot: 'bg-red-500',
    };
    if (isWarning) return {
      ringColor: '#f59e0b',
      badgeClass: 'bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 border border-amber-100 dark:border-amber-900/50',
      badgeDot: 'bg-amber-500',
    };
    return {
      ringColor: '#2563eb',
      badgeClass: 'bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-900/40',
      badgeDot: 'bg-blue-500',
    };
  }, [isOver, isWarning]);

  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800/80 rounded-2xl p-5 shadow-[0_1px_3px_0_rgb(0,0,0,0.05)] dark:shadow-none">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500 mb-4">
        Calorias hoje
      </p>

      <div className="flex items-center gap-4">
        {/* Numbers */}
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-1.5">
            <span className="text-[42px] font-bold tabular-nums text-zinc-900 dark:text-zinc-100 leading-none tracking-tight">
              {consumed.toLocaleString('pt-BR')}
            </span>
          </div>
          <p className="text-[13px] text-zinc-400 dark:text-zinc-500 mt-1.5 font-medium">
            de{' '}
            <span className="text-zinc-600 dark:text-zinc-300 font-semibold">
              {target.toLocaleString('pt-BR')}
            </span>{' '}
            kcal
          </p>

          <div className="flex flex-wrap gap-2 mt-3.5">
            <span className={cn(
              'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold tabular-nums',
              badgeClass
            )}>
              <span className={cn('h-1.5 w-1.5 rounded-full flex-shrink-0', badgeDot)} />
              {remaining >= 0
                ? `${Math.abs(remaining).toLocaleString('pt-BR')} restantes`
                : `${Math.abs(remaining).toLocaleString('pt-BR')} excedidos`}
            </span>

            {burned > 0 && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-orange-50 dark:bg-orange-950/40 border border-orange-100 dark:border-orange-900/40 text-[11px] font-semibold tabular-nums text-orange-600 dark:text-orange-400">
                <span className="h-1.5 w-1.5 rounded-full bg-orange-500 flex-shrink-0" />
                +{burned.toLocaleString('pt-BR')} queimados
              </span>
            )}
          </div>
        </div>

        {/* Circular progress */}
        <div className="relative flex-shrink-0">
          <svg
            width={size}
            height={size}
            className="-rotate-90"
            style={{ overflow: 'visible' }}
          >
            {/* Track */}
            <circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={ringColor}
              strokeWidth={stroke}
              strokeOpacity={0.1}
            />
            {/* Fill */}
            <circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={ringColor}
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={circumference - (pct / 100) * circumference}
              style={{
                transition: 'stroke-dashoffset 0.8s cubic-bezier(0.16, 1, 0.3, 1), stroke 0.3s ease',
              }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5">
            <span className="text-xl font-bold tabular-nums text-zinc-900 dark:text-zinc-100 leading-none">
              {Math.round(pct)}%
            </span>
            <span className="text-[9px] font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
              meta
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
