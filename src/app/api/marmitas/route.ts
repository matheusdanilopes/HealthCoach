import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI, Type } from '@google/genai';
import { auth } from '@/auth';

let gemini: GoogleGenAI | null = null;
function getGemini(): GoogleGenAI {
  return (gemini ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! }));
}

const MARMITA_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    marmitas: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          nome:         { type: Type.STRING },
          descricao:    { type: Type.STRING },
          calorias:     { type: Type.INTEGER },
          proteina:     { type: Type.INTEGER },
          carboidratos: { type: Type.INTEGER },
          gordura:      { type: Type.INTEGER },
          ingredientes: { type: Type.ARRAY, items: { type: Type.STRING } },
          preparo:      { type: Type.STRING },
        },
        required: ['nome', 'descricao', 'calorias', 'proteina', 'carboidratos', 'gordura', 'ingredientes', 'preparo'],
      },
    },
  },
  required: ['marmitas'],
};

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const { targetCalories, proteinGoal, carbsGoal, fatGoal, preferences } = body;

  const macroHint = [
    proteinGoal ? `proteína: ${proteinGoal}g` : null,
    carbsGoal ? `carboidratos: ${carbsGoal}g` : null,
    fatGoal ? `gordura: ${fatGoal}g` : null,
  ]
    .filter(Boolean)
    .join(', ');

  const prompt = `Você é um nutricionista especialista em meal prep. Gere exatamente 3 sugestões de marmitas saudáveis e saborosas para uma pessoa com as seguintes metas nutricionais diárias:
- Calorias: ${targetCalories} kcal/dia${macroHint ? `\n- Macros: ${macroHint}` : ''}${preferences ? `\n- Preferências: ${preferences}` : ''}

Cada marmita deve ser uma refeição completa (almoço ou jantar) com aproximadamente 1/3 das calorias diárias.`;

  try {
    const ai = getGemini();
    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        responseMimeType: 'application/json',
        responseSchema: MARMITA_SCHEMA,
      },
    });

    const text = response.text;
    if (!text) throw new Error('No response text');
    const parsed = JSON.parse(text);

    return NextResponse.json(parsed);
  } catch {
    return NextResponse.json({ error: 'Failed to generate marmitas' }, { status: 500 });
  }
}
