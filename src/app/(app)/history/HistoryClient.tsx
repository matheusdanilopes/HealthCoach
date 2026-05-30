'use client';

import { useState, useMemo } from 'react';
import {
  AreaChart, Area, BarChart, Bar, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Scale, BarChart2, Droplets, Dumbbell, Trophy,
  Target, ChevronRight, Activity, Ruler, Zap,
  TrendingDown, TrendingUp, Minus,
} from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { useTheme } from '@/contexts/ThemeContext';

// ── Types ──────────────────────────────────────────────────────────────────

interface Profile {
  targetCalories: number;
  targetProtein:  number;
  targetWater:    number;
  currentWeight:  number | null;
}

interface WeightEntry        { date: string; weight: number }
interface NutritionEntry     { date: string; calories: number; protein: number }
interface WaterEntry         { date: string; total: number }
interface BodyMetricEntry    { date: string; weight: number | null; muscle_mass: number | null; body_fat: number | null; visceral_fat: number | null }
interface MeasurementEntry   { date: string; waist: number | null; abdomen: number | null; hips: number | null; chest: number | null; avgArm: number | null; avgThigh: number | null }

interface HistoryClientProps {
  profile:          Profile;
  weightLogs:       WeightEntry[];
  dailyNutrition:   NutritionEntry[];
  workoutDays:      string[];
  dailyWater:       WaterEntry[];
  bodyMetrics:      BodyMetricEntry[];
  bodyMeasurements: MeasurementEntry[];
}

type Range = 7 | 30 | 90;

// ── Helpers ────────────────────────────────────────────────────────────────

function filterByDays<T extends { date: string }>(data: T[], days: number): T[] {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString().split('T')[0];
  return data.filter((d) => d.date >= cutoffStr);
}

function filterWorkoutsByDays(days: string[], n: number): string[] {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - n);
  const cutoffStr = cutoff.toISOString().split('T')[0];
  return days.filter((d) => d >= cutoffStr);
}

function measureDelta(arr: MeasurementEntry[], key: keyof Omit<MeasurementEntry, 'date'>): number | null {
  if (arr.length < 2) return null;
  const first = arr[0][key];
  const last  = arr[arr.length - 1][key];
  if (first == null || last == null) return null;
  return (last as number) - (first as number);
}

function linearReg(points: { x: number; y: number }[]): { slope: number; intercept: number } | null {
  const n = points.length;
  if (n < 3) return null;
  const sumX  = points.reduce((s, p) => s + p.x, 0);
  const sumY  = points.reduce((s, p) => s + p.y, 0);
  const sumXY = points.reduce((s, p) => s + p.x * p.y, 0);
  const sumXX = points.reduce((s, p) => s + p.x * p.x, 0);
  const slope     = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;
  return { slope, intercept };
}

function deltaSign(v: number): string { return v > 0 ? '+' : ''; }

// ── Sub-components ─────────────────────────────────────────────────────────

function ScoreGauge({ score }: { score: number }) {
  const r   = 52;
  const circ = 2 * Math.PI * r;
  const off  = circ - (score / 100) * circ;
  const color = score >= 75 ? '#10b981' : score >= 50 ? '#f59e0b' : score >= 25 ? '#f97316' : '#ef4444';
  const label = score >= 75 ? 'Excelente' : score >= 50 ? 'Bom' : score >= 25 ? 'Em progresso' : 'Iniciando';
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative">
        <svg width="128" height="128" className="-rotate-90">
          <circle cx="64" cy="64" r={r} fill="none" strokeWidth="9" stroke="currentColor"
            className="text-zinc-100 dark:text-zinc-800" />
          <circle cx="64" cy="64" r={r} fill="none" strokeWidth="9" stroke={color}
            strokeDasharray={circ} strokeDashoffset={off} strokeLinecap="round"
            style={{ transition: 'stroke-dashoffset 1s ease-out' }} />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[28px] font-bold tabular-nums leading-none" style={{ color }}>{score}</span>
          <span className="text-[9px] uppercase tracking-widest text-zinc-400 dark:text-zinc-500 font-semibold mt-0.5">Score</span>
        </div>
      </div>
      <span className="text-[11px] font-semibold" style={{ color }}>{label}</span>
    </div>
  );
}

function ScoreBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px] text-zinc-500 dark:text-zinc-400">{label}</span>
        <span className="text-[11px] font-bold tabular-nums text-zinc-700 dark:text-zinc-300">{value}</span>
      </div>
      <div className="h-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${value}%`, backgroundColor: color, transition: 'width 1s ease-out' }} />
      </div>
    </div>
  );
}

interface KpiCardProps {
  icon: React.ReactNode;
  label: string;
  value: string | null;
  unit?: string;
  delta?: number | null;
  deltaUnit?: string;
  higherIsBetter?: boolean;
}
function KpiCard({ icon, label, value, unit, delta, deltaUnit, higherIsBetter = false }: KpiCardProps) {
  const isGood = delta != null && (higherIsBetter ? delta > 0 : delta < 0);
  const isBad  = delta != null && (higherIsBetter ? delta < 0 : delta > 0);
  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800/80 rounded-2xl p-4 shadow-[0_1px_3px_0_rgb(0,0,0,0.04)] dark:shadow-none">
      <div className="flex items-center gap-2 mb-3">
        <div className="h-7 w-7 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 flex items-center justify-center text-emerald-600 dark:text-emerald-400 flex-shrink-0">
          {icon}
        </div>
        <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 leading-tight">{label}</span>
      </div>
      {value == null ? (
        <span className="text-[12px] text-zinc-300 dark:text-zinc-600">Sem dados</span>
      ) : (
        <>
          <div className="flex items-baseline gap-1">
            <span className="text-[22px] font-bold tabular-nums text-zinc-900 dark:text-zinc-100 leading-none">{value}</span>
            {unit && <span className="text-[12px] text-zinc-400 dark:text-zinc-500 font-medium">{unit}</span>}
          </div>
          {delta != null && deltaUnit && (
            <div className={cn('flex items-center gap-0.5 mt-1.5 text-[11px] font-semibold',
              isGood ? 'text-emerald-600 dark:text-emerald-400' :
              isBad  ? 'text-red-500 dark:text-red-400' : 'text-zinc-400')}>
              {isGood ? <TrendingDown size={11} /> : isBad ? <TrendingUp size={11} /> : <Minus size={11} />}
              <span>{deltaSign(delta)}{delta.toFixed(1)}{deltaUnit} desde o início</span>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function SectionCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800/80 rounded-2xl p-5 shadow-[0_1px_3px_0_rgb(0,0,0,0.04)] dark:shadow-none', className)}>
      {children}
    </div>
  );
}

function SectionLabel({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <span className="text-emerald-500 flex-shrink-0">{icon}</span>
      <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">{title}</p>
    </div>
  );
}

function EmptyState({ icon, title, sub }: { icon: React.ReactNode; title: string; sub: string }) {
  return (
    <div className="h-36 flex flex-col items-center justify-center gap-2.5">
      <div className="h-10 w-10 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-400 dark:text-zinc-500">
        {icon}
      </div>
      <div className="text-center">
        <p className="text-[13px] font-semibold text-zinc-500 dark:text-zinc-400">{title}</p>
        <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-0.5 max-w-[200px] leading-relaxed">{sub}</p>
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────

export default function HistoryClient({
  profile,
  weightLogs,
  dailyNutrition,
  workoutDays,
  dailyWater,
  bodyMetrics,
  bodyMeasurements,
}: HistoryClientProps) {
  const [range, setRange] = useState<Range>(30);
  const { theme } = useTheme();

  const { gridColor, tickColor, cursorColor, lineColor, isDark } = useMemo(() => {
    const dark = theme === 'dark';
    return {
      isDark:      dark,
      gridColor:   dark ? '#1f1f23' : '#f4f4f5',
      tickColor:   dark ? '#52525b' : '#a1a1aa',
      cursorColor: dark ? '#27272a' : '#f4f4f5',
      lineColor:   dark ? '#34d399' : '#059669',
    };
  }, [theme]);

  // Filtered data by selected range
  const fw   = useMemo(() => filterByDays(weightLogs,     range), [weightLogs,     range]);
  const fn   = useMemo(() => filterByDays(dailyNutrition, range), [dailyNutrition, range]);
  const fwat = useMemo(() => filterByDays(dailyWater,     range), [dailyWater,     range]);
  const fwo  = useMemo(() => filterWorkoutsByDays(workoutDays, range), [workoutDays, range]);

  // ── KPI values (first vs last — full history) ──────────────────────────
  const kpis = useMemo(() => {
    const wFirst  = weightLogs[0]?.weight ?? null;
    const wLast   = weightLogs[weightLogs.length - 1]?.weight ?? null;
    const wDelta  = wFirst != null && wLast != null ? wLast - wFirst : null;

    const bmFirst = bodyMetrics[0];
    const bmLast  = bodyMetrics[bodyMetrics.length - 1];

    const bfFirst = bmFirst?.body_fat ?? null;
    const bfLast  = bmLast?.body_fat  ?? null;
    const bfDelta = bfFirst != null && bfLast != null ? bfLast - bfFirst : null;

    const mmFirst = bmFirst?.muscle_mass ?? null;
    const mmLast  = bmLast?.muscle_mass  ?? null;
    const mmDelta = mmFirst != null && mmLast != null ? mmLast - mmFirst : null;

    const msFirst = bodyMeasurements[0];
    const msLast  = bodyMeasurements[bodyMeasurements.length - 1];
    const waistLast  = msLast?.waist  ?? null;
    const waistDelta = measureDelta(bodyMeasurements, 'waist');

    return { wFirst, wLast, wDelta, bfLast, bfDelta, mmLast, mmDelta, waistLast, waistDelta, bmLast, msLast, msFirst };
  }, [weightLogs, bodyMetrics, bodyMeasurements]);

  // ── Nutrition stats ────────────────────────────────────────────────────
  const nutrition = useMemo(() => {
    const d = fn;
    if (d.length === 0) return { avg: 0, consistencyPct: 0, avgProtein: 0 };
    const avg            = Math.round(d.reduce((s, x) => s + x.calories, 0) / d.length);
    const consistentDays = d.filter((x) => x.calories <= profile.targetCalories).length;
    const consistencyPct = Math.round((consistentDays / d.length) * 100);
    const avgProtein     = Math.round(d.reduce((s, x) => s + x.protein, 0) / d.length);
    return { avg, consistencyPct, avgProtein };
  }, [fn, profile.targetCalories]);

  // ── Hydration stats ────────────────────────────────────────────────────
  const hydration = useMemo(() => {
    const d = fwat;
    if (d.length === 0) return { avg: 0, goalRate: 0 };
    const avg      = Math.round(d.reduce((s, x) => s + x.total, 0) / d.length);
    const goalDays = d.filter((x) => x.total >= profile.targetWater).length;
    const goalRate = Math.round((goalDays / d.length) * 100);
    return { avg, goalRate };
  }, [fwat, profile.targetWater]);

  // ── Workout stats ──────────────────────────────────────────────────────
  const workouts = useMemo(() => {
    const total   = fwo.length;
    const weeks   = Math.max(range / 7, 1);
    const perWeek = parseFloat((total / weeks).toFixed(1));
    return { total, perWeek };
  }, [fwo, range]);

  // ── Evolution Score ────────────────────────────────────────────────────
  const score = useMemo(() => {
    const last30n = filterByDays(dailyNutrition, 30);

    const nutritionScore  = nutrition.consistencyPct;
    const hydrationScore  = hydration.goalRate;
    const trackingScore   = Math.min(Math.round((last30n.length / 30) * 100), 100);
    const workoutScore    = Math.min(Math.round((workouts.perWeek / 4) * 100), 100);

    let bodyScore = 50;
    const parts: number[] = [];
    if (kpis.wDelta != null) {
      parts.push(kpis.wDelta <= 0
        ? Math.min(50 + Math.abs(kpis.wDelta) * 10, 100)
        : Math.max(50 - kpis.wDelta * 8, 10));
    }
    if (kpis.bfDelta != null) {
      parts.push(kpis.bfDelta < 0 ? Math.min(70 + Math.abs(kpis.bfDelta) * 5, 100) : 35);
    }
    if (kpis.mmDelta != null) {
      parts.push(kpis.mmDelta > 0 ? Math.min(70 + kpis.mmDelta * 10, 100) : 40);
    }
    if (parts.length > 0) bodyScore = Math.round(parts.reduce((s, v) => s + v, 0) / parts.length);

    const total = Math.round(
      nutritionScore * 0.25 +
      hydrationScore * 0.15 +
      trackingScore  * 0.20 +
      workoutScore   * 0.15 +
      bodyScore      * 0.25
    );

    return {
      total: Math.min(Math.max(total, 0), 100),
      breakdown: {
        nutrition:  nutritionScore,
        hydration:  hydrationScore,
        consistencia: trackingScore,
        treinos:    workoutScore,
        composicao: Math.round(bodyScore),
      },
    };
  }, [nutrition, hydration, workouts, kpis, dailyNutrition]);

  // ── Projections (linear regression on last 30d weight) ────────────────
  const projection = useMemo(() => {
    const last30 = filterByDays(weightLogs, 30);
    if (last30.length < 3) return null;
    const t0 = new Date(last30[0].date).getTime();
    const pts = last30.map((d) => ({
      x: (new Date(d.date).getTime() - t0) / 86_400_000,
      y: d.weight,
    }));
    const reg = linearReg(pts);
    if (!reg) return null;
    const lastX = pts[pts.length - 1].x;
    return {
      ratePerWeek: reg.slope * 7,
      in30:  parseFloat((reg.intercept + reg.slope * (lastX + 30)).toFixed(1)),
      in90:  parseFloat((reg.intercept + reg.slope * (lastX + 90)).toFixed(1)),
    };
  }, [weightLogs]);

  // ── Milestones ────────────────────────────────────────────────────────
  const milestones = useMemo(() => {
    const weightLost  = kpis.wFirst != null && kpis.wLast != null ? kpis.wFirst - kpis.wLast : 0;
    const waistLost   = kpis.waistDelta != null ? -kpis.waistDelta : 0;
    const last7       = filterByDays(dailyNutrition, 7);
    const last30      = filterByDays(dailyNutrition, 30);
    return [
      { id: 'first_log',  emoji: '📋', title: '1° Registro',    sub: 'Primeira refeição',   ok: dailyNutrition.length > 0 },
      { id: 'first_w',    emoji: '⚖️', title: '1° Pesagem',     sub: 'Peso registrado',     ok: weightLogs.length > 0 },
      { id: 'w500g',      emoji: '🎯', title: '500g perdidos',  sub: 'Primeiro progresso',  ok: weightLost >= 0.5 },
      { id: 'w1kg',       emoji: '🏅', title: '1kg perdido',    sub: 'Resultado inicial',   ok: weightLost >= 1 },
      { id: 'w5kg',       emoji: '🏆', title: '5kg perdidos',   sub: 'Marco importante',    ok: weightLost >= 5 },
      { id: 'streak7',    emoji: '🔥', title: '7 dias seguidos', sub: 'Consistência semanal', ok: last7.length >= 7 },
      { id: 'streak30',   emoji: '💎', title: '30 dias ativos', sub: 'Consistência mensal', ok: last30.length >= 25 },
      { id: 'waist5',     emoji: '📏', title: '5cm de cintura', sub: 'Evolução expressiva', ok: waistLost >= 5 },
    ];
  }, [kpis, dailyNutrition, weightLogs]);

  // ── Days tracked ──────────────────────────────────────────────────────
  const daysTracked = useMemo(() => {
    const all = new Set([
      ...weightLogs.map((d) => d.date),
      ...dailyNutrition.map((d) => d.date),
    ]);
    return all.size;
  }, [weightLogs, dailyNutrition]);

  const rangeLabel: Record<Range, string> = { 7: '7 dias', 30: '30 dias', 90: '90 dias' };
  const achievedCount = milestones.filter((m) => m.ok).length;

  return (
    <div className="flex flex-col gap-5 pt-8 pb-8 animate-fade-in">

      {/* ── Header ───────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[22px] font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">Evolução</h1>
          <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-0.5 font-medium">
            {daysTracked > 0 ? `${daysTracked} dias acompanhados` : 'Comece registrando seus dados'}
          </p>
        </div>
        <div className="flex gap-1 bg-zinc-100 dark:bg-zinc-800/80 rounded-xl p-1 self-start mt-1">
          {([7, 30, 90] as Range[]).map((n) => (
            <button key={n} onClick={() => setRange(n)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all duration-150',
                range === n
                  ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm'
                  : 'text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
              )}>
              {n}d
            </button>
          ))}
        </div>
      </div>

      {/* ── Evolution Score ───────────────────────────────────────────── */}
      <SectionCard>
        <SectionLabel icon={<Zap size={13} />} title="Evolution Score" />
        <div className="flex items-center gap-5">
          <ScoreGauge score={score.total} />
          <div className="flex-1 space-y-2.5">
            <ScoreBar label="Nutrição"    value={score.breakdown.nutrition}    color="#10b981" />
            <ScoreBar label="Hidratação"  value={score.breakdown.hydration}    color="#06b6d4" />
            <ScoreBar label="Consistência" value={score.breakdown.consistencia} color="#8b5cf6" />
            <ScoreBar label="Treinos"     value={score.breakdown.treinos}      color="#f97316" />
            <ScoreBar label="Composição"  value={score.breakdown.composicao}   color="#f59e0b" />
          </div>
        </div>
      </SectionCard>

      {/* ── KPI Cards ────────────────────────────────────────────────── */}
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500 mb-3 px-0.5">
          Métricas principais
        </p>
        <div className="grid grid-cols-2 gap-3">
          <KpiCard icon={<Scale size={14} />}    label="Peso atual"
            value={kpis.wLast    != null ? kpis.wLast.toFixed(1)  : null}  unit="kg"
            delta={kpis.wDelta}  deltaUnit="kg" />
          <KpiCard icon={<Activity size={14} />} label="Gordura corporal"
            value={kpis.bfLast  != null ? kpis.bfLast.toFixed(1)  : null}  unit="%"
            delta={kpis.bfDelta} deltaUnit="%" />
          <KpiCard icon={<Dumbbell size={14} />} label="Massa muscular"
            value={kpis.mmLast  != null ? kpis.mmLast.toFixed(1)   : null}  unit="kg"
            delta={kpis.mmDelta} deltaUnit="kg" higherIsBetter />
          <KpiCard icon={<Ruler size={14} />}    label="Cintura"
            value={kpis.waistLast != null ? kpis.waistLast.toFixed(0) : null} unit="cm"
            delta={kpis.waistDelta} deltaUnit="cm" />
        </div>
      </div>

      {/* ── Weight Chart ─────────────────────────────────────────────── */}
      <SectionCard>
        <SectionLabel icon={<Scale size={13} />} title={`Peso — ${rangeLabel[range]}`} />
        {fw.length < 2 ? (
          <EmptyState icon={<Scale size={18} />} title="Dados insuficientes"
            sub="Registre seu peso em pelo menos 2 dias para ver a tendência." />
        ) : (
          <>
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={fw} margin={{ top: 4, right: 4, bottom: 0, left: -22 }}>
                <defs>
                  <linearGradient id="wGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor={lineColor} stopOpacity={0.18} />
                    <stop offset="95%" stopColor={lineColor} stopOpacity={0}    />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                <XAxis dataKey="date" tickFormatter={(d) => format(parseISO(d), 'd/M')}
                  tick={{ fontSize: 10, fill: tickColor }} axisLine={false} tickLine={false} />
                <YAxis domain={['dataMin - 0.5', 'dataMax + 0.5']}
                  tick={{ fontSize: 10, fill: tickColor }} axisLine={false} tickLine={false}
                  tickFormatter={(v) => `${v}kg`} />
                <Tooltip cursor={{ stroke: cursorColor, strokeWidth: 1 }}
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    return (
                      <div className="bg-white dark:bg-zinc-800 border border-zinc-100 dark:border-zinc-700 rounded-xl px-3 py-2 shadow-lg">
                        <p className="text-zinc-400 text-[10px] mb-0.5">
                          {label ? format(parseISO(label as string), "d 'de' MMM", { locale: ptBR }) : ''}
                        </p>
                        <p className="font-bold tabular-nums text-sm text-zinc-900 dark:text-zinc-100">
                          {payload[0].value} kg
                        </p>
                      </div>
                    );
                  }} />
                <Area type="monotone" dataKey="weight" stroke={lineColor} strokeWidth={2}
                  fill="url(#wGrad)" dot={{ fill: lineColor, r: 2, strokeWidth: 0 }}
                  activeDot={{ r: 4, strokeWidth: 0 }} />
              </AreaChart>
            </ResponsiveContainer>
            <div className="grid grid-cols-3 gap-2 mt-4 pt-4 border-t border-zinc-50 dark:border-zinc-800/60 text-center">
              {[
                { label: 'Início', value: `${fw[0].weight.toFixed(1)}kg` },
                { label: 'Atual',  value: `${fw[fw.length - 1].weight.toFixed(1)}kg` },
                { label: 'Variação', value: (() => {
                    const d = fw[fw.length - 1].weight - fw[0].weight;
                    return `${d > 0 ? '+' : ''}${d.toFixed(1)}kg`;
                  })() },
              ].map((s) => (
                <div key={s.label}>
                  <p className="text-[10px] text-zinc-400 dark:text-zinc-500">{s.label}</p>
                  <p className="text-[13px] font-bold tabular-nums text-zinc-800 dark:text-zinc-200 mt-0.5">{s.value}</p>
                </div>
              ))}
            </div>
          </>
        )}
      </SectionCard>

      {/* ── Body Composition ─────────────────────────────────────────── */}
      {bodyMetrics.length > 0 && (
        <SectionCard>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="text-emerald-500"><Activity size={13} /></span>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
                Composição Corporal
              </p>
            </div>
            <Link href="/body-metrics"
              className="flex items-center gap-0.5 text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold hover:underline">
              Gerenciar <ChevronRight size={11} />
            </Link>
          </div>
          <div className="grid grid-cols-3 gap-2.5 mb-4">
            {kpis.bfLast != null && (
              <div className="text-center p-3 rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/30">
                <p className="text-[9px] font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400 mb-1">Gordura</p>
                <p className="text-[18px] font-bold tabular-nums text-amber-700 dark:text-amber-300">{kpis.bfLast.toFixed(1)}%</p>
                {kpis.bfDelta != null && (
                  <p className={cn('text-[10px] font-semibold mt-0.5', kpis.bfDelta < 0 ? 'text-emerald-600' : 'text-red-500')}>
                    {deltaSign(kpis.bfDelta)}{kpis.bfDelta.toFixed(1)}%
                  </p>
                )}
              </div>
            )}
            {kpis.mmLast != null && (
              <div className="text-center p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/30">
                <p className="text-[9px] font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 mb-1">Músculo</p>
                <p className="text-[18px] font-bold tabular-nums text-emerald-700 dark:text-emerald-300">{kpis.mmLast.toFixed(1)}kg</p>
                {kpis.mmDelta != null && (
                  <p className={cn('text-[10px] font-semibold mt-0.5', kpis.mmDelta > 0 ? 'text-emerald-600' : 'text-red-500')}>
                    {deltaSign(kpis.mmDelta)}{kpis.mmDelta.toFixed(1)}kg
                  </p>
                )}
              </div>
            )}
            {kpis.bmLast?.visceral_fat != null && (
              <div className="text-center p-3 rounded-xl bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/30">
                <p className="text-[9px] font-semibold uppercase tracking-wider text-red-600 dark:text-red-400 mb-1">Visceral</p>
                <p className="text-[18px] font-bold tabular-nums text-red-700 dark:text-red-300">{kpis.bmLast.visceral_fat}</p>
              </div>
            )}
          </div>
          {/* Fat% chart */}
          {bodyMetrics.filter((b) => b.body_fat != null).length >= 2 && (
            <>
              <p className="text-[10px] text-zinc-400 dark:text-zinc-500 mb-2 font-medium">Gordura corporal ao longo do tempo</p>
              <ResponsiveContainer width="100%" height={110}>
                <AreaChart data={bodyMetrics.filter((b) => b.body_fat != null)} margin={{ top: 2, right: 4, bottom: 0, left: -22 }}>
                  <defs>
                    <linearGradient id="fatGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#f59e0b" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}   />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="date" tickFormatter={(d) => format(parseISO(d), 'd/M')}
                    tick={{ fontSize: 9, fill: tickColor }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 9, fill: tickColor }} axisLine={false} tickLine={false}
                    tickFormatter={(v) => `${v}%`} />
                  <Tooltip cursor={{ stroke: cursorColor, strokeWidth: 1 }}
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null;
                      return (
                        <div className="bg-white dark:bg-zinc-800 border border-zinc-100 dark:border-zinc-700 rounded-xl px-3 py-2 shadow-lg">
                          <p className="text-zinc-400 text-[10px]">{label ? format(parseISO(label as string), "d 'de' MMM", { locale: ptBR }) : ''}</p>
                          <p className="font-bold text-sm text-amber-600">{payload[0].value}%</p>
                        </div>
                      );
                    }} />
                  <Area type="monotone" dataKey="body_fat" stroke="#f59e0b" strokeWidth={1.5} fill="url(#fatGrad)" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </>
          )}
        </SectionCard>
      )}

      {/* ── Body Measurements ────────────────────────────────────────── */}
      {bodyMeasurements.length > 0 && (
        <SectionCard>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="text-emerald-500"><Ruler size={13} /></span>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
                Medidas Corporais
              </p>
            </div>
            <Link href="/body-measurements"
              className="flex items-center gap-0.5 text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold hover:underline">
              Gerenciar <ChevronRight size={11} />
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            {(
              [
                { label: 'Cintura',  val: kpis.msLast?.waist,   delta: measureDelta(bodyMeasurements, 'waist')   },
                { label: 'Abdômen', val: kpis.msLast?.abdomen,  delta: measureDelta(bodyMeasurements, 'abdomen') },
                { label: 'Quadril',  val: kpis.msLast?.hips,    delta: measureDelta(bodyMeasurements, 'hips')    },
                { label: 'Tórax',   val: kpis.msLast?.chest,   delta: measureDelta(bodyMeasurements, 'chest')   },
                { label: 'Braço',    val: kpis.msLast?.avgArm,  delta: measureDelta(bodyMeasurements, 'avgArm')  },
                { label: 'Coxa',     val: kpis.msLast?.avgThigh,delta: measureDelta(bodyMeasurements, 'avgThigh')},
              ] as { label: string; val: number | null | undefined; delta: number | null }[]
            ).filter((row) => row.val != null).map(({ label, val, delta }) => (
              <div key={label}
                className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-100 dark:border-zinc-700/50">
                <span className="text-[12px] text-zinc-500 dark:text-zinc-400 font-medium">{label}</span>
                <div className="text-right">
                  <p className="text-[14px] font-bold tabular-nums text-zinc-800 dark:text-zinc-200">{val!.toFixed(0)}cm</p>
                  {delta != null && delta !== 0 && (
                    <p className={cn('text-[10px] font-semibold', delta < 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500')}>
                      {deltaSign(delta)}{delta.toFixed(1)}cm
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {/* ── Nutrition & Consistency ──────────────────────────────────── */}
      <SectionCard>
        <SectionLabel icon={<BarChart2 size={13} />} title={`Calorias — ${rangeLabel[range]}`} />
        <div className="grid grid-cols-3 gap-2 mb-4">
          {[
            { label: 'Média diária',  value: `${nutrition.avg.toLocaleString('pt-BR')} kcal` },
            { label: 'Proteína',      value: `${nutrition.avgProtein}g` },
            { label: 'Dentro da meta', value: `${nutrition.consistencyPct}%` },
          ].map((s) => (
            <div key={s.label}
              className="text-center p-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-100 dark:border-zinc-700/50">
              <p className="text-[9px] text-zinc-400 dark:text-zinc-500 leading-tight">{s.label}</p>
              <p className="text-[13px] font-bold tabular-nums text-zinc-800 dark:text-zinc-200 mt-0.5">{s.value}</p>
            </div>
          ))}
        </div>
        {fn.length === 0 ? (
          <EmptyState icon={<BarChart2 size={18} />} title="Sem registros"
            sub="Registre suas refeições no diário para ver o histórico calórico." />
        ) : (
          <>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={fn} margin={{ top: 4, right: 4, bottom: 0, left: -22 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                <XAxis dataKey="date" tickFormatter={(d) => format(parseISO(d), 'd/M')}
                  tick={{ fontSize: 10, fill: tickColor }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: tickColor }} axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill: isDark ? '#1f1f23' : '#f9f9f9' }}
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    const cal     = payload[0].value as number;
                    const deficit = profile.targetCalories - cal;
                    return (
                      <div className="bg-white dark:bg-zinc-800 border border-zinc-100 dark:border-zinc-700 rounded-xl px-3 py-2 shadow-lg">
                        <p className="text-zinc-400 text-[10px] mb-0.5">
                          {label ? format(parseISO(label as string), "d 'de' MMM", { locale: ptBR }) : ''}
                        </p>
                        <p className="font-bold tabular-nums text-sm text-zinc-900 dark:text-zinc-100">
                          {cal.toLocaleString('pt-BR')} kcal
                        </p>
                        <p className={cn('text-[11px] mt-0.5 font-medium', deficit >= 0 ? 'text-emerald-600' : 'text-red-500')}>
                          {deficit >= 0
                            ? `${deficit.toLocaleString('pt-BR')} abaixo`
                            : `${Math.abs(deficit).toLocaleString('pt-BR')} acima`}
                        </p>
                      </div>
                    );
                  }} />
                <ReferenceLine y={profile.targetCalories} stroke={lineColor}
                  strokeDasharray="4 4" strokeWidth={1} strokeOpacity={0.4} />
                <Bar dataKey="calories" radius={[3, 3, 0, 0]}>
                  {fn.map((entry, i) => (
                    <Cell key={i} fill={entry.calories <= profile.targetCalories ? '#10b981' : '#ef4444'} fillOpacity={0.75} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div className="flex items-center justify-center gap-5 mt-3 pt-3 border-t border-zinc-50 dark:border-zinc-800/60">
              <span className="flex items-center gap-2 text-[11px] text-zinc-400 dark:text-zinc-500">
                <span className="h-2 w-2 rounded bg-emerald-500 opacity-80" />Abaixo da meta
              </span>
              <span className="flex items-center gap-2 text-[11px] text-zinc-400 dark:text-zinc-500">
                <span className="h-2 w-2 rounded bg-red-500 opacity-80" />Acima da meta
              </span>
            </div>
          </>
        )}
      </SectionCard>

      {/* ── Hydration ────────────────────────────────────────────────── */}
      {fwat.length > 0 && (
        <SectionCard>
          <SectionLabel icon={<Droplets size={13} />} title={`Hidratação — ${rangeLabel[range]}`} />
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="text-center p-3 rounded-xl bg-sky-50 dark:bg-sky-950/20 border border-sky-100 dark:border-sky-900/30">
              <p className="text-[9px] font-semibold uppercase tracking-wider text-sky-600 dark:text-sky-400 mb-1">Média diária</p>
              <p className="text-[18px] font-bold tabular-nums text-sky-700 dark:text-sky-300">
                {(hydration.avg / 1000).toFixed(1)}L
              </p>
            </div>
            <div className="text-center p-3 rounded-xl bg-sky-50 dark:bg-sky-950/20 border border-sky-100 dark:border-sky-900/30">
              <p className="text-[9px] font-semibold uppercase tracking-wider text-sky-600 dark:text-sky-400 mb-1">Meta atingida</p>
              <p className="text-[18px] font-bold tabular-nums text-sky-700 dark:text-sky-300">
                {hydration.goalRate}%
              </p>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={110}>
            <BarChart data={fwat} margin={{ top: 2, right: 4, bottom: 0, left: -30 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
              <XAxis dataKey="date" tickFormatter={(d) => format(parseISO(d), 'd/M')}
                tick={{ fontSize: 10, fill: tickColor }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: tickColor }} axisLine={false} tickLine={false}
                tickFormatter={(v) => `${(v / 1000).toFixed(1)}L`} />
              <Tooltip cursor={{ fill: isDark ? '#1f1f23' : '#f9f9f9' }}
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  return (
                    <div className="bg-white dark:bg-zinc-800 border border-zinc-100 dark:border-zinc-700 rounded-xl px-3 py-2 shadow-lg">
                      <p className="text-zinc-400 text-[10px]">
                        {label ? format(parseISO(label as string), "d 'de' MMM", { locale: ptBR }) : ''}
                      </p>
                      <p className="font-bold text-sm text-sky-600">
                        {((payload[0].value as number) / 1000).toFixed(1)}L
                      </p>
                    </div>
                  );
                }} />
              <ReferenceLine y={profile.targetWater} stroke="#0ea5e9" strokeDasharray="4 4" strokeWidth={1} strokeOpacity={0.4} />
              <Bar dataKey="total" radius={[3, 3, 0, 0]}>
                {fwat.map((entry, i) => (
                  <Cell key={i} fill={entry.total >= profile.targetWater ? '#06b6d4' : '#7dd3fc'} fillOpacity={0.8} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </SectionCard>
      )}

      {/* ── Treinos ───────────────────────────────────────────────────── */}
      <SectionCard>
        <SectionLabel icon={<Dumbbell size={13} />} title={`Treinos — ${rangeLabel[range]}`} />
        <div className="grid grid-cols-2 gap-3">
          <div className="text-center p-4 rounded-xl bg-orange-50 dark:bg-orange-950/20 border border-orange-100 dark:border-orange-900/30">
            <p className="text-[9px] font-semibold uppercase tracking-wider text-orange-600 dark:text-orange-400 mb-1">Total</p>
            <p className="text-[26px] font-bold tabular-nums text-orange-700 dark:text-orange-300">{workouts.total}</p>
            <p className="text-[10px] text-orange-500 dark:text-orange-400 mt-0.5">treinos</p>
          </div>
          <div className="text-center p-4 rounded-xl bg-orange-50 dark:bg-orange-950/20 border border-orange-100 dark:border-orange-900/30">
            <p className="text-[9px] font-semibold uppercase tracking-wider text-orange-600 dark:text-orange-400 mb-1">Frequência</p>
            <p className="text-[26px] font-bold tabular-nums text-orange-700 dark:text-orange-300">{workouts.perWeek}</p>
            <p className="text-[10px] text-orange-500 dark:text-orange-400 mt-0.5">por semana</p>
          </div>
        </div>
        {workouts.total === 0 && (
          <p className="text-[12px] text-zinc-400 dark:text-zinc-500 text-center mt-4">
            Nenhum treino registrado neste período.
          </p>
        )}
      </SectionCard>

      {/* ── Projection ───────────────────────────────────────────────── */}
      {projection && (
        <SectionCard>
          <SectionLabel icon={<Target size={13} />} title="Projeção de Peso" />
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Em 30 dias', value: projection.in30 },
              { label: 'Em 90 dias', value: projection.in90 },
            ].map(({ label, value }) => (
              <div key={label}
                className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-100 dark:border-zinc-700/50">
                <p className="text-[10px] text-zinc-400 dark:text-zinc-500 mb-1">{label}</p>
                <p className="text-[22px] font-bold tabular-nums text-zinc-900 dark:text-zinc-100 leading-none">
                  {value.toFixed(1)}<span className="text-[12px] text-zinc-400 ml-1">kg</span>
                </p>
                {kpis.wLast != null && (
                  <p className={cn('text-[11px] font-semibold mt-1.5',
                    value < kpis.wLast ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-500')}>
                    {deltaSign(value - kpis.wLast)}{(value - kpis.wLast).toFixed(1)}kg
                  </p>
                )}
              </div>
            ))}
          </div>
          <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-3 leading-relaxed">
            Baseado em tendência de{' '}
            <span className={cn('font-semibold',
              projection.ratePerWeek < 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-500')}>
              {deltaSign(projection.ratePerWeek)}{projection.ratePerWeek.toFixed(2)}kg/semana
            </span>
            {' '}nos últimos 30 dias. Resultados dependem de hábitos futuros.
          </p>
        </SectionCard>
      )}

      {/* ── Milestones ───────────────────────────────────────────────── */}
      <SectionCard>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="text-emerald-500"><Trophy size={13} /></span>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
              Marcos & Conquistas
            </p>
          </div>
          <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
            {achievedCount}/{milestones.length}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {milestones.map((m) => (
            <div key={m.id}
              className={cn(
                'flex items-center gap-2.5 p-2.5 rounded-xl border transition-all',
                m.ok
                  ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-100 dark:border-emerald-900/30'
                  : 'bg-zinc-50 dark:bg-zinc-800/40 border-zinc-100 dark:border-zinc-700/50 opacity-45'
              )}>
              <span className="text-[18px] leading-none">{m.emoji}</span>
              <div className="min-w-0">
                <p className={cn('text-[11px] font-semibold truncate',
                  m.ok ? 'text-emerald-700 dark:text-emerald-300' : 'text-zinc-500 dark:text-zinc-400')}>
                  {m.title}
                </p>
                <p className="text-[10px] text-zinc-400 dark:text-zinc-500 truncate">{m.sub}</p>
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

      {/* ── Quick Actions ─────────────────────────────────────────────── */}
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500 mb-3 px-0.5">
          Adicionar dados
        </p>
        <div className="grid grid-cols-2 gap-3">
          {[
            { href: '/body-metrics',       icon: <Scale size={17} />,  label: 'Pesagem',   sub: 'Peso · gordura · músculo' },
            { href: '/body-measurements',  icon: <Ruler size={17} />,  label: 'Medidas',   sub: 'Cintura · braços · coxas' },
          ].map(({ href, icon, label, sub }) => (
            <Link key={href} href={href}
              className="flex items-center justify-between p-4 bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800/80 rounded-2xl shadow-[0_1px_3px_0_rgb(0,0,0,0.04)] dark:shadow-none hover:border-emerald-200 dark:hover:border-emerald-800/50 transition-all active:scale-[0.97] group">
              <div>
                <p className="text-[13px] font-semibold text-zinc-800 dark:text-zinc-200">{label}</p>
                <p className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-0.5">{sub}</p>
              </div>
              <span className="text-zinc-300 dark:text-zinc-600 group-hover:text-emerald-500 transition-colors">{icon}</span>
            </Link>
          ))}
        </div>
      </div>

    </div>
  );
}
