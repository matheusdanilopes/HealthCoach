'use client';

import { memo, useState, useCallback, useEffect } from 'react';
import { Droplets, Bell, BellOff, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { requestAndSubscribePush } from '@/components/ServiceWorkerRegistration';
import type { WaterLogEntry } from '@/types';

interface WaterTrackerProps {
  logs: WaterLogEntry[];
  target: number;
  date: string;
  onAdded: (ml: number, createdAt: string) => void;
}

const AMOUNTS = [200, 300, 500, 750];
const RADIUS  = 46;
const STROKE  = 7;
const CIRC    = 2 * Math.PI * RADIUS;
const SIZE    = 112; // SVG viewport

function timeSince(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (diff < 1)  return 'agora';
  if (diff < 60) return `${diff}min atrás`;
  const h = Math.floor(diff / 60);
  const m = diff % 60;
  return m > 0 ? `${h}h${m}min atrás` : `${h}h atrás`;
}

function smartStatus(pct: number, lastLog: WaterLogEntry | undefined): string {
  if (pct >= 100) return 'Meta atingida! 🎉';
  if (!lastLog) {
    return new Date().getHours() < 10
      ? 'Comece o dia bem hidratado 💧'
      : 'Registre sua primeira ingestão de água';
  }
  const minSince = Math.floor((Date.now() - new Date(lastLog.created_at).getTime()) / 60_000);
  if (minSince > 120) return 'Mais de 2h sem água — beba agora! 💧';
  if (pct >= 75) return 'Quase lá! Só mais um pouco ✨';
  if (pct >= 50) return 'Bom ritmo! Continue assim 👍';
  if (pct >= 25) return 'Lembre-se de se hidratar ao longo do dia';
  return 'Beba água com frequência para manter a saúde';
}

function hm(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default memo(function WaterTracker({ logs, target, date, onAdded }: WaterTrackerProps) {
  const [loading, setLoading]           = useState<number | null>(null);
  const [notifSupported, setNotifSupp]  = useState(false);
  const [notifGranted, setNotifGranted] = useState(false);
  const [tick, setTick]                 = useState(0); // forces re-render each minute

  const current = logs.reduce((s, l) => s + l.amount_ml, 0);
  const pct     = target > 0 ? Math.min((current / target) * 100, 100) : 0;
  const isDone  = pct >= 100;
  const lastLog = logs.length > 0 ? logs[logs.length - 1] : undefined;
  const dashOff = CIRC * (1 - pct / 100);

  // Tick every minute so "Xmin atrás" stays live
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  // Check notification API support
  useEffect(() => {
    if ('Notification' in window) {
      setNotifSupp(true);
      setNotifGranted(Notification.permission === 'granted');
    }
  }, []);

  async function handleBell() {
    if (!notifSupported || notifGranted) return;
    const granted = await requestAndSubscribePush();
    setNotifGranted(granted);
  }

  const addWater = useCallback(async (ml: number) => {
    setLoading(ml);
    const createdAt = new Date().toISOString();
    await fetch('/api/water', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ amount_ml: ml, log_date: date }),
    });
    onAdded(ml, createdAt);
    setLoading(null);
  }, [date, onAdded]);

  const colorBase  = isDone ? 'text-emerald-500' : 'text-teal-500';
  const colorDark  = isDone ? 'text-emerald-600 dark:text-emerald-400' : 'text-teal-600 dark:text-teal-400';
  const bgLight    = isDone ? 'bg-emerald-50 dark:bg-emerald-950/30' : 'bg-teal-50 dark:bg-teal-950/30';
  const bgSolid    = isDone ? 'bg-emerald-500' : 'bg-teal-500';
  const badgeCls   = isDone
    ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400'
    : 'bg-teal-50 dark:bg-teal-950/40 text-teal-600 dark:text-teal-400';

  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800/80 rounded-2xl p-5 shadow-[0_1px_3px_0_rgb(0,0,0,0.05)] dark:shadow-none flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Droplets size={13} className={cn(colorBase)} />
          <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
            Hidratação
          </p>
        </div>
        {notifSupported && (
          <button
            onClick={handleBell}
            title={notifGranted ? 'Lembretes de água ativos' : 'Ativar lembretes de água'}
            className="p-1.5 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
          >
            {notifGranted
              ? <Bell size={13} className={cn(colorBase)} />
              : <BellOff size={13} className="text-zinc-300 dark:text-zinc-600" />
            }
          </button>
        )}
      </div>

      {/* Circular progress */}
      <div className="flex flex-col items-center gap-2">
        <div className="relative" style={{ width: SIZE, height: SIZE }}>
          <svg width={SIZE} height={SIZE} className="-rotate-90" aria-hidden>
            {/* Track ring */}
            <circle
              cx={SIZE / 2} cy={SIZE / 2} r={RADIUS}
              fill="none"
              strokeWidth={STROKE}
              className="text-zinc-100 dark:text-zinc-800"
              stroke="currentColor"
            />
            {/* Progress ring */}
            <circle
              cx={SIZE / 2} cy={SIZE / 2} r={RADIUS}
              fill="none"
              strokeWidth={STROKE}
              strokeLinecap="round"
              strokeDasharray={CIRC}
              strokeDashoffset={dashOff}
              className={cn('transition-all duration-700', colorBase)}
              stroke="currentColor"
            />
          </svg>

          {/* Center text */}
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5">
            <span className={cn('text-[20px] font-bold tabular-nums leading-none tracking-tight', colorDark)}>
              {current >= 1000 ? `${(current / 1000).toFixed(1)}L` : `${current}`}
            </span>
            {current < 1000 && (
              <span className="text-[9px] text-zinc-400 dark:text-zinc-500 leading-none">ml</span>
            )}
            <span className={cn('text-[9px] font-bold px-1.5 py-0.5 rounded-full mt-0.5', badgeCls)}>
              {Math.round(pct)}%
            </span>
          </div>
        </div>

        {/* Meta label */}
        <p className="text-[11px] text-zinc-400 dark:text-zinc-500 -mt-1">
          meta {(target / 1000).toFixed(1)}L
        </p>
      </div>

      {/* Last log + status */}
      <div className="text-center space-y-1">
        {lastLog && (
          <div className="flex items-center justify-center gap-1.5" key={tick}>
            <Clock size={10} className="text-zinc-300 dark:text-zinc-600 flex-shrink-0" />
            <span className="text-[11px] text-zinc-400 dark:text-zinc-500">
              {timeSince(lastLog.created_at)} · {lastLog.amount_ml}ml
            </span>
          </div>
        )}
        <p className="text-[12px] text-zinc-500 dark:text-zinc-400 leading-snug">
          {smartStatus(pct, lastLog)}
        </p>
      </div>

      {/* Quick add buttons */}
      <div className="grid grid-cols-4 gap-1.5">
        {AMOUNTS.map((ml) => {
          const isLoading = loading === ml;
          return (
            <button
              key={ml}
              onClick={() => addWater(ml)}
              disabled={loading !== null}
              className={cn(
                'py-2 rounded-xl text-[11px] font-semibold tabular-nums transition-all duration-150 active:scale-95 disabled:pointer-events-none disabled:opacity-50',
                isLoading ? cn(bgSolid, 'text-white') : cn(bgLight, colorDark, 'hover:opacity-80'),
              )}
            >
              {isLoading
                ? <span className="inline-block h-2.5 w-2.5 rounded-full border border-current border-t-transparent animate-spin" />
                : `+${ml >= 1000 ? `${ml / 1000}L` : ml}`
              }
            </button>
          );
        })}
      </div>

      {/* Recent log timeline — last 3 entries */}
      {logs.length > 0 && (
        <div className="border-t border-zinc-100 dark:border-zinc-800/60 pt-3 space-y-1.5">
          <p className="text-[9px] font-semibold uppercase tracking-widest text-zinc-300 dark:text-zinc-600 mb-2">
            Registros de hoje
          </p>
          {[...logs].reverse().slice(0, 3).map((l, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="text-[10px] tabular-nums text-zinc-400 dark:text-zinc-500 w-9 text-right flex-shrink-0">
                {hm(l.created_at)}
              </span>
              <div className="flex-1 h-px bg-zinc-100 dark:bg-zinc-800" />
              <span className={cn('text-[10px] font-semibold tabular-nums flex-shrink-0', colorDark)}>
                +{l.amount_ml}ml
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
});
