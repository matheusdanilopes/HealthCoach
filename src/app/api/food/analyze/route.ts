import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { AIParseError, aiErrorResponse, generateJSON } from '@/lib/ai';
import type { GroqPart } from '@/lib/groq';

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
5. Em caso de dúvida → SUBESTIME
6. NUNCA use aspas duplas (") dentro dos textos de "name" ou "quantity" — isso quebra o JSON. Escreva polegadas, apelidos ou ênfases sem aspas`;

const ALLOWED_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // decoded size

function base64ByteLength(base64: string): number {
  const len = base64.length;
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.floor((len * 3) / 4) - padding;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

// Models occasionally send numbers as strings, negative or missing values.
function toNumber(value: unknown): number {
  const n = typeof value === 'string' ? Number(value.replace(',', '.')) : Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

// Coerces the AI payload into the shape the client expects and recomputes the
// totals from the items, so the summary always matches what is listed.
function normalizeFoodResponse(data: Record<string, unknown>): Record<string, unknown> | null {
  if (!Array.isArray(data.foods)) return null;
  const foods = (data.foods as unknown[])
    .filter((f): f is Record<string, unknown> => typeof f === 'object' && f !== null)
    .filter((f) => typeof f.name === 'string' && f.name.trim() !== '')
    .map((f) => {
      const item: Record<string, unknown> = {
        name: String(f.name).trim(),
        quantity: typeof f.quantity === 'string' ? f.quantity.trim() : String(f.quantity ?? ''),
        calories: Math.round(toNumber(f.calories)),
        protein: round1(toNumber(f.protein)),
        carbs: round1(toNumber(f.carbs)),
        fat: round1(toNumber(f.fat)),
      };
      const hydration = toNumber(f.hydration_ml);
      if (hydration > 0) item.hydration_ml = Math.round(hydration);
      if (typeof f.hydration_confidence === 'string') item.hydration_confidence = f.hydration_confidence;
      return item;
    });
  if (foods.length === 0) return null;

  const sum = (key: string) => foods.reduce((acc, f) => acc + (f[key] as number), 0);
  return {
    foods,
    totalCalories: Math.round(sum('calories')),
    totalProtein: round1(sum('protein')),
    totalCarbs: round1(sum('carbs')),
    totalFat: round1(sum('fat')),
    confidence: ['high', 'medium', 'low'].includes(data.confidence as string) ? data.confidence : 'medium',
    portionAssumption: ['small', 'medium', 'large'].includes(data.portionAssumption as string)
      ? data.portionAssumption
      : 'medium',
  };
}

// Last-resort recovery for when the model's JSON is the right shape but fails
// strict JSON.parse — typically an unescaped double quote inside a food name,
// or the response being cut off mid-array on long meals. Each food item is a
// flat object, so complete items can be pulled out individually instead of
// surfacing a parse error to the user.
function recoverFoodFields(raw: string): Record<string, unknown> | null {
  const numberField = (src: string, key: string): number | undefined => {
    const m = src.match(new RegExp(`"${key}"\\s*:\\s*(-?\\d+(?:\\.\\d+)?)`));
    return m ? Number(m[1]) : undefined;
  };
  // Lazy match up to the closing quote that is followed by a comma or the end
  // of the object, so a stray inner quote doesn't cut the value short.
  const stringField = (src: string, key: string): string | undefined => {
    const m = src.match(new RegExp(`"${key}"\\s*:\\s*"([\\s\\S]*?)"\\s*(?:,\\s*"|\\})`));
    return m ? m[1].trim() : undefined;
  };

  const foods: Record<string, unknown>[] = [];
  // Only fully closed item objects match, so a truncated trailing item is dropped.
  for (const [chunk] of raw.matchAll(/\{[^{}]*"name"[^{}]*\}/g)) {
    const calories = numberField(chunk, 'calories');
    if (calories === undefined) continue;
    foods.push({
      name: stringField(chunk, 'name'),
      quantity: stringField(chunk, 'quantity') ?? '',
      calories,
      protein: numberField(chunk, 'protein'),
      carbs: numberField(chunk, 'carbs'),
      fat: numberField(chunk, 'fat'),
      hydration_ml: numberField(chunk, 'hydration_ml'),
    });
  }

  const portion = raw.match(/"portionAssumption"\s*:\s*"(small|medium|large)"/);
  return normalizeFoodResponse({
    foods,
    // Items may have been dropped or mangled, so never claim high confidence.
    confidence: 'low',
    portionAssumption: portion?.[1],
  });
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

    let parts: GroqPart[];
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

    let data: Record<string, unknown>;
    try {
      data = await generateJSON({
        label: 'food-analyze',
        system: SYSTEM,
        parts,
        // Newer models can spend part of the output budget on hidden reasoning;
        // meals with many items need room for the full foods array or the
        // JSON is truncated mid-object.
        maxOutputTokens: 4096,
        temperature: 0.2,
        validate: (d) => normalizeFoodResponse(d) !== null,
      });
    } catch (err) {
      if (!(err instanceof AIParseError)) throw err;
      const recovered = err.raws.map(recoverFoodFields).find((r) => r !== null);
      if (!recovered) {
        return NextResponse.json(
          { error: 'Não foi possível interpretar a resposta da IA. Tente novamente ou descreva a refeição com mais detalhes.' },
          { status: 500 }
        );
      }
      data = recovered;
    }

    // validate/recover above guarantee this is non-null.
    return NextResponse.json(normalizeFoodResponse(data));
  } catch (err) {
    return aiErrorResponse(err, 'food-analyze', 'Erro ao analisar a refeição. Tente novamente.');
  }
}
