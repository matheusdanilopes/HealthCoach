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
  color: string;
  trackColor: string;
  textColor: string;
  emoji: string;
}

const MacroBar = memo(function MacroBar({ label, value, target, color, trackColor, textColor, emoji }: MacroBarProps) {
  const pct = target > 0 ? Math.min((value / target) * 100, 100) : 0;
  const isOver = value > target && target > 0;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-[13px] leading-none">{emoji}</span>
          <span className="text-[11px] font-semibold text-zinc-600 dark:text-zinc-400 flex-shrink-0">
            {label}
          </span>
        </div>
        <div className="flex items-baseline gap-0.5 tabular-nums flex-shrink-0">
          <span className={cn('text-[13px] font-bold', isOver ? 'text-red-500' : textColor)}>
            {Math.round(value)}g
          </span>
          <span className="text-[10px] text-zinc-300 dark:text-zinc-600 ml-0.5">/</span>
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

  return (
    <div className="bg-white dark:bg-zinc-900/80 border border-zinc-200/60 dark:border-zinc-800/60 rounded-2xl p-5 shadow-[0_2px_8px_0_rgb(0,0,0,0.06)] dark:shadow-none">
      <div className="flex items-center justify-between mb-4">
        <p className="label-xs">Macronutrientes</p>
        <div className="flex gap-0.5">
          <div className="h-[3px] w-6 rounded-full bg-emerald-500" />
          <div className="h-[3px] w-6 rounded-full bg-amber-400" />
          <div className="h-[3px] w-6 rounded-full bg-rose-400" />
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <MacroBar
          label="Proteína"
          value={protein}
          target={targets.protein}
          emoji="🥩"
          color="bg-emerald-500"
          trackColor="bg-emerald-100 dark:bg-emerald-900/25"
          textColor="text-emerald-600 dark:text-emerald-400"
        />
        <MacroBar
          label="Carboidrato"
          value={carbs}
          target={targets.carbs}
          emoji="🌾"
          color="bg-amber-400"
          trackColor="bg-amber-100 dark:bg-amber-900/25"
          textColor="text-amber-600 dark:text-amber-400"
        />
        <MacroBar
          label="Gordura"
          value={fat}
          target={targets.fat}
          emoji="🥑"
          color="bg-rose-400"
          trackColor="bg-rose-100 dark:bg-rose-900/25"
          textColor="text-rose-600 dark:text-rose-400"
        />
      </div>
    </div>
  );
});

export default MacroProgress;
