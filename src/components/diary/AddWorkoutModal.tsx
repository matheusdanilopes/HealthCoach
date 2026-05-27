'use client';

import { useState, useEffect } from 'react';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import { Sparkles, RotateCcw, Flame } from 'lucide-react';
import type { FoodLog } from '@/types';

const WORKOUT_TYPES = [
  { value: 'musculação', label: 'Musculação', emoji: '🏋️' },
  { value: 'corrida',    label: 'Corrida',    emoji: '🏃' },
  { value: 'caminhada',  label: 'Caminhada',  emoji: '🚶' },
  { value: 'ciclismo',   label: 'Ciclismo',   emoji: '🚴' },
  { value: 'hiit',       label: 'HIIT',       emoji: '⚡' },
  { value: 'funcional',  label: 'Funcional',  emoji: '🤸' },
  { value: 'crossfit',   label: 'CrossFit',   emoji: '💪' },
  { value: 'esportes',   label: 'Esportes',   emoji: '⚽' },
  { value: 'cardio',     label: 'Cardio',     emoji: '❤️' },
  { value: 'outro',      label: 'Outro',      emoji: '🔄' },
] as const;

type WorkoutType = typeof WORKOUT_TYPES[number]['value'];

const INTENSITIES = [
  { value: 'leve',           label: 'Leve',          emoji: '🌤️' },
  { value: 'moderada',       label: 'Moderada',      emoji: '💪' },
  { value: 'intensa',        label: 'Intensa',       emoji: '🔥' },
  { value: 'muito intensa',  label: 'Muito intensa', emoji: '⚡' },
] as const;

type Intensity = typeof INTENSITIES[number]['value'];

interface WorkoutAnalysis {
  estimatedCalories: number;
  intensity: string;
  trainingLoad: string;
  summary: string;
}

interface AddWorkoutModalProps {
  open: boolean;
  onClose: () => void;
  userId: string;
  date?: string;
  onAdded: (log: FoodLog) => void;
}

const LEVEL_STYLE: Record<string, string> = {
  baixa:       'text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-950/30 border-sky-200 dark:border-sky-800/40',
  moderada:    'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/40',
  alta:        'text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800/40',
  'muito alta':'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800/40',
};

function levelStyle(v: string): string {
  return LEVEL_STYLE[v.toLowerCase()] ?? LEVEL_STYLE.moderada;
}

const INPUT_CLASS = cn(
  'w-full rounded-xl border bg-zinc-50 dark:bg-zinc-800/60 px-3 py-2',
  'border-zinc-200 dark:border-zinc-700/60 text-[13px] text-zinc-800 dark:text-zinc-100',
  'focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-400/60 transition-all text-center',
  'placeholder:text-zinc-300 dark:placeholder:text-zinc-600'
);

export default function AddWorkoutModal({ open, onClose, date, onAdded }: AddWorkoutModalProps) {
  const [description, setDescription] = useState('');
  const [workoutType, setWorkoutType]  = useState<WorkoutType | null>(null);
  const [intensity, setIntensity]      = useState<Intensity | null>(null);
  const [duration, setDuration]        = useState('');
  const [heartRate, setHeartRate]      = useState('');
  const [distance, setDistance]        = useState('');
  const [load, setLoad]                = useState('');
  const [notes, setNotes]              = useState('');
  const [analyzing, setAnalyzing]      = useState(false);
  const [result, setResult]            = useState<WorkoutAnalysis | null>(null);
  const [saving, setSaving]            = useState(false);
  const [error, setError]              = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setDescription('');
      setWorkoutType(null);
      setIntensity(null);
      setDuration('');
      setHeartRate('');
      setDistance('');
      setLoad('');
      setNotes('');
      setResult(null);
      setError(null);
      setSaving(false);
      setAnalyzing(false);
    }
  }, [open]);

  const canAnalyze = !!(duration && parseInt(duration) > 0 && (description.trim() || workoutType));

  async function handleAnalyze() {
    setAnalyzing(true);
    setError(null);
    try {
      const res = await fetch('/api/workout/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description:    description.trim()    || undefined,
          workoutType:    workoutType           || undefined,
          intensity:      intensity             || undefined,
          durationMinutes: parseInt(duration),
          heartRate:      heartRate  ? parseInt(heartRate)     : undefined,
          distanceKm:     distance   ? parseFloat(distance)    : undefined,
          loadKg:         load       ? parseFloat(load)        : undefined,
          notes:          notes.trim()          || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? 'Erro desconhecido');
      setResult(json as WorkoutAnalysis);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível analisar. Tente novamente.');
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleConfirm() {
    if (!result) return;
    setSaving(true);
    try {
      const found      = WORKOUT_TYPES.find((t) => t.value === workoutType);
      const emoji      = found?.emoji ?? '🏃';
      const label      = found?.label ?? (description.trim() || 'Treino');
      const durationStr = duration ? ` · ${duration}min` : '';
      const workoutName = `${emoji} ${label}${durationStr}`;

      const res = await fetch('/api/food', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          food_name: workoutName,
          meal_type: 'snack',
          calories:  -result.estimatedCalories,
          log_date:  date,
        }),
      });

      if (!res.ok) return;
      const log = await res.json() as FoodLog;
      onAdded(log);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Registrar treino com IA">
      <div className="flex flex-col gap-4">

        {!result ? (
          <>
            {/* Free-text description */}
            <textarea
              value={description}
              onChange={(e) => { setDescription(e.target.value); setError(null); }}
              placeholder="Descreva seu treino... (ex: 45min de musculação pesada de pernas)"
              rows={2}
              className={cn(
                'w-full resize-none rounded-xl border bg-zinc-50 dark:bg-zinc-800/60 px-4 py-3',
                'border-zinc-200 dark:border-zinc-700/60',
                'text-[14px] leading-relaxed text-zinc-800 dark:text-zinc-100',
                'placeholder:text-zinc-400 dark:placeholder:text-zinc-500',
                'focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-400/60 transition-all'
              )}
            />

            {/* Workout type */}
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500 mb-2">
                Tipo de treino
              </p>
              <div className="grid grid-cols-5 gap-1.5">
                {WORKOUT_TYPES.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setWorkoutType(t.value)}
                    className={cn(
                      'flex flex-col items-center gap-1 py-2.5 rounded-xl border text-[10px] font-semibold transition-all duration-150',
                      workoutType === t.value
                        ? 'bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800/60 text-orange-700 dark:text-orange-400'
                        : 'bg-zinc-50/80 dark:bg-zinc-800/40 border-zinc-200/80 dark:border-zinc-700/40 text-zinc-500 dark:text-zinc-400 hover:border-zinc-300 dark:hover:border-zinc-600'
                    )}
                  >
                    <span className="text-base leading-none">{t.emoji}</span>
                    <span className="leading-tight text-center">{t.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Intensity */}
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500 mb-2">
                Intensidade
              </p>
              <div className="grid grid-cols-4 gap-1.5">
                {INTENSITIES.map((i) => (
                  <button
                    key={i.value}
                    type="button"
                    onClick={() => setIntensity(i.value)}
                    className={cn(
                      'flex flex-col items-center gap-1 py-2.5 rounded-xl border text-[10px] font-semibold transition-all duration-150',
                      intensity === i.value
                        ? 'bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800/60 text-orange-700 dark:text-orange-400'
                        : 'bg-zinc-50/80 dark:bg-zinc-800/40 border-zinc-200/80 dark:border-zinc-700/40 text-zinc-500 dark:text-zinc-400 hover:border-zinc-300 dark:hover:border-zinc-600'
                    )}
                  >
                    <span className="text-base leading-none">{i.emoji}</span>
                    <span className="leading-tight text-center">{i.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Duration */}
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500 mb-2">
                Duração
              </p>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                  placeholder="0"
                  min="1"
                  max="600"
                  className={cn(
                    'w-24 rounded-xl border bg-zinc-50 dark:bg-zinc-800/60 px-3 py-2.5',
                    'border-zinc-200 dark:border-zinc-700/60 text-[15px] font-semibold tabular-nums text-zinc-800 dark:text-zinc-100',
                    'focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-400/60 transition-all text-center'
                  )}
                />
                <span className="text-[13px] text-zinc-400 dark:text-zinc-500 font-medium">minutos</span>
              </div>
            </div>

            {/* Optional fields */}
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500 mb-2">
                Dados adicionais{' '}
                <span className="normal-case font-normal text-zinc-300 dark:text-zinc-600">(opcional)</span>
              </p>
              <div className="grid grid-cols-3 gap-2 mb-2">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-zinc-400 dark:text-zinc-500 font-medium">FC média (bpm)</label>
                  <input
                    type="number"
                    value={heartRate}
                    onChange={(e) => setHeartRate(e.target.value)}
                    placeholder="150"
                    min="40" max="220"
                    className={INPUT_CLASS}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-zinc-400 dark:text-zinc-500 font-medium">Distância (km)</label>
                  <input
                    type="number"
                    value={distance}
                    onChange={(e) => setDistance(e.target.value)}
                    placeholder="5.0"
                    min="0" step="0.1"
                    className={INPUT_CLASS}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-zinc-400 dark:text-zinc-500 font-medium">Carga (kg)</label>
                  <input
                    type="number"
                    value={load}
                    onChange={(e) => setLoad(e.target.value)}
                    placeholder="500"
                    min="0"
                    className={INPUT_CLASS}
                  />
                </div>
              </div>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Observações... (ex: treino pesado com pouco descanso)"
                rows={2}
                className={cn(
                  'w-full resize-none rounded-xl border bg-zinc-50 dark:bg-zinc-800/60 px-4 py-2.5',
                  'border-zinc-200 dark:border-zinc-700/60',
                  'text-[13px] leading-relaxed text-zinc-800 dark:text-zinc-100',
                  'placeholder:text-zinc-400 dark:placeholder:text-zinc-500',
                  'focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-400/60 transition-all'
                )}
              />
            </div>

            <Button
              onClick={handleAnalyze}
              loading={analyzing}
              disabled={!canAnalyze}
              variant="orange"
              className="w-full gap-2"
            >
              <Sparkles size={14} />
              Analisar com IA
            </Button>
          </>
        ) : (
          /* ── Result step ── */
          <div className="flex flex-col gap-3">
            {/* Calorie card */}
            <div className="bg-gradient-to-br from-orange-50 to-amber-50 dark:from-orange-950/40 dark:to-amber-950/30 rounded-2xl px-5 py-5 border border-orange-100 dark:border-orange-900/40">
              <div className="flex items-center gap-2 mb-2">
                <Flame size={13} className="text-orange-500" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-orange-500 dark:text-orange-400">
                  Gasto estimado
                </span>
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-[44px] font-bold tabular-nums text-orange-700 dark:text-orange-300 leading-none tracking-tight">
                  {result.estimatedCalories.toLocaleString('pt-BR')}
                </span>
                <span className="text-[15px] font-medium text-orange-400 dark:text-orange-500">kcal</span>
              </div>
            </div>

            {/* Intensity + Load badges */}
            <div className="grid grid-cols-2 gap-2">
              <div className={cn('rounded-xl border px-3 py-2.5 flex flex-col items-center gap-0.5', levelStyle(result.intensity))}>
                <span className="text-[9px] font-bold uppercase tracking-wider opacity-60">Intensidade</span>
                <span className="text-[13px] font-bold capitalize">{result.intensity}</span>
              </div>
              <div className={cn('rounded-xl border px-3 py-2.5 flex flex-col items-center gap-0.5', levelStyle(result.trainingLoad))}>
                <span className="text-[9px] font-bold uppercase tracking-wider opacity-60">Carga</span>
                <span className="text-[13px] font-bold capitalize">{result.trainingLoad}</span>
              </div>
            </div>

            {/* Summary */}
            <div className="bg-zinc-50 dark:bg-zinc-800/60 rounded-xl px-4 py-3 border border-zinc-100 dark:border-zinc-700/40">
              <p className="text-[13px] text-zinc-600 dark:text-zinc-300 leading-relaxed">
                {result.summary}
              </p>
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { setResult(null); setError(null); }}
                className="flex items-center gap-1.5 px-4 h-10 rounded-xl border border-zinc-200 dark:border-zinc-700/60 text-[13px] font-medium text-zinc-500 dark:text-zinc-400 hover:border-zinc-300 dark:hover:border-zinc-600 transition-colors"
              >
                <RotateCcw size={12} />
                Refazer
              </button>
              <Button
                onClick={handleConfirm}
                loading={saving}
                variant="orange"
                className="flex-1"
              >
                Confirmar treino
              </Button>
            </div>
          </div>
        )}

        {error && (
          <p className="text-[12px] text-red-500 dark:text-red-400 text-center -mt-1">{error}</p>
        )}
      </div>
    </Modal>
  );
}
