'use client';

import { useState } from 'react';
import { Droplets } from 'lucide-react';
import { cn } from '@/lib/utils';

interface WaterTrackerProps {
  current: number;
  target: number;
  userId: string;
  onUpdate: (newTotal: number) => void;
}

const QUICK_AMOUNTS = [150, 250, 350, 500];

export default function WaterTracker({ current, target, userId, onUpdate }: WaterTrackerProps) {
  const [loading, setLoading] = useState<number | null>(null);
  const pct = target > 0 ? Math.min((current / target) * 100, 100) : 0;
  const isComplete = pct >= 100;

  async function addWater(ml: number) {
    setLoading(ml);
    await fetch('/api/water', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount_ml: ml }),
    });
    onUpdate(current + ml);
    setLoading(null);
  }

  const activeColor = isComplete ? 'text-emerald-500' : 'text-sky-600 dark:text-sky-400';

  return (
    <div className="bg-white dark:bg-zinc-900/80 border border-zinc-100 dark:border-zinc-800 rounded-2xl p-6 shadow-[0_1px_3px_0_rgb(0,0,0,0.04)] dark:shadow-none">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Droplets size={15} className={isComplete ? 'text-emerald-500' : 'text-sky-500'} />
          <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
            Hidratação
          </p>
        </div>
        <span className={cn('text-xs font-semibold tabular-nums', isComplete ? 'text-emerald-500' : 'text-zinc-400')}>
          {Math.round(pct)}%
        </span>
      </div>

      {/* Amount + target */}
      <div className="flex items-baseline gap-2 mb-3">
        <span className={cn('text-3xl font-bold tabular-nums leading-none', activeColor)}>
          {current >= 1000 ? `${(current / 1000).toFixed(1)}L` : `${current}ml`}
        </span>
        <span className="text-sm font-medium text-zinc-400 dark:text-zinc-500">
          de {(target / 1000).toFixed(1)}L
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-2 w-full rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden mb-4">
        <div
          className={cn(
            'h-full rounded-full transition-all duration-500',
            isComplete
              ? 'bg-emerald-500'
              : 'bg-gradient-to-r from-sky-400 to-sky-500'
          )}
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Unified segmented selector */}
      <div className="flex rounded-xl border border-zinc-200 dark:border-zinc-700/60 overflow-hidden bg-zinc-50 dark:bg-zinc-800/60 disabled:opacity-50">
        {QUICK_AMOUNTS.map((ml, i) => {
          const isLoading = loading === ml;
          const isLast = i === QUICK_AMOUNTS.length - 1;

          return (
            <button
              key={ml}
              onClick={() => addWater(ml)}
              disabled={loading !== null}
              className={cn(
                'flex-1 py-2.5 text-xs font-semibold tabular-nums transition-all duration-150',
                !isLast && 'border-r border-zinc-200 dark:border-zinc-700/60',
                isLoading
                  ? 'bg-sky-500 text-white'
                  : 'text-zinc-500 dark:text-zinc-400 hover:bg-sky-50 dark:hover:bg-sky-900/20 hover:text-sky-600 dark:hover:text-sky-400 active:scale-95',
                'disabled:pointer-events-none'
              )}
            >
              +{ml}ml
            </button>
          );
        })}
      </div>
    </div>
  );
}
