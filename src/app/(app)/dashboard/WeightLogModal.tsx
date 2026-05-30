'use client';

import { useState } from 'react';
import Modal from '@/components/ui/Modal';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';

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
    await fetch('/api/weight', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ weight_kg: parseFloat(weight) }),
    });
    setLoading(false);
    onLogged();
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title="Registrar peso">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <p className="text-[13px] text-zinc-500 dark:text-zinc-400 leading-relaxed">
          Registre seu peso diariamente para acompanhar sua evolução ao longo do tempo.
        </p>
        <Input
          label="Peso atual (kg)"
          type="number"
          step="0.01"
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
