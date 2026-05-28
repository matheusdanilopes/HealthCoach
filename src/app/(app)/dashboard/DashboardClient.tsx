'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Scale, Plus, Dumbbell, Flame, TrendingDown, ChevronLeft, ChevronRight } from 'lucide-react';
import CalorieCard from '@/components/dashboard/CalorieCard';
import MacroProgress from '@/components/dashboard/MacroProgress';
import WaterTracker from '@/components/dashboard/WaterTracker';
import AIInsightCard from '@/components/dashboard/AIInsightCard';
import AIFoodLogger from '@/components/diary/AIFoodLogger';
import AddWorkoutModal from '@/components/diary/AddWorkoutModal';
import AIChat from '@/components/chat/AIChat';
import WeightLogModal from './WeightLogModal';
import { cn, todayISO } from '@/lib/utils';
import type { FoodLog, Profile } from '@/types';

interface DashboardClientProps {
  profile: Profile | null;
  serverDate: string;
  latestWeight: number;
  userId: string;
  initialFoodLogs: FoodLog[];
  initialWater: number;
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
  initialWater,
}: DashboardClientProps) {
  const router = useRouter();
  const [foodLogs, setFoodLogs] = useState<FoodLog[]>(initialFoodLogs);
  const [water, setWater] = useState(initialWater);
  const [addFoodOpen, setAddFoodOpen] = useState(false);
  const [addWorkoutOpen, setAddWorkoutOpen] = useState(false);
  const [weightModalOpen, setWeightModalOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState(serverDate);
  const [loadingDate, setLoadingDate] = useState(false);
  const [insightKey, setInsightKey] = useState(0);

  // Stable greeting - computed once on mount
  const greetingText = useMemo(() => getGreeting(), []);

  useEffect(() => {
    const today = todayISO();
    // Handle timezone edge case where server date differs from client date
    if (today !== serverDate) {
      setSelectedDate(today);
      setLoadingDate(true);
      fetch(`/api/logs?date=${today}`)
        .then((r) => r.json())
        .then((data) => { setFoodLogs(data.foodLogs ?? []); setWater(data.water ?? 0); })
        .catch(() => { setFoodLogs([]); setWater(0); })
        .finally(() => setLoadingDate(false));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isToday = selectedDate === todayISO();

  async function navigateTo(date: string) {
    if (date > todayISO()) return;
    setSelectedDate(date);
    setLoadingDate(true);
    try {
      const res = await fetch(`/api/logs?date=${date}`);
      const data = await res.json();
      setFoodLogs(data.foodLogs ?? []);
      setWater(data.water ?? 0);
    } finally {
      setLoadingDate(false);
    }
  }

  function changeDate(delta: number) {
    const d = new Date(selectedDate + 'T12:00:00');
    d.setDate(d.getDate() + delta);
    navigateTo(d.toISOString().split('T')[0]);
  }

  // Memoize all derived stats to avoid redundant filter/reduce on every render
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
    setInsightKey((k) => k + 1);
  }, []);

  // Optimistic update from AI chat - avoids router.refresh() full re-render
  const handleFoodLoggedFromChat = useCallback((log: FoodLog) => {
    setFoodLogs((prev) => [...prev, log]);
    setInsightKey((k) => k + 1);
  }, []);

  const firstName = profile?.full_name?.split(' ')[0];
  const displayDate = format(new Date(selectedDate + 'T12:00:00'), "EEEE, d 'de' MMMM", { locale: ptBR });

  return (
    <div className="flex flex-col gap-6 pt-8 pb-6 animate-fade-in">
      {/* Page header */}
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <h1 className="text-[22px] font-bold text-zinc-900 dark:text-zinc-100 leading-tight tracking-tight mb-3">
            {isToday
              ? `${greetingText}${firstName ? `, ${firstName}` : ''}`
              : `Diário${firstName ? `, ${firstName}` : ''}`}
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
        {isToday && (
          <button
            onClick={() => setWeightModalOpen(true)}
            className="flex items-center gap-2 h-9 px-3.5 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-700/50 text-sm text-zinc-600 dark:text-zinc-300 shadow-[0_1px_2px_0_rgb(0,0,0,0.04)] dark:shadow-none hover:border-zinc-300 dark:hover:border-zinc-600 transition-all active:scale-95"
          >
            <Scale size={13} className="text-zinc-400" />
            <span className="font-semibold tabular-nums text-[13px]">{latestWeight}kg</span>
          </button>
        )}
      </div>

      {/* Layout: calorie card full-width, then 2-col for macros/water */}
      <div className="flex flex-col gap-4">
        <CalorieCard
          consumed={stats.calories}
          burned={workoutBurned}
          target={profile?.target_calories ?? 2000}
        />

        {/* AI Insights — only on today's view */}
        {isToday && <AIInsightCard userId={userId} refreshKey={insightKey} />}

        {/* Action buttons */}
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => setAddFoodOpen(true)}
            className="flex items-center justify-center gap-2 h-11 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium shadow-sm shadow-emerald-600/25 transition-all active:scale-[0.97]"
          >
            <Plus size={15} strokeWidth={2.5} />
            Registrar refeição
          </button>
          <button
            onClick={() => setAddWorkoutOpen(true)}
            className="flex items-center justify-center gap-2 h-11 px-4 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-700/50 text-zinc-700 dark:text-zinc-300 text-sm font-medium shadow-[0_1px_2px_0_rgb(0,0,0,0.04)] dark:shadow-none hover:border-zinc-300 dark:hover:border-zinc-600 transition-all active:scale-[0.97]"
          >
            <Dumbbell size={15} />
            Registrar treino
          </button>
        </div>

        {/* TDEE / deficit info */}
        {profile?.tdee && (
          <div className="flex items-center justify-between px-1 py-0.5">
            <div className="flex items-center gap-1.5">
              <Flame size={11} className="text-zinc-300 dark:text-zinc-600" />
              <span className="text-[11px] text-zinc-400 dark:text-zinc-500">
                TDEE{' '}
                <span className="text-zinc-600 dark:text-zinc-400 font-semibold tabular-nums">
                  {profile.tdee.toLocaleString('pt-BR')} kcal
                </span>
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <TrendingDown size={11} className="text-emerald-500" />
              <span className="text-[11px] text-zinc-400 dark:text-zinc-500">
                Déficit{' '}
                <span className="text-emerald-600 dark:text-emerald-400 font-semibold tabular-nums">
                  {(profile.tdee - (profile.target_calories ?? 0)).toLocaleString('pt-BR')} kcal
                </span>
              </span>
            </div>
          </div>
        )}

        {/* Macros + Water — side by side on sm+ */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1">
            <MacroProgress
              protein={stats.protein}
              carbs={stats.carbs}
              fat={stats.fat}
              targetCalories={profile?.target_calories ?? 2000}
            />
          </div>
          <div className="sm:w-52 flex-shrink-0">
            <WaterTracker
              current={water}
              target={profile?.target_water_ml ?? 2500}
              userId={userId}
              date={selectedDate}
              onUpdate={setWater}
            />
          </div>
        </div>
      </div>

      <AIFoodLogger
        open={addFoodOpen}
        onClose={() => setAddFoodOpen(false)}
        userId={userId}
        date={selectedDate}
        onAdded={handleFoodAdded}
      />
      <AddWorkoutModal
        open={addWorkoutOpen}
        onClose={() => setAddWorkoutOpen(false)}
        userId={userId}
        date={selectedDate}
        onAdded={(log) => { setFoodLogs((prev) => [...prev, log]); setInsightKey((k) => k + 1); }}
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
          onFoodLogged={handleFoodLoggedFromChat}
        />
      )}
    </div>
  );
}
