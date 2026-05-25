'use client';

import { useState } from 'react';
import { Droplets, Plus } from 'lucide-react';
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
  const cups = Math.floor(current / 250);
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
    <div className="bg-white border border-zinc-200 rounded-2xl p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Droplets size={15} className={isComplete ? 'text-emerald-500' : 'text-sky-500'} />
          <p className="text-xs font-medium text-zinc-500">Hidratação</p>
        </div>
        <span className="text-xs text-zinc-400">{cups} copos</span>
      </div>

      <div className="flex items-end gap-2 mb-3">
        <span className={cn('text-2xl font-bold tabular-nums', isComplete ? 'text-emerald-500' : 'text-sky-600')}>
          {current >= 1000 ? `${(current / 1000).toFixed(1)}L` : `${current}ml`}
        </span>
        <span className="text-sm text-zinc-400 mb-0.5">de {(target / 1000).toFixed(1)}L</span>
        <span className={cn('ml-auto text-sm font-semibold tabular-nums mb-0.5', isComplete ? 'text-emerald-500' : 'text-zinc-500')}>
          {Math.round(pct)}%
        </span>
      </div>

      <div className="h-2 w-full rounded-full bg-zinc-100 overflow-hidden mb-4">
        <div
          className={cn(
            'h-full rounded-full transition-all duration-500',
            isComplete ? 'bg-emerald-500' : 'bg-sky-500'
          )}
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="grid grid-cols-4 gap-2">
        {QUICK_AMOUNTS.map((ml) => (
          <button
            key={ml}
            onClick={() => addWater(ml)}
            disabled={loading !== null}
            className={cn(
              'flex flex-col items-center gap-0.5 py-2.5 rounded-xl border text-xs font-medium transition-all duration-150 active:scale-95',
              loading === ml
                ? 'bg-sky-50 border-sky-200 text-sky-600'
                : 'bg-zinc-50 border-zinc-200 text-zinc-500 hover:bg-sky-50 hover:border-sky-200 hover:text-sky-600',
              'disabled:opacity-60 disabled:pointer-events-none'
            )}
          >
            <Plus size={11} />
            {ml}ml
          </button>
        ))}
      </div>
    </div>
  );
}
