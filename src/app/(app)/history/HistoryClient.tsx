'use client';

import { useState } from 'react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
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

interface HistoryClientProps {
  weightLogs: { date: string; weight: number }[];
  dailyCalData: { date: string; calories: number }[];
  targetCalories: number;
}

function CustomTooltipWeight({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-sm shadow-xl">
      <p className="text-zinc-400 text-xs mb-1">
        {format(parseISO(label), "d MMM", { locale: ptBR })}
      </p>
      <p className="text-zinc-100 font-semibold">{payload[0].value} kg</p>
    </div>
  );
}

function CustomTooltipCal({ active, payload, label, target }: any) {
  if (!active || !payload?.length) return null;
  const cal = payload[0].value;
  const deficit = target - cal;
  return (
    <div className="bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-sm shadow-xl">
      <p className="text-zinc-400 text-xs mb-1">
        {format(parseISO(label), "d MMM", { locale: ptBR })}
      </p>
      <p className="text-zinc-100 font-semibold">{cal.toLocaleString('pt-BR')} kcal</p>
      <p className={`text-xs ${deficit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
        {deficit >= 0 ? `${deficit} kcal abaixo da meta` : `${Math.abs(deficit)} kcal acima da meta`}
      </p>
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

  return (
    <div className="flex flex-col gap-5 pt-5">
      <div>
        <h1 className="text-xl font-bold text-zinc-100">Evolução</h1>
        <p className="text-sm text-zinc-500">Últimos 30 dias</p>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-3 text-center">
          <div className="flex items-center justify-center mb-1">
            {weightTrend < 0 ? (
              <TrendingDown size={16} className="text-emerald-400" />
            ) : weightTrend > 0 ? (
              <TrendingUp size={16} className="text-red-400" />
            ) : (
              <Minus size={16} className="text-zinc-500" />
            )}
          </div>
          <p className={`text-lg font-bold ${weightTrend < 0 ? 'text-emerald-400' : weightTrend > 0 ? 'text-red-400' : 'text-zinc-400'}`}>
            {weightTrend > 0 ? '+' : ''}{weightTrend.toFixed(1)}kg
          </p>
          <p className="text-xs text-zinc-600 mt-0.5">Variação</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-3 text-center">
          <p className="text-lg font-bold text-emerald-400">{consistencyPct}%</p>
          <p className="text-xs text-zinc-600 mt-0.5">Consistência</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-3 text-center">
          <p className="text-lg font-bold text-zinc-200">{dailyCalData.length}</p>
          <p className="text-xs text-zinc-600 mt-0.5">Dias registrados</p>
        </div>
      </div>

      {/* Weight chart */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
        <p className="text-sm font-medium text-zinc-400 mb-4">📈 Tendência de peso</p>
        {weightLogs.length < 2 ? (
          <div className="h-40 flex items-center justify-center text-zinc-600 text-sm">
            Registre seu peso por pelo menos 2 dias para ver o gráfico
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={weightLogs} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis
                dataKey="date"
                tickFormatter={(d) => format(parseISO(d), 'd/M')}
                tick={{ fontSize: 11, fill: '#71717a' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                domain={['dataMin - 0.5', 'dataMax + 0.5']}
                tick={{ fontSize: 11, fill: '#71717a' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => `${v}kg`}
              />
              <Tooltip content={<CustomTooltipWeight />} />
              <Line
                type="monotone"
                dataKey="weight"
                stroke="#10b981"
                strokeWidth={2.5}
                dot={{ fill: '#10b981', r: 3, strokeWidth: 0 }}
                activeDot={{ r: 5, strokeWidth: 0 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Calorie deficit chart */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm font-medium text-zinc-400">🔥 Histórico de calorias</p>
          <div className="flex gap-1">
            {([7, 30] as const).map((n) => (
              <button
                key={n}
                onClick={() => setCalRange(n)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                  calRange === n ? 'bg-emerald-500/20 text-emerald-400' : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {n}d
              </button>
            ))}
          </div>
        </div>
        {filteredCalData.length === 0 ? (
          <div className="h-40 flex items-center justify-center text-zinc-600 text-sm">
            Nenhum registro encontrado
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={filteredCalData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis
                dataKey="date"
                tickFormatter={(d) => format(parseISO(d), 'd/M')}
                tick={{ fontSize: 11, fill: '#71717a' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: '#71717a' }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip content={<CustomTooltipCal target={targetCalories} />} />
              <ReferenceLine
                y={targetCalories}
                stroke="#10b981"
                strokeDasharray="4 4"
                strokeWidth={1.5}
              />
              <Bar
                dataKey="calories"
                radius={[4, 4, 0, 0]}
                fill="#3f3f46"
                label={false}
              />
            </BarChart>
          </ResponsiveContainer>
        )}
        <p className="text-xs text-zinc-600 mt-2 text-center">
          Linha verde = meta de {targetCalories.toLocaleString('pt-BR')} kcal
        </p>
      </div>
    </div>
  );
}
