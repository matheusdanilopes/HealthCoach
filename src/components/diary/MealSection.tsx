'use client';

import { useState } from 'react';
import { Plus, Trash2, ChevronDown } from 'lucide-react';
import { getMealLabel, getMealIcon, cn } from '@/lib/utils';
import type { FoodLog, MealType } from '@/types';

interface MealSectionProps {
  mealType: MealType;
  logs: FoodLog[];
  onAdd: () => void;
  onDelete: (id: string) => void;
}

function getDefaultExpanded(mealType: MealType): boolean {
  const h = new Date().getHours();
  if (mealType === 'breakfast') return h >= 5 && h < 11;
  if (mealType === 'lunch')     return h >= 11 && h < 15;
  if (mealType === 'dinner')    return h >= 15 && h < 22;
  return false;
}

export default function MealSection({ mealType, logs, onAdd, onDelete }: MealSectionProps) {
  const [expanded, setExpanded] = useState(() => getDefaultExpanded(mealType) || logs.length > 0);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const totalCal = logs.reduce((sum, l) => sum + l.calories, 0);

  async function handleDelete(id: string) {
    setDeletingId(id);
    await fetch(`/api/food?id=${id}`, { method: 'DELETE' });
    onDelete(id);
    setDeletingId(null);
  }

  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-sm dark:shadow-none">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-5 py-4 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
      >
        <span className="text-base">{getMealIcon(mealType)}</span>
        <div className="flex-1 text-left">
          <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{getMealLabel(mealType)}</p>
          {logs.length > 0 && (
            <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">{logs.length} item{logs.length !== 1 ? 's' : ''}</p>
          )}
        </div>
        <span className={cn('text-sm font-semibold tabular-nums mr-2', totalCal > 0 ? 'text-zinc-700 dark:text-zinc-300' : 'text-zinc-300 dark:text-zinc-600')}>
          {totalCal > 0 ? `${totalCal.toLocaleString('pt-BR')} kcal` : '—'}
        </span>
        <ChevronDown
          size={15}
          className={cn('text-zinc-400 dark:text-zinc-500 transition-transform duration-200', expanded ? 'rotate-180' : '')}
        />
      </button>

      {expanded && (
        <div className="border-t border-zinc-100 dark:border-zinc-800">
          {logs.length === 0 ? (
            <p className="text-xs text-zinc-400 dark:text-zinc-500 text-center py-5">Nenhum alimento registrado</p>
          ) : (
            <ul>
              {logs.map((log) => (
                <li key={log.id} className="flex items-center gap-3 px-5 py-3 border-b border-zinc-100 dark:border-zinc-800/60 last:border-0">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-zinc-800 dark:text-zinc-200 truncate">{log.food_name}</p>
                    {(log.protein || log.carbs || log.fat) && (
                      <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">
                        {log.protein != null && `P: ${log.protein}g`}
                        {log.carbs  != null && ` · C: ${log.carbs}g`}
                        {log.fat    != null && ` · G: ${log.fat}g`}
                      </p>
                    )}
                  </div>
                  <span className="text-sm font-medium tabular-nums text-zinc-500 dark:text-zinc-400 flex-shrink-0">
                    {log.calories.toLocaleString('pt-BR')} kcal
                  </span>
                  <button
                    onClick={() => handleDelete(log.id)}
                    disabled={deletingId === log.id}
                    className="flex-shrink-0 h-7 w-7 rounded-lg bg-red-50 hover:bg-red-100 dark:bg-red-900/20 dark:hover:bg-red-900/30 flex items-center justify-center text-red-400 hover:text-red-500 transition-all disabled:opacity-40"
                  >
                    <Trash2 size={13} />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <button
            onClick={onAdd}
            className="w-full flex items-center gap-2 px-5 py-3 text-sm text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
          >
            <Plus size={15} />
            Adicionar alimento
          </button>
        </div>
      )}
    </div>
  );
}
