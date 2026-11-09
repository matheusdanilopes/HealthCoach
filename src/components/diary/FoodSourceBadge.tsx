'use client';

import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { FoodSource } from '@/lib/nutrition/validation';

const STYLES: Record<FoodSource, { label: string; title: string; cls: string }> = {
  taco: {
    label: 'TACO',
    title: 'kcal e macros calculados pela TACO (4ª edição)',
    cls: 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-100 dark:border-emerald-900/40 text-emerald-700 dark:text-emerald-400',
  },
  rotulo: {
    label: 'Rótulo',
    title: 'kcal e macros calculados pelo rótulo que você salvou',
    cls: 'bg-sky-50 dark:bg-sky-950/40 border-sky-100 dark:border-sky-900/40 text-sky-700 dark:text-sky-400',
  },
  estimado: {
    label: 'Estimado',
    title: 'Estimativa da IA — alimento não encontrado na TACO nem nos seus rótulos',
    cls: 'bg-amber-50 dark:bg-amber-950/40 border-amber-100 dark:border-amber-900/40 text-amber-700 dark:text-amber-400',
  },
  manual: {
    label: 'Manual',
    title: 'Valores informados por você',
    cls: 'bg-zinc-100 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400',
  },
};

const chip = 'inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full border text-[9px] font-semibold leading-none flex-shrink-0';

/** Selo da origem das kcal (TACO, rótulo, estimado, manual). */
export function FoodSourceBadge({ source }: { source?: FoodSource | null }) {
  if (!source) return null;
  const s = STYLES[source];
  return <span title={s.title} className={cn(chip, s.cls)}>{s.label}</span>;
}

/** Selo de "revisar" para itens com needs_review. */
export function ReviewBadge({ title }: { title?: string }) {
  return (
    <span
      title={title ?? 'Valores a revisar'}
      className={cn(chip, 'bg-amber-100 dark:bg-amber-900/40 border-amber-200 dark:border-amber-800/60 text-amber-800 dark:text-amber-300')}
    >
      <AlertTriangle size={8} />
      Revisar
    </span>
  );
}

/** Lista dos erros/avisos da validação de um item. */
export function ValidationNotes({ issues }: { issues?: { severity: 'error' | 'warning'; message: string }[] }) {
  if (!issues?.length) return null;
  return (
    <ul className="flex flex-col gap-1 mt-1.5">
      {issues.map((i, k) => (
        <li
          key={k}
          className={cn(
            'flex items-start gap-1 text-[11px] leading-snug',
            i.severity === 'error' ? 'text-red-600 dark:text-red-400' : 'text-amber-700 dark:text-amber-400',
          )}
        >
          <AlertTriangle size={10} className="mt-[2px] flex-shrink-0" />
          <span>{i.message}</span>
        </li>
      ))}
    </ul>
  );
}
