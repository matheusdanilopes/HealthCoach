'use client';

import { useState } from 'react';
import { AlertCircle, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  DAYS_PER_WEEK_OPTS,
  EXPERIENCE_OPTS,
  HOME_EQUIPMENT_OPTS,
  SESSION_MINUTES_OPTS,
  type TrainingProfile,
} from '@/lib/training';

function Label({ children }: { children: React.ReactNode }) {
  return <p className="text-[12px] font-semibold text-zinc-700 dark:text-zinc-300 mb-2">{children}</p>;
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-xl border px-3 py-2 text-[12.5px] font-semibold transition-all duration-150 active:scale-[0.97]',
        active
          ? 'border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300'
          : 'border-zinc-200/70 text-zinc-600 hover:border-zinc-300 dark:border-zinc-800 dark:text-zinc-300 dark:hover:border-zinc-700'
      )}
    >
      {children}
    </button>
  );
}

export default function TrainingProfileForm({
  initial,
  onSaved,
  onCancel,
}: {
  initial: TrainingProfile;
  onSaved: (profile: TrainingProfile) => void;
  onCancel?: () => void;
}) {
  const [form, setForm] = useState<TrainingProfile>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof TrainingProfile>(key: K, value: TrainingProfile[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const toggleEquipment = (value: string) =>
    set('homeEquipment', form.homeEquipment.includes(value)
      ? form.homeEquipment.filter((e) => e !== value)
      : [...form.homeEquipment, value]);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/training/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.profile) {
        setError(data?.error ?? 'Não foi possível salvar. Tente novamente.');
        return;
      }
      onSaved(data.profile as TrainingProfile);
    } catch {
      setError('Falha de conexão. Verifique sua internet e tente novamente.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Label>Seu nível de experiência</Label>
        <div className="grid grid-cols-3 gap-2">
          {EXPERIENCE_OPTS.map((o) => {
            const active = form.experience === o.value;
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => set('experience', o.value)}
                className={cn(
                  'flex flex-col items-center gap-0.5 rounded-2xl border px-2 py-3 text-center transition-all duration-150 active:scale-[0.97]',
                  active
                    ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30'
                    : 'border-zinc-200/70 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700'
                )}
              >
                <span className={cn('text-[12px] font-semibold', active ? 'text-emerald-700 dark:text-emerald-300' : 'text-zinc-700 dark:text-zinc-200')}>
                  {o.label}
                </span>
                <span className="text-[10px] text-zinc-400 dark:text-zinc-500">{o.desc}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <Label>Dias de treino por semana</Label>
        <div className="flex flex-wrap gap-2">
          {DAYS_PER_WEEK_OPTS.map((d) => (
            <Chip key={d} active={form.daysPerWeek === d} onClick={() => set('daysPerWeek', d)}>{d} dias</Chip>
          ))}
        </div>
      </div>

      <div>
        <Label>Tempo por treino</Label>
        <div className="flex flex-wrap gap-2">
          {SESSION_MINUTES_OPTS.map((m) => (
            <Chip key={m} active={form.sessionMinutes === m} onClick={() => set('sessionMinutes', m)}>{m} min</Chip>
          ))}
        </div>
      </div>

      <div>
        <Label>Equipamentos que você tem em casa</Label>
        <div className="flex flex-wrap gap-2">
          {HOME_EQUIPMENT_OPTS.map((o) => {
            const active = form.homeEquipment.includes(o.value);
            return (
              <Chip key={o.value} active={active} onClick={() => toggleEquipment(o.value)}>
                <span className="inline-flex items-center gap-1">
                  {active && <Check className="w-3 h-3" />}
                  {o.label}
                </span>
              </Chip>
            );
          })}
        </div>
        <p className="mt-1.5 text-[11px] text-zinc-400 dark:text-zinc-500">
          Sem nada marcado, os treinos em casa usam só o peso do corpo.
        </p>
      </div>

      <div>
        <Label>Lesões, dores ou limitações</Label>
        <textarea
          value={form.limitations}
          onChange={(e) => set('limitations', e.target.value)}
          maxLength={500}
          rows={2}
          placeholder="Ex.: dor no joelho direito ao agachar, hérnia lombar…"
          className="w-full rounded-xl bg-zinc-50/80 dark:bg-zinc-800/50 border border-zinc-200/80 dark:border-zinc-700/50 px-3.5 py-2.5 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/25 focus:border-emerald-400/80 resize-none"
        />
      </div>

      {error && (
        <div className="flex gap-2 rounded-xl bg-red-50 dark:bg-red-950/30 p-3 text-[12px] text-red-700 dark:text-red-300">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-px" />
          <p>{error}</p>
        </div>
      )}

      <div className="flex gap-2">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="h-11 flex-1 rounded-2xl bg-zinc-100 dark:bg-zinc-800 text-[13.5px] font-semibold text-zinc-700 dark:text-zinc-200 transition-all active:scale-[0.98]"
          >
            Cancelar
          </button>
        )}
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="flex items-center justify-center gap-2 h-11 flex-[2] rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white text-[13.5px] font-semibold shadow-lg shadow-emerald-600/25 transition-all active:scale-[0.98] disabled:opacity-70"
        >
          {saving && <span className="h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin" />}
          Salvar perfil de treino
        </button>
      </div>
    </div>
  );
}
