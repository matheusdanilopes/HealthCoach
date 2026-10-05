'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Scale, Plus, Sparkles, Dumbbell } from 'lucide-react';
import DailySummaryCard from '@/components/dashboard/DailySummaryCard';
import MealsOverview from '@/components/dashboard/MealsOverview';
import WeekStrip from '@/components/dashboard/WeekStrip';
import WaterTracker from '@/components/dashboard/WaterTracker';
import AIFoodLogger from '@/components/diary/AIFoodLogger';
import AddWorkoutModal from '@/components/diary/AddWorkoutModal';
import AIChat from '@/components/chat/AIChat';
import WeightLogModal from './WeightLogModal';
import { cn, todayISO, suggestMealType } from '@/lib/utils';
import type { FoodLog, MealType, Profile, WaterLogEntry } from '@/types';

interface DashboardClientProps {
  profile: Profile | null;
  serverDate: string;
  latestWeight: number;
  userId: string;
  initialFoodLogs: FoodLog[];
  initialWaterLogs: WaterLogEntry[];
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Bom dia';
  if (h < 18) return 'Boa tarde';
  return 'Boa noite';
}

export default function DashboardClient({
  profile,
  serverDate,
  latestWeight,
  userId,
  initialFoodLogs,
  initialWaterLogs,
}: DashboardClientProps) {
  const router = useRouter();
  const [foodLogs, setFoodLogs] = useState<FoodLog[]>(initialFoodLogs);
  const [waterLogs, setWaterLogs] = useState<WaterLogEntry[]>(initialWaterLogs);
  const [addFoodOpen, setAddFoodOpen] = useState(false);
  const [defaultMeal, setDefaultMeal] = useState<MealType | null>(null);
  const [addWorkoutOpen, setAddWorkoutOpen] = useState(false);
  const [weightModalOpen, setWeightModalOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState(serverDate);
  const [loadingDate, setLoadingDate] = useState(false);

  const greetingText = useMemo(() => getGreeting(), []);

  const water = useMemo(() => waterLogs.reduce((s, l) => s + l.amount_ml, 0), [waterLogs]);

  const mealHydrationMl = useMemo(
    () => foodLogs.reduce((s, l) => s + (l.hydration_ml ?? 0), 0),
    [foodLogs]
  );

  useEffect(() => {
    const today = todayISO();
    if (today !== serverDate) {
      // The server date was computed at request time; the client's clock/timezone
      // can disagree (or a day may have rolled over while the page sat cached).
      // Correcting this can only happen after mount, to avoid a hydration mismatch.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedDate(today);
      setLoadingDate(true);
      fetch(`/api/logs?date=${today}`)
        .then((r) => r.json())
        .then((data) => {
          setFoodLogs(data.foodLogs ?? []);
          setWaterLogs(data.waterLogs ?? []);
        })
        .catch(() => { setFoodLogs([]); setWaterLogs([]); })
        .finally(() => setLoadingDate(false));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isToday = selectedDate === todayISO();
  const targetCalories = profile?.target_calories ?? 2000;

  async function navigateTo(date: string) {
    if (date > todayISO()) return;
    setSelectedDate(date);
    setLoadingDate(true);
    try {
      const res = await fetch(`/api/logs?date=${date}`);
      const data = await res.json();
      setFoodLogs(data.foodLogs ?? []);
      setWaterLogs(data.waterLogs ?? []);
    } finally {
      setLoadingDate(false);
    }
  }

  const { workoutBurned, stats } = useMemo(() => {
    const positiveLogs = foodLogs.filter((l) => l.calories > 0);
    const workoutBurned = Math.abs(
      foodLogs.filter((l) => l.calories < 0).reduce((s, l) => s + l.calories, 0)
    );
    return {
      workoutBurned,
      stats: {
        calories: positiveLogs.reduce((s, l) => s + l.calories, 0),
        protein:  positiveLogs.reduce((s, l) => s + (l.protein ?? 0), 0),
        carbs:    positiveLogs.reduce((s, l) => s + (l.carbs ?? 0), 0),
        fat:      positiveLogs.reduce((s, l) => s + (l.fat ?? 0), 0),
      },
    };
  }, [foodLogs]);

  const handleFoodAdded = useCallback((log: FoodLog) => {
    setFoodLogs((prev) => [...prev, log]);
  }, []);

  const handleWaterAdded = useCallback((ml: number, createdAt: string) => {
    setWaterLogs((prev) => [...prev, { amount_ml: ml, created_at: createdAt }]);
  }, []);

  const handleAddMeal = useCallback((meal: MealType | null) => {
    setDefaultMeal(meal);
    setAddFoodOpen(true);
  }, []);

  const firstName = profile?.full_name?.split(' ')[0];
  const displayDate = format(new Date(selectedDate + 'T12:00:00'), "EEEE, d 'de' MMMM", { locale: ptBR });
  const suggestedMeal = isToday ? suggestMealType(new Date().getHours()) : null;

  return (
    <div className="flex flex-col gap-4 pt-6 pb-6 animate-fade-in">

      {/* ── Header ── */}
      <header className="flex items-center justify-between gap-3 px-1">
        <div className="min-w-0">
          <p className="text-[12px] font-medium text-zinc-400 dark:text-zinc-500 first-letter:uppercase">
            {isToday ? displayDate : 'Visualizando histórico'}
          </p>
          <h1 className="text-[22px] font-bold text-zinc-900 dark:text-zinc-50 leading-tight tracking-tight">
            {isToday
              ? `${greetingText}${firstName ? `, ${firstName}` : ''}`
              : <span className="inline-block first-letter:uppercase">{displayDate}</span>}
          </h1>
        </div>

        <button
          onClick={() => setWeightModalOpen(true)}
          disabled={!isToday}
          className="flex-shrink-0 flex items-center gap-2 h-11 pl-2 pr-3.5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800/70 shadow-[0_1px_2px_0_rgb(0,0,0,0.04)] dark:shadow-none hover:border-zinc-300 dark:hover:border-zinc-700 transition-all duration-200 active:scale-95 disabled:pointer-events-none"
          aria-label="Registrar peso"
        >
          <span className="h-7 w-7 rounded-xl bg-violet-50 dark:bg-violet-950/40 flex items-center justify-center">
            <Scale className="w-3.5 h-3.5 text-violet-500" />
          </span>
          <span className="text-left leading-none">
            <span className="block text-[10px] font-medium text-zinc-400 dark:text-zinc-500">Peso</span>
            <span className="block text-[14px] font-bold tabular-nums text-zinc-800 dark:text-zinc-100 mt-0.5">
              {latestWeight.toLocaleString('pt-BR')} kg
            </span>
          </span>
        </button>
      </header>

      <WeekStrip
        selectedDate={selectedDate}
        today={todayISO()}
        disabled={loadingDate}
        onSelect={navigateTo}
      />

      <div className={cn('flex flex-col gap-4 transition-opacity duration-200', loadingDate && 'opacity-50')}>
        <DailySummaryCard
          consumed={stats.calories}
          burned={workoutBurned}
          target={targetCalories}
          protein={stats.protein}
          carbs={stats.carbs}
          fat={stats.fat}
          tdee={profile?.tdee}
          isToday={isToday}
        />

        {/* Quick actions */}
        <div className="flex gap-2.5">
          <button
            onClick={() => handleAddMeal(suggestedMeal)}
            className="group flex-1 min-w-0 flex items-center gap-3 h-14 pl-2 pr-4 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/25 transition-all duration-200 active:scale-[0.98]"
          >
            <span className="h-10 w-10 flex-shrink-0 rounded-xl bg-white/15 flex items-center justify-center">
              <Sparkles className="w-5 h-5" />
            </span>
            <span className="flex-1 min-w-0 text-left leading-tight">
              <span className="block text-[14px] font-semibold">Registrar refeição</span>
              <span className="block text-[11px] text-emerald-100/90 truncate">Texto, foto ou voz</span>
            </span>
            <Plus className="w-5 h-5 flex-shrink-0 transition-transform duration-200 group-hover:rotate-90" strokeWidth={2.5} />
          </button>
          <button
            onClick={() => setAddWorkoutOpen(true)}
            className="flex-shrink-0 flex flex-col items-center justify-center gap-0.5 h-14 w-[72px] rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800/70 text-orange-500 shadow-[0_1px_2px_0_rgb(0,0,0,0.04)] dark:shadow-none hover:border-zinc-300 dark:hover:border-zinc-700 transition-all duration-200 active:scale-95"
            aria-label="Registrar treino"
          >
            <Dumbbell className="w-5 h-5" />
            <span className="text-[11px] font-semibold text-zinc-700 dark:text-zinc-200">Treino</span>
          </button>
        </div>

        <WaterTracker
          logs={waterLogs}
          target={profile?.target_water_ml ?? 2500}
          date={selectedDate}
          onAdded={handleWaterAdded}
          mealHydrationMl={mealHydrationMl}
        />

        <MealsOverview
          logs={foodLogs}
          targetCalories={targetCalories}
          suggestedMeal={suggestedMeal}
          onAddMeal={handleAddMeal}
          onAddWorkout={() => setAddWorkoutOpen(true)}
        />

      </div>

      {/* ── Modals ── */}
      <AIFoodLogger
        open={addFoodOpen}
        onClose={() => setAddFoodOpen(false)}
        userId={userId}
        defaultMeal={defaultMeal}
        date={selectedDate}
        onAdded={handleFoodAdded}
      />
      <AddWorkoutModal
        open={addWorkoutOpen}
        onClose={() => setAddWorkoutOpen(false)}
        userId={userId}
        date={selectedDate}
        onAdded={(log) => setFoodLogs((prev) => [...prev, log])}
      />
      {isToday && (
        <WeightLogModal
          open={weightModalOpen}
          onClose={() => setWeightModalOpen(false)}
          userId={userId}
          currentWeight={latestWeight}
          onLogged={() => router.refresh()}
        />
      )}

      {profile && isToday && (
        <AIChat
          profile={profile}
          dailyCalories={stats.calories}
          dailyWater={water}
          userId={userId}
          onFoodLogged={handleFoodAdded}
        />
      )}
    </div>
  );
}
