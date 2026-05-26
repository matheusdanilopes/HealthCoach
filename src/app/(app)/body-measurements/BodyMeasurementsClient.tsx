'use client';

import { useState, useMemo } from 'react';
import {
  LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { format, parseISO, formatDistanceToNowStrict } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Plus, Pencil, Trash2, Ruler,
  TrendingDown, TrendingUp, Minus, ChevronDown,
  ArrowLeft,
} from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { useTheme } from '@/contexts/ThemeContext';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import type { BodyMeasurements } from '@/types';

/* ─── Types ─── */

type SimpleField = 'waist' | 'abdomen' | 'hips' | 'chest';
type ChartKey = SimpleField | 'arms' | 'thighs' | 'calves';

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

const BILATERAL: Record<'arms' | 'thighs' | 'calves', [MeasurementField, MeasurementField]> = {
  arms:   ['right_arm',   'left_arm'  ],
  thighs: ['right_thigh', 'left_thigh'],
  calves: ['right_calf',  'left_calf' ],
};

/* ─── Helpers ─── */

const today = () => new Date().toISOString().split('T')[0];

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
  if (Math.abs(d) < 0.1) return { label: '—', good: null as boolean | null, raw: 0 };
  const good = goodDown ? d < 0 : d > 0;
  return {
    label: `${d > 0 ? '+' : ''}${d.toFixed(1)} cm`,
    good,
    raw: d,
  };
}

function fmtCm(v: number | null) {
  if (v == null) return '—';
  return `${v % 1 === 0 ? v : v.toFixed(1)} cm`;
}

/* ─── Sub-components ─── */

function CustomTooltip({
  active, payload, label,
}: {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
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

function EvolutionCard({
  label, value, delta, color,
}: {
  label: string;
  value: number | null;
  delta: ReturnType<typeof diff>;
  color: string;
}) {
  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800/80 rounded-2xl p-4 shadow-[0_1px_3px_0_rgb(0,0,0,0.04)] dark:shadow-none">
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
            <span className="text-[13px] font-semibold text-zinc-400 dark:text-zinc-500 ml-1">cm</span>
          </p>
          {delta && delta.label !== '—' && (
            <p className={cn(
              'text-[11px] font-semibold mt-1.5 flex items-center gap-1',
              delta.good === true  ? 'text-emerald-600 dark:text-emerald-400' :
              delta.good === false ? 'text-red-500' :
              'text-zinc-400 dark:text-zinc-500'
            )}>
              {delta.good === true  ? <TrendingDown size={11} /> :
               delta.good === false ? <TrendingUp size={11} />   :
               <Minus size={11} />}
              {delta.label}
            </p>
          )}
        </>
      ) : (
        <p className="text-[22px] font-bold text-zinc-300 dark:text-zinc-600 leading-none">—</p>
      )}
    </div>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-14 gap-5 animate-fade-in">
      <div className="h-16 w-16 rounded-3xl bg-amber-50 dark:bg-amber-950/30 flex items-center justify-center">
        <Ruler size={28} className="text-amber-500" />
      </div>
      <div className="text-center">
        <p className="text-[15px] font-semibold text-zinc-800 dark:text-zinc-200">
          Nenhuma medida ainda
        </p>
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

/* ─── Form ─── */

type FormValues = {
  date: string;
  waist: string; abdomen: string; hips: string; chest: string;
  right_arm: string; left_arm: string;
  right_thigh: string; left_thigh: string;
  right_calf: string; left_calf: string;
};

const MEASUREMENT_FIELDS: MeasurementField[] = [
  'waist','abdomen','hips','chest',
  'right_arm','left_arm',
  'right_thigh','left_thigh',
  'right_calf','left_calf',
];

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

  const hasOne = MEASUREMENT_FIELDS.some((f) => v[f as keyof FormValues] !== '');
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

/* ─── Main component ─── */

interface Props {
  initialMeasurements: BodyMeasurements[];
}

export default function BodyMeasurementsClient({ initialMeasurements }: Props) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const [measurements, setMeasurements] = useState<BodyMeasurements[]>(initialMeasurements);
  const [activeChart, setActiveChart] = useState<ChartKey>('waist');
  const [timeRange, setTimeRange] = useState<7 | 30 | 0>(30);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formValues, setFormValues] = useState<FormValues>(emptyForm);
  const [formErrors, setFormErrors] = useState<Partial<Record<keyof FormValues, string>>>({});
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [showHistoryAll, setShowHistoryAll] = useState(false);

  const latest   = measurements[0] ?? null;
  const previous = measurements[1] ?? null;
  const oldest   = measurements[measurements.length - 1] ?? null;

  /* Evolution cards — compare latest vs oldest */
  const evolutionCards = useMemo(() => {
    if (!latest) return [];
    const cards = [
      { key: 'waist'  as ChartKey, label: 'Cintura',  color: '#f59e0b', goodDown: true  },
      { key: 'abdomen'as ChartKey, label: 'Abdômen',  color: '#ef4444', goodDown: true  },
      { key: 'hips'   as ChartKey, label: 'Quadril',  color: '#a855f7', goodDown: false },
      { key: 'arms'   as ChartKey, label: 'Braços',   color: '#10b981', goodDown: false },
    ];
    return cards.map(({ key, label, color, goodDown }) => ({
      label,
      color,
      value: chartValue(latest, key),
      delta: diff(chartValue(latest, key), oldest ? chartValue(oldest, key) : null, goodDown),
    }));
  }, [measurements, latest, oldest]);

  /* Chart data */
  const chartData = useMemo(() => {
    const sorted = [...measurements].sort((a, b) => a.date.localeCompare(b.date));
    const filtered = timeRange === 0 ? sorted : sorted.slice(-timeRange);
    return filtered
      .map((m) => ({ date: m.date, value: chartValue(m, activeChart) }))
      .filter((d): d is { date: string; value: number } => d.value != null);
  }, [measurements, activeChart, timeRange]);

  const activeConfig = CHART_CONFIGS.find((c) => c.key === activeChart)!;
  const historyItems = showHistoryAll ? measurements : measurements.slice(0, 5);

  /* Chart theme */
  const gridColor = isDark ? '#1f1f23' : '#f4f4f5';
  const tickColor = isDark ? '#52525b' : '#a1a1aa';

  /* Form handlers */
  function openAdd() {
    setEditingId(null);
    setFormValues(emptyForm());
    setFormErrors({});
    setGlobalError(null);
    setShowForm(true);
  }

  function openEdit(m: BodyMeasurements) {
    setEditingId(m.id);
    setFormValues(measurementsToForm(m));
    setFormErrors({});
    setGlobalError(null);
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
  }

  function setField(key: keyof FormValues, value: string) {
    setFormValues((prev) => ({ ...prev, [key]: value }));
    if (formErrors[key]) setFormErrors((prev) => ({ ...prev, [key]: undefined }));
  }

  async function handleSubmit() {
    const errs = validateForm(formValues);
    if (Object.keys(errs).length > 0) { setFormErrors(errs); return; }

    setSaving(true);
    setGlobalError(null);
    const payload = parseFormToPayload(formValues);

    try {
      const res = await fetch(
        editingId ? `/api/body-measurements/${editingId}` : '/api/body-measurements',
        {
          method: editingId ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      );
      const result = await res.json();
      if (!res.ok) { setGlobalError(result.error ?? 'Erro ao salvar'); return; }

      const saved = formToMeasurements(result);
      setMeasurements((prev) => {
        const without = prev.filter((m) => m.id !== saved.id);
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
      setMeasurements((prev) => prev.filter((m) => m.id !== id));
    } catch {
      setGlobalError('Erro de conexão. Tente novamente.');
    } finally {
      setDeletingId(null);
    }
  }

  /* ─── Render ─── */

  return (
    <div className="flex flex-col gap-4 pt-8 pb-6 animate-fade-in">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link
              href="/body-metrics"
              className="h-6 w-6 rounded-lg flex items-center justify-center text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all duration-150"
            >
              <ArrowLeft size={13} />
            </Link>
            <h1 className="text-[22px] font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">
              Medidas Corporais
            </h1>
          </div>
          <p className="text-[11px] text-zinc-400 dark:text-zinc-500 ml-8 font-medium">
            {latest
              ? `Última medição ${formatDistanceToNowStrict(parseISO(latest.date), { locale: ptBR, addSuffix: true })}`
              : 'Nenhuma medição registrada'}
          </p>
        </div>
        {measurements.length > 0 && (
          <button
            onClick={openAdd}
            className="h-9 w-9 rounded-2xl bg-amber-500 hover:bg-amber-400 active:scale-95 flex items-center justify-center shadow-sm shadow-amber-500/30 transition-all duration-150"
          >
            <Plus size={17} className="text-white" />
          </button>
        )}
      </div>

      {/* Global error */}
      {globalError && (
        <div className="bg-red-50 dark:bg-red-950/30 border border-red-100 dark:border-red-900/50 rounded-xl px-4 py-2.5 text-[12px] text-red-600 dark:text-red-400 font-medium animate-fade-in">
          {globalError}
        </div>
      )}

      {measurements.length === 0 ? (
        <EmptyState onAdd={openAdd} />
      ) : (
        <>
          {/* Evolution cards 2x2 */}
          {evolutionCards.length > 0 && (
            <div className="grid grid-cols-2 gap-3">
              {evolutionCards.map((card) => (
                <EvolutionCard key={card.label} {...card} />
              ))}
            </div>
          )}

          {/* Chart */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800/80 rounded-2xl p-5 shadow-[0_1px_3px_0_rgb(0,0,0,0.04)] dark:shadow-none">

            {/* Metric tabs */}
            <div className="flex gap-1 mb-4 overflow-x-auto pb-0.5">
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
                        : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
                    )}
                    style={active ? { backgroundColor: color } : {}}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            {/* Time range */}
            <div className="flex items-center justify-between mb-4">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
                {activeConfig.label} ao longo do tempo
              </p>
              <div className="flex gap-1 bg-zinc-100 dark:bg-zinc-800/80 rounded-xl p-0.5">
                {([7, 30, 0] as const).map((n) => (
                  <button
                    key={n}
                    onClick={() => setTimeRange(n)}
                    className={cn(
                      'px-2.5 py-1 rounded-[9px] text-[11px] font-semibold transition-all duration-150',
                      timeRange === n
                        ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm'
                        : 'text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
                    )}
                  >
                    {n === 0 ? 'Tudo' : `${n}d`}
                  </button>
                ))}
              </div>
            </div>

            {chartData.length < 2 ? (
              <div className="h-44 flex flex-col items-center justify-center gap-2">
                <p className="text-[13px] font-semibold text-zinc-400 dark:text-zinc-500">
                  Dados insuficientes
                </p>
                <p className="text-[11px] text-zinc-400 dark:text-zinc-500 text-center max-w-[200px] leading-relaxed">
                  Adicione pelo menos 2 registros com este campo para ver o gráfico.
                </p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={170}>
                <LineChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -22 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(d) => format(parseISO(d), 'd/M')}
                    tick={{ fontSize: 10, fill: tickColor }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    domain={['dataMin - 1', 'dataMax + 1']}
                    tick={{ fontSize: 10, fill: tickColor }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => `${v}`}
                  />
                  <Tooltip
                    content={<CustomTooltip />}
                    cursor={{ stroke: isDark ? '#27272a' : '#f4f4f5', strokeWidth: 1 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke={activeConfig.color}
                    strokeWidth={2}
                    dot={{ fill: activeConfig.color, r: 2.5, strokeWidth: 0 }}
                    activeDot={{ r: 4, fill: activeConfig.color, strokeWidth: 0 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* History */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800/80 rounded-2xl shadow-[0_1px_3px_0_rgb(0,0,0,0.04)] dark:shadow-none overflow-hidden">
            <div className="px-5 pt-5 pb-4 flex items-center justify-between">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
                Histórico
              </p>
              <span className="text-[10px] text-zinc-300 dark:text-zinc-600 font-medium">
                {measurements.length} {measurements.length === 1 ? 'registro' : 'registros'}
              </span>
            </div>

            <div className="divide-y divide-zinc-50 dark:divide-zinc-800/60">
              {historyItems.map((m, i) => {
                const prev = measurements[i + 1];
                const waistDelta = diff(m.waist, prev?.waist ?? null, true);
                const isDeleting = deletingId === m.id;

                return (
                  <div
                    key={m.id}
                    className={cn(
                      'px-5 py-3.5 transition-opacity duration-200',
                      isDeleting && 'opacity-40 pointer-events-none'
                    )}
                  >
                    <div className="flex items-start gap-3">
                      {/* Date */}
                      <div className="min-w-[48px] pt-0.5">
                        <p className="text-[13px] font-bold text-zinc-800 dark:text-zinc-200 tabular-nums">
                          {format(parseISO(m.date), 'd/MM', { locale: ptBR })}
                        </p>
                        <p className="text-[10px] text-zinc-400 dark:text-zinc-500 font-medium">
                          {format(parseISO(m.date), 'yyyy')}
                        </p>
                      </div>

                      {/* Measurements grid */}
                      <div className="flex-1 grid grid-cols-2 gap-x-3 gap-y-0.5">
                        <MeasureRow label="Cintura"  value={m.waist}   />
                        <MeasureRow label="Abdômen"  value={m.abdomen} />
                        <MeasureRow label="Quadril"  value={m.hips}    />
                        <MeasureRow label="Tórax"    value={m.chest}   />
                        <MeasureRow label="Braços"   value={avg(m.right_arm, m.left_arm)}     />
                        <MeasureRow label="Coxas"    value={avg(m.right_thigh, m.left_thigh)} />
                      </div>

                      {/* Delta + actions */}
                      <div className="flex flex-col items-end gap-1.5 pt-0.5">
                        {waistDelta && waistDelta.label !== '—' ? (
                          <span className={cn(
                            'text-[11px] font-semibold tabular-nums',
                            waistDelta.good === true  ? 'text-emerald-600 dark:text-emerald-400' :
                            waistDelta.good === false ? 'text-red-500' :
                            'text-zinc-400 dark:text-zinc-500'
                          )}>
                            {waistDelta.label}
                          </span>
                        ) : null}
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => openEdit(m)}
                            className="h-7 w-7 rounded-lg flex items-center justify-center text-zinc-300 hover:text-zinc-500 dark:text-zinc-600 dark:hover:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-all"
                          >
                            <Pencil size={12} />
                          </button>
                          <button
                            onClick={() => handleDelete(m.id)}
                            disabled={isDeleting}
                            className="h-7 w-7 rounded-lg flex items-center justify-center text-zinc-300 hover:text-red-500 dark:text-zinc-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-all disabled:opacity-40"
                          >
                            {isDeleting
                              ? <span className="h-3 w-3 rounded-full border-2 border-current border-t-transparent animate-spin" />
                              : <Trash2 size={12} />}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {measurements.length > 5 && (
              <button
                onClick={() => setShowHistoryAll((v) => !v)}
                className="w-full flex items-center justify-center gap-1.5 py-3.5 text-[12px] font-semibold text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 border-t border-zinc-50 dark:border-zinc-800/60 transition-colors"
              >
                <ChevronDown size={13} className={cn('transition-transform duration-200', showHistoryAll && 'rotate-180')} />
                {showHistoryAll ? 'Ver menos' : `Ver mais ${measurements.length - 5} registros`}
              </button>
            )}
          </div>
        </>
      )}

      {/* Form modal */}
      <Modal
        open={showForm}
        onClose={closeForm}
        title={editingId ? 'Editar medidas' : 'Novas medidas'}
      >
        <div className="flex flex-col gap-4">
          {globalError && (
            <div className="bg-red-50 dark:bg-red-950/30 border border-red-100 dark:border-red-900/50 rounded-xl px-4 py-2.5 text-[12px] text-red-600 dark:text-red-400 font-medium">
              {globalError}
            </div>
          )}

          <Input
            label="Data"
            type="date"
            value={formValues.date}
            max={today()}
            onChange={(e) => setField('date', e.target.value)}
            error={formErrors.date}
          />

          <GroupLabel>Tronco</GroupLabel>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Cintura (cm)" type="number" inputMode="decimal" placeholder="72.0" step="0.1" min="1"
              value={formValues.waist} onChange={(e) => setField('waist', e.target.value)} error={formErrors.waist} />
            <Input label="Abdômen (cm)" type="number" inputMode="decimal" placeholder="84.0" step="0.1" min="1"
              value={formValues.abdomen} onChange={(e) => setField('abdomen', e.target.value)} error={formErrors.abdomen} />
            <Input label="Quadril (cm)" type="number" inputMode="decimal" placeholder="98.0" step="0.1" min="1"
              value={formValues.hips} onChange={(e) => setField('hips', e.target.value)} error={formErrors.hips} />
            <Input label="Tórax (cm)" type="number" inputMode="decimal" placeholder="94.0" step="0.1" min="1"
              value={formValues.chest} onChange={(e) => setField('chest', e.target.value)} error={formErrors.chest} />
          </div>

          <GroupLabel>Braços</GroupLabel>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Braço Direito (cm)" type="number" inputMode="decimal" placeholder="32.0" step="0.1" min="1"
              value={formValues.right_arm} onChange={(e) => setField('right_arm', e.target.value)} error={formErrors.right_arm} />
            <Input label="Braço Esquerdo (cm)" type="number" inputMode="decimal" placeholder="31.5" step="0.1" min="1"
              value={formValues.left_arm} onChange={(e) => setField('left_arm', e.target.value)} error={formErrors.left_arm} />
          </div>

          <GroupLabel>Pernas</GroupLabel>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Coxa Direita (cm)" type="number" inputMode="decimal" placeholder="56.0" step="0.1" min="1"
              value={formValues.right_thigh} onChange={(e) => setField('right_thigh', e.target.value)} error={formErrors.right_thigh} />
            <Input label="Coxa Esquerda (cm)" type="number" inputMode="decimal" placeholder="55.5" step="0.1" min="1"
              value={formValues.left_thigh} onChange={(e) => setField('left_thigh', e.target.value)} error={formErrors.left_thigh} />
            <Input label="Panturrilha D (cm)" type="number" inputMode="decimal" placeholder="36.0" step="0.1" min="1"
              value={formValues.right_calf} onChange={(e) => setField('right_calf', e.target.value)} error={formErrors.right_calf} />
            <Input label="Panturrilha E (cm)" type="number" inputMode="decimal" placeholder="35.5" step="0.1" min="1"
              value={formValues.left_calf} onChange={(e) => setField('left_calf', e.target.value)} error={formErrors.left_calf} />
          </div>

          <div className="flex gap-2 pt-1">
            <Button variant="secondary" className="flex-1" onClick={closeForm}>
              Cancelar
            </Button>
            <Button className="flex-1" loading={saving} onClick={handleSubmit}>
              {editingId ? 'Salvar alterações' : 'Registrar'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

/* ─── Tiny helper ─── */
function MeasureRow({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="flex items-baseline gap-1">
      <span className="text-[10px] text-zinc-400 dark:text-zinc-500 font-medium w-[48px] shrink-0">{label}</span>
      <span className="text-[12px] font-semibold text-zinc-700 dark:text-zinc-300 tabular-nums">
        {fmtCm(value)}
      </span>
    </div>
  );
}
