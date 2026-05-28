import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { auth } from '@/auth';
import { supabase } from '@/lib/db';

let gemini: GoogleGenAI | null = null;
function getGemini(): GoogleGenAI {
  return (gemini ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! }));
}

const SYSTEM = `Você é um especialista em ciências do esporte e metabolismo energético. Analise o treino descrito e estime o gasto calórico com base nos dados fornecidos.
Considere: tipo de exercício, intensidade, duração, dados biométricos do usuário e quaisquer dados adicionais.
Retorne SOMENTE um objeto JSON válido, sem markdown, sem blocos de código, sem texto adicional.
Use exatamente este formato:
{"estimatedCalories":520,"intensity":"alta","trainingLoad":"moderada","summary":"Treino intenso de musculação com foco em membros inferiores"}

Regras:
- estimatedCalories: número inteiro realista (use tabelas de MET como referência)
- intensity: exatamente um de "baixa" | "moderada" | "alta" | "muito alta"
- trainingLoad: exatamente um de "leve" | "moderada" | "alta" | "muito alta"
- summary: frase curta e objetiva descrevendo o treino (máx 80 caracteres)
- Seja realista e conservador nas estimativas`;

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

    const { data: profile } = await supabase
      .from('users')
      .select('current_weight, sex, birth_date, height_cm')
      .eq('id', session.user.id)
      .single();

    const lines: string[] = ['Dados do treino:'];
    if (body.description?.trim()) lines.push(`- Descrição: ${body.description.trim()}`);
    if (body.workoutType) lines.push(`- Tipo: ${body.workoutType}`);
    if (body.intensity) lines.push(`- Intensidade declarada: ${body.intensity}`);
    if (body.durationMinutes) lines.push(`- Duração: ${body.durationMinutes} minutos`);
    if (body.heartRate) lines.push(`- Frequência cardíaca média: ${body.heartRate} bpm`);
    if (body.distanceKm) lines.push(`- Distância percorrida: ${body.distanceKm} km`);
    if (body.loadKg) lines.push(`- Carga total movimentada: ${body.loadKg} kg`);
    if (body.notes?.trim()) lines.push(`- Observações: ${body.notes.trim()}`);

    lines.push('');
    lines.push('Perfil do usuário:');
    lines.push(`- Peso atual: ${profile?.current_weight ?? 75} kg`);
    if (profile?.sex) lines.push(`- Sexo: ${profile.sex === 'male' ? 'masculino' : 'feminino'}`);
    if (profile?.birth_date) {
      const age = Math.floor(
        (Date.now() - new Date(profile.birth_date).getTime()) / (365.25 * 24 * 3600 * 1000)
      );
      lines.push(`- Idade: ${age} anos`);
    }
    if (profile?.height_cm) lines.push(`- Altura: ${profile.height_cm} cm`);

    const response = await getGemini().models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [{ role: 'user', parts: [{ text: lines.join('\n') }] }],
      config: {
        systemInstruction: SYSTEM,
        maxOutputTokens: 300,
        temperature: 0.2,
        thinkingConfig: { thinkingBudget: 0 },
      },
    });

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

    return NextResponse.json(data);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('Workout analyze error:', msg);
    const is429 = msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('quota');
    if (is429) {
      return NextResponse.json(
        { error: 'Limite de requisições atingido. Aguarde alguns segundos e tente novamente.' },
        { status: 429 }
      );
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
