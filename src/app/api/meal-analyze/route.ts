import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { auth } from '@/auth';

let gemini: GoogleGenAI | null = null;
function getGemini(): GoogleGenAI {
  return (gemini ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! }));
}

const JSON_SCHEMA = `{
  "foods": [{"name":"string","quantity":"string","calories":0,"protein":0,"carbs":0,"fat":0}],
  "totalCalories":0,"totalProtein":0,"totalCarbs":0,"totalFat":0
}`;

const BASE_PROMPT = `Analise a refeição e retorne SOMENTE JSON válido sem markdown, seguindo exatamente este esquema:
${JSON_SCHEMA}
Valores em kcal e gramas. Use estimativas da culinária brasileira quando a porção não for especificada.`;

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { type, text, imageBase64, mimeType } = body as {
    type: 'text' | 'image';
    text?: string;
    imageBase64?: string;
    mimeType?: string;
  };

  if (type === 'text' && !text?.trim()) {
    return NextResponse.json({ error: 'Texto é obrigatório' }, { status: 400 });
  }
  if (type === 'image' && !imageBase64) {
    return NextResponse.json({ error: 'Imagem é obrigatória' }, { status: 400 });
  }

  const parts =
    type === 'image'
      ? [
          { inlineData: { mimeType: mimeType ?? 'image/jpeg', data: imageBase64! } },
          { text: `Identifique os alimentos nesta imagem e calcule os macros nutricionais.\n${BASE_PROMPT}` },
        ]
      : [{ text: `Refeição: "${text}"\n\n${BASE_PROMPT}` }];

  try {
    const response = await getGemini().models.generateContent({
      model: 'gemini-2.0-flash',
      contents: [{ role: 'user', parts }],
      config: { maxOutputTokens: 800, temperature: 0.1 },
    });

    const raw = response.text ?? '';
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('Resposta inválida da IA');

    const parsed = JSON.parse(match[0]);
    if (!Array.isArray(parsed.foods)) throw new Error('Estrutura inválida');

    return NextResponse.json(parsed);
  } catch (err) {
    console.error('meal-analyze error:', err);
    return NextResponse.json({ error: 'Falha na análise. Tente novamente.' }, { status: 500 });
  }
}
