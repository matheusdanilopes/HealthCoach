'use client';

import { useState } from 'react';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import {
  Sparkles, RotateCcw, Flame,
  ChevronRight, ChevronLeft,
  Plus, Minus, AlertTriangle,
} from 'lucide-react';
import type { FoodLog } from '@/types';

const WORKOUT_TYPES = [
  { value: 'musculação', label: 'Musculação', emoji: '🏋️' },
  { value: 'corrida',    label: 'Corrida',    emoji: '🏃' },
  { value: 'caminhada',  label: 'Caminhada',  emoji: '🚶' },
  { value: 'ciclismo',   label: 'Ciclismo',   emoji: '🚴' },
  { value: 'hiit',       label: 'HIIT',       emoji: '⚡' },
  { value: 'funcional',  label: 'Funcional',  emoji: '🤸' },
  { value: 'crossfit',   label: 'CrossFit',   emoji: '💪' },
  { value: 'cardio',     label: 'Cardio',     emoji: '❤️' },
  { value: 'esportes',   label: 'Esportes',   emoji: '⚽' },
  { value: 'tênis',      label: 'Tênis',      emoji: '🎾' },
  { value: 'pilates',    label: 'Pilates',    emoji: '🧘' },
  { value: 'outro',      label: 'Outro',      emoji: '🔄' },
] as const;

type WorkoutType = typeof WORKOUT_TYPES[number]['value'];

const INTENSITIES = [
  { value: 'leve',          label: 'Leve',     emoji: '🌤️', desc: 'Baixa exigência',   selected: 'bg-sky-50 dark:bg-sky-950/40 border-sky-300 dark:border-sky-700/60 text-sky-700 dark:text-sky-300' },
  { value: 'moderada',      label: 'Moderada', emoji: '💪', desc: 'Esforço constante', selected: 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-700/60 text-emerald-700 dark:text-emerald-300' },
  { value: 'intensa',       label: 'Intensa',  emoji: '🔥', desc: 'Alta exigência',    selected: 'bg-orange-50 dark:bg-orange-950/40 border-orange-300 dark:border-orange-700/60 text-orange-700 dark:text-orange-300' },
  { value: 'muito intensa', label: 'Máxima',   emoji: '⚡', desc: 'Limite total',      selected: 'bg-red-50 dark:bg-red-950/40 border-red-300 dark:border-red-700/60 text-red-700 dark:text-red-300' },
] as const;

type Intensity = typeof INTENSITIES[number]['value'];

const DURATION_PRESETS = [15, 30, 45, 60, 90, 120];
const ANALYZE_TIMEOUT_MS = 45_000;

interface WorkoutAnalysis {
  estimatedCalories: number;
  intensity: string;
  trainingLoad: string;
  confidence: 'alta' | 'média' | 'baixa';
  metValue: number;
  summary: string;
}

interface AddWorkoutModalProps {
  open: boolean;
  onClose: () => void;
  userId: string;
  date?: string;
  onAdded: (log: FoodLog) => void;
}

const CONFIDENCE_STYLE: Record<string, string> = {
  alta:  'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/40',
  média: 'bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800/40',
  baixa: 'bg-zinc-100 dark:bg-zinc-800/60 text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700/40',
};

const INTENSITY_BADGE: Record<string, string> = {
  baixa:        'text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-950/30 border-sky-200 dark:border-sky-800/40',
  moderada:     'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/40',
  alta:         'text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800/40',
  'muito alta': 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800/40',
};

const INPUT_CLS = cn(
  'w-full rounded-xl border bg-zinc-50 dark:bg-zinc-800/60 px-3 py-2.5',
  'border-zinc-200 dark:border-zinc-700/60 text-[13px] text-zinc-800 dark:text-zinc-100',
  'focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400/60 transition-all',
  'placeholder:text-zinc-300 dark:placeholder:text-zinc-600'
);

export default function AddWorkoutModal(props: AddWorkoutModalProps) {
  const { open } = props;
  // Remount the modal's internal state fresh every time it opens, instead of
  // resetting every state variable by hand inside an effect.
  const [wasOpen, setWasOpen] = useState(open);
  const [epoch, setEpoch] = useState(0);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setEpoch(epoch + 1);
  }
  return <AddWorkoutModalBody key={epoch} {...props} />;
}

function AddWorkoutModalBody({ open, onClose, date, onAdded }: AddWorkoutModalProps) {
  const [step, setStep] = useState(0);
  const [workoutType, setWorkoutType] = useState<WorkoutType | null>(null);
  const [description, setDescription] = useState('');
  const [intensity, setIntensity] = useState<Intensity | null>(null);
  const [duration, setDuration] = useState('');
  const [heartRate, setHeartRate] = useState('');
  const [distance, setDistance] = useState('');
  const [load, setLoad] = useState('');
  const [rpe, setRpe] = useState('');
  const [smartwatchKcal, setSmartwatchKcal] = useState('');
  const [showOptional, setShowOptional] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<WorkoutAnalysis | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);

  function handleClose() {
    if (result && !saving) {
      setConfirmClose(true);
    } else {
      onClose();
    }
  }

  function adjustDuration(delta: number) {
    setDuration((prev) => {
      const cur = parseInt(prev || '0');
      const next = Math.max(1, Math.min(600, cur + delta));
      return String(next);
    });
  }

  async function handleAnalyze() {
    setAnalyzing(true);
    setError(null);
    setStep(3);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), ANALYZE_TIMEOUT_MS);
    try {
      const res = await fetch('/api/workout/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description:     description.trim() || undefined,
          workoutType:     workoutType        || undefined,
          intensity:       intensity          || undefined,
          durationMinutes: parseInt(duration),
          heartRate:       heartRate       ? parseInt(heartRate)       : undefined,
          distanceKm:      distance        ? parseFloat(distance)      : undefined,
          loadKg:          load            ? parseFloat(load)          : undefined,
          rpe:             rpe             ? parseInt(rpe)             : undefined,
          smartwatchKcal:  smartwatchKcal  ? parseInt(smartwatchKcal)  : undefined,
        }),
        signal: controller.signal,
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ?? `Erro ao analisar (HTTP ${res.status}).`);
      if (!json) throw new Error('Resposta inválida do servidor. Tente novamente.');
      setResult(json as WorkoutAnalysis);
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') {
        setError('A análise demorou demais e foi cancelada. Verifique sua conexão e tente novamente.');
      } else if (e instanceof TypeError) {
        setError('Sem conexão com o servidor. Verifique sua internet e tente novamente.');
      } else {
        setError(e instanceof Error ? e.message : 'Não foi possível analisar. Tente novamente.');
      }
      setStep(2);
    } finally {
      clearTimeout(timeoutId);
      setAnalyzing(false);
    }
  }

  async function handleConfirm() {
    if (!result) return;
    setSaving(true);
    setError(null);
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
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? `Erro ao salvar (HTTP ${res.status}).`);
      if (!data) throw new Error('Resposta inválida do servidor ao salvar.');

      onAdded(data as FoodLog);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível salvar o treino. Tente novamente.');
    } finally {
      setSaving(false);
    }
  }

  const selectedType = WORKOUT_TYPES.find((t) => t.value === workoutType);

  return (
    <Modal open={open} onClose={handleClose} title="Registrar treino">
      {confirmClose ? (
        <div className="flex flex-col items-center gap-5 py-3">
          <div className="flex flex-col items-center gap-2 text-center">
            <div className="h-10 w-10 rounded-full bg-amber-50 dark:bg-amber-950/30 flex items-center justify-center">
              <AlertTriangle size={18} className="text-amber-500" />
            </div>
            <p className="text-[14px] font-semibold text-zinc-800 dark:text-zinc-200">
              Sair sem salvar?
            </p>
            <p className="text-[13px] text-zinc-500 dark:text-zinc-400 leading-relaxed">
              O treino analisado ainda não foi salvo e será descartado.
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
      <div className="flex flex-col">

        {/* Progress bar (steps 0-2) */}
        {step < 3 && (
          <div className="h-1 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden mb-5">
            <div
              className="h-full bg-emerald-500 rounded-full transition-all duration-500 ease-out"
              style={{ width: `${((step + 1) / 3) * 100}%` }}
            />
          </div>
        )}

        {/* ── Step 0: Workout type ── */}
        {step === 0 && (
          <div className="animate-fade-in flex flex-col gap-4">
            <div>
              <h2 className="text-[18px] font-bold text-zinc-900 dark:text-zinc-100 tracking-tight leading-snug">
                Tipo de treino
              </h2>
              <p className="text-[13px] text-zinc-400 dark:text-zinc-500 mt-0.5">
                Selecione a atividade que você realizou
              </p>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {WORKOUT_TYPES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setWorkoutType(t.value)}
                  className={cn(
                    'flex flex-col items-center gap-1.5 py-3.5 px-2 rounded-2xl border text-[11px] font-semibold transition-all duration-150 active:scale-95',
                    workoutType === t.value
                      ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-700/60 text-emerald-700 dark:text-emerald-300 shadow-sm'
                      : 'bg-zinc-50 dark:bg-zinc-800/40 border-zinc-200 dark:border-zinc-700/40 text-zinc-500 dark:text-zinc-400 hover:border-zinc-300 dark:hover:border-zinc-600 hover:bg-white dark:hover:bg-zinc-800/60'
                  )}
                >
                  <span className="text-[22px] leading-none">{t.emoji}</span>
                  <span className="leading-tight text-center">{t.label}</span>
                </button>
              ))}
            </div>

            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={'Descreva livremente... (ex: "1h de tênis moderado")'}
              rows={2}
              className={cn(
                'w-full resize-none rounded-xl border bg-zinc-50 dark:bg-zinc-800/60 px-4 py-3',
                'border-zinc-200 dark:border-zinc-700/60 text-[13px] leading-relaxed',
                'text-zinc-800 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500',
                'focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400/60 transition-all'
              )}
            />

            <Button
              onClick={() => setStep(1)}
              disabled={!workoutType}
              variant="primary"
              className="w-full"
            >
              Continuar
              <ChevronRight size={14} />
            </Button>
          </div>
        )}

        {/* ── Step 1: Intensity + Duration ── */}
        {step === 1 && (
          <div className="animate-fade-in flex flex-col gap-4">
            <div>
              <h2 className="text-[18px] font-bold text-zinc-900 dark:text-zinc-100 tracking-tight leading-snug">
                Intensidade e duração
              </h2>
              <p className="text-[13px] text-zinc-400 dark:text-zinc-500 mt-0.5">
                Como foi o esforço? Quanto tempo durou?
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {INTENSITIES.map((i) => (
                <button
                  key={i.value}
                  type="button"
                  onClick={() => setIntensity(i.value)}
                  className={cn(
                    'flex flex-col gap-0.5 py-3.5 px-4 rounded-2xl border text-left transition-all duration-150 active:scale-[0.98]',
                    intensity === i.value
                      ? i.selected
                      : 'bg-zinc-50 dark:bg-zinc-800/40 border-zinc-200 dark:border-zinc-700/40 hover:border-zinc-300 dark:hover:border-zinc-600 hover:bg-white dark:hover:bg-zinc-800/60'
                  )}
                >
                  <span className="text-[18px] leading-none">{i.emoji}</span>
                  <span className={cn(
                    'text-[13px] font-semibold mt-0.5',
                    intensity !== i.value && 'text-zinc-700 dark:text-zinc-300'
                  )}>{i.label}</span>
                  <span className={cn(
                    'text-[10px]',
                    intensity === i.value ? 'opacity-70' : 'text-zinc-400 dark:text-zinc-500'
                  )}>{i.desc}</span>
                </button>
              ))}
            </div>

            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500 mb-2.5">
                Duração
              </p>
              <div className="flex gap-1.5 mb-3 flex-wrap">
                {DURATION_PRESETS.map((min) => (
                  <button
                    key={min}
                    type="button"
                    onClick={() => setDuration(String(min))}
                    className={cn(
                      'h-8 px-3 rounded-lg text-[12px] font-semibold transition-all duration-150 border active:scale-95',
                      duration === String(min)
                        ? 'bg-emerald-500 border-emerald-500 text-white shadow-sm'
                        : 'bg-zinc-100 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 hover:border-zinc-300 dark:hover:border-zinc-600'
                    )}
                  >
                    {min}min
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => adjustDuration(-5)}
                  className="h-10 w-10 flex-shrink-0 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors active:scale-95 border border-zinc-200 dark:border-zinc-700"
                >
                  <Minus size={14} />
                </button>
                <div className="flex-1 flex items-center gap-2">
                  <input
                    type="number"
                    value={duration}
                    onChange={(e) => setDuration(e.target.value)}
                    placeholder="45"
                    min="1"
                    max="600"
                    className={cn(
                      'flex-1 rounded-xl border bg-zinc-50 dark:bg-zinc-800/60 px-3 py-2.5',
                      'border-zinc-200 dark:border-zinc-700/60 text-[20px] font-bold tabular-nums text-zinc-800 dark:text-zinc-100',
                      'focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400/60 transition-all text-center'
                    )}
                  />
                  <span className="text-[13px] text-zinc-400 dark:text-zinc-500 font-medium flex-shrink-0">min</span>
                </div>
                <button
                  type="button"
                  onClick={() => adjustDuration(5)}
                  className="h-10 w-10 flex-shrink-0 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors active:scale-95 border border-zinc-200 dark:border-zinc-700"
                >
                  <Plus size={14} />
                </button>
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => setStep(0)}
                className="h-11 w-11 flex-shrink-0 rounded-xl border border-zinc-200 dark:border-zinc-700/60 flex items-center justify-center text-zinc-500 dark:text-zinc-400 hover:border-zinc-300 dark:hover:border-zinc-600 transition-colors active:scale-95"
              >
                <ChevronLeft size={16} />
              </button>
              <Button
                onClick={() => setStep(2)}
                disabled={!(intensity && duration && parseInt(duration) > 0)}
                variant="primary"
                className="flex-1"
              >
                Continuar
                <ChevronRight size={14} />
              </Button>
            </div>
          </div>
        )}

        {/* ── Step 2: Optional data ── */}
        {step === 2 && (
          <div className="animate-fade-in flex flex-col gap-4">
            <div>
              <h2 className="text-[18px] font-bold text-zinc-900 dark:text-zinc-100 tracking-tight leading-snug">
                Pronto para analisar
              </h2>
              <p className="text-[13px] text-zinc-400 dark:text-zinc-500 mt-0.5">
                Adicione dados extras para aumentar a precisão
              </p>
            </div>

            {/* Summary chip */}
            <div className="flex items-center gap-3 bg-zinc-50 dark:bg-zinc-800/60 rounded-2xl px-4 py-3 border border-zinc-100 dark:border-zinc-700/40">
              <span className="text-[24px] leading-none">{selectedType?.emoji}</span>
              <div className="flex-1 min-w-0">
                <p className="text-[14px] font-semibold text-zinc-800 dark:text-zinc-200">
                  {selectedType?.label} · {duration}min
                </p>
                <p className="text-[12px] text-zinc-400 capitalize mt-0.5">{intensity}</p>
              </div>
              <button
                type="button"
                onClick={() => setStep(0)}
                className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400 hover:underline flex-shrink-0"
              >
                Editar
              </button>
            </div>

            {/* Optional fields toggle */}
            <button
              type="button"
              onClick={() => setShowOptional(!showOptional)}
              className="flex items-center justify-between w-full text-left py-0.5"
            >
              <span className="text-[13px] font-semibold text-zinc-600 dark:text-zinc-400">
                {showOptional ? '— Ocultar dados extras' : '+ Adicionar dados extras'}
              </span>
              <span className="text-[11px] text-zinc-400 dark:text-zinc-500">
                {showOptional ? '' : 'FC, distância, carga...'}
              </span>
            </button>

            {showOptional && (
              <div className="flex flex-col gap-3 animate-fade-in">
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] text-zinc-400 dark:text-zinc-500 font-semibold uppercase tracking-wider">
                      FC média (bpm)
                    </label>
                    <input
                      type="number"
                      value={heartRate}
                      onChange={(e) => setHeartRate(e.target.value)}
                      placeholder="150"
                      min="40"
                      max="220"
                      className={INPUT_CLS}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] text-zinc-400 dark:text-zinc-500 font-semibold uppercase tracking-wider">
                      Distância (km)
                    </label>
                    <input
                      type="number"
                      value={distance}
                      onChange={(e) => setDistance(e.target.value)}
                      placeholder="5.0"
                      min="0"
                      step="0.1"
                      className={INPUT_CLS}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] text-zinc-400 dark:text-zinc-500 font-semibold uppercase tracking-wider">
                      Carga total (kg)
                    </label>
                    <input
                      type="number"
                      value={load}
                      onChange={(e) => setLoad(e.target.value)}
                      placeholder="500"
                      min="0"
                      className={INPUT_CLS}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] text-zinc-400 dark:text-zinc-500 font-semibold uppercase tracking-wider">
                      Esforço percebido (1-10)
                    </label>
                    <input
                      type="number"
                      value={rpe}
                      onChange={(e) => setRpe(e.target.value)}
                      placeholder="7"
                      min="1"
                      max="10"
                      className={INPUT_CLS}
                    />
                  </div>
                  <div className="flex flex-col gap-1 col-span-2">
                    <label className="text-[10px] text-zinc-400 dark:text-zinc-500 font-semibold uppercase tracking-wider">
                      Kcal do smartwatch
                    </label>
                    <input
                      type="number"
                      value={smartwatchKcal}
                      onChange={(e) => setSmartwatchKcal(e.target.value)}
                      placeholder="420"
                      min="0"
                      className={INPUT_CLS}
                    />
                  </div>
                </div>
              </div>
            )}

            {error && (
              <p className="text-[12px] text-red-500 dark:text-red-400">{error}</p>
            )}

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="h-11 w-11 flex-shrink-0 rounded-xl border border-zinc-200 dark:border-zinc-700/60 flex items-center justify-center text-zinc-500 dark:text-zinc-400 hover:border-zinc-300 dark:hover:border-zinc-600 transition-colors active:scale-95"
              >
                <ChevronLeft size={16} />
              </button>
              <Button
                onClick={handleAnalyze}
                variant="primary"
                className="flex-1 gap-2"
              >
                <Sparkles size={14} />
                Analisar com IA
              </Button>
            </div>
          </div>
        )}

        {/* ── Step 3: Result ── */}
        {step === 3 && (
          <div className="animate-fade-in flex flex-col gap-3">
            {analyzing ? (
              <div className="flex flex-col gap-3">
                <div className="h-6 w-2/3 rounded-xl animate-shimmer" />
                <div className="h-[110px] rounded-2xl animate-shimmer" />
                <div className="grid grid-cols-3 gap-2">
                  <div className="h-[64px] rounded-xl animate-shimmer" />
                  <div className="h-[64px] rounded-xl animate-shimmer" />
                  <div className="h-[64px] rounded-xl animate-shimmer" />
                </div>
                <div className="h-16 rounded-xl animate-shimmer" />
                <p className="text-[12px] text-zinc-400 dark:text-zinc-500 text-center animate-pulse">
                  Analisando com IA...
                </p>
              </div>
            ) : result ? (
              <>
                <div>
                  <h2 className="text-[18px] font-bold text-zinc-900 dark:text-zinc-100 tracking-tight leading-snug">
                    Análise concluída
                  </h2>
                  <p className="text-[13px] text-zinc-400 dark:text-zinc-500 mt-0.5">
                    Estimativa de gasto calórico
                  </p>
                </div>

                {/* Main calorie card */}
                <div className="bg-gradient-to-br from-emerald-50 via-green-50 to-teal-50 dark:from-emerald-950/40 dark:via-green-950/30 dark:to-teal-950/20 rounded-2xl px-5 py-5 border border-emerald-100 dark:border-emerald-900/40">
                  <div className="flex items-center gap-1.5 mb-2">
                    <Flame size={12} className="text-emerald-600 dark:text-emerald-400" />
                    <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
                      Gasto estimado
                    </span>
                  </div>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-[48px] font-bold tabular-nums text-emerald-800 dark:text-emerald-200 leading-none tracking-tight">
                      {result.estimatedCalories.toLocaleString('pt-BR')}
                    </span>
                    <span className="text-[16px] font-medium text-emerald-500 dark:text-emerald-400">kcal</span>
                  </div>
                </div>

                {/* Badges */}
                <div className="grid grid-cols-3 gap-2">
                  <div className={cn(
                    'rounded-xl border px-2 py-2.5 flex flex-col items-center gap-0.5',
                    INTENSITY_BADGE[result.intensity.toLowerCase()] ?? INTENSITY_BADGE.moderada
                  )}>
                    <span className="text-[9px] font-bold uppercase tracking-wider opacity-60">Intensidade</span>
                    <span className="text-[12px] font-bold capitalize">{result.intensity}</span>
                  </div>
                  <div className="rounded-xl border px-2 py-2.5 flex flex-col items-center gap-0.5 bg-zinc-50 dark:bg-zinc-800/60 border-zinc-200 dark:border-zinc-700/40">
                    <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">MET</span>
                    <span className="text-[12px] font-bold text-zinc-700 dark:text-zinc-300 tabular-nums">
                      {typeof result.metValue === 'number' ? result.metValue.toFixed(1) : '–'}
                    </span>
                  </div>
                  <div className={cn(
                    'rounded-xl border px-2 py-2.5 flex flex-col items-center gap-0.5',
                    CONFIDENCE_STYLE[result.confidence] ?? CONFIDENCE_STYLE.média
                  )}>
                    <span className="text-[9px] font-bold uppercase tracking-wider opacity-60">Confiança</span>
                    <span className="text-[12px] font-bold capitalize">{result.confidence ?? 'média'}</span>
                  </div>
                </div>

                {/* Summary */}
                <div className="bg-zinc-50 dark:bg-zinc-800/60 rounded-xl px-4 py-3 border border-zinc-100 dark:border-zinc-700/40">
                  <p className="text-[13px] text-zinc-600 dark:text-zinc-300 leading-relaxed">
                    {result.summary}
                  </p>
                </div>

                {/* Actions */}
                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => { setResult(null); setStep(2); setError(null); }}
                    className="flex items-center gap-1.5 px-4 h-11 rounded-xl border border-zinc-200 dark:border-zinc-700/60 text-[13px] font-medium text-zinc-500 dark:text-zinc-400 hover:border-zinc-300 dark:hover:border-zinc-600 transition-colors active:scale-95"
                  >
                    <RotateCcw size={12} />
                    Refazer
                  </button>
                  <Button
                    onClick={handleConfirm}
                    loading={saving}
                    variant="primary"
                    className="flex-1"
                  >
                    Confirmar treino
                  </Button>
                </div>

                {error && (
                  <p className="text-[12px] text-red-500 dark:text-red-400 text-center -mt-1">{error}</p>
                )}
              </>
            ) : null}
          </div>
        )}

      </div>
      )}
    </Modal>
  );
}
