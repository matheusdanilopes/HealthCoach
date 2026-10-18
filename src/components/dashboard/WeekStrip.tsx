'use client';

import { memo, useMemo } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn, formatDate } from '@/lib/utils';

interface WeekStripProps {
  selectedDate: string;
  today: string;
  disabled?: boolean;
  onSelect: (date: string) => void;
}

function parseISO(date: string) {
  return new Date(date + 'T12:00:00');
}

function addDays(date: string, delta: number) {
  const d = parseISO(date);
  d.setDate(d.getDate() + delta);
  return formatDate(d);
}

/** Monday-first week containing `date`. */
function weekOf(date: string) {
  const d = parseISO(date);
  const offset = (d.getDay() + 6) % 7;
  const monday = addDays(date, -offset);
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

export default memo(function WeekStrip({ selectedDate, today, disabled, onSelect }: WeekStripProps) {
  const days = useMemo(() => weekOf(selectedDate), [selectedDate]);
  const isCurrentWeek = days.includes(today);
  const monthLabel = format(parseISO(selectedDate), "MMMM 'de' yyyy", { locale: ptBR });

  function shiftWeek(delta: number) {
    const target = addDays(selectedDate, delta * 7);
    onSelect(target > today ? today : target);
  }

  return (
    <section
      aria-label="Selecionar dia"
      className={cn(
        'rounded-2xl bg-white dark:bg-zinc-900/80 border border-zinc-200/60 dark:border-zinc-800/60 p-3 shadow-[0_1px_3px_0_rgb(0,0,0,0.04)] dark:shadow-none transition-opacity',
        disabled && 'opacity-60 pointer-events-none'
      )}
    >
      <div className="flex items-center justify-between px-1 mb-2">
        <p className="text-[12px] font-semibold text-zinc-500 dark:text-zinc-400 first-letter:uppercase">{monthLabel}</p>
        <div className="flex items-center gap-1">
          {selectedDate !== today && (
            <button
              onClick={() => onSelect(today)}
              className="h-7 px-2.5 mr-1 rounded-lg text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-colors active:scale-95"
            >
              Hoje
            </button>
          )}
          <button
            onClick={() => shiftWeek(-1)}
            className="h-7 w-7 flex items-center justify-center rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors active:scale-95"
            aria-label="Semana anterior"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => shiftWeek(1)}
            disabled={isCurrentWeek}
            className="h-7 w-7 flex items-center justify-center rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors active:scale-95 disabled:opacity-30 disabled:pointer-events-none"
            aria-label="Próxima semana"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {days.map((day) => {
          const d = parseISO(day);
          const isSelected = day === selectedDate;
          const isToday = day === today;
          const isFuture = day > today;
          return (
            <button
              key={day}
              onClick={() => onSelect(day)}
              disabled={isFuture}
              aria-pressed={isSelected}
              aria-label={format(d, "EEEE, d 'de' MMMM", { locale: ptBR })}
              className={cn(
                'flex flex-col items-center gap-1 py-2 rounded-xl transition-all duration-200 active:scale-95 disabled:opacity-30 disabled:pointer-events-none',
                isSelected
                  ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-600/30'
                  : 'text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
              )}
            >
              <span className={cn(
                'text-[10px] font-semibold uppercase tracking-wide',
                isSelected ? 'text-emerald-100' : 'text-zinc-400 dark:text-zinc-500'
              )}>
                {format(d, 'EEEEEE', { locale: ptBR })}
              </span>
              <span className="text-[15px] font-bold tabular-nums leading-none">{d.getDate()}</span>
              <span className={cn(
                'h-1 w-1 rounded-full',
                isToday ? (isSelected ? 'bg-white' : 'bg-emerald-500') : 'bg-transparent'
              )} />
            </button>
          );
        })}
      </div>
    </section>
  );
});
