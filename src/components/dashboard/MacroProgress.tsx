import ProgressBar from '@/components/ui/ProgressBar';

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

export default function MacroProgress({ protein, carbs, fat, targetCalories }: MacroProgressProps) {
  const targets = getTargetMacros(targetCalories);

  const macros = [
    { label: 'Proteínas', value: protein, target: targets.protein, color: 'bg-blue-500', unit: 'g' },
    { label: 'Carboidratos', value: carbs, target: targets.carbs, color: 'bg-amber-500', unit: 'g' },
    { label: 'Gorduras', value: fat, target: targets.fat, color: 'bg-rose-500', unit: 'g' },
  ];

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
      <p className="text-sm font-medium text-zinc-400 mb-4">Macronutrientes</p>
      <div className="flex flex-col gap-3">
        {macros.map((m) => (
          <ProgressBar
            key={m.label}
            value={m.value}
            max={m.target}
            label={m.label}
            sublabel={`${Math.round(m.value)}g / ${m.target}g`}
            color={m.color}
          />
        ))}
      </div>
    </div>
  );
}
