'use client';

import { memo, useMemo } from 'react';
import { Flame, Utensils } from 'lucide-react';
import { cn } from '@/lib/utils';

const MACRO_SPLIT = { protein: 0.3, carbs: 0.4, fat: 0.3 };
const KCAL_PER_G  = { protein: 4,   carbs: 4,   fat: 9   };

interface DailySummaryCardProps {
  consumed: number;
  burned: number;
  target: number;
  protein: number;
  carbs: number;
  fat: number;
  tdee?: number | null;
  isToday: boolean;
}

// 270° gauge geometry
const SIZE   = 176;
const STROKE = 12;
const R      = (SIZE - STROKE) / 2;
const CIRC   = 2 * Math.PI * R;
const ARC    = CIRC * 0.75;

function fmt(n: number) {
  return Math.round(n).toLocaleString('pt-BR');
}

const SideStat = memo(function SideStat({
  icon: Icon,
  label,
  value,
  iconClass,
}: {
  icon: typeof Flame;
  label: string;
  value: number;
  iconClass: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1 min-w-0">
      <div className={cn('h-8 w-8 rounded-xl flex items-center justify-center', iconClass)}>
        <Icon className="w-4 h-4" />
      </div>
      <span className="text-[17px] font-bold tabular-nums text-zinc-900 dark:text-zinc-50 leading-none mt-1">
        {fmt(value)}
      </span>
      <span className="text-[11px] font-medium text-zinc-400 dark:text-zinc-500">{label}</span>
    </div>
  );
});

const MacroStat = memo(function MacroStat({
  label,
  value,
  target,
  barClass,
  trackClass,
}: {
  label: string;
  value: number;
  target: number;
  barClass: string;
  trackClass: string;
}) {
  const pct = target > 0 ? Math.min((value / target) * 100, 100) : 0;
  const isOver = target > 0 && value > target;
  return (
    <div className="flex flex-col gap-2 min-w-0">
      <span className="text-[12px] font-semibold text-zinc-600 dark:text-zinc-300 truncate">{label}</span>
      <div className={cn('h-1.5 w-full rounded-full overflow-hidden', trackClass)}>
        <div
          className={cn('h-full rounded-full transition-all duration-700', isOver ? 'bg-red-500' : barClass)}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-[11px] tabular-nums text-zinc-400 dark:text-zinc-500">
        <span className={cn('font-semibold', isOver ? 'text-red-500' : 'text-zinc-700 dark:text-zinc-200')}>
          {Math.round(value)}
        </span>
        {' / '}{target} g
      </span>
    </div>
  );
});

export default memo(function DailySummaryCard({
  consumed,
  burned,
  target,
  protein,
  carbs,
  fat,
  tdee,
  isToday,
}: DailySummaryCardProps) {
  const net       = consumed - burned;
  const remaining = target - net;
  const isOver    = remaining < 0;
  const pct       = target > 0 ? Math.min(net / target, 1) : 0;
  const isWarning = !isOver && pct > 0.85;

  const ringClass = isOver ? 'text-red-500' : isWarning ? 'text-amber-500' : 'text-emerald-500';

  const macroTargets = useMemo(() => ({
    protein: Math.round((target * MACRO_SPLIT.protein) / KCAL_PER_G.protein),
    carbs:   Math.round((target * MACRO_SPLIT.carbs)   / KCAL_PER_G.carbs),
    fat:     Math.round((target * MACRO_SPLIT.fat)     / KCAL_PER_G.fat),
  }), [target]);

  const deficit = tdee ? tdee - target : null;

  return (
    <section
      aria-label="Resumo do dia"
      className="relative overflow-hidden rounded-3xl border border-zinc-200/60 dark:border-zinc-800/60 bg-white dark:bg-zinc-900/80 shadow-[0_4px_24px_-8px_rgb(0,0,0,0.08)] dark:shadow-none"
    >
      {/* Soft accent glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 h-56 w-72 rounded-full bg-emerald-400/15 dark:bg-emerald-500/10 blur-3xl"
      />

      <div className="relative p-5 pb-4">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-[15px] font-bold text-zinc-900 dark:text-zinc-50 tracking-tight">
            {isToday ? 'Resumo de hoje' : 'Resumo do dia'}
          </h2>
          <span className="text-[11px] font-semibold tabular-nums text-zinc-400 dark:text-zinc-500">
            Meta {fmt(target)} kcal
          </span>
        </div>

        {/* Consumed · Gauge · Burned */}
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <SideStat
            icon={Utensils}
            label="ingeridas"
            value={consumed}
            iconClass="bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400"
          />

          <div className="relative" style={{ width: SIZE, height: SIZE }}>
            <svg width={SIZE} height={SIZE} className="rotate-[135deg]" aria-hidden>
              <circle
                cx={SIZE / 2} cy={SIZE / 2} r={R}
                fill="none"
                stroke="currentColor"
                strokeWidth={STROKE}
                strokeLinecap="round"
                strokeDasharray={`${ARC} ${CIRC}`}
                className="text-zinc-100 dark:text-zinc-800"
              />
              <circle
                cx={SIZE / 2} cy={SIZE / 2} r={R}
                fill="none"
                stroke="currentColor"
                strokeWidth={STROKE}
                strokeLinecap="round"
                strokeDasharray={`${ARC * Math.max(pct, 0)} ${CIRC}`}
                className={cn(ringClass, 'transition-[stroke-dasharray,color] duration-700 ease-out')}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span
                className={cn(
                  'text-[34px] font-bold tabular-nums leading-none tracking-tight',
                  isOver ? 'text-red-500' : 'text-zinc-900 dark:text-zinc-50'
                )}
              >
                {fmt(Math.abs(remaining))}
              </span>
              <span className="text-[12px] font-medium text-zinc-400 dark:text-zinc-500 mt-1">
                {isOver ? 'kcal excedidas' : 'kcal restantes'}
              </span>
            </div>
          </div>

          <SideStat
            icon={Flame}
            label="queimadas"
            value={burned}
            iconClass="bg-orange-50 dark:bg-orange-950/40 text-orange-500 dark:text-orange-400"
          />
        </div>

        {/* Macros */}
        <div className="grid grid-cols-3 gap-4 mt-1">
          <MacroStat
            label="Carboidratos"
            value={carbs}
            target={macroTargets.carbs}
            barClass="bg-amber-400"
            trackClass="bg-amber-100 dark:bg-amber-900/25"
          />
          <MacroStat
            label="Proteínas"
            value={protein}
            target={macroTargets.protein}
            barClass="bg-emerald-500"
            trackClass="bg-emerald-100 dark:bg-emerald-900/25"
          />
          <MacroStat
            label="Gorduras"
            value={fat}
            target={macroTargets.fat}
            barClass="bg-rose-400"
            trackClass="bg-rose-100 dark:bg-rose-900/25"
          />
        </div>
      </div>

      {/* Energy footer */}
      {tdee ? (
        <div className="relative flex items-center justify-between gap-3 px-5 py-3 border-t border-zinc-100 dark:border-zinc-800/80 bg-zinc-50/60 dark:bg-zinc-900/40">
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
            Gasto diário <span className="font-semibold tabular-nums text-zinc-700 dark:text-zinc-200">{fmt(tdee)} kcal</span>
          </p>
          {deficit !== null && deficit !== 0 && (
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
              {deficit > 0 ? 'Déficit' : 'Superávit'}{' '}
              <span className={cn(
                'font-semibold tabular-nums',
                deficit > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'
              )}>
                {fmt(Math.abs(deficit))} kcal
              </span>
            </p>
          )}
        </div>
      ) : null}
    </section>
  );
});
