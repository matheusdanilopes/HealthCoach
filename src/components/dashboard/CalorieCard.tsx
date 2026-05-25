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

  const circumference = 2 * Math.PI * 52;
  const strokeDashoffset = circumference - (pct / 100) * circumference;

  const isOver = net > target;

  const statusColor = useMemo(() => {
    if (isOver) return '#ef4444';
    if (pct > 85) return '#f59e0b';
    return '#2563eb';
  }, [isOver, pct]);

  return (
    <div className="bg-white border border-zinc-200 rounded-2xl p-5 shadow-sm">
      <p className="text-xs font-medium text-zinc-500 mb-4">Calorias de hoje</p>

      <div className="flex items-center gap-6">
        <div className="relative flex-shrink-0">
          <svg width="120" height="120" className="-rotate-90">
            <circle
              cx="60" cy="60" r="52"
              fill="none" stroke="#f4f4f5" strokeWidth="8"
            />
            <circle
              cx="60" cy="60" r="52"
              fill="none"
              stroke={statusColor}
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              style={{ transition: 'stroke-dashoffset 0.7s cubic-bezier(0.4,0,0.2,1), stroke 0.3s ease' }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-bold tabular-nums text-zinc-900">{Math.round(pct)}%</span>
            <span className="text-[11px] text-zinc-400">da meta</span>
          </div>
        </div>

        <div className="flex flex-col gap-3 flex-1 min-w-0">
          <div>
            <p className="text-xs text-zinc-400 mb-0.5">Consumido</p>
            <p className="text-2xl font-bold tabular-nums text-zinc-900 leading-none">
              {consumed.toLocaleString('pt-BR')}
            </p>
            <p className="text-xs text-zinc-400 mt-0.5">kcal</p>
          </div>
          <div className="h-px bg-zinc-100" />
          <div>
            <p className="text-xs text-zinc-400 mb-0.5">
              {remaining >= 0 ? 'Restante' : 'Excedido'}
            </p>
            <p className={cn('text-2xl font-bold tabular-nums leading-none', remaining >= 0 ? 'text-blue-600' : 'text-red-500')}>
              {Math.abs(remaining).toLocaleString('pt-BR')}
            </p>
            <p className="text-xs text-zinc-400 mt-0.5">kcal · meta: {target.toLocaleString('pt-BR')}</p>
          </div>
        </div>
      </div>

      {burned > 0 && (
        <div className="mt-4 pt-3 border-t border-zinc-100 flex items-center justify-between">
          <span className="text-xs text-zinc-400">Treino queimou</span>
          <span className="text-xs font-semibold text-orange-500 tabular-nums">+{burned.toLocaleString('pt-BR')} kcal</span>
        </div>
      )}
    </div>
  );
}
