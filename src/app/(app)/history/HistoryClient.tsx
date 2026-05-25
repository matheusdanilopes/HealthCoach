'use client';

import { useState } from 'react';
import {
  LineChart, Line, BarChart, Bar, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { TrendingDown, TrendingUp, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTheme } from '@/contexts/ThemeContext';

interface HistoryClientProps {
  weightLogs: { date: string; weight: number }[];
  dailyCalData: { date: string; calories: number }[];
  targetCalories: number;
}

function CustomTooltipWeight({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-2 text-sm shadow-lg">
      <p className="text-zinc-400 dark:text-zinc-500 text-xs mb-1">
        {format(parseISO(label), "d 'de' MMM", { locale: ptBR })}
      </p>
      <p className="text-zinc-900 dark:text-zinc-100 font-semibold tabular-nums">{payload[0].value} kg</p>
    </div>
  );
}

function CustomTooltipCal({ active, payload, label, target }: any) {
  if (!active || !payload?.length) return null;
  const cal = payload[0].value;
  const deficit = target - cal;
  return (
    <div className="bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-2 text-sm shadow-lg">
      <p className="text-zinc-400 dark:text-zinc-500 text-xs mb-1">
        {format(parseISO(label), "d 'de' MMM", { locale: ptBR })}
      </p>
      <p className="text-zinc-900 dark:text-zinc-100 font-semibold tabular-nums">{cal.toLocaleString('pt-BR')} kcal</p>
      <p className={cn('text-xs mt-0.5 tabular-nums', deficit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500')}>
        {deficit >= 0
          ? `${deficit.toLocaleString('pt-BR')} abaixo da meta`
          : `${Math.abs(deficit).toLocaleString('pt-BR')} acima da meta`}
      </p>
    </div>
  );
}

function StatCard({ value, label, icon }: { value: React.ReactNode; label: string; icon?: React.ReactNode }) {
  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 text-center shadow-sm dark:shadow-none">
      {icon && <div className="flex items-center justify-center mb-1.5">{icon}</div>}
      <p className="text-lg font-bold tabular-nums">{value}</p>
      <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-0.5">{label}</p>
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

  const trendColor = weightTrend < 0
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
  const gridColor   = isDark ? '#27272a' : '#f4f4f5';
  const tickColor   = isDark ? '#71717a' : '#a1a1aa';
  const cursorColor = isDark ? '#3f3f46' : '#e4e4e7';
  const lineColor   = isDark ? '#60a5fa' : '#2563eb';

  return (
    <div className="flex flex-col gap-5 pt-8 pb-4">
      <div>
        <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">Evolução</h1>
        <p className="text-sm text-zinc-400 dark:text-zinc-500">Últimos 30 dias</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <StatCard
          icon={trendIcon}
          value={<span className={trendColor}>{weightTrend > 0 ? '+' : ''}{weightTrend.toFixed(1)}kg</span>}
          label="Variação"
        />
        <StatCard
          value={<span className="text-emerald-600 dark:text-emerald-400">{consistencyPct}%</span>}
          label="Consistência"
        />
        <StatCard
          value={<span className="text-zinc-800 dark:text-zinc-200">{dailyCalData.length}</span>}
          label="Dias registrados"
        />
      </div>

      {/* Weight chart */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-sm dark:shadow-none">
        <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-4">Tendência de peso</p>
        {weightLogs.length < 2 ? (
          <div className="h-40 flex items-center justify-center">
            <p className="text-xs text-zinc-400 dark:text-zinc-500 text-center max-w-[180px] leading-relaxed">
              Registre seu peso por pelo menos 2 dias para ver o gráfico
            </p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={weightLogs} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
              <XAxis dataKey="date" tickFormatter={(d) => format(parseISO(d), 'd/M')} tick={{ fontSize: 10, fill: tickColor }} axisLine={false} tickLine={false} />
              <YAxis domain={['dataMin - 0.5', 'dataMax + 0.5']} tick={{ fontSize: 10, fill: tickColor }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}kg`} />
              <Tooltip content={<CustomTooltipWeight />} cursor={{ stroke: cursorColor, strokeWidth: 1 }} />
              <Line type="monotone" dataKey="weight" stroke={lineColor} strokeWidth={2} dot={{ fill: lineColor, r: 3, strokeWidth: 0 }} activeDot={{ r: 4, strokeWidth: 0 }} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Calorie chart */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-sm dark:shadow-none">
        <div className="flex items-center justify-between mb-4">
          <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Histórico de calorias</p>
          <div className="flex gap-1 bg-zinc-100 dark:bg-zinc-800 rounded-lg p-0.5">
            {([7, 30] as const).map((n) => (
              <button
                key={n}
                onClick={() => setCalRange(n)}
                className={cn(
                  'px-2.5 py-1 rounded-md text-xs font-medium transition-all duration-150',
                  calRange === n
                    ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm'
                    : 'text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300'
                )}
              >
                {n}d
              </button>
            ))}
          </div>
        </div>
        {filteredCalData.length === 0 ? (
          <div className="h-40 flex items-center justify-center">
            <p className="text-xs text-zinc-400 dark:text-zinc-500">Nenhum registro encontrado</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={filteredCalData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
              <XAxis dataKey="date" tickFormatter={(d) => format(parseISO(d), 'd/M')} tick={{ fontSize: 10, fill: tickColor }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: tickColor }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltipCal target={targetCalories} />} cursor={{ fill: isDark ? '#27272a' : '#f4f4f5' }} />
              <ReferenceLine y={targetCalories} stroke={lineColor} strokeDasharray="4 4" strokeWidth={1} strokeOpacity={0.5} />
              <Bar dataKey="calories" radius={[3, 3, 0, 0]}>
                {filteredCalData.map((entry, i) => (
                  <Cell key={i} fill={entry.calories <= targetCalories ? '#10b981' : '#ef4444'} fillOpacity={0.8} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
        <div className="flex items-center justify-center gap-4 mt-3">
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
