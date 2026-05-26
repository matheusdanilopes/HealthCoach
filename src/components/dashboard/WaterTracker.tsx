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

  const accentBar = isComplete
    ? 'bg-gradient-to-r from-emerald-500 to-emerald-400'
    : 'bg-gradient-to-r from-sky-500 to-sky-400';

  const amountColor = isComplete
    ? 'text-emerald-600 dark:text-emerald-400'
    : 'text-sky-600 dark:text-sky-400';

  return (
    <div className="bg-white dark:bg-zinc-900/80 border border-zinc-100 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-[0_1px_3px_0_rgb(0,0,0,0.04)] dark:shadow-none">
      {/* Status accent bar */}
      <div className={cn('h-[3px] w-full transition-all duration-500', accentBar)} />

      <div className="p-5">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Droplets size={14} className={isComplete ? 'text-emerald-500' : 'text-sky-500'} />
            <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
              Hidratação
            </p>
          </div>
          <span className={cn(
            'text-xs font-bold tabular-nums px-2 py-0.5 rounded-full',
            isComplete
              ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400'
              : 'bg-sky-50 dark:bg-sky-950/60 text-sky-600 dark:text-sky-400'
          )}>
            {Math.round(pct)}%
          </span>
        </div>

        {/* Amount */}
        <div className="flex items-baseline gap-1.5 mb-3">
          <span className={cn('text-3xl font-bold tabular-nums leading-none tracking-tight', amountColor)}>
            {current >= 1000 ? `${(current / 1000).toFixed(1)}L` : `${current}ml`}
          </span>
          <span className="text-sm font-medium text-zinc-400 dark:text-zinc-500">
            / {(target / 1000).toFixed(1)}L
          </span>
        </div>

        {/* Progress bar */}
        <div className="h-2.5 w-full rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden mb-4">
          <div
            className={cn(
              'h-full rounded-full transition-all duration-500',
              isComplete
                ? 'bg-gradient-to-r from-emerald-500 to-emerald-400'
                : 'bg-gradient-to-r from-sky-500 to-sky-400'
            )}
            style={{ width: `${pct}%` }}
          />
        </div>

        {/* Quick-add segmented control */}
        <div className="grid grid-cols-4 gap-1">
          {QUICK_AMOUNTS.map((ml) => {
            const isLoading = loading === ml;
            return (
              <button
                key={ml}
                onClick={() => addWater(ml)}
                disabled={loading !== null}
                className={cn(
                  'py-2 rounded-lg text-[11px] font-semibold tabular-nums transition-all duration-150',
                  isLoading
                    ? isComplete
                      ? 'bg-emerald-500 text-white'
                      : 'bg-sky-500 text-white'
                    : isComplete
                      ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/40'
                      : 'bg-sky-50 dark:bg-sky-950/40 text-sky-600 dark:text-sky-400 hover:bg-sky-100 dark:hover:bg-sky-900/40',
                  'disabled:pointer-events-none disabled:opacity-60 active:scale-95'
                )}
              >
                +{ml < 1000 ? `${ml}` : `${ml / 1000}k`}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
