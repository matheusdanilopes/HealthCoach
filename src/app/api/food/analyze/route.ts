import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { AIParseError, aiErrorResponse, generateJSON } from '@/lib/ai';
import type { GroqPart } from '@/lib/groq';
import { isNonBeverageFood } from '@/lib/beverages';
import { resolveFoodSafe, tacoNames } from '@/lib/nutrition/foods';

// A IA só identifica cada alimento e estima as gramas. kcal e macros são
// calculados pelo app (rótulo salvo pelo usuário → TACO → estimativa da IA,
// nessa ordem; ver src/lib/nutrition/foods.ts). A estimativa de kcal da IA só
// é usada quando o alimento não existe em nenhuma das duas tabelas.
const SYSTEM = `Você identifica alimentos de uma refeição descrita ou fotografada e estima o PESO de cada um. O app calcula as calorias pela TACO (Tabela Brasileira de Composição de Alimentos, 4ª edição) a partir do peso que você informar — por isso o peso é o dado mais importante.

PRINCÍPIO FUNDAMENTAL: NUNCA assuma 100g automaticamente para porções vagas. Prefira SEMPRE subestimar — o usuário pode corrigir depois.

Retorne SOMENTE JSON válido sem markdown, sem blocos de código:
{"foods":[{"name":"Arroz branco cozido","taco_name":"Arroz, tipo 1, cozido","quantity":"4 col. sopa","grams":100,"calories":128,"protein":2.5,"carbs":28.1,"fat":0.2}],"confidence":"medium","portionAssumption":"small"}

CAMPOS DE CADA ITEM:
• name: nome curto e natural do alimento, como o usuário falaria
• taco_name: copie EXATAMENTE uma descrição da LISTA TACO no fim destas instruções que seja o mesmo alimento, com o mesmo preparo (cru, cozido, frito, assado, grelhado...). Se não houver um equivalente fiel, use null — NUNCA escolha um preparo diferente (ex.: macarrão cozido ≠ "Macarrão, trigo, cru") nem invente uma descrição
• quantity: medida caseira legível ("1 concha", "2 fatias", "200 ml")
• grams: peso comestível em gramas (número). Líquidos: ml ≈ g
• calories, protein, carbs, fat: sua estimativa para esse peso — usada SÓ se o alimento não estiver na TACO
• Produto industrializado de marca (biscoito, barra, iogurte, whey...): name com a marca; taco_name só se houver o genérico equivalente na lista

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
• Para alimentos sólidos, pastosos e condimentos: omita o campo hydration_ml — mesmo que o nome contenha água, leite, chá ou café (ex.: bolacha de água e sal, doce de leite, leite condensado, creme de leite, maionese, pudim, bolo de café)
• Medidas caseiras NÃO indicam bebida: "colher de chá", "colher de sopa", "xícara de chá" são só unidades de medida
• Exemplo suco (200ml): "hydration_ml": 160 (200×0.80)

TERMOS VAGOS — interprete sempre de forma conservadora:
• "um pedaço" → 20-35g (frituras, mandioca, carne, bolo)
• "um pouco" → 5-15g
• "uma colher" sem especificação → sopa: 10-15g | chá: 5g
• "um punhado" → 20-30g
• "alguns/algumas" → 2-3 unidades
• Diminutivos (pedacinho, colherzinha, fatinha) → reduza 40% da estimativa normal
• Singular sem quantidade explícita → menor porção típica do alimento

PESOS DE REFERÊNCIA:
• Proteína PRATO PRINCIPAL (frango, carne, peixe): 80-120g
• Proteína RECHEIO (tapioca, crepioca, wrap, sanduíche): 40-60g
• Condimento (maionese, requeijão, manteiga, azeite): 5-10g (1 col. chá), nunca 1 col. sopa inteira
• Queijo fatiado (1 fatia): 20-25g | Pão francês: 50g | Pão de forma (1 fatia): 25g
• Ovo inteiro (1 un): 50g | Banana média sem casca: 80g
• Arroz cozido: 4 col. sopa ≈ 100g | Feijão: 1 concha ≈ 86g
• Tapioca granulada seca: 2 col. sopa ≈ 20g | Milho em conserva: 2 col. sopa ≈ 30g
• Mandioca frita "um pedaço" ≈ 30g | Batata frita porção restaurante: 60-80g
• Pastel pequeno: 70g | Amendoim (1 punhado): 20g | Azeitona (5 un): 15g
• Verduras/salada: volume generoso, peso real baixo
• Bebidas sem açúcar (chá, café): use o volume em ml como gramas

ANÁLISE DE IMAGEM:
• Não assuma prato cheio automaticamente — estime pelo que é visível
• Fotos exageram volume; considere profundidade limitada da câmera
• Prefira estimativa conservadora e indique confidence "medium" ou "low"

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
2. Preparações mistas: discrimine cada componente separadamente (cada um com seu peso)
3. grams e calories = inteiros; macros com uma casa decimal
4. Em caso de dúvida → SUBESTIME
5. NUNCA use aspas duplas (") dentro dos textos de "name", "taco_name" ou "quantity" — isso quebra o JSON. Escreva polegadas, apelidos ou ênfases sem aspas`;

// A lista oficial vai no prompt para a IA copiar a descrição exata.
async function systemPrompt(): Promise<string> {
  try {
    const names = await tacoNames();
    if (names.length) return `${SYSTEM}\n\nLISTA TACO (uma descrição por linha):\n${names.join('\n')}`;
  } catch (err) {
    console.error('[food-analyze] lista TACO indisponível:', err instanceof Error ? err.message : err);
  }
  return SYSTEM;
}

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
        taco_name: typeof f.taco_name === 'string' && f.taco_name.trim() ? f.taco_name.trim() : null,
        quantity: typeof f.quantity === 'string' ? f.quantity.trim() : String(f.quantity ?? ''),
        grams: toNumber(f.grams) || null,
        calories: Math.round(toNumber(f.calories)),
        protein: round1(toNumber(f.protein)),
        carbs: round1(toNumber(f.carbs)),
        fat: round1(toNumber(f.fat)),
      };
      // Solids/condiments never hydrate, even if the model returned a value.
      const hydration = isNonBeverageFood(item.name as string) ? 0 : toNumber(f.hydration_ml);
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
      taco_name: stringField(chunk, 'taco_name'),
      quantity: stringField(chunk, 'quantity') ?? '',
      grams: numberField(chunk, 'grams'),
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

type AnalyzedItem = Record<string, unknown> & { name: string };

// Troca a estimativa da IA pelo valor calculado (rótulo → TACO → estimado) e
// anexa a origem e a validação de cada item.
async function resolveItems(userId: string, data: Record<string, unknown>) {
  const foods = await Promise.all(
    (data.foods as AnalyzedItem[]).map(async (f) => {
      const r = await resolveFoodSafe(userId, {
        name: f.name,
        taco_name: f.taco_name as string | null,
        grams: f.grams as number | null,
        estimate: { calories: f.calories as number, protein: f.protein as number, carbs: f.carbs as number, fat: f.fat as number },
      });
      return {
        ...f,
        calories: r.calories,
        protein: r.protein ?? 0,
        carbs: r.carbs ?? 0,
        fat: r.fat ?? 0,
        grams: r.quantity_g,
        source: r.source,
        taco_food_id: r.taco_food_id,
        custom_food_id: r.custom_food_id,
        reference: r.reference,
        validation: r.validation,
        needs_review: r.needs_review,
        ask_label: r.ask_label,
      };
    }),
  );
  const sum = (key: 'calories' | 'protein' | 'carbs' | 'fat') => foods.reduce((acc, f) => acc + (Number(f[key]) || 0), 0);
  return {
    ...data,
    foods,
    totalCalories: Math.round(sum('calories')),
    totalProtein: round1(sum('protein')),
    totalCarbs: round1(sum('carbs')),
    totalFat: round1(sum('fat')),
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
        system: await systemPrompt(),
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
    const normalized = normalizeFoodResponse(data)!;
    return NextResponse.json(await resolveItems(session.user.id!, normalized));
  } catch (err) {
    return aiErrorResponse(err, 'food-analyze', 'Erro ao analisar a refeição. Tente novamente.');
  }
}
