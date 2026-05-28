import { memo, useMemo } from 'react';
import { cn } from '@/lib/utils';

const MACRO_SPLIT = { protein: 0.3, carbs: 0.4, fat: 0.3 };
const KCAL_PER_G  = { protein: 4,   carbs: 4,   fat: 9   };

interface MacroProgressProps {
  protein: number;
  carbs: number;
  fat: number;
  targetCalories: number;
}

function getTargetMacros(targetCalories: number) {
  return {
    protein: Math.round((targetCalories * MACRO_SPLIT.protein) / KCAL_PER_G.protein),
    carbs:   Math.round((targetCalories * MACRO_SPLIT.carbs)   / KCAL_PER_G.carbs),
    fat:     Math.round((targetCalories * MACRO_SPLIT.fat)     / KCAL_PER_G.fat),
  };
}

interface MacroBarProps {
  label: string;
  value: number;
  target: number;
  splitPct: number;
  kcalPerG: number;
  color: string;
  trackColor: string;
  textColor: string;
}

const MacroBar = memo(function MacroBar({ label, value, target, splitPct, kcalPerG, color, trackColor, textColor }: MacroBarProps) {
  const pct = target > 0 ? Math.min((value / target) * 100, 100) : 0;
  const isOver = value > target && target > 0;
  const kcalConsumed = Math.round(value * kcalPerG);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        {/* Label + split percentage origin */}
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider flex-shrink-0">
            {label}
          </span>
          <span className="text-[10px] font-medium text-zinc-300 dark:text-zinc-600 flex-shrink-0">
            {splitPct}% das kcal
          </span>
        </div>

        {/* Consumed grams + kcal equivalent / target grams */}
        <div className="flex items-baseline gap-0.5 tabular-nums flex-shrink-0">
          <span className={cn('text-[13px] font-bold', isOver ? 'text-red-500' : textColor)}>
            {Math.round(value)}g
          </span>
          <span className="text-[10px] text-zinc-300 dark:text-zinc-600 mx-0.5">·</span>
          <span className={cn('text-[11px] font-medium', isOver ? 'text-red-400' : 'text-zinc-400 dark:text-zinc-500')}>
            {kcalConsumed} kcal
          </span>
          <span className="text-[11px] text-zinc-300 dark:text-zinc-600 mx-0.5">/</span>
          <span className="text-[11px] text-zinc-400 dark:text-zinc-500">{target}g</span>
        </div>
      </div>

      <div className={cn('h-1.5 w-full rounded-full overflow-hidden', trackColor)}>
        <div
          className={cn('h-full rounded-full transition-all duration-700', isOver ? 'bg-red-500' : color)}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
});

const MacroProgress = memo(function MacroProgress({ protein, carbs, fat, targetCalories }: MacroProgressProps) {
  const targets = useMemo(() => getTargetMacros(targetCalories), [targetCalories]);

  const totalKcalFromMacros =
    Math.round(protein * KCAL_PER_G.protein) +
    Math.round(carbs   * KCAL_PER_G.carbs)   +
    Math.round(fat     * KCAL_PER_G.fat);

  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800/80 rounded-2xl p-5 shadow-[0_1px_3px_0_rgb(0,0,0,0.05)] dark:shadow-none">
      <div className="flex gap-0.5 mb-4">
        <div className="h-[3px] flex-1 rounded-full bg-emerald-500" />
        <div className="h-[3px] flex-1 rounded-full bg-amber-400" />
        <div className="h-[3px] flex-1 rounded-full bg-rose-400" />
      </div>

      <div className="flex items-baseline justify-between mb-4">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
          Macros
        </p>
        <p className="text-[10px] text-zinc-300 dark:text-zinc-600 tabular-nums">
          {totalKcalFromMacros.toLocaleString('pt-BR')} kcal de macros
        </p>
      </div>

      <div className="flex flex-col gap-4">
        <MacroBar
          label="Prot."
          value={protein}
          target={targets.protein}
          splitPct={30}
          kcalPerG={KCAL_PER_G.protein}
          color="bg-emerald-500"
          trackColor="bg-emerald-100 dark:bg-emerald-900/25"
          textColor="text-emerald-600 dark:text-emerald-400"
        />
        <MacroBar
          label="Carb."
          value={carbs}
          target={targets.carbs}
          splitPct={40}
          kcalPerG={KCAL_PER_G.carbs}
          color="bg-amber-400"
          trackColor="bg-amber-100 dark:bg-amber-900/25"
          textColor="text-amber-600 dark:text-amber-400"
        />
        <MacroBar
          label="Gord."
          value={fat}
          target={targets.fat}
          splitPct={30}
          kcalPerG={KCAL_PER_G.fat}
          color="bg-rose-400"
          trackColor="bg-rose-100 dark:bg-rose-900/25"
          textColor="text-rose-600 dark:text-rose-400"
        />
      </div>
    </div>
  );
});

export default MacroProgress;
