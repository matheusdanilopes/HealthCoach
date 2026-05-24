'use client';

import { useState } from 'react';
import Modal from '@/components/ui/Modal';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import { createClient } from '@/lib/supabase/client';
import { todayISO } from '@/lib/utils';

interface WeightLogModalProps {
  open: boolean;
  onClose: () => void;
  userId: string;
  currentWeight: number;
  onLogged: () => void;
}

export default function WeightLogModal({
  open,
  onClose,
  userId,
  currentWeight,
  onLogged,
}: WeightLogModalProps) {
  const [weight, setWeight] = useState(String(currentWeight));
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const supabase = createClient();
    const w = parseFloat(weight);

    await Promise.all([
      supabase.from('weight_logs').upsert({
        user_id: userId,
        date: todayISO(),
        weight: w,
      }),
      supabase
        .from('profiles')
        .update({ current_weight: w, updated_at: new Date().toISOString() })
        .eq('id', userId),
    ]);

    setLoading(false);
    onLogged();
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title="Registrar peso">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <p className="text-sm text-zinc-500">
          Registre seu peso diariamente para acompanhar sua evolução.
        </p>
        <Input
          label="Peso atual (kg)"
          type="number"
          step="0.1"
          min="30"
          max="300"
          value={weight}
          onChange={(e) => setWeight(e.target.value)}
          required
        />
        <Button type="submit" loading={loading} className="w-full">
          Salvar peso
        </Button>
      </form>
    </Modal>
  );
}
