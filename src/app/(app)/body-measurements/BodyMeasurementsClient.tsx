'use client';

import { useState, useMemo } from 'react';
import {
  AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts';
import {
  format, parseISO, formatDistanceToNowStrict,
  subDays, differenceInDays,
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Plus, Pencil, Trash2, Ruler,
  TrendingDown, TrendingUp, Minus,
  Lightbulb, GitCompare, X, ChevronDown,
} from 'lucide-react';
import Link from 'next/link';
import { cn, todayISO } from '@/lib/utils';
import { useTheme } from '@/contexts/ThemeContext';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import type { BodyMeasurements } from '@/types';

/* ─── Types ─── */

type SimpleField = 'waist' | 'abdomen' | 'hips' | 'chest';
type ChartKey = SimpleField | 'arms' | 'thighs' | 'calves';
type TimeRange = 7 | 30 | 90 | 0;

type MeasurementField = keyof Omit<BodyMeasurements,
  'id' | 'user_id' | 'date' | 'created_at' | 'updated_at'
>;

/* ─── Config ─── */

const CHART_CONFIGS: { key: ChartKey; label: string; color: string; goodDown: boolean }[] = [
  { key: 'waist',   label: 'Cintura',      color: '#f59e0b', goodDown: true  },
  { key: 'abdomen', label: 'Abdômen',      color: '#ef4444', goodDown: true  },
  { key: 'hips',    label: 'Quadril',      color: '#a855f7', goodDown: false },
  { key: 'chest',   label: 'Tórax',        color: '#2563eb', goodDown: false },
  { key: 'arms',    label: 'Braços',       color: '#10b981', goodDown: false },
  { key: 'thighs',  label: 'Coxas',        color: '#06b6d4', goodDown: false },
  { key: 'calves',  label: 'Panturrilhas', color: '#8b5cf6', goodDown: false },
];

const TIME_FILTERS: { value: TimeRange; label: string }[] = [
  { value: 7,  label: '7d'   },
  { value: 30, label: '30d'  },
  { value: 90, label: '90d'  },
  { value: 0,  label: 'Tudo' },
];

const MEASUREMENT_FIELDS: MeasurementField[] = [
  'waist','abdomen','hips','chest',
  'right_arm','left_arm',
  'right_thigh','left_thigh',
  'right_calf','left_calf',
];

/* ─── Helpers ─── */

const today = () => todayISO();

function avg(a: number | null, b: number | null): number | null {
  if (a != null && b != null) return (a + b) / 2;
  return a ?? b;
}

function chartValue(m: BodyMeasurements, key: ChartKey): number | null {
  if (key === 'arms')   return avg(m.right_arm, m.left_arm);
  if (key === 'thighs') return avg(m.right_thigh, m.left_thigh);
  if (key === 'calves') return avg(m.right_calf, m.left_calf);
  return m[key as SimpleField];
}

function diff(curr: number | null, prev: number | null, goodDown: boolean) {
  if (curr == null || prev == null) return null;
  const d = curr - prev;
  if (Math.abs(d) < 0.1) return { label: '—', good: null as boolean | null, raw: 0, sign: '', value: '0' };
  const good = goodDown ? d < 0 : d > 0;
  return {
    label: `${d > 0 ? '+' : ''}${d.toFixed(1)} cm`,
    good,
    raw: d,
    sign: d > 0 ? '+' : '' as string,
    value: d.toFixed(1),
  };
}

function fmtCm(v: number | null) {
  if (v == null) return '—';
  return `${v % 1 === 0 ? v : v.toFixed(1)} cm`;
}

function cutoffStr(range: TimeRange): string | null {
  if (range === 0) return null;
  return format(subDays(new Date(), range), 'yyyy-MM-dd');
}

/* ─── Tooltip ─── */

function CustomTooltip({ active, payload, label }: {
  active?: boolean; payload?: Array<{ value: number }>; label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white dark:bg-zinc-800 border border-zinc-100 dark:border-zinc-700 rounded-xl px-3 py-2 shadow-lg">
      <p className="text-zinc-400 dark:text-zinc-500 text-[10px] mb-1 font-medium">
        {label ? format(parseISO(label), "d 'de' MMM", { locale: ptBR }) : ''}
      </p>
      <p className="text-zinc-900 dark:text-zinc-100 font-bold tabular-nums text-sm">
        {payload[0].value.toFixed(1)} cm
      </p>
    </div>
  );
}

/* ─── Empty State ─── */

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-5 animate-fade-in">
      <div className="h-16 w-16 rounded-3xl bg-amber-50 dark:bg-amber-950/30 flex items-center justify-center">
        <Ruler size={28} className="text-amber-500" />
      </div>
      <div className="text-center">
        <p className="text-[15px] font-semibold text-zinc-800 dark:text-zinc-200">Nenhuma medida ainda</p>
        <p className="text-[13px] text-zinc-400 dark:text-zinc-500 mt-1 max-w-[240px] leading-relaxed">
          Registre suas medidas corporais e acompanhe sua evolução ao longo do tempo.
        </p>
      </div>
      <Button onClick={onAdd} size="md" className="gap-2">
        <Plus size={15} />
        Registrar medidas
      </Button>
    </div>
  );
}

/* ─── Form types + helpers ─── */

type FormValues = {
  date: string;
  waist: string; abdomen: string; hips: string; chest: string;
  right_arm: string; left_arm: string;
  right_thigh: string; left_thigh: string;
  right_calf: string; left_calf: string;
};

function emptyForm(): FormValues {
  return {
    date: today(),
    waist: '', abdomen: '', hips: '', chest: '',
    right_arm: '', left_arm: '',
    right_thigh: '', left_thigh: '',
    right_calf: '', left_calf: '',
  };
}

function measurementsToForm(m: BodyMeasurements): FormValues {
  return {
    date: m.date,
    waist:       m.waist       != null ? String(m.waist)       : '',
    abdomen:     m.abdomen     != null ? String(m.abdomen)     : '',
    hips:        m.hips        != null ? String(m.hips)        : '',
    chest:       m.chest       != null ? String(m.chest)       : '',
    right_arm:   m.right_arm   != null ? String(m.right_arm)   : '',
    left_arm:    m.left_arm    != null ? String(m.left_arm)    : '',
    right_thigh: m.right_thigh != null ? String(m.right_thigh) : '',
    left_thigh:  m.left_thigh  != null ? String(m.left_thigh)  : '',
    right_calf:  m.right_calf  != null ? String(m.right_calf)  : '',
    left_calf:   m.left_calf   != null ? String(m.left_calf)   : '',
  };
}

function validateForm(v: FormValues) {
  const errs: Partial<Record<keyof FormValues, string>> = {};
  if (!v.date) errs.date = 'Data é obrigatória';
  else if (v.date > today()) errs.date = 'Datas futuras não são permitidas';
  const hasOne = MEASUREMENT_FIELDS.some(f => v[f as keyof FormValues] !== '');
  if (!hasOne) errs.waist = 'Informe ao menos uma medida';
  for (const f of MEASUREMENT_FIELDS) {
    const raw = v[f as keyof FormValues];
    if (raw === '') continue;
    const n = parseFloat(raw);
    if (isNaN(n) || n <= 0) errs[f as keyof FormValues] = 'Valor inválido';
    else if (n >= 300)      errs[f as keyof FormValues] = 'Valor muito alto';
  }
  return errs;
}

function parseFormToPayload(v: FormValues) {
  const p: Record<string, unknown> = { date: v.date };
  for (const f of MEASUREMENT_FIELDS) {
    p[f] = v[f as keyof FormValues] !== '' ? parseFloat(v[f as keyof FormValues]) : null;
  }
  return p;
}

function formToMeasurements(result: Record<string, unknown>): BodyMeasurements {
  const m: BodyMeasurements = {
    id: result.id as string,
    user_id: result.user_id as string,
    date: result.date as string,
    waist: null, abdomen: null, hips: null, chest: null,
    right_arm: null, left_arm: null,
    right_thigh: null, left_thigh: null,
    right_calf: null, left_calf: null,
    created_at: result.created_at as string,
    updated_at: result.updated_at as string,
  };
  for (const f of MEASUREMENT_FIELDS) {
    if (result[f] != null) m[f as MeasurementField] = parseFloat(String(result[f]));
  }
  return m;
}

/* ─── Group label ─── */

function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mt-1">
      <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
        {children}
      </span>
      <div className="flex-1 h-px bg-zinc-100 dark:bg-zinc-800" />
    </div>
  );
}

/* ─── Main Component ─── */

interface Props {
  initialMeasurements: BodyMeasurements[];
}

export default function BodyMeasurementsClient({ initialMeasurements }: Props) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const [measurements, setMeasurements] = useState<BodyMeasurements[]>(initialMeasurements);
  const [activeChart, setActiveChart]   = useState<ChartKey>('waist');
  const [timeRange, setTimeRange]       = useState<TimeRange>(30);
  const [compareMode, setCompareMode]   = useState(false);
  const [compareIds, setCompareIds]     = useState<string[]>([]);
  const [showForm, setShowForm]         = useState(false);
  const [editingId, setEditingId]       = useState<string | null>(null);
  const [formValues, setFormValues]     = useState<FormValues>(emptyForm());
  const [formErrors, setFormErrors]     = useState<Partial<Record<keyof FormValues, string>>>({});
  const [saving, setSaving]             = useState(false);
  const [deletingId, setDeletingId]     = useState<string | null>(null);
  const [globalError, setGlobalError]   = useState<string | null>(null);

  const latest  = measurements[0] ?? null;
  const previous = measurements[1] ?? null;
  const oldest  = measurements[measurements.length - 1] ?? null;

  /* Auto-insights */
  const insights = useMemo(() => {
    const out: string[] = [];
    if (measurements.length < 2 || !latest) return out;

    const cutoff30 = format(subDays(new Date(), 30), 'yyyy-MM-dd');
    const before30 = measurements.filter(m => m.date <= cutoff30);

    if (before30.length > 0 && latest.waist != null && before30[0].waist != null) {
      const wChange = latest.waist - before30[0].waist;
      if (Math.abs(wChange) >= 1) {
        out.push(wChange < 0
          ? `Sua cintura reduziu ${Math.abs(wChange).toFixed(1)}cm nos últimos 30 dias`
          : `Sua cintura aumentou ${wChange.toFixed(1)}cm nos últimos 30 dias`);
      }
    }
    if (latest.abdomen != null && oldest?.abdomen != null && latest.id !== oldest.id) {
      const aChange = latest.abdomen - oldest.abdomen;
      if (Math.abs(aChange) >= 1.5) {
        out.push(aChange < 0
          ? `Seu abdômen reduziu ${Math.abs(aChange).toFixed(1)}cm no total`
          : `Seu abdômen aumentou ${aChange.toFixed(1)}cm no total`);
      }
    }
    const latestArm = avg(latest.right_arm, latest.left_arm);
    const oldestArm = oldest ? avg(oldest.right_arm, oldest.left_arm) : null;
    if (latestArm != null && oldestArm != null && latest.id !== oldest?.id) {
      const mChange = latestArm - oldestArm;
      if (mChange >= 1) out.push(`Seus braços ganharam ${mChange.toFixed(1)}cm no total`);
    }
    return out.slice(0, 3);
  }, [measurements, latest, oldest]);

  /* Evolution cards */
  const evolutionCards = useMemo(() => {
    if (!latest) return [];
    return [
      { key: 'waist'   as ChartKey, label: 'Cintura',  color: '#f59e0b', goodDown: true  },
      { key: 'abdomen' as ChartKey, label: 'Abdômen',  color: '#ef4444', goodDown: true  },
      { key: 'hips'    as ChartKey, label: 'Quadril',  color: '#a855f7', goodDown: false },
      { key: 'arms'    as ChartKey, label: 'Braços',   color: '#10b981', goodDown: false },
    ].map(({ key, label, color, goodDown }) => {
      const curr = chartValue(latest, key);
      const prev = previous ? chartValue(previous, key) : null;
      return {
        label, color,
        value: curr,
        d: diff(curr, prev, goodDown),
      };
    });
  }, [latest, previous]);

  /* Chart data */
  const chartData = useMemo(() => {
    const sorted = [...measurements].sort((a, b) => a.date.localeCompare(b.date));
    const cutoff = cutoffStr(timeRange);
    const filtered = cutoff ? sorted.filter(m => m.date >= cutoff) : sorted;
    return filtered
      .map(m => ({ date: m.date, value: chartValue(m, activeChart) }))
      .filter((d): d is { date: string; value: number } => d.value != null);
  }, [measurements, activeChart, timeRange]);

  /* Monthly groups */
  const monthGroups = useMemo(() => {
    const groups: Array<{ monthKey: string; label: string; items: BodyMeasurements[] }> = [];
    for (const m of measurements) {
      const monthKey = format(parseISO(m.date), 'yyyy-MM');
      const label    = format(parseISO(m.date), 'MMMM yyyy', { locale: ptBR });
      const existing = groups.find(g => g.monthKey === monthKey);
      if (existing) existing.items.push(m);
      else groups.push({ monthKey, label, items: [m] });
    }
    return groups;
  }, [measurements]);

  /* Compare */
  function handleCompareSelect(id: string) {
    setCompareIds(prev => {
      if (prev.includes(id)) return prev.filter(i => i !== id);
      if (prev.length < 2) return [...prev, id];
      return [prev[1], id];
    });
  }

  const compareEntries = useMemo(() => {
    if (compareIds.length !== 2) return null;
    const a = measurements.find(m => m.id === compareIds[0]);
    const b = measurements.find(m => m.id === compareIds[1]);
    return a && b ? { a, b } : null;
  }, [compareIds, measurements]);

  const activeConfig = CHART_CONFIGS.find(c => c.key === activeChart)!;
  const gridColor    = isDark ? '#1f1f23' : '#f4f4f5';
  const tickColor    = isDark ? '#52525b' : '#a1a1aa';

  /* Form handlers */
  function openAdd() {
    setEditingId(null); setFormValues(emptyForm()); setFormErrors({}); setGlobalError(null); setShowForm(true);
  }
  function openEdit(m: BodyMeasurements) {
    setEditingId(m.id); setFormValues(measurementsToForm(m)); setFormErrors({}); setGlobalError(null); setShowForm(true);
  }
  function closeForm() { setShowForm(false); setEditingId(null); }
  function setField(key: keyof FormValues, value: string) {
    setFormValues(prev => ({ ...prev, [key]: value }));
    if (formErrors[key]) setFormErrors(prev => ({ ...prev, [key]: undefined }));
  }

  async function handleSubmit() {
    const errs = validateForm(formValues);
    if (Object.keys(errs).length > 0) { setFormErrors(errs); return; }
    setSaving(true); setGlobalError(null);
    const payload = parseFormToPayload(formValues);
    try {
      const res = await fetch(
        editingId ? `/api/body-measurements/${editingId}` : '/api/body-measurements',
        { method: editingId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) },
      );
      const result = await res.json();
      if (!res.ok) { setGlobalError(result.error ?? 'Erro ao salvar'); return; }
      const saved = formToMeasurements(result);
      setMeasurements(prev => {
        const without = prev.filter(m => m.id !== saved.id);
        return [saved, ...without].sort((a, b) => b.date.localeCompare(a.date));
      });
      closeForm();
    } catch {
      setGlobalError('Erro de conexão. Tente novamente.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/body-measurements/${id}`, { method: 'DELETE' });
      if (!res.ok) { const { error } = await res.json(); setGlobalError(error ?? 'Erro ao excluir'); return; }
      setMeasurements(prev => prev.filter(m => m.id !== id));
    } catch {
      setGlobalError('Erro de conexão. Tente novamente.');
    } finally {
      setDeletingId(null);
    }
  }

  /* ─── Render ─── */

  return (
    <div className="flex flex-col gap-4 pt-8 pb-24 animate-fade-in">

      {/* ── Hero Header ── */}
      <div className="relative overflow-hidden rounded-3xl p-5 bg-gradient-to-br from-amber-400 to-orange-500 dark:from-amber-500 dark:to-orange-600 shadow-lg shadow-amber-400/20 dark:shadow-orange-900/25">
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <Link
                href="/body-metrics"
                className="h-6 w-6 rounded-lg flex items-center justify-center bg-white/20 hover:bg-white/30 transition-all"
              >
                <ChevronDown size={12} className="text-white rotate-90" />
              </Link>
              <p className="text-amber-100 text-[10px] font-bold uppercase tracking-widest">
                Medidas Corporais
              </p>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-[36px] font-black text-white tabular-nums leading-none">
                {latest?.waist != null ? latest.waist.toFixed(1) : '—'}
              </span>
              <span className="text-[16px] font-bold text-amber-200">cm</span>
              {latest?.waist != null && (
                <span className="text-[11px] font-semibold text-amber-100/80">cintura</span>
              )}
            </div>
          </div>
          <button
            onClick={openAdd}
            className="h-10 w-10 rounded-2xl bg-white/20 hover:bg-white/30 active:scale-95 flex items-center justify-center transition-all duration-150 backdrop-blur-sm"
          >
            <Plus size={18} className="text-white" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="bg-white/10 backdrop-blur-sm rounded-xl px-3 py-2.5">
            <p className="text-amber-100 text-[10px] font-medium mb-0.5">Evolução cintura</p>
            {(() => {
              if (!latest || !oldest || latest.id === oldest.id) return <p className="text-amber-200/60 text-sm font-bold">—</p>;
              const d = diff(latest.waist, oldest.waist, true);
              if (!d || d.raw === 0) return <p className="text-amber-200/60 text-sm font-bold">—</p>;
              return (
                <p className={cn('font-bold text-sm tabular-nums', d.good === true ? 'text-white' : 'text-red-200')}>
                  {d.label}
                </p>
              );
            })()}
          </div>
          <div className="bg-white/10 backdrop-blur-sm rounded-xl px-3 py-2.5">
            <p className="text-amber-100 text-[10px] font-medium mb-0.5">Última medição</p>
            <p className="text-white font-bold text-sm">
              {latest
                ? formatDistanceToNowStrict(parseISO(latest.date), { locale: ptBR, addSuffix: true })
                : '—'}
            </p>
          </div>
        </div>
      </div>

      {/* ── Global Error ── */}
      {globalError && (
        <div className="bg-red-50 dark:bg-red-950/30 border border-red-100 dark:border-red-900/50 rounded-xl px-4 py-2.5 text-[12px] text-red-600 dark:text-red-400 font-medium animate-fade-in">
          {globalError}
        </div>
      )}

      {measurements.length === 0 ? (
        <EmptyState onAdd={openAdd} />
      ) : (
        <>
          {/* ── Insights ── */}
          {insights.length > 0 && (
            <div className="flex flex-col gap-2">
              {insights.map((text, i) => (
                <div
                  key={i}
                  className="flex items-start gap-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/30 rounded-2xl px-4 py-3 animate-fade-in"
                >
                  <Lightbulb size={13} className="text-amber-500 mt-0.5 shrink-0" />
                  <p className="text-[12px] font-medium text-amber-800 dark:text-amber-200 leading-relaxed">
                    {text}
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* ── Evolution Cards — horizontal scroll ── */}
          <div className="flex gap-3 overflow-x-auto pb-1 -mx-4 px-4 snap-x snap-mandatory scrollbar-hide">
            {evolutionCards.map(({ label, color, value, d }) => (
              <div
                key={label}
                className="snap-start flex-shrink-0 w-[140px] bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800/80 rounded-2xl p-4 shadow-[0_1px_3px_0_rgb(0,0,0,0.04)] dark:shadow-none"
              >
                <div className="flex items-center gap-2 mb-3">
                  <div className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
                    {label}
                  </span>
                </div>
                {value != null ? (
                  <>
                    <p className="text-[22px] font-bold text-zinc-900 dark:text-zinc-100 tabular-nums leading-none">
                      {value % 1 === 0 ? value : value.toFixed(1)}
                      <span className="text-[12px] font-semibold text-zinc-400 dark:text-zinc-500 ml-1">cm</span>
                    </p>
                    {d && d.label !== '—' && (
                      <p className={cn(
                        'text-[11px] font-semibold mt-1.5 flex items-center gap-1',
                        d.good === true  ? 'text-emerald-600 dark:text-emerald-400' :
                        d.good === false ? 'text-red-500' :
                        'text-zinc-400 dark:text-zinc-500',
                      )}>
                        {d.good === true  ? <TrendingDown size={11} /> :
                         d.good === false ? <TrendingUp size={11} />   :
                         <Minus size={11} />}
                        {d.label}
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-[22px] font-bold text-zinc-300 dark:text-zinc-600 leading-none">—</p>
                )}
              </div>
            ))}
          </div>

          {/* ── Chart ── */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800/80 rounded-2xl p-5 shadow-[0_1px_3px_0_rgb(0,0,0,0.04)] dark:shadow-none">

            {/* Metric tabs */}
            <div className="flex gap-1 mb-4 overflow-x-auto pb-0.5 scrollbar-hide">
              {CHART_CONFIGS.map(({ key, label, color }) => {
                const active = activeChart === key;
                return (
                  <button
                    key={key}
                    onClick={() => setActiveChart(key)}
                    className={cn(
                      'flex-shrink-0 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all duration-150',
                      active
                        ? 'text-white shadow-sm'
                        : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300',
                    )}
                    style={active ? { backgroundColor: color } : {}}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            {/* Time filter */}
            <div className="flex items-center justify-between mb-4">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
                {activeConfig.label} ao longo do tempo
              </p>
              <div className="flex gap-0.5 bg-zinc-100 dark:bg-zinc-800/80 rounded-xl p-0.5">
                {TIME_FILTERS.map(({ value, label }) => (
                  <button
                    key={value}
                    onClick={() => setTimeRange(value)}
                    className={cn(
                      'px-2 py-1 rounded-[9px] text-[10px] font-semibold transition-all duration-150',
                      timeRange === value
                        ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm'
                        : 'text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300',
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {chartData.length < 2 ? (
              <div className="h-44 flex flex-col items-center justify-center gap-2">
                <p className="text-[13px] font-semibold text-zinc-400 dark:text-zinc-500">Dados insuficientes</p>
                <p className="text-[11px] text-zinc-400 dark:text-zinc-500 text-center max-w-[200px] leading-relaxed">
                  Adicione pelo menos 2 registros com este campo para ver o gráfico.
                </p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={185}>
                <AreaChart data={chartData} margin={{ top: 6, right: 4, bottom: 0, left: -22 }}>
                  <defs>
                    <linearGradient id="areaGradMeasure" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor={activeConfig.color} stopOpacity={0.18} />
                      <stop offset="95%" stopColor={activeConfig.color} stopOpacity={0}    />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                  <XAxis
                    dataKey="date"
                    tickFormatter={d => format(parseISO(d), 'd/M')}
                    tick={{ fontSize: 10, fill: tickColor }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    domain={['dataMin - 1', 'dataMax + 1']}
                    tick={{ fontSize: 10, fill: tickColor }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={v => `${v}`}
                  />
                  <Tooltip
                    content={<CustomTooltip />}
                    cursor={{ stroke: isDark ? '#27272a' : '#e4e4e7', strokeWidth: 1 }}
                  />
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke={activeConfig.color}
                    strokeWidth={2.5}
                    fill="url(#areaGradMeasure)"
                    dot={{ fill: activeConfig.color, r: 3, strokeWidth: 0 }}
                    activeDot={{ r: 5, fill: activeConfig.color, strokeWidth: 2, stroke: isDark ? '#18181b' : '#fff' }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* ── Timeline ── */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800/80 rounded-2xl shadow-[0_1px_3px_0_rgb(0,0,0,0.04)] dark:shadow-none overflow-hidden">

            {/* Header */}
            <div className="px-5 pt-5 pb-3 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">Histórico</p>
                <p className="text-[10px] text-zinc-300 dark:text-zinc-600 mt-0.5">
                  {measurements.length} {measurements.length === 1 ? 'registro' : 'registros'}
                </p>
              </div>
              <button
                onClick={() => { setCompareMode(v => !v); setCompareIds([]); }}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-semibold transition-all duration-150',
                  compareMode
                    ? 'bg-amber-50 text-amber-600 dark:bg-amber-950/30 dark:text-amber-400 border border-amber-200 dark:border-amber-800'
                    : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300',
                )}
              >
                <GitCompare size={12} />
                {compareMode ? 'Cancelar' : 'Comparar'}
              </button>
            </div>

            {/* Compare hint */}
            {compareMode && (
              <div className="mx-5 mb-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/30 rounded-xl px-4 py-2.5 animate-fade-in">
                <p className="text-[11px] font-medium text-amber-700 dark:text-amber-300">
                  {compareIds.length === 0 && 'Selecione dois registros para comparar'}
                  {compareIds.length === 1 && 'Selecione mais um registro'}
                  {compareIds.length === 2 && 'Comparação pronta abaixo'}
                </p>
              </div>
            )}

            {/* Comparison panel */}
            {compareEntries && (
              <div className="mx-5 mb-4 bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 rounded-2xl p-4 animate-slide-up">
                {(() => {
                  const { a, b } = compareEntries;
                  const earlier  = a.date < b.date ? a : b;
                  const later    = a.date < b.date ? b : a;
                  const days     = Math.abs(differenceInDays(parseISO(later.date), parseISO(earlier.date)));
                  const compareFields: Array<{ key: ChartKey; label: string; goodDown: boolean }> = [
                    { key: 'waist',   label: 'Cintura',  goodDown: true  },
                    { key: 'abdomen', label: 'Abdômen',  goodDown: true  },
                    { key: 'hips',    label: 'Quadril',  goodDown: false },
                    { key: 'arms',    label: 'Braços',   goodDown: false },
                  ];
                  return (
                    <>
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <p className="text-[11px] font-bold text-zinc-700 dark:text-zinc-300">Comparação</p>
                          <p className="text-[10px] text-zinc-400 dark:text-zinc-500">{days} dias de diferença</p>
                        </div>
                        <button
                          onClick={() => setCompareIds([])}
                          className="h-6 w-6 rounded-lg flex items-center justify-center text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-all"
                        >
                          <X size={12} />
                        </button>
                      </div>

                      <div className="flex items-center gap-2 mb-3">
                        <div className="flex-1 bg-white dark:bg-zinc-700/50 rounded-xl py-2 px-3 text-center">
                          <p className="text-[9px] text-zinc-400 dark:text-zinc-500 mb-0.5">
                            {format(parseISO(earlier.date), 'd MMM yyyy', { locale: ptBR })}
                          </p>
                          <p className="text-[13px] font-black text-zinc-800 dark:text-zinc-100 tabular-nums">
                            {earlier.waist != null ? `${earlier.waist.toFixed(1)}cm` : '—'}
                          </p>
                        </div>
                        <ChevronDown size={14} className="text-zinc-300 dark:text-zinc-600 rotate-[-90deg] shrink-0" />
                        <div className="flex-1 bg-white dark:bg-zinc-700/50 rounded-xl py-2 px-3 text-center">
                          <p className="text-[9px] text-zinc-400 dark:text-zinc-500 mb-0.5">
                            {format(parseISO(later.date), 'd MMM yyyy', { locale: ptBR })}
                          </p>
                          <p className="text-[13px] font-black text-zinc-800 dark:text-zinc-100 tabular-nums">
                            {later.waist != null ? `${later.waist.toFixed(1)}cm` : '—'}
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        {compareFields.map(({ key, label, goodDown }) => {
                          const ev = chartValue(earlier, key);
                          const lv = chartValue(later, key);
                          const d  = diff(lv, ev, goodDown);
                          if (!d) return null;
                          return (
                            <div key={key} className="bg-white dark:bg-zinc-700/30 rounded-xl px-3 py-2">
                              <p className="text-[10px] text-zinc-400 dark:text-zinc-500 mb-0.5">{label}</p>
                              <p className={cn(
                                'text-[13px] font-bold tabular-nums',
                                d.label === '—'  ? 'text-zinc-400 dark:text-zinc-500' :
                                d.good === true  ? 'text-emerald-600 dark:text-emerald-400' :
                                'text-red-500 dark:text-red-400',
                              )}>
                                {d.label}
                              </p>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  );
                })()}
              </div>
            )}

            {/* Monthly timeline */}
            <div className="px-5 pb-5">
              {monthGroups.map(({ monthKey, label, items }) => (
                <div key={monthKey} className="mt-2 first:mt-0">
                  {/* Month header */}
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 dark:text-zinc-500 capitalize">
                      {label}
                    </span>
                    <div className="flex-1 h-px bg-zinc-100 dark:bg-zinc-800" />
                    <span className="text-[10px] text-zinc-300 dark:text-zinc-600">{items.length}</span>
                  </div>

                  {/* Timeline items */}
                  <div className="relative">
                    <div className="absolute left-[4px] top-3 bottom-3 w-px bg-zinc-100 dark:bg-zinc-800/80" />
                    <div className="flex flex-col gap-2">
                      {items.map(m => {
                        const allIdx     = measurements.indexOf(m);
                        const prev       = measurements[allIdx + 1] ?? null;
                        const waistDelta = diff(m.waist, prev?.waist ?? null, true);
                        const isDeleting = deletingId === m.id;
                        const isSelected = compareIds.includes(m.id);

                        return (
                          <div
                            key={m.id}
                            className={cn(
                              'relative pl-6 transition-opacity duration-200',
                              isDeleting && 'opacity-40 pointer-events-none',
                              compareMode && !isSelected && compareIds.length > 0 && 'opacity-50',
                            )}
                          >
                            {/* Timeline dot */}
                            <div className={cn(
                              'absolute left-0 top-[15px] h-[9px] w-[9px] rounded-full border-2 transition-all duration-200',
                              isSelected
                                ? 'bg-amber-500 border-amber-500'
                                : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700',
                            )} />

                            <div
                              className={cn(
                                'border rounded-xl px-4 py-3 transition-all duration-150',
                                isSelected
                                  ? 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800'
                                  : 'bg-white dark:bg-zinc-900 border-zinc-100 dark:border-zinc-800/80',
                                compareMode && 'cursor-pointer select-none',
                              )}
                              onClick={compareMode ? () => handleCompareSelect(m.id) : undefined}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1.5 mb-2 flex-wrap">
                                    <p className="text-[11px] font-medium text-zinc-400 dark:text-zinc-500">
                                      {format(parseISO(m.date), "d 'de' MMMM", { locale: ptBR })}
                                    </p>
                                    {waistDelta && waistDelta.label !== '—' && (
                                      <span className={cn(
                                        'text-[10px] font-bold px-1.5 py-0.5 rounded-full',
                                        waistDelta.good === true
                                          ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400'
                                          : 'bg-red-50 text-red-500 dark:bg-red-950/40 dark:text-red-400',
                                      )}>
                                        {waistDelta.label}
                                      </span>
                                    )}
                                  </div>

                                  {/* Measurements grid */}
                                  <div className="grid grid-cols-3 gap-x-2 gap-y-1">
                                    {[
                                      { label: 'Cintura', value: m.waist },
                                      { label: 'Abdômen', value: m.abdomen },
                                      { label: 'Quadril',  value: m.hips },
                                      { label: 'Tórax',   value: m.chest },
                                      { label: 'Braços',  value: avg(m.right_arm, m.left_arm) },
                                      { label: 'Coxas',   value: avg(m.right_thigh, m.left_thigh) },
                                    ].filter(f => f.value != null).map(({ label, value }) => (
                                      <div key={label} className="flex flex-col">
                                        <span className="text-[9px] text-zinc-400 dark:text-zinc-500 font-medium">{label}</span>
                                        <span className="text-[11px] font-semibold text-zinc-700 dark:text-zinc-300 tabular-nums">
                                          {fmtCm(value)}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                </div>

                                {!compareMode && (
                                  <div className="flex items-center gap-1 shrink-0 pt-0.5">
                                    <button
                                      onClick={e => { e.stopPropagation(); openEdit(m); }}
                                      className="h-7 w-7 rounded-lg flex items-center justify-center text-zinc-300 hover:text-zinc-500 dark:text-zinc-600 dark:hover:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-all"
                                    >
                                      <Pencil size={12} />
                                    </button>
                                    <button
                                      onClick={e => { e.stopPropagation(); handleDelete(m.id); }}
                                      disabled={isDeleting}
                                      className="h-7 w-7 rounded-lg flex items-center justify-center text-zinc-300 hover:text-red-500 dark:text-zinc-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-all disabled:opacity-40"
                                    >
                                      {isDeleting
                                        ? <span className="h-3 w-3 rounded-full border-2 border-current border-t-transparent animate-spin" />
                                        : <Trash2 size={12} />}
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* ── Form Modal ── */}
      <Modal open={showForm} onClose={closeForm} title={editingId ? 'Editar medidas' : 'Novas medidas'}>
        <div className="flex flex-col gap-4">
          {globalError && (
            <div className="bg-red-50 dark:bg-red-950/30 border border-red-100 dark:border-red-900/50 rounded-xl px-4 py-2.5 text-[12px] text-red-600 dark:text-red-400 font-medium">
              {globalError}
            </div>
          )}
          <Input label="Data" type="date" value={formValues.date} max={today()} onChange={e => setField('date', e.target.value)} error={formErrors.date} />
          <GroupLabel>Tronco</GroupLabel>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Cintura (cm)" type="number" inputMode="decimal" placeholder="72.0" step="0.1" min="1"
              value={formValues.waist} onChange={e => setField('waist', e.target.value)} error={formErrors.waist} />
            <Input label="Abdômen (cm)" type="number" inputMode="decimal" placeholder="84.0" step="0.1" min="1"
              value={formValues.abdomen} onChange={e => setField('abdomen', e.target.value)} error={formErrors.abdomen} />
            <Input label="Quadril (cm)" type="number" inputMode="decimal" placeholder="98.0" step="0.1" min="1"
              value={formValues.hips} onChange={e => setField('hips', e.target.value)} error={formErrors.hips} />
            <Input label="Tórax (cm)" type="number" inputMode="decimal" placeholder="94.0" step="0.1" min="1"
              value={formValues.chest} onChange={e => setField('chest', e.target.value)} error={formErrors.chest} />
          </div>
          <GroupLabel>Braços</GroupLabel>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Braço Direito (cm)" type="number" inputMode="decimal" placeholder="32.0" step="0.1" min="1"
              value={formValues.right_arm} onChange={e => setField('right_arm', e.target.value)} error={formErrors.right_arm} />
            <Input label="Braço Esquerdo (cm)" type="number" inputMode="decimal" placeholder="31.5" step="0.1" min="1"
              value={formValues.left_arm} onChange={e => setField('left_arm', e.target.value)} error={formErrors.left_arm} />
          </div>
          <GroupLabel>Pernas</GroupLabel>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Coxa Direita (cm)" type="number" inputMode="decimal" placeholder="56.0" step="0.1" min="1"
              value={formValues.right_thigh} onChange={e => setField('right_thigh', e.target.value)} error={formErrors.right_thigh} />
            <Input label="Coxa Esquerda (cm)" type="number" inputMode="decimal" placeholder="55.5" step="0.1" min="1"
              value={formValues.left_thigh} onChange={e => setField('left_thigh', e.target.value)} error={formErrors.left_thigh} />
            <Input label="Panturrilha D (cm)" type="number" inputMode="decimal" placeholder="36.0" step="0.1" min="1"
              value={formValues.right_calf} onChange={e => setField('right_calf', e.target.value)} error={formErrors.right_calf} />
            <Input label="Panturrilha E (cm)" type="number" inputMode="decimal" placeholder="35.5" step="0.1" min="1"
              value={formValues.left_calf} onChange={e => setField('left_calf', e.target.value)} error={formErrors.left_calf} />
          </div>
          <div className="flex gap-2 pt-1">
            <Button variant="secondary" className="flex-1" onClick={closeForm}>Cancelar</Button>
            <Button className="flex-1" loading={saving} onClick={handleSubmit}>
              {editingId ? 'Salvar alterações' : 'Registrar'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
