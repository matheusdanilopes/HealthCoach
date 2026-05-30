'use client';

import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import SmartMealPrepWidget from '@/components/meal-prep/SmartMealPrepWidget';
import MealPrepHistory from '@/components/meal-prep/MealPrepHistory';

export default function MarmitasClient() {
  return (
    <div className="flex flex-col gap-4 pt-8 pb-6 animate-fade-in">
      <Link
        href="/saude"
        className="flex items-center gap-1 text-[13px] text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors w-fit -mt-2"
      >
        <ChevronLeft size={15} />
        Saúde
      </Link>

      <div>
        <h1 className="text-[22px] font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">
          Marmitas Inteligentes
        </h1>
        <p className="text-[13px] text-zinc-400 dark:text-zinc-500 mt-0.5 font-medium">
          Planeje suas refeições da semana com IA
        </p>
      </div>

      <SmartMealPrepWidget />
      <MealPrepHistory />
    </div>
  );
}
