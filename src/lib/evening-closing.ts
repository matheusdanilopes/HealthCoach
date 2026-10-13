import { generateJSON } from '@/lib/ai';
import { getMealLabel } from '@/lib/utils';
import { missedGoals, type GoalKey } from '@/lib/notification-messages';
import type { DayStatus, UserTargets } from '@/lib/day-status';

// AI-written closing line for the evening wrap-up, used only on days with
// missed goals. Returns null when every goal was met or the AI fails, so the
// caller falls back to the fixed tip.

// The cron sends to every user in parallel; past this the wrap-up goes out
// with the fixed tip instead of holding the run.
const DEADLINE_MS = 20_000;
const MAX_CHARS = 400;

const SYSTEM = `Você é um coach de saúde que escreve a mensagem de fechamento do dia enviada pelo Telegram, em português do Brasil.

O usuário já vê, acima da sua mensagem, a lista com os números do dia. Sua mensagem fecha o resumo:
- 2 a 3 frases curtas, no máximo 300 caracteres.
- Reconheça o que foi bem, se houver, sem exagero.
- Foque na meta não batida mais relevante e dê UMA ação concreta e realista para amanhã, usando os números (ex.: quanto faltou).
- Tom acolhedor, direto e sem julgamento. Trate o usuário pelo primeiro nome.
- Texto puro: sem markdown, sem HTML, sem listas, no máximo 1 emoji.
- Não repita a lista de números nem faça diagnóstico médico.

Responda SOMENTE com JSON válido: {"message": "texto"}`;

const GOAL_LABEL: Record<GoalKey, string> = {
  water:    'água',
  calories: 'calorias',
  protein:  'proteína',
  workout:  'treino',
};

const int = (n: number) => Math.round(n).toLocaleString('pt-BR');

function buildPrompt(t: UserTargets, s: DayStatus, missed: GoalKey[]): string {
  const lines = [
    `Nome: ${t.firstName}`,
    `Água: ${int(s.waterMl)}ml de ${int(t.waterMl)}ml`,
  ];
  if (t.calories) {
    lines.push(`Calorias líquidas: ${int(s.consumedKcal - s.burnedKcal)} kcal de ${int(t.calories)} kcal (consumidas ${int(s.consumedKcal)}, gastas em treino ${int(s.burnedKcal)}); faixa ok: 80% a 110% da meta`);
  }
  if (t.protein) lines.push(`Proteína: ${int(s.protein)}g de ${int(t.protein)}g`);
  lines.push(`Carboidratos: ${int(s.carbs)}g · Gorduras: ${int(s.fat)}g`);
  lines.push(`Treino hoje: ${s.hasWorkout ? `sim (${int(s.burnedKcal)} kcal)` : 'não'}`);
  lines.push(`Refeições registradas: ${s.meals.size ? [...s.meals].map(getMealLabel).join(', ') : 'nenhuma'}`);
  lines.push(`Metas não batidas: ${missed.map((k) => GOAL_LABEL[k]).join(', ')}`);
  return lines.join('\n');
}

function withDeadline<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Deadline of ${ms}ms exceeded`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export async function generateEveningClosing(t: UserTargets, s: DayStatus): Promise<string | null> {
  const missed = missedGoals(t, s);
  if (missed.length === 0) return null;

  try {
    const data = await withDeadline(
      generateJSON<{ message?: unknown }>({
        label:           'evening-closing',
        system:          SYSTEM,
        parts:           [{ text: buildPrompt(t, s, missed) }],
        maxOutputTokens: 400,
        temperature:     0.8,
        timeoutMs:       15_000,
        validate:        (d) => typeof d.message === 'string' && d.message.trim().length > 0,
      }),
      DEADLINE_MS,
    );
    return String(data.message).replace(/\s+/g, ' ').trim().slice(0, MAX_CHARS);
  } catch (err) {
    console.error('[evening-closing] AI failed, using fixed tip:', err instanceof Error ? err.message : String(err));
    return null;
  }
}
