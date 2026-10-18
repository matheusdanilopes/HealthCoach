import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { aiErrorResponse, AIParseError, generateJSON } from '@/lib/ai';
import { buildCoachSnapshot, snapshotToPrompt, type CoachGoal } from '@/lib/coach-data';
import type { CoachAnalysis, CoachImpact } from '@/types';

export const maxDuration = 120;

const GOALS: CoachGoal[] = ['emagrecimento', 'ganho_muscular', 'recomposicao'];

const SYSTEM = `Você é um coach de saúde, nutrição e comportamento: empático, direto e orientado a dados. Sua função é ORIENTAR — ajudar o usuário a entender os próprios padrões, onde está errando, onde pode melhorar e qual estratégia seguir para o objetivo escolhido.

PRINCÍPIOS:
- Baseie TODA conclusão nos dados fornecidos. Cite números concretos como evidência (ex.: "proteína média de 82g contra meta de 140g").
- Faça análise COMPORTAMENTAL: padrões de consistência, fins de semana vs dias úteis, refeições puladas, concentração de calorias em certas refeições, alimentos que mais pesam, frequência de treino, hidratação, constância nas pesagens.
- Relacione comportamento com resultado (variação de peso, gordura, massa muscular, cintura). Se o resultado contradiz os registros (ex.: registra déficit mas o peso não cai), aponte a hipótese mais provável (sub-registro, fins de semana, beliscos não registrados, retenção hídrica) sem acusar.
- Adapte a estratégia ao objetivo:
  • Perder peso: déficit moderado (15–25% abaixo do TDEE), proteína 1,6–2,2 g/kg, treino de força para preservar massa magra, perda saudável de 0,5–1% do peso por semana.
  • Ganhar massa muscular: superávit leve (5–15%), proteína 1,6–2,2 g/kg, treino de força progressivo 3–5x/semana, ganho de 0,25–0,5% do peso por semana.
  • Recomposição: calorias próximas da manutenção (leve déficit), proteína alta (2,0–2,2 g/kg), treino de força consistente; acompanhar cintura/composição, não só a balança.
- Se faltarem dados (poucos dias registrados, sem pesagens, sem treinos), diga isso claramente e transforme o registro consistente na primeira ação.
- Recomendações práticas, específicas e realistas — nada genérico como "coma melhor". Prefira mudanças pequenas e sustentáveis.
- Tom de coach: acolhedor, honesto, sem julgamento, em português do Brasil, tratando o usuário pelo nome.
- Nunca faça diagnóstico médico nem prescreva medicamentos ou suplementos específicos em doses. Não recomende dietas extremas.

Responda SOMENTE com JSON válido, sem markdown, neste formato:
{
  "summary": "2 a 3 frases com o diagnóstico geral do comportamento em relação ao objetivo",
  "score": 0-100 (aderência geral ao objetivo, considerando consistência e resultado),
  "scoreLabel": "rótulo curto para a nota, ex.: Bom começo, No caminho certo, Precisa de ajustes",
  "strengths": [{"title": "curto", "detail": "o que está funcionando e por quê, com dados"}],
  "mistakes": [{"title": "curto", "detail": "onde está errando e por que atrapalha o objetivo", "evidence": "o dado que comprova"}],
  "improvements": [{"title": "curto", "action": "ação concreta e mensurável", "impact": "alto" | "medio" | "baixo"}],
  "strategy": {
    "headline": "a estratégia em uma frase",
    "calories": "orientação de calorias para o objetivo, com números",
    "protein": "orientação de proteína, com números",
    "training": "orientação de treino",
    "habits": ["hábito-chave", "..."]
  },
  "nextSteps": ["ação para os próximos 7 dias", "..."],
  "closing": "mensagem final motivadora e curta"
}

QUANTIDADES: strengths 2–4, mistakes 2–5, improvements 3–5 (ordenadas por impacto), habits 2–4, nextSteps 3–6.
Nunca use aspas duplas dentro dos textos.`;

function str(v: unknown, max = 600): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

function list<T>(v: unknown, map: (item: Record<string, unknown>) => T | null, max: number): T[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((item) => (item && typeof item === 'object' ? map(item as Record<string, unknown>) : null))
    .filter((x): x is T => x !== null)
    .slice(0, max);
}

function strList(v: unknown, max: number): string[] {
  return Array.isArray(v) ? v.map((x) => str(x, 300)).filter(Boolean).slice(0, max) : [];
}

function normalize(data: Record<string, unknown>): CoachAnalysis {
  const strategy = (data.strategy && typeof data.strategy === 'object' ? data.strategy : {}) as Record<string, unknown>;
  const score = Number(data.score);
  return {
    summary: str(data.summary, 800),
    score: Number.isFinite(score) ? Math.max(0, Math.min(100, Math.round(score))) : null,
    scoreLabel: str(data.scoreLabel, 40),
    strengths: list(data.strengths, (i) => (str(i.title) ? { title: str(i.title, 80), detail: str(i.detail) } : null), 4),
    mistakes: list(
      data.mistakes,
      (i) => (str(i.title) ? { title: str(i.title, 80), detail: str(i.detail), evidence: str(i.evidence, 300) } : null),
      5
    ),
    improvements: list(
      data.improvements,
      (i) => {
        if (!str(i.title)) return null;
        const raw = str(i.impact).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
        const impact: CoachImpact = raw === 'alto' || raw === 'baixo' ? raw : 'medio';
        return { title: str(i.title, 80), action: str(i.action), impact };
      },
      5
    ),
    strategy: {
      headline: str(strategy.headline, 300),
      calories: str(strategy.calories),
      protein: str(strategy.protein),
      training: str(strategy.training),
      habits: strList(strategy.habits, 4),
    },
    nextSteps: strList(data.nextSteps, 6),
    closing: str(data.closing, 400),
  };
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const goal = GOALS.includes(body?.goal) ? (body.goal as CoachGoal) : null;
    if (!goal) return NextResponse.json({ error: 'Selecione um objetivo.' }, { status: 400 });

    const snapshot = await buildCoachSnapshot(session.user.id);
    if (snapshot.nutrition.daysLogged === 0 && snapshot.training.sessions === 0 && snapshot.body.weightEntries === 0) {
      return NextResponse.json(
        { error: 'Ainda não há dados suficientes. Registre refeições, treinos ou pesagens por alguns dias e tente novamente.' },
        { status: 400 }
      );
    }

    let data: Record<string, unknown>;
    try {
      data = await generateJSON({
        label: 'coach-analyze',
        system: SYSTEM,
        parts: [{ text: snapshotToPrompt(snapshot, goal) }],
        maxOutputTokens: 6000,
        temperature: 0.5,
        timeoutMs: 60_000,
        validate: (d) => typeof d.summary === 'string' && Array.isArray(d.mistakes) && Array.isArray(d.improvements),
      });
    } catch (err) {
      if (err instanceof AIParseError) {
        return NextResponse.json(
          { error: 'Não foi possível interpretar a resposta da IA. Tente novamente.' },
          { status: 500 }
        );
      }
      throw err;
    }

    return NextResponse.json({
      goal,
      generatedAt: new Date().toISOString(),
      analysis: normalize(data),
    });
  } catch (err) {
    return aiErrorResponse(err, 'coach-analyze', 'Erro ao gerar a análise. Tente novamente.');
  }
}
