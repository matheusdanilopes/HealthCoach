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
    <div className="bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800/80 rounded-2xl overflow-hidden shadow-[0_1px_3px_0_rgb(0,0,0,0.04)] dark:shadow-none">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-5 py-4 hover:bg-zinc-50/80 dark:hover:bg-zinc-800/20 transition-colors"
      >
        <span className="text-base leading-none">{getMealIcon(mealType)}</span>
        <div className="flex-1 text-left min-w-0">
          <p className="text-[13px] font-semibold text-zinc-800 dark:text-zinc-200 leading-none">
            {getMealLabel(mealType)}
          </p>
          {logs.length > 0 && (
            <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-0.5">
              {logs.length} item{logs.length !== 1 ? 's' : ''}
            </p>
          )}
        </div>
        <span className={cn(
          'text-[13px] font-bold tabular-nums mr-1',
          totalCal > 0 ? 'text-zinc-700 dark:text-zinc-300' : 'text-zinc-300 dark:text-zinc-700'
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

      {expanded && (
        <div className="border-t border-zinc-100 dark:border-zinc-800/60">
          {logs.length === 0 ? (
            <p className="text-[12px] text-zinc-400 dark:text-zinc-500 text-center py-4">
              Nenhum alimento registrado
            </p>
          ) : (
            <ul>
              {logs.map((log) => (
                <li
                  key={log.id}
                  className="flex items-center gap-3 px-5 py-3 border-b border-zinc-50 dark:border-zinc-800/40 last:border-0"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] text-zinc-800 dark:text-zinc-200 truncate font-medium">
                      {log.food_name}
                    </p>
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
          )}

          <button
            onClick={onAdd}
            className="w-full flex items-center gap-2 px-5 py-3.5 text-[13px] text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50/50 dark:hover:bg-emerald-950/20 transition-colors font-medium"
          >
            <Plus size={13} strokeWidth={2.5} />
            Adicionar alimento
          </button>
        </div>
      )}
    </div>
  );
}
