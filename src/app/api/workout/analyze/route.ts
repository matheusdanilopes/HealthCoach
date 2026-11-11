import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { sql } from '@/lib/db';
import { AIParseError, aiErrorResponse, generateJSON } from '@/lib/ai';
import { calculateAge } from '@/lib/calculations';
import { buildWorkoutFacts, confidenceFromRange, normalizeRange, type Sex } from '@/lib/workout-analysis';

const SYSTEM = `Você é um especialista em ciências do esporte e metabolismo energético. Estime o gasto calórico com rigor científico e de forma CONSISTENTE: os mesmos dados devem sempre gerar o mesmo resultado.

FÓRMULA BASE: kcal = MET × peso_kg × duração_horas
O servidor já informa quanto vale 1 MET nesta duração e os demais cálculos (FC máxima, zona de FC, estimativa pela FC, velocidade, MET pelo ritmo, coerência do RPE). Use esses valores como FATOS — não recalcule.

COMO CHEGAR NO VALOR:
1. Escolha o MET pela tabela abaixo conforme modalidade, formato e intensidade.
2. Se houver MET pelo ritmo (corrida/caminhada), ele prevalece sobre a tabela.
3. Se houver estimativa pela FC coerente com o MET (diferença ≤ 25%), use a média das duas.
4. Se houver kcal do smartwatch, o resultado final deve ficar a ±20% desse valor.
5. Seja CONSERVADOR: na dúvida, prefira o MET menor. Nunca assuma intensidade máxima sem evidência.

ESCALAS:
- RPE: 1-3 leve | 4-6 moderado | 7-8 intenso | 9-10 máximo. Diferença de 1 nível entre RPE e intensidade declarada é normal e NÃO é contradição.
- Zona de FC (% da FC máxima): < 60 leve | 60-75 moderada | 75-85 intensa | > 85 muito intensa.

METs (tabela ACSM conservadora; já consideram as pausas típicas — não aplique redução adicional):
- Caminhada leve: 2.5 | moderada: 3.5 | rápida: 4.5
- Corrida: 7.0 (8 km/h) a 11.5 (12 km/h) — interpole pela velocidade/intensidade
- Ciclismo leve: 4.0 | moderado: 6.8 | intenso: 9.5 (pela velocidade: < 16 km/h 4.0 | 16-19 6.8 | 19-22 8.0 | 22-25 10.0)
- Musculação: leve 3.5 | moderada 5.0 | intensa 6.0 (NÃO ultrapasse 6.5 sem evidência)
- HIIT: 8.0-12.0 conforme intensidade real
- Funcional: 5.0-7.5
- Cardio (geral): 5.0-8.0
- Esportes: 6.0-8.0
- Tênis: dupla recreativo leve 4.5 | dupla recreativo moderado 5.5 | simples recreativo moderado 6.5 | simples competitivo intenso 7.3. NUNCA MET > 7.5 em tênis recreativo.
- Pilates: solo leve 2.8 | solo moderado 3.2 | aparelho/reformer leve 3.5 | aparelho/reformer moderado 4.2. NUNCA equipare pilates a HIIT ou cardio intenso.

FAIXA DE INCERTEZA (caloriesMin / caloriesMax):
A largura da faixa reflete a QUALIDADE dos dados, não a quantidade de campos preenchidos. Escolha a primeira situação que se aplica:
- ±8-10%: há dado medido (estimativa pela FC ou kcal do smartwatch) coerente com o MET, ou MET pelo ritmo de corrida/caminhada.
- ±10-12%: atividade bem especificada — modalidade com MET tabelado + formato ou contexto (ex.: tênis simples recreativo, pilates no aparelho, musculação com carga informada, ciclismo com velocidade) + intensidade declarada + RPE coerente.
- ±13-18%: modalidade com MET tabelado e intensidade declarada, mas sem formato/contexto ou sem RPE.
- ±18-25%: tipo genérico (esportes, cardio, funcional, outro) sem detalhes na descrição.
- ±30-40%: dados contraditórios (o servidor sinaliza com "Atenção" ou "contradiz") ou descrição vaga.
estimatedCalories deve ficar dentro da faixa.

Retorne SOMENTE JSON válido sem markdown, sem texto adicional:
{"estimatedCalories":420,"caloriesMin":375,"caloriesMax":465,"intensity":"moderada","trainingLoad":"moderada","metValue":5.5,"summary":"Descrição objetiva em até 80 caracteres"}

Campos obrigatórios:
- estimatedCalories: inteiro positivo realista
- caloriesMin, caloriesMax: inteiros positivos, faixa conforme as regras acima
- intensity: "baixa" | "moderada" | "alta" | "muito alta"
- trainingLoad: "leve" | "moderada" | "alta" | "muito alta"
- metValue: decimal com 1 casa (ex: 5.5) — o MET efetivo usado
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
    caloriesMin: numberField('caloriesMin'),
    caloriesMax: numberField('caloriesMax'),
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

    const [[profile], [bodyMetrics]] = await Promise.all([
      sql`SELECT current_weight, sex, birth_date, height_cm FROM users WHERE id = ${session.user.id}`,
      sql`
        SELECT weight, body_fat, muscle_mass FROM body_metrics
        WHERE user_id = ${session.user.id} ORDER BY date DESC LIMIT 1
      `,
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

    const age = profile?.birth_date ? calculateAge(String(profile.birth_date)) : undefined;
    const sex: Sex | undefined =
      profile?.sex === 'male' || profile?.sex === 'female' ? profile.sex : undefined;

    lines.push('');
    lines.push('Perfil do usuário:');
    lines.push(`- Peso: ${weight} kg`);
    if (sex)                        lines.push(`- Sexo: ${sex === 'male' ? 'masculino' : 'feminino'}`);
    if (age && age > 0)             lines.push(`- Idade: ${age} anos`);
    if (profile?.height_cm)         lines.push(`- Altura: ${profile.height_cm} cm`);
    if (bodyMetrics?.body_fat)      lines.push(`- Gordura corporal: ${bodyMetrics.body_fat}%`);
    if (bodyMetrics?.muscle_mass)   lines.push(`- Massa muscular: ${bodyMetrics.muscle_mass} kg`);

    const num = (v: unknown) => {
      const n = Number(v);
      return Number.isFinite(n) && n > 0 ? n : undefined;
    };
    const facts = buildWorkoutFacts({
      workoutType: typeof body.workoutType === 'string' ? body.workoutType : undefined,
      intensity: typeof body.intensity === 'string' ? body.intensity : undefined,
      minutes: durationMinutes,
      heartRate: num(body.heartRate),
      distanceKm: num(body.distanceKm),
      rpe: num(body.rpe),
      smartwatchKcal: num(body.smartwatchKcal),
      weightKg: Number(weight),
      age: age && age > 0 ? age : undefined,
      sex,
    });

    lines.push('');
    lines.push('Cálculos do servidor (fatos — não recalcule):');
    lines.push(...facts.lines);

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

    // A confiança sai da largura da faixa de incerteza, não da opinião do
    // modelo — e contradições detectadas aqui impedem que ela seja alta.
    const estimated = data.estimatedCalories as number;
    const range = normalizeRange(estimated, data.caloriesMin, data.caloriesMax);

    return NextResponse.json({
      estimatedCalories: estimated,
      caloriesMin: range?.min ?? null,
      caloriesMax: range?.max ?? null,
      intensity: typeof data.intensity === 'string' ? data.intensity : 'moderada',
      trainingLoad: typeof data.trainingLoad === 'string' ? data.trainingLoad : 'moderada',
      confidence: confidenceFromRange(estimated, range, facts.contradictions),
      metValue: data.metValue,
      summary: data.summary,
    });
  } catch (err) {
    return aiErrorResponse(err, 'workout-analyze', 'Erro ao analisar o treino. Tente novamente.');
  }
}
