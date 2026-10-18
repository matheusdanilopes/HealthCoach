'use client';

import { useState } from 'react';
import { ChevronDown, ExternalLink, TrendingUp, TriangleAlert } from 'lucide-react';
import Card from '@/components/ui/Card';
import { cn } from '@/lib/utils';
import { formatKg, suggestNext, youtubeSearchUrl, type ExerciseHistory, type PlanExercise } from '@/lib/training';

export function targetText(ex: PlanExercise): string {
  return `${ex.sets} × ${ex.reps.replace('-', '–')}${ex.timed ? 's' : ''}`;
}

export default function ExerciseCard({
  exercise: ex,
  index,
  history,
}: {
  exercise: PlanExercise;
  index: number;
  history?: ExerciseHistory;
}) {
  const [open, setOpen] = useState(false);
  const suggestion = suggestNext(ex, history);

  return (
    <Card className="overflow-hidden">
      <button type="button" onClick={() => setOpen((v) => !v)} className="w-full p-4 text-left">
        <div className="flex items-start gap-3">
          <span className="h-7 w-7 flex-shrink-0 rounded-full bg-emerald-600 text-white text-[12px] font-bold flex items-center justify-center">
            {index + 1}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-semibold text-zinc-900 dark:text-zinc-50 leading-snug">{ex.name}</p>
            {ex.muscles && <p className="text-[11.5px] text-zinc-500 dark:text-zinc-400 mt-0.5">{ex.muscles}</p>}
            <div className="mt-2 flex flex-wrap gap-1.5">
              <span className="rounded-full bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
                {targetText(ex)}
              </span>
              <span className="rounded-full bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 text-[11px] font-medium text-zinc-600 dark:text-zinc-300">
                Descanso {ex.restSeconds}s
              </span>
              {ex.equipment && (
                <span className="rounded-full bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 text-[11px] font-medium text-zinc-600 dark:text-zinc-300">
                  {ex.equipment}
                </span>
              )}
              {suggestion.loadKg != null && (
                <span className="rounded-full bg-sky-50 dark:bg-sky-950/40 px-2 py-0.5 text-[11px] font-semibold text-sky-700 dark:text-sky-300">
                  Hoje: {formatKg(suggestion.loadKg)}kg
                </span>
              )}
            </div>
          </div>
          <ChevronDown className={cn('w-4 h-4 mt-1 flex-shrink-0 text-zinc-400 transition-transform', open && 'rotate-180')} />
        </div>
      </button>

      {open && (
        <div className="px-4 pb-4 flex flex-col gap-3 border-t border-zinc-100 dark:border-zinc-800/80 pt-3 animate-fade-in">
          {suggestion.hint && (
            <p className="flex gap-2 rounded-xl bg-sky-50 dark:bg-sky-950/30 p-2.5 text-[12px] leading-relaxed text-sky-800 dark:text-sky-300">
              <TrendingUp className="w-3.5 h-3.5 flex-shrink-0 mt-[2px]" />
              {suggestion.hint}
            </p>
          )}

          {ex.howTo.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500 mb-1.5">Como fazer</p>
              <ol className="flex flex-col gap-1.5">
                {ex.howTo.map((step, i) => (
                  <li key={i} className="flex gap-2 text-[13px] leading-relaxed text-zinc-700 dark:text-zinc-300">
                    <span className="text-emerald-600 dark:text-emerald-400 font-bold tabular-nums">{i + 1}.</span>
                    {step}
                  </li>
                ))}
              </ol>
            </div>
          )}

          {ex.load && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500 mb-1">Carga</p>
              <p className="text-[13px] leading-relaxed text-zinc-700 dark:text-zinc-300">{ex.load}</p>
            </div>
          )}

          {ex.mistakes.length > 0 && (
            <div className="rounded-xl bg-amber-50 dark:bg-amber-950/30 p-2.5">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400 mb-1">
                <TriangleAlert className="w-3 h-3" /> Evite
              </p>
              <ul className="flex flex-col gap-1">
                {ex.mistakes.map((m, i) => (
                  <li key={i} className="text-[12.5px] leading-relaxed text-amber-900 dark:text-amber-200">• {m}</li>
                ))}
              </ul>
            </div>
          )}

          {(ex.easier || ex.harder) && (
            <div className="grid grid-cols-2 gap-2">
              {ex.easier && (
                <div className="rounded-xl bg-zinc-50 dark:bg-zinc-800/40 p-2.5">
                  <p className="text-[10.5px] font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">Mais fácil</p>
                  <p className="text-[12.5px] leading-snug text-zinc-700 dark:text-zinc-300 mt-0.5">{ex.easier}</p>
                </div>
              )}
              {ex.harder && (
                <div className="rounded-xl bg-zinc-50 dark:bg-zinc-800/40 p-2.5">
                  <p className="text-[10.5px] font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">Mais difícil</p>
                  <p className="text-[12.5px] leading-snug text-zinc-700 dark:text-zinc-300 mt-0.5">{ex.harder}</p>
                </div>
              )}
            </div>
          )}

          <a
            href={youtubeSearchUrl(ex.name)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 self-start text-[12px] font-semibold text-emerald-600 dark:text-emerald-400"
          >
            <ExternalLink className="w-3.5 h-3.5" /> Ver vídeos de execução
          </a>
        </div>
      )}
    </Card>
  );
}
