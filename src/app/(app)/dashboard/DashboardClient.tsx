'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Scale, Plus, Dumbbell } from 'lucide-react';
import CalorieCard from '@/components/dashboard/CalorieCard';
import MacroProgress from '@/components/dashboard/MacroProgress';
import WaterTracker from '@/components/dashboard/WaterTracker';
import AddFoodModal from '@/components/diary/AddFoodModal';
import AddWorkoutModal from '@/components/diary/AddWorkoutModal';
import AIChat from '@/components/chat/AIChat';
import WeightLogModal from './WeightLogModal';
import type { FoodLog, Profile } from '@/types';

interface DashboardClientProps {
  profile: Profile | null;
  initialFoodLogs: FoodLog[];
  initialWater: number;
  latestWeight: number;
  userId: string;
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

  const positiveLogs = foodLogs.filter((l) => l.calories > 0);
  const workoutBurned = Math.abs(
    foodLogs.filter((l) => l.calories < 0).reduce((s, l) => s + l.calories, 0)
  );

  const stats = {
    calories: positiveLogs.reduce((s, l) => s + l.calories, 0),
    protein: positiveLogs.reduce((s, l) => s + (l.protein ?? 0), 0),
    carbs: positiveLogs.reduce((s, l) => s + (l.carbs ?? 0), 0),
    fat: positiveLogs.reduce((s, l) => s + (l.fat ?? 0), 0),
  };

  const handleFoodAdded = useCallback((log: FoodLog) => {
    setFoodLogs((prev) => [...prev, log]);
  }, []);

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Bom dia';
    if (h < 18) return 'Boa tarde';
    return 'Boa noite';
  };

  const firstName = profile?.full_name?.split(' ')[0];
  const dateStr = format(new Date(), "EEEE, d 'de' MMMM", { locale: ptBR });

  return (
    <div className="flex flex-col gap-4 pt-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-zinc-900">
            {greeting()}{firstName ? `, ${firstName}` : ''}
          </h1>
          <p className="text-sm text-zinc-400 capitalize">{dateStr}</p>
        </div>
        <button
          onClick={() => setWeightModalOpen(true)}
          className="flex items-center gap-1.5 h-9 px-3 rounded-xl bg-zinc-100 hover:bg-zinc-200 border border-zinc-200 text-sm text-zinc-600 transition-colors active:scale-95"
        >
          <Scale size={13} className="text-zinc-400" />
          <span className="font-medium tabular-nums">{latestWeight}kg</span>
        </button>
      </div>

      <CalorieCard
        consumed={stats.calories}
        burned={workoutBurned}
        target={profile?.target_calories ?? 2000}
      />

      <MacroProgress
        protein={stats.protein}
        carbs={stats.carbs}
        fat={stats.fat}
        targetCalories={profile?.target_calories ?? 2000}
      />

      <WaterTracker
        current={water}
        target={profile?.target_water_ml ?? 2500}
        userId={userId}
        onUpdate={setWater}
      />

      {/* Quick actions */}
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => setAddFoodOpen(true)}
          className="flex items-center justify-center gap-2 h-12 px-4 rounded-xl bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 text-sm font-medium transition-all active:scale-95"
        >
          <Plus size={17} />
          Refeição
        </button>
        <button
          onClick={() => setAddWorkoutOpen(true)}
          className="flex items-center justify-center gap-2 h-12 px-4 rounded-xl bg-orange-50 hover:bg-orange-100 border border-orange-200 text-orange-700 text-sm font-medium transition-all active:scale-95"
        >
          <Dumbbell size={17} />
          Treino
        </button>
      </div>

      {profile?.tdee && (
        <div className="flex items-center justify-between px-1">
          <span className="text-xs text-zinc-400">
            TDEE{' '}
            <span className="text-zinc-500 font-medium tabular-nums">
              {profile.tdee.toLocaleString('pt-BR')} kcal
            </span>
          </span>
          <span className="text-xs text-zinc-400">
            Déficit{' '}
            <span className="text-emerald-600 font-medium tabular-nums">
              {(profile.tdee - (profile.target_calories ?? 0)).toLocaleString('pt-BR')} kcal
            </span>
          </span>
        </div>
      )}

      <AddFoodModal
        open={addFoodOpen}
        onClose={() => setAddFoodOpen(false)}
        userId={userId}
        onAdded={handleFoodAdded}
      />
      <AddWorkoutModal
        open={addWorkoutOpen}
        onClose={() => setAddWorkoutOpen(false)}
        userId={userId}
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
      <WeightLogModal
        open={weightModalOpen}
        onClose={() => setWeightModalOpen(false)}
        userId={userId}
        currentWeight={latestWeight}
        onLogged={() => router.refresh()}
      />

      {profile && (
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
