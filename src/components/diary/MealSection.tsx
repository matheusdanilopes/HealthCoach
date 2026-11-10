'use client';

import { useState } from 'react';
import { Plus, Trash2, ChevronDown, Pencil, Droplets } from 'lucide-react';
import { getMealLabel, getMealIcon, cn } from '@/lib/utils';
import type { FoodLog, MealType } from '@/types';

interface MealSectionProps {
  mealType: MealType;
  logs: FoodLog[];
  onAdd: () => void;
  onDelete: (id: string) => void;
  onEdit: (log: FoodLog) => void;
}

function getDefaultExpanded(mealType: MealType): boolean {
  const h = new Date().getHours();
  if (mealType === 'breakfast')       return h >= 5  && h < 10;
  if (mealType === 'morning_snack')   return h >= 10 && h < 12;
  if (mealType === 'lunch')           return h >= 12 && h < 15;
  if (mealType === 'afternoon_snack') return h >= 15 && h < 18;
  if (mealType === 'dinner')          return h >= 18 && h < 22;
  if (mealType === 'supper')          return h >= 22 || h < 5;
  return false;
}

export default function MealSection({ mealType, logs, onAdd, onDelete, onEdit }: MealSectionProps) {
  const [expanded, setExpanded] = useState(() => getDefaultExpanded(mealType) || logs.length > 0);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const totalCal = logs.reduce((sum, l) => sum + l.calories, 0);
  const hasLogs = logs.length > 0;

  async function handleDelete(id: string) {
    setDeletingId(id);
    await fetch(`/api/food?id=${id}`, { method: 'DELETE' });
    onDelete(id);
    setDeletingId(null);
  }

  return (
    <div className="bg-white dark:bg-zinc-900/80 border border-zinc-200/60 dark:border-zinc-800/60 rounded-2xl overflow-hidden shadow-[0_1px_3px_0_rgb(0,0,0,0.04)] dark:shadow-none">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-zinc-50/80 dark:hover:bg-zinc-800/20 transition-colors"
      >
        <div className="h-8 w-8 rounded-xl bg-zinc-50 dark:bg-zinc-800 flex items-center justify-center flex-shrink-0">
          <span className="text-[16px] leading-none">{getMealIcon(mealType)}</span>
        </div>
        <div className="flex-1 text-left min-w-0">
          <p className="text-[13px] font-semibold text-zinc-800 dark:text-zinc-200 leading-none">
            {getMealLabel(mealType)}
          </p>
          {hasLogs && (
            <p className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-0.5">
              {logs.length} item{logs.length !== 1 ? 's' : ''}
            </p>
          )}
        </div>

        {/* Calories chip */}
        <span className={cn(
          'text-[12px] font-bold tabular-nums mr-1 px-2 py-0.5 rounded-lg',
          totalCal > 0
            ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300'
            : 'text-zinc-300 dark:text-zinc-700'
        )}>
          {totalCal > 0 ? `${totalCal.toLocaleString('pt-BR')} kcal` : '—'}
        </span>

        <ChevronDown
          size={13}
          className={cn(
            'text-zinc-300 dark:text-zinc-600 transition-transform duration-200 flex-shrink-0',
            expanded ? 'rotate-180' : ''
          )}
        />
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-zinc-100 dark:border-zinc-800/60">
          {!hasLogs ? (
            /* Empty state */
            <div className="px-4 py-4 flex items-center gap-3">
              <div className="h-8 w-8 rounded-xl border border-dashed border-zinc-200 dark:border-zinc-700 flex items-center justify-center flex-shrink-0">
                <span className="text-[14px] leading-none opacity-40">{getMealIcon(mealType)}</span>
              </div>
              <p className="text-[12px] text-zinc-400 dark:text-zinc-500 flex-1">
                Nenhum alimento registrado
              </p>
              <button
                onClick={onAdd}
                className="flex items-center gap-1.5 h-7 px-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900/40 text-emerald-600 dark:text-emerald-400 text-[11px] font-semibold hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-colors active:scale-95"
              >
                <Plus size={11} strokeWidth={2.5} />
                Adicionar
              </button>
            </div>
          ) : (
            <>
              <ul>
                {logs.map((log) => (
                  <li
                    key={log.id}
                    className="flex items-center gap-3 px-4 py-3 border-b border-zinc-50 dark:border-zinc-800/40 last:border-0"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="text-[13px] text-zinc-800 dark:text-zinc-200 truncate font-medium">
                          {log.food_name}
                        </p>
                        {(log.hydration_ml ?? 0) > 0 && (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-teal-50 dark:bg-teal-950/40 border border-teal-100 dark:border-teal-900/40 flex-shrink-0">
                            <Droplets size={8} className="text-teal-500" />
                            <span className="text-[9px] font-semibold text-teal-600 dark:text-teal-400">
                              {log.hydration_ml}ml
                            </span>
                          </span>
                        )}
                      </div>
                      {(log.protein || log.carbs || log.fat) && (
                        <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-0.5">
                          {log.protein != null && `P ${log.protein}g`}
                          {log.carbs  != null && ` · C ${log.carbs}g`}
                          {log.fat    != null && ` · G ${log.fat}g`}
                        </p>
                      )}
                    </div>
                    <span className="text-[13px] font-semibold tabular-nums text-zinc-500 dark:text-zinc-400 flex-shrink-0">
                      {log.calories.toLocaleString('pt-BR')} kcal
                    </span>
                    <button
                      onClick={() => onEdit(log)}
                      className="flex-shrink-0 h-7 w-7 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-700/50 flex items-center justify-center text-zinc-300 dark:text-zinc-600 hover:text-zinc-500 dark:hover:text-zinc-400 transition-all"
                      title="Editar"
                    >
                      <Pencil size={11} />
                    </button>
                    <button
                      onClick={() => handleDelete(log.id)}
                      disabled={deletingId === log.id}
                      className="flex-shrink-0 h-7 w-7 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 flex items-center justify-center text-zinc-300 dark:text-zinc-600 hover:text-red-400 transition-all disabled:opacity-40"
                    >
                      {deletingId === log.id
                        ? <span className="h-3 w-3 rounded-full border-2 border-zinc-300 border-t-transparent animate-spin" />
                        : <Trash2 size={12} />
                      }
                    </button>
                  </li>
                ))}
              </ul>

              {/* Add button */}
              <button
                onClick={onAdd}
                className="w-full flex items-center gap-2 px-4 py-3.5 text-[12px] text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50/60 dark:hover:bg-emerald-950/20 transition-colors font-semibold"
              >
                <Plus size={13} strokeWidth={2.5} />
                Adicionar alimento
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
