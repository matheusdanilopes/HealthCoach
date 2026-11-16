import { memo } from 'react';
import Link from 'next/link';
import { TrendingDown, TrendingUp, Minus, Settings2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { WeightProjection } from '@/lib/weight-projection';

interface WeightProjectionCardProps {
  projection: WeightProjection | null;
  windowDays: number;
}

const kg = (n: number, digits = 1) =>
  n.toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits });

const signed = (n: number, digits = 1) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${kg(Math.abs(n), digits)}`;

const DIRECTION = {
  loss:   { label: 'Perda de peso estimada', icon: TrendingDown, tone: 'text-emerald-600 dark:text-emerald-400', chip: 'bg-emerald-50 dark:bg-emerald-950/40' },
  gain:   { label: 'Ganho de peso estimado', icon: TrendingUp,   tone: 'text-orange-500 dark:text-orange-400',   chip: 'bg-orange-50 dark:bg-orange-950/40' },
  stable: { label: 'Peso estável',           icon: Minus,        tone: 'text-zinc-600 dark:text-zinc-300',       chip: 'bg-zinc-100 dark:bg-zinc-800' },
} as const;

const CONFIDENCE = {
  high:   { label: 'Confiança alta',  dot: 'bg-emerald-500' },
  medium: { label: 'Confiança média', dot: 'bg-amber-500' },
  low:    { label: 'Confiança baixa', dot: 'bg-zinc-400' },
} as const;

function Header({ windowDays }: { windowDays: number }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <h2 className="text-[15px] font-bold text-zinc-900 dark:text-zinc-50 tracking-tight">Projeção de peso</h2>
      <Link
        href="/profile"
        className="flex items-center gap-1 text-[11px] font-semibold tabular-nums text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
        aria-label={`Baseado nos últimos ${windowDays} dias. Alterar período no perfil`}
      >
        Últimos {windowDays} dias
        <Settings2 className="w-3 h-3" />
      </Link>
    </div>
  );
}

export default memo(function WeightProjectionCard({ projection, windowDays }: WeightProjectionCardProps) {
  const shell =
    'rounded-3xl border border-zinc-200/60 dark:border-zinc-800/60 bg-white dark:bg-zinc-900/80 shadow-[0_4px_24px_-8px_rgb(0,0,0,0.08)] dark:shadow-none';

  if (!projection) {
    return (
      <section aria-label="Projeção de peso" className={cn(shell, 'p-5 flex flex-col gap-2')}>
        <Header windowDays={windowDays} />
        <p className="text-[12px] text-zinc-500 dark:text-zinc-400">
          Registre suas refeições completas por pelo menos 3 dias (ou pese-se em dias diferentes) para ver
          quanto você deve ganhar ou perder na próxima semana.
        </p>
      </section>
    );
  }

  const dir = DIRECTION[projection.direction];
  const conf = CONFIDENCE[projection.confidence];
  const Icon = dir.icon;

  return (
    <section aria-label="Projeção de peso" className={cn(shell, 'overflow-hidden')}>
      <div className="p-5 pb-4 flex flex-col gap-3">
        <Header windowDays={windowDays} />

        <div className="flex items-center gap-3">
          <span className={cn('h-12 w-12 flex-shrink-0 rounded-2xl flex items-center justify-center', dir.chip)}>
            <Icon className={cn('w-6 h-6', dir.tone)} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-medium text-zinc-500 dark:text-zinc-400">{dir.label}</p>
            <p className="flex items-baseline gap-1.5 leading-none mt-1">
              <span className={cn('text-[28px] font-bold tabular-nums tracking-tight', dir.tone)}>
                {projection.direction === 'stable' ? '≈ 0' : signed(projection.changeKg, 2)}
              </span>
              <span className="text-[13px] font-semibold text-zinc-500 dark:text-zinc-400">kg em 7 dias</span>
            </p>
          </div>
          {projection.projectedWeight != null && (
            <div className="flex-shrink-0 text-right leading-none">
              <span className="block text-[10px] font-medium text-zinc-400 dark:text-zinc-500">Peso previsto</span>
              <span className="block text-[15px] font-bold tabular-nums text-zinc-800 dark:text-zinc-100 mt-1">
                {kg(projection.projectedWeight)} kg
              </span>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl bg-zinc-50/80 dark:bg-zinc-800/40 px-3 py-2.5">
            <p className="text-[10px] font-medium text-zinc-400 dark:text-zinc-500">Balanço calórico</p>
            {projection.avgBalanceKcal != null ? (
              <p className="text-[13px] font-semibold tabular-nums text-zinc-800 dark:text-zinc-100 mt-0.5">
                {projection.avgBalanceKcal > 0 ? '+' : projection.avgBalanceKcal < 0 ? '−' : ''}
                {Math.abs(projection.avgBalanceKcal).toLocaleString('pt-BR')} kcal/dia
              </p>
            ) : (
              <p className="text-[12px] text-zinc-400 dark:text-zinc-500 mt-0.5">Sem dados suficientes</p>
            )}
            <p className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-0.5 tabular-nums">
              {projection.loggedDays}/{projection.windowDays} dias registrados
            </p>
          </div>
          <div className="rounded-xl bg-zinc-50/80 dark:bg-zinc-800/40 px-3 py-2.5">
            <p className="text-[10px] font-medium text-zinc-400 dark:text-zinc-500">Tendência da balança</p>
            {projection.trendChangeKg != null ? (
              <p className="text-[13px] font-semibold tabular-nums text-zinc-800 dark:text-zinc-100 mt-0.5">
                {signed(projection.trendChangeKg, 2)} kg/sem
              </p>
            ) : (
              <p className="text-[12px] text-zinc-400 dark:text-zinc-500 mt-0.5">Pese-se mais vezes</p>
            )}
            <p className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-0.5 tabular-nums">
              {projection.weighIns} {projection.weighIns === 1 ? 'pesagem' : 'pesagens'}
            </p>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 px-5 py-3 border-t border-zinc-100 dark:border-zinc-800/80 bg-zinc-50/60 dark:bg-zinc-900/40">
        <span className={cn('h-1.5 w-1.5 rounded-full flex-shrink-0', conf.dot)} aria-hidden />
        <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
          <span className="font-semibold text-zinc-700 dark:text-zinc-200">{conf.label}</span>
          {projection.signalsAgree === true && ' · calorias e balança apontam na mesma direção'}
          {projection.signalsAgree === false && ' · calorias e balança divergem, confira seus registros'}
          {projection.signalsAgree === null && projection.avgBalanceKcal == null && ' · só pela balança'}
          {projection.signalsAgree === null && projection.trendChangeKg == null && ' · só pelas calorias'}
        </p>
      </div>
    </section>
  );
});
