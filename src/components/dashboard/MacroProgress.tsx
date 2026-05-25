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
    carbs: Math.round((targetCalories * 0.4) / 4),
    fat: Math.round((targetCalories * 0.3) / 9),
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
        <span className="text-xs text-zinc-400">{label}</span>
        <span className={cn('text-xs font-semibold tabular-nums', isOver ? 'text-rose-400' : 'text-zinc-300')}>
          {Math.round(value)}
          <span className="text-zinc-600 font-normal"> / {target}g</span>
        </span>
      </div>
      <div className={cn('h-1.5 w-full rounded-full overflow-hidden', trackColor)}>
        <div
          className={cn('h-full rounded-full transition-all duration-500', isOver ? 'bg-rose-500' : color)}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export default function MacroProgress({ protein, carbs, fat, targetCalories }: MacroProgressProps) {
  const targets = getTargetMacros(targetCalories);

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
      <p className="text-xs font-medium text-zinc-500 mb-4">Macronutrientes</p>
      <div className="flex flex-col gap-3.5">
        <MacroRow label="Proteínas"    value={protein} target={targets.protein} color="bg-blue-500"  trackColor="bg-blue-500/10" />
        <MacroRow label="Carboidratos" value={carbs}   target={targets.carbs}   color="bg-amber-500" trackColor="bg-amber-500/10" />
        <MacroRow label="Gorduras"     value={fat}     target={targets.fat}     color="bg-rose-500"  trackColor="bg-rose-500/10" />
      </div>
    </div>
  );
}
