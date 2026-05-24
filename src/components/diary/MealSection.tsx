'use client';

import { useState } from 'react';
import { Plus, Trash2, ChevronDown } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { getMealLabel, getMealIcon } from '@/lib/utils';
import type { FoodLog, MealType } from '@/types';

interface MealSectionProps {
  mealType: MealType;
  logs: FoodLog[];
  onAdd: () => void;
  onDelete: (id: number) => void;
}

export default function MealSection({ mealType, logs, onAdd, onDelete }: MealSectionProps) {
  const [expanded, setExpanded] = useState(true);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const totalCal = logs.reduce((sum, l) => sum + l.calories, 0);

  async function handleDelete(id: number) {
    setDeletingId(id);
    const supabase = createClient();
    await supabase.from('food_logs').delete().eq('id', id);
    onDelete(id);
    setDeletingId(null);
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 p-4 hover:bg-zinc-800/50 transition-colors"
      >
        <span className="text-lg">{getMealIcon(mealType)}</span>
        <div className="flex-1 text-left">
          <p className="text-sm font-medium text-zinc-200">{getMealLabel(mealType)}</p>
          <p className="text-xs text-zinc-500">{logs.length} item{logs.length !== 1 ? 's' : ''}</p>
        </div>
        <span className="text-sm font-semibold text-zinc-300 mr-2">{totalCal} kcal</span>
        <ChevronDown
          size={16}
          className={`text-zinc-500 transition-transform duration-200 ${expanded ? '' : '-rotate-90'}`}
        />
      </button>

      {expanded && (
        <div className="border-t border-zinc-800">
          {logs.length === 0 ? (
            <p className="text-sm text-zinc-600 text-center py-4">Nenhum alimento registrado</p>
          ) : (
            <ul>
              {logs.map((log) => (
                <li
                  key={log.id}
                  className="flex items-center gap-3 px-4 py-3 border-b border-zinc-800/50 last:border-0 group"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-zinc-200 truncate">{log.food_name}</p>
                    {(log.protein || log.carbs || log.fat) && (
                      <p className="text-xs text-zinc-600 mt-0.5">
                        {log.protein != null && `P: ${log.protein}g`}
                        {log.carbs != null && ` · C: ${log.carbs}g`}
                        {log.fat != null && ` · G: ${log.fat}g`}
                      </p>
                    )}
                  </div>
                  <span className="text-sm font-medium text-zinc-400">{log.calories} kcal</span>
                  <button
                    onClick={() => handleDelete(log.id)}
                    disabled={deletingId === log.id}
                    className="opacity-0 group-hover:opacity-100 h-7 w-7 rounded-lg bg-red-500/10 hover:bg-red-500/20 flex items-center justify-center text-red-400 transition-all"
                  >
                    <Trash2 size={13} />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <button
            onClick={onAdd}
            className="w-full flex items-center gap-2 px-4 py-3 text-sm text-emerald-500 hover:bg-emerald-500/5 transition-colors"
          >
            <Plus size={16} /> Adicionar alimento
          </button>
        </div>
      )}
    </div>
  );
}
