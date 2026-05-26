import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { auth } from '@/auth';

let gemini: GoogleGenAI | null = null;
function getGemini(): GoogleGenAI {
  return (gemini ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! }));
}

const SYSTEM = `Você é um especialista em nutrição. Analise a refeição descrita ou fotografada.
Retorne SOMENTE um objeto JSON válido, sem markdown, sem blocos de código, sem texto adicional.
Use exatamente este formato:
{"foods":[{"name":"Nome","quantity":"200g","calories":320,"protein":45.0,"carbs":0.0,"fat":12.0}],"totalCalories":320,"totalProtein":45.0,"totalCarbs":0.0,"totalFat":12.0}

Regras:
- Liste cada alimento separadamente
- Estime quantidades em porções típicas brasileiras quando não especificado
- calories deve ser inteiro, macros com uma casa decimal
- Os campos total* são a soma de todos os alimentos`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractJSON(raw: string): any {
  // Strip markdown code fences if present
  const stripped = raw.replace(/```(?:json)?\s*/gi, '').replace(/```/g, '').trim();
  try {
    return JSON.parse(stripped);
  } catch {
    const match = stripped.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error('No JSON found in response');
  }
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let parts: any[];
    if (body.type === 'text') {
      if (!body.description?.trim()) {
        return NextResponse.json({ error: 'Missing description' }, { status: 400 });
      }
      parts = [{ text: `Refeição: ${body.description}` }];
    } else if (body.type === 'image') {
      if (!body.imageBase64) {
        return NextResponse.json({ error: 'Missing image' }, { status: 400 });
      }
      parts = [
        { inlineData: { mimeType: body.mimeType || 'image/jpeg', data: body.imageBase64 } },
        { text: 'Analise esta foto de refeição.' },
      ];
    } else {
      return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
    }

    const response = await getGemini().models.generateContent({
      model: 'gemini-1.5-flash',
      contents: [{ role: 'user', parts }],
      config: {
        systemInstruction: SYSTEM,
        maxOutputTokens: 1200,
        temperature: 0.2,
      },
    });

    const raw = response.text ?? '';
    if (!raw) {
      return NextResponse.json({ error: 'Empty response from AI' }, { status: 500 });
    }

    let data: Record<string, unknown>;
    try {
      data = extractJSON(raw);
    } catch (parseErr) {
      console.error('Analyze: JSON parse error', parseErr, 'raw:', raw.slice(0, 300));
      return NextResponse.json({ error: 'Failed to parse AI response' }, { status: 500 });
    }

    if (!Array.isArray(data.foods) || data.foods.length === 0) {
      return NextResponse.json({ error: 'Invalid AI response format' }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('Analyze API error:', msg);
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
