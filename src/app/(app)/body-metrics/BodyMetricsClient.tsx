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
  Plus, Pencil, Trash2, Scale, Dumbbell,
  Flame, Activity, TrendingDown, TrendingUp,
  Minus, ChevronDown, Lightbulb, GitCompare, X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTheme } from '@/contexts/ThemeContext';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import type { BodyMetrics } from '@/types';

/* ─── Types ─── */

type MetricKey = 'weight' | 'muscle_mass' | 'body_fat' | 'visceral_fat';
type TimeRange = 7 | 30 | 90 | 0;

/* ─── Config ─── */

const METRIC_CONFIGS: Record<MetricKey, {
  label: string; unit: string; color: string;
  icon: React.ElementType; goodDown: boolean;
}> = {
  weight:       { label: 'Peso',        unit: 'kg', color: '#059669', icon: Scale,    goodDown: true  },
  muscle_mass:  { label: 'Músculos',    unit: 'kg', color: '#10b981', icon: Dumbbell, goodDown: false },
  body_fat:     { label: 'Gordura',     unit: '%',  color: '#f59e0b', icon: Flame,    goodDown: true  },
  visceral_fat: { label: 'V. Visceral', unit: '',   color: '#ef4444', icon: Activity, goodDown: true  },
};

const TIME_FILTERS: { value: TimeRange; label: string }[] = [
  { value: 7,  label: '7d'   },
  { value: 30, label: '30d'  },
  { value: 90, label: '90d'  },
  { value: 0,  label: 'Tudo' },
];

/* ─── Helpers ─── */

const today = () => new Date().toISOString().split('T')[0];

function delta(current: number, previous: number, goodDown: boolean) {
  const diff = current - previous;
  if (Math.abs(diff) < 0.05) return { sign: '' as string, value: '0', good: null as boolean | null };
  const good = goodDown ? diff < 0 : diff > 0;
  return {
    sign: diff > 0 ? '+' : '' as string,
    value: Math.abs(diff) < 10 ? diff.toFixed(1) : diff.toFixed(0),
    good,
  };
}

function cutoffStr(range: TimeRange): string | null {
  if (range === 0) return null;
  return format(subDays(new Date(), range), 'yyyy-MM-dd');
}

/* ─── Tooltip ─── */

function CustomTooltip({ active, payload, label, unit }: {
  active?: boolean; payload?: Array<{ value: number }>; label?: string; unit: string;
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

/* ─── Empty State ─── */

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-5 animate-fade-in">
      <div className="h-16 w-16 rounded-3xl bg-emerald-50 dark:bg-emerald-950/30 flex items-center justify-center">
        <Scale size={28} className="text-emerald-500" />
      </div>
      <div className="text-center">
        <p className="text-[15px] font-semibold text-zinc-800 dark:text-zinc-200">Nenhuma pesagem ainda</p>
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

/* ─── Form types + helpers ─── */

interface FormValues {
  date: string;
  weight: string;
  muscle_mass: string;
  body_fat: string;
  visceral_fat: string;
}

const emptyForm = (): FormValues => ({
  date: today(), weight: '', muscle_mass: '', body_fat: '', visceral_fat: '',
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

/* ─── Main Component ─── */

interface Props {
  initialMetrics: BodyMetrics[];
}

export default function BodyMetricsClient({ initialMetrics }: Props) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const [metrics, setMetrics] = useState<BodyMetrics[]>(initialMetrics);
  const [activeMetric, setActiveMetric] = useState<MetricKey>('weight');
  const [timeRange, setTimeRange] = useState<TimeRange>(30);
  const [compareMode, setCompareMode] = useState(false);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formValues, setFormValues] = useState<FormValues>(emptyForm());
  const [formErrors, setFormErrors] = useState<Partial<Record<keyof FormValues, string>>>({});
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [globalError, setGlobalError] = useState<string | null>(null);

  const latest   = metrics[0] ?? null;
  const previous = metrics[1] ?? null;
  const oldest   = metrics[metrics.length - 1] ?? null;

  /* Auto-insights */
  const insights = useMemo(() => {
    const out: string[] = [];
    if (metrics.length < 2 || !latest) return out;

    const cutoff30 = format(subDays(new Date(), 30), 'yyyy-MM-dd');
    const before30 = metrics.filter(m => m.date <= cutoff30);
    if (before30.length > 0) {
      const wChange = latest.weight - before30[0].weight;
      if (Math.abs(wChange) >= 0.5) {
        out.push(wChange < 0
          ? `Você perdeu ${Math.abs(wChange).toFixed(1)}kg nos últimos 30 dias`
          : `Você ganhou ${wChange.toFixed(1)}kg nos últimos 30 dias`);
      }
    }
    if (latest.body_fat != null && oldest?.body_fat != null && latest.id !== oldest.id) {
      const fChange = latest.body_fat - oldest.body_fat;
      if (Math.abs(fChange) >= 1) {
        out.push(fChange < 0
          ? `Sua gordura corporal reduziu ${Math.abs(fChange).toFixed(1)}% no total`
          : `Sua gordura corporal aumentou ${fChange.toFixed(1)}% no total`);
      }
    }
    if (latest.muscle_mass != null && oldest?.muscle_mass != null && latest.id !== oldest.id) {
      const mChange = latest.muscle_mass - oldest.muscle_mass;
      if (mChange >= 0.5) out.push(`Sua massa muscular aumentou ${mChange.toFixed(1)}kg no total`);
    }
    return out.slice(0, 3);
  }, [metrics, latest, oldest]);

  /* Total evolution */
  const totalEvo = useMemo(() => {
    if (!latest || !oldest || latest.id === oldest.id) return null;
    return delta(latest.weight, oldest.weight, true);
  }, [latest, oldest]);

  /* Chart data */
  const chartData = useMemo(() => {
    const sorted = [...metrics].sort((a, b) => a.date.localeCompare(b.date));
    const cutoff = cutoffStr(timeRange);
    const filtered = cutoff ? sorted.filter(m => m.date >= cutoff) : sorted;
    return filtered
      .filter(m => m[activeMetric] != null)
      .map(m => ({ date: m.date, value: m[activeMetric] as number }));
  }, [metrics, activeMetric, timeRange]);

  /* Monthly groups */
  const monthGroups = useMemo(() => {
    const groups: Array<{ monthKey: string; label: string; items: BodyMetrics[] }> = [];
    for (const m of metrics) {
      const monthKey = format(parseISO(m.date), 'yyyy-MM');
      const label    = format(parseISO(m.date), 'MMMM yyyy', { locale: ptBR });
      const existing = groups.find(g => g.monthKey === monthKey);
      if (existing) existing.items.push(m);
      else groups.push({ monthKey, label, items: [m] });
    }
    return groups;
  }, [metrics]);

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
    const a = metrics.find(m => m.id === compareIds[0]);
    const b = metrics.find(m => m.id === compareIds[1]);
    return a && b ? { a, b } : null;
  }, [compareIds, metrics]);

  const activeColor = METRIC_CONFIGS[activeMetric].color;
  const gridColor   = isDark ? '#1f1f23' : '#f4f4f5';
  const tickColor   = isDark ? '#52525b' : '#a1a1aa';

  /* Form handlers */
  function openAdd() {
    setEditingId(null); setFormValues(emptyForm()); setFormErrors({}); setGlobalError(null); setShowForm(true);
  }
  function openEdit(m: BodyMetrics) {
    setEditingId(m.id); setFormValues(metricsToForm(m)); setFormErrors({}); setGlobalError(null); setShowForm(true);
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
    const payload = {
      date: formValues.date,
      weight: parseFloat(formValues.weight),
      muscle_mass: formValues.muscle_mass ? parseFloat(formValues.muscle_mass) : null,
      body_fat: formValues.body_fat ? parseFloat(formValues.body_fat) : null,
      visceral_fat: formValues.visceral_fat ? parseFloat(formValues.visceral_fat) : null,
    };
    try {
      const res = await fetch(
        editingId ? `/api/body-metrics/${editingId}` : '/api/body-metrics',
        { method: editingId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) },
      );
      const result = await res.json();
      if (!res.ok) { setGlobalError(result.error ?? 'Erro ao salvar'); return; }
      const saved: BodyMetrics = {
        ...result,
        weight: parseFloat(String(result.weight)),
        muscle_mass: result.muscle_mass != null ? parseFloat(String(result.muscle_mass)) : null,
        body_fat: result.body_fat != null ? parseFloat(String(result.body_fat)) : null,
        visceral_fat: result.visceral_fat != null ? parseFloat(String(result.visceral_fat)) : null,
      };
      setMetrics(prev => {
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
      const res = await fetch(`/api/body-metrics/${id}`, { method: 'DELETE' });
      if (!res.ok) { const { error } = await res.json(); setGlobalError(error ?? 'Erro ao excluir'); return; }
      setMetrics(prev => prev.filter(m => m.id !== id));
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
      <div className="relative overflow-hidden rounded-3xl p-5 bg-gradient-to-br from-emerald-500 to-emerald-700 dark:from-emerald-600 dark:to-emerald-800 shadow-lg shadow-emerald-500/20 dark:shadow-emerald-900/25">
        <div className="flex items-start justify-between mb-4">
          <div>
            <p className="text-emerald-100 text-[10px] font-bold uppercase tracking-widest mb-1.5">
              Composição Corporal
            </p>
            <div className="flex items-baseline gap-1.5">
              <span className="text-[42px] font-black text-white tabular-nums leading-none">
                {latest ? latest.weight.toFixed(1) : '—'}
              </span>
              <span className="text-[18px] font-bold text-emerald-200">kg</span>
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
            <p className="text-emerald-100 text-[10px] font-medium mb-0.5">Evolução total</p>
            {totalEvo ? (
              <p className={cn(
                'font-bold text-sm tabular-nums',
                totalEvo.good === true ? 'text-white' :
                totalEvo.good === false ? 'text-red-200' : 'text-emerald-200',
              )}>
                {totalEvo.sign}{totalEvo.value}kg
              </p>
            ) : (
              <p className="text-emerald-200/60 text-sm font-bold">—</p>
            )}
          </div>
          <div className="bg-white/10 backdrop-blur-sm rounded-xl px-3 py-2.5">
            <p className="text-emerald-100 text-[10px] font-medium mb-0.5">Última pesagem</p>
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

      {metrics.length === 0 ? (
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
            {(Object.keys(METRIC_CONFIGS) as MetricKey[]).map(key => {
              const cfg  = METRIC_CONFIGS[key];
              const Icon = cfg.icon;
              const curr = latest?.[key] ?? null;
              const prev = previous?.[key] ?? null;
              const d    = curr != null && prev != null ? delta(curr, prev, cfg.goodDown) : undefined;
              return (
                <div
                  key={key}
                  className="snap-start flex-shrink-0 w-[148px] bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800/80 rounded-2xl p-4 shadow-[0_1px_3px_0_rgb(0,0,0,0.04)] dark:shadow-none"
                >
                  <div className="flex items-center gap-2 mb-3">
                    <div
                      className="h-7 w-7 rounded-[9px] flex items-center justify-center"
                      style={{ backgroundColor: `${cfg.color}18` }}
                    >
                      <Icon size={13} style={{ color: cfg.color }} />
                    </div>
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500 leading-tight">
                      {cfg.label}
                    </span>
                  </div>
                  {curr != null ? (
                    <>
                      <p className="text-[22px] font-bold text-zinc-900 dark:text-zinc-100 tabular-nums leading-none">
                        {curr % 1 === 0 ? curr : curr.toFixed(1)}
                        <span className="text-[12px] font-semibold text-zinc-400 dark:text-zinc-500 ml-1">{cfg.unit}</span>
                      </p>
                      {d && d.value !== '0' && (
                        <p className={cn(
                          'text-[11px] font-semibold mt-1.5 flex items-center gap-1',
                          d.good === true  ? 'text-emerald-600 dark:text-emerald-400' :
                          d.good === false ? 'text-red-500'                           :
                          'text-zinc-400 dark:text-zinc-500',
                        )}>
                          {d.good === true  ? <TrendingDown size={11} /> :
                           d.good === false ? <TrendingUp size={11} />   :
                           <Minus size={11} />}
                          {d.sign}{d.value}{cfg.unit}
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="text-[22px] font-bold text-zinc-300 dark:text-zinc-600 leading-none">—</p>
                  )}
                </div>
              );
            })}
          </div>

          {/* ── Chart ── */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800/80 rounded-2xl p-5 shadow-[0_1px_3px_0_rgb(0,0,0,0.04)] dark:shadow-none">

            {/* Metric tabs */}
            <div className="flex gap-1 mb-4 overflow-x-auto pb-0.5 scrollbar-hide">
              {(Object.keys(METRIC_CONFIGS) as MetricKey[]).map(key => {
                const cfg    = METRIC_CONFIGS[key];
                const active = activeMetric === key;
                return (
                  <button
                    key={key}
                    onClick={() => setActiveMetric(key)}
                    className={cn(
                      'flex-shrink-0 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all duration-150',
                      active
                        ? 'text-white shadow-sm'
                        : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300',
                    )}
                    style={active ? { backgroundColor: cfg.color } : {}}
                  >
                    {cfg.label}
                  </button>
                );
              })}
            </div>

            {/* Time filter */}
            <div className="flex items-center justify-between mb-4">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
                {METRIC_CONFIGS[activeMetric].label} ao longo do tempo
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
                    <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor={activeColor} stopOpacity={0.18} />
                      <stop offset="95%" stopColor={activeColor} stopOpacity={0}    />
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
                    tickFormatter={v => `${v}${METRIC_CONFIGS[activeMetric].unit}`}
                  />
                  <Tooltip
                    content={<CustomTooltip unit={METRIC_CONFIGS[activeMetric].unit} />}
                    cursor={{ stroke: isDark ? '#27272a' : '#e4e4e7', strokeWidth: 1 }}
                  />
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke={activeColor}
                    strokeWidth={2.5}
                    fill="url(#areaGrad)"
                    dot={{ fill: activeColor, r: 3, strokeWidth: 0 }}
                    activeDot={{ r: 5, fill: activeColor, strokeWidth: 2, stroke: isDark ? '#18181b' : '#fff' }}
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
                  {metrics.length} {metrics.length === 1 ? 'registro' : 'registros'}
                </p>
              </div>
              <button
                onClick={() => { setCompareMode(v => !v); setCompareIds([]); }}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-semibold transition-all duration-150',
                  compareMode
                    ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800'
                    : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300',
                )}
              >
                <GitCompare size={12} />
                {compareMode ? 'Cancelar' : 'Comparar'}
              </button>
            </div>

            {/* Compare hint */}
            {compareMode && (
              <div className="mx-5 mb-3 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/30 rounded-xl px-4 py-2.5 animate-fade-in">
                <p className="text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
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
                          <p className="text-[14px] font-black text-zinc-800 dark:text-zinc-100 tabular-nums">
                            {earlier.weight.toFixed(1)}<span className="text-[10px] ml-0.5 font-semibold text-zinc-400">kg</span>
                          </p>
                        </div>
                        <ChevronDown size={14} className="text-zinc-300 dark:text-zinc-600 rotate-[-90deg] shrink-0" />
                        <div className="flex-1 bg-white dark:bg-zinc-700/50 rounded-xl py-2 px-3 text-center">
                          <p className="text-[9px] text-zinc-400 dark:text-zinc-500 mb-0.5">
                            {format(parseISO(later.date), 'd MMM yyyy', { locale: ptBR })}
                          </p>
                          <p className="text-[14px] font-black text-zinc-800 dark:text-zinc-100 tabular-nums">
                            {later.weight.toFixed(1)}<span className="text-[10px] ml-0.5 font-semibold text-zinc-400">kg</span>
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        {([
                          { key: 'weight'       as MetricKey, label: 'Peso',       unit: 'kg', goodDown: true  },
                          { key: 'body_fat'     as MetricKey, label: 'Gordura',    unit: '%',  goodDown: true  },
                          { key: 'muscle_mass'  as MetricKey, label: 'Músculos',   unit: 'kg', goodDown: false },
                          { key: 'visceral_fat' as MetricKey, label: 'V. Visceral',unit: '',   goodDown: true  },
                        ] as const).map(({ key, label, unit, goodDown }) => {
                          const ev = earlier[key] as number | null;
                          const lv = later[key]   as number | null;
                          if (ev == null || lv == null) return null;
                          const d = delta(lv, ev, goodDown);
                          return (
                            <div key={key} className="bg-white dark:bg-zinc-700/30 rounded-xl px-3 py-2">
                              <p className="text-[10px] text-zinc-400 dark:text-zinc-500 mb-0.5">{label}</p>
                              <p className={cn(
                                'text-[13px] font-bold tabular-nums',
                                d.value === '0'  ? 'text-zinc-400 dark:text-zinc-500' :
                                d.good === true  ? 'text-emerald-600 dark:text-emerald-400' :
                                'text-red-500 dark:text-red-400',
                              )}>
                                {d.value === '0' ? '—' : `${d.sign}${d.value}${unit}`}
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
                        const allIdx    = metrics.indexOf(m);
                        const prev      = metrics[allIdx + 1] ?? null;
                        const wDiff     = prev ? delta(m.weight, prev.weight, true) : null;
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
                                ? 'bg-emerald-500 border-emerald-500'
                                : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700',
                            )} />

                            <div
                              className={cn(
                                'border rounded-xl px-4 py-3 transition-all duration-150',
                                isSelected
                                  ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800'
                                  : 'bg-white dark:bg-zinc-900 border-zinc-100 dark:border-zinc-800/80',
                                compareMode && 'cursor-pointer select-none',
                              )}
                              onClick={compareMode ? () => handleCompareSelect(m.id) : undefined}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                                    <p className="text-[11px] font-medium text-zinc-400 dark:text-zinc-500">
                                      {format(parseISO(m.date), "d 'de' MMMM", { locale: ptBR })}
                                    </p>
                                    {wDiff && wDiff.value !== '0' && (
                                      <span className={cn(
                                        'text-[10px] font-bold px-1.5 py-0.5 rounded-full',
                                        wDiff.good === true
                                          ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400'
                                          : 'bg-red-50 text-red-500 dark:bg-red-950/40 dark:text-red-400',
                                      )}>
                                        {wDiff.sign}{wDiff.value}kg
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex items-baseline gap-3 flex-wrap">
                                    <span className="text-[17px] font-black text-zinc-900 dark:text-zinc-100 tabular-nums">
                                      {m.weight.toFixed(1)}
                                      <span className="text-[11px] font-semibold text-zinc-400 dark:text-zinc-500 ml-0.5">kg</span>
                                    </span>
                                    {m.body_fat != null && (
                                      <span className="text-[11px] text-zinc-400 dark:text-zinc-500">
                                        <span className="font-semibold text-zinc-600 dark:text-zinc-300">{m.body_fat.toFixed(1)}%</span>{' '}gord.
                                      </span>
                                    )}
                                    {m.muscle_mass != null && (
                                      <span className="text-[11px] text-zinc-400 dark:text-zinc-500">
                                        <span className="font-semibold text-zinc-600 dark:text-zinc-300">{m.muscle_mass.toFixed(1)}kg</span>{' '}músc.
                                      </span>
                                    )}
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
      <Modal open={showForm} onClose={closeForm} title={editingId ? 'Editar pesagem' : 'Nova pesagem'}>
        <div className="flex flex-col gap-4">
          {globalError && (
            <div className="bg-red-50 dark:bg-red-950/30 border border-red-100 dark:border-red-900/50 rounded-xl px-4 py-2.5 text-[12px] text-red-600 dark:text-red-400 font-medium">
              {globalError}
            </div>
          )}
          <Input label="Data" type="date" value={formValues.date} max={today()} onChange={e => setField('date', e.target.value)} error={formErrors.date} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Peso (kg)" type="number" inputMode="decimal" placeholder="82.5" step="0.1" min="1" max="499"
              value={formValues.weight} onChange={e => setField('weight', e.target.value)} error={formErrors.weight} />
            <Input label="Músculos (kg)" type="number" inputMode="decimal" placeholder="38.2" step="0.1" min="0" max="199"
              value={formValues.muscle_mass} onChange={e => setField('muscle_mass', e.target.value)} error={formErrors.muscle_mass} />
            <Input label="Gordura (%)" type="number" inputMode="decimal" placeholder="18.4" step="0.1" min="0" max="100"
              value={formValues.body_fat} onChange={e => setField('body_fat', e.target.value)} error={formErrors.body_fat} />
            <Input label="V. Visceral" type="number" inputMode="decimal" placeholder="8" step="0.5" min="0" max="30"
              value={formValues.visceral_fat} onChange={e => setField('visceral_fat', e.target.value)} error={formErrors.visceral_fat} />
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
