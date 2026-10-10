'use client';

import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Brain, Sparkles, RefreshCw, AlertCircle, TriangleAlert, CircleCheck, Lightbulb,
  Compass, ListChecks, Flame, Beef, Dumbbell, Droplets, Scale, CalendarCheck,
  TrendingDown, TrendingUp, Target, Info,
} from 'lucide-react';
import Card from '@/components/ui/Card';
import { cn } from '@/lib/utils';
import type { CoachGoal, CoachSnapshot } from '@/lib/coach-data';
import type { CoachAnalysis, CoachImpact } from '@/types';

interface StoredAnalysis {
  goal: CoachGoal;
  generatedAt: string;
  analysis: CoachAnalysis;
}

const GOAL_OPTS: { value: CoachGoal; label: string; desc: string; icon: typeof Target }[] = [
  { value: 'emagrecimento',  label: 'Perder peso',     desc: 'Reduzir gordura',            icon: TrendingDown },
  { value: 'ganho_muscular', label: 'Ganhar músculo',  desc: 'Hipertrofia',                icon: Dumbbell },
  { value: 'recomposicao',   label: 'Recomposição',    desc: 'Menos gordura, mais músculo', icon: Target },
];

const IMPACT_STYLE: Record<CoachImpact, { label: string; className: string }> = {
  alto:  { label: 'Impacto alto',  className: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400' },
  medio: { label: 'Impacto médio', className: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400' },
  baixo: { label: 'Impacto baixo', className: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400' },
};

const LOADING_STEPS = [
  'Lendo seus registros…',
  'Identificando padrões de comportamento…',
  'Comparando com o seu objetivo…',
  'Montando sua estratégia…',
];

const storageKey = (userId: string) => `healthcoach:coach-analysis:${userId}`;

function SectionTitle({ icon: Icon, title, tone }: { icon: typeof Target; title: string; tone: string }) {
  return (
    <div className="flex items-center gap-2 px-1">
      <span className={cn('h-7 w-7 rounded-xl flex items-center justify-center', tone)}>
        <Icon className="w-3.5 h-3.5" />
      </span>
      <h2 className="text-[15px] font-bold text-zinc-900 dark:text-zinc-50 tracking-tight">{title}</h2>
    </div>
  );
}

function StatTile({
  icon: Icon, label, value, hint, tone,
}: { icon: typeof Target; label: string; value: string; hint?: string; tone: string }) {
  return (
    <div className="rounded-2xl bg-zinc-50 dark:bg-zinc-800/40 p-3 min-w-0">
      <div className="flex items-center gap-1.5">
        <Icon className={cn('w-3.5 h-3.5 flex-shrink-0', tone)} />
        <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400 truncate">{label}</span>
      </div>
      <p className="mt-1 text-[16px] font-bold tabular-nums text-zinc-900 dark:text-zinc-50 leading-tight truncate">{value}</p>
      {hint && <p className="text-[10px] text-zinc-400 dark:text-zinc-500 truncate">{hint}</p>}
    </div>
  );
}

function ScoreRing({ score }: { score: number }) {
  const r = 30;
  const c = 2 * Math.PI * r;
  const color = score >= 70 ? 'text-emerald-500' : score >= 45 ? 'text-amber-500' : 'text-rose-500';
  return (
    <div className="relative h-[76px] w-[76px] flex-shrink-0">
      <svg viewBox="0 0 76 76" className="h-full w-full -rotate-90">
        <circle cx="38" cy="38" r={r} strokeWidth="7" className="fill-none stroke-zinc-100 dark:stroke-zinc-800" />
        <circle
          cx="38" cy="38" r={r} strokeWidth="7" strokeLinecap="round"
          className={cn('fill-none stroke-current transition-all duration-700', color)}
          strokeDasharray={c}
          strokeDashoffset={c - (score / 100) * c}
        />
      </svg>
      <span className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        <span className="text-[20px] font-bold tabular-nums text-zinc-900 dark:text-zinc-50">{score}</span>
        <span className="text-[9px] font-medium text-zinc-400 mt-0.5">/100</span>
      </span>
    </div>
  );
}

export default function CoachClient({ userId, snapshot }: { userId: string; snapshot: CoachSnapshot }) {
  const [goal, setGoal] = useState<CoachGoal>(snapshot.suggestedGoal);
  const [result, setResult] = useState<StoredAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // The last analysis is kept on the device so reopening the screen doesn't
  // need a new AI call. It can only be read after mount (no localStorage on
  // the server), hence the effect.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey(userId));
      if (!raw) return;
      const saved = JSON.parse(raw) as StoredAnalysis;
      if (saved?.analysis) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setResult(saved);
        setGoal(saved.goal);
      }
    } catch {
      // Ignore unavailable or corrupted storage.
    }
  }, [userId]);

  useEffect(() => {
    if (!loading) return;
    const id = setInterval(() => setLoadingStep((s) => Math.min(s + 1, LOADING_STEPS.length - 1)), 3500);
    return () => clearInterval(id);
  }, [loading]);

  async function runAnalysis() {
    setLoading(true);
    setLoadingStep(0);
    setError(null);
    try {
      const res = await fetch('/api/coach/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goal }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.analysis) {
        setError(data?.error ?? 'Não foi possível gerar a análise. Tente novamente.');
        return;
      }
      const stored: StoredAnalysis = { goal: data.goal, generatedAt: data.generatedAt, analysis: data.analysis };
      setResult(stored);
      try {
        localStorage.setItem(storageKey(userId), JSON.stringify(stored));
      } catch {
        // Storage full or blocked — the result still shows for this visit.
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch {
      setError('Falha de conexão. Verifique sua internet e tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  const { nutrition: n, training: t, hydration: h, body: b, profile: p } = snapshot;
  const lowData = n.daysLogged < 7;
  const analysis = result?.analysis;
  const resultGoal = GOAL_OPTS.find((g) => g.value === result?.goal);

  const weightValue = b.weightChange != null
    ? `${b.weightChange > 0 ? '+' : ''}${b.weightChange.toLocaleString('pt-BR')} kg`
    : b.latestWeight != null ? `${b.latestWeight.toLocaleString('pt-BR')} kg` : '—';
  const weightHint = b.weightChange != null
    ? `em ${b.weightChangeDays} dias`
    : b.latestWeight != null ? 'peso atual' : 'sem pesagens';

  return (
    <div className="flex flex-col gap-4 pt-6 pb-6 animate-fade-in">

      {/* ── Header ── */}
      <header className="flex items-center gap-3 px-1">
        <span className="h-11 w-11 flex-shrink-0 rounded-2xl bg-gradient-to-br from-violet-500 to-emerald-600 flex items-center justify-center shadow-lg shadow-violet-500/20">
          <Brain className="w-5 h-5 text-white" />
        </span>
        <div className="min-w-0">
          <h1 className="text-[22px] font-bold text-zinc-900 dark:text-zinc-50 leading-tight tracking-tight">Coach IA</h1>
          <p className="text-[12px] text-zinc-500 dark:text-zinc-400">
            Análise do seu comportamento para chegar ao seu objetivo
          </p>
        </div>
      </header>

      {/* ── Result ── */}
      {analysis && result && !loading && (
        <div className="flex flex-col gap-4 animate-fade-in">
          <Card className="p-4">
            <div className="flex items-center gap-4">
              {analysis.score != null && <ScoreRing score={analysis.score} />}
              <div className="min-w-0">
                <p className="text-[11px] font-medium text-zinc-400 dark:text-zinc-500">
                  {format(new Date(result.generatedAt), "d 'de' MMM 'às' HH:mm", { locale: ptBR })}
                  {resultGoal && ` · ${resultGoal.label}`}
                </p>
                {analysis.scoreLabel && (
                  <p className="text-[17px] font-bold text-zinc-900 dark:text-zinc-50 leading-tight mt-0.5">
                    {analysis.scoreLabel}
                  </p>
                )}
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">Aderência ao objetivo</p>
              </div>
            </div>
            {analysis.summary && (
              <p className="mt-3 text-[13.5px] leading-relaxed text-zinc-700 dark:text-zinc-300">{analysis.summary}</p>
            )}
          </Card>

          {analysis.mistakes.length > 0 && (
            <section className="flex flex-col gap-2.5">
              <SectionTitle icon={TriangleAlert} title="Onde você está errando" tone="bg-rose-50 text-rose-500 dark:bg-rose-950/40" />
              {analysis.mistakes.map((m, i) => (
                <Card key={i} className="p-4 border-l-4 border-l-rose-400 dark:border-l-rose-500/70">
                  <p className="text-[14px] font-semibold text-zinc-900 dark:text-zinc-50">{m.title}</p>
                  {m.detail && <p className="mt-1 text-[13px] leading-relaxed text-zinc-600 dark:text-zinc-400">{m.detail}</p>}
                  {m.evidence && (
                    <p className="mt-2 inline-flex items-start gap-1.5 rounded-lg bg-rose-50 dark:bg-rose-950/30 px-2 py-1 text-[11.5px] text-rose-700 dark:text-rose-300">
                      <Info className="w-3 h-3 mt-[2px] flex-shrink-0" />
                      {m.evidence}
                    </p>
                  )}
                </Card>
              ))}
            </section>
          )}

          {analysis.strengths.length > 0 && (
            <section className="flex flex-col gap-2.5">
              <SectionTitle icon={CircleCheck} title="O que está funcionando" tone="bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40" />
              <Card className="divide-y divide-zinc-100 dark:divide-zinc-800/80">
                {analysis.strengths.map((s, i) => (
                  <div key={i} className="p-4">
                    <p className="text-[14px] font-semibold text-zinc-900 dark:text-zinc-50">{s.title}</p>
                    {s.detail && <p className="mt-1 text-[13px] leading-relaxed text-zinc-600 dark:text-zinc-400">{s.detail}</p>}
                  </div>
                ))}
              </Card>
            </section>
          )}

          {analysis.improvements.length > 0 && (
            <section className="flex flex-col gap-2.5">
              <SectionTitle icon={Lightbulb} title="Onde melhorar" tone="bg-amber-50 text-amber-500 dark:bg-amber-950/40" />
              {analysis.improvements.map((m, i) => (
                <Card key={i} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-[14px] font-semibold text-zinc-900 dark:text-zinc-50">{m.title}</p>
                    <span className={cn('flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold', IMPACT_STYLE[m.impact].className)}>
                      {IMPACT_STYLE[m.impact].label}
                    </span>
                  </div>
                  {m.action && <p className="mt-1 text-[13px] leading-relaxed text-zinc-600 dark:text-zinc-400">{m.action}</p>}
                </Card>
              ))}
            </section>
          )}

          {(analysis.strategy.headline || analysis.strategy.calories) && (
            <section className="flex flex-col gap-2.5">
              <SectionTitle icon={Compass} title="Sua estratégia" tone="bg-violet-50 text-violet-500 dark:bg-violet-950/40" />
              <Card className="p-4 flex flex-col gap-3">
                {analysis.strategy.headline && (
                  <p className="text-[14px] font-semibold leading-snug text-zinc-900 dark:text-zinc-50">{analysis.strategy.headline}</p>
                )}
                {[
                  { icon: Flame,    label: 'Calorias', text: analysis.strategy.calories, tone: 'text-orange-500' },
                  { icon: Beef,     label: 'Proteína', text: analysis.strategy.protein,  tone: 'text-rose-500' },
                  { icon: Dumbbell, label: 'Treino',   text: analysis.strategy.training, tone: 'text-sky-500' },
                ].filter((r) => r.text).map(({ icon: Icon, label, text, tone }) => (
                  <div key={label} className="flex gap-3">
                    <span className="h-8 w-8 flex-shrink-0 rounded-xl bg-zinc-50 dark:bg-zinc-800/60 flex items-center justify-center">
                      <Icon className={cn('w-4 h-4', tone)} />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">{label}</p>
                      <p className="text-[13px] leading-relaxed text-zinc-700 dark:text-zinc-300">{text}</p>
                    </div>
                  </div>
                ))}
                {analysis.strategy.habits.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {analysis.strategy.habits.map((hb, i) => (
                      <span key={i} className="rounded-full bg-violet-50 dark:bg-violet-950/40 px-2.5 py-1 text-[11.5px] font-medium text-violet-700 dark:text-violet-300">
                        {hb}
                      </span>
                    ))}
                  </div>
                )}
              </Card>
            </section>
          )}

          {analysis.nextSteps.length > 0 && (
            <section className="flex flex-col gap-2.5">
              <SectionTitle icon={ListChecks} title="Próximos 7 dias" tone="bg-sky-50 text-sky-500 dark:bg-sky-950/40" />
              <Card className="p-4">
                <ol className="flex flex-col gap-2.5">
                  {analysis.nextSteps.map((step, i) => (
                    <li key={i} className="flex gap-3">
                      <span className="h-6 w-6 flex-shrink-0 rounded-full bg-emerald-600 text-white text-[11px] font-bold flex items-center justify-center">
                        {i + 1}
                      </span>
                      <p className="text-[13px] leading-relaxed text-zinc-700 dark:text-zinc-300 pt-0.5">{step}</p>
                    </li>
                  ))}
                </ol>
              </Card>
            </section>
          )}

          {analysis.closing && (
            <div className="rounded-2xl bg-gradient-to-br from-emerald-600 to-emerald-700 p-4 text-white shadow-lg shadow-emerald-600/20">
              <p className="text-[13.5px] leading-relaxed font-medium">{analysis.closing}</p>
            </div>
          )}
        </div>
      )}

      {/* ── Data preview + goal + action ── */}
      <Card className="p-4 flex flex-col gap-4">
        <div>
          <p className="text-[14px] font-semibold text-zinc-900 dark:text-zinc-50">
            {analysis ? 'Gerar nova análise' : `${p.firstName}, vamos entender seus hábitos?`}
          </p>
          <p className="mt-0.5 text-[12px] text-zinc-500 dark:text-zinc-400">
            Seus dados dos últimos {snapshot.periodDays} dias que serão analisados:
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <StatTile icon={CalendarCheck} label="Dias registrados" value={`${n.daysLogged}/${snapshot.periodDays}`}
            hint={n.currentStreak > 0 ? `${n.currentStreak} dias seguidos` : 'sequência zerada'} tone="text-emerald-500" />
          <StatTile icon={Flame} label="Calorias/dia" value={n.daysLogged ? `${n.avgCalories.toLocaleString('pt-BR')}` : '—'}
            hint={p.targetCalories ? `meta ${p.targetCalories.toLocaleString('pt-BR')} kcal` : undefined} tone="text-orange-500" />
          <StatTile icon={Beef} label="Proteína/dia" value={n.daysLogged ? `${n.avgProtein} g` : '—'}
            hint={p.targetProtein ? `meta ${p.targetProtein} g` : undefined} tone="text-rose-500" />
          <StatTile icon={Dumbbell} label="Treinos/semana" value={t.perWeek.toLocaleString('pt-BR')}
            hint={`${t.activeDays} dias com treino`} tone="text-sky-500" />
          <StatTile icon={Droplets} label="Água/dia" value={h.daysLogged ? `${(h.avgMl / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} L` : '—'}
            hint={`meta ${(p.targetWater / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} L`} tone="text-cyan-500" />
          <StatTile icon={b.weightChange != null && b.weightChange > 0 ? TrendingUp : Scale} label="Peso" value={weightValue}
            hint={weightHint} tone="text-violet-500" />
        </div>

        {lowData && (
          <div className="flex gap-2 rounded-xl bg-amber-50 dark:bg-amber-950/30 p-3 text-[12px] leading-relaxed text-amber-800 dark:text-amber-300">
            <Info className="w-4 h-4 flex-shrink-0 mt-px" />
            <p>Você tem poucos dias registrados. A análise funciona, mas fica mais precisa com pelo menos uma semana de registros.</p>
          </div>
        )}

        <div>
          <p className="text-[12px] font-semibold text-zinc-700 dark:text-zinc-300 mb-2">Qual é o seu objetivo?</p>
          <div className="grid grid-cols-3 gap-2">
            {GOAL_OPTS.map(({ value, label, desc, icon: Icon }) => {
              const active = goal === value;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => setGoal(value)}
                  disabled={loading}
                  className={cn(
                    'flex flex-col items-center gap-1 rounded-2xl border px-2 py-3 text-center transition-all duration-150 active:scale-[0.97]',
                    active
                      ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30'
                      : 'border-zinc-200/70 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700'
                  )}
                >
                  <Icon className={cn('w-4 h-4', active ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-400')} />
                  <span className={cn('text-[12px] font-semibold leading-tight', active ? 'text-emerald-700 dark:text-emerald-300' : 'text-zinc-700 dark:text-zinc-200')}>
                    {label}
                  </span>
                  <span className="text-[10px] leading-tight text-zinc-400 dark:text-zinc-500">{desc}</span>
                </button>
              );
            })}
          </div>
        </div>

        {error && (
          <div className="flex gap-2 rounded-xl bg-red-50 dark:bg-red-950/30 p-3 text-[12px] text-red-700 dark:text-red-300">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-px" />
            <p>{error}</p>
          </div>
        )}

        <button
          type="button"
          onClick={runAnalysis}
          disabled={loading}
          className="flex items-center justify-center gap-2 h-12 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white text-[14px] font-semibold shadow-lg shadow-emerald-600/25 transition-all duration-200 active:scale-[0.98] disabled:opacity-70 disabled:pointer-events-none"
        >
          {loading ? (
            <>
              <span className="h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
              {LOADING_STEPS[loadingStep]}
            </>
          ) : analysis ? (
            <><RefreshCw className="w-4 h-4" /> Analisar novamente</>
          ) : (
            <><Sparkles className="w-4 h-4" /> Analisar meu comportamento</>
          )}
        </button>

        <p className="text-[10.5px] leading-relaxed text-zinc-400 dark:text-zinc-500 text-center">
          A IA só é consultada quando você toca no botão. As orientações são educativas e não substituem
          o acompanhamento de nutricionista, educador físico ou médico.
        </p>
      </Card>
    </div>
  );
}
