'use client';

import { useState, useEffect } from 'react';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import { Sparkles } from 'lucide-react';
import type { FoodLog } from '@/types';

interface EditFoodModalProps {
  open: boolean;
  onClose: () => void;
  log: FoodLog | null;
  onUpdated: (log: FoodLog) => void;
}

const inputCls =
  'w-full rounded-xl border border-zinc-200 dark:border-zinc-700/60 bg-zinc-50 dark:bg-zinc-800/60 px-3 py-2.5 text-[14px] text-zinc-800 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400/60 transition-all';

const labelCls = 'text-[11px] font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500';

export default function EditFoodModal({ open, onClose, log, onUpdated }: EditFoodModalProps) {
  const [foodName, setFoodName] = useState('');
  const [calories, setCalories] = useState(0);
  const [protein, setProtein] = useState(0);
  const [carbs, setCarbs] = useState(0);
  const [fat, setFat] = useState(0);
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && log) {
      setFoodName(log.food_name);
      setCalories(log.calories);
      setProtein(log.protein ?? 0);
      setCarbs(log.carbs ?? 0);
      setFat(log.fat ?? 0);
      setError(null);
    }
  }, [open, log]);

  async function handleReanalyze() {
    if (!foodName.trim()) return;
    setAnalyzing(true);
    setError(null);
    try {
      const res = await fetch('/api/food/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'text', description: foodName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? 'Erro desconhecido');
      setCalories(data.totalCalories ?? 0);
      setProtein(+(data.totalProtein ?? 0).toFixed(1));
      setCarbs(+(data.totalCarbs ?? 0).toFixed(1));
      setFat(+(data.totalFat ?? 0).toFixed(1));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível analisar. Tente novamente.');
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleSave() {
    if (!log) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/food', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: log.id,
          food_name: foodName.trim() || log.food_name,
          calories: Math.round(Number(calories) || 0),
          protein: Number(protein) || null,
          carbs: Number(carbs) || null,
          fat: Number(fat) || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? 'Erro ao salvar');
      onUpdated(data as FoodLog);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao salvar. Tente novamente.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Editar alimento">
      <div className="flex flex-col gap-4">
        {/* Food name */}
        <div className="flex flex-col gap-1.5">
          <span className={labelCls}>Alimento</span>
          <input
            type="text"
            value={foodName}
            onChange={(e) => { setFoodName(e.target.value); setError(null); }}
            className="w-full rounded-xl border border-zinc-200 dark:border-zinc-700/60 bg-zinc-50 dark:bg-zinc-800/60 px-4 py-3 text-[14px] text-zinc-800 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400/60 transition-all"
          />
        </div>

        {/* Re-analyze */}
        <button
          type="button"
          onClick={handleReanalyze}
          disabled={analyzing || !foodName.trim()}
          className="flex items-center justify-center gap-2 h-10 rounded-xl border border-emerald-200 dark:border-emerald-800/60 bg-emerald-50/80 dark:bg-emerald-950/30 text-[13px] font-semibold text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-all disabled:opacity-50 disabled:pointer-events-none"
        >
          {analyzing
            ? <span className="h-3.5 w-3.5 rounded-full border-2 border-emerald-400 border-t-transparent animate-spin" />
            : <Sparkles size={13} />
          }
          {analyzing ? 'Analisando...' : 'Re-analisar com IA'}
        </button>

        {/* Nutritional fields */}
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <span className={labelCls}>Calorias (kcal)</span>
            <input
              type="number"
              min={0}
              value={calories}
              onChange={(e) => setCalories(Number(e.target.value) || 0)}
              className={inputCls}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelCls}>Proteína (g)</span>
            <input
              type="number"
              min={0}
              step={0.1}
              value={protein}
              onChange={(e) => setProtein(Number(e.target.value) || 0)}
              className={inputCls}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelCls}>Carboidratos (g)</span>
            <input
              type="number"
              min={0}
              step={0.1}
              value={carbs}
              onChange={(e) => setCarbs(Number(e.target.value) || 0)}
              className={inputCls}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelCls}>Gordura (g)</span>
            <input
              type="number"
              min={0}
              step={0.1}
              value={fat}
              onChange={(e) => setFat(Number(e.target.value) || 0)}
              className={inputCls}
            />
          </label>
        </div>

        {error && (
          <p className="text-[12px] text-red-500 dark:text-red-400 text-center -mt-1">{error}</p>
        )}

        <Button onClick={handleSave} loading={saving} className="w-full">
          Salvar alterações
        </Button>
      </div>
    </Modal>
  );
}
