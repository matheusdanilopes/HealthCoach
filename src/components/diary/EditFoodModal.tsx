'use client';

import { useState, useEffect, useRef } from 'react';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import { Sparkles, AlertTriangle, Droplets } from 'lucide-react';
import { detectBeverage } from '@/lib/beverages';
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
  const [hydrationMl, setHydrationMl] = useState(0);
  const [isBeverageField, setIsBeverageField] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [needsReanalysis, setNeedsReanalysis] = useState(false);

  const initialRef = useRef({ foodName: '', calories: 0, protein: 0, carbs: 0, fat: 0, hydrationMl: 0 });

  useEffect(() => {
    if (open && log) {
      const isBev = (log.hydration_ml ?? 0) > 0 || detectBeverage(log.food_name).isBeverage;
      const init = {
        foodName: log.food_name,
        calories: log.calories,
        protein: log.protein ?? 0,
        carbs: log.carbs ?? 0,
        fat: log.fat ?? 0,
        hydrationMl: log.hydration_ml ?? 0,
      };
      initialRef.current = init;
      setFoodName(init.foodName);
      setCalories(init.calories);
      setProtein(init.protein);
      setCarbs(init.carbs);
      setFat(init.fat);
      setHydrationMl(init.hydrationMl);
      setIsBeverageField(isBev);
      setError(null);
      setIsDirty(false);
      setConfirmClose(false);
      setNeedsReanalysis(false);
    }
  }, [open, log]);

  function markDirty() { setIsDirty(true); }

  function handleClose() {
    if (isDirty) {
      setConfirmClose(true);
    } else {
      onClose();
    }
  }

  function handleFoodNameChange(name: string) {
    setFoodName(name);
    setError(null);
    markDirty();
    setNeedsReanalysis(true);
    // Update beverage field visibility when name changes
    const det = detectBeverage(name);
    setIsBeverageField(det.isBeverage || hydrationMl > 0);
    if (det.isBeverage && hydrationMl === 0) {
      setHydrationMl(det.estimatedMl);
    }
  }

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

      // Update hydration from AI or local detection
      const aiHydration = data.foods?.[0]?.hydration_ml;
      if (typeof aiHydration === 'number') {
        setHydrationMl(aiHydration);
      } else {
        const det = detectBeverage(foodName.trim());
        setHydrationMl(det.estimatedMl);
        setIsBeverageField(det.isBeverage || hydrationMl > 0);
      }

      setIsDirty(true);
      setNeedsReanalysis(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível analisar. Tente novamente.');
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleSave() {
    if (!log) return;
    if (needsReanalysis) {
      setError('Re-analise com IA antes de salvar as alterações.');
      return;
    }
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
          hydration_ml: Math.min(Math.max(0, Math.round(Number(hydrationMl) || 0)), 2000),
          hydration_source: hydrationMl > 0 ? (log.hydration_source ?? 'meal') : null,
          hydration_confidence: hydrationMl > 0 ? (log.hydration_confidence ?? 'medium') : null,
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
    <Modal open={open} onClose={handleClose} title="Editar alimento">
      {confirmClose ? (
        <div className="flex flex-col items-center gap-5 py-3">
          <div className="flex flex-col items-center gap-2 text-center">
            <div className="h-10 w-10 rounded-full bg-amber-50 dark:bg-amber-950/30 flex items-center justify-center">
              <AlertTriangle size={18} className="text-amber-500" />
            </div>
            <p className="text-[14px] font-semibold text-zinc-800 dark:text-zinc-200">
              Sair sem salvar?
            </p>
            <p className="text-[13px] text-zinc-500 dark:text-zinc-400">
              As alterações feitas serão descartadas.
            </p>
          </div>
          <div className="flex gap-2 w-full">
            <button
              type="button"
              onClick={() => setConfirmClose(false)}
              className="flex-1 h-10 rounded-xl border border-zinc-200 dark:border-zinc-700 text-[13px] font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/60 transition-all"
            >
              Continuar
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 h-10 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/60 text-[13px] font-semibold text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-950/50 transition-all"
            >
              Sair mesmo assim
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {/* Food name */}
          <div className="flex flex-col gap-1.5">
            <span className={labelCls}>Alimento</span>
            <input
              type="text"
              value={foodName}
              onChange={(e) => handleFoodNameChange(e.target.value)}
              className="w-full rounded-xl border border-zinc-200 dark:border-zinc-700/60 bg-zinc-50 dark:bg-zinc-800/60 px-4 py-3 text-[14px] text-zinc-800 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400/60 transition-all"
            />
          </div>

          {/* Re-analyze */}
          <button
            type="button"
            onClick={handleReanalyze}
            disabled={analyzing || !foodName.trim()}
            className={`flex items-center justify-center gap-2 h-10 rounded-xl border text-[13px] font-semibold transition-all disabled:opacity-50 disabled:pointer-events-none ${
              needsReanalysis
                ? 'border-emerald-400 dark:border-emerald-600 bg-emerald-100 dark:bg-emerald-900/50 text-emerald-800 dark:text-emerald-300 ring-2 ring-emerald-400/40'
                : 'border-emerald-200 dark:border-emerald-800/60 bg-emerald-50/80 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/40'
            }`}
          >
            {analyzing
              ? <span className="h-3.5 w-3.5 rounded-full border-2 border-emerald-400 border-t-transparent animate-spin" />
              : <Sparkles size={13} />
            }
            {analyzing ? 'Analisando...' : needsReanalysis ? 'Re-analisar com IA (obrigatório)' : 'Re-analisar com IA'}
          </button>

          {/* Nutritional fields */}
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className={labelCls}>Calorias (kcal)</span>
              <input
                type="number" min={0}
                value={calories}
                onChange={(e) => { setCalories(Number(e.target.value) || 0); markDirty(); }}
                className={inputCls}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className={labelCls}>Proteína (g)</span>
              <input
                type="number" min={0} step={0.1}
                value={protein}
                onChange={(e) => { setProtein(Number(e.target.value) || 0); markDirty(); }}
                className={inputCls}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className={labelCls}>Carboidratos (g)</span>
              <input
                type="number" min={0} step={0.1}
                value={carbs}
                onChange={(e) => { setCarbs(Number(e.target.value) || 0); markDirty(); }}
                className={inputCls}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className={labelCls}>Gordura (g)</span>
              <input
                type="number" min={0} step={0.1}
                value={fat}
                onChange={(e) => { setFat(Number(e.target.value) || 0); markDirty(); }}
                className={inputCls}
              />
            </label>
          </div>

          {/* Hydration field — shown for beverages */}
          {isBeverageField && (
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-teal-500 dark:text-teal-400 flex items-center gap-1">
                <Droplets size={10} /> Hidratação contabilizada (ml)
              </span>
              <input
                type="number" min={0} max={2000} step={10}
                value={hydrationMl}
                onChange={(e) => { setHydrationMl(Math.min(Number(e.target.value) || 0, 2000)); markDirty(); }}
                className="w-full rounded-xl border border-teal-200 dark:border-teal-800/60 bg-teal-50/50 dark:bg-teal-950/20 px-3 py-2.5 text-[14px] text-zinc-800 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-400/60 transition-all"
              />
              <p className="text-[10px] text-zinc-400 dark:text-zinc-500">
                Ajuste os ml que contam para a sua meta diária de hidratação (0 para remover)
              </p>
            </label>
          )}

          {error && (
            <p className="text-[12px] text-red-500 dark:text-red-400 text-center -mt-1">{error}</p>
          )}

          <Button onClick={handleSave} loading={saving} disabled={saving || needsReanalysis} className="w-full">
            Salvar alterações
          </Button>
        </div>
      )}
    </Modal>
  );
}
