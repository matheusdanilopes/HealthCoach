import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { auth } from '@/auth';
import { supabase } from '@/lib/db';
import { withGeminiRetry } from '@/lib/gemini-retry';
import { brazilToday, brazilNDaysAgo } from '@/lib/timezone';

type GoalType   = 'emagrecimento' | 'manutencao' | 'massa';
type BudgetType = 'economico' | 'moderado' | 'premium';

export interface RecipeIngredient { name: string; quantity: string }
export interface RecipeStep       { title: string; items: string[]; duration?: string }

export interface ShoppingItem {
  name:       string;
  amount:     string;
  category:   'proteinas' | 'carboidratos' | 'hortifruti' | 'temperos' | 'outros';
  total_cost: number;
}

export interface MealItem {
  name:                string;
  protein_source:      string;
  carb_source:         string;
  vegetable:           string;
  calories:            number;
  protein_g:           number;
  carbs_g:             number;
  fat_g:               number;
  protein_portion_g?:  number;  // grams of protein FOOD per marmita
  carb_portion_g?:     number;  // grams of carb FOOD per marmita
  vegetable_portion_g?: number; // grams of vegetable per marmita
  total_weight_g?:     number;  // total marmita weight
}

export interface GeneratedPlan {
  title:               string;
  meals:               MealItem[];
  avg_calories:        number;
  avg_protein:         number;
  avg_carbs:           number;
  avg_fat:             number;
  estimated_cost:      number;
  cost_per_meal:       number;
  ingredients:         RecipeIngredient[];
  steps:               RecipeStep[];
  shopping_list:       ShoppingItem[];
  ai_explanation:      string;
  porcoes?:            number;
  tempo_preparo_min?:  number;
  tempo_cozimento_min?: number;
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

// Cycles through 6 distinct protein categories so repeated generations stay diverse
function proteinGuide(planIndex: number): string {
  const guides = [
    'Use FRANGO como proteína principal (peito grelhado, assado ou desfiado).',
    'Use CARNE BOVINA como proteína principal (acém, patinho, filé ou carne moída).',
    'Use PEIXE como proteína principal (TILÁPIA ou SALMÃO — grelhado, assado ou ao forno).',
    'Use OVOS ou PROTEÍNA VEGETAL como proteína principal (omelete, grão-de-bico, lentilha ou tofu).',
    'Use CARNE SUÍNA como proteína principal (lombo, filé mignon suíno ou costelinha).',
    'Use ATUM (em água) ou CAMARÃO como proteína principal.',
  ];
  return guides[planIndex % guides.length];
}

function getFallback(goal: GoalType, mealCount: number, planIndex: number, marmitaWeight: number): GeneratedPlan {
  const s = mealCount / 10;

  // Food-gram distribution per goal (protein food : carb food : vegetable food)
  const portionRatios: Record<GoalType, [number, number, number]> = {
    emagrecimento: [0.42, 0.30, 0.28],
    manutencao:    [0.38, 0.38, 0.24],
    massa:         [0.35, 0.45, 0.20],
  };
  const [pr, cr] = portionRatios[goal];
  const pPor = Math.round(marmitaWeight * pr);
  const cPor = Math.round(marmitaWeight * cr);
  const vPor = marmitaWeight - pPor - cPor;

  const base: Record<string, GeneratedPlan> = {
    'emagrecimento-0': {
      title: 'Frango Desfiado com Arroz Integral e Brócolis',
      porcoes: mealCount,
      tempo_preparo_min: 20,
      tempo_cozimento_min: 60,
      meals: [
        { name: 'Frango desfiado com arroz integral e brócolis', protein_source: 'Frango desfiado', carb_source: 'Arroz integral', vegetable: 'Brócolis', calories: 420, protein_g: 42, carbs_g: 35, fat_g: 8, protein_portion_g: pPor, carb_portion_g: cPor, vegetable_portion_g: vPor, total_weight_g: marmitaWeight },
      ],
      avg_calories: 420, avg_protein: 42, avg_carbs: 35, avg_fat: 8,
      estimated_cost: Math.round(92 * s), cost_per_meal: 9.2,
      ingredients: [
        { name: 'Peito de frango', quantity: `${(1.5 * s).toFixed(1)} kg` },
        { name: 'Arroz integral', quantity: `${(0.6 * s).toFixed(1)} kg (cru)` },
        { name: 'Brócolis', quantity: `${(0.6 * s).toFixed(1)} kg` },
        { name: 'Alho', quantity: '2 cabeças' },
        { name: 'Azeite de oliva', quantity: '50 ml' },
        { name: 'Sal, pimenta e temperos', quantity: 'a gosto' },
      ],
      steps: [
        { title: 'Etapa 1 – Preparação (20 min)', duration: '20 min', items: ['Lavar e secar o frango.', 'Temperar com alho amassado, sal, pimenta e páprica.', 'Cortar o brócolis em floretes.'] },
        { title: 'Etapa 2 – Cozimento (60 min)', duration: '60 min', items: ['Cozinhar o arroz integral em água com sal por 35 minutos (proporção 1:2).', 'Assar o frango por 25 min a 200°C; desfiar após esfriar.', 'Refogar o brócolis com azeite em fogo médio por 5 minutos.'] },
        { title: 'Etapa 3 – Montagem das Marmitas (15 min)', duration: '15 min', items: [`Distribuir ~${cPor}g de arroz integral em cada marmita.`, `Adicionar ~${pPor}g de frango desfiado.`, `Completar com ~${vPor}g de brócolis.`, `Verificar o peso total de cada marmita (~${marmitaWeight}g).`] },
        { title: 'Etapa 4 – Armazenamento e Congelamento', items: ['Aguardar esfriar completamente (mín. 30 min) antes de fechar.', 'Fechar os recipientes hermeticamente.', 'Etiquetar com data de preparo.', '🧊 Congelamento: armazenar no freezer por até 90 dias.', '❄️ Geladeira: conservar por até 4 dias.', '🔥 Descongelamento: transferir para a geladeira na véspera ou descongelar no micro-ondas por 3–4 min.'] },
      ],
      shopping_list: [
        { name: 'Peito de frango', amount: `${(1.5 * s).toFixed(1)}kg`, category: 'proteinas', total_cost: Math.round(22 * s) },
        { name: 'Arroz integral', amount: `${(0.6 * s).toFixed(1)}kg`, category: 'carboidratos', total_cost: Math.round(7 * s) },
        { name: 'Brócolis', amount: `${(0.6 * s).toFixed(1)}kg`, category: 'hortifruti', total_cost: Math.round(5 * s) },
        { name: 'Alho, azeite e temperos', amount: '1 kit', category: 'temperos', total_cost: Math.round(8 * s) },
      ],
      ai_explanation: 'Receita clássica de frango desfiado com arroz integral e brócolis — proteína magra, fibras e micronutrientes no ponto certo para o déficit calórico.',
    },
    'emagrecimento-1': {
      title: 'Carne Moída Magra com Purê de Batata-Doce e Brócolis',
      porcoes: mealCount,
      tempo_preparo_min: 25,
      tempo_cozimento_min: 55,
      meals: [
        { name: 'Carne moída magra com purê de batata-doce e brócolis', protein_source: 'Carne moída magra (patinho)', carb_source: 'Purê de batata-doce', vegetable: 'Brócolis', calories: 440, protein_g: 38, carbs_g: 42, fat_g: 12, protein_portion_g: pPor, carb_portion_g: cPor, vegetable_portion_g: vPor, total_weight_g: marmitaWeight },
      ],
      avg_calories: 440, avg_protein: 38, avg_carbs: 42, avg_fat: 12,
      estimated_cost: Math.round(88 * s), cost_per_meal: 8.8,
      ingredients: [
        { name: 'Carne moída magra (patinho)', quantity: `${(1.2 * s).toFixed(1)} kg` },
        { name: 'Batata doce', quantity: `${(1.2 * s).toFixed(1)} kg` },
        { name: 'Brócolis', quantity: `${(0.6 * s).toFixed(1)} kg` },
        { name: 'Cebola', quantity: '2 unidades' },
        { name: 'Alho', quantity: '2 cabeças' },
        { name: 'Azeite e temperos', quantity: 'a gosto' },
      ],
      steps: [
        { title: 'Etapa 1 – Preparação (25 min)', duration: '25 min', items: ['Picar cebola e alho finamente.', 'Cortar o brócolis em floretes.', 'Descascar e cortar a batata-doce em cubos.'] },
        { title: 'Etapa 2 – Cozimento (55 min)', duration: '55 min', items: ['Refogar cebola e alho no azeite; adicionar a carne moída e cozinhar bem.', 'Cozinhar a batata-doce até ficar macia; amassar com garfo até formar purê.', 'Refogar o brócolis com azeite e sal por 5 minutos.'] },
        { title: 'Etapa 3 – Montagem das Marmitas (15 min)', duration: '15 min', items: [`Distribuir ~${cPor}g de purê de batata-doce em cada marmita.`, `Adicionar ~${pPor}g de carne moída.`, `Completar com ~${vPor}g de brócolis.`] },
        { title: 'Etapa 4 – Armazenamento e Congelamento', items: ['Deixar esfriar completamente antes de fechar.', 'Tampar hermeticamente e etiquetar com a data.', '🧊 Congelamento: freezar por até 90 dias.', '❄️ Geladeira: conservar por até 4 dias.', '🔥 Descongelamento: geladeira na véspera ou micro-ondas por 3–4 min.'] },
      ],
      shopping_list: [
        { name: 'Carne moída magra', amount: `${(1.2 * s).toFixed(1)}kg`, category: 'proteinas', total_cost: Math.round(22 * s) },
        { name: 'Batata doce', amount: `${(1.2 * s).toFixed(1)}kg`, category: 'carboidratos', total_cost: Math.round(7 * s) },
        { name: 'Brócolis', amount: `${(0.6 * s).toFixed(1)}kg`, category: 'hortifruti', total_cost: Math.round(5 * s) },
        { name: 'Cebola e alho', amount: '1 kit', category: 'temperos', total_cost: Math.round(5 * s) },
        { name: 'Azeite e condimentos', amount: '1 kit', category: 'temperos', total_cost: Math.round(7 * s) },
      ],
      ai_explanation: 'Carne moída magra com purê de batata-doce — proteína acessível e carboidrato complexo para saciedade prolongada no déficit calórico.',
    },
    'manutencao-0': {
      title: 'Frango Assado com Arroz Branco e Mix de Legumes',
      porcoes: mealCount,
      tempo_preparo_min: 20,
      tempo_cozimento_min: 65,
      meals: [
        { name: 'Frango assado com arroz branco e mix de legumes', protein_source: 'Frango assado', carb_source: 'Arroz branco', vegetable: 'Mix de legumes (cenoura, vagem, milho)', calories: 520, protein_g: 45, carbs_g: 55, fat_g: 10, protein_portion_g: pPor, carb_portion_g: cPor, vegetable_portion_g: vPor, total_weight_g: marmitaWeight },
      ],
      avg_calories: 520, avg_protein: 45, avg_carbs: 55, avg_fat: 10,
      estimated_cost: Math.round(125 * s), cost_per_meal: 12.5,
      ingredients: [
        { name: 'Peito de frango', quantity: `${(1.5 * s).toFixed(1)} kg` },
        { name: 'Arroz branco', quantity: `${(0.8 * s).toFixed(1)} kg (cru)` },
        { name: 'Mix de legumes (cenoura, vagem, milho)', quantity: `${(0.8 * s).toFixed(1)} kg` },
        { name: 'Alho, azeite e temperos', quantity: 'a gosto' },
      ],
      steps: [
        { title: 'Etapa 1 – Preparação (20 min)', duration: '20 min', items: ['Marinar o frango com alho, sal, limão e páprica por 30 min.', 'Cortar os legumes em cubos pequenos.'] },
        { title: 'Etapa 2 – Cozimento (65 min)', duration: '65 min', items: ['Assar o frango a 200°C por 30 min.', 'Cozinhar o arroz branco normalmente.', 'Refogar os legumes com azeite por 5 min.'] },
        { title: 'Etapa 3 – Montagem das Marmitas (15 min)', duration: '15 min', items: [`Distribuir ~${cPor}g de arroz em cada marmita.`, `Adicionar ~${pPor}g de frango assado.`, `Completar com ~${vPor}g de mix de legumes.`] },
        { title: 'Etapa 4 – Armazenamento e Congelamento', items: ['Esfriar completamente antes de fechar.', 'Tampar hermeticamente e etiquetar com data.', '🧊 Congelamento: freezer por até 90 dias.', '❄️ Geladeira: até 4 dias.', '🔥 Descongelamento: geladeira na véspera ou micro-ondas 3–4 min.'] },
      ],
      shopping_list: [
        { name: 'Peito de frango', amount: `${(1.5 * s).toFixed(1)}kg`, category: 'proteinas', total_cost: Math.round(22 * s) },
        { name: 'Arroz branco', amount: `${(0.8 * s).toFixed(1)}kg`, category: 'carboidratos', total_cost: Math.round(6 * s) },
        { name: 'Mix de legumes', amount: `${(0.8 * s).toFixed(1)}kg`, category: 'hortifruti', total_cost: Math.round(8 * s) },
        { name: 'Temperos e azeite', amount: '1 kit', category: 'temperos', total_cost: Math.round(10 * s) },
      ],
      ai_explanation: 'Frango assado clássico com arroz e mix de legumes — receita equilibrada que cobre todos os macros da manutenção com praticidade.',
    },
    'manutencao-1': {
      title: 'Patinho Assado com Quinoa e Aspargos',
      porcoes: mealCount,
      tempo_preparo_min: 25,
      tempo_cozimento_min: 75,
      meals: [
        { name: 'Patinho assado com quinoa e aspargos grelhados', protein_source: 'Patinho bovino assado', carb_source: 'Quinoa cozida', vegetable: 'Aspargos grelhados', calories: 540, protein_g: 44, carbs_g: 52, fat_g: 13, protein_portion_g: pPor, carb_portion_g: cPor, vegetable_portion_g: vPor, total_weight_g: marmitaWeight },
      ],
      avg_calories: 540, avg_protein: 44, avg_carbs: 52, avg_fat: 13,
      estimated_cost: Math.round(140 * s), cost_per_meal: 14.0,
      ingredients: [
        { name: 'Patinho bovino', quantity: `${(1.2 * s).toFixed(1)} kg` },
        { name: 'Quinoa', quantity: `${(0.5 * s).toFixed(1)} kg (cru)` },
        { name: 'Aspargos', quantity: `${(0.5 * s).toFixed(1)} kg` },
        { name: 'Alho, ervas finas e temperos', quantity: 'a gosto' },
        { name: 'Azeite de oliva', quantity: '50 ml' },
      ],
      steps: [
        { title: 'Etapa 1 – Preparação (25 min)', duration: '25 min', items: ['Temperar o patinho com alho, sal, ervas e limão.', 'Lavar a quinoa e deixar de molho 10 min.', 'Lavar os aspargos e temperar com azeite e sal.'] },
        { title: 'Etapa 2 – Cozimento (75 min)', duration: '75 min', items: ['Assar o patinho a 180°C por 40–45 min.', 'Cozinhar a quinoa (proporção 1:2 com água) por 15 min.', 'Grelhar os aspargos na frigideira com azeite por 5 min.'] },
        { title: 'Etapa 3 – Montagem das Marmitas (15 min)', duration: '15 min', items: [`Distribuir ~${cPor}g de quinoa em cada marmita.`, `Fatiar e adicionar ~${pPor}g de patinho assado.`, `Completar com ~${vPor}g de aspargos grelhados.`] },
        { title: 'Etapa 4 – Armazenamento e Congelamento', items: ['Esfriar completamente antes de fechar.', 'Fechar hermeticamente e etiquetar com data.', '🧊 Congelamento: freezer por até 90 dias.', '❄️ Geladeira: até 4 dias.', '🔥 Descongelamento: transferir para geladeira 8h antes ou micro-ondas 3–4 min.'] },
      ],
      shopping_list: [
        { name: 'Patinho bovino', amount: `${(1.2 * s).toFixed(1)}kg`, category: 'proteinas', total_cost: Math.round(30 * s) },
        { name: 'Quinoa', amount: `${(0.5 * s).toFixed(1)}kg`, category: 'carboidratos', total_cost: Math.round(18 * s) },
        { name: 'Aspargos', amount: `${(0.5 * s).toFixed(1)}kg`, category: 'hortifruti', total_cost: Math.round(15 * s) },
        { name: 'Temperos e azeite', amount: '1 kit', category: 'temperos', total_cost: Math.round(10 * s) },
      ],
      ai_explanation: 'Patinho assado com quinoa (proteína completa) e aspargos — combinação premium para manutenção com alto valor nutricional e sabor diferenciado.',
    },
    'massa-0': {
      title: 'Frango Grelhado com Arroz Integral e Batata Doce',
      porcoes: mealCount,
      tempo_preparo_min: 25,
      tempo_cozimento_min: 75,
      meals: [
        { name: 'Frango grelhado com arroz integral e batata doce', protein_source: 'Peito de frango grelhado', carb_source: 'Arroz integral + Batata doce', vegetable: 'Brócolis', calories: 650, protein_g: 58, carbs_g: 72, fat_g: 10, protein_portion_g: pPor, carb_portion_g: cPor, vegetable_portion_g: vPor, total_weight_g: marmitaWeight },
      ],
      avg_calories: 650, avg_protein: 58, avg_carbs: 72, avg_fat: 10,
      estimated_cost: Math.round(145 * s), cost_per_meal: 14.5,
      ingredients: [
        { name: 'Peito de frango', quantity: `${(2.0 * s).toFixed(1)} kg` },
        { name: 'Arroz integral', quantity: `${(0.8 * s).toFixed(1)} kg (cru)` },
        { name: 'Batata doce', quantity: `${(1.2 * s).toFixed(1)} kg` },
        { name: 'Brócolis', quantity: `${(0.5 * s).toFixed(1)} kg` },
        { name: 'Azeite (uso generoso)', quantity: '100 ml' },
        { name: 'Alho, sal e temperos', quantity: 'a gosto' },
      ],
      steps: [
        { title: 'Etapa 1 – Preparação (25 min)', duration: '25 min', items: ['Temperar o frango generosamente com alho, ervas e azeite.', 'Cortar a batata doce em cubos grandes.', 'Separar o brócolis em floretes.'] },
        { title: 'Etapa 2 – Cozimento (75 min)', duration: '75 min', items: ['Cozinhar o arroz integral por 35 min.', 'Grelhar o frango por 8 min de cada lado.', 'Cozinhar a batata doce no vapor ou forno.', 'Refogar o brócolis com azeite.'] },
        { title: 'Etapa 3 – Montagem das Marmitas (15 min)', duration: '15 min', items: [`Distribuir ~${cPor}g de carboidrato (arroz + batata doce) por marmita.`, `Adicionar ~${pPor}g de peito de frango grelhado.`, `Completar com ~${vPor}g de brócolis.`, 'Finalizar com fio de azeite.'] },
        { title: 'Etapa 4 – Armazenamento e Congelamento', items: ['Esfriar antes de fechar — nunca feche quente.', 'Etiquetar com data de preparo.', '🧊 Congelamento: freezer por até 90 dias.', '❄️ Geladeira: até 4 dias.', '🔥 Descongelamento: geladeira na véspera ou micro-ondas 4–5 min.'] },
      ],
      shopping_list: [
        { name: 'Peito de frango', amount: `${(2.0 * s).toFixed(1)}kg`, category: 'proteinas', total_cost: Math.round(30 * s) },
        { name: 'Arroz integral', amount: `${(0.8 * s).toFixed(1)}kg`, category: 'carboidratos', total_cost: Math.round(8 * s) },
        { name: 'Batata doce', amount: `${(1.2 * s).toFixed(1)}kg`, category: 'carboidratos', total_cost: Math.round(8 * s) },
        { name: 'Brócolis', amount: `${(0.5 * s).toFixed(1)}kg`, category: 'hortifruti', total_cost: Math.round(4 * s) },
        { name: 'Azeite e temperos', amount: '1 kit', category: 'temperos', total_cost: Math.round(13 * s) },
      ],
      ai_explanation: 'Frango grelhado com arroz integral e batata doce — combinação hipercalórica clássica para ganho de massa, rica em proteína e carboidratos complexos.',
    },
    'massa-1': {
      title: 'Carne Moída com Mandioca Cozida e Couve',
      porcoes: mealCount,
      tempo_preparo_min: 25,
      tempo_cozimento_min: 60,
      meals: [
        { name: 'Carne moída refogada com mandioca cozida e couve', protein_source: 'Carne moída (patinho)', carb_source: 'Mandioca cozida', vegetable: 'Couve refogada', calories: 680, protein_g: 55, carbs_g: 75, fat_g: 14, protein_portion_g: pPor, carb_portion_g: cPor, vegetable_portion_g: vPor, total_weight_g: marmitaWeight },
      ],
      avg_calories: 680, avg_protein: 55, avg_carbs: 75, avg_fat: 14,
      estimated_cost: Math.round(120 * s), cost_per_meal: 12.0,
      ingredients: [
        { name: 'Carne moída (patinho)', quantity: `${(1.5 * s).toFixed(1)} kg` },
        { name: 'Mandioca congelada', quantity: `${(1.5 * s).toFixed(1)} kg` },
        { name: 'Couve', quantity: `${(0.4 * s).toFixed(1)} kg` },
        { name: 'Cebola', quantity: '2 unidades' },
        { name: 'Alho', quantity: '2 cabeças' },
        { name: 'Azeite e temperos', quantity: 'a gosto' },
      ],
      steps: [
        { title: 'Etapa 1 – Preparação (25 min)', duration: '25 min', items: ['Descongelar a mandioca.', 'Picar cebola e alho finamente.', 'Lavar e picar a couve finamente.'] },
        { title: 'Etapa 2 – Cozimento (60 min)', duration: '60 min', items: ['Cozinhar a mandioca até ficar macia (15–20 min).', 'Refogar a carne moída com cebola, alho e temperos até dourar.', 'Refogar a couve com alho e azeite por 3 minutos.'] },
        { title: 'Etapa 3 – Montagem das Marmitas (15 min)', duration: '15 min', items: [`Distribuir ~${cPor}g de mandioca cozida em cada marmita.`, `Adicionar ~${pPor}g de carne moída.`, `Completar com ~${vPor}g de couve refogada.`] },
        { title: 'Etapa 4 – Armazenamento e Congelamento', items: ['Resfriar completamente e tampar hermeticamente.', 'Etiquetar com data.', '🧊 Congelamento: freezer por até 90 dias.', '❄️ Geladeira: até 4 dias.', '🔥 Descongelamento: geladeira na véspera ou micro-ondas 3–5 min.'] },
      ],
      shopping_list: [
        { name: 'Carne moída (patinho)', amount: `${(1.5 * s).toFixed(1)}kg`, category: 'proteinas', total_cost: Math.round(28 * s) },
        { name: 'Mandioca congelada', amount: `${(1.5 * s).toFixed(1)}kg`, category: 'carboidratos', total_cost: Math.round(10 * s) },
        { name: 'Couve', amount: `${(0.4 * s).toFixed(1)}kg`, category: 'hortifruti', total_cost: Math.round(5 * s) },
        { name: 'Cebola e alho', amount: '1 kit', category: 'temperos', total_cost: Math.round(5 * s) },
        { name: 'Azeite e condimentos', amount: '1 kit', category: 'temperos', total_cost: Math.round(8 * s) },
      ],
      ai_explanation: 'Carne moída com mandioca e couve — receita brasileira clássica e calórica, ideal para ganho de massa com custo acessível.',
    },
  };

  const key = `${goal}-${planIndex % 2}`;
  return base[key] ?? base[`${goal}-0`] ?? base['emagrecimento-0'];
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const userId = session.user.id;
    const body   = await req.json().catch(() => null);
    if (!body || !body.config) {
      return NextResponse.json({ error: 'Configuração inválida ou ausente' }, { status: 400 });
    }

    const config:           { mealCount: number; budget: BudgetType; goal: GoalType; marmitaWeight: number } = body.config;
    if (typeof config.mealCount !== 'number' || config.mealCount <= 0) {
      return NextResponse.json({ error: 'Quantidade de marmitas inválida' }, { status: 400 });
    }
    const existingMealNames: string[] = body.existingMealNames ?? [];
    const planIndex:         number   = body.planIndex ?? 0;
    const marmitaWeight:     number   = config.marmitaWeight ?? 400;

    const today        = brazilToday();
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
      byDate[log.log_date].carbs += log.carbs   ?? 0;
      byDate[log.log_date].fat   += log.fat     ?? 0;
    }
    const hdates = Object.keys(byDate);
    const hvals  = Object.values(byDate);
    const avgCal   = hdates.length > 0 ? Math.round(hvals.reduce((s, v) => s + v.cal,   0) / hdates.length) : (profile?.target_calories ?? 2000);
    const avgProt  = hdates.length > 0 ? Math.round(hvals.reduce((s, v) => s + v.prot,  0) / hdates.length) : 130;
    const avgCarbs = hdates.length > 0 ? Math.round(hvals.reduce((s, v) => s + v.carbs, 0) / hdates.length) : 170;
    const avgFat   = hdates.length > 0 ? Math.round(hvals.reduce((s, v) => s + v.fat,   0) / hdates.length) : 55;

    const foodCounts: Record<string, number> = {};
    for (const log of foodLogs ?? []) {
      const n = (log.food_name ?? '').toLowerCase().trim();
      if (n) foodCounts[n] = (foodCounts[n] ?? 0) + 1;
    }
    const frequentFoods = Object.entries(foodCounts)
      .sort((a, b) => b[1] - a[1]).slice(0, 6).map(([n]) => n);

    const budgetMap: Record<BudgetType, string> = {
      economico: `econômico (R$ ${Math.round(config.mealCount * 9)}–${Math.round(config.mealCount * 11)} total)`,
      moderado:  `moderado (R$ ${Math.round(config.mealCount * 13)}–${Math.round(config.mealCount * 16)} total)`,
      premium:   `premium (R$ ${Math.round(config.mealCount * 19)}–${Math.round(config.mealCount * 23)} total)`,
    };
    const goalMap: Record<GoalType, string> = {
      emagrecimento: 'emagrecimento — déficit calórico, alta proteína, carboidratos complexos controlados',
      manutencao:    'manutenção — calorias ≈ gasto, macros equilibrados',
      massa:         'ganho de massa — superávit calórico, muito proteína, carboidratos generosos',
    };

    const avoidLines = existingMealNames.slice(0, 25).map((n) => `• ${n}`).join('\n');
    const avoidSection = existingMealNames.length > 0
      ? `\n⚠️ JÁ GERADOS ANTERIORMENTE — NÃO REPITA NENHUM:\n${avoidLines}\n`
      : '';

    const prompt = `Você é nutricionista especializado em meal prep saudável para brasileiros.

PERFIL:
• Objetivo: ${goalMap[config.goal]}
• Meta calórica: ${profile?.target_calories ?? avgCal}kcal/dia | Proteína: ${profile?.target_protein_g ?? Math.round(((profile?.target_calories ?? avgCal) * 0.3) / 4)}g/dia
• Peso: ${profile?.current_weight ?? '?'}kg | Sexo: ${profile?.sex === 'female' ? 'F' : 'M'}
• Média 30d: ${avgCal}kcal · ${avgProt}g prot · ${avgCarbs}g carbs · ${avgFat}g gord
• Alimentos frequentes: ${frequentFoods.length > 0 ? frequentFoods.join(', ') : 'não identificados'}

CONFIGURAÇÃO:
• Total de marmitas: ${config.mealCount}
• Peso por marmita: ~${marmitaWeight}g de alimento por marmita
• Orçamento: ${budgetMap[config.budget]}
• Proteína principal (OBRIGATÓRIO): ${proteinGuide(planIndex)}
${avoidSection}
REGRAS IMPORTANTES:
1. Siga ESTRITAMENTE a proteína definida acima — não substitua por outra categoria.
2. OBRIGATÓRIO: Gere APENAS UMA ÚNICA RECEITA. O array "meals" deve conter EXATAMENTE 1 item. Todas as ${config.mealCount} marmitas são desta mesma receita. NUNCA inclua mais de uma receita dentro da mesma opção.
3. Calcule ingredientes e shopping list para o TOTAL de ${config.mealCount} marmitas com quantidades exatas em kg/g/unidades.
4. Use preços médios de mercado brasileiro 2025.
5. O modo de preparo deve ser detalhado e executável (tempos, temperaturas, quantidades por marmita).
6. Inclua etapa de armazenamento com instruções de geladeira, congelamento e descongelamento.
7. Preencha protein_portion_g, carb_portion_g, vegetable_portion_g (gramas de ALIMENTO, não macronutrientes) e total_weight_g ≈ ${marmitaWeight}g.${existingMealNames.length > 0 ? '\n8. OBRIGATÓRIO: O título e a proteína principal devem ser COMPLETAMENTE DIFERENTES de todos os itens listados em "JÁ GERADOS". Sem exceções.' : ''}

Retorne SOMENTE JSON válido (sem texto fora, sem markdown).
ATENÇÃO: o array "meals" deve ter EXATAMENTE 1 objeto — uma única receita:
{
  "title": "Nome curto e apetitoso (ex: Frango Desfiado Fit com Brócolis)",
  "porcoes": ${config.mealCount},
  "tempo_preparo_min": 20,
  "tempo_cozimento_min": 60,
  "meals": [
    {
      "name": "Nome completo da receita única",
      "protein_source": "Proteína principal",
      "carb_source": "Carboidrato principal",
      "vegetable": "Legume ou verdura",
      "calories": 380,
      "protein_g": 37,
      "carbs_g": 35,
      "fat_g": 9,
      "protein_portion_g": ${Math.round(marmitaWeight * 0.42)},
      "carb_portion_g": ${Math.round(marmitaWeight * 0.32)},
      "vegetable_portion_g": ${marmitaWeight - Math.round(marmitaWeight * 0.42) - Math.round(marmitaWeight * 0.32)},
      "total_weight_g": ${marmitaWeight}
    }
  ],
  "avg_calories": 480,
  "avg_protein": 45,
  "avg_carbs": 42,
  "avg_fat": 8,
  "estimated_cost": 115,
  "cost_per_meal": 11.5,
  "ingredients": [
    { "name": "Peito de frango", "quantity": "1,5 kg" },
    { "name": "Arroz integral", "quantity": "500 g (cru)" }
  ],
  "steps": [
    {
      "title": "Etapa 1 – Preparação (20 min)",
      "duration": "20 min",
      "items": ["Lavar e secar o frango.", "Temperar com alho, sal e páprica."]
    },
    {
      "title": "Etapa 2 – Cozimento (60 min)",
      "duration": "60 min",
      "items": ["Cozinhar o arroz por 35 min.", "Grelhar o frango por 8 min de cada lado."]
    },
    {
      "title": "Etapa 3 – Montagem das Marmitas (15 min)",
      "duration": "15 min",
      "items": ["Distribuir 150 g de arroz em cada marmita.", "Adicionar 120 g de frango."]
    },
    {
      "title": "Etapa 4 – Armazenamento e Congelamento",
      "items": ["Aguardar esfriar completamente antes de fechar.", "Fechar hermeticamente e etiquetar com data e proteína.", "🧊 Congelamento: freezer por até 90 dias.", "❄️ Geladeira: conservar por até 4 dias.", "🔥 Descongelamento: transferir para a geladeira na véspera ou micro-ondas 3–4 min."]
    }
  ],
  "shopping_list": [
    { "name": "Peito de frango", "amount": "1,5kg", "category": "proteinas", "total_cost": 22.5 }
  ],
  "ai_explanation": "1-2 frases sobre por que este cardápio atende ao objetivo."
}
Categorias de shopping_list: "proteinas", "carboidratos", "hortifruti", "temperos", "outros"`;

    console.log(`[meal-prep] Gemini | goal=${config.goal} | budget=${config.budget} | meals=${config.mealCount} | idx=${planIndex}`);

    const response = await withGeminiRetry(() =>
      getGemini().models.generateContent({
        model: 'gemini-2.0-flash',
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: {
          systemInstruction: 'Nutricionista de meal prep. Retorne SOMENTE JSON válido, sem texto fora, sem markdown.',
          maxOutputTokens: 3000,
          temperature: 0.85,
          thinkingConfig: { thinkingBudget: 0 },
        },
      })
    );

    const raw = response.text ?? '';
    let plan: GeneratedPlan;
    try {
      const parsed = extractJSON(raw);
      if (!parsed?.meals || !Array.isArray(parsed.meals) || parsed.meals.length === 0) throw new Error('invalid meals');
      if (!parsed?.shopping_list || !Array.isArray(parsed.shopping_list)) throw new Error('invalid shopping');
      plan = {
        ...parsed,
        ingredients:         Array.isArray(parsed.ingredients) ? parsed.ingredients : [],
        steps:               Array.isArray(parsed.steps)       ? parsed.steps       : [],
        porcoes:             parsed.porcoes            ?? config.mealCount,
        tempo_preparo_min:   parsed.tempo_preparo_min  ?? undefined,
        tempo_cozimento_min: parsed.tempo_cozimento_min ?? undefined,
      } as GeneratedPlan;
    } catch {
      console.warn('[meal-prep] Gemini parse failed, using fallback');
      plan = getFallback(config.goal, config.mealCount, planIndex, marmitaWeight);
    }

    // Normalize calories from macros (Atwater: P×4 + C×4 + F×9) so the
    // displayed kcal is always consistent with the protein/carbs/fat values.
    plan.avg_calories = Math.round(plan.avg_protein * 4 + plan.avg_carbs * 4 + plan.avg_fat * 9);
    plan.meals = plan.meals.map((m) => ({
      ...m,
      calories: Math.round(m.protein_g * 4 + m.carbs_g * 4 + m.fat_g * 9),
    }));

    return NextResponse.json(plan);

  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[meal-prep] Error:', msg);
    return NextResponse.json({ error: 'Erro ao gerar cardápio' }, { status: 500 });
  }
}
