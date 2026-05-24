'use client';

import { useState, useCallback } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import MealSection from '@/components/diary/MealSection';
import AddFoodModal from '@/components/diary/AddFoodModal';
import AddWorkoutModal from '@/components/diary/AddWorkoutModal';
import { Dumbbell, Plus } from 'lucide-react';
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

  const handleFoodAdded = useCallback((log: FoodLog) => {
    setLogs((prev) => [...prev, log]);
  }, []);

  const handleDelete = useCallback((id: number) => {
    setLogs((prev) => prev.filter((l) => l.id !== id));
  }, []);

  function openAddForMeal(meal: MealType) {
    setActiveMeal(meal);
    setAddFoodOpen(true);
  }

  const workouts = logs.filter((l) => l.calories < 0);
  const workoutCalories = Math.abs(workouts.reduce((s, l) => s + l.calories, 0));

  return (
    <div className="flex flex-col gap-4 pt-5">
      <div>
        <h1 className="text-xl font-bold text-zinc-100">Diário Alimentar</h1>
        <p className="text-sm text-zinc-500 capitalize">
          {format(new Date(), "EEEE, d 'de' MMMM", { locale: ptBR })}
        </p>
      </div>

      {/* Daily summary bar */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
        <div className="flex items-center justify-between text-sm mb-2">
          <span className="text-zinc-400">Total consumido</span>
          <span className={remaining >= 0 ? 'text-emerald-400' : 'text-red-400'}>
            {remaining >= 0 ? `${remaining} kcal restantes` : `${Math.abs(remaining)} kcal excedidos`}
          </span>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-bold text-zinc-100">{totalCalories}</span>
          <span className="text-zinc-500 text-sm">/ {targetCalories} kcal</span>
          {workoutCalories > 0 && (
            <span className="ml-auto text-orange-400 text-sm font-medium">🔥 +{workoutCalories} queimados</span>
          )}
        </div>
        <div className="mt-3 h-2 bg-zinc-800 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${totalCalories > targetCalories ? 'bg-red-500' : 'bg-emerald-500'}`}
            style={{ width: `${Math.min((totalCalories / targetCalories) * 100, 100)}%` }}
          />
        </div>
      </div>

      {/* Meal sections */}
      <div className="flex flex-col gap-3">
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

      {/* Workouts section */}
      {workouts.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Dumbbell size={16} className="text-orange-400" />
            <p className="text-sm font-medium text-zinc-300">Treinos do dia</p>
            <span className="ml-auto text-orange-400 text-sm font-medium">-{workoutCalories} kcal</span>
          </div>
          {workouts.map((w) => (
            <div key={w.id} className="flex items-center justify-between py-2 border-t border-zinc-800">
              <span className="text-sm text-zinc-300">{w.food_name}</span>
              <span className="text-sm text-orange-400">{Math.abs(w.calories)} kcal</span>
            </div>
          ))}
        </div>
      )}

      <button
        onClick={() => setAddWorkoutOpen(true)}
        className="flex items-center justify-center gap-2 h-12 rounded-xl border border-dashed border-zinc-700 text-zinc-500 hover:border-orange-500/50 hover:text-orange-400 transition-all text-sm"
      >
        <Plus size={16} /> Adicionar treino
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
              id: Date.now(),
              user_id: userId,
              created_at: new Date().toISOString(),
              food_name: '🏃 Treino',
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
