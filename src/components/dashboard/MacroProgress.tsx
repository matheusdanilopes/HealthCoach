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
}

function MacroRow({ label, value, target, color, trackColor }: MacroRowProps) {
  const pct = target > 0 ? Math.min((value / target) * 100, 100) : 0;
  const isOver = value > target && target > 0;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between">
        <span className="text-xs text-zinc-500 dark:text-zinc-400">{label}</span>
        <span className={cn('text-xs font-semibold tabular-nums', isOver ? 'text-red-500' : 'text-zinc-700 dark:text-zinc-300')}>
          {Math.round(value)}
          <span className="text-zinc-400 dark:text-zinc-500 font-normal"> / {target}g</span>
        </span>
      </div>
      <div className={cn('h-1.5 w-full rounded-full overflow-hidden', trackColor)}>
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
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-sm dark:shadow-none">
      <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-4">Macronutrientes</p>
      <div className="flex flex-col gap-4">
        <MacroRow label="Proteínas"    value={protein} target={targets.protein} color="bg-blue-500"  trackColor="bg-blue-100 dark:bg-blue-900/30" />
        <MacroRow label="Carboidratos" value={carbs}   target={targets.carbs}   color="bg-amber-400" trackColor="bg-amber-100 dark:bg-amber-900/30" />
        <MacroRow label="Gorduras"     value={fat}     target={targets.fat}     color="bg-rose-400"  trackColor="bg-rose-100 dark:bg-rose-900/30" />
      </div>
    </div>
  );
}
