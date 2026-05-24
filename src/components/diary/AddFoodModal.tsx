'use client';

import { useState } from 'react';
import Modal from '@/components/ui/Modal';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import { createClient } from '@/lib/supabase/client';
import type { FoodLog, MealType } from '@/types';

const MEAL_OPTIONS: { value: MealType; label: string; icon: string }[] = [
  { value: 'breakfast', label: 'Café da Manhã', icon: '☀️' },
  { value: 'lunch', label: 'Almoço', icon: '🍽️' },
  { value: 'dinner', label: 'Jantar', icon: '🌙' },
  { value: 'snack', label: 'Lanche', icon: '🍎' },
];

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
  defaultMeal = 'lunch',
  onAdded,
}: AddFoodModalProps) {
  const [mealType, setMealType] = useState<MealType>(defaultMeal);
  const [foodName, setFoodName] = useState('');
  const [calories, setCalories] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');
  const [loading, setLoading] = useState(false);

  function reset() {
    setFoodName('');
    setCalories('');
    setProtein('');
    setCarbs('');
    setFat('');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!foodName || !calories) return;
    setLoading(true);

    const supabase = createClient();
    const { data, error } = await supabase
      .from('food_logs')
      .insert({
        user_id: userId,
        food_name: foodName,
        meal_type: mealType,
        calories: parseInt(calories),
        protein: protein ? parseFloat(protein) : null,
        carbs: carbs ? parseFloat(carbs) : null,
        fat: fat ? parseFloat(fat) : null,
      })
      .select()
      .single();

    setLoading(false);
    if (error || !data) return;

    onAdded(data as FoodLog);
    reset();
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title="Adicionar alimento">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="grid grid-cols-4 gap-1.5">
          {MEAL_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setMealType(opt.value)}
              className={`flex flex-col items-center gap-1 py-2 rounded-xl border text-xs transition-all ${
                mealType === opt.value
                  ? 'bg-emerald-500/10 border-emerald-500 text-emerald-400'
                  : 'bg-zinc-800 border-transparent text-zinc-500'
              }`}
            >
              <span>{opt.icon}</span>
              <span className="text-[10px] leading-tight text-center">{opt.label.split(' ')[0]}</span>
            </button>
          ))}
        </div>

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

        <Button type="submit" loading={loading} className="w-full">
          Adicionar
        </Button>
      </form>
    </Modal>
  );
}
