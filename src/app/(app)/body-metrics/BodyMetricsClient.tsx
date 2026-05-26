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
  Plus, Pencil, Trash2, Scale, Dumbbell,
  Flame, Activity, TrendingDown, TrendingUp,
  Minus, ChevronDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTheme } from '@/contexts/ThemeContext';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import type { BodyMetrics } from '@/types';

/* ─── Config ─── */

type MetricKey = 'weight' | 'muscle_mass' | 'body_fat' | 'visceral_fat';

const METRIC_CONFIGS: Record<MetricKey, {
  label: string;
  unit: string;
  color: string;
  icon: React.ElementType;
  goodDown: boolean;
}> = {
  weight:       { label: 'Peso',        unit: 'kg',     color: '#2563eb', icon: Scale,    goodDown: true  },
  muscle_mass:  { label: 'Músculos',    unit: 'kg',     color: '#10b981', icon: Dumbbell, goodDown: false },
  body_fat:     { label: 'Gordura',     unit: '%',      color: '#f59e0b', icon: Flame,    goodDown: true  },
  visceral_fat: { label: 'V. Visceral', unit: '',       color: '#ef4444', icon: Activity, goodDown: true  },
};

/* ─── Helpers ─── */

const today = () => new Date().toISOString().split('T')[0];

function delta(current: number, previous: number, goodDown: boolean) {
  const diff = current - previous;
  if (Math.abs(diff) < 0.05) return { sign: '─', value: '0', good: null };
  const good = goodDown ? diff < 0 : diff > 0;
  return {
    sign: diff > 0 ? '+' : '',
    value: Math.abs(diff) < 10 ? diff.toFixed(1) : diff.toFixed(0),
    good,
  };
}

function fmtVal(val: number | null, unit: string) {
  if (val == null) return '—';
  return `${val % 1 === 0 ? val : val.toFixed(1)}${unit}`;
}

/* ─── Sub-components ─── */

function CustomTooltip({
  active, payload, label, unit,
}: {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
  unit: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white dark:bg-zinc-800 border border-zinc-100 dark:border-zinc-700 rounded-xl px-3 py-2 shadow-lg">
      <p className="text-zinc-400 dark:text-zinc-500 text-[10px] mb-1 font-medium">
        {label ? format(parseISO(label), "d 'de' MMM", { locale: ptBR }) : ''}
      </p>
      <p className="text-zinc-900 dark:text-zinc-100 font-bold tabular-nums text-sm">
        {payload[0].value}{unit}
      </p>
    </div>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-14 gap-5 animate-fade-in">
      <div className="h-16 w-16 rounded-3xl bg-blue-50 dark:bg-blue-950/30 flex items-center justify-center">
        <Scale size={28} className="text-blue-500" />
      </div>
      <div className="text-center">
        <p className="text-[15px] font-semibold text-zinc-800 dark:text-zinc-200">
          Nenhuma pesagem ainda
        </p>
        <p className="text-[13px] text-zinc-400 dark:text-zinc-500 mt-1 max-w-[240px] leading-relaxed">
          Registre sua primeira composição corporal e acompanhe sua evolução.
        </p>
      </div>
      <Button onClick={onAdd} size="md" className="gap-2">
        <Plus size={15} />
        Registrar pesagem
      </Button>
    </div>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  unit,
  diff,
  color,
}: {
  icon: React.ElementType;
  label: string;
  value: number | null;
  unit: string;
  diff?: ReturnType<typeof delta>;
  color: string;
}) {
  const hasValue = value != null;
  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800/80 rounded-2xl p-4 shadow-[0_1px_3px_0_rgb(0,0,0,0.04)] dark:shadow-none">
      <div className="flex items-center gap-2 mb-3">
        <div
          className="h-7 w-7 rounded-[9px] flex items-center justify-center"
          style={{ backgroundColor: `${color}18` }}
        >
          <Icon size={13} style={{ color }} />
        </div>
        <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
          {label}
        </span>
      </div>
      {hasValue ? (
        <>
          <p className="text-[22px] font-bold text-zinc-900 dark:text-zinc-100 tabular-nums leading-none">
            {value % 1 === 0 ? value : value.toFixed(1)}
            <span className="text-[13px] font-semibold text-zinc-400 dark:text-zinc-500 ml-1">{unit}</span>
          </p>
          {diff && diff.value !== '0' && (
            <p
              className={cn(
                'text-[11px] font-semibold mt-1.5 flex items-center gap-1',
                diff.good === true
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : diff.good === false
                    ? 'text-red-500'
                    : 'text-zinc-400 dark:text-zinc-500'
              )}
            >
              {diff.good === true ? (
                <TrendingDown size={11} />
              ) : diff.good === false ? (
                <TrendingUp size={11} />
              ) : (
                <Minus size={11} />
              )}
              {diff.sign}{diff.value}{unit}
            </p>
          )}
        </>
      ) : (
        <p className="text-[22px] font-bold text-zinc-300 dark:text-zinc-600 leading-none">—</p>
      )}
    </div>
  );
}

/* ─── Form ─── */

interface FormValues {
  date: string;
  weight: string;
  muscle_mass: string;
  body_fat: string;
  visceral_fat: string;
}

const emptyForm = (): FormValues => ({
  date: today(),
  weight: '',
  muscle_mass: '',
  body_fat: '',
  visceral_fat: '',
});

function metricsToForm(m: BodyMetrics): FormValues {
  return {
    date: m.date,
    weight: String(m.weight),
    muscle_mass: m.muscle_mass != null ? String(m.muscle_mass) : '',
    body_fat: m.body_fat != null ? String(m.body_fat) : '',
    visceral_fat: m.visceral_fat != null ? String(m.visceral_fat) : '',
  };
}

function validateForm(v: FormValues): Partial<Record<keyof FormValues, string>> {
  const errs: Partial<Record<keyof FormValues, string>> = {};
  if (!v.date) errs.date = 'Data é obrigatória';
  else if (v.date > today()) errs.date = 'Não é possível registrar datas futuras';

  const w = parseFloat(v.weight);
  if (!v.weight) errs.weight = 'Peso é obrigatório';
  else if (isNaN(w) || w <= 0) errs.weight = 'Peso deve ser maior que 0';
  else if (w >= 500) errs.weight = 'Peso deve ser menor que 500 kg';

  if (v.muscle_mass) {
    const m = parseFloat(v.muscle_mass);
    if (isNaN(m) || m < 0) errs.muscle_mass = 'Valor inválido';
    else if (m >= 200) errs.muscle_mass = 'Valor deve ser menor que 200 kg';
  }
  if (v.body_fat) {
    const f = parseFloat(v.body_fat);
    if (isNaN(f) || f < 0) errs.body_fat = 'Valor inválido';
    else if (f > 100) errs.body_fat = 'Percentual deve ser entre 0 e 100';
  }
  if (v.visceral_fat) {
    const vf = parseFloat(v.visceral_fat);
    if (isNaN(vf) || vf < 0) errs.visceral_fat = 'Valor inválido';
    else if (vf > 30) errs.visceral_fat = 'Índice deve ser entre 0 e 30';
  }
  return errs;
}

/* ─── Main component ─── */

interface Props {
  initialMetrics: BodyMetrics[];
}

export default function BodyMetricsClient({ initialMetrics }: Props) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const [metrics, setMetrics] = useState<BodyMetrics[]>(initialMetrics);
  const [activeMetric, setActiveMetric] = useState<MetricKey>('weight');
  const [timeRange, setTimeRange] = useState<7 | 30 | 0>(30);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formValues, setFormValues] = useState<FormValues>(emptyForm);
  const [formErrors, setFormErrors] = useState<Partial<Record<keyof FormValues, string>>>({});
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [showHistoryAll, setShowHistoryAll] = useState(false);

  /* Derived values */
  const latest = metrics[0] ?? null;
  const previous = metrics[1] ?? null;

  const chartData = useMemo(() => {
    const sorted = [...metrics].sort((a, b) => a.date.localeCompare(b.date));
    const filtered = timeRange === 0
      ? sorted
      : sorted.slice(-timeRange);
    return filtered
      .filter((m) => m[activeMetric] != null)
      .map((m) => ({ date: m.date, value: m[activeMetric] as number }));
  }, [metrics, activeMetric, timeRange]);

  const historyItems = showHistoryAll ? metrics : metrics.slice(0, 5);

  /* Chart theme */
  const gridColor   = isDark ? '#1f1f23' : '#f4f4f5';
  const tickColor   = isDark ? '#52525b' : '#a1a1aa';
  const activeColor = METRIC_CONFIGS[activeMetric].color;

  /* Form handlers */
  function openAdd() {
    setEditingId(null);
    setFormValues(emptyForm());
    setFormErrors({});
    setGlobalError(null);
    setShowForm(true);
  }

  function openEdit(m: BodyMetrics) {
    setEditingId(m.id);
    setFormValues(metricsToForm(m));
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
    if (Object.keys(errs).length > 0) {
      setFormErrors(errs);
      return;
    }

    setSaving(true);
    setGlobalError(null);

    const payload = {
      date: formValues.date,
      weight: parseFloat(formValues.weight),
      muscle_mass: formValues.muscle_mass ? parseFloat(formValues.muscle_mass) : null,
      body_fat: formValues.body_fat ? parseFloat(formValues.body_fat) : null,
      visceral_fat: formValues.visceral_fat ? parseFloat(formValues.visceral_fat) : null,
    };

    try {
      let res: Response;
      if (editingId) {
        res = await fetch(`/api/body-metrics/${editingId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetch('/api/body-metrics', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }

      const result = await res.json();
      if (!res.ok) {
        setGlobalError(result.error ?? 'Erro ao salvar');
        return;
      }

      const saved: BodyMetrics = {
        ...result,
        weight: parseFloat(String(result.weight)),
        muscle_mass: result.muscle_mass != null ? parseFloat(String(result.muscle_mass)) : null,
        body_fat: result.body_fat != null ? parseFloat(String(result.body_fat)) : null,
        visceral_fat: result.visceral_fat != null ? parseFloat(String(result.visceral_fat)) : null,
      };

      setMetrics((prev) => {
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
      const res = await fetch(`/api/body-metrics/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const { error } = await res.json();
        setGlobalError(error ?? 'Erro ao excluir');
        return;
      }
      setMetrics((prev) => prev.filter((m) => m.id !== id));
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
          <h1 className="text-[22px] font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">
            Composição Corporal
          </h1>
          <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-0.5 font-medium">
            {latest
              ? `Última pesagem ${formatDistanceToNowStrict(parseISO(latest.date), { locale: ptBR, addSuffix: true })}`
              : 'Nenhuma pesagem registrada'}
          </p>
        </div>
        {metrics.length > 0 && (
          <button
            onClick={openAdd}
            className="h-9 w-9 rounded-2xl bg-blue-600 hover:bg-blue-500 active:scale-95 flex items-center justify-center shadow-sm shadow-blue-600/30 transition-all duration-150"
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

      {metrics.length === 0 ? (
        <EmptyState onAdd={openAdd} />
      ) : (
        <>
          {/* Summary cards 2x2 */}
          <div className="grid grid-cols-2 gap-3">
            {(Object.keys(METRIC_CONFIGS) as MetricKey[]).map((key) => {
              const cfg = METRIC_CONFIGS[key];
              const currVal = latest?.[key] ?? null;
              const prevVal = previous?.[key] ?? null;
              const d =
                currVal != null && prevVal != null
                  ? delta(currVal, prevVal, cfg.goodDown)
                  : undefined;
              return (
                <SummaryCard
                  key={key}
                  icon={cfg.icon}
                  label={cfg.label}
                  value={currVal}
                  unit={cfg.unit}
                  diff={d}
                  color={cfg.color}
                />
              );
            })}
          </div>

          {/* Charts */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800/80 rounded-2xl p-5 shadow-[0_1px_3px_0_rgb(0,0,0,0.04)] dark:shadow-none">

            {/* Metric selector */}
            <div className="flex gap-1 mb-4 overflow-x-auto pb-0.5">
              {(Object.keys(METRIC_CONFIGS) as MetricKey[]).map((key) => {
                const cfg = METRIC_CONFIGS[key];
                const active = activeMetric === key;
                return (
                  <button
                    key={key}
                    onClick={() => setActiveMetric(key)}
                    className={cn(
                      'flex-shrink-0 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all duration-150',
                      active
                        ? 'text-white shadow-sm'
                        : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
                    )}
                    style={active ? { backgroundColor: cfg.color } : {}}
                  >
                    {cfg.label}
                  </button>
                );
              })}
            </div>

            {/* Time range selector */}
            <div className="flex items-center justify-between mb-4">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
                {METRIC_CONFIGS[activeMetric].label} ao longo do tempo
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
              <div className="h-44 flex flex-col items-center justify-center gap-3">
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
                    tickFormatter={(v) => `${v}${METRIC_CONFIGS[activeMetric].unit}`}
                  />
                  <Tooltip
                    content={
                      <CustomTooltip unit={METRIC_CONFIGS[activeMetric].unit} />
                    }
                    cursor={{ stroke: isDark ? '#27272a' : '#f4f4f5', strokeWidth: 1 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke={activeColor}
                    strokeWidth={2}
                    dot={{ fill: activeColor, r: 2.5, strokeWidth: 0 }}
                    activeDot={{ r: 4, fill: activeColor, strokeWidth: 0 }}
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
                {metrics.length} {metrics.length === 1 ? 'registro' : 'registros'}
              </span>
            </div>

            <div className="divide-y divide-zinc-50 dark:divide-zinc-800/60">
              {historyItems.map((m, i) => {
                const prev = metrics[i + 1];
                const weightDiff = prev
                  ? delta(m.weight, prev.weight, true)
                  : null;
                const isDeleting = deletingId === m.id;

                return (
                  <div
                    key={m.id}
                    className={cn(
                      'px-5 py-3.5 flex items-center gap-3 transition-opacity duration-200',
                      isDeleting && 'opacity-40 pointer-events-none'
                    )}
                  >
                    {/* Date */}
                    <div className="min-w-[52px]">
                      <p className="text-[13px] font-bold text-zinc-800 dark:text-zinc-200 tabular-nums">
                        {format(parseISO(m.date), 'd/MM', { locale: ptBR })}
                      </p>
                      <p className="text-[10px] text-zinc-400 dark:text-zinc-500 font-medium">
                        {format(parseISO(m.date), 'yyyy')}
                      </p>
                    </div>

                    {/* Metrics */}
                    <div className="flex-1 grid grid-cols-2 gap-x-3 gap-y-0.5">
                      <span className="text-[12px] text-zinc-700 dark:text-zinc-300 font-semibold tabular-nums">
                        {fmtVal(m.weight, 'kg')}
                      </span>
                      <span className="text-[12px] text-zinc-400 dark:text-zinc-500 tabular-nums">
                        {fmtVal(m.muscle_mass, 'kg')}
                      </span>
                      <span className="text-[11px] text-zinc-400 dark:text-zinc-500 tabular-nums">
                        {fmtVal(m.body_fat, '%')} gord.
                      </span>
                      <span className="text-[11px] text-zinc-400 dark:text-zinc-500 tabular-nums">
                        {fmtVal(m.visceral_fat, '')} visc.
                      </span>
                    </div>

                    {/* Weight delta */}
                    {weightDiff && weightDiff.value !== '0' ? (
                      <span
                        className={cn(
                          'text-[11px] font-semibold tabular-nums min-w-[36px] text-right',
                          weightDiff.good === true
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-red-500'
                        )}
                      >
                        {weightDiff.sign}{weightDiff.value}
                      </span>
                    ) : (
                      <span className="min-w-[36px]" />
                    )}

                    {/* Actions */}
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => openEdit(m)}
                        className="h-7 w-7 rounded-lg flex items-center justify-center text-zinc-300 hover:text-zinc-500 dark:text-zinc-600 dark:hover:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-all duration-150"
                      >
                        <Pencil size={12} />
                      </button>
                      <button
                        onClick={() => handleDelete(m.id)}
                        disabled={isDeleting}
                        className="h-7 w-7 rounded-lg flex items-center justify-center text-zinc-300 hover:text-red-500 dark:text-zinc-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-all duration-150 disabled:opacity-40"
                      >
                        {isDeleting ? (
                          <span className="h-3 w-3 rounded-full border-2 border-current border-t-transparent animate-spin" />
                        ) : (
                          <Trash2 size={12} />
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {metrics.length > 5 && (
              <button
                onClick={() => setShowHistoryAll((v) => !v)}
                className="w-full flex items-center justify-center gap-1.5 py-3.5 text-[12px] font-semibold text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 border-t border-zinc-50 dark:border-zinc-800/60 transition-colors duration-150"
              >
                <ChevronDown
                  size={13}
                  className={cn('transition-transform duration-200', showHistoryAll && 'rotate-180')}
                />
                {showHistoryAll ? 'Ver menos' : `Ver mais ${metrics.length - 5} registros`}
              </button>
            )}
          </div>
        </>
      )}

      {/* Form modal */}
      <Modal
        open={showForm}
        onClose={closeForm}
        title={editingId ? 'Editar pesagem' : 'Nova pesagem'}
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

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Peso (kg)"
              type="number"
              inputMode="decimal"
              placeholder="82.5"
              step="0.1"
              min="1"
              max="499"
              value={formValues.weight}
              onChange={(e) => setField('weight', e.target.value)}
              error={formErrors.weight}
            />
            <Input
              label="Músculos (kg)"
              type="number"
              inputMode="decimal"
              placeholder="38.2"
              step="0.1"
              min="0"
              max="199"
              value={formValues.muscle_mass}
              onChange={(e) => setField('muscle_mass', e.target.value)}
              error={formErrors.muscle_mass}
            />
            <Input
              label="Gordura (%)"
              type="number"
              inputMode="decimal"
              placeholder="18.4"
              step="0.1"
              min="0"
              max="100"
              value={formValues.body_fat}
              onChange={(e) => setField('body_fat', e.target.value)}
              error={formErrors.body_fat}
            />
            <Input
              label="V. Visceral"
              type="number"
              inputMode="decimal"
              placeholder="8"
              step="0.5"
              min="0"
              max="30"
              value={formValues.visceral_fat}
              onChange={(e) => setField('visceral_fat', e.target.value)}
              error={formErrors.visceral_fat}
            />
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
