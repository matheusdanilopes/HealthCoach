import { generateJSON } from '@/lib/ai';
import { supabase } from '@/lib/db';
import { getMealLabel } from '@/lib/utils';
import { brazilTime } from '@/lib/timezone';
import { missedGoals, type GoalKey } from '@/lib/notification-messages';
import type { DayStatus, UserTargets } from '@/lib/day-status';

// AI-written closing for the evening wrap-up — a short comment plus tips for
// tomorrow drawn from the day's entries — used only on days when the water or
// calorie goal was missed. Returns null otherwise or when the AI fails, so the
// caller falls back to the fixed text.

export type EveningClosing = { message: string; tips: string[] };

// The cron sends to every user in parallel; past this the wrap-up goes out
// with the fixed tip instead of holding the run.
const DEADLINE_MS = 20_000;
const MAX_MESSAGE_CHARS = 300;
const MAX_TIP_CHARS = 200;
const MAX_TIPS = 3;
const MAX_FOOD_LINES = 40;
const AI_TRIGGERS: GoalKey[] = ['water', 'calories'];

const SYSTEM = `Você é um coach de saúde que escreve o fechamento do dia enviado pelo Telegram, em português do Brasil.

O usuário já vê, acima da sua mensagem, a lista com os totais do dia. Você recebe também os registros detalhados (alimentos com horário, água com horário e treinos). Use-os para identificar COMPORTAMENTOS do dia, por exemplo:
- refeições puladas ou muito espaçadas, calorias concentradas em uma refeição ou à noite;
- alimentos que mais pesaram nas calorias, pouca proteína em certas refeições;
- água concentrada em poucos horários, longos períodos sem beber, pouca água no começo do dia;
- treino feito ou não e como isso afetou o saldo calórico.

Escreva:
- "message": 1 ou 2 frases curtas (máx. 250 caracteres) reconhecendo o que foi bem, se houver, e apontando o principal comportamento a ajustar. Trate o usuário pelo primeiro nome.
- "tips": 1 a 3 dicas para AMANHÃ. Priorize água e calorias. Máx. 160 caracteres cada.

DICAS — o que vale:
- Cada dica PRECISA citar um dado específico dos registros de hoje (um alimento, um horário, uma refeição, uma quantidade) e propor uma troca ou ação concreta com número, horário ou alimento substituto.
- Bons exemplos: "O pão com manteiga das 22h somou 480 kcal; amanhã troque por iogurte natural (~150 kcal)." / "Você ficou das 8h às 15h sem registrar água; deixe 500ml na mesa e termine até 11h."
- Se os registros não sustentarem uma dica específica, escreva menos dicas (mínimo 1) em vez de completar com dica genérica.

DICAS PROIBIDAS (óbvias/genéricas): "beba mais água", "mantenha uma garrafa por perto", "beba um copo a cada refeição", "registre suas refeições", "coma de forma equilibrada", "evite ultraprocessados", "faça exercícios", "durma bem", "planeje suas refeições", "tenha lanches saudáveis", ou qualquer conselho que serviria para qualquer pessoa em qualquer dia sem olhar os registros.

Regras: tom acolhedor, direto e sem julgamento; texto puro, sem markdown nem HTML; no máximo 1 emoji no total; não repita a lista de totais; não faça diagnóstico médico nem recomende suplementos ou dietas extremas; não invente registros.

Responda SOMENTE com JSON válido: {"message": "texto", "tips": ["dica", "dica"]}`;

const GOAL_LABEL: Record<GoalKey, string> = {
  water:    'água',
  calories: 'calorias',
  protein:  'proteína',
  workout:  'treino',
};

const int = (n: number) => Math.round(n).toLocaleString('pt-BR');

type FoodRow = {
  food_name: string;
  meal_type: string | null;
  calories: number;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  hydration_ml: number | null;
  created_at: string;
};

type WaterRow = { amount_ml: number; created_at: string };

async function getDayEntries(userId: string, date: string) {
  const [{ data: food, error: foodErr }, { data: water, error: waterErr }] = await Promise.all([
    supabase.from('food_logs')
      .select('food_name, meal_type, calories, protein, carbs, fat, hydration_ml, created_at')
      .eq('user_id', userId)
      .eq('log_date', date)
      .order('created_at'),
    supabase.from('water_logs')
      .select('amount_ml, created_at')
      .eq('user_id', userId)
      .eq('log_date', date)
      .order('created_at'),
  ]);
  if (foodErr || waterErr) {
    console.error('[evening-closing] entries query failed:', foodErr?.message ?? waterErr?.message);
  }
  return { food: (food ?? []) as FoodRow[], water: (water ?? []) as WaterRow[] };
}

function buildPrompt(
  t: UserTargets,
  s: DayStatus,
  missed: GoalKey[],
  entries: { food: FoodRow[]; water: WaterRow[] },
): string {
  const lines = [
    `Nome: ${t.firstName}`,
    '',
    'TOTAIS DO DIA',
    `Água: ${int(s.waterMl)}ml de ${int(t.waterMl)}ml`,
  ];
  if (t.calories) {
    lines.push(`Calorias líquidas: ${int(s.consumedKcal - s.burnedKcal)} kcal de ${int(t.calories)} kcal (consumidas ${int(s.consumedKcal)}, gastas em treino ${int(s.burnedKcal)}); faixa ok: 80% a 110% da meta`);
  }
  if (t.protein) lines.push(`Proteína: ${int(s.protein)}g de ${int(t.protein)}g`);
  lines.push(`Carboidratos: ${int(s.carbs)}g · Gorduras: ${int(s.fat)}g`);
  lines.push(`Metas não batidas: ${missed.map((k) => GOAL_LABEL[k]).join(', ')}`);

  const meals = entries.food.filter((f) => f.calories >= 0);
  const workouts = entries.food.filter((f) => f.calories < 0);

  lines.push('', 'ALIMENTOS REGISTRADOS (horário do registro)');
  if (meals.length === 0) lines.push('nenhum');
  for (const f of meals.slice(0, MAX_FOOD_LINES)) {
    const macros = [
      f.protein ? `${int(Number(f.protein))}g prot` : null,
      f.carbs ? `${int(Number(f.carbs))}g carb` : null,
      f.fat ? `${int(Number(f.fat))}g gord` : null,
    ].filter(Boolean).join(', ');
    const drink = (f.hydration_ml ?? 0) > 0 ? ` · ${int(f.hydration_ml ?? 0)}ml de líquido` : '';
    lines.push(`${brazilTime(f.created_at)} · ${getMealLabel(f.meal_type ?? 'other')} · ${f.food_name} · ${int(f.calories)} kcal${macros ? ` (${macros})` : ''}${drink}`);
  }
  if (meals.length > MAX_FOOD_LINES) lines.push(`… e mais ${meals.length - MAX_FOOD_LINES} itens`);

  lines.push('', 'ÁGUA REGISTRADA');
  lines.push(entries.water.length
    ? entries.water.map((w) => `${brazilTime(w.created_at)} ${int(w.amount_ml)}ml`).join(' · ')
    : 'nenhum registro de água');

  lines.push('', 'TREINOS');
  lines.push(workouts.length
    ? workouts.map((w) => `${brazilTime(w.created_at)} ${w.food_name} (${int(-w.calories)} kcal)`).join(' · ')
    : 'nenhum');

  return lines.join('\n');
}

function withDeadline<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Deadline of ${ms}ms exceeded`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

const clean = (v: unknown, max: number) =>
  typeof v === 'string' ? v.replace(/\s+/g, ' ').replace(/^(?:[-•*]|\d+[.)])\s+/, '').trim().slice(0, max) : '';

export async function generateEveningClosing(
  userId: string,
  t: UserTargets,
  s: DayStatus,
): Promise<EveningClosing | null> {
  const missed = missedGoals(t, s);
  if (!missed.some((k) => AI_TRIGGERS.includes(k))) return null;

  try {
    const data = await withDeadline(
      (async () => {
        const entries = await getDayEntries(userId, s.date);
        return generateJSON<{ message?: unknown; tips?: unknown }>({
          label:           'evening-closing',
          system:          SYSTEM,
          parts:           [{ text: buildPrompt(t, s, missed, entries) }],
          maxOutputTokens: 800,
          temperature:     0.7,
          timeoutMs:       15_000,
          validate:        (d) => typeof d.message === 'string' && d.message.trim().length > 0 && Array.isArray(d.tips),
        });
      })(),
      DEADLINE_MS,
    );
    const tips = (data.tips as unknown[])
      .map((tip) => clean(tip, MAX_TIP_CHARS))
      .filter(Boolean)
      .slice(0, MAX_TIPS);
    const message = clean(data.message, MAX_MESSAGE_CHARS);
    return message || tips.length ? { message, tips } : null;
  } catch (err) {
    console.error('[evening-closing] AI failed, using fixed tip:', err instanceof Error ? err.message : String(err));
    return null;
  }
}
