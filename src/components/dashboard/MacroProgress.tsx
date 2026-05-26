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

interface MacroRowProps {
  label: string;
  value: number;
  target: number;
  color: string;
  trackColor: string;
  accentText: string;
}

function MacroRow({ label, value, target, color, trackColor, accentText }: MacroRowProps) {
  const pct = target > 0 ? Math.min((value / target) * 100, 100) : 0;
  const isOver = value > target && target > 0;

  return (
    <div>
      {/* Label row */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          {label}
        </span>
        <span className={cn(
          'text-sm font-bold tabular-nums',
          isOver ? 'text-red-500' : accentText
        )}>
          {Math.round(value)}
          <span className="text-xs font-medium text-zinc-400 dark:text-zinc-500">
            {' '}/ {target}g
          </span>
        </span>
      </div>
      {/* Progress bar */}
      <div className={cn('h-2 w-full rounded-full overflow-hidden', trackColor)}>
        <div
          className={cn('h-full rounded-full transition-all duration-500', isOver ? 'bg-red-500' : color)}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export default function MacroProgress({ protein, carbs, fat, targetCalories }: MacroProgressProps) {
  const targets = getTargetMacros(targetCalories);

  return (
    <div className="bg-white dark:bg-zinc-900/80 border border-zinc-100 dark:border-zinc-800 rounded-2xl p-5 shadow-[0_1px_3px_0_rgb(0,0,0,0.04)] dark:shadow-none">
      <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-4">
        Macronutrientes
      </p>
      <div className="flex flex-col gap-4">
        <MacroRow
          label="Proteínas"
          value={protein}
          target={targets.protein}
          color="bg-blue-500"
          trackColor="bg-blue-100 dark:bg-blue-900/30"
          accentText="text-blue-600 dark:text-blue-400"
        />
        <MacroRow
          label="Carboidratos"
          value={carbs}
          target={targets.carbs}
          color="bg-amber-400"
          trackColor="bg-amber-100 dark:bg-amber-900/30"
          accentText="text-amber-600 dark:text-amber-400"
        />
        <MacroRow
          label="Gorduras"
          value={fat}
          target={targets.fat}
          color="bg-rose-400"
          trackColor="bg-rose-100 dark:bg-rose-900/30"
          accentText="text-rose-600 dark:text-rose-400"
        />
      </div>
    </div>
  );
}
