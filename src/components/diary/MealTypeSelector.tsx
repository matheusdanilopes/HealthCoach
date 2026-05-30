'use client';

import { Sparkles } from 'lucide-react';
import { cn, getMealLabel, getMealIcon } from '@/lib/utils';
import type { MealType } from '@/types';

export const ALL_MEAL_TYPES: MealType[] = [
  'breakfast',
  'morning_snack',
  'lunch',
  'afternoon_snack',
  'dinner',
  'supper',
  'pre_workout',
  'post_workout',
  'other',
];

interface MealTypeSelectorProps {
  value: MealType | null;
  onChange: (meal: MealType) => void;
  suggestedType?: MealType;
  error?: boolean;
  errorMessage?: string;
}

export default function MealTypeSelector({
  value,
  onChange,
  suggestedType,
  error,
  errorMessage = 'Selecione a refeição para continuar.',
}: MealTypeSelectorProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className={cn(
        'rounded-2xl border p-2 transition-all duration-200',
        error
          ? 'border-red-300 dark:border-red-700/60 bg-red-50/40 dark:bg-red-950/20 ring-2 ring-red-200/50 dark:ring-red-900/30'
          : 'border-zinc-200 dark:border-zinc-700/60 bg-zinc-50/50 dark:bg-zinc-800/30'
      )}>
        <div className="grid grid-cols-3 gap-1.5">
          {ALL_MEAL_TYPES.map((meal) => {
            const isSelected = value === meal;
            const isSuggested = suggestedType === meal && !isSelected;
            return (
              <button
                key={meal}
                type="button"
                onClick={() => onChange(meal)}
                className={cn(
                  'relative flex flex-col items-center gap-1 py-2.5 px-1 rounded-xl border text-[10px] font-semibold transition-all duration-150 active:scale-95',
                  isSelected
                    ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-700/60 text-emerald-700 dark:text-emerald-400 shadow-sm ring-1 ring-emerald-200 dark:ring-emerald-800/40'
                    : isSuggested
                    ? 'bg-amber-50/70 dark:bg-amber-950/25 border-amber-200 dark:border-amber-800/50 text-amber-700 dark:text-amber-400'
                    : 'bg-white dark:bg-zinc-800/50 border-zinc-200/80 dark:border-zinc-700/40 text-zinc-500 dark:text-zinc-400 hover:border-zinc-300 dark:hover:border-zinc-600 hover:bg-zinc-50 dark:hover:bg-zinc-800/70'
                )}
              >
                {isSuggested && (
                  <Sparkles
                    size={7}
                    className="absolute top-1.5 right-1.5 text-amber-400 dark:text-amber-500"
                  />
                )}
                <span className="text-[17px] leading-none">{getMealIcon(meal)}</span>
                <span className="leading-tight text-center">{getMealLabel(meal)}</span>
              </button>
            );
          })}
        </div>

        {suggestedType && !value && (
          <p className="text-[10px] text-amber-600 dark:text-amber-400 text-center mt-1.5 flex items-center justify-center gap-1">
            <Sparkles size={9} />
            Sugestão pelo horário — toque para confirmar
          </p>
        )}
      </div>

      {error && (
        <p className="text-[11px] text-red-500 dark:text-red-400 font-medium flex items-center gap-1 px-1">
          <span>⚠</span>
          {errorMessage}
        </p>
      )}
    </div>
  );
}
