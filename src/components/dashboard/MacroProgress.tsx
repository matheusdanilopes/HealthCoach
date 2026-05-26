import { cn } from '@/lib/utils';

interface MacroProgressProps {
  protein: number;
  carbs: number;
  fat: number;
  targetCalories: number;
}

function getTargetMacros(targetCalories: number) {
  return {
    protein: Math.round((targetCalories * 0.3) / 4),
    carbs:   Math.round((targetCalories * 0.4) / 4),
    fat:     Math.round((targetCalories * 0.3) / 9),
  };
}

interface MacroBarProps {
  label: string;
  value: number;
  target: number;
  color: string;
  trackColor: string;
  textColor: string;
}

function MacroBar({ label, value, target, color, trackColor, textColor }: MacroBarProps) {
  const pct = target > 0 ? Math.min((value / target) * 100, 100) : 0;
  const isOver = value > target && target > 0;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
          {label}
        </span>
        <div className="flex items-baseline gap-0.5 tabular-nums">
          <span className={cn('text-[13px] font-bold', isOver ? 'text-red-500' : textColor)}>
            {Math.round(value)}
          </span>
          <span className="text-[11px] text-zinc-300 dark:text-zinc-600">/</span>
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
}

export default function MacroProgress({ protein, carbs, fat, targetCalories }: MacroProgressProps) {
  const targets = getTargetMacros(targetCalories);

  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800/80 rounded-3xl p-8 shadow-[0_1px_3px_0_rgb(0,0,0,0.05)] dark:shadow-none">
      {/* Tricolor accent strip */}
      <div className="flex gap-0.5 mb-5">
        <div className="h-[3px] flex-1 rounded-full bg-blue-500" />
        <div className="h-[3px] flex-1 rounded-full bg-amber-400" />
        <div className="h-[3px] flex-1 rounded-full bg-rose-400" />
      </div>

      <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500 mb-4">
        Macros
      </p>

      <div className="flex flex-col gap-4">
        <MacroBar
          label="Prot."
          value={protein}
          target={targets.protein}
          color="bg-blue-500"
          trackColor="bg-blue-100 dark:bg-blue-900/25"
          textColor="text-blue-600 dark:text-blue-400"
        />
        <MacroBar
          label="Carb."
          value={carbs}
          target={targets.carbs}
          color="bg-amber-400"
          trackColor="bg-amber-100 dark:bg-amber-900/25"
          textColor="text-amber-600 dark:text-amber-400"
        />
        <MacroBar
          label="Gord."
          value={fat}
          target={targets.fat}
          color="bg-rose-400"
          trackColor="bg-rose-100 dark:bg-rose-900/25"
          textColor="text-rose-600 dark:text-rose-400"
        />
      </div>
    </div>
  );
}
