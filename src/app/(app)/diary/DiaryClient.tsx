'use client';

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import MealSection from '@/components/diary/MealSection';
import AIFoodLogger from '@/components/diary/AIFoodLogger';
import AddWorkoutModal from '@/components/diary/AddWorkoutModal';
import EditFoodModal from '@/components/diary/EditFoodModal';
import { Dumbbell, Plus, Flame, ChevronLeft, ChevronRight, Trash2, Sparkles, Droplets, Clock } from 'lucide-react';
import { cn, todayISO } from '@/lib/utils';
import type { FoodLog, MealType, WaterLogEntry } from '@/types';

const MEAL_TYPES: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

function hm(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

interface DiaryClientProps {
  userId: string;
  serverDate: string;
  targetCalories: number;
  targetWater: number;
}

export default function DiaryClient({ userId, serverDate, targetCalories, targetWater }: DiaryClientProps) {
  const [logs, setLogs] = useState<FoodLog[]>([]);
  const [waterLogs, setWaterLogs] = useState<WaterLogEntry[]>([]);
  const [addFoodOpen, setAddFoodOpen] = useState(false);
  const [addWorkoutOpen, setAddWorkoutOpen] = useState(false);
  const [editingLog, setEditingLog] = useState<FoodLog | null>(null);
  const [activeMeal, setActiveMeal] = useState<MealType>('lunch');
  const [selectedDate, setSelectedDate] = useState(serverDate);
  const [loadingDate, setLoadingDate] = useState(true);
  const [deletingWorkoutId, setDeletingWorkoutId] = useState<string | null>(null);
  const [deletingWaterId, setDeletingWaterId] = useState<string | null>(null);
  const [addWaterOpen, setAddWaterOpen] = useState(false);
  const [addWaterTime, setAddWaterTime] = useState('');
  const [addWaterAmount, setAddWaterAmount] = useState('300');
  const [savingWater, setSavingWater] = useState(false);
  const insightDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced invalidation of the AI insight cache so the dashboard shows
  // fresh data on next visit without triggering expensive AI calls on every action.
  const scheduleInsightInvalidation = useCallback(() => {
    if (insightDebounceRef.current) clearTimeout(insightDebounceRef.current);
    insightDebounceRef.current = setTimeout(() => {
      fetch('/api/ai-insights?invalidate=1').catch(() => {});
    }, 3000);
  }, []);

  const isToday = selectedDate === todayISO();

  useEffect(() => {
    const today = todayISO();
    setSelectedDate(today);
    fetch(`/api/logs?date=${today}`)
      .then((r) => r.json())
      .then((data) => {
        setLogs(data.foodLogs ?? []);
        setWaterLogs(data.waterLogs ?? []);
      })
      .catch(() => { setLogs([]); setWaterLogs([]); })
      .finally(() => setLoadingDate(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function navigateTo(date: string) {
    if (date > todayISO()) return;
    setSelectedDate(date);
    setLoadingDate(true);
    try {
      const res = await fetch(`/api/logs?date=${date}`);
      const data = await res.json();
      setLogs(data.foodLogs ?? []);
      setWaterLogs(data.waterLogs ?? []);
    } catch {
      setLogs([]);
      setWaterLogs([]);
    } finally {
      setLoadingDate(false);
    }
  }

  function changeDate(delta: number) {
    const d = new Date(selectedDate + 'T12:00:00');
    d.setDate(d.getDate() + delta);
    navigateTo(d.toISOString().split('T')[0]);
  }

  const { totalCalories, workouts, workoutCalories, net, remaining, pct, isOver, mealLogs } = useMemo(() => {
    const positiveLogs = logs.filter((l) => l.calories > 0);
    const totalCalories = positiveLogs.reduce((s, l) => s + l.calories, 0);
    const workouts = logs.filter((l) => l.calories < 0);
    const workoutCalories = Math.abs(workouts.reduce((s, l) => s + l.calories, 0));
    const net = totalCalories - workoutCalories;
    const remaining = targetCalories - net;
    const pct = targetCalories > 0 ? Math.min((net / targetCalories) * 100, 100) : 0;
    const isOver = net > targetCalories;
    const mealLogs = {
      breakfast: positiveLogs.filter((l) => l.meal_type === 'breakfast'),
      lunch:     positiveLogs.filter((l) => l.meal_type === 'lunch'),
      dinner:    positiveLogs.filter((l) => l.meal_type === 'dinner'),
      snack:     positiveLogs.filter((l) => l.meal_type === 'snack'),
    };
    return { totalCalories, workouts, workoutCalories, net, remaining, pct, isOver, mealLogs };
  }, [logs, targetCalories]);

  const handleFoodAdded = useCallback((log: FoodLog) => {
    setLogs((prev) => [...prev, log]);
    scheduleInsightInvalidation();
  }, [scheduleInsightInvalidation]);

  const handleDelete = useCallback((id: string) => {
    setLogs((prev) => prev.filter((l) => l.id !== id));
    scheduleInsightInvalidation();
  }, [scheduleInsightInvalidation]);

  const handleUpdated = useCallback((updated: FoodLog) => {
    setLogs((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));
    scheduleInsightInvalidation();
  }, [scheduleInsightInvalidation]);

  async function handleDeleteWorkout(id: string) {
    setDeletingWorkoutId(id);
    await fetch(`/api/food?id=${id}`, { method: 'DELETE' });
    setLogs((prev) => prev.filter((l) => l.id !== id));
    setDeletingWorkoutId(null);
    scheduleInsightInvalidation();
  }

  async function handleDeleteWater(id: string) {
    setDeletingWaterId(id);
    await fetch(`/api/water?id=${id}`, { method: 'DELETE' });
    setWaterLogs((prev) => prev.filter((l) => l.id !== id));
    setDeletingWaterId(null);
  }

  async function handleAddWater(e: React.FormEvent) {
    e.preventDefault();
    const ml = parseInt(addWaterAmount, 10);
    if (!ml || ml <= 0) return;
    setSavingWater(true);

    let created_at: string | undefined;
    if (addWaterTime) {
      const dt = new Date(`${selectedDate}T${addWaterTime}:00`);
      created_at = dt.toISOString();
    }

    const res = await fetch('/api/water', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount_ml: ml, log_date: selectedDate, created_at }),
    });
    const data = await res.json();
    if (data.log) {
      setWaterLogs((prev) => [...prev, data.log].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      ));
    }
    setAddWaterOpen(false);
    setAddWaterTime('');
    setAddWaterAmount('300');
    setSavingWater(false);
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
            logs={mealLogs[meal]}
            onAdd={() => openAddForMeal(meal)}
            onDelete={handleDelete}
            onEdit={setEditingLog}
          />
        ))}
      </div>

      {/* Water history */}
      {(() => {
        const totalWater = waterLogs.reduce((s, l) => s + l.amount_ml, 0);
        const pct = targetWater > 0 ? Math.min((totalWater / targetWater) * 100, 100) : 0;
        return (
          <div className="bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800/80 rounded-3xl overflow-hidden shadow-[0_1px_3px_0_rgb(0,0,0,0.04)] dark:shadow-none">
            <div className="flex items-center gap-2.5 px-5 py-4 border-b border-zinc-50 dark:border-zinc-800/60">
              <div className="h-7 w-7 rounded-xl bg-teal-50 dark:bg-teal-950/40 border border-teal-100 dark:border-teal-900/40 flex items-center justify-center flex-shrink-0">
                <Droplets size={13} className="text-teal-500" />
              </div>
              <p className="text-[13px] font-semibold text-zinc-800 dark:text-zinc-200 flex-1">
                Hidratação
              </p>
              <div className="flex items-baseline gap-0.5 mr-2">
                <span className="text-[13px] font-bold tabular-nums text-teal-600 dark:text-teal-400">
                  {totalWater >= 1000 ? `${(totalWater / 1000).toFixed(1)}L` : `${totalWater}ml`}
                </span>
                <span className="text-[11px] text-zinc-400 dark:text-zinc-500 ml-1">
                  / {(targetWater / 1000).toFixed(1)}L
                </span>
              </div>
              <button
                onClick={() => { setAddWaterOpen((v) => !v); setAddWaterTime(''); setAddWaterAmount('300'); }}
                className="h-7 w-7 rounded-xl bg-teal-50 dark:bg-teal-950/30 border border-teal-100 dark:border-teal-900/40 flex items-center justify-center text-teal-600 dark:text-teal-400 hover:bg-teal-100 dark:hover:bg-teal-900/40 transition-colors active:scale-95"
                title="Adicionar registro de água"
              >
                <Plus size={13} strokeWidth={2.5} />
              </button>
            </div>

            {/* Progress bar */}
            <div className="h-1 bg-zinc-100 dark:bg-zinc-800">
              <div
                className="h-full bg-teal-500 transition-all duration-700"
                style={{ width: `${pct}%` }}
              />
            </div>

            {/* Add water form */}
            {addWaterOpen && (
              <form
                onSubmit={handleAddWater}
                className="px-5 py-4 border-b border-zinc-50 dark:border-zinc-800/60 flex flex-col gap-3"
              >
                <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
                  Novo registro
                </p>
                <div className="flex gap-2">
                  <div className="flex flex-col gap-1 flex-1">
                    <label className="text-[11px] font-medium text-zinc-400 dark:text-zinc-500">Horário</label>
                    <input
                      type="time"
                      value={addWaterTime}
                      onChange={(e) => setAddWaterTime(e.target.value)}
                      className="h-10 rounded-xl px-3 text-sm bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700/60 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-teal-500/25 focus:border-teal-400/80 transition-all"
                    />
                    <p className="text-[10px] text-zinc-400 dark:text-zinc-500">Deixe vazio para usar agora</p>
                  </div>
                  <div className="flex flex-col gap-1 flex-1">
                    <label className="text-[11px] font-medium text-zinc-400 dark:text-zinc-500">Quantidade (ml)</label>
                    <input
                      type="number"
                      min={50}
                      max={2000}
                      step={50}
                      value={addWaterAmount}
                      onChange={(e) => setAddWaterAmount(e.target.value)}
                      className="h-10 rounded-xl px-3 text-sm tabular-nums bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700/60 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-teal-500/25 focus:border-teal-400/80 transition-all"
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setAddWaterOpen(false)}
                    className="flex-1 h-9 rounded-xl text-[12px] font-medium text-zinc-500 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700/60 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={savingWater}
                    className="flex-1 h-9 rounded-xl text-[12px] font-semibold text-white bg-teal-500 hover:bg-teal-600 transition-colors disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-1.5"
                  >
                    {savingWater
                      ? <span className="h-3.5 w-3.5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                      : <><Plus size={12} strokeWidth={2.5} /> Salvar</>
                    }
                  </button>
                </div>
              </form>
            )}

            {/* Log list */}
            {waterLogs.length === 0 ? (
              <div className="px-5 py-5 flex items-center gap-2 text-zinc-400 dark:text-zinc-500">
                <Droplets size={13} className="text-zinc-300 dark:text-zinc-700" />
                <p className="text-[12px]">Nenhum registro de água neste dia</p>
              </div>
            ) : (
              <div>
                {[...waterLogs].reverse().map((l) => (
                  <div
                    key={l.id ?? l.created_at}
                    className="flex items-center gap-3 px-5 py-3 border-b border-zinc-50 dark:border-zinc-800/40 last:border-0"
                  >
                    <Clock size={11} className="text-zinc-300 dark:text-zinc-600 flex-shrink-0" />
                    <span className="text-[12px] tabular-nums text-zinc-500 dark:text-zinc-400 w-10 flex-shrink-0">
                      {hm(l.created_at)}
                    </span>
                    <div className="flex-1 h-px bg-zinc-100 dark:bg-zinc-800" />
                    <span className="text-[13px] font-semibold tabular-nums text-teal-600 dark:text-teal-400 flex-shrink-0">
                      +{l.amount_ml}ml
                    </span>
                    {l.id && (
                      <button
                        onClick={() => handleDeleteWater(l.id!)}
                        disabled={deletingWaterId === l.id}
                        className="flex-shrink-0 h-7 w-7 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 flex items-center justify-center text-zinc-300 dark:text-zinc-600 hover:text-red-400 transition-all disabled:opacity-40 active:scale-95"
                      >
                        {deletingWaterId === l.id
                          ? <span className="h-3 w-3 rounded-full border-2 border-zinc-300 border-t-transparent animate-spin" />
                          : <Trash2 size={12} />
                        }
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })()}

      {/* Workouts */}
      {workouts.length > 0 && (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800/80 rounded-3xl overflow-hidden shadow-[0_1px_3px_0_rgb(0,0,0,0.04)] dark:shadow-none">
          <div className="flex items-center gap-2.5 px-5 py-4">
            <div className="h-7 w-7 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-100 dark:border-emerald-900/40 flex items-center justify-center flex-shrink-0">
              <Dumbbell size={13} className="text-emerald-600 dark:text-emerald-400" />
            </div>
            <p className="text-[13px] font-semibold text-zinc-800 dark:text-zinc-200 flex-1">
              Treinos
            </p>
            <div className="flex items-baseline gap-0.5">
              <span className="text-[13px] font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                -{workoutCalories.toLocaleString('pt-BR')}
              </span>
              <span className="text-[11px] text-emerald-500 dark:text-emerald-500 font-medium ml-0.5">kcal</span>
            </div>
          </div>
          <div className="border-t border-zinc-100 dark:border-zinc-800/60">
            {workouts.map((w) => {
              const nameParts = w.food_name.match(/^(\S+)\s(.+?)(\s·\s(\d+)min)?$/);
              const emoji = nameParts?.[1] ?? '';
              const name  = nameParts?.[2]?.replace(/\s·\s\d+min$/, '') ?? w.food_name;
              const dur   = nameParts?.[4];
              return (
                <div
                  key={w.id}
                  className="flex items-center gap-3 px-5 py-3.5 border-b border-zinc-50 dark:border-zinc-800/40 last:border-0"
                >
                  <span className="text-[18px] leading-none flex-shrink-0">{emoji}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold text-zinc-700 dark:text-zinc-300 truncate">{name}</p>
                    {dur && (
                      <p className="text-[11px] text-zinc-400 dark:text-zinc-500">{dur} min</p>
                    )}
                  </div>
                  <span className="text-[13px] font-bold tabular-nums text-emerald-600 dark:text-emerald-400 flex-shrink-0">
                    -{Math.abs(w.calories).toLocaleString('pt-BR')} kcal
                  </span>
                  <button
                    onClick={() => handleDeleteWorkout(w.id)}
                    disabled={deletingWorkoutId === w.id}
                    className="flex-shrink-0 h-7 w-7 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 flex items-center justify-center text-zinc-300 dark:text-zinc-600 hover:text-red-400 transition-all disabled:opacity-40 active:scale-95"
                  >
                    {deletingWorkoutId === w.id
                      ? <span className="h-3 w-3 rounded-full border-2 border-zinc-300 border-t-transparent animate-spin" />
                      : <Trash2 size={12} />
                    }
                  </button>
                </div>
              );
            })}
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
      <EditFoodModal
        open={editingLog !== null}
        onClose={() => setEditingLog(null)}
        log={editingLog}
        onUpdated={handleUpdated}
      />
    </div>
  );
}
