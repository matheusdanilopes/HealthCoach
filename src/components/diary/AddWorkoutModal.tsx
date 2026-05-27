'use client';

import { useState } from 'react';
import Modal from '@/components/ui/Modal';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';

interface AddWorkoutModalProps {
  open: boolean;
  onClose: () => void;
  userId: string;
  date?: string;
  onAdded: (calories: number) => void;
}

export default function AddWorkoutModal({ open, onClose, userId, date, onAdded }: AddWorkoutModalProps) {
  const [activity, setActivity] = useState('');
  const [calories, setCalories] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!activity || !calories) return;
    setLoading(true);

    await fetch('/api/food', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        food_name: `🏃 ${activity}`,
        meal_type: 'snack',
        calories: -Math.abs(parseInt(calories)),
        log_date: date,
      }),
    });

    onAdded(parseInt(calories));
    setActivity('');
    setCalories('');
    setLoading(false);
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title="Registrar treino">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <p className="text-[13px] text-zinc-500 dark:text-zinc-400 leading-relaxed">
          O treino adiciona calorias ao seu teto diário, permitindo comer um pouco mais.
        </p>
        <Input
          label="Atividade"
          placeholder="Ex: Corrida, Musculação, Natação"
          value={activity}
          onChange={(e) => setActivity(e.target.value)}
          required
        />
        <Input
          label="Calorias gastas"
          type="number"
          placeholder="300"
          value={calories}
          onChange={(e) => setCalories(e.target.value)}
          required
          min="1"
        />
        <Button type="submit" loading={loading} className="w-full">
          Registrar treino
        </Button>
      </form>
    </Modal>
  );
}
