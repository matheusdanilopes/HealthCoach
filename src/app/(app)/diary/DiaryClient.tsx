'use client';

import { useState, useCallback } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import MealSection from '@/components/diary/MealSection';
import AIFoodLogger from '@/components/diary/AIFoodLogger';
import AddWorkoutModal from '@/components/diary/AddWorkoutModal';
import { Dumbbell, Plus, Flame, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { FoodLog, MealType } from '@/types';

const MEAL_TYPES: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

interface DiaryClientProps {
  userId: string;
  initialLogs: FoodLog[];
  targetCalories: number;
}

function todayISO() {
  return new Date().toISOString().split('T')[0];
}

export default function DiaryClient({ userId, initialLogs, targetCalories }: DiaryClientProps) {
  const [logs, setLogs] = useState<FoodLog[]>(initialLogs);
  const [addFoodOpen, setAddFoodOpen] = useState(false);
  const [addWorkoutOpen, setAddWorkoutOpen] = useState(false);
  const [activeMeal, setActiveMeal] = useState<MealType>('lunch');
  const [selectedDate, setSelectedDate] = useState(todayISO());
  const [loadingDate, setLoadingDate] = useState(false);

  const isToday = selectedDate === todayISO();

  async function navigateTo(date: string) {
    if (date > todayISO()) return;
    setSelectedDate(date);
    setLoadingDate(true);
    try {
      const res = await fetch(`/api/logs?date=${date}`);
      const data = await res.json();
      setLogs(data.foodLogs);
    } finally {
      setLoadingDate(false);
    }
  }

  function changeDate(delta: number) {
    const d = new Date(selectedDate + 'T12:00:00');
    d.setDate(d.getDate() + delta);
    navigateTo(d.toISOString().split('T')[0]);
  }

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

  const displayDate = format(new Date(selectedDate + 'T12:00:00'), "EEEE, d 'de' MMMM", { locale: ptBR });

  return (
    <div className="flex flex-col gap-6 pt-8 pb-6 animate-fade-in">
      {/* Header */}
      <div>
        {/* Date navigation */}
        <div className="flex items-center gap-1 mb-0.5">
          <button
            onClick={() => changeDate(-1)}
            disabled={loadingDate}
            className="p-0.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors disabled:opacity-40"
          >
            <ChevronLeft size={12} className="text-zinc-400" />
          </button>
          <p className={cn(
            'text-[11px] text-zinc-400 dark:text-zinc-500 capitalize font-medium tracking-wide transition-opacity',
            loadingDate && 'opacity-40'
          )}>
            {displayDate}
          </p>
          <button
            onClick={() => changeDate(1)}
            disabled={isToday || loadingDate}
            className="p-0.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors disabled:opacity-30 disabled:pointer-events-none"
          >
            <ChevronRight size={12} className="text-zinc-400" />
          </button>
          {!isToday && (
            <button
              onClick={() => navigateTo(todayISO())}
              className="ml-1 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 hover:text-emerald-500 transition-colors"
            >
              Hoje
            </button>
          )}
        </div>
        <h1 className="text-[22px] font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">
          Diário
        </h1>
      </div>

      {/* Daily summary */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800/80 rounded-2xl p-5 shadow-[0_1px_3px_0_rgb(0,0,0,0.05)] dark:shadow-none">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500 mb-3">
          Total do dia
        </p>

        <div className="flex items-baseline gap-1.5 mb-3">
          <span className="text-[38px] font-bold tabular-nums text-zinc-900 dark:text-zinc-100 leading-none tracking-tight">
            {totalCalories.toLocaleString('pt-BR')}
          </span>
          <span className="text-base font-medium text-zinc-400 dark:text-zinc-500">kcal</span>
        </div>

        <div className="flex items-center gap-4 mb-4">
          <div className="flex items-center gap-1.5">
            <Flame size={12} className="text-zinc-300 dark:text-zinc-600" />
            <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
              Meta:{' '}
              <span className="font-semibold tabular-nums text-zinc-700 dark:text-zinc-300">
                {targetCalories.toLocaleString('pt-BR')}
              </span>
            </span>
          </div>
          <span className="h-3.5 w-px bg-zinc-200 dark:bg-zinc-700" />
          <span className={cn(
            'text-[11px] font-semibold tabular-nums',
            isOver ? 'text-red-500' : 'text-emerald-600 dark:text-emerald-400'
          )}>
            {isOver ? '+' : ''}{Math.abs(remaining).toLocaleString('pt-BR')}{' '}
            <span className="font-normal text-zinc-400 dark:text-zinc-500">
              {isOver ? 'excedidos' : 'restantes'}
            </span>
          </span>
          {workoutCalories > 0 && (
            <>
              <span className="h-3.5 w-px bg-zinc-200 dark:bg-zinc-700" />
              <div className="flex items-center gap-1.5">
                <Dumbbell size={11} className="text-orange-400" />
                <span className="text-[11px] text-orange-500 font-semibold tabular-nums">
                  -{workoutCalories.toLocaleString('pt-BR')} kcal
                </span>
              </div>
            </>
          )}
        </div>

        <div className="h-2 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
          <div
            className={cn(
              'h-full rounded-full transition-all duration-700',
              isOver ? 'bg-red-500' : 'bg-emerald-600'
            )}
            style={{ width: `${pct}%` }}
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

      {/* Workouts */}
      {workouts.length > 0 && (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800/80 rounded-3xl overflow-hidden shadow-[0_1px_3px_0_rgb(0,0,0,0.04)] dark:shadow-none">
          <div className="flex items-center gap-2.5 px-5 py-3.5">
            <Dumbbell size={14} className="text-orange-500" />
            <p className="text-[13px] font-semibold text-zinc-800 dark:text-zinc-200 flex-1">
              Treinos
            </p>
            <span className="text-[13px] font-bold tabular-nums text-orange-500">
              -{workoutCalories.toLocaleString('pt-BR')} kcal
            </span>
          </div>
          <div className="border-t border-zinc-100 dark:border-zinc-800/60">
            {workouts.map((w) => (
              <div
                key={w.id}
                className="flex items-center justify-between px-5 py-3 border-b border-zinc-50 dark:border-zinc-800/40 last:border-0"
              >
                <span className="text-[13px] text-zinc-600 dark:text-zinc-400">{w.food_name}</span>
                <span className="text-[13px] font-semibold tabular-nums text-orange-500">
                  {Math.abs(w.calories).toLocaleString('pt-BR')} kcal
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add workout CTA */}
      <button
        onClick={() => setAddWorkoutOpen(true)}
        className="flex items-center justify-center gap-2 h-11 rounded-xl border border-dashed border-zinc-200 dark:border-zinc-800 text-zinc-400 dark:text-zinc-500 hover:border-orange-300 dark:hover:border-orange-700/60 hover:text-orange-500 dark:hover:text-orange-400 transition-all text-[13px] font-medium"
      >
        <Plus size={13} strokeWidth={2.5} />
        Adicionar treino
      </button>

      <AIFoodLogger
        open={addFoodOpen}
        onClose={() => setAddFoodOpen(false)}
        userId={userId}
        defaultMeal={activeMeal}
        date={selectedDate}
        onAdded={handleFoodAdded}
      />
      <AddWorkoutModal
        open={addWorkoutOpen}
        onClose={() => setAddWorkoutOpen(false)}
        userId={userId}
        date={selectedDate}
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
