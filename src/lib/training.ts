import type { CoachGoal } from '@/lib/coach-data';

// Shared types and pure helpers for Treinos IA. No database access here, so
// client components can import it; loaders live in training-data.ts.

export type TrainingExperience = 'iniciante' | 'intermediario' | 'avancado';
export type TrainingLocation = 'casa' | 'academia';

export interface TrainingProfile {
  experience: TrainingExperience;
  daysPerWeek: number;
  sessionMinutes: number;
  homeEquipment: string[];
  limitations: string;
}

export const DEFAULT_TRAINING_PROFILE: TrainingProfile = {
  experience: 'iniciante',
  daysPerWeek: 3,
  sessionMinutes: 50,
  homeEquipment: [],
  limitations: '',
};

export const EXPERIENCE_OPTS: { value: TrainingExperience; label: string; desc: string }[] = [
  { value: 'iniciante',     label: 'Iniciante',     desc: 'Menos de 6 meses' },
  { value: 'intermediario', label: 'Intermediário', desc: '6 meses a 2 anos' },
  { value: 'avancado',      label: 'Avançado',      desc: 'Mais de 2 anos' },
];

export const LOCATION_LABEL: Record<TrainingLocation, string> = {
  casa: 'Em casa',
  academia: 'Academia',
};

export const HOME_EQUIPMENT_OPTS: { value: string; label: string }[] = [
  { value: 'halteres',   label: 'Halteres' },
  { value: 'elasticos',  label: 'Elásticos' },
  { value: 'kettlebell', label: 'Kettlebell' },
  { value: 'barra_fixa', label: 'Barra fixa' },
  { value: 'banco',      label: 'Banco ou cadeira firme' },
  { value: 'caneleiras', label: 'Caneleiras' },
  { value: 'colchonete', label: 'Colchonete' },
  { value: 'corda',      label: 'Corda de pular' },
  { value: 'step',       label: 'Step' },
];

export const DAYS_PER_WEEK_OPTS = [2, 3, 4, 5, 6];
export const SESSION_MINUTES_OPTS = [30, 45, 60, 75, 90];

export interface PlanExercise {
  name: string;
  muscles: string;
  equipment: string;
  sets: number;
  /** Target per set, e.g. "8-12" (reps) or "30-45" (seconds when `timed`). */
  reps: string;
  timed: boolean;
  restSeconds: number;
  load: string;
  howTo: string[];
  mistakes: string[];
  easier: string;
  harder: string;
}

export interface PlanDay {
  label: string;
  focus: string;
  durationMin: number;
  warmup: string[];
  exercises: PlanExercise[];
  cooldown: string[];
}

export interface WorkoutPlan {
  id: string;
  name: string;
  goal: CoachGoal;
  location: TrainingLocation;
  daysPerWeek: number;
  sessionMinutes: number;
  overview: string;
  schedule: string;
  progression: string;
  safety: string[];
  days: PlanDay[];
  isActive: boolean;
  createdAt: string;
}

export type WorkoutPlanSummary = Pick<WorkoutPlan, 'id' | 'name' | 'goal' | 'location' | 'daysPerWeek' | 'isActive' | 'createdAt'>;

export interface LoggedSet {
  setNumber: number;
  reps: number | null;
  seconds: number | null;
  loadKg: number | null;
}

/** Sets from the most recent session that included the exercise. */
export interface ExerciseHistory {
  name: string;
  lastDate: string;
  sets: LoggedSet[];
  bestLoadKg: number | null;
  sessions: number;
}

export interface WorkoutSessionSummary {
  id: string;
  dayLabel: string;
  sessionDate: string;
  durationMin: number | null;
  rpe: number | null;
  calories: number | null;
  exercises: { name: string; sets: LoggedSet[] }[];
}

export function exerciseKey(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** "8-12", "8 a 12", "10", "30-45s" → { min, max }. */
export function parseRange(target: string): { min: number; max: number } | null {
  const nums = (target.match(/\d+/g) ?? []).map(Number).filter((n) => n > 0);
  if (nums.length === 0) return null;
  const min = nums[0];
  const max = nums.length > 1 ? Math.max(nums[1], min) : min;
  return { min, max };
}

export function formatKg(kg: number): string {
  return kg.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
}

export function formatSets(sets: LoggedSet[]): string {
  const values = sets.map((s) => (s.seconds != null ? `${s.seconds}s` : s.reps != null ? String(s.reps) : '—'));
  const loads = [...new Set(sets.map((s) => s.loadKg).filter((l): l is number => l != null && l > 0))];
  const loadText = loads.length === 0 ? '' : loads.length === 1 ? ` × ${formatKg(loads[0])}kg` : ` × ${loads.map(formatKg).join('/')}kg`;
  return `${values.join(', ')}${loadText}`;
}

export function sessionVolume(exercises: { sets: LoggedSet[] }[]): number {
  return Math.round(
    exercises.reduce((sum, e) => sum + e.sets.reduce((s, set) => s + (set.reps ?? 0) * (set.loadKg ?? 0), 0), 0)
  );
}

export interface Suggestion {
  reps: number | null;
  seconds: number | null;
  loadKg: number | null;
  hint: string | null;
}

// Double progression: keep the load until every set reaches the top of the
// range, then add load and drop back to the bottom of the range.
export function suggestNext(ex: PlanExercise, last?: ExerciseHistory): Suggestion {
  const range = parseRange(ex.reps);
  const done = last?.sets ?? [];

  if (ex.timed) {
    const base = range?.min ?? 30;
    if (done.length === 0) return { reps: null, seconds: base, loadKg: null, hint: null };
    const shortest = Math.min(...done.map((s) => s.seconds ?? 0));
    if (range && shortest >= range.max) {
      return {
        reps: null, seconds: range.max + 10, loadKg: null,
        hint: `Você segurou ${range.max}s em todas as séries: tente +10s ou a variação mais difícil.`,
      };
    }
    const target = Math.min(Math.max(shortest + 5, base), range?.max ?? shortest + 5);
    return { reps: null, seconds: target, loadKg: null, hint: `Última vez: ${formatSets(done)}. Hoje busque ${target}s.` };
  }

  if (done.length === 0) return { reps: range?.min ?? null, seconds: null, loadKg: null, hint: null };

  const topLoad = Math.max(0, ...done.map((s) => s.loadKg ?? 0));
  const topSets = done.filter((s) => (s.loadKg ?? 0) === topLoad);
  const minReps = Math.min(...topSets.map((s) => s.reps ?? 0));
  const allHit = range != null && topSets.length >= ex.sets && minReps >= range.max;

  if (allHit && topLoad > 0) {
    const step = topLoad < 20 ? 1 : 2.5;
    const next = Math.round((topLoad + step) * 2) / 2;
    return {
      reps: range.min, seconds: null, loadKg: next,
      hint: `Você fez ${range.max}+ repetições em todas as séries com ${formatKg(topLoad)}kg: suba para ${formatKg(next)}kg.`,
    };
  }
  if (allHit) {
    return {
      reps: range.max, seconds: null, loadKg: null,
      hint: `Você bateu ${range.max} repetições em todas as séries: passe para a variação mais difícil ou adicione carga.`,
    };
  }

  const reps = range ? Math.min(range.max, Math.max(minReps + 1, range.min)) : minReps || null;
  return {
    reps, seconds: null, loadKg: topLoad > 0 ? topLoad : null,
    hint: `Última vez: ${formatSets(done)}. Hoje busque ${reps ?? '+1'} repetições${topLoad > 0 ? ` com ${formatKg(topLoad)}kg` : ''}.`,
  };
}

export function youtubeSearchUrl(exercise: string): string {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(`como fazer ${exercise} execução correta`)}`;
}
