import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { auth } from '@/auth';
import { supabase } from '@/lib/db';
import { withGeminiRetry } from '@/lib/gemini-retry';

let gemini: GoogleGenAI | null = null;
function getGemini(): GoogleGenAI {
  return (gemini ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! }));
}

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
- summary: frase curta descritiva (máx 80 chars)`;

function extractJSON(raw: string): Record<string, unknown> {
  const stripped = raw.replace(/```(?:json)?\s*/gi, '').replace(/```/g, '').trim();
  try {
    return JSON.parse(stripped);
  } catch {
    const start = stripped.indexOf('{');
    if (start === -1) throw new Error('No JSON found in response');
    let depth = 0;
    let inString = false;
    let escape = false;
    for (let i = start; i < stripped.length; i++) {
      const ch = stripped[i];
      if (escape) { escape = false; continue; }
      if (ch === '\\' && inString) { escape = true; continue; }
      if (ch === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (ch === '{') depth++;
      else if (ch === '}' && --depth === 0) return JSON.parse(stripped.slice(start, i + 1));
    }
    throw new Error('No valid JSON object found in response');
  }
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();

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
    if (body.durationMinutes)       lines.push(`- Duração: ${body.durationMinutes} minutos`);
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

    const response = await withGeminiRetry(() =>
      getGemini().models.generateContent({
        model: 'gemini-3.5-flash',
        contents: [{ role: 'user', parts: [{ text: lines.join('\n') }] }],
        config: {
          systemInstruction: SYSTEM,
          maxOutputTokens: 300,
          temperature: 0.15,
        },
      })
    );

    const raw = response.text ?? '';
    if (!raw) return NextResponse.json({ error: 'Empty response from AI' }, { status: 500 });

    let data: Record<string, unknown>;
    try {
      data = extractJSON(raw);
    } catch {
      return NextResponse.json({ error: 'Failed to parse AI response' }, { status: 500 });
    }

    if (!data.estimatedCalories) {
      return NextResponse.json({ error: 'Invalid AI response format' }, { status: 500 });
    }

    // Ensure confidence field has a valid value
    const validConfidence = ['alta', 'média', 'baixa'];
    if (!validConfidence.includes(data.confidence as string)) {
      data.confidence = 'média';
    }

    return NextResponse.json(data);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('Workout analyze error:', msg);
    const is503 = msg.includes('503') || msg.includes('UNAVAILABLE') || msg.includes('high demand');
    const is429 = msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('quota');
    if (is503) {
      return NextResponse.json(
        { error: 'O modelo de IA está com alta demanda no momento. Tente novamente em alguns instantes.' },
        { status: 503 }
      );
    }
    if (is429) {
      return NextResponse.json(
        { error: 'Limite de requisições atingido. Aguarde alguns segundos e tente novamente.' },
        { status: 429 }
      );
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
