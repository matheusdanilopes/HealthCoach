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

  return (
    <div className="bg-white dark:bg-zinc-900/80 border border-zinc-100 dark:border-zinc-800 rounded-2xl p-5 shadow-[0_1px_3px_0_rgb(0,0,0,0.04)] dark:shadow-none">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Droplets
            size={15}
            className={isComplete ? 'text-emerald-500' : 'text-sky-500'}
          />
          <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
            Hidratação
          </p>
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className={cn(
            'text-base font-bold tabular-nums',
            isComplete ? 'text-emerald-500' : 'text-sky-600 dark:text-sky-400'
          )}>
            {current >= 1000 ? `${(current / 1000).toFixed(1)}L` : `${current}ml`}
          </span>
          <span className="text-xs text-zinc-400 dark:text-zinc-500">
            / {(target / 1000).toFixed(1)}L
          </span>
          <span className={cn(
            'text-xs font-semibold tabular-nums ml-1',
            isComplete ? 'text-emerald-500' : 'text-zinc-400'
          )}>
            {Math.round(pct)}%
          </span>
        </div>
      </div>

      <div className="h-1.5 w-full rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden mb-4">
        <div
          className={cn(
            'h-full rounded-full transition-all duration-500',
            isComplete ? 'bg-emerald-500' : 'bg-sky-500'
          )}
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="flex gap-2">
        {QUICK_AMOUNTS.map((ml) => (
          <button
            key={ml}
            onClick={() => addWater(ml)}
            disabled={loading !== null}
            className={cn(
              'flex-1 py-2 rounded-xl text-xs font-semibold tabular-nums transition-all duration-150 active:scale-95',
              loading === ml
                ? 'bg-sky-100 dark:bg-sky-900/30 text-sky-600 dark:text-sky-400 border border-sky-200 dark:border-sky-800'
                : 'bg-zinc-50 dark:bg-zinc-800/60 text-zinc-500 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700/60 hover:bg-sky-50 dark:hover:bg-sky-900/20 hover:text-sky-600 dark:hover:text-sky-400 hover:border-sky-200 dark:hover:border-sky-800',
              'disabled:opacity-50 disabled:pointer-events-none'
            )}
          >
            +{ml < 1000 ? `${ml}ml` : `${ml / 1000}L`}
          </button>
        ))}
      </div>
    </div>
  );
}
