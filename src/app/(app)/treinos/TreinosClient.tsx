'use client';

import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  AlertCircle, Building2, CalendarDays, ChevronDown, Clock, Dumbbell, Flame, History, House,
  Pencil, Play, RefreshCw, ShieldCheck, Sparkles, Target, Trash2, TrendingDown, TrendingUp,
} from 'lucide-react';
import Card from '@/components/ui/Card';
import ExerciseCard from '@/components/training/ExerciseCard';
import TrainingProfileForm from '@/components/training/TrainingProfileForm';
import SessionLogger, { loadDraft, newDraft, type SessionDraft } from '@/components/training/SessionLogger';
import { cn } from '@/lib/utils';
import type { CoachGoal } from '@/lib/coach-data';
import {
  DEFAULT_TRAINING_PROFILE,
  EXPERIENCE_OPTS,
  HOME_EQUIPMENT_OPTS,
  LOCATION_LABEL,
  exerciseKey,
  formatKg,
  formatSets,
  sessionVolume,
  type ExerciseHistory,
  type TrainingLocation,
  type TrainingProfile,
  type WorkoutPlan,
  type WorkoutPlanSummary,
  type WorkoutSessionSummary,
} from '@/lib/training';

const GOAL_OPTS: { value: CoachGoal; label: string; desc: string; icon: typeof Target }[] = [
  { value: 'emagrecimento',  label: 'Perder peso',    desc: 'Reduzir gordura',             icon: TrendingDown },
  { value: 'ganho_muscular', label: 'Ganhar músculo', desc: 'Hipertrofia',                 icon: TrendingUp },
  { value: 'recomposicao',   label: 'Recomposição',   desc: 'Menos gordura, mais músculo', icon: Target },
];

const LOCATION_OPTS: { value: TrainingLocation; icon: typeof House; desc: string }[] = [
  { value: 'casa',     icon: House,     desc: 'Peso do corpo e seus equipamentos' },
  { value: 'academia', icon: Building2, desc: 'Máquinas, barras e halteres' },
];

const LOADING_STEPS = [
  'Lendo seu perfil e histórico…',
  'Escolhendo a divisão da semana…',
  'Selecionando os exercícios…',
  'Ajustando séries, repetições e cargas…',
  'Escrevendo as explicações de execução…',
];

const goalLabel = (g: CoachGoal) => GOAL_OPTS.find((o) => o.value === g)?.label ?? g;
const dateLabel = (iso: string) => format(new Date(iso.length === 10 ? iso + 'T12:00:00' : iso), "d 'de' MMM", { locale: ptBR });

function SectionTitle({ icon: Icon, title, tone }: { icon: typeof Target; title: string; tone: string }) {
  return (
    <div className="flex items-center gap-2 px-1">
      <span className={cn('h-7 w-7 rounded-xl flex items-center justify-center', tone)}>
        <Icon className="w-3.5 h-3.5" />
      </span>
      <h2 className="text-[15px] font-bold text-zinc-900 dark:text-zinc-50 tracking-tight">{title}</h2>
    </div>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div className="flex gap-2 rounded-xl bg-red-50 dark:bg-red-950/30 p-3 text-[12px] text-red-700 dark:text-red-300">
      <AlertCircle className="w-4 h-4 flex-shrink-0 mt-px" />
      <p>{message}</p>
    </div>
  );
}

function ProfileSummary({ profile }: { profile: TrainingProfile }) {
  const equipment = profile.homeEquipment
    .map((v) => HOME_EQUIPMENT_OPTS.find((o) => o.value === v)?.label ?? v)
    .join(', ');
  const items = [
    EXPERIENCE_OPTS.find((o) => o.value === profile.experience)?.label ?? profile.experience,
    `${profile.daysPerWeek} dias/semana`,
    `${profile.sessionMinutes} min`,
  ];
  return (
    <div className="min-w-0">
      <p className="text-[13px] font-semibold text-zinc-800 dark:text-zinc-200">{items.join(' · ')}</p>
      <p className="text-[11.5px] text-zinc-500 dark:text-zinc-400 mt-0.5 truncate">
        Em casa: {equipment || 'só peso do corpo'}
      </p>
      {profile.limitations && (
        <p className="text-[11.5px] text-amber-700 dark:text-amber-400 mt-0.5 line-clamp-2">Limitações: {profile.limitations}</p>
      )}
    </div>
  );
}

function SessionItem({
  session: s,
  onDelete,
}: {
  session: WorkoutSessionSummary;
  onDelete: (id: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const volume = sessionVolume(s.exercises);
  const sets = s.exercises.reduce((n, e) => n + e.sets.length, 0);

  return (
    <div className="p-4">
      <button type="button" onClick={() => setOpen((v) => !v)} className="w-full text-left flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] font-semibold text-zinc-900 dark:text-zinc-50 truncate">{s.dayLabel}</p>
          <p className="text-[11.5px] text-zinc-500 dark:text-zinc-400 mt-0.5">
            {dateLabel(s.sessionDate)}
            {s.durationMin ? ` · ${s.durationMin} min` : ''}
            {` · ${sets} séries`}
            {volume > 0 ? ` · ${volume.toLocaleString('pt-BR')} kg de volume` : ''}
            {s.calories ? ` · ${s.calories} kcal` : ''}
          </p>
        </div>
        <ChevronDown className={cn('w-4 h-4 mt-1 flex-shrink-0 text-zinc-400 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="mt-3 flex flex-col gap-1.5 animate-fade-in">
          {s.exercises.map((e) => (
            <p key={e.name} className="text-[12.5px] text-zinc-600 dark:text-zinc-400">
              <span className="font-semibold text-zinc-800 dark:text-zinc-200">{e.name}:</span> {formatSets(e.sets)}
            </p>
          ))}
          {s.rpe != null && <p className="text-[12px] text-zinc-500">Esforço percebido: {s.rpe}/10</p>}
          <button
            type="button"
            disabled={deleting}
            onClick={async () => {
              setDeleting(true);
              await onDelete(s.id);
              setDeleting(false);
            }}
            className="mt-1 inline-flex items-center gap-1.5 self-start text-[12px] font-semibold text-red-500 disabled:opacity-50"
          >
            <Trash2 className="w-3.5 h-3.5" /> Excluir treino
          </button>
        </div>
      )}
    </div>
  );
}

export default function TreinosClient({
  userId,
  initialProfile,
  initialPlan,
  initialPlans,
  initialSessions,
  initialHistory,
  suggestedGoal,
}: {
  userId: string;
  initialProfile: TrainingProfile | null;
  initialPlan: WorkoutPlan | null;
  initialPlans: WorkoutPlanSummary[];
  initialSessions: WorkoutSessionSummary[];
  initialHistory: Record<string, ExerciseHistory>;
  suggestedGoal: CoachGoal;
}) {
  const [profile, setProfile] = useState(initialProfile);
  const [editingProfile, setEditingProfile] = useState(false);
  const [plan, setPlan] = useState(initialPlan);
  const [plans, setPlans] = useState(initialPlans);
  const [sessions, setSessions] = useState(initialSessions);
  const [history, setHistory] = useState(initialHistory);
  const [dayIndex, setDayIndex] = useState(0);
  const [draft, setDraft] = useState<SessionDraft | null>(null);

  const [goal, setGoal] = useState<CoachGoal>(suggestedGoal);
  const [location, setLocation] = useState<TrainingLocation>(initialPlan?.location ?? 'academia');
  const [notes, setNotes] = useState('');
  const [generating, setGenerating] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [planBusy, setPlanBusy] = useState<string | null>(null);

  // Resume a workout left in progress (draft lives in localStorage, so it can
  // only be read after mount).
  useEffect(() => {
    const saved = loadDraft(userId);
    if (saved && initialPlan && saved.planId === initialPlan.id && initialPlan.days[saved.dayIndex]) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDraft(saved);
    }
  }, [userId, initialPlan]);

  useEffect(() => {
    if (!generating) return;
    const id = setInterval(() => setLoadingStep((s) => Math.min(s + 1, LOADING_STEPS.length - 1)), 6000);
    return () => clearInterval(id);
  }, [generating]);

  async function generate() {
    setGenerating(true);
    setLoadingStep(0);
    setError(null);
    try {
      const res = await fetch('/api/training/plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goal, location, notes }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.plan) {
        setError(data?.error ?? 'Não foi possível gerar o plano. Tente novamente.');
        return;
      }
      setPlan(data.plan);
      setPlans(data.plans ?? []);
      setDayIndex(0);
      setNotes('');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch {
      setError('Falha de conexão. Verifique sua internet e tente novamente.');
    } finally {
      setGenerating(false);
    }
  }

  async function activate(id: string) {
    setPlanBusy(id);
    setError(null);
    try {
      const res = await fetch(`/api/training/plans/${id}`, { method: 'PATCH' });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.plan) {
        setError(data?.error ?? 'Não foi possível ativar o plano.');
        return;
      }
      setPlan(data.plan);
      setPlans(data.plans ?? []);
      setLocation(data.plan.location);
      setGoal(data.plan.goal);
      setDayIndex(0);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch {
      setError('Falha de conexão. Tente novamente.');
    } finally {
      setPlanBusy(null);
    }
  }

  async function removePlan(id: string) {
    setPlanBusy(id);
    setError(null);
    try {
      const res = await fetch(`/api/training/plans/${id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? 'Não foi possível excluir o plano.');
        return;
      }
      setPlans(data.plans ?? []);
      if (plan?.id === id) setPlan(null);
    } catch {
      setError('Falha de conexão. Tente novamente.');
    } finally {
      setPlanBusy(null);
    }
  }

  async function removeSession(id: string) {
    try {
      const res = await fetch(`/api/training/sessions/${id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => null);
      if (!res.ok) return;
      setSessions((list) => list.filter((s) => s.id !== id));
      if (data?.history) setHistory(data.history);
    } catch {
      // Keep the item; the user can try again.
    }
  }

  const day = plan?.days[Math.min(dayIndex, (plan?.days.length ?? 1) - 1)];
  const pastPlans = plans.filter((p) => p.id !== plan?.id);

  const header = (
    <header className="flex items-center gap-3 px-1">
      <span className="h-11 w-11 flex-shrink-0 rounded-2xl bg-gradient-to-br from-sky-500 to-emerald-600 flex items-center justify-center shadow-lg shadow-sky-500/20">
        <Dumbbell className="w-5 h-5 text-white" />
      </span>
      <div className="min-w-0">
        <h1 className="text-[22px] font-bold text-zinc-900 dark:text-zinc-50 leading-tight tracking-tight">Treinos IA</h1>
        <p className="text-[12px] text-zinc-500 dark:text-zinc-400">
          Plano semanal com execução, séries e progressão de carga
        </p>
      </div>
    </header>
  );

  if (draft && plan && draft.planId === plan.id) {
    return (
      <div className="flex flex-col gap-4 pt-6 pb-6">
        {header}
        <SessionLogger
          userId={userId}
          plan={plan}
          initialDraft={draft}
          history={history}
          onSaved={(session, nextHistory) => {
            setSessions((list) => [session, ...list]);
            setHistory(nextHistory);
            setDraft(null);
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          onCancel={() => setDraft(null)}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 pt-6 pb-6 animate-fade-in">
      {header}

      {/* ── Training profile ── */}
      {!profile || editingProfile ? (
        <Card className="p-4 flex flex-col gap-4">
          <div>
            <p className="text-[14px] font-semibold text-zinc-900 dark:text-zinc-50">
              {profile ? 'Editar perfil de treino' : 'Primeiro, conte como você treina'}
            </p>
            <p className="mt-0.5 text-[12px] text-zinc-500 dark:text-zinc-400">
              Fica salvo e é usado em todos os planos. Peso, idade e objetivo vêm do seu perfil.
            </p>
          </div>
          <TrainingProfileForm
            initial={profile ?? DEFAULT_TRAINING_PROFILE}
            onSaved={(p) => {
              setProfile(p);
              setEditingProfile(false);
            }}
            onCancel={profile ? () => setEditingProfile(false) : undefined}
          />
        </Card>
      ) : (
        <Card className="p-4 flex items-start justify-between gap-3">
          <ProfileSummary profile={profile} />
          <button
            type="button"
            onClick={() => setEditingProfile(true)}
            className="flex-shrink-0 inline-flex items-center gap-1 rounded-xl bg-zinc-100 dark:bg-zinc-800 px-2.5 py-1.5 text-[12px] font-semibold text-zinc-600 dark:text-zinc-300"
          >
            <Pencil className="w-3 h-3" /> Editar
          </button>
        </Card>
      )}

      {/* ── Active plan ── */}
      {plan && day && (
        <section className="flex flex-col gap-3">
          <Card className="p-4">
            <p className="text-[11px] font-medium text-zinc-400 dark:text-zinc-500">
              Plano atual · criado em {dateLabel(plan.createdAt)}
            </p>
            <p className="text-[17px] font-bold text-zinc-900 dark:text-zinc-50 leading-tight mt-0.5">{plan.name}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {[LOCATION_LABEL[plan.location], goalLabel(plan.goal), `${plan.daysPerWeek} dias/semana`, `${plan.sessionMinutes} min`].map((t) => (
                <span key={t} className="rounded-full bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 text-[11px] font-medium text-zinc-600 dark:text-zinc-300">
                  {t}
                </span>
              ))}
            </div>
            {plan.overview && <p className="mt-3 text-[13px] leading-relaxed text-zinc-700 dark:text-zinc-300">{plan.overview}</p>}
            {plan.schedule && (
              <p className="mt-2 flex gap-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 p-2.5 text-[12.5px] leading-relaxed text-emerald-800 dark:text-emerald-300">
                <CalendarDays className="w-4 h-4 flex-shrink-0 mt-px" />
                {plan.schedule}
              </p>
            )}
          </Card>

          {/* Day tabs */}
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
            {plan.days.map((d, i) => {
              const active = d === day;
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => setDayIndex(i)}
                  className={cn(
                    'flex-shrink-0 rounded-2xl border px-3.5 py-2 text-left transition-all active:scale-[0.97]',
                    active
                      ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30'
                      : 'border-zinc-200/70 dark:border-zinc-800 bg-white dark:bg-zinc-900'
                  )}
                >
                  <p className={cn('text-[13px] font-bold', active ? 'text-emerald-700 dark:text-emerald-300' : 'text-zinc-800 dark:text-zinc-200')}>
                    {d.label}
                  </p>
                  <p className="text-[10.5px] text-zinc-500 dark:text-zinc-400 max-w-[150px] truncate">{d.focus || `${d.exercises.length} exercícios`}</p>
                </button>
              );
            })}
          </div>

          <Card className="p-4 flex flex-col gap-2">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[14px] font-semibold text-zinc-900 dark:text-zinc-50">{day.focus || day.label}</p>
              <span className="flex items-center gap-1 text-[12px] text-zinc-500 dark:text-zinc-400">
                <Clock className="w-3.5 h-3.5" /> ~{day.durationMin} min
              </span>
            </div>
            {day.warmup.length > 0 && (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-orange-500 flex items-center gap-1">
                  <Flame className="w-3 h-3" /> Aquecimento
                </p>
                <ul className="mt-1 flex flex-col gap-0.5">
                  {day.warmup.map((w, i) => (
                    <li key={i} className="text-[12.5px] text-zinc-600 dark:text-zinc-400">• {w}</li>
                  ))}
                </ul>
              </div>
            )}
          </Card>

          {day.exercises.map((ex, i) => (
            <ExerciseCard key={`${plan.id}-${dayIndex}-${i}`} exercise={ex} index={i} history={history[exerciseKey(ex.name)]} />
          ))}

          {day.cooldown.length > 0 && (
            <Card className="p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-sky-500">Desaquecimento</p>
              <ul className="mt-1 flex flex-col gap-0.5">
                {day.cooldown.map((c, i) => (
                  <li key={i} className="text-[12.5px] text-zinc-600 dark:text-zinc-400">• {c}</li>
                ))}
              </ul>
            </Card>
          )}

          <button
            type="button"
            onClick={() => setDraft(newDraft(plan, plan.days.indexOf(day), history))}
            className="flex items-center justify-center gap-2 h-12 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white text-[14px] font-semibold shadow-lg shadow-emerald-600/25 transition-all duration-200 active:scale-[0.98]"
          >
            <Play className="w-4 h-4" /> Iniciar {day.label}
          </button>

          {(plan.progression || plan.safety.length > 0) && (
            <Card className="p-4 flex flex-col gap-3">
              {plan.progression && (
                <div className="flex gap-3">
                  <span className="h-8 w-8 flex-shrink-0 rounded-xl bg-sky-50 dark:bg-sky-950/40 flex items-center justify-center">
                    <TrendingUp className="w-4 h-4 text-sky-500" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">Progressão</p>
                    <p className="text-[13px] leading-relaxed text-zinc-700 dark:text-zinc-300">{plan.progression}</p>
                  </div>
                </div>
              )}
              {plan.safety.length > 0 && (
                <div className="flex gap-3">
                  <span className="h-8 w-8 flex-shrink-0 rounded-xl bg-amber-50 dark:bg-amber-950/40 flex items-center justify-center">
                    <ShieldCheck className="w-4 h-4 text-amber-500" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">Segurança</p>
                    <ul className="flex flex-col gap-1">
                      {plan.safety.map((s, i) => (
                        <li key={i} className="text-[13px] leading-relaxed text-zinc-700 dark:text-zinc-300">• {s}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </Card>
          )}
        </section>
      )}

      {/* ── Generator ── */}
      {profile && !editingProfile && (
        <Card className="p-4 flex flex-col gap-4">
          <div>
            <p className="text-[14px] font-semibold text-zinc-900 dark:text-zinc-50">
              {plan ? 'Gerar novo plano' : 'Gerar meu plano semanal'}
            </p>
            <p className="mt-0.5 text-[12px] text-zinc-500 dark:text-zinc-400">
              Usa seu perfil de treino, seus dados corporais e as cargas que você já registrou.
            </p>
          </div>

          <div>
            <p className="text-[12px] font-semibold text-zinc-700 dark:text-zinc-300 mb-2">Onde você vai treinar?</p>
            <div className="grid grid-cols-2 gap-2">
              {LOCATION_OPTS.map(({ value, icon: Icon, desc }) => {
                const active = location === value;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setLocation(value)}
                    disabled={generating}
                    className={cn(
                      'flex flex-col items-center gap-1 rounded-2xl border px-2 py-3 text-center transition-all duration-150 active:scale-[0.97]',
                      active
                        ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30'
                        : 'border-zinc-200/70 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700'
                    )}
                  >
                    <Icon className={cn('w-4 h-4', active ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-400')} />
                    <span className={cn('text-[12.5px] font-semibold', active ? 'text-emerald-700 dark:text-emerald-300' : 'text-zinc-700 dark:text-zinc-200')}>
                      {LOCATION_LABEL[value]}
                    </span>
                    <span className="text-[10px] leading-tight text-zinc-400 dark:text-zinc-500">{desc}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <p className="text-[12px] font-semibold text-zinc-700 dark:text-zinc-300 mb-2">Qual é o seu objetivo?</p>
            <div className="grid grid-cols-3 gap-2">
              {GOAL_OPTS.map(({ value, label, desc, icon: Icon }) => {
                const active = goal === value;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setGoal(value)}
                    disabled={generating}
                    className={cn(
                      'flex flex-col items-center gap-1 rounded-2xl border px-2 py-3 text-center transition-all duration-150 active:scale-[0.97]',
                      active
                        ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30'
                        : 'border-zinc-200/70 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700'
                    )}
                  >
                    <Icon className={cn('w-4 h-4', active ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-400')} />
                    <span className={cn('text-[12px] font-semibold leading-tight', active ? 'text-emerald-700 dark:text-emerald-300' : 'text-zinc-700 dark:text-zinc-200')}>
                      {label}
                    </span>
                    <span className="text-[10px] leading-tight text-zinc-400 dark:text-zinc-500">{desc}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <p className="text-[12px] font-semibold text-zinc-700 dark:text-zinc-300 mb-2">
              Algum pedido? <span className="font-normal text-zinc-400">(opcional)</span>
            </p>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={300}
              rows={2}
              disabled={generating}
              placeholder="Ex.: mais foco em glúteos, incluir 15 min de cardio, sem barra fixa…"
              className="w-full rounded-xl bg-zinc-50/80 dark:bg-zinc-800/50 border border-zinc-200/80 dark:border-zinc-700/50 px-3.5 py-2.5 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/25 focus:border-emerald-400/80 resize-none"
            />
          </div>

          {error && <ErrorBox message={error} />}

          <button
            type="button"
            onClick={generate}
            disabled={generating}
            className="flex items-center justify-center gap-2 h-12 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white text-[14px] font-semibold shadow-lg shadow-emerald-600/25 transition-all duration-200 active:scale-[0.98] disabled:opacity-70 disabled:pointer-events-none"
          >
            {generating ? (
              <>
                <span className="h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                {LOADING_STEPS[loadingStep]}
              </>
            ) : plan ? (
              <><RefreshCw className="w-4 h-4" /> Gerar novo plano</>
            ) : (
              <><Sparkles className="w-4 h-4" /> Gerar plano semanal</>
            )}
          </button>

          <p className="text-[10.5px] leading-relaxed text-zinc-400 dark:text-zinc-500 text-center">
            As orientações são educativas e não substituem a avaliação de um educador físico ou médico.
            Pare o exercício se sentir dor.
          </p>
        </Card>
      )}

      {/* ── Logged sessions ── */}
      {sessions.length > 0 && (
        <section className="flex flex-col gap-2.5">
          <SectionTitle icon={History} title="Treinos registrados" tone="bg-sky-50 text-sky-500 dark:bg-sky-950/40" />
          <Card className="divide-y divide-zinc-100 dark:divide-zinc-800/80">
            {sessions.map((s) => (
              <SessionItem key={s.id} session={s} onDelete={removeSession} />
            ))}
          </Card>
        </section>
      )}

      {/* ── Earlier plans ── */}
      {pastPlans.length > 0 && (
        <section className="flex flex-col gap-2.5">
          <SectionTitle icon={CalendarDays} title="Planos anteriores" tone="bg-violet-50 text-violet-500 dark:bg-violet-950/40" />
          <Card className="divide-y divide-zinc-100 dark:divide-zinc-800/80">
            {pastPlans.map((p) => (
              <div key={p.id} className="p-4 flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[13.5px] font-semibold text-zinc-900 dark:text-zinc-50 truncate">{p.name}</p>
                  <p className="text-[11.5px] text-zinc-500 dark:text-zinc-400">
                    {dateLabel(p.createdAt)} · {LOCATION_LABEL[p.location]} · {goalLabel(p.goal)} · {p.daysPerWeek} dias
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => activate(p.id)}
                  disabled={planBusy != null}
                  className="flex-shrink-0 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 px-2.5 py-1.5 text-[12px] font-semibold text-emerald-700 dark:text-emerald-300 disabled:opacity-50"
                >
                  {planBusy === p.id ? '…' : 'Usar'}
                </button>
                <button
                  type="button"
                  onClick={() => removePlan(p.id)}
                  disabled={planBusy != null}
                  aria-label="Excluir plano"
                  className="flex-shrink-0 h-8 w-8 rounded-xl flex items-center justify-center text-zinc-400 hover:text-red-500 disabled:opacity-50"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </Card>
        </section>
      )}

      {Object.keys(history).length > 0 && !plan && (
        <p className="px-1 text-[11.5px] text-zinc-400 dark:text-zinc-500">
          Suas cargas registradas ({Object.values(history).slice(0, 3).map((h) => `${h.name}${h.bestLoadKg ? ` ${formatKg(h.bestLoadKg)}kg` : ''}`).join(', ')}…) serão usadas no próximo plano.
        </p>
      )}
    </div>
  );
}
