'use client';

import { useState } from 'react';
import { Droplets, Plus } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { todayISO } from '@/lib/utils';

interface WaterTrackerProps {
  current: number;
  target: number;
  userId: string;
  onUpdate: (newTotal: number) => void;
}

const QUICK_AMOUNTS = [150, 250, 350, 500];

export default function WaterTracker({ current, target, userId, onUpdate }: WaterTrackerProps) {
  const [loading, setLoading] = useState(false);
  const pct = target > 0 ? Math.min((current / target) * 100, 100) : 0;
  const cups = Math.floor(current / 250);

  async function addWater(ml: number) {
    setLoading(true);
    const supabase = createClient();
    await supabase.from('water_logs').insert({
      user_id: userId,
      date: todayISO(),
      amount_ml: ml,
    });
    onUpdate(current + ml);
    setLoading(false);
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Droplets size={16} className="text-sky-400" />
          <p className="text-sm font-medium text-zinc-400">Hidratação</p>
        </div>
        <span className="text-xs text-zinc-500">{cups} 🥛 copos</span>
      </div>

      <div className="flex items-end gap-3 mb-4">
        <span className="text-2xl font-bold text-sky-400">
          {current >= 1000 ? `${(current / 1000).toFixed(1)}L` : `${current}ml`}
        </span>
        <span className="text-sm text-zinc-500 mb-1">de {(target / 1000).toFixed(1)}L</span>
        <span className={`ml-auto text-sm font-medium ${pct >= 100 ? 'text-emerald-400' : 'text-zinc-400'}`}>
          {Math.round(pct)}%
        </span>
      </div>

      <div className="h-2.5 w-full rounded-full bg-zinc-800 overflow-hidden mb-4">
        <div
          className="h-full rounded-full bg-sky-500 transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="grid grid-cols-4 gap-2">
        {QUICK_AMOUNTS.map((ml) => (
          <button
            key={ml}
            onClick={() => addWater(ml)}
            disabled={loading}
            className="flex flex-col items-center gap-0.5 py-2 rounded-xl bg-zinc-800 hover:bg-sky-500/10 hover:border-sky-500/30 border border-transparent text-zinc-400 hover:text-sky-400 transition-all text-xs font-medium disabled:opacity-50"
          >
            <Plus size={12} />
            {ml}ml
          </button>
        ))}
      </div>
    </div>
  );
}
