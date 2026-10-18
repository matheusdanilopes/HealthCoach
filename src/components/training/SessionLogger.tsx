'use client';

import { useEffect, useState } from 'react';
import { AlertCircle, Check, Minus, Plus, Timer, TrendingUp, X } from 'lucide-react';
import Card from '@/components/ui/Card';
import { cn } from '@/lib/utils';
import {
  exerciseKey,
  suggestNext,
  type ExerciseHistory,
  type WorkoutPlan,
  type WorkoutSessionSummary,
} from '@/lib/training';
import { targetText } from './ExerciseCard';

interface SetRow {
  value: string;
  kg: string;
  done: boolean;
}

export interface SessionDraft {
  planId: string;
  dayIndex: number;
  startedAt: number;
  rows: SetRow[][];
}

// The workout in progress is kept on the device so leaving the screen (or the
// phone locking) mid-workout doesn't lose the sets already done.
const draftKey = (userId: string) => `healthcoach:training-session:${userId}`;

export function loadDraft(userId: string): SessionDraft | null {
  try {
    const raw = localStorage.getItem(draftKey(userId));
    return raw ? (JSON.parse(raw) as SessionDraft) : null;
  } catch {
    return null;
  }
}

function saveDraft(userId: string, draft: SessionDraft) {
  try {
    localStorage.setItem(draftKey(userId), JSON.stringify(draft));
  } catch {
    // Storage full or blocked — the session still works for this visit.
  }
}

export function clearDraft(userId: string) {
  try {
    localStorage.removeItem(draftKey(userId));
  } catch {
    // Ignore unavailable storage.
  }
}

export function newDraft(plan: WorkoutPlan, dayIndex: number, history: Record<string, ExerciseHistory>): SessionDraft {
  const day = plan.days[dayIndex];
  return {
    planId: plan.id,
    dayIndex,
    startedAt: Date.now(),
    rows: day.exercises.map((ex) => {
      const s = suggestNext(ex, history[exerciseKey(ex.name)]);
      const value = ex.timed ? s.seconds : s.reps;
      return Array.from({ length: ex.sets }, () => ({
        value: value != null ? String(value) : '',
        kg: s.loadKg != null ? String(s.loadKg).replace('.', ',') : '',
        done: false,
      }));
    }),
  };
}

const parseKg = (v: string) => {
  const n = Number(v.replace(',', '.'));
  return v.trim() && Number.isFinite(n) && n >= 0 ? n : null;
};

const inputClass =
  'h-10 w-full min-w-0 rounded-xl bg-zinc-50/80 dark:bg-zinc-800/50 border border-zinc-200/80 dark:border-zinc-700/50 px-2 text-center text-[14px] tabular-nums text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/25 focus:border-emerald-400/80';

function formatClock(totalSeconds: number) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function SessionLogger({
  userId,
  plan,
  initialDraft,
  history,
  onSaved,
  onCancel,
}: {
  userId: string;
  plan: WorkoutPlan;
  initialDraft: SessionDraft;
  history: Record<string, ExerciseHistory>;
  onSaved: (session: WorkoutSessionSummary, history: Record<string, ExerciseHistory>) => void;
  onCancel: () => void;
}) {
  const day = plan.days[initialDraft.dayIndex];
  const [draft, setDraft] = useState<SessionDraft>(initialDraft);
  const [rest, setRest] = useState<{ endsAt: number; left: number } | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [duration, setDuration] = useState('');
  const [rpe, setRpe] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);

  useEffect(() => saveDraft(userId, draft), [userId, draft]);

  const restEndsAt = rest?.endsAt;
  useEffect(() => {
    if (restEndsAt == null) return;
    const id = setInterval(() => {
      const left = Math.max(0, Math.round((restEndsAt - Date.now()) / 1000));
      if (left === 0) {
        setRest(null);
        try { navigator.vibrate?.([200, 100, 200]); } catch { /* unsupported */ }
      } else {
        setRest((r) => (r ? { ...r, left } : r));
      }
    }, 500);
    return () => clearInterval(id);
  }, [restEndsAt]);

  const updateRow = (ei: number, si: number, patch: Partial<SetRow>) =>
    setDraft((d) => ({
      ...d,
      rows: d.rows.map((sets, i) => (i === ei ? sets.map((r, j) => (j === si ? { ...r, ...patch } : r)) : sets)),
    }));

  function toggleDone(ei: number, si: number) {
    const row = draft.rows[ei][si];
    updateRow(ei, si, { done: !row.done });
    if (!row.done) {
      const seconds = day.exercises[ei].restSeconds;
      setRest({ endsAt: Date.now() + seconds * 1000, left: seconds });
    }
  }

  const addSet = (ei: number) =>
    setDraft((d) => ({
      ...d,
      rows: d.rows.map((sets, i) => {
        if (i !== ei) return sets;
        const last = sets.at(-1);
        return [...sets, { value: last?.value ?? '', kg: last?.kg ?? '', done: false }];
      }),
    }));

  const removeSet = (ei: number) =>
    setDraft((d) => ({
      ...d,
      rows: d.rows.map((sets, i) => (i === ei && sets.length > 1 ? sets.slice(0, -1) : sets)),
    }));

  const doneCount = draft.rows.flat().filter((r) => r.done).length;
  const totalCount = draft.rows.flat().length;

  function openFinish() {
    const elapsed = Math.round((Date.now() - draft.startedAt) / 60_000);
    setDuration(String(elapsed >= 5 && elapsed <= 240 ? elapsed : day.durationMin));
    setFinishing(true);
    setError(null);
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const exercises = day.exercises.map((ex, ei) => ({
        name: ex.name,
        sets: draft.rows[ei]
          .filter((r) => r.done && r.value.trim())
          .map((r) => ({
            reps: ex.timed ? null : Number(r.value),
            seconds: ex.timed ? Number(r.value) : null,
            loadKg: parseKg(r.kg),
          })),
      })).filter((e) => e.sets.length > 0);

      const res = await fetch('/api/training/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planId: plan.id,
          dayLabel: day.focus ? `${day.label} · ${day.focus}` : day.label,
          durationMin: Number(duration),
          rpe,
          exercises,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.session) {
        setError(data?.error ?? 'Não foi possível salvar o treino. Tente novamente.');
        return;
      }
      clearDraft(userId);
      onSaved(data.session as WorkoutSessionSummary, (data.history ?? history) as Record<string, ExerciseHistory>);
    } catch {
      setError('Falha de conexão. Seu treino continua salvo no aparelho; tente de novo.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 animate-fade-in">
      <Card className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">Treino em andamento</p>
            <p className="text-[17px] font-bold text-zinc-900 dark:text-zinc-50 leading-tight mt-0.5">{day.label}</p>
            {day.focus && <p className="text-[12px] text-zinc-500 dark:text-zinc-400">{day.focus}</p>}
          </div>
          <span className="flex-shrink-0 rounded-full bg-emerald-50 dark:bg-emerald-950/40 px-2.5 py-1 text-[12px] font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">
            {doneCount}/{totalCount} séries
          </span>
        </div>
        {day.warmup.length > 0 && (
          <p className="mt-3 text-[12px] leading-relaxed text-zinc-600 dark:text-zinc-400">
            <span className="font-semibold text-zinc-700 dark:text-zinc-300">Aquecimento: </span>
            {day.warmup.join(' · ')}
          </p>
        )}
      </Card>

      {rest && (
        <div className="sticky top-2 z-10 flex items-center justify-between gap-3 rounded-2xl bg-sky-600 px-4 py-3 text-white shadow-lg shadow-sky-600/25">
          <span className="flex items-center gap-2 text-[13px] font-semibold">
            <Timer className="w-4 h-4" /> Descanso
          </span>
          <span className="text-[20px] font-bold tabular-nums">{formatClock(rest.left)}</span>
          <button type="button" onClick={() => setRest(null)} className="text-[12px] font-semibold underline underline-offset-2">
            Pular
          </button>
        </div>
      )}

      {day.exercises.map((ex, ei) => {
        const last = history[exerciseKey(ex.name)];
        const hint = suggestNext(ex, last).hint;
        return (
          <Card key={ei} className="p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[14px] font-semibold text-zinc-900 dark:text-zinc-50 leading-snug">{ei + 1}. {ex.name}</p>
                <p className="text-[11.5px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                  Meta {targetText(ex)} · descanso {ex.restSeconds}s
                </p>
              </div>
            </div>
            {hint && (
              <p className="mt-2 flex gap-1.5 text-[11.5px] leading-relaxed text-sky-700 dark:text-sky-300">
                <TrendingUp className="w-3.5 h-3.5 flex-shrink-0 mt-[1px]" />
                {hint}
              </p>
            )}

            <div className="mt-3 grid grid-cols-[28px_1fr_1fr_44px] gap-2 items-center text-[10.5px] font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
              <span>Série</span>
              <span className="text-center">{ex.timed ? 'Segundos' : 'Reps'}</span>
              <span className="text-center">Carga (kg)</span>
              <span />
            </div>
            <div className="mt-1.5 flex flex-col gap-2">
              {draft.rows[ei].map((row, si) => (
                <div key={si} className="grid grid-cols-[28px_1fr_1fr_44px] gap-2 items-center">
                  <span className="text-[13px] font-bold tabular-nums text-zinc-500 dark:text-zinc-400 text-center">{si + 1}</span>
                  <input
                    inputMode="numeric"
                    value={row.value}
                    onChange={(e) => updateRow(ei, si, { value: e.target.value.replace(/\D/g, '').slice(0, 4) })}
                    className={cn(inputClass, row.done && 'opacity-60')}
                    aria-label={`${ex.timed ? 'Segundos' : 'Repetições'} da série ${si + 1}`}
                  />
                  <input
                    inputMode="decimal"
                    value={row.kg}
                    placeholder="—"
                    onChange={(e) => updateRow(ei, si, { kg: e.target.value.replace(/[^\d,.]/g, '').slice(0, 6) })}
                    className={cn(inputClass, row.done && 'opacity-60')}
                    aria-label={`Carga da série ${si + 1}`}
                  />
                  <button
                    type="button"
                    onClick={() => toggleDone(ei, si)}
                    disabled={!row.value.trim()}
                    aria-label={row.done ? 'Desmarcar série' : 'Marcar série como feita'}
                    className={cn(
                      'h-10 w-11 rounded-xl flex items-center justify-center transition-all active:scale-95 disabled:opacity-40',
                      row.done
                        ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-600/25'
                        : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400'
                    )}
                  >
                    <Check className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
            <div className="mt-2 flex gap-2">
              <button type="button" onClick={() => addSet(ei)} className="inline-flex items-center gap-1 text-[12px] font-semibold text-emerald-600 dark:text-emerald-400">
                <Plus className="w-3.5 h-3.5" /> Série
              </button>
              {draft.rows[ei].length > 1 && (
                <button type="button" onClick={() => removeSet(ei)} className="inline-flex items-center gap-1 text-[12px] font-semibold text-zinc-400">
                  <Minus className="w-3.5 h-3.5" /> Série
                </button>
              )}
            </div>
          </Card>
        );
      })}

      {day.cooldown.length > 0 && (
        <Card className="p-4">
          <p className="text-[12px] leading-relaxed text-zinc-600 dark:text-zinc-400">
            <span className="font-semibold text-zinc-700 dark:text-zinc-300">Desaquecimento: </span>
            {day.cooldown.join(' · ')}
          </p>
        </Card>
      )}

      {finishing ? (
        <Card className="p-4 flex flex-col gap-3">
          <p className="text-[14px] font-semibold text-zinc-900 dark:text-zinc-50">Finalizar treino</p>
          <div>
            <p className="text-[12px] font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">Duração (min)</p>
            <input
              inputMode="numeric"
              value={duration}
              onChange={(e) => setDuration(e.target.value.replace(/\D/g, '').slice(0, 3))}
              className={cn(inputClass, 'w-28')}
            />
          </div>
          <div>
            <p className="text-[12px] font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
              Esforço percebido <span className="font-normal text-zinc-400">(1 = muito leve, 10 = máximo)</span>
            </p>
            <div className="grid grid-cols-10 gap-1">
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setRpe(rpe === n ? null : n)}
                  className={cn(
                    'h-9 rounded-lg text-[12.5px] font-bold tabular-nums transition-all active:scale-95',
                    rpe === n ? 'bg-emerald-600 text-white' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300'
                  )}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
          {doneCount === 0 && (
            <p className="text-[12px] text-amber-700 dark:text-amber-400">Marque com ✓ as séries que você fez antes de salvar.</p>
          )}
          {error && (
            <div className="flex gap-2 rounded-xl bg-red-50 dark:bg-red-950/30 p-3 text-[12px] text-red-700 dark:text-red-300">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-px" />
              <p>{error}</p>
            </div>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setFinishing(false)}
              disabled={saving}
              className="h-11 flex-1 rounded-2xl bg-zinc-100 dark:bg-zinc-800 text-[13.5px] font-semibold text-zinc-700 dark:text-zinc-200"
            >
              Voltar
            </button>
            <button
              type="button"
              onClick={save}
              disabled={saving || doneCount === 0 || !Number(duration)}
              className="flex items-center justify-center gap-2 h-11 flex-[2] rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white text-[13.5px] font-semibold shadow-lg shadow-emerald-600/25 transition-all active:scale-[0.98] disabled:opacity-60"
            >
              {saving && <span className="h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin" />}
              Salvar treino
            </button>
          </div>
        </Card>
      ) : confirmCancel ? (
        <Card className="p-4 flex flex-col gap-3">
          <p className="text-[13.5px] font-semibold text-zinc-900 dark:text-zinc-50">Descartar este treino?</p>
          <p className="text-[12px] text-zinc-500 dark:text-zinc-400">As séries marcadas não serão salvas.</p>
          <div className="flex gap-2">
            <button type="button" onClick={() => setConfirmCancel(false)} className="h-11 flex-1 rounded-2xl bg-zinc-100 dark:bg-zinc-800 text-[13.5px] font-semibold text-zinc-700 dark:text-zinc-200">
              Continuar treino
            </button>
            <button
              type="button"
              onClick={() => { clearDraft(userId); onCancel(); }}
              className="h-11 flex-1 rounded-2xl bg-red-50 dark:bg-red-950/30 text-[13.5px] font-semibold text-red-600 dark:text-red-400"
            >
              Descartar
            </button>
          </div>
        </Card>
      ) : (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setConfirmCancel(true)}
            className="h-12 w-12 flex-shrink-0 rounded-2xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-500"
            aria-label="Descartar treino"
          >
            <X className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={openFinish}
            className="flex items-center justify-center gap-2 h-12 flex-1 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white text-[14px] font-semibold shadow-lg shadow-emerald-600/25 transition-all active:scale-[0.98]"
          >
            <Check className="w-4 h-4" /> Finalizar treino
          </button>
        </div>
      )}
    </div>
  );
}
