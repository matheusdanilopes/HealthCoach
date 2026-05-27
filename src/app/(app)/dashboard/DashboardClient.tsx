'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Scale, Plus, Dumbbell, Flame, TrendingDown, ChevronLeft, ChevronRight } from 'lucide-react';
import CalorieCard from '@/components/dashboard/CalorieCard';
import MacroProgress from '@/components/dashboard/MacroProgress';
import WaterTracker from '@/components/dashboard/WaterTracker';
import AIFoodLogger from '@/components/diary/AIFoodLogger';
import AddWorkoutModal from '@/components/diary/AddWorkoutModal';
import AIChat from '@/components/chat/AIChat';
import WeightLogModal from './WeightLogModal';
import { cn } from '@/lib/utils';
import type { FoodLog, Profile } from '@/types';

interface DashboardClientProps {
  profile: Profile | null;
  initialFoodLogs: FoodLog[];
  initialWater: number;
  latestWeight: number;
  userId: string;
}

function todayISO() {
  return new Date().toISOString().split('T')[0];
}

export default function DashboardClient({
  profile,
  initialFoodLogs,
  initialWater,
  latestWeight,
  userId,
}: DashboardClientProps) {
  const router = useRouter();
  const [foodLogs, setFoodLogs] = useState<FoodLog[]>(initialFoodLogs);
  const [water, setWater] = useState(initialWater);
  const [addFoodOpen, setAddFoodOpen] = useState(false);
  const [addWorkoutOpen, setAddWorkoutOpen] = useState(false);
  const [weightModalOpen, setWeightModalOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState(todayISO());
  const [loadingDate, setLoadingDate] = useState(false);
  const [greetingText, setGreetingText] = useState('');

  // Use device local time for greeting
  useEffect(() => {
    const h = new Date().getHours();
    if (h < 12) setGreetingText('Bom dia');
    else if (h < 18) setGreetingText('Boa tarde');
    else setGreetingText('Boa noite');
  }, []);

  const isToday = selectedDate === todayISO();

  async function navigateTo(date: string) {
    if (date > todayISO()) return;
    setSelectedDate(date);
    setLoadingDate(true);
    try {
      const res = await fetch(`/api/logs?date=${date}`);
      const data = await res.json();
      setFoodLogs(data.foodLogs);
      setWater(data.water);
    } finally {
      setLoadingDate(false);
    }
  }

  function changeDate(delta: number) {
    const d = new Date(selectedDate + 'T12:00:00');
    d.setDate(d.getDate() + delta);
    navigateTo(d.toISOString().split('T')[0]);
  }

  const positiveLogs = foodLogs.filter((l) => l.calories > 0);
  const workoutBurned = Math.abs(
    foodLogs.filter((l) => l.calories < 0).reduce((s, l) => s + l.calories, 0)
  );

  const stats = {
    calories: positiveLogs.reduce((s, l) => s + l.calories, 0),
    protein:  positiveLogs.reduce((s, l) => s + (l.protein ?? 0), 0),
    carbs:    positiveLogs.reduce((s, l) => s + (l.carbs ?? 0), 0),
    fat:      positiveLogs.reduce((s, l) => s + (l.fat ?? 0), 0),
  };

  const handleFoodAdded = useCallback((log: FoodLog) => {
    setFoodLogs((prev) => [...prev, log]);
  }, []);

  const firstName = profile?.full_name?.split(' ')[0];
  const displayDate = format(new Date(selectedDate + 'T12:00:00'), "EEEE, d 'de' MMMM", { locale: ptBR });

  return (
    <div className="flex flex-col gap-6 pt-8 pb-6 animate-fade-in">
      {/* Page header */}
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
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
          <h1 className="text-[22px] font-bold text-zinc-900 dark:text-zinc-100 leading-tight tracking-tight">
            {isToday
              ? `${greetingText}${firstName ? `, ${firstName}` : ''}`
              : `Diário${firstName ? `, ${firstName}` : ''}`}
          </h1>
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
        onAdded={(cal) => {
          setFoodLogs((prev) => [
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
          onFoodLogged={() => router.refresh()}
        />
      )}
    </div>
  );
}
