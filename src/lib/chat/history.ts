/**
 * O que a Nina sabe dos dias anteriores.
 *
 * - `recentDaysContext`: os últimos 7 dias, sempre no contexto (barato e cobre
 *   "ontem", "essa semana").
 * - `consultar_historico`: ferramenta que o modelo chama para qualquer outro
 *   período (até 120 dias) e para ver as refeições de um dia.
 * - `pastConversationsContext`: resumo das conversas recentes (memória).
 *
 * As consultas usam a view daily_summary (uma linha por dia com registro).
 * A formatação é separada da consulta para ser testada sem banco.
 */

import { Type } from '@google/genai';
import { sql } from '@/lib/db';
import { brazilNDaysAgo, brazilToday } from '@/lib/timezone';

export const HISTORY_TOOL_NAME = 'consultar_historico';
/** Período máximo de uma consulta. */
export const MAX_HISTORY_DAYS = 120;
/** Refeições item a item só em períodos curtos (a resposta fica enorme). */
export const MAX_MEAL_DAYS = 7;

export const HISTORY_DECLARATION = {
  name: HISTORY_TOOL_NAME,
  description:
    'Consulta os registros do usuário no banco em um período: por dia, calorias, proteína, carboidratos, ' +
    'gordura, água, calorias gastas em treino, treinos e peso/composição corporal, com médias do período. ' +
    'Use para qualquer pergunta sobre dias anteriores (ontem, semana passada, um dia específico, ' +
    'mês, evolução, médias, comparações) ou para ver o que foi comido em um dia.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      data_inicio: { type: Type.STRING, description: 'Primeiro dia, formato AAAA-MM-DD' },
      data_fim: { type: Type.STRING, description: 'Último dia, formato AAAA-MM-DD (inclusive)' },
      incluir_refeicoes: {
        type: Type.BOOLEAN,
        description: `Lista os alimentos registrados em cada dia (só para períodos de até ${MAX_MEAL_DAYS} dias)`,
      },
    },
    required: ['data_inicio', 'data_fim'],
  },
};

const WEEKDAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const MEAL_LABEL: Record<string, string> = {
  breakfast: 'Café', morning_snack: 'Lanche manhã', lunch: 'Almoço',
  afternoon_snack: 'Lanche tarde', dinner: 'Jantar', supper: 'Ceia',
  pre_workout: 'Pré-treino', post_workout: 'Pós-treino', other: 'Outro',
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function addDays(date: string, n: number): string {
  const d = new Date(date + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 86_400_000);
}

export function weekday(date: string): string {
  return WEEKDAYS[new Date(date + 'T12:00:00Z').getUTCDay()];
}

/** "2026-11-14" → "14/11 (sex)". */
export function dayLabel(date: string): string {
  return `${date.slice(8, 10)}/${date.slice(5, 7)} (${weekday(date)})`;
}

export type HistoryRange = { start: string; end: string; meals: boolean; note: string | null };

/** Valida e limita o período pedido pelo modelo. */
export function resolveRange(args: Record<string, unknown>, today: string): HistoryRange | { error: string } {
  let start = typeof args.data_inicio === 'string' ? args.data_inicio.trim() : '';
  let end = typeof args.data_fim === 'string' ? args.data_fim.trim() : start;
  if (!ISO_DATE.test(start) || Number.isNaN(Date.parse(start))) {
    return { error: 'data_inicio inválida: use AAAA-MM-DD.' };
  }
  if (!ISO_DATE.test(end) || Number.isNaN(Date.parse(end))) end = start;
  if (end < start) [start, end] = [end, start];

  const notes: string[] = [];
  if (start > today) return { error: `Não há registros no futuro (hoje é ${today}).` };
  if (end > today) end = today;
  if (daysBetween(start, end) + 1 > MAX_HISTORY_DAYS) {
    start = addDays(end, -(MAX_HISTORY_DAYS - 1));
    notes.push(`período limitado aos ${MAX_HISTORY_DAYS} dias até ${end}`);
  }
  let meals = args.incluir_refeicoes === true;
  if (meals && daysBetween(start, end) + 1 > MAX_MEAL_DAYS) {
    meals = false;
    notes.push(`refeições item a item só em períodos de até ${MAX_MEAL_DAYS} dias`);
  }
  return { start, end, meals, note: notes.length ? notes.join('; ') : null };
}

export interface DayRow {
  date: string;
  kcal_consumed: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  kcal_burned: number;
  water_ml: number;
  workout_sessions: number;
  workout_minutes: number | null;
  weight_kg: number | null;
  body_fat_pct: number | null;
  muscle_mass_kg: number | null;
}

export interface MealRow {
  date: string;
  meal_type: string | null;
  food_name: string;
  calories: number;
  protein: number | null;
}

const n0 = (v: unknown) => Math.round(Number(v) || 0);
const n1 = (v: unknown) => (Math.round((Number(v) || 0) * 10) / 10).toString().replace('.', ',');

/** Uma linha por dia: só o que foi registrado. */
export function formatDay(d: DayRow): string {
  const parts: string[] = [];
  if (n0(d.kcal_consumed) > 0) {
    parts.push(`${n0(d.kcal_consumed)} kcal | ${n0(d.protein_g)}g prot | ${n0(d.carbs_g)}g carb | ${n0(d.fat_g)}g gord`);
  } else {
    parts.push('sem refeições registradas');
  }
  if (n0(d.water_ml) > 0) parts.push(`água ${n0(d.water_ml)}ml`);
  if (n0(d.kcal_burned) > 0) parts.push(`treino -${n0(d.kcal_burned)} kcal`);
  if (n0(d.workout_sessions) > 0) {
    parts.push(`${n0(d.workout_sessions)} treino(s) IA${d.workout_minutes ? ` ${n0(d.workout_minutes)} min` : ''}`);
  }
  if (d.weight_kg != null) parts.push(`peso ${n1(d.weight_kg)}kg`);
  if (d.body_fat_pct != null) parts.push(`gordura ${n1(d.body_fat_pct)}%`);
  if (d.muscle_mass_kg != null) parts.push(`massa muscular ${n1(d.muscle_mass_kg)}kg`);
  return `${dayLabel(d.date)}: ${parts.join(' | ')}`;
}

/** Médias dos dias com refeição registrada e variação de peso no período. */
export function formatAverages(days: DayRow[], targets: { calories: number | null; protein: number | null }): string {
  const food = days.filter((d) => n0(d.kcal_consumed) > 0);
  const lines: string[] = [];
  if (food.length) {
    const avg = (f: (d: DayRow) => number) => Math.round(food.reduce((s, d) => s + f(d), 0) / food.length);
    const avgKcal = avg((d) => Number(d.kcal_consumed));
    const onTarget = targets.calories
      ? food.filter((d) => Number(d.kcal_consumed) <= targets.calories! * 1.05).length
      : null;
    lines.push(
      `Média (${food.length} dias com refeições): ${avgKcal} kcal | ${avg((d) => Number(d.protein_g))}g prot | ` +
      `${avg((d) => Number(d.carbs_g))}g carb | ${avg((d) => Number(d.fat_g))}g gord` +
      (onTarget != null ? ` | dentro da meta de kcal em ${onTarget}/${food.length} dias` : '')
    );
  }
  const water = days.filter((d) => n0(d.water_ml) > 0);
  if (water.length) {
    lines.push(`Água: média ${Math.round(water.reduce((s, d) => s + Number(d.water_ml), 0) / water.length)}ml (${water.length} dias)`);
  }
  const trainingDays = days.filter((d) => n0(d.kcal_burned) > 0 || n0(d.workout_sessions) > 0).length;
  if (trainingDays) lines.push(`Dias com treino: ${trainingDays}`);
  const weights = days.filter((d) => d.weight_kg != null);
  if (weights.length >= 2) {
    const first = Number(weights[0].weight_kg);
    const last = Number(weights[weights.length - 1].weight_kg);
    const diff = Math.round((last - first) * 10) / 10;
    lines.push(`Peso: ${n1(first)}kg (${dayLabel(weights[0].date)}) → ${n1(last)}kg (${dayLabel(weights[weights.length - 1].date)}), ${diff > 0 ? '+' : ''}${n1(diff)}kg`);
  }
  return lines.join('\n');
}

export function formatMeals(meals: MealRow[]): string {
  const byDay = new Map<string, MealRow[]>();
  for (const m of meals) {
    if (!byDay.has(m.date)) byDay.set(m.date, []);
    byDay.get(m.date)!.push(m);
  }
  return [...byDay.entries()].map(([date, list]) =>
    `${dayLabel(date)}:\n` + list.map((m) =>
      `  • ${MEAL_LABEL[m.meal_type ?? ''] ?? 'Refeição'}: ${m.food_name} — ${n0(m.calories)} kcal${m.protein ? ` ${n0(m.protein)}g prot` : ''}`
    ).join('\n')
  ).join('\n');
}

/** Datas do banco chegam como Date (meia-noite UTC) ou string. */
function isoDate(v: unknown): string {
  return v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10);
}

async function loadDays(userId: string, start: string, end: string): Promise<DayRow[]> {
  const rows = await sql`
    SELECT date, kcal_consumed, protein_g, carbs_g, fat_g, kcal_burned, water_ml,
           workout_sessions, workout_minutes, weight_kg, body_fat_pct, muscle_mass_kg
      FROM daily_summary
     WHERE user_id = ${userId} AND date BETWEEN ${start} AND ${end}
     ORDER BY date
  `;
  return (rows as DayRow[]).map((r) => ({ ...r, date: isoDate(r.date) }));
}

/** Executa a ferramenta consultar_historico; devolve texto para o modelo. */
export async function queryHistory(userId: string, args: Record<string, unknown>): Promise<string> {
  const today = brazilToday();
  const range = resolveRange(args, today);
  if ('error' in range) return `Erro: ${range.error}`;

  const [days, meals, [user]] = await Promise.all([
    loadDays(userId, range.start, range.end),
    range.meals
      ? sql`
          SELECT log_date AS date, meal_type, food_name, calories, protein
            FROM food_logs
           WHERE user_id = ${userId} AND log_date BETWEEN ${range.start} AND ${range.end} AND calories > 0
           ORDER BY log_date, created_at
        `
      : Promise.resolve([]),
    sql`SELECT target_calories, target_protein_g FROM users WHERE id = ${userId}`,
  ]);

  const header = `Período ${dayLabel(range.start)} a ${dayLabel(range.end)}${range.note ? ` (${range.note})` : ''}`;
  if (days.length === 0) return `${header}\nNenhum registro neste período.`;

  const total = daysBetween(range.start, range.end) + 1;
  const parts = [
    header,
    `Dias com algum registro: ${days.length}/${total}`,
    formatAverages(days, { calories: user?.target_calories ?? null, protein: user?.target_protein_g ?? null }),
    'Por dia:',
    ...days.map(formatDay),
  ];
  if (range.meals) {
    const list = (meals as MealRow[]).map((m) => ({ ...m, date: isoDate(m.date) }));
    parts.push('Refeições:', list.length ? formatMeals(list) : 'nenhuma refeição registrada');
  }
  return parts.filter(Boolean).join('\n');
}

/** Os 7 dias antes de hoje, sempre no contexto da Nina. */
export async function recentDaysContext(userId: string, today = brazilToday()): Promise<string> {
  const days = await loadDays(userId, brazilNDaysAgo(7, today), brazilNDaysAgo(1, today));
  if (days.length === 0) return 'Nenhum registro nos últimos 7 dias.';
  return days.map(formatDay).join('\n');
}

export interface PastMessage {
  conversation_id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string | Date;
}

const oneLine = (text: string, max: number) => {
  const t = text.replace(/\*\*/g, '').replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
};

/**
 * Resumo das conversas anteriores: cada pergunta com o começo da resposta,
 * da mais antiga para a mais nova, agrupadas por conversa.
 */
export function formatPastConversations(rows: PastMessage[]): string {
  const sorted = [...rows].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  const lines: string[] = [];
  let lastConversation: string | null = null;
  for (let i = 0; i < sorted.length; i++) {
    const m = sorted[i];
    if (m.role !== 'user') continue;
    const reply = sorted.slice(i + 1).find((r) => r.conversation_id === m.conversation_id && r.role === 'assistant');
    const when = new Date(m.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' });
    if (m.conversation_id !== lastConversation) {
      lines.push(`— Conversa de ${when}`);
      lastConversation = m.conversation_id;
    }
    lines.push(`  Usuário: "${oneLine(m.content, 160)}"${reply ? `\n  Você: "${oneLine(reply.content, 220)}"` : ''}`);
  }
  return lines.join('\n');
}

/** Memória: perguntas e respostas das conversas dos últimos 14 dias (fora a atual). */
export async function pastConversationsContext(userId: string, currentConversationId: string): Promise<string> {
  try {
    const rows = await sql`
      SELECT conversation_id, role, content, created_at
        FROM chat_messages
       WHERE user_id = ${userId}
         AND conversation_id <> ${currentConversationId}
         AND created_at > now() - interval '14 days'
       ORDER BY created_at DESC
       LIMIT 24
    `;
    return formatPastConversations(rows as PastMessage[]);
  } catch (err) {
    // Sem a tabela chat_messages o chat segue, só sem memória.
    console.error('[chat-memory]', err instanceof Error ? err.message : err);
    return '';
  }
}
