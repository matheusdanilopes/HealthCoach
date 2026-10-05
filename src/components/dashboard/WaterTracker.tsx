'use client';

import { memo, useState, useCallback, useEffect } from 'react';
import { Droplets } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { WaterLogEntry } from '@/types';

interface WaterTrackerProps {
  logs: WaterLogEntry[];
  target: number;
  date: string;
  onAdded: (ml: number, createdAt: string) => void;
  mealHydrationMl?: number;
}

const AMOUNTS = [200, 300, 500, 750];

function formatLiters(ml: number) {
  return `${(ml / 1000).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 2 })} L`;
}

function timeSince(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (diff < 1)  return 'há instantes';
  if (diff < 60) return `há ${diff}min`;
  const h = Math.floor(diff / 60);
  const m = diff % 60;
  return m > 0 ? `há ${h}h${m}min` : `há ${h}h`;
}

export default memo(function WaterTracker({ logs, target, date, onAdded, mealHydrationMl = 0 }: WaterTrackerProps) {
  const [loading, setLoading] = useState<number | null>(null);
  const [, setTick]           = useState(0);

  const directMl = logs.reduce((s, l) => s + l.amount_ml, 0);
  const current  = directMl + mealHydrationMl;
  const pct      = target > 0 ? Math.min((current / target) * 100, 100) : 0;
  const isDone   = pct >= 100;
  const lastLog  = logs.length > 0 ? logs[logs.length - 1] : undefined;

  // Re-render every minute so "há Xmin" stays fresh
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const addWater = useCallback(async (ml: number) => {
    setLoading(ml);
    const createdAt = new Date().toISOString();
    try {
      await fetch('/api/water', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ amount_ml: ml, log_date: date }),
      });
      onAdded(ml, createdAt);
    } finally {
      setLoading(null);
    }
  }, [date, onAdded]);

  return (
    <section
      aria-labelledby="water-title"
      className="rounded-3xl bg-white dark:bg-zinc-900/80 border border-zinc-200/60 dark:border-zinc-800/60 p-4 shadow-[0_1px_3px_0_rgb(0,0,0,0.04)] dark:shadow-none flex flex-col gap-3"
    >
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="h-9 w-9 flex-shrink-0 rounded-xl bg-sky-50 dark:bg-sky-950/40 flex items-center justify-center">
          <Droplets className="w-[18px] h-[18px] text-sky-500" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 id="water-title" className="text-[14px] font-semibold text-zinc-900 dark:text-zinc-100 leading-tight">Água</h2>
          <p className="text-[11px] text-zinc-400 dark:text-zinc-500 truncate">
            {isDone
              ? 'Meta atingida 🎉'
              : lastLog ? `Último ${timeSince(lastLog.created_at)}` : 'Nenhum registro ainda'}
            {mealHydrationMl > 0 && ` · +${mealHydrationMl} ml das refeições`}
          </p>
        </div>
        <p className="flex-shrink-0 text-[13px] tabular-nums text-zinc-400 dark:text-zinc-500">
          <span className={cn(
            'text-[16px] font-bold',
            isDone ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-900 dark:text-zinc-50'
          )}>
            {formatLiters(current)}
          </span>
          {' / '}{formatLiters(target)}
        </p>
      </div>

      {/* Progress */}
      <div
        className="h-2 w-full rounded-full bg-sky-50 dark:bg-sky-950/40 overflow-hidden"
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Progresso de hidratação"
      >
        <div
          className={cn('h-full rounded-full transition-all duration-700 ease-out', isDone ? 'bg-emerald-500' : 'bg-sky-400')}
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Quick add */}
      <div className="grid grid-cols-4 gap-2">
        {AMOUNTS.map((ml) => {
          const isLoading = loading === ml;
          return (
            <button
              key={ml}
              onClick={() => addWater(ml)}
              disabled={loading !== null}
              className={cn(
                'h-8 rounded-lg text-[12px] font-semibold tabular-nums transition-all duration-200 active:scale-95 disabled:pointer-events-none',
                isLoading
                  ? 'bg-sky-500 text-white'
                  : 'bg-zinc-50 dark:bg-zinc-800/70 text-zinc-600 dark:text-zinc-300 hover:bg-sky-50 hover:text-sky-700 dark:hover:bg-sky-950/40 dark:hover:text-sky-300',
                loading !== null && !isLoading && 'opacity-50'
              )}
            >
              {isLoading
                ? <span className="inline-block h-3 w-3 rounded-full border-2 border-current border-t-transparent animate-spin" />
                : `+${ml}`}
            </button>
          );
        })}
      </div>
    </section>
  );
});
