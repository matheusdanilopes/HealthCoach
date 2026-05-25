'use client';

import { useState } from 'react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { TrendingDown, TrendingUp, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

interface HistoryClientProps {
  weightLogs: { date: string; weight: number }[];
  dailyCalData: { date: string; calories: number }[];
  targetCalories: number;
}

function CustomTooltipWeight({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-sm shadow-xl">
      <p className="text-zinc-500 text-xs mb-1">
        {format(parseISO(label), "d 'de' MMM", { locale: ptBR })}
      </p>
      <p className="text-zinc-100 font-semibold tabular-nums">{payload[0].value} kg</p>
    </div>
  );
}

function CustomTooltipCal({ active, payload, label, target }: any) {
  if (!active || !payload?.length) return null;
  const cal = payload[0].value;
  const deficit = target - cal;
  return (
    <div className="bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-sm shadow-xl">
      <p className="text-zinc-500 text-xs mb-1">
        {format(parseISO(label), "d 'de' MMM", { locale: ptBR })}
      </p>
      <p className="text-zinc-100 font-semibold tabular-nums">{cal.toLocaleString('pt-BR')} kcal</p>
      <p className={cn('text-xs mt-0.5 tabular-nums', deficit >= 0 ? 'text-emerald-400' : 'text-rose-400')}>
        {deficit >= 0
          ? `${deficit.toLocaleString('pt-BR')} abaixo da meta`
          : `${Math.abs(deficit).toLocaleString('pt-BR')} acima da meta`}
      </p>
    </div>
  );
}

interface StatCardProps {
  value: React.ReactNode;
  label: string;
  icon?: React.ReactNode;
}

function StatCard({ value, label, icon }: StatCardProps) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-3 text-center">
      {icon && <div className="flex items-center justify-center mb-1.5">{icon}</div>}
      <p className="text-lg font-bold tabular-nums">{value}</p>
      <p className="text-[11px] text-zinc-500 mt-0.5">{label}</p>
    </div>
  );
}

export default function HistoryClient({ weightLogs, dailyCalData, targetCalories }: HistoryClientProps) {
  const [calRange, setCalRange] = useState<7 | 30>(7);

  const filteredCalData = calRange === 7 ? dailyCalData.slice(-7) : dailyCalData;

  const weightTrend = weightLogs.length >= 2
    ? weightLogs[weightLogs.length - 1].weight - weightLogs[0].weight
    : 0;

  const consistentDays = dailyCalData.filter((d) => d.calories <= targetCalories).length;
  const consistencyPct = dailyCalData.length > 0
    ? Math.round((consistentDays / dailyCalData.length) * 100)
    : 0;

  const trendColor = weightTrend < 0 ? 'text-emerald-400' : weightTrend > 0 ? 'text-rose-400' : 'text-zinc-500';
  const trendIcon = weightTrend < 0
    ? <TrendingDown size={15} className="text-emerald-400" />
    : weightTrend > 0
      ? <TrendingUp size={15} className="text-rose-400" />
      : <Minus size={15} className="text-zinc-500" />;

  return (
    <div className="flex flex-col gap-5 pt-6">
      <div>
        <h1 className="text-xl font-bold text-zinc-100">Evolução</h1>
        <p className="text-sm text-zinc-500">Últimos 30 dias</p>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-2.5">
        <StatCard
          icon={trendIcon}
          value={
            <span className={trendColor}>
              {weightTrend > 0 ? '+' : ''}{weightTrend.toFixed(1)}kg
            </span>
          }
          label="Variação"
        />
        <StatCard
          value={<span className="text-emerald-400">{consistencyPct}%</span>}
          label="Consistência"
        />
        <StatCard
          value={<span className="text-zinc-200">{dailyCalData.length}</span>}
          label="Dias registrados"
        />
      </div>

      {/* Weight chart */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
        <p className="text-xs font-medium text-zinc-500 mb-4">Tendência de peso</p>
        {weightLogs.length < 2 ? (
          <div className="h-40 flex items-center justify-center">
            <p className="text-xs text-zinc-600 text-center max-w-[180px] leading-relaxed">
              Registre seu peso por pelo menos 2 dias para ver o gráfico
            </p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={weightLogs} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={(d) => format(parseISO(d), 'd/M')}
                tick={{ fontSize: 10, fill: '#52525b' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                domain={['dataMin - 0.5', 'dataMax + 0.5']}
                tick={{ fontSize: 10, fill: '#52525b' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => `${v}kg`}
              />
              <Tooltip content={<CustomTooltipWeight />} cursor={{ stroke: '#3f3f46', strokeWidth: 1 }} />
              <Line
                type="monotone"
                dataKey="weight"
                stroke="#10b981"
                strokeWidth={2}
                dot={{ fill: '#10b981', r: 3, strokeWidth: 0 }}
                activeDot={{ r: 4, strokeWidth: 0, fill: '#34d399' }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Calorie chart */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
        <div className="flex items-center justify-between mb-4">
          <p className="text-xs font-medium text-zinc-500">Histórico de calorias</p>
          <div className="flex gap-1 bg-zinc-800 rounded-lg p-0.5">
            {([7, 30] as const).map((n) => (
              <button
                key={n}
                onClick={() => setCalRange(n)}
                className={cn(
                  'px-2.5 py-1 rounded-md text-xs font-medium transition-all duration-150',
                  calRange === n
                    ? 'bg-zinc-700 text-zinc-200 shadow-sm'
                    : 'text-zinc-500 hover:text-zinc-400'
                )}
              >
                {n}d
              </button>
            ))}
          </div>
        </div>
        {filteredCalData.length === 0 ? (
          <div className="h-40 flex items-center justify-center">
            <p className="text-xs text-zinc-600">Nenhum registro encontrado</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={filteredCalData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={(d) => format(parseISO(d), 'd/M')}
                tick={{ fontSize: 10, fill: '#52525b' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 10, fill: '#52525b' }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip content={<CustomTooltipCal target={targetCalories} />} cursor={{ fill: '#27272a' }} />
              <ReferenceLine
                y={targetCalories}
                stroke="#10b981"
                strokeDasharray="4 4"
                strokeWidth={1}
                strokeOpacity={0.6}
              />
              <Bar dataKey="calories" radius={[3, 3, 0, 0]}>
                {filteredCalData.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={entry.calories <= targetCalories ? '#10b981' : '#f43f5e'}
                    fillOpacity={0.75}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
        <div className="flex items-center justify-center gap-4 mt-3">
          <span className="flex items-center gap-1.5 text-[11px] text-zinc-600">
            <span className="h-2 w-2 rounded-sm bg-emerald-500 opacity-75" />
            Abaixo da meta
          </span>
          <span className="flex items-center gap-1.5 text-[11px] text-zinc-600">
            <span className="h-2 w-2 rounded-sm bg-rose-500 opacity-75" />
            Acima da meta
          </span>
        </div>
      </div>
    </div>
  );
}
