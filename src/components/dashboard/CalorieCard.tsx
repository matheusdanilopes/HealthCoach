'use client';

import { memo, useMemo } from 'react';
import { cn } from '@/lib/utils';

interface CalorieCardProps {
  consumed: number;
  burned: number;
  target: number;
}

const CalorieCard = memo(function CalorieCard({ consumed, burned, target }: CalorieCardProps) {
  const net = consumed - burned;
  const remaining = target - net;
  const pct = target > 0 ? Math.min((net / target) * 100, 100) : 0;
  const isOver = net > target;
  const isWarning = !isOver && pct > 85;

  const r = 44;
  const stroke = 6;
  const circumference = 2 * Math.PI * r;
  const size = (r + stroke) * 2 + 4;

  const { ringColor, badgeClass, textClass, barClass } = useMemo(() => {
    if (isOver) return {
      ringColor: '#ef4444',
      badgeClass: 'bg-red-50 dark:bg-red-950/50 text-red-600 dark:text-red-400 border border-red-100 dark:border-red-900/50',
      textClass: 'text-red-500 dark:text-red-400',
      barClass: 'bg-red-500',
    };
    if (isWarning) return {
      ringColor: '#f59e0b',
      badgeClass: 'bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 border border-amber-100 dark:border-amber-900/50',
      textClass: 'text-amber-500 dark:text-amber-400',
      barClass: 'bg-amber-400',
    };
    return {
      ringColor: '#059669',
      badgeClass: 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900/40',
      textClass: 'text-emerald-600 dark:text-emerald-400',
      barClass: 'bg-emerald-500',
    };
  }, [isOver, isWarning]);

  return (
    <div className="bg-white dark:bg-zinc-900/80 border border-zinc-200/60 dark:border-zinc-800/60 rounded-2xl p-5 shadow-[0_2px_8px_0_rgb(0,0,0,0.06)] dark:shadow-none">
      <p className="label-xs mb-4">Calorias hoje</p>

      <div className="flex items-center gap-4">
        {/* Numbers */}
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-1 mb-1">
            <span className="text-[40px] font-bold tabular-nums text-zinc-900 dark:text-zinc-100 leading-none tracking-tight">
              {net.toLocaleString('pt-BR')}
            </span>
            <span className="text-[14px] font-medium text-zinc-400 dark:text-zinc-500 mb-0.5">kcal</span>
          </div>
          <p className="text-[12px] text-zinc-400 dark:text-zinc-500 font-medium mb-1">
            meta{' '}
            <span className="text-zinc-600 dark:text-zinc-300 font-semibold tabular-nums">
              {target.toLocaleString('pt-BR')} kcal
            </span>
          </p>
          {burned > 0 && (
            <p className="text-[11px] text-zinc-400 dark:text-zinc-500 tabular-nums mb-3">
              {consumed.toLocaleString('pt-BR')} ingeridas · {burned.toLocaleString('pt-BR')} queimadas
            </p>
          )}

          <div className="flex flex-wrap gap-2 mt-3">
            <span className={cn(
              'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold tabular-nums',
              badgeClass
            )}>
              <span className={cn('h-1.5 w-1.5 rounded-full flex-shrink-0', barClass)} />
              {remaining >= 0
                ? `${Math.abs(remaining).toLocaleString('pt-BR')} restantes`
                : `${Math.abs(remaining).toLocaleString('pt-BR')} excedidos`}
            </span>
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
            {/* Background track */}
            <circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={ringColor}
              strokeWidth={stroke}
              strokeOpacity={0.1}
            />
            {/* Progress arc */}
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
                transition: 'stroke-dashoffset 0.9s cubic-bezier(0.16, 1, 0.3, 1), stroke 0.3s ease',
              }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className={cn('text-[19px] font-bold tabular-nums leading-none', textClass)}>
              {Math.round(pct)}%
            </span>
            <span className="text-[9px] font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mt-0.5">
              meta
            </span>
          </div>
        </div>
      </div>
    </div>
  );
});

export default CalorieCard;
