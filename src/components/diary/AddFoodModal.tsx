'use client';

import { useState } from 'react';
import Modal from '@/components/ui/Modal';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import MealTypeSelector from '@/components/diary/MealTypeSelector';
import { AlertTriangle } from 'lucide-react';
import { suggestMealType } from '@/lib/utils';
import type { FoodLog, MealType } from '@/types';

interface AddFoodModalProps {
  open: boolean;
  onClose: () => void;
  userId: string;
  defaultMeal?: MealType;
  onAdded: (log: FoodLog) => void;
}

export default function AddFoodModal({
  open,
  onClose,
  userId,
  defaultMeal,
  onAdded,
}: AddFoodModalProps) {
  const [mealType, setMealType] = useState<MealType | null>(defaultMeal ?? null);
  const [foodName, setFoodName] = useState('');
  const [calories, setCalories] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');
  const [loading, setLoading] = useState(false);
  const [mealError, setMealError] = useState(false);

  const suggestedType = suggestMealType(new Date().getHours());

  function reset() {
    setMealType(defaultMeal ?? null);
    setFoodName('');
    setCalories('');
    setProtein('');
    setCarbs('');
    setFat('');
    setMealError(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!foodName || !calories) return;
    if (!mealType) {
      setMealError(true);
      return;
    }
    setMealError(false);
    setLoading(true);

    const res = await fetch('/api/food', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        food_name: foodName,
        meal_type: mealType,
        calories: parseInt(calories),
        protein: protein ? parseFloat(protein) : null,
        carbs: carbs ? parseFloat(carbs) : null,
        fat: fat ? parseFloat(fat) : null,
      }),
    });

    setLoading(false);
    if (!res.ok) return;

    const data = await res.json() as FoodLog;
    onAdded(data);
    reset();
    onClose();
  }

  function handleMealChange(meal: MealType) {
    setMealType(meal);
    setMealError(false);
  }

  return (
    <Modal open={open} onClose={() => { reset(); onClose(); }} title="Adicionar alimento">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <MealTypeSelector
          value={mealType}
          onChange={handleMealChange}
          suggestedType={suggestedType}
          error={mealError}
        />

        <Input
          label="Alimento"
          placeholder="Ex: 2 ovos mexidos"
          value={foodName}
          onChange={(e) => setFoodName(e.target.value)}
          required
        />

        <Input
          label="Calorias (kcal)"
          type="number"
          placeholder="0"
          value={calories}
          onChange={(e) => setCalories(e.target.value)}
          required
          min="0"
        />

        <div className="grid grid-cols-3 gap-2">
          <Input
            label="Proteína (g)"
            type="number"
            step="0.1"
            placeholder="0"
            value={protein}
            onChange={(e) => setProtein(e.target.value)}
            min="0"
          />
          <Input
            label="Carbs (g)"
            type="number"
            step="0.1"
            placeholder="0"
            value={carbs}
            onChange={(e) => setCarbs(e.target.value)}
            min="0"
          />
          <Input
            label="Gordura (g)"
            type="number"
            step="0.1"
            placeholder="0"
            value={fat}
            onChange={(e) => setFat(e.target.value)}
            min="0"
          />
        </div>

        {mealError && (
          <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/60 animate-scale-in">
            <AlertTriangle size={13} className="text-red-500 flex-shrink-0" />
            <p className="text-[12px] font-semibold text-red-600 dark:text-red-400">
              Selecione a refeição acima para continuar.
            </p>
          </div>
        )}

        <Button type="submit" loading={loading} className="w-full">
          Adicionar
        </Button>
      </form>
    </Modal>
  );
}
