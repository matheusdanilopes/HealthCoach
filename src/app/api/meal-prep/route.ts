import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { auth } from '@/auth';
import { supabase } from '@/lib/db';
import { withGeminiRetry } from '@/lib/gemini-retry';
import { brazilToday, brazilNDaysAgo } from '@/lib/timezone';

type GoalType = 'emagrecimento' | 'manutencao' | 'massa';
type BudgetType = 'economico' | 'moderado' | 'premium';

interface MealItem {
  name: string;
  protein_source: string;
  carb_source: string;
  vegetable: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

interface ShoppingItem {
  name: string;
  amount: string;
  category: 'proteinas' | 'carboidratos' | 'hortifruti' | 'temperos' | 'outros';
  total_cost: number;
}

interface GeneratedPlan {
  title: string;
  meals: MealItem[];
  avg_calories: number;
  avg_protein: number;
  avg_carbs: number;
  avg_fat: number;
  estimated_cost: number;
  cost_per_meal: number;
  shopping_list: ShoppingItem[];
  ai_explanation: string;
}

let gemini: GoogleGenAI | null = null;
function getGemini(): GoogleGenAI {
  return (gemini ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! }));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractJSON(raw: string): any {
  const stripped = raw.replace(/```(?:json)?\s*/gi, '').replace(/```/g, '').trim();
  try { return JSON.parse(stripped); } catch { /**/ }
  const start = stripped.indexOf('{');
  if (start === -1) throw new Error('No JSON');
  let depth = 0, inString = false, escape = false;
  for (let i = start; i < stripped.length; i++) {
    const ch = stripped[i];
    if (escape) { escape = false; continue; }
    if (ch === '\\' && inString) { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) return JSON.parse(stripped.slice(start, i + 1));
  }
  throw new Error('No valid JSON');
}

function getFallback(goal: GoalType, mealCount: number, variant: number): GeneratedPlan {
  const s = mealCount / 10;

  const templates: Record<GoalType, GeneratedPlan[]> = {
    emagrecimento: [
      {
        title: 'Cardápio Leve e Proteico',
        meals: [
          { name: 'Frango grelhado com arroz integral e brócolis', protein_source: 'Frango grelhado', carb_source: 'Arroz integral', vegetable: 'Brócolis', calories: 420, protein_g: 42, carbs_g: 35, fat_g: 8 },
          { name: 'Carne moída magra com batata doce e cenoura', protein_source: 'Carne moída magra', carb_source: 'Batata doce', vegetable: 'Cenoura', calories: 450, protein_g: 38, carbs_g: 45, fat_g: 12 },
          { name: 'Tilápia assada com arroz e abobrinha', protein_source: 'Tilápia assada', carb_source: 'Arroz integral', vegetable: 'Abobrinha', calories: 380, protein_g: 40, carbs_g: 32, fat_g: 7 },
          { name: 'Frango desfiado com mandioquinha e espinafre', protein_source: 'Frango desfiado', carb_source: 'Mandioquinha', vegetable: 'Espinafre', calories: 410, protein_g: 38, carbs_g: 40, fat_g: 9 },
        ],
        avg_calories: 415, avg_protein: 40, avg_carbs: 38, avg_fat: 9,
        estimated_cost: Math.round(95 * s), cost_per_meal: 9.5,
        shopping_list: [
          { name: 'Peito de frango', amount: `${(2.5 * s).toFixed(1)}kg`, category: 'proteinas', total_cost: Math.round(37 * s) },
          { name: 'Carne moída magra', amount: `${(1 * s).toFixed(1)}kg`, category: 'proteinas', total_cost: Math.round(18 * s) },
          { name: 'Tilápia', amount: `${(0.8 * s).toFixed(1)}kg`, category: 'proteinas', total_cost: Math.round(14 * s) },
          { name: 'Arroz integral', amount: `${(1.5 * s).toFixed(1)}kg`, category: 'carboidratos', total_cost: Math.round(9 * s) },
          { name: 'Batata doce', amount: `${(1.2 * s).toFixed(1)}kg`, category: 'carboidratos', total_cost: Math.round(7 * s) },
          { name: 'Mandioquinha', amount: `${(0.8 * s).toFixed(1)}kg`, category: 'carboidratos', total_cost: Math.round(5 * s) },
          { name: 'Brócolis', amount: `${(0.6 * s).toFixed(1)}kg`, category: 'hortifruti', total_cost: Math.round(4 * s) },
          { name: 'Cenoura', amount: `${(0.5 * s).toFixed(1)}kg`, category: 'hortifruti', total_cost: Math.round(3 * s) },
          { name: 'Abobrinha', amount: `${(0.5 * s).toFixed(1)}kg`, category: 'hortifruti', total_cost: Math.round(3 * s) },
          { name: 'Alho, cebola e temperos', amount: '1 kit', category: 'temperos', total_cost: Math.round(7 * s) },
        ],
        ai_explanation: 'Cardápio rico em proteínas magras e carboidratos complexos, promovendo saciedade e déficit calórico sustentável.',
      },
      {
        title: 'Cardápio Variado Leve',
        meals: [
          { name: 'Salmão grelhado com quinoa e aspargos', protein_source: 'Salmão grelhado', carb_source: 'Quinoa', vegetable: 'Aspargos', calories: 440, protein_g: 38, carbs_g: 30, fat_g: 16 },
          { name: 'Peito de peru com arroz e brócolis', protein_source: 'Peito de peru', carb_source: 'Arroz integral', vegetable: 'Brócolis', calories: 390, protein_g: 42, carbs_g: 34, fat_g: 6 },
          { name: 'Omelete assado com batata doce e espinafre', protein_source: 'Omelete assado', carb_source: 'Batata doce', vegetable: 'Espinafre', calories: 400, protein_g: 30, carbs_g: 38, fat_g: 12 },
        ],
        avg_calories: 410, avg_protein: 37, avg_carbs: 34, avg_fat: 11,
        estimated_cost: Math.round(110 * s), cost_per_meal: 11.0,
        shopping_list: [
          { name: 'Salmão', amount: `${(0.8 * s).toFixed(1)}kg`, category: 'proteinas', total_cost: Math.round(40 * s) },
          { name: 'Peito de peru', amount: `${(1.5 * s).toFixed(1)}kg`, category: 'proteinas', total_cost: Math.round(25 * s) },
          { name: 'Ovos', amount: `${Math.round(12 * s)} unidades`, category: 'proteinas', total_cost: Math.round(12 * s) },
          { name: 'Quinoa', amount: `${(0.6 * s).toFixed(1)}kg`, category: 'carboidratos', total_cost: Math.round(15 * s) },
          { name: 'Arroz integral', amount: `${(1 * s).toFixed(1)}kg`, category: 'carboidratos', total_cost: Math.round(6 * s) },
          { name: 'Batata doce', amount: `${(1 * s).toFixed(1)}kg`, category: 'carboidratos', total_cost: Math.round(6 * s) },
          { name: 'Brócolis', amount: `${(0.6 * s).toFixed(1)}kg`, category: 'hortifruti', total_cost: Math.round(4 * s) },
          { name: 'Espinafre', amount: `${(0.4 * s).toFixed(1)}kg`, category: 'hortifruti', total_cost: Math.round(4 * s) },
          { name: 'Aspargos', amount: `${(0.4 * s).toFixed(1)}kg`, category: 'hortifruti', total_cost: Math.round(8 * s) },
          { name: 'Temperos e azeite', amount: '1 kit', category: 'temperos', total_cost: Math.round(8 * s) },
        ],
        ai_explanation: 'Combinação de proteínas nobres com gorduras saudáveis e vegetais ricos em fibras, favorecendo emagrecimento com qualidade nutricional.',
      },
    ],
    manutencao: [
      {
        title: 'Cardápio Equilibrado',
        meals: [
          { name: 'Frango grelhado com arroz, feijão e salada', protein_source: 'Frango grelhado', carb_source: 'Arroz e feijão', vegetable: 'Mix de salada', calories: 520, protein_g: 45, carbs_g: 55, fat_g: 10 },
          { name: 'Patinho assado com macarrão integral e legumes', protein_source: 'Patinho assado', carb_source: 'Macarrão integral', vegetable: 'Mix de legumes', calories: 560, protein_g: 42, carbs_g: 62, fat_g: 12 },
          { name: 'Tilápia grelhada com arroz e cenoura', protein_source: 'Tilápia grelhada', carb_source: 'Arroz branco', vegetable: 'Cenoura refogada', calories: 480, protein_g: 40, carbs_g: 52, fat_g: 8 },
          { name: 'Frango refogado com batata e brócolis', protein_source: 'Frango refogado', carb_source: 'Batata', vegetable: 'Brócolis', calories: 510, protein_g: 40, carbs_g: 52, fat_g: 10 },
        ],
        avg_calories: 518, avg_protein: 42, avg_carbs: 55, avg_fat: 10,
        estimated_cost: Math.round(125 * s), cost_per_meal: 12.5,
        shopping_list: [
          { name: 'Peito de frango', amount: `${(2 * s).toFixed(1)}kg`, category: 'proteinas', total_cost: Math.round(30 * s) },
          { name: 'Patinho bovino', amount: `${(0.8 * s).toFixed(1)}kg`, category: 'proteinas', total_cost: Math.round(22 * s) },
          { name: 'Tilápia', amount: `${(0.6 * s).toFixed(1)}kg`, category: 'proteinas', total_cost: Math.round(11 * s) },
          { name: 'Arroz branco', amount: `${(1 * s).toFixed(1)}kg`, category: 'carboidratos', total_cost: Math.round(6 * s) },
          { name: 'Feijão carioca', amount: `${(0.6 * s).toFixed(1)}kg`, category: 'carboidratos', total_cost: Math.round(6 * s) },
          { name: 'Macarrão integral', amount: `${(0.5 * s).toFixed(1)}kg`, category: 'carboidratos', total_cost: Math.round(5 * s) },
          { name: 'Batata', amount: `${(0.8 * s).toFixed(1)}kg`, category: 'carboidratos', total_cost: Math.round(5 * s) },
          { name: 'Brócolis', amount: `${(0.6 * s).toFixed(1)}kg`, category: 'hortifruti', total_cost: Math.round(4 * s) },
          { name: 'Cenoura', amount: `${(0.5 * s).toFixed(1)}kg`, category: 'hortifruti', total_cost: Math.round(3 * s) },
          { name: 'Mix de legumes', amount: `${(0.6 * s).toFixed(1)}kg`, category: 'hortifruti', total_cost: Math.round(5 * s) },
          { name: 'Temperos e condimentos', amount: '1 kit', category: 'temperos', total_cost: Math.round(8 * s) },
        ],
        ai_explanation: 'Cardápio completo e variado com proteínas, carboidratos complexos e legumes, ideal para manutenção do peso e energia estável.',
      },
    ],
    massa: [
      {
        title: 'Cardápio Hiperproteico',
        meals: [
          { name: 'Frango com arroz, batata doce e brócolis', protein_source: 'Peito de frango', carb_source: 'Arroz + batata doce', vegetable: 'Brócolis', calories: 650, protein_g: 58, carbs_g: 72, fat_g: 10 },
          { name: 'Carne moída com macarrão integral e legumes', protein_source: 'Carne moída', carb_source: 'Macarrão integral', vegetable: 'Mix de legumes', calories: 680, protein_g: 55, carbs_g: 75, fat_g: 14 },
          { name: 'Tilápia com arroz integral e feijão', protein_source: 'Tilápia', carb_source: 'Arroz integral + feijão', vegetable: 'Cenoura', calories: 620, protein_g: 52, carbs_g: 70, fat_g: 8 },
          { name: 'Omelete proteico com batata e espinafre', protein_source: 'Omelete (4 ovos)', carb_source: 'Batata', vegetable: 'Espinafre', calories: 590, protein_g: 50, carbs_g: 55, fat_g: 16 },
          { name: 'Frango desfiado com mandioca e couve', protein_source: 'Frango desfiado', carb_source: 'Mandioca', vegetable: 'Couve', calories: 640, protein_g: 55, carbs_g: 68, fat_g: 11 },
        ],
        avg_calories: 636, avg_protein: 54, avg_carbs: 68, avg_fat: 12,
        estimated_cost: Math.round(145 * s), cost_per_meal: 14.5,
        shopping_list: [
          { name: 'Peito de frango', amount: `${(3 * s).toFixed(1)}kg`, category: 'proteinas', total_cost: Math.round(45 * s) },
          { name: 'Carne moída', amount: `${(1.2 * s).toFixed(1)}kg`, category: 'proteinas', total_cost: Math.round(22 * s) },
          { name: 'Tilápia', amount: `${(0.8 * s).toFixed(1)}kg`, category: 'proteinas', total_cost: Math.round(14 * s) },
          { name: 'Ovos', amount: `${Math.round(20 * s)} unidades`, category: 'proteinas', total_cost: Math.round(16 * s) },
          { name: 'Arroz integral', amount: `${(2 * s).toFixed(1)}kg`, category: 'carboidratos', total_cost: Math.round(12 * s) },
          { name: 'Batata doce', amount: `${(2 * s).toFixed(1)}kg`, category: 'carboidratos', total_cost: Math.round(10 * s) },
          { name: 'Feijão', amount: `${(0.8 * s).toFixed(1)}kg`, category: 'carboidratos', total_cost: Math.round(7 * s) },
          { name: 'Mandioca', amount: `${(0.8 * s).toFixed(1)}kg`, category: 'carboidratos', total_cost: Math.round(6 * s) },
          { name: 'Brócolis', amount: `${(0.8 * s).toFixed(1)}kg`, category: 'hortifruti', total_cost: Math.round(5 * s) },
          { name: 'Legumes variados', amount: `${(1 * s).toFixed(1)}kg`, category: 'hortifruti', total_cost: Math.round(8 * s) },
          { name: 'Temperos e azeite', amount: '1 kit', category: 'temperos', total_cost: Math.round(10 * s) },
        ],
        ai_explanation: 'Cardápio hipercalórico e hiperproteico para maximizar ganho de massa muscular com carboidratos de qualidade e proteínas completas.',
      },
    ],
  };

  const options = templates[goal];
  return options[variant % options.length];
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const userId = session.user.id;
    const body = await req.json();

    const config = body.config as { mealCount: number; budget: BudgetType; goal: GoalType };
    const existingMealNames: string[] = body.existingMealNames ?? [];
    const planIndex: number = body.planIndex ?? 0;

    const today = brazilToday();
    const thirtyDaysAgo = brazilNDaysAgo(30, today);

    const [{ data: profile }, { data: foodLogs }] = await Promise.all([
      supabase
        .from('users')
        .select('current_weight, target_calories, target_protein_g, sex')
        .eq('id', userId)
        .single(),
      supabase
        .from('food_logs')
        .select('food_name, calories, protein, carbs, fat, log_date')
        .eq('user_id', userId)
        .gte('log_date', thirtyDaysAgo)
        .gt('calories', 0)
        .order('created_at', { ascending: false })
        .limit(200),
    ]);

    const byDate: Record<string, { cal: number; prot: number; carbs: number; fat: number }> = {};
    for (const log of foodLogs ?? []) {
      if (!byDate[log.log_date]) byDate[log.log_date] = { cal: 0, prot: 0, carbs: 0, fat: 0 };
      byDate[log.log_date].cal   += log.calories;
      byDate[log.log_date].prot  += log.protein ?? 0;
      byDate[log.log_date].carbs += log.carbs ?? 0;
      byDate[log.log_date].fat   += log.fat ?? 0;
    }
    const histDates = Object.keys(byDate);
    const histVals  = Object.values(byDate);
    const avgCal   = histDates.length > 0 ? Math.round(histVals.reduce((s, v) => s + v.cal, 0) / histDates.length) : (profile?.target_calories ?? 2000);
    const avgProt  = histDates.length > 0 ? Math.round(histVals.reduce((s, v) => s + v.prot, 0) / histDates.length) : 130;
    const avgCarbs = histDates.length > 0 ? Math.round(histVals.reduce((s, v) => s + v.carbs, 0) / histDates.length) : 170;
    const avgFat   = histDates.length > 0 ? Math.round(histVals.reduce((s, v) => s + v.fat, 0) / histDates.length) : 55;

    const foodCounts: Record<string, number> = {};
    for (const log of foodLogs ?? []) {
      const name = (log.food_name ?? '').toLowerCase().trim();
      if (name) foodCounts[name] = (foodCounts[name] ?? 0) + 1;
    }
    const frequentFoods = Object.entries(foodCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([name]) => name);

    const uniqueMealsCount = Math.min(Math.max(Math.ceil(config.mealCount / 2), 3), 6);

    const budgetMap: Record<BudgetType, string> = {
      economico: `econômico (R$ ${Math.round(config.mealCount * 9)}-${Math.round(config.mealCount * 11)} para ${config.mealCount} marmitas)`,
      moderado:  `moderado (R$ ${Math.round(config.mealCount * 13)}-${Math.round(config.mealCount * 16)} para ${config.mealCount} marmitas)`,
      premium:   `premium (R$ ${Math.round(config.mealCount * 19)}-${Math.round(config.mealCount * 23)} para ${config.mealCount} marmitas)`,
    };
    const goalMap: Record<GoalType, string> = {
      emagrecimento: 'emagrecimento — déficit calórico, alta proteína, carboidratos complexos',
      manutencao:    'manutenção — calorias ≈ gasto, macros equilibrados',
      massa:         'ganho de massa — superávit calórico, muito proteína, carboidratos generosos',
    };

    const avoidSection = existingMealNames.length > 0
      ? `\nEVITAR (já em cardápios aprovados):\n${existingMealNames.slice(0, 10).map((n) => `• ${n}`).join('\n')}\n`
      : '';

    const prompt = `Você é nutricionista especializado em meal prep saudável para brasileiros.

PERFIL:
• Objetivo: ${goalMap[config.goal]}
• Meta calórica: ${profile?.target_calories ?? avgCal}kcal/dia | Proteína: ${profile?.target_protein_g ?? Math.round(((profile?.target_calories ?? avgCal) * 0.3) / 4)}g/dia
• Peso: ${profile?.current_weight ?? '?'}kg | Sexo: ${profile?.sex === 'female' ? 'F' : 'M'}
• Média atual (30d): ${avgCal}kcal · ${avgProt}g prot · ${avgCarbs}g carbs · ${avgFat}g gord
• Alimentos frequentes: ${frequentFoods.length > 0 ? frequentFoods.join(', ') : 'não identificados'}

CONFIGURAÇÃO:
• Total de marmitas: ${config.mealCount}
• Orçamento: ${budgetMap[config.budget]}
• Refeições únicas: ${uniqueMealsCount} (repetidas para completar ${config.mealCount} marmitas)
${avoidSection}
Gere ${uniqueMealsCount} refeições DIFERENTES com proteínas VARIADAS (ex: frango, carne, peixe, ovos).
Calcule os ingredientes para o TOTAL de ${config.mealCount} marmitas.
Use preços médios de mercado brasileiro 2025.

Retorne SOMENTE JSON válido (sem texto fora, sem markdown):
{
  "title": "Cardápio Econômico|Variado|Proteico|Premium|Leve (escolha baseado no contexto)",
  "meals": [
    {
      "name": "Nome completo da refeição",
      "protein_source": "Proteína principal",
      "carb_source": "Carboidrato principal",
      "vegetable": "Legume ou verdura",
      "calories": 480,
      "protein_g": 45,
      "carbs_g": 42,
      "fat_g": 8
    }
  ],
  "avg_calories": 480,
  "avg_protein": 45,
  "avg_carbs": 42,
  "avg_fat": 8,
  "estimated_cost": 115,
  "cost_per_meal": 11.5,
  "shopping_list": [
    { "name": "Peito de frango", "amount": "3kg", "category": "proteinas", "total_cost": 45.0 }
  ],
  "ai_explanation": "1-2 frases sobre por que este cardápio atende ao objetivo e perfil."
}
Categorias válidas: "proteinas", "carboidratos", "hortifruti", "temperos", "outros"`;

    console.log(`[meal-prep] Calling Gemini | goal=${config.goal} | budget=${config.budget} | meals=${config.mealCount} | planIndex=${planIndex}`);

    const response = await withGeminiRetry(() =>
      getGemini().models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: {
          systemInstruction: 'Você é nutricionista especializado em meal prep. Retorne SOMENTE JSON válido, sem texto fora do JSON, sem markdown.',
          maxOutputTokens: 1800,
          temperature: 0.85,
          thinkingConfig: { thinkingBudget: 0 },
        },
      })
    );

    const raw = response.text ?? '';
    let plan: GeneratedPlan;
    try {
      const parsed = extractJSON(raw);
      if (!parsed?.meals || !Array.isArray(parsed.meals) || parsed.meals.length === 0) throw new Error('invalid');
      if (!parsed?.shopping_list || !Array.isArray(parsed.shopping_list)) throw new Error('invalid shopping');
      plan = parsed as GeneratedPlan;
    } catch {
      console.warn('[meal-prep] Gemini parse failed, using fallback');
      plan = getFallback(config.goal, config.mealCount, planIndex);
    }

    return NextResponse.json(plan);

  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[meal-prep] Error:', msg);
    if (msg.includes('503') || msg.includes('UNAVAILABLE')) {
      // Return fallback so UI is never empty
      try {
        const body = await new Request(req.url).json().catch(() => ({}));
        const goal = body?.config?.goal ?? 'emagrecimento';
        const mealCount = body?.config?.mealCount ?? 10;
        const fallback = getFallback(goal, mealCount, 0);
        return NextResponse.json(fallback);
      } catch { /**/ }
    }
    return NextResponse.json({ error: 'Erro ao gerar cardápio' }, { status: 500 });
  }
}
