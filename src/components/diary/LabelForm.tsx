'use client';

import { useState } from 'react';
import { Tag } from 'lucide-react';
import type { FoodReference } from '@/lib/nutrition/validation';

export interface SavedCustomFood {
  id: string;
  reference: FoodReference;
  porcao_g: number;
  warnings: string[];
}

interface LabelFormProps {
  initialName: string;
  initialPortion?: number | null;
  onSaved: (food: SavedCustomFood) => void;
  onCancel: () => void;
}

const inputCls =
  'w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2 py-1 text-[12px] text-zinc-800 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-sky-400';
const labelCls = 'text-[10px] text-zinc-400 uppercase tracking-wide';

/**
 * Cadastro dos dados do rótulo (valores da porção, como impressos na
 * embalagem). Fica salvo em custom_foods e é usado nos próximos lançamentos
 * desse alimento no lugar da estimativa.
 */
export default function LabelForm({ initialName, initialPortion, onSaved, onCancel }: LabelFormProps) {
  const [nome, setNome] = useState(initialName);
  const [porcao, setPorcao] = useState(initialPortion ? String(initialPortion) : '');
  const [kcal, setKcal] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/custom-foods', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome: nome.trim(),
          porcao_g: Number(porcao.replace(',', '.')),
          calories: Number(kcal.replace(',', '.')),
          protein: protein === '' ? null : Number(protein.replace(',', '.')),
          carbs: carbs === '' ? null : Number(carbs.replace(',', '.')),
          fat: fat === '' ? null : Number(fat.replace(',', '.')),
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? 'Não foi possível salvar o rótulo.');
      const f = data.food;
      onSaved({
        id: f.id,
        porcao_g: Number(f.porcao_g),
        warnings: (data.validation?.issues ?? []).map((i: { message: string }) => i.message),
        reference: {
          nome: f.nome, source: 'rotulo',
          kcal_100g: Number(f.kcal_100g),
          protein_100g: f.protein_100g == null ? null : Number(f.protein_100g),
          carbs_100g: f.carbs_100g == null ? null : Number(f.carbs_100g),
          fat_100g: f.fat_100g == null ? null : Number(f.fat_100g),
        },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível salvar o rótulo.');
    } finally {
      setSaving(false);
    }
  }

  const valid = nome.trim() && Number(porcao.replace(',', '.')) > 0 && kcal !== '' && Number(kcal.replace(',', '.')) >= 0;

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-sky-100 dark:border-sky-900/40 bg-sky-50/60 dark:bg-sky-950/20 p-3">
      <p className="flex items-center gap-1.5 text-[11px] font-semibold text-sky-700 dark:text-sky-400">
        <Tag size={11} /> Dados do rótulo (por porção)
      </p>
      <label className="flex flex-col gap-0.5">
        <span className={labelCls}>Nome</span>
        <input className={inputCls} value={nome} onChange={(e) => setNome(e.target.value)} />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-0.5">
          <span className={labelCls}>Porção (g)</span>
          <input className={inputCls} inputMode="decimal" value={porcao} onChange={(e) => setPorcao(e.target.value)} />
        </label>
        <label className="flex flex-col gap-0.5">
          <span className={labelCls}>Kcal da porção</span>
          <input className={inputCls} inputMode="decimal" value={kcal} onChange={(e) => setKcal(e.target.value)} />
        </label>
        <label className="flex flex-col gap-0.5">
          <span className={labelCls}>Proteína (g)</span>
          <input className={inputCls} inputMode="decimal" value={protein} onChange={(e) => setProtein(e.target.value)} />
        </label>
        <label className="flex flex-col gap-0.5">
          <span className={labelCls}>Carbs (g)</span>
          <input className={inputCls} inputMode="decimal" value={carbs} onChange={(e) => setCarbs(e.target.value)} />
        </label>
        <label className="flex flex-col gap-0.5 col-span-2">
          <span className={labelCls}>Gordura (g)</span>
          <input className={inputCls} inputMode="decimal" value={fat} onChange={(e) => setFat(e.target.value)} />
        </label>
      </div>
      {error && <p className="text-[11px] text-red-500 dark:text-red-400">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 h-8 rounded-lg border border-zinc-200 dark:border-zinc-700 text-[12px] font-medium text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-700/50"
        >
          Agora não
        </button>
        <button
          type="button"
          onClick={save}
          disabled={!valid || saving}
          className="flex-1 h-8 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-[12px] font-semibold disabled:opacity-40 disabled:pointer-events-none"
        >
          {saving ? 'Salvando…' : 'Salvar rótulo'}
        </button>
      </div>
    </div>
  );
}
