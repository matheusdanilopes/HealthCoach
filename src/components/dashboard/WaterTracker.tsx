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

export default function WaterTracker({ current, target, onUpdate }: WaterTrackerProps) {
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

  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800/80 rounded-2xl p-6 shadow-[0_1px_3px_0_rgb(0,0,0,0.05)] dark:shadow-none">
      {/* Header */}
      <div className="flex items-center justify-between mb-3.5">
        <div className="flex items-center gap-2">
          <Droplets
            size={14}
            className={isComplete ? 'text-emerald-500' : 'text-sky-500'}
          />
          <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
            Hidratação
          </p>
        </div>
        <span className={cn(
          'text-[11px] font-bold tabular-nums px-2 py-0.5 rounded-full',
          isComplete
            ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400'
            : 'bg-sky-50 dark:bg-sky-950/40 text-sky-600 dark:text-sky-400'
        )}>
          {Math.round(pct)}%
        </span>
      </div>

      {/* Amount display */}
      <div className="flex items-baseline gap-1.5 mb-3">
        <span className={cn(
          'text-2xl font-bold tabular-nums leading-none tracking-tight',
          isComplete ? 'text-emerald-600 dark:text-emerald-400' : 'text-sky-600 dark:text-sky-400'
        )}>
          {current >= 1000 ? `${(current / 1000).toFixed(1)}L` : `${current}ml`}
        </span>
        <span className="text-sm text-zinc-400 dark:text-zinc-500">
          / {(target / 1000).toFixed(1)}L
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-2 w-full rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden mb-3.5">
        <div
          className={cn(
            'h-full rounded-full transition-all duration-700',
            isComplete
              ? 'bg-gradient-to-r from-emerald-500 to-emerald-400'
              : 'bg-gradient-to-r from-sky-500 to-sky-400'
          )}
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Quick-add buttons */}
      <div className="grid grid-cols-4 gap-1.5">
        {QUICK_AMOUNTS.map((ml) => {
          const isLoading = loading === ml;
          return (
            <button
              key={ml}
              onClick={() => addWater(ml)}
              disabled={loading !== null}
              className={cn(
                'py-2 rounded-lg text-[11px] font-semibold tabular-nums transition-all duration-150 active:scale-95',
                isLoading
                  ? isComplete ? 'bg-emerald-500 text-white' : 'bg-sky-500 text-white'
                  : isComplete
                    ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/30'
                    : 'bg-sky-50 dark:bg-sky-950/30 text-sky-600 dark:text-sky-400 hover:bg-sky-100 dark:hover:bg-sky-900/30',
                'disabled:pointer-events-none disabled:opacity-50'
              )}
            >
              +{ml}
            </button>
          );
        })}
      </div>
    </div>
  );
}
