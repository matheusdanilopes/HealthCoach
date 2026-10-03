import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { supabase } from '@/lib/db';
import { AIParseError, aiErrorResponse, generateJSON } from '@/lib/ai';

const SYSTEM = `Você é um especialista em ciências do esporte e metabolismo energético. Estime o gasto calórico com máxima precisão e rigor científico.

FÓRMULA BASE: kcal = MET × peso_kg × duração_horas
Use sempre esta fórmula como referência central.

REGRAS CRÍTICAS DE PRECISÃO:
- Seja CONSERVADOR — é melhor subestimar do que superestimar
- Nunca assuma intensidade máxima sem evidência explícita
- Se smartwatch informado, use como âncora (resultado final deve ficar ±20% desse valor)
- Se FC informada, ajuste conforme zona de treino (< 60% FCmax = leve, 60-75% = moderado, 75-85% = intenso, >85% = muito intenso)
- Se RPE informado: 1-3 = leve, 4-6 = moderado, 7-8 = intenso, 9-10 = máximo

METs REALISTAS (tabela ACSM conservadora):
- Caminhada leve: 2.5 | moderada: 3.5 | rápida: 4.5
- Corrida: 7.0 (8km/h) a 11.5 (12km/h) — interpole pela velocidade/intensidade
- Ciclismo leve: 4.0 | moderado: 6.8 | intenso: 9.5
- Musculação: leve 3.5 | moderada 5.0 | intensa 6.0 (NÃO ultrapasse 6.5 sem evidência)
- HIIT: 8.0-12.0 conforme intensidade real
- CrossFit: 7.0-10.0
- Funcional: 5.0-7.5
- Cardio (geral): 5.0-8.0
- Esportes: 6.0-8.0

TÊNIS (regras específicas):
- Dupla recreativo leve: MET 4.5
- Dupla recreativo moderado: MET 5.5
- Simples recreativo moderado: MET 6.5
- Simples competitivo intenso: MET 7.3
- NUNCA assuma MET > 7.5 para tênis recreativo
- Considere pausas entre pontos (reduzem ~20% do gasto)

PILATES (regras específicas):
- Solo leve/iniciante: MET 2.8
- Solo moderado: MET 3.2
- Aparelho/reformer leve: MET 3.5
- Aparelho/reformer moderado: MET 4.2
- NUNCA equipare pilates a HIIT ou cardio intenso
- Pilates tem baixo impacto cardiovascular

CONFIDENCE SCORE:
- "alta": ≥ 3 dados além de tipo+duração+intensidade (FC, distância, carga, RPE, smartwatch)
- "média": 1-2 dados adicionais OU tipo+intensidade+duração apenas
- "baixa": dados insuficientes ou contraditórios

Retorne SOMENTE JSON válido sem markdown, sem texto adicional:
{"estimatedCalories":420,"intensity":"moderada","trainingLoad":"moderada","confidence":"média","metValue":5.5,"summary":"Descrição objetiva em até 80 caracteres"}

Campos obrigatórios:
- estimatedCalories: inteiro positivo realista
- intensity: "baixa" | "moderada" | "alta" | "muito alta"
- trainingLoad: "leve" | "moderada" | "alta" | "muito alta"
- confidence: "baixa" | "média" | "alta"
- metValue: decimal com 1 casa (ex: 5.5)
- summary: frase curta descritiva (máx 80 chars). NUNCA use aspas duplas (") dentro do texto do summary — isso quebra o JSON. Não use nenhum tipo de aspas para dar ênfase a palavras.`;

// Last-resort recovery for when the model's JSON is well-formed enough to be
// obviously the right shape but fails strict JSON.parse — most commonly an
// unescaped double quote inside the free-text "summary" field. Since the
// schema is fixed and flat, each field can be pulled out with a targeted
// regex instead of giving up and surfacing a parse error to the user.
function recoverWorkoutFields(raw: string): Record<string, unknown> | null {
  const numberField = (key: string): number | undefined => {
    const m = raw.match(new RegExp(`"${key}"\\s*:\\s*(-?\\d+(?:\\.\\d+)?)`));
    return m ? Number(m[1]) : undefined;
  };
  const enumField = (key: string): string | undefined => {
    const m = raw.match(new RegExp(`"${key}"\\s*:\\s*"([^"]*)"`));
    return m ? m[1] : undefined;
  };

  const estimatedCalories = numberField('estimatedCalories');
  if (estimatedCalories === undefined) return null;

  // Grab everything between the opening quote and the last quote before the
  // object closes, rather than stopping at the first (possibly inner) quote.
  const summaryMatch = raw.match(/"summary"\s*:\s*"([\s\S]*)"\s*\}/);

  return {
    estimatedCalories,
    intensity: enumField('intensity') ?? 'moderada',
    trainingLoad: enumField('trainingLoad') ?? 'moderada',
    confidence: enumField('confidence') ?? 'média',
    metValue: numberField('metValue') ?? 0,
    summary: summaryMatch ? summaryMatch[1].trim() : '',
  };
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: 'Não foi possível ler a requisição. Tente novamente.' },
        { status: 400 }
      );
    }

    const durationMinutes = Number(body.durationMinutes);
    if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
      return NextResponse.json({ error: 'Duração do treino inválida.' }, { status: 400 });
    }

    const [{ data: profile }, { data: bodyMetrics }] = await Promise.all([
      supabase
        .from('users')
        .select('current_weight, sex, birth_date, height_cm')
        .eq('id', session.user.id)
        .single(),
      supabase
        .from('body_metrics')
        .select('weight, body_fat, muscle_mass')
        .eq('user_id', session.user.id)
        .order('date', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const weight = bodyMetrics?.weight ?? profile?.current_weight ?? 75;

    const lines: string[] = ['Dados do treino:'];
    if (body.description?.trim())   lines.push(`- Descrição livre: ${body.description.trim()}`);
    if (body.workoutType)           lines.push(`- Tipo: ${body.workoutType}`);
    if (body.intensity)             lines.push(`- Intensidade declarada: ${body.intensity}`);
    lines.push(`- Duração: ${durationMinutes} minutos`);
    if (body.heartRate)             lines.push(`- FC média: ${body.heartRate} bpm`);
    if (body.distanceKm)            lines.push(`- Distância: ${body.distanceKm} km`);
    if (body.loadKg)                lines.push(`- Carga total movimentada: ${body.loadKg} kg`);
    if (body.rpe)                   lines.push(`- Esforço percebido (RPE): ${body.rpe}/10`);
    if (body.smartwatchKcal)        lines.push(`- Kcal smartwatch (âncora): ${body.smartwatchKcal} kcal`);

    lines.push('');
    lines.push('Perfil do usuário:');
    lines.push(`- Peso: ${weight} kg`);
    if (profile?.sex)        lines.push(`- Sexo: ${profile.sex === 'male' ? 'masculino' : 'feminino'}`);
    if (profile?.birth_date) {
      const age = Math.floor((Date.now() - new Date(profile.birth_date).getTime()) / (365.25 * 24 * 3600 * 1000));
      lines.push(`- Idade: ${age} anos`);
    }
    if (profile?.height_cm)         lines.push(`- Altura: ${profile.height_cm} cm`);
    if (bodyMetrics?.body_fat)      lines.push(`- Gordura corporal: ${bodyMetrics.body_fat}%`);
    if (bodyMetrics?.muscle_mass)   lines.push(`- Massa muscular: ${bodyMetrics.muscle_mass} kg`);

    const prompt = lines.join('\n');

    const toPositive = (v: unknown) => {
      const n = Number(v);
      return Number.isFinite(n) && n > 0 ? n : 0;
    };

    let data: Record<string, unknown>;
    try {
      data = await generateJSON({
        label: 'workout-analyze',
        system: SYSTEM,
        parts: [{ text: prompt }],
        // The JSON payload itself is small (~150 tokens), but newer models can
        // spend part of the output budget on hidden reasoning before writing
        // it — a tight budget truncates the JSON mid-object.
        maxOutputTokens: 800,
        temperature: 0.15,
        validate: (d) => toPositive(d.estimatedCalories) > 0,
      });
    } catch (err) {
      if (!(err instanceof AIParseError)) throw err;
      const recovered = err.raws.map(recoverWorkoutFields).find((r) => r !== null);
      if (!recovered) {
        return NextResponse.json(
          { error: 'Não foi possível interpretar a resposta da IA. Tente novamente.' },
          { status: 500 }
        );
      }
      data = recovered;
    }

    if (!toPositive(data.estimatedCalories)) {
      return NextResponse.json(
        { error: 'A IA não conseguiu estimar o gasto deste treino. Tente novamente.' },
        { status: 500 }
      );
    }
    data.estimatedCalories = Math.round(toPositive(data.estimatedCalories));
    data.metValue = Math.round(toPositive(data.metValue) * 10) / 10;
    data.summary = typeof data.summary === 'string' ? data.summary.slice(0, 120) : '';

    // Ensure confidence field has a valid value
    const validConfidence = ['alta', 'média', 'baixa'];
    if (!validConfidence.includes(data.confidence as string)) {
      data.confidence = 'média';
    }

    return NextResponse.json(data);
  } catch (err) {
    return aiErrorResponse(err, 'workout-analyze', 'Erro ao analisar o treino. Tente novamente.');
  }
}
