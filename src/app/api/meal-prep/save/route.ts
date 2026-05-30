import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { supabase } from '@/lib/db';

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { plan, config, planLabel } = body;

    if (!plan || !config) {
      return NextResponse.json({ error: 'Missing plan or config' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('meal_prep_recipes')
      .insert({
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
        ingredients:    plan.ingredients ?? [],
        steps:          plan.steps ?? [],
        shopping_list:  plan.shopping_list ?? [],
        ai_explanation: plan.ai_explanation ?? null,
        is_favorite:    false,
      })
      .select('id')
      .single();

    if (error) {
      console.error('[meal-prep/save] DB error:', error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, id: data.id });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[meal-prep/save] Error:', msg);
    return NextResponse.json({ error: 'Erro ao salvar receita' }, { status: 500 });
  }
}
