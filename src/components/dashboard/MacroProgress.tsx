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
  shortLabel: string;
  value: number;
  target: number;
  color: string;
  barColor: string;
  trackColor: string;
  dotColor: string;
  accentText: string;
}

function MacroRow({ label, shortLabel, value, target, barColor, trackColor, dotColor, accentText }: MacroRowProps) {
  const pct = target > 0 ? Math.min((value / target) * 100, 100) : 0;
  const isOver = value > target && target > 0;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className={cn('h-2 w-2 rounded-full flex-shrink-0', dotColor)} />
          <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            {shortLabel}
          </span>
        </div>
        <div className="flex items-baseline gap-1 tabular-nums">
          <span className={cn('text-sm font-bold', isOver ? 'text-red-500' : accentText)}>
            {Math.round(value)}
          </span>
          <span className="text-[11px] text-zinc-300 dark:text-zinc-600">/</span>
          <span className="text-[11px] font-medium text-zinc-400 dark:text-zinc-500">
            {target}g
          </span>
        </div>
      </div>
      <div className={cn('h-2 w-full rounded-full overflow-hidden', trackColor)}>
        <div
          className={cn('h-full rounded-full transition-all duration-500', isOver ? 'bg-red-500' : barColor)}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export default function MacroProgress({ protein, carbs, fat, targetCalories }: MacroProgressProps) {
  const targets = getTargetMacros(targetCalories);

  return (
    <div className="bg-white dark:bg-zinc-900/80 border border-zinc-100 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-[0_1px_3px_0_rgb(0,0,0,0.04)] dark:shadow-none">
      {/* Tricolor top accent */}
      <div className="flex h-[3px]">
        <div className="flex-1 bg-blue-500" />
        <div className="flex-1 bg-amber-400" />
        <div className="flex-1 bg-rose-400" />
      </div>

      <div className="px-6 py-5">
        <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-4">
          Macronutrientes
        </p>

        <div className="flex flex-col gap-3.5">
          <MacroRow
            label="Proteínas"
            shortLabel="Prot."
            value={protein}
            target={targets.protein}
            color="blue"
            barColor="bg-blue-500"
            trackColor="bg-blue-100 dark:bg-blue-900/30"
            dotColor="bg-blue-500"
            accentText="text-blue-600 dark:text-blue-400"
          />
          <MacroRow
            label="Carboidratos"
            shortLabel="Carb."
            value={carbs}
            target={targets.carbs}
            color="amber"
            barColor="bg-amber-400"
            trackColor="bg-amber-100 dark:bg-amber-900/30"
            dotColor="bg-amber-400"
            accentText="text-amber-600 dark:text-amber-400"
          />
          <MacroRow
            label="Gorduras"
            shortLabel="Gord."
            value={fat}
            target={targets.fat}
            color="rose"
            barColor="bg-rose-400"
            trackColor="bg-rose-100 dark:bg-rose-900/30"
            dotColor="bg-rose-400"
            accentText="text-rose-600 dark:text-rose-400"
          />
        </div>
      </div>
    </div>
  );
}
