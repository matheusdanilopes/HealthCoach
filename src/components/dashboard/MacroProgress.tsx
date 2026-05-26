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

interface MacroItemProps {
  label: string;
  shortLabel: string;
  value: number;
  target: number;
  color: string;
  bgColor: string;
  trackColor: string;
}

function MacroItem({ label, shortLabel, value, target, color, bgColor, trackColor }: MacroItemProps) {
  const pct = target > 0 ? Math.min((value / target) * 100, 100) : 0;
  const isOver = value > target && target > 0;

  return (
    <div className={cn('flex-1 rounded-xl p-3', bgColor)}>
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-[10px] uppercase tracking-wider text-zinc-400 dark:text-zinc-500 font-medium">
          {shortLabel}
        </span>
        <span className={cn(
          'text-xs font-semibold tabular-nums',
          isOver ? 'text-red-500' : 'text-zinc-600 dark:text-zinc-400'
        )}>
          {Math.round(value)}
          <span className="text-zinc-400 dark:text-zinc-600 font-normal">/{target}g</span>
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
    <div className="bg-white dark:bg-zinc-900/80 border border-zinc-100 dark:border-zinc-800 rounded-2xl p-5 shadow-[0_1px_3px_0_rgb(0,0,0,0.04)] dark:shadow-none">
      <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-3">
        Macronutrientes
      </p>
      <div className="flex gap-2">
        <MacroItem
          label="Proteínas"
          shortLabel="Prot"
          value={protein}
          target={targets.protein}
          color="bg-blue-500"
          bgColor="bg-blue-50 dark:bg-blue-900/20"
          trackColor="bg-blue-100 dark:bg-blue-900/40"
        />
        <MacroItem
          label="Carboidratos"
          shortLabel="Carbs"
          value={carbs}
          target={targets.carbs}
          color="bg-amber-400"
          bgColor="bg-amber-50 dark:bg-amber-900/20"
          trackColor="bg-amber-100 dark:bg-amber-900/40"
        />
        <MacroItem
          label="Gorduras"
          shortLabel="Gord"
          value={fat}
          target={targets.fat}
          color="bg-rose-400"
          bgColor="bg-rose-50 dark:bg-rose-900/20"
          trackColor="bg-rose-100 dark:bg-rose-900/40"
        />
      </div>
    </div>
  );
}
