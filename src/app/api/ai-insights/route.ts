import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { supabase } from '@/lib/db';
import { generateJSON } from '@/lib/ai';
import { brazilToday, brazilDayOfWeek, brazilNDaysAgo, brazilHour } from '@/lib/timezone';
import { analyzeInsightData, pickFindings, type FoodLogRow, type UserGoal } from '@/lib/insight-findings';

const DOW_NAME = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

// Phrases that signal a generic, data-free insight. A response containing
// them fails validation and falls through to the next provider/fallback.
const GENERIC_PHRASES = [
  'alimentação equilibrada', 'continue assim', 'beba mais água', 'cada dia é uma nova',
  'mantenha o foco', 'você está no caminho certo', 'pequenos passos', 'ouça seu corpo',
];

const INSIGHT_SYSTEM = `Você é um nutricionista esportivo analisando os dados de um paciente para escrever UM insight curto no app.

O dashboard já mostra os totais do dia (kcal, proteína, água). Um insight que só repete esses números é inútil.
Seu trabalho é transformar o ACHADO PRINCIPAL (já calculado a partir dos dados) em algo que o usuário não percebeu sozinho e que ele consegue aplicar hoje.

REGRAS:
1. Escreva sobre o ACHADO PRINCIPAL. Use os achados de apoio só se criarem uma correlação real (ex: proteína baixa + treinos frequentes).
2. title: o achado em si, específico, com número (máx 60 caracteres). Ex: "Café da manhã com só 9g de proteína". Proibido título genérico ("Atenção à nutrição", "Dica do dia").
3. message: 2-3 frases — o que os dados mostram (com os números), por que importa para o OBJETIVO do usuário, e o que fazer.
4. Recomendações concretas: alimento + porção + efeito (kcal ou g de proteína). Prefira alimentos que o usuário JÁ COME (lista abaixo) — ajuste porção, troque ou complemente.
5. Use SOMENTE números presentes nos dados. Não invente medidas, exames ou datas.
6. Siga o tom indicado em COMO ABORDAR.
7. Proibido: "mantenha uma alimentação equilibrada", "beba mais água", "continue assim", "cada dia é uma nova oportunidade", frases motivacionais vazias, conselhos médicos.
8. nextSteps: 2-3 ações com quantidade ou horário, começando com emoji (ex: "🥚 Adicionar 2 ovos no café (+12g prot)"). Máx 80 caracteres cada.
9. expanded: 2-3 frases com o raciocínio por trás (a conta, a correlação, a hipótese) ou null.
10. mealIdea: só quando o achado envolve falta de proteína/calorias e uma refeição resolve; senão null.
11. cta: pergunta curta que o usuário faria ao coach sobre o tema (ex: "Como subir a proteína do café?") ou null.
12. Português do Brasil, segunda pessoa ("você"). Retorne SOMENTE o JSON.`;

export async function GET(req: Request) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const userId = session.user.id;
    const { searchParams } = new URL(req.url);
    const forceRefresh = searchParams.get('refresh') === '1';
    const invalidate   = searchParams.get('invalidate') === '1';

    if (invalidate) {
      await supabase.from('ai_insights').delete().eq('user_id', userId);
      console.log(`[insights] Cache invalidated for user ${userId}`);
      return NextResponse.json({ ok: true });
    }

    // 2-hour cache — short enough to reflect meals added during the day
    if (!forceRefresh) {
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
      const { data: cached } = await supabase
        .from('ai_insights')
        .select('*')
        .eq('user_id', userId)
        .gte('generated_at', twoHoursAgo)
        .order('generated_at', { ascending: false })
        .limit(1)
        .single();
      if (cached) return NextResponse.json(cached);
    }

    const today = brazilToday();
    const hour  = brazilHour();
    const dow   = brazilDayOfWeek();
    const thirtyDaysAgo = brazilNDaysAgo(30, today);
    const ninetyDaysAgo = brazilNDaysAgo(90, today);
    console.log(`[insights] Generating for user ${userId} | Brazil date: ${today}`);

    const foodCols = 'food_name, meal_type, calories, protein, carbs, fat, hydration_ml, log_date, created_at';
    const [
      { data: profile },
      { data: todayLogs },
      { data: historyLogs },
      { data: weightLogs },
      { data: waterLogs },
      { data: waterHistory },
      { data: bodyMetrics },
      { data: bodyMeasurements },
      { data: recentInsights },
    ] = await Promise.all([
      supabase
        .from('users')
        .select('full_name, current_weight, target_calories, target_protein_g, tdee, sex, target_water_ml')
        .eq('id', userId)
        .single(),
      supabase
        .from('food_logs')
        .select(foodCols)
        .eq('user_id', userId)
        .eq('log_date', today)
        .order('created_at', { ascending: true }),
      supabase
        .from('food_logs')
        .select(foodCols)
        .eq('user_id', userId)
        .gte('log_date', thirtyDaysAgo)
        .lt('log_date', today),
      supabase
        .from('weight_logs')
        .select('weight_kg, log_date')
        .eq('user_id', userId)
        .gte('log_date', thirtyDaysAgo)
        .order('log_date', { ascending: true }),
      supabase
        .from('water_logs')
        .select('amount_ml')
        .eq('user_id', userId)
        .eq('log_date', today),
      supabase
        .from('water_logs')
        .select('amount_ml, log_date')
        .eq('user_id', userId)
        .gte('log_date', thirtyDaysAgo)
        .lt('log_date', today),
      supabase
        .from('body_metrics')
        .select('date, weight, muscle_mass, body_fat')
        .eq('user_id', userId)
        .gte('date', ninetyDaysAgo)
        .order('date', { ascending: true }),
      supabase
        .from('body_measurements')
        .select('date, waist')
        .eq('user_id', userId)
        .order('date', { ascending: false })
        .limit(3),
      // Recent insights feed the anti-repetition ranking
      supabase
        .from('ai_insights')
        .select('title, metadata, generated_at')
        .eq('user_id', userId)
        .order('generated_at', { ascending: false })
        .limit(7),
    ]);

    const targetCal   = Number(profile?.target_calories ?? 0);
    const targetProt  = Number(profile?.target_protein_g ?? 0) ||
                        (targetCal > 0 ? Math.round((targetCal * 0.3) / 4) : 0);
    const targetWater = Number(profile?.target_water_ml ?? 2500);

    const tdeeVal = Number(profile?.tdee ?? 0);
    let userGoal: UserGoal = 'manutenção';
    if (tdeeVal > 0 && targetCal > 0) {
      if (targetCal < tdeeVal * 0.93)      userGoal = 'emagrecimento';
      else if (targetCal > tdeeVal * 1.03) userGoal = 'ganho de massa';
    }

    // Weight from both the quick log and body-composition entries, one per day
    const weightByDate: Record<string, number> = {};
    for (const m of bodyMetrics ?? []) if (m.weight) weightByDate[m.date] = Number(m.weight);
    for (const w of weightLogs ?? []) weightByDate[w.log_date] = Number(w.weight_kg);
    const weights = Object.entries(weightByDate)
      .map(([date, kg]) => ({ date, kg }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const analysis = analyzeInsightData({
      today, hour, now: Date.now(), goal: userGoal,
      targetCal, targetProt, targetWater,
      todayLogs:        (todayLogs ?? []) as FoodLogRow[],
      historyLogs:      (historyLogs ?? []) as FoodLogRow[],
      todayManualWater: (waterLogs ?? []).reduce((s, l) => s + Number(l.amount_ml), 0),
      waterHistory:     waterHistory ?? [],
      weights,
      bodyMetrics:      (bodyMetrics ?? []).filter((m) => m.body_fat != null || m.muscle_mass != null),
      waist:            (bodyMeasurements ?? [])
        .filter((m) => m.waist != null)
        .map((m) => ({ date: m.date, cm: Number(m.waist) })),
    });
    const { stats } = analysis;

    const recentKeys = (recentInsights ?? [])
      .map((i) => (i.metadata as { findingKey?: string } | null)?.findingKey)
      .filter((k): k is string => typeof k === 'string');
    const { primary, supporting } = pickFindings(analysis.findings, recentKeys, dow);

    const firstName  = profile?.full_name?.split(' ')[0] ?? 'Usuário';
    const latestKg   = weights[weights.length - 1]?.kg ?? profile?.current_weight;
    const recentTitles = (recentInsights ?? []).slice(0, 3).map((i) => `"${i.title}"`).join(', ');

    const contextPrompt =
`USUÁRIO: ${firstName}${profile?.sex ? ` | Sexo: ${profile.sex === 'male' ? 'M' : 'F'}` : ''}${latestKg ? ` | Peso: ${latestKg}kg` : ''}
OBJETIVO: ${userGoal} | Metas: ${targetCal}kcal, ${targetProt}g proteína, ${targetWater}ml água por dia
AGORA: ${DOW_NAME[dow]}, ${today}, ${hour}h

══ ACHADO PRINCIPAL (escreva sobre isto) ══
${primary.fact}
COMO ABORDAR: ${primary.angle}

${supporting.length ? `ACHADOS DE APOIO (use só se reforçarem o principal):
${supporting.map((f) => `- ${f.fact}`).join('\n')}

` : ''}HOJE ATÉ AGORA:
${analysis.todayLines.length ? analysis.todayLines.map((l) => `- ${l}`).join('\n') : '- nada registrado'}
Total: ${stats.todayCal}kcal, ${stats.todayProt}g prot${stats.todayBurned > 0 ? `, ${stats.todayBurned}kcal de treino` : ''} | Água: ${stats.todayWater}ml

ALIMENTOS QUE O USUÁRIO COSTUMA COMER (30 dias):
${analysis.commonFoods.length ? analysis.commonFoods.map((l) => `- ${l}`).join('\n') : '- histórico insuficiente'}
${analysis.proteinFoods.length ? `Boas fontes de proteína que ele já usa: ${analysis.proteinFoods.join('; ')}` : ''}
${recentTitles ? `\nÚLTIMOS INSIGHTS (não repita o mesmo ângulo nem título): ${recentTitles}` : ''}

Responda com JSON:
{"title":"...","message":"...","expanded":"... ou null","cta":"... ou null","nextSteps":["...","..."],"mealIdea":{"title":"...","items":["item com quantidade"],"protein":30} ou null}`;

    console.log(`[insights] Calling AI | finding=${primary.key} (${primary.score}) | supporting=${supporting.map((f) => f.key).join(',')} | recent=${recentKeys.slice(0, 3).join(',')}`);

    type InsightPayload = {
      title: string;
      message: string;
      expanded?: string | null;
      cta?: string | null;
      nextSteps?: unknown[];
      mealIdea?: unknown;
    };
    let parsed: InsightPayload;
    // The deterministic fallback isn't persisted, so the next load retries
    // the AI instead of serving it from the 2-hour cache.
    let isFallback = false;
    try {
      parsed = await generateJSON<InsightPayload>({
        label: 'insights',
        system: INSIGHT_SYSTEM,
        parts: [{ text: contextPrompt }],
        // Gemini 3.5 spends output tokens on hidden reasoning before the
        // JSON; 2048 cut the payload mid-object in production.
        maxOutputTokens: 8192,
        temperature: 0.5,
        validate: (d) => {
          if (typeof d.title !== 'string' || !d.title.trim()) return false;
          if (typeof d.message !== 'string' || !/\d/.test(d.message)) return false;
          const text = `${d.title} ${d.message}`.toLowerCase();
          return !GENERIC_PHRASES.some((p) => text.includes(p));
        },
      });
    } catch (aiErr) {
      console.error('[insights] AI failed, using finding fallback:', aiErr instanceof Error ? aiErr.message : aiErr);
      parsed = { ...primary.fallback, expanded: null, cta: null, mealIdea: null };
      isFallback = true;
    }

    // Safely extract and validate nextSteps
    const nextSteps = Array.isArray(parsed.nextSteps)
      ? (parsed.nextSteps as unknown[]).map((s) => String(s).slice(0, 90)).slice(0, 3)
      : null;

    // Safely extract and validate mealIdea
    let mealIdea: { title: string; items: string[]; protein: number | null } | null = null;
    if (parsed.mealIdea && typeof parsed.mealIdea === 'object' && parsed.mealIdea !== null) {
      const m = parsed.mealIdea as Record<string, unknown>;
      mealIdea = {
        title:   String(m.title ?? '').slice(0, 80),
        items:   Array.isArray(m.items)
          ? (m.items as unknown[]).map((i) => String(i).slice(0, 60)).slice(0, 4)
          : [],
        protein: typeof m.protein === 'number' ? m.protein : null,
      };
      if (!mealIdea.items.length) mealIdea = null;
    }

    const insightData = {
      user_id:  userId,
      // Type and priority come from the finding, not the model, so the badge
      // always matches what the data actually shows.
      type:     primary.type,
      priority: primary.priority,
      title:    String(parsed.title   ?? '').slice(0, 100),
      message:  String(parsed.message ?? '').slice(0, 600),
      cta:      parsed.cta ? String(parsed.cta).slice(0, 60) : null,
      metadata: {
        todayCal:   stats.todayCal,   todayProt:  stats.todayProt,
        remainCal:  stats.remainCal,  remainProt: stats.remainProt,
        avgCal:     stats.avgCal,     avgProt:    stats.avgProt,
        workoutDays: stats.workoutDays, histDays: stats.completeDays,
        streak:     stats.streak,     weekendSpike: stats.weekendSpike,
        findingKey: primary.key,
        expanded:  parsed.expanded ? String(parsed.expanded).slice(0, 800) : null,
        scores:    stats.scores,
        nextSteps,
        mealIdea,
      },
    };

    if (!isFallback) {
      try {
        const { data: saved, error } = await supabase
          .from('ai_insights')
          .insert(insightData)
          .select()
          .single();
        if (!error && saved) {
          console.log(`[insights] Saved | finding=${primary.key} | type=${insightData.type} | priority=${insightData.priority}`);
          return NextResponse.json(saved);
        }
        if (error) console.error('[insights] Save error:', error.message);
      } catch (saveErr) {
        console.error('[insights] Save failed:', saveErr);
      }
    }

    // Return unsaved insight so the UI is never empty
    return NextResponse.json({
      ...insightData,
      id:           crypto.randomUUID(),
      generated_at: new Date().toISOString(),
      read_at:      null,
    });

  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[insights] Error:', msg);
    if (msg.includes('503') || msg.includes('UNAVAILABLE') || msg.includes('high demand'))
      return NextResponse.json({ error: 'O modelo de IA está com alta demanda. Tente em instantes.' }, { status: 503 });
    if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('quota'))
      return NextResponse.json({ error: 'Limite de requisições atingido. Aguarde e tente novamente.' }, { status: 429 });
    return NextResponse.json({ error: 'Erro ao gerar insight.' }, { status: 500 });
  }
}
