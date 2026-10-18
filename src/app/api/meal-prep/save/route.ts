import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { insertInto } from '@/lib/db';

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { plan, config, planLabel } = body;

    if (!plan || !config) {
      return NextResponse.json({ error: 'Missing plan or config' }, { status: 400 });
    }

    const [data] = await insertInto<{ id: string }>('meal_prep_recipes', {
        user_id:        session.user.id,
        name:           plan.title,
        meal_count:     config.mealCount,
        goal:           config.goal,
        budget:         config.budget,
        plan_label:     planLabel ?? plan.label ?? 'A',
        avg_calories:   plan.avg_calories,
        avg_protein:    plan.avg_protein,
        avg_carbs:      plan.avg_carbs,
        avg_fat:        plan.avg_fat,
        estimated_cost: plan.estimated_cost,
        cost_per_meal:  plan.cost_per_meal,
        ingredients:    JSON.stringify(plan.ingredients ?? []),
        steps:          JSON.stringify(plan.steps ?? []),
        shopping_list:  JSON.stringify(plan.shopping_list ?? []),
        ai_explanation:      plan.ai_explanation      ?? null,
        meals:               JSON.stringify(plan.meals ?? []),
        porcoes:             plan.porcoes             ?? null,
        tempo_preparo_min:   plan.tempo_preparo_min   ?? null,
        tempo_cozimento_min: plan.tempo_cozimento_min ?? null,
        is_favorite:         false,
    }, { returning: 'id' });

    return NextResponse.json({ success: true, id: data.id });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[meal-prep/save] Error:', msg);
    return NextResponse.json({ error: 'Erro ao salvar receita' }, { status: 500 });
  }
}
