'use client';

import { useState } from 'react';
import {
  LineChart, Line, BarChart, Bar, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { TrendingDown, TrendingUp, Minus, CheckCircle, Calendar, Scale, BarChart2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTheme } from '@/contexts/ThemeContext';

interface HistoryClientProps {
  weightLogs: { date: string; weight: number }[];
  dailyCalData: { date: string; calories: number }[];
  targetCalories: number;
}

function CustomTooltipWeight({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white dark:bg-zinc-800 border border-zinc-100 dark:border-zinc-700 rounded-xl px-3 py-2 shadow-lg">
      <p className="text-zinc-400 dark:text-zinc-500 text-[10px] mb-1 font-medium">
        {label ? format(parseISO(label), "d 'de' MMM", { locale: ptBR }) : ''}
      </p>
      <p className="text-zinc-900 dark:text-zinc-100 font-bold tabular-nums text-sm">
        {payload[0].value} kg
      </p>
    </div>
  );
}

function CustomTooltipCal({ active, payload, label, target }: { active?: boolean; payload?: Array<{ value: number }>; label?: string; target: number }) {
  if (!active || !payload?.length) return null;
  const cal = payload[0].value;
  const deficit = target - cal;
  return (
    <div className="bg-white dark:bg-zinc-800 border border-zinc-100 dark:border-zinc-700 rounded-xl px-3 py-2 shadow-lg">
      <p className="text-zinc-400 dark:text-zinc-500 text-[10px] mb-1 font-medium">
        {label ? format(parseISO(label), "d 'de' MMM", { locale: ptBR }) : ''}
      </p>
      <p className="text-zinc-900 dark:text-zinc-100 font-bold tabular-nums text-sm">
        {cal.toLocaleString('pt-BR')} kcal
      </p>
      <p className={cn('text-[11px] mt-0.5 tabular-nums font-medium', deficit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500')}>
        {deficit >= 0
          ? `${deficit.toLocaleString('pt-BR')} abaixo`
          : `${Math.abs(deficit).toLocaleString('pt-BR')} acima`}
      </p>
    </div>
  );
}

function EmptyChart({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle: string }) {
  return (
    <div className="h-44 flex flex-col items-center justify-center gap-3 px-6">
      <div className="h-11 w-11 rounded-2xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
        {icon}
      </div>
      <div className="text-center">
        <p className="text-[13px] font-semibold text-zinc-600 dark:text-zinc-400">{title}</p>
        <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-1 leading-relaxed max-w-[220px]">
          {subtitle}
        </p>
      </div>
    </div>
  );
}

export default function HistoryClient({ weightLogs, dailyCalData, targetCalories }: HistoryClientProps) {
  const [calRange, setCalRange] = useState<7 | 30>(7);
  const { theme } = useTheme();

  const filteredCalData = calRange === 7 ? dailyCalData.slice(-7) : dailyCalData;

  const weightTrend = weightLogs.length >= 2
    ? weightLogs[weightLogs.length - 1].weight - weightLogs[0].weight
    : 0;

  const consistentDays = dailyCalData.filter((d) => d.calories <= targetCalories).length;
  const consistencyPct = dailyCalData.length > 0
    ? Math.round((consistentDays / dailyCalData.length) * 100)
    : 0;

  const trendClass = weightTrend < 0
    ? 'text-emerald-600 dark:text-emerald-400'
    : weightTrend > 0
      ? 'text-red-500'
      : 'text-zinc-400';

  const trendIcon = weightTrend < 0
    ? <TrendingDown size={15} className="text-emerald-600 dark:text-emerald-400" />
    : weightTrend > 0
      ? <TrendingUp size={15} className="text-red-500" />
      : <Minus size={15} className="text-zinc-400" />;

  const isDark = theme === 'dark';
  const gridColor   = isDark ? '#1f1f23' : '#f4f4f5';
  const tickColor   = isDark ? '#52525b' : '#a1a1aa';
  const cursorColor = isDark ? '#27272a' : '#f4f4f5';
  const lineColor   = isDark ? '#60a5fa' : '#2563eb';

  return (
    <div className="flex flex-col gap-6 pt-8 pb-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">
            Evolução
          </h1>
          <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-0.5 font-medium">
            {calRange === 7 ? 'Últimos 7 dias' : 'Últimos 30 dias'}
          </p>
        </div>

        {/* Range selector */}
        <div className="flex gap-1 bg-zinc-100 dark:bg-zinc-800/80 rounded-xl p-1">
          {([7, 30] as const).map((n) => (
            <button
              key={n}
              onClick={() => setCalRange(n)}
              className={cn(
                'px-3.5 py-1.5 rounded-lg text-[12px] font-semibold transition-all duration-150',
                calRange === n
                  ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm'
                  : 'text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
              )}
            >
              {n}d
            </button>
          ))}
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        {/* Weight variation */}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800/80 rounded-3xl p-6 shadow-[0_1px_3px_0_rgb(0,0,0,0.04)] dark:shadow-none text-center">
          <div className="flex items-center justify-center mb-2">{trendIcon}</div>
          <p className={cn('text-base font-bold tabular-nums leading-none', trendClass)}>
            {weightTrend > 0 ? '+' : ''}{weightTrend.toFixed(1)}kg
          </p>
          <p className="text-[10px] uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mt-1.5 font-semibold">
            Variação
          </p>
        </div>

        {/* Consistency */}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800/80 rounded-3xl p-6 shadow-[0_1px_3px_0_rgb(0,0,0,0.04)] dark:shadow-none text-center">
          <div className="flex items-center justify-center mb-2">
            <CheckCircle size={15} className="text-emerald-500" />
          </div>
          <p className="text-base font-bold tabular-nums text-emerald-600 dark:text-emerald-400 leading-none">
            {consistencyPct}%
          </p>
          <p className="text-[10px] uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mt-1.5 font-semibold">
            Consistência
          </p>
        </div>

        {/* Records */}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800/80 rounded-3xl p-6 shadow-[0_1px_3px_0_rgb(0,0,0,0.04)] dark:shadow-none text-center">
          <div className="flex items-center justify-center mb-2">
            <Calendar size={15} className="text-blue-500" />
          </div>
          <p className="text-base font-bold tabular-nums text-zinc-800 dark:text-zinc-200 leading-none">
            {dailyCalData.length}
          </p>
          <p className="text-[10px] uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mt-1.5 font-semibold">
            Registros
          </p>
        </div>
      </div>

      {/* Weight chart */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800/80 rounded-3xl p-8 shadow-[0_1px_3px_0_rgb(0,0,0,0.04)] dark:shadow-none">
        <div className="flex items-center gap-2 mb-5">
          <Scale size={13} className="text-blue-500" />
          <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
            Tendência de peso
          </p>
        </div>
        {weightLogs.length < 2 ? (
          <EmptyChart
            icon={<Scale size={20} className="text-zinc-400 dark:text-zinc-500" />}
            title="Nenhum dado ainda"
            subtitle="Registre seu peso por pelo menos 2 dias para ver o gráfico."
          />
        ) : (
          <ResponsiveContainer width="100%" height={170}>
            <LineChart data={weightLogs} margin={{ top: 4, right: 4, bottom: 0, left: -22 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={(d) => format(parseISO(d), 'd/M')}
                tick={{ fontSize: 10, fill: tickColor }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                domain={['dataMin - 0.5', 'dataMax + 0.5']}
                tick={{ fontSize: 10, fill: tickColor }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => `${v}kg`}
              />
              <Tooltip content={<CustomTooltipWeight />} cursor={{ stroke: cursorColor, strokeWidth: 1 }} />
              <Line
                type="monotone"
                dataKey="weight"
                stroke={lineColor}
                strokeWidth={2}
                dot={{ fill: lineColor, r: 2.5, strokeWidth: 0 }}
                activeDot={{ r: 4, strokeWidth: 0 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Calorie chart */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800/80 rounded-3xl p-8 shadow-[0_1px_3px_0_rgb(0,0,0,0.04)] dark:shadow-none">
        <div className="flex items-center gap-2 mb-5">
          <BarChart2 size={13} className="text-emerald-500" />
          <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
            Histórico calórico
          </p>
        </div>
        {filteredCalData.length === 0 ? (
          <EmptyChart
            icon={<BarChart2 size={20} className="text-zinc-400 dark:text-zinc-500" />}
            title="Sem registros"
            subtitle="Registre suas refeições para ver o histórico aqui."
          />
        ) : (
          <ResponsiveContainer width="100%" height={170}>
            <BarChart data={filteredCalData} margin={{ top: 4, right: 4, bottom: 0, left: -22 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={(d) => format(parseISO(d), 'd/M')}
                tick={{ fontSize: 10, fill: tickColor }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis tick={{ fontSize: 10, fill: tickColor }} axisLine={false} tickLine={false} />
              <Tooltip
                content={<CustomTooltipCal target={targetCalories} />}
                cursor={{ fill: isDark ? '#1f1f23' : '#f9f9f9' }}
              />
              <ReferenceLine
                y={targetCalories}
                stroke={lineColor}
                strokeDasharray="4 4"
                strokeWidth={1}
                strokeOpacity={0.4}
              />
              <Bar dataKey="calories" radius={[4, 4, 0, 0]}>
                {filteredCalData.map((entry, i) => (
                  <Cell
                    key={i}
                    fill={entry.calories <= targetCalories ? '#10b981' : '#ef4444'}
                    fillOpacity={0.7}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
        <div className="flex items-center justify-center gap-5 mt-3 pt-3 border-t border-zinc-50 dark:border-zinc-800/60">
          <span className="flex items-center gap-1.5 text-[11px] text-zinc-400 dark:text-zinc-500">
            <span className="h-2 w-2 rounded-sm bg-emerald-500 opacity-80" />
            Abaixo da meta
          </span>
          <span className="flex items-center gap-1.5 text-[11px] text-zinc-400 dark:text-zinc-500">
            <span className="h-2 w-2 rounded-sm bg-red-500 opacity-80" />
            Acima da meta
          </span>
        </div>
      </div>
    </div>
  );
}
