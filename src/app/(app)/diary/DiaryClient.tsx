'use client';

import { useState, useCallback, useEffect } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import MealSection from '@/components/diary/MealSection';
import AIFoodLogger from '@/components/diary/AIFoodLogger';
import AddWorkoutModal from '@/components/diary/AddWorkoutModal';
import { Dumbbell, Plus, Flame, ChevronLeft, ChevronRight, Trash2, Sparkles } from 'lucide-react';
import { cn, todayISO } from '@/lib/utils';
import type { FoodLog, MealType } from '@/types';

const MEAL_TYPES: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

interface DiaryClientProps {
  userId: string;
  initialLogs: FoodLog[];
  initialDate: string;
  targetCalories: number;
}

export default function DiaryClient({ userId, initialLogs, initialDate, targetCalories }: DiaryClientProps) {
  const clientToday = todayISO();
  const [logs, setLogs] = useState<FoodLog[]>(initialDate === clientToday ? initialLogs : []);
  const [addFoodOpen, setAddFoodOpen] = useState(false);
  const [addWorkoutOpen, setAddWorkoutOpen] = useState(false);
  const [activeMeal, setActiveMeal] = useState<MealType>('lunch');
  const [selectedDate, setSelectedDate] = useState(clientToday);
  const [loadingDate, setLoadingDate] = useState(initialDate !== clientToday);
  const [deletingWorkoutId, setDeletingWorkoutId] = useState<string | null>(null);

  const isToday = selectedDate === todayISO();

  useEffect(() => {
    if (initialDate !== clientToday) {
      fetch(`/api/logs?date=${clientToday}`)
        .then((r) => r.json())
        .then((data) => setLogs(data.foodLogs ?? []))
        .finally(() => setLoadingDate(false));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
  const workouts = logs.filter((l) => l.calories < 0);
  const workoutCalories = Math.abs(workouts.reduce((s, l) => s + l.calories, 0));
  const net = totalCalories - workoutCalories;
  const remaining = targetCalories - net;
  const pct = targetCalories > 0 ? Math.min((net / targetCalories) * 100, 100) : 0;
  const isOver = net > targetCalories;

  const handleFoodAdded = useCallback((log: FoodLog) => {
    setLogs((prev) => [...prev, log]);
  }, []);

  const handleDelete = useCallback((id: string) => {
    setLogs((prev) => prev.filter((l) => l.id !== id));
  }, []);

  async function handleDeleteWorkout(id: string) {
    setDeletingWorkoutId(id);
    await fetch(`/api/food?id=${id}`, { method: 'DELETE' });
    setLogs((prev) => prev.filter((l) => l.id !== id));
    setDeletingWorkoutId(null);
  }

  function openAddForMeal(meal: MealType) {
    setActiveMeal(meal);
    setAddFoodOpen(true);
  }

  const displayDate = format(new Date(selectedDate + 'T12:00:00'), "EEEE, d 'de' MMMM", { locale: ptBR });

  return (
    <div className="flex flex-col gap-6 pt-8 pb-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col gap-3">
        <h1 className="text-[22px] font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">
          Diário
        </h1>
        {/* Date navigation */}
        <div className="flex items-center gap-2">
          <div className={cn(
            'flex items-center flex-1 bg-zinc-100 dark:bg-zinc-800 rounded-xl h-9 px-1 transition-opacity',
            loadingDate && 'opacity-50'
          )}>
            <button
              onClick={() => changeDate(-1)}
              disabled={loadingDate}
              className="w-8 h-7 flex items-center justify-center rounded-lg hover:bg-white dark:hover:bg-zinc-700 text-zinc-500 dark:text-zinc-400 transition-colors disabled:opacity-40 active:scale-95"
              aria-label="Dia anterior"
            >
              <ChevronLeft size={16} />
            </button>
            <p className="flex-1 text-center text-[13px] font-medium text-zinc-700 dark:text-zinc-200 capitalize select-none">
              {displayDate}
            </p>
            <button
              onClick={() => changeDate(1)}
              disabled={isToday || loadingDate}
              className="w-8 h-7 flex items-center justify-center rounded-lg hover:bg-white dark:hover:bg-zinc-700 text-zinc-500 dark:text-zinc-400 transition-colors disabled:opacity-30 disabled:pointer-events-none active:scale-95"
              aria-label="Próximo dia"
            >
              <ChevronRight size={16} />
            </button>
          </div>
          {!isToday && (
            <button
              onClick={() => navigateTo(todayISO())}
              className="h-9 px-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200/80 dark:border-emerald-800/50 text-[12px] font-semibold text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-colors active:scale-95 whitespace-nowrap"
            >
              Hoje
            </button>
          )}
        </div>
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
                className="flex items-center gap-3 px-5 py-3 border-b border-zinc-50 dark:border-zinc-800/40 last:border-0"
              >
                <span className="text-[13px] text-zinc-600 dark:text-zinc-400 flex-1 truncate">{w.food_name}</span>
                <span className="text-[13px] font-semibold tabular-nums text-orange-500 flex-shrink-0">
                  {Math.abs(w.calories).toLocaleString('pt-BR')} kcal
                </span>
                <button
                  onClick={() => handleDeleteWorkout(w.id)}
                  disabled={deletingWorkoutId === w.id}
                  className="flex-shrink-0 h-7 w-7 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 flex items-center justify-center text-zinc-300 dark:text-zinc-600 hover:text-red-400 transition-all disabled:opacity-40"
                >
                  {deletingWorkoutId === w.id
                    ? <span className="h-3 w-3 rounded-full border-2 border-zinc-300 border-t-transparent animate-spin" />
                    : <Trash2 size={12} />
                  }
                </button>
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
        Registrar treino
        <Sparkles size={11} className="opacity-60" />
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
        onAdded={(log) => setLogs((prev) => [...prev, log])}
      />
    </div>
  );
}
