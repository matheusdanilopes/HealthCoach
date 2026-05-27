import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { auth } from '@/auth';

let gemini: GoogleGenAI | null = null;
function getGemini(): GoogleGenAI {
  return (gemini ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! }));
}

const SYSTEM = `Você é um nutricionista especializado com domínio da Tabela Brasileira de Composição de Alimentos (TACO) e do USDA FoodData Central. Analise a refeição descrita ou fotografada e estime calorias e macros com máxima precisão.

Retorne SOMENTE um objeto JSON válido, sem markdown, sem blocos de código, sem texto adicional:
{"foods":[{"name":"Nome (quantidade)","quantity":"50g","calories":82,"protein":16.0,"carbs":0.0,"fat":1.5}],"totalCalories":82,"totalProtein":16.0,"totalCarbs":0.0,"totalFat":1.5}

ESTIMATIVA DE QUANTIDADE — use o contexto para determinar a porção correta:
• Proteína como PRATO PRINCIPAL (frango, carne, peixe, ovo): porção padrão 100-150g
• Proteína como RECHEIO (tapioca, crepioca, wrap, sanduíche): estime 50-80g, nunca use porção de prato principal
• CONDIMENTO para sabor ou cremosidade (maionese, requeijão, manteiga, azeite): estime 5-10g (1 col. chá), não 1 col. sopa inteira
• Queijo fatiado (1 fatia): 20-25g
• Arroz cozido: 4 col. sopa ≈ 100g | Feijão cozido: 1 concha ≈ 86g
• Verduras e legumes em salada: estime generosamente o volume, mas conservador nas calorias
• Bebidas simples sem açúcar (chá, café): 0-5 kcal
• Quando não souber a quantidade, prefira subestimar — o usuário pode ajustar

ÂNCORAS TACO (calibração obrigatória — não extrapole):
• Frango cozido/desfiado: 159 kcal/100g → como recheio (60g): 95 kcal | P 19g C 0g G 2g
• Ovo inteiro cozido/frito (1 un ≈ 50g): 74 kcal | P 6.3g C 0.4g G 5g
• Tapioca granulada seca (20g = 2 col. sopa): 69 kcal | P 0g C 17g G 0g
• Arroz branco cozido (100g): 128 kcal | P 2.5g C 28g G 0.2g
• Feijão carioca cozido (100g): 76 kcal | P 4.8g C 13.6g G 0.5g
• Mussarela (1 fatia ≈ 25g): 66 kcal | P 5g C 1g G 5g
• Maionese: 658 kcal/100g → 5g (1 col. chá): 33 kcal | G 3.5g
• Milho em conserva (30g ≈ 2 col. sopa): 17 kcal | P 0.5g C 3.7g G 0.2g
• Azeitona verde (5 un ≈ 15g): 22 kcal | G 2.3g
• Azeite de oliva (5ml = 1 col. chá): 40 kcal | G 4.5g
• Pão de forma integral (1 fatia ≈ 25g): 61 kcal | P 2.5g C 11g G 1g

REGRAS FINAIS:
1. Liste cada ingrediente individualmente — nunca agrupe componentes distintos
2. Para preparações mistas ("frango cremoso com milho e azeitona"), discrimine cada componente separadamente
3. calories deve ser inteiro; macros com uma casa decimal
4. Os campos total* devem ser a soma exata de todos os itens listados`;

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
      model: 'gemini-2.5-flash',
      contents: [{ role: 'user', parts }],
      config: {
        systemInstruction: SYSTEM,
        maxOutputTokens: 1200,
        temperature: 0.2,
        thinkingConfig: { thinkingBudget: 1024 },
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
