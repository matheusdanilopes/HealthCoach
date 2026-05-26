import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { auth } from '@/auth';

let gemini: GoogleGenAI | null = null;
function getGemini(): GoogleGenAI {
  return (gemini ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! }));
}

const SYSTEM = `Você é um especialista em nutrição. Analise a refeição e retorne SOMENTE um JSON válido com este formato exato:
{
  "foods": [
    {
      "name": "Nome do alimento",
      "quantity": "200g",
      "calories": 320,
      "protein": 45.0,
      "carbs": 0.0,
      "fat": 12.0
    }
  ],
  "totalCalories": 320,
  "totalProtein": 45.0,
  "totalCarbs": 0.0,
  "totalFat": 12.0
}

Regras:
- Liste cada alimento separadamente
- Estime quantidades baseadas em porções típicas brasileiras quando não especificado
- Use inteiros para calorias, decimais com uma casa para macros
- Os totais são a soma de todos os alimentos
- Retorne SOMENTE o JSON, sem texto adicional, sem markdown, sem blocos de código`;

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();

    let parts: Record<string, unknown>[];
    if (body.type === 'text') {
      if (!body.description?.trim()) {
        return NextResponse.json({ error: 'Missing description' }, { status: 400 });
      }
      parts = [{ text: `Refeição para analisar: ${body.description}` }];
    } else if (body.type === 'image') {
      if (!body.imageBase64) {
        return NextResponse.json({ error: 'Missing image' }, { status: 400 });
      }
      parts = [
        { inlineData: { mimeType: body.mimeType || 'image/jpeg', data: body.imageBase64 } },
        { text: 'Identifique os alimentos nesta foto de refeição e calcule os valores nutricionais.' },
      ];
    } else {
      return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
    }

    const response = await getGemini().models.generateContent({
      model: 'gemini-2.0-flash',
      contents: [{ role: 'user', parts }],
      config: {
        systemInstruction: SYSTEM,
        responseMimeType: 'application/json',
        maxOutputTokens: 1200,
        temperature: 0.2,
      },
    });

    const raw = response.text ?? '{}';

    let data: Record<string, unknown>;
    try {
      data = JSON.parse(raw);
    } catch {
      const match = raw.match(/\{[\s\S]*\}/);
      if (!match) {
        return NextResponse.json({ error: 'Failed to parse AI response' }, { status: 500 });
      }
      data = JSON.parse(match[0]);
    }

    if (!Array.isArray(data.foods)) {
      return NextResponse.json({ error: 'Invalid AI response format' }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (err) {
    console.error('Analyze API error:', err);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
