// Telegram message builders (HTML parse mode).
//
// Every message carries the user's real numbers and one concrete next step —
// generic "remember to log" nudges were the main reason reminders got ignored.
//
// pick() is deterministic: same userId + date + seed → same variant, so headlines
// rotate day to day without randomness that is hard to debug.

import { escapeHtml } from '@/lib/telegram';
import type { DayStatus, UserTargets } from '@/lib/day-status';

function pick<T>(variants: T[], userId: string, seed: string, date: string): T {
  const str = userId + seed + date;
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  }
  return variants[Math.abs(h) % variants.length];
}

const int = (n: number) => Math.round(n).toLocaleString('pt-BR');
const liters = (ml: number) => `${(ml / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}L`;
const pct = (v: number, target: number) => (target > 0 ? Math.round((v / target) * 100) : 0);
const roundTo = (n: number, step: number) => Math.ceil(n / step) * step;

// ─── Daily metrics block (shared by summaries and /resumo) ───────────────────

type Metric = { key: 'water' | 'calories' | 'protein' | 'workout'; line: string; ok: boolean };

function dayMetrics(t: UserTargets, s: DayStatus): Metric[] {
  const metrics: Metric[] = [];

  const waterPct = pct(s.waterMl, t.waterMl);
  metrics.push({
    key:  'water',
    ok:   waterPct >= 100,
    line: `💧 Água: <b>${liters(s.waterMl)}</b> / ${liters(t.waterMl)} (${waterPct}%)`,
  });

  if (t.calories) {
    const net = s.consumedKcal - s.burnedKcal;
    const ratio = net / t.calories;
    const verdict = ratio > 1.1 ? ' — acima da meta' : ratio < 0.8 ? ' — abaixo da meta' : '';
    metrics.push({
      key:  'calories',
      ok:   ratio >= 0.8 && ratio <= 1.1,
      line: `🔥 Calorias: <b>${int(net)}</b> / ${int(t.calories)} kcal${verdict}`,
    });
  }

  if (t.protein) {
    metrics.push({
      key:  'protein',
      ok:   s.protein >= t.protein * 0.9,
      line: `🥩 Proteína: <b>${int(s.protein)}g</b> / ${int(t.protein)}g`,
    });
  }

  metrics.push({
    key:  'workout',
    ok:   s.hasWorkout,
    line: s.hasWorkout ? `💪 Treino: <b>${int(s.burnedKcal)} kcal</b> gastas` : '💪 Treino: nenhum registrado',
  });

  return metrics;
}

function metricsBlock(metrics: Metric[]): string {
  return metrics.map((m) => `${m.ok ? '✅' : '▫️'} ${m.line}`).join('\n');
}

const FOCUS_TIP: Record<Metric['key'], string> = {
  water:    'deixe uma garrafa por perto e beba um copo a cada refeição',
  calories: 'registre as refeições logo após comer para acompanhar o saldo',
  protein:  'inclua uma fonte de proteína em cada refeição (ovos, carne, iogurte, leguminosas)',
  workout:  'reserve 30 minutos para se mexer — até uma caminhada conta',
};

// ─── Morning (goals for today + yesterday recap) ──────────────────────────────

export function buildMorningMessage(t: UserTargets, yesterday: DayStatus, userId: string, date: string): string {
  const greeting = pick(['☀️ Bom dia', '🌅 Bom dia', '☀️ Começando o dia'], userId, 'morning', date);
  const lines = [`${greeting}, <b>${escapeHtml(t.firstName)}</b>!`, ''];

  const hadData = yesterday.consumedKcal > 0 || yesterday.waterMl > 0 || yesterday.hasWorkout;
  if (hadData) {
    const metrics = dayMetrics(t, yesterday);
    lines.push('<b>Ontem</b>', metricsBlock(metrics), '');
    const missed = metrics.find((m) => !m.ok);
    if (missed) lines.push(`🎯 Foco de hoje: ${FOCUS_TIP[missed.key]}.`, '');
  }

  const goals = [`💧 ${liters(t.waterMl)} de água`];
  if (t.calories) goals.push(`🔥 ${int(t.calories)} kcal`);
  if (t.protein) goals.push(`🥩 ${int(t.protein)}g de proteína`);
  lines.push(`<b>Metas de hoje:</b> ${goals.join(' · ')}`);
  lines.push('Comece com um copo de água agora 👇');

  return lines.join('\n');
}

// ─── Hydration (pace-based) ───────────────────────────────────────────────────

export type HydrationCtx = {
  totalMl: number;
  targetMl: number;
  expectedMl: number;       // where the user "should" be at this hour
  minSinceLast: number | null;
  hour: number;
};

export function buildHydrationMessage(t: UserTargets, ctx: HydrationCtx, userId: string, date: string): string {
  const { totalMl, targetMl, expectedMl, minSinceLast, hour } = ctx;
  const behind    = Math.max(0, expectedMl - totalMl);
  const remaining = Math.max(0, targetMl - totalMl);
  const suggest   = Math.min(roundTo(behind, 250), 750);
  const n = escapeHtml(t.firstName);

  const title = hour >= 18
    ? pick([`🌙 <b>${n}, reta final da hidratação</b>`, `🌙 <b>Ainda dá tempo, ${n}</b>`], userId, 'h-ev', date + hour)
    : pick([`💧 <b>Hora da água, ${n}</b>`, `💧 <b>Pausa para hidratar, ${n}</b>`, `💧 <b>${n}, bora de água?</b>`], userId, 'h', date + hour);

  const lines = [
    title,
    `Você está em <b>${liters(totalMl)}</b> de ${liters(targetMl)} (${pct(totalMl, targetMl)}%).`,
  ];
  if (minSinceLast !== null && minSinceLast >= 120) {
    lines.push(`Último registro há ${Math.floor(minSinceLast / 60)}h.`);
  }
  lines.push(
    hour >= 18
      ? `Faltam ${int(remaining)}ml para fechar o dia — um copo de ${suggest}ml agora já ajuda.`
      : `Pelo ritmo do dia, o ideal seria ~${liters(expectedMl)}. Beba ${suggest}ml agora para voltar ao ritmo.`,
  );
  return lines.join('\n');
}

// ─── Meals ────────────────────────────────────────────────────────────────────

export type MealKey = 'breakfast' | 'lunch' | 'dinner';

const MEAL_LABEL: Record<MealKey, string> = {
  breakfast: 'café da manhã',
  lunch:     'almoço',
  dinner:    'jantar',
};

export function mealLabel(key: MealKey): string {
  return MEAL_LABEL[key];
}

export function buildMealMessage(t: UserTargets, s: DayStatus, meal: MealKey, userId: string, date: string): string {
  const n = escapeHtml(t.firstName);
  const label = MEAL_LABEL[meal];
  const title = pick([
    `🍽️ <b>${n}, já registrou o ${label}?</b>`,
    `🍽️ <b>Como foi o ${label}, ${n}?</b>`,
  ], userId, 'meal-' + meal, date);

  const lines = [title];
  if (s.consumedKcal > 0 && t.calories) {
    const left = t.calories - (s.consumedKcal - s.burnedKcal);
    lines.push(`Até agora: <b>${int(s.consumedKcal)}</b> de ${int(t.calories)} kcal${left > 0 ? ` (restam ${int(left)})` : ''}.`);
  } else if (s.consumedKcal === 0) {
    lines.push('Nenhuma refeição registrada hoje ainda.');
  }

  if (meal === 'dinner' && t.protein && s.protein < t.protein * 0.9) {
    lines.push(`Faltam <b>${int(t.protein - s.protein)}g de proteína</b> — priorize uma boa fonte no jantar.`);
  } else {
    lines.push('Registrar logo após comer deixa o saldo do dia e os insights precisos.');
  }
  return lines.join('\n');
}

// ─── Workout ──────────────────────────────────────────────────────────────────

export function buildWorkoutMessage(t: UserTargets, daysWithout: number, userId: string, date: string): string {
  const n = escapeHtml(t.firstName);
  const days = daysWithout >= 14 ? 'mais de 2 semanas' : `${daysWithout} dias`;
  const title = pick([
    `💪 <b>${n}, ${days} sem treino</b>`,
    `🏃 <b>Bora se mexer hoje, ${n}?</b>`,
  ], userId, 'workout', date);
  return [
    title,
    daysWithout >= 14 ? 'Nenhum treino registrado nas últimas 2 semanas.' : `Seu último treino registrado foi há ${days}.`,
    '30 minutos hoje já quebram a sequência — caminhada, academia ou treino em casa. Depois registre no app para contar as calorias.',
  ].join('\n');
}

// ─── AI insight ───────────────────────────────────────────────────────────────

const PRIORITY_EMOJI: Record<string, string> = {
  positivo: '🌟', atencao: '⚠️', recomendacao: '💡', informativo: 'ℹ️',
};

export function buildInsightMessage(insight: { title: string; message: string; priority: string; cta: string | null }): string {
  const em = PRIORITY_EMOJI[insight.priority] ?? '💡';
  const lines = [`${em} <b>${escapeHtml(insight.title)}</b>`, escapeHtml(insight.message)];
  if (insight.cta) lines.push('', `👉 ${escapeHtml(insight.cta)}`);
  return lines.join('\n');
}

// ─── Evening wrap-up and on-demand status ─────────────────────────────────────

export function buildEveningMessage(t: UserTargets, s: DayStatus): string {
  const metrics = dayMetrics(t, s);
  const missed = metrics.filter((m) => !m.ok);
  const lines = [`🌙 <b>Fechamento do dia, ${escapeHtml(t.firstName)}</b>`, '', metricsBlock(metrics), ''];

  if (missed.length === 0) {
    lines.push('Dia redondo — todas as metas batidas! 🎉');
  } else if (missed.length === metrics.length) {
    lines.push(`Amanhã é um novo dia. Comece por um ponto: ${FOCUS_TIP[missed[0].key]}.`);
  } else {
    lines.push(`${metrics.length - missed.length} de ${metrics.length} metas batidas. Para amanhã: ${FOCUS_TIP[missed[0].key]}.`);
  }
  return lines.join('\n');
}

export function buildStatusMessage(t: UserTargets, s: DayStatus): string {
  return [`📊 <b>Seu dia até agora, ${escapeHtml(t.firstName)}</b>`, '', metricsBlock(dayMetrics(t, s))].join('\n');
}
