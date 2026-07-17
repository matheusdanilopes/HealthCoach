import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { auth } from '@/auth';
import { withGeminiRetry } from '@/lib/gemini-retry';
import { callGroq } from '@/lib/groq';

let gemini: GoogleGenAI | null = null;
function getGemini(): GoogleGenAI {
  return (gemini ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! }));
}

const SYSTEM = `Você é nutricionista especializado na TACO (Tabela Brasileira de Composição de Alimentos) e USDA. Analise a refeição descrita ou fotografada com MÁXIMO CONSERVADORISMO nutricional.

PRINCÍPIO FUNDAMENTAL: NUNCA assuma 100g automaticamente para porções vagas. Prefira SEMPRE subestimar — o usuário pode corrigir depois.

Retorne SOMENTE JSON válido sem markdown, sem blocos de código:
{"foods":[{"name":"Nome","quantity":"30g","calories":62,"protein":0.2,"carbs":10.0,"fat":2.5}],"totalCalories":62,"totalProtein":0.2,"totalCarbs":10.0,"totalFat":2.5,"confidence":"medium","portionAssumption":"small"}

HIDRATAÇÃO — campo opcional "hydration_ml" (inteiro) por item:
• Adicione "hydration_ml" APENAS para bebidas/líquidos hidratantes
• Fator de hidratação aplicado ao volume estimado (ml × fator = hydration_ml):
  - Água pura, água mineral, água com gás: 100%
  - Água de coco: 95%
  - Chá, café: 85%
  - Suco natural, limonada: 80%
  - Leite, kefir: 80%
  - Isotônico, kombucha: 75%
  - Caldo, sopa líquida: 50%
• NÃO adicionar hydration_ml para: álcool, refrigerantes, milkshakes, energéticos
• Para alimentos sólidos: omita o campo hydration_ml
• Exemplo suco (200ml): "hydration_ml": 160 (200×0.80)

TERMOS VAGOS — interprete sempre de forma conservadora:
• "um pedaço" → 20-35g (frituras, mandioca, carne, bolo)
• "um pouco" → 5-15g
• "uma colher" sem especificação → sopa: 10-15g | chá: 5g
• "um punhado" → 20-30g
• "alguns/algumas" → 2-3 unidades
• Diminutivos (pedacinho, colherzinha, fatinha) → reduza 40% da estimativa normal
• Singular sem quantidade explícita → menor porção típica do alimento

PORÇÕES PADRÃO:
• Proteína PRATO PRINCIPAL (frango, carne, peixe): 80-120g
• Proteína RECHEIO (tapioca, crepioca, wrap, sanduíche): 40-60g
• Condimento (maionese, requeijão, manteiga, azeite): 5-10g (1 col. chá), nunca 1 col. sopa inteira
• Queijo fatiado (1 fatia): 20-25g
• Arroz cozido: 4 col. sopa ≈ 100g | Feijão: 1 concha ≈ 86g
• Verduras/salada: volume generoso, calorias conservadoras
• Bebidas sem açúcar (chá, café): 0-5 kcal

ANÁLISE DE IMAGEM:
• Não assuma prato cheio automaticamente — estime pelo que é visível
• Fotos exageram volume; considere profundidade limitada da câmera
• Prefira estimativa conservadora e indique confidence "medium" ou "low"

ÂNCORAS TACO (calibração obrigatória — não extrapole):
• Frango cozido/desfiado: 159 kcal/100g → recheio 60g: 95 kcal | P 19g C 0g G 2g
• Ovo inteiro (1 un ≈ 50g): 74 kcal | P 6.3g C 0.4g G 5g
• Arroz branco cozido (100g): 128 kcal | P 2.5g C 28g G 0.2g
• Feijão carioca cozido (100g): 76 kcal | P 4.8g C 13.6g G 0.5g
• Pão francês (1 un ≈ 50g): 135 kcal | P 4g C 27g G 1g
• Pão de forma integral (1 fatia ≈ 25g): 61 kcal | P 2.5g C 11g G 1g
• Mussarela (1 fatia ≈ 25g): 66 kcal | P 5g C 1g G 5g
• Maionese: 658 kcal/100g → 5g (1 col. chá): 33 kcal | G 3.5g
• Azeite de oliva (5ml = 1 col. chá): 40 kcal | G 4.5g
• Tapioca granulada seca (20g = 2 col. sopa): 69 kcal | C 17g
• Milho em conserva (30g ≈ 2 col. sopa): 17 kcal | P 0.5g C 3.7g G 0.2g
• Azeitona verde (5 un ≈ 15g): 22 kcal | G 2.3g
• MANDIOCA FRITA (100g): 207 kcal → "um pedaço" (30g) = 62 kcal | P 0.2g C 10g G 2.5g
• MANDIOCA cozida (100g): 125 kcal | P 0.6g C 30g G 0g
• BATATA FRITA (100g): 180 kcal | P 2g C 23g G 9g → porção restaurante: 60-80g
• BATATA cozida (100g): 87 kcal | P 1.8g C 19g G 0.1g
• Banana (1 un média ≈ 80g sem casca): 70 kcal | P 1.3g C 17g G 0.1g
• Pastel pequeno (1 un ≈ 70g): 225 kcal | P 6g C 22g G 12g
• Amendoim torrado (1 punhado ≈ 20g): 118 kcal | P 5g C 3g G 10g

ALIMENTOS CRÍTICOS (atenção redobrada nas porções): frituras, arroz, massas, doces, fast food, castanhas, molhos, queijos, mandioca, batata frita.

CONFIDENCE (obrigatório no JSON):
• "high" = quantidade explícita ("200g de frango", "2 ovos")
• "medium" = contexto claro mas sem peso exato
• "low" = descrição vaga ("comida", "um pouco de algo")

PORTION_ASSUMPTION (obrigatório no JSON):
• "small" = singular, diminutivo, "um/uma", "pouco", "pedaço"
• "medium" = contexto neutro sem indicador de tamanho
• "large" = "prato cheio", múltiplas unidades, 300g+

REGRAS FINAIS:
1. Liste cada ingrediente individualmente — nunca agrupe componentes distintos
2. Preparações mistas: discrimine cada componente separadamente
3. calories = inteiro; macros com uma casa decimal
4. total* = soma exata dos itens listados
5. Em caso de dúvida → SUBESTIME`;

const ALLOWED_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // decoded size

function base64ByteLength(base64: string): number {
  const len = base64.length;
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.floor((len * 3) / 4) - padding;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractJSON(raw: string): any {
  const stripped = raw.replace(/```(?:json)?\s*/gi, '').replace(/```/g, '').trim();
  try {
    return JSON.parse(stripped);
  } catch {
    // Use balanced-brace extraction so trailing text with braces doesn't break the parse
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: 'Não foi possível ler a requisição. A imagem pode ser grande demais ou os dados estão corrompidos.' },
        { status: 400 }
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let parts: any[];
    if (body.type === 'text') {
      if (!body.description?.trim()) {
        return NextResponse.json({ error: 'Missing description' }, { status: 400 });
      }
      parts = [{ text: `Refeição: ${body.description}` }];
    } else if (body.type === 'image') {
      if (!body.imageBase64 || typeof body.imageBase64 !== 'string') {
        return NextResponse.json({ error: 'Missing image' }, { status: 400 });
      }
      const mimeType = body.mimeType || 'image/jpeg';
      if (!ALLOWED_IMAGE_MIME_TYPES.includes(mimeType)) {
        return NextResponse.json(
          { error: 'Formato de imagem não suportado. Use JPG, PNG ou WEBP.' },
          { status: 400 }
        );
      }
      if (base64ByteLength(body.imageBase64) > MAX_IMAGE_BYTES) {
        return NextResponse.json(
          { error: 'Imagem muito grande. Tente uma foto com menor resolução.' },
          { status: 413 }
        );
      }
      parts = [
        { inlineData: { mimeType, data: body.imageBase64 } },
        { text: 'Analise esta foto de refeição.' },
      ];
    } else {
      return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
    }

    let raw: string;
    try {
      const response = await withGeminiRetry(() =>
        getGemini().models.generateContent({
          model: 'gemini-3.5-flash',
          contents: [{ role: 'user', parts }],
          config: {
            systemInstruction: SYSTEM,
            maxOutputTokens: 2048,
            temperature: 0.2,
          },
        })
      );
      raw = response.text ?? '';
      if (!raw) throw new Error('Empty response from AI');
    } catch (geminiErr) {
      const geminiMsg = geminiErr instanceof Error ? geminiErr.message : String(geminiErr);
      console.error('Analyze: Gemini failed, falling back to Groq:', geminiMsg);
      try {
        raw = await callGroq(SYSTEM, parts);
      } catch (groqErr) {
        console.error('Analyze: Groq fallback also failed:', groqErr instanceof Error ? groqErr.message : groqErr);
        throw geminiErr;
      }
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
