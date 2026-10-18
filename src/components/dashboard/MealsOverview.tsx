'use client';

import { memo, useMemo } from 'react';
import Link from 'next/link';
import { ChevronRight, Dumbbell, Plus } from 'lucide-react';
import { ALL_MEAL_TYPES } from '@/components/diary/MealTypeSelector';
import { cn, getMealIcon, getMealLabel } from '@/lib/utils';
import type { FoodLog, MealType } from '@/types';

/** Meals always shown, even when empty — the rest appear only once logged. */
const CORE_MEALS: MealType[] = ['breakfast', 'lunch', 'afternoon_snack', 'dinner'];

/** Share of the daily target suggested for each core meal. */
const MEAL_SHARE: Partial<Record<MealType, number>> = {
  breakfast:       0.25,
  lunch:           0.35,
  afternoon_snack: 0.15,
  dinner:          0.25,
};

interface MealsOverviewProps {
  logs: FoodLog[];
  targetCalories: number;
  suggestedMeal: MealType | null;
  onAddMeal: (meal: MealType) => void;
  onAddWorkout: () => void;
}

function fmt(n: number) {
  return Math.round(n).toLocaleString('pt-BR');
}

function Row({
  icon,
  title,
  subtitle,
  kcal,
  kcalHint,
  highlight,
  progress,
  onAdd,
  addLabel,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  kcal: string | null;
  kcalHint?: string;
  highlight?: boolean;
  progress?: number;
  onAdd: () => void;
  addLabel: string;
}) {
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <div className="relative h-11 w-11 flex-shrink-0">
        <div className="h-full w-full rounded-2xl bg-zinc-50 dark:bg-zinc-800/80 flex items-center justify-center text-[20px] leading-none">
          {icon}
        </div>
        {progress !== undefined && progress > 0 && (
          <svg viewBox="0 0 44 44" className="absolute inset-0 -rotate-90" aria-hidden>
            <rect
              x="1" y="1" width="42" height="42" rx="15"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              pathLength={100}
              strokeDasharray={`${Math.min(progress, 1) * 100} 100`}
              className={progress > 1.1 ? 'text-amber-500' : 'text-emerald-500'}
            />
          </svg>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-[14px] font-semibold text-zinc-900 dark:text-zinc-100 truncate">{title}</p>
          {highlight && (
            <span className="flex-shrink-0 px-1.5 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400">
              Agora
            </span>
          )}
        </div>
        <p className="text-[12px] text-zinc-400 dark:text-zinc-500 truncate mt-0.5">{subtitle}</p>
      </div>

      {kcal !== null && (
        <div className="text-right flex-shrink-0">
          <p className="text-[13px] font-bold tabular-nums text-zinc-800 dark:text-zinc-100 leading-none">{kcal}</p>
          {kcalHint && <p className="text-[10px] tabular-nums text-zinc-400 dark:text-zinc-500 mt-1">{kcalHint}</p>}
        </div>
      )}

      <button
        onClick={onAdd}
        aria-label={addLabel}
        className={cn(
          'h-9 w-9 flex-shrink-0 rounded-full flex items-center justify-center transition-all duration-200 active:scale-90',
          highlight
            ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-600/30 hover:bg-emerald-500'
            : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/50'
        )}
      >
        <Plus className="w-4 h-4" strokeWidth={2.5} />
      </button>
    </li>
  );
}

export default memo(function MealsOverview({
  logs,
  targetCalories,
  suggestedMeal,
  onAddMeal,
  onAddWorkout,
}: MealsOverviewProps) {
  const { byMeal, workouts } = useMemo(() => {
    const byMeal = new Map<MealType, FoodLog[]>();
    const workouts: FoodLog[] = [];
    for (const log of logs) {
      if (log.calories < 0) { workouts.push(log); continue; }
      const meal = (log.meal_type === 'snack' ? 'afternoon_snack' : log.meal_type ?? 'other') as MealType;
      byMeal.set(meal, [...(byMeal.get(meal) ?? []), log]);
    }
    return { byMeal, workouts };
  }, [logs]);

  const meals = ALL_MEAL_TYPES.filter(
    (m) => CORE_MEALS.includes(m) || byMeal.has(m) || m === suggestedMeal
  );
  const burned = Math.abs(workouts.reduce((s, l) => s + l.calories, 0));

  return (
    <section aria-labelledby="meals-title" className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between px-1">
        <h2 id="meals-title" className="text-[15px] font-bold text-zinc-900 dark:text-zinc-50 tracking-tight">
          Refeições
        </h2>
        <Link
          href="/diary"
          className="flex items-center gap-0.5 text-[12px] font-semibold text-emerald-600 dark:text-emerald-400 hover:text-emerald-500 transition-colors"
        >
          Ver diário <ChevronRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      <ul className="rounded-3xl bg-white dark:bg-zinc-900/80 border border-zinc-200/60 dark:border-zinc-800/60 shadow-[0_1px_3px_0_rgb(0,0,0,0.04)] dark:shadow-none divide-y divide-zinc-100 dark:divide-zinc-800/70 overflow-hidden">
        {meals.map((meal) => {
          const items = byMeal.get(meal) ?? [];
          const total = items.reduce((s, l) => s + l.calories, 0);
          const share = MEAL_SHARE[meal];
          const goal  = share ? Math.round((targetCalories * share) / 10) * 10 : null;
          const subtitle = items.length
            ? items.map((l) => l.food_name).join(', ')
            : goal ? `Sugestão: ${fmt(goal)} kcal` : 'Nada registrado';
          return (
            <Row
              key={meal}
              icon={getMealIcon(meal)}
              title={getMealLabel(meal)}
              subtitle={subtitle}
              kcal={items.length ? `${fmt(total)} kcal` : null}
              kcalHint={items.length && goal ? `de ${fmt(goal)}` : undefined}
              progress={goal ? total / goal : undefined}
              highlight={meal === suggestedMeal}
              onAdd={() => onAddMeal(meal)}
              addLabel={`Adicionar em ${getMealLabel(meal)}`}
            />
          );
        })}

        <Row
          icon={<Dumbbell className="w-5 h-5 text-orange-500" />}
          title="Exercícios"
          subtitle={workouts.length ? workouts.map((l) => l.food_name).join(', ') : 'Registre seu treino'}
          kcal={workouts.length ? `−${fmt(burned)} kcal` : null}
          onAdd={onAddWorkout}
          addLabel="Registrar treino"
        />
      </ul>
    </section>
  );
});
