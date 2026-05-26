'use client';

import { useState, useCallback } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import MealSection from '@/components/diary/MealSection';
import AddFoodModal from '@/components/diary/AddFoodModal';
import AddWorkoutModal from '@/components/diary/AddWorkoutModal';
import { Dumbbell, Plus, Flame, Leaf } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { FoodLog, MealType } from '@/types';

const MEAL_TYPES: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

interface DiaryClientProps {
  userId: string;
  initialLogs: FoodLog[];
  targetCalories: number;
}

export default function DiaryClient({ userId, initialLogs, targetCalories }: DiaryClientProps) {
  const [logs, setLogs] = useState<FoodLog[]>(initialLogs);
  const [addFoodOpen, setAddFoodOpen] = useState(false);
  const [addWorkoutOpen, setAddWorkoutOpen] = useState(false);
  const [activeMeal, setActiveMeal] = useState<MealType>('lunch');

  const positiveLogs = logs.filter((l) => l.calories > 0);
  const totalCalories = positiveLogs.reduce((s, l) => s + l.calories, 0);
  const remaining = targetCalories - totalCalories;
  const pct = targetCalories > 0 ? Math.min((totalCalories / targetCalories) * 100, 100) : 0;
  const isOver = totalCalories > targetCalories;

  const handleFoodAdded = useCallback((log: FoodLog) => {
    setLogs((prev) => [...prev, log]);
  }, []);

  const handleDelete = useCallback((id: string) => {
    setLogs((prev) => prev.filter((l) => l.id !== id));
  }, []);

  function openAddForMeal(meal: MealType) {
    setActiveMeal(meal);
    setAddFoodOpen(true);
  }

  const workouts = logs.filter((l) => l.calories < 0);
  const workoutCalories = Math.abs(workouts.reduce((s, l) => s + l.calories, 0));

  return (
    <div className="flex flex-col gap-4 pt-6 pb-4">
      <div>
        <p className="text-xs text-zinc-400 dark:text-zinc-500 capitalize mb-0.5">
          {format(new Date(), "EEEE, d 'de' MMMM", { locale: ptBR })}
        </p>
        <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">Diário</h1>
      </div>

      {/* Daily summary — calorie breakdown */}
      <div className="bg-white dark:bg-zinc-900/80 border border-zinc-100 dark:border-zinc-800 rounded-2xl p-6 shadow-[0_1px_3px_0_rgb(0,0,0,0.04)] dark:shadow-none">
        <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-3">
          Total do dia
        </p>

        {/* Primary number */}
        <p className="text-4xl font-bold tabular-nums text-zinc-900 dark:text-zinc-100 leading-none mb-1">
          {totalCalories.toLocaleString('pt-BR')}
          <span className="text-base font-medium text-zinc-400 dark:text-zinc-500 ml-2">kcal</span>
        </p>

        {/* Breakdown row */}
        <div className="flex items-center gap-3 mt-3 mb-4">
          <div className="flex items-center gap-1.5">
            <Flame size={13} className="text-zinc-300 dark:text-zinc-600" />
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              Consumido{' '}
              <span className="font-semibold tabular-nums text-zinc-700 dark:text-zinc-300">
                {totalCalories.toLocaleString('pt-BR')}
              </span>
            </span>
          </div>
          <span className="text-zinc-200 dark:text-zinc-700">·</span>
          <div className="flex items-center gap-1.5">
            <Leaf size={13} className={isOver ? 'text-red-400' : 'text-emerald-400'} />
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              {isOver ? 'Excedido' : 'Restante'}{' '}
              <span className={cn(
                'font-semibold tabular-nums',
                isOver ? 'text-red-500' : 'text-emerald-600 dark:text-emerald-400'
              )}>
                {Math.abs(remaining).toLocaleString('pt-BR')}
              </span>
            </span>
          </div>
          {workoutCalories > 0 && (
            <>
              <span className="text-zinc-200 dark:text-zinc-700">·</span>
              <div className="flex items-center gap-1.5">
                <Dumbbell size={12} className="text-orange-400" />
                <span className="text-xs text-orange-500 font-semibold tabular-nums">
                  +{workoutCalories.toLocaleString('pt-BR')}
                </span>
              </div>
            </>
          )}
        </div>

        {/* Progress bar */}
        <div className="h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
          <div
            className={cn(
              'h-full rounded-full transition-all duration-500',
              isOver ? 'bg-red-500' : 'bg-blue-600'
            )}
            style={{ width: `${pct}%` }}
          />
        </div>

        <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-2">
          Meta: {targetCalories.toLocaleString('pt-BR')} kcal/dia
        </p>
      </div>

      {/* Meals */}
      <div className="flex flex-col gap-2.5">
        {MEAL_TYPES.map((meal) => (
          <MealSection
            key={meal}
            mealType={meal}
            logs={logs.filter((l) => l.meal_type === meal && l.calories > 0)}
            onAdd={() => openAddForMeal(meal)}
            onDelete={handleDelete}
          />
        ))}
      </div>

      {workouts.length > 0 && (
        <div className="bg-white dark:bg-zinc-900/80 border border-zinc-100 dark:border-zinc-800 rounded-2xl p-6 shadow-[0_1px_3px_0_rgb(0,0,0,0.04)] dark:shadow-none">
          <div className="flex items-center gap-2 mb-3">
            <Dumbbell size={14} className="text-orange-500" />
            <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Treinos</p>
            <span className="ml-auto text-xs font-bold tabular-nums text-orange-500">
              -{workoutCalories.toLocaleString('pt-BR')} kcal
            </span>
          </div>
          {workouts.map((w) => (
            <div key={w.id} className="flex items-center justify-between py-2.5 border-t border-zinc-50 dark:border-zinc-800/50">
              <span className="text-sm text-zinc-600 dark:text-zinc-400">{w.food_name}</span>
              <span className="text-sm font-semibold tabular-nums text-orange-500">
                {Math.abs(w.calories).toLocaleString('pt-BR')} kcal
              </span>
            </div>
          ))}
        </div>
      )}

      <button
        onClick={() => setAddWorkoutOpen(true)}
        className="flex items-center justify-center gap-2 h-11 rounded-xl border border-dashed border-zinc-200 dark:border-zinc-800 text-zinc-400 dark:text-zinc-500 hover:border-orange-300 dark:hover:border-orange-700 hover:text-orange-500 dark:hover:text-orange-400 transition-all text-sm font-medium"
      >
        <Plus size={14} strokeWidth={2.5} />
        Adicionar treino
      </button>

      <AddFoodModal
        open={addFoodOpen}
        onClose={() => setAddFoodOpen(false)}
        userId={userId}
        defaultMeal={activeMeal}
        onAdded={handleFoodAdded}
      />
      <AddWorkoutModal
        open={addWorkoutOpen}
        onClose={() => setAddWorkoutOpen(false)}
        userId={userId}
        onAdded={(cal) => {
          setLogs((prev) => [
            ...prev,
            {
              id: `local-${Date.now()}`,
              user_id: userId,
              created_at: new Date().toISOString(),
              food_name: 'Treino',
              meal_type: 'snack',
              calories: -cal,
              protein: null,
              carbs: null,
              fat: null,
            },
          ]);
        }}
      />
    </div>
  );
}
