// Supabase Edge Function — AI Chat
// Deploy: supabase functions deploy chat
// Set secrets: supabase secrets set OPENAI_API_KEY=sk-...

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { messages, userContext } = await req.json();

    const systemPrompt = `Você é um coach de saúde e nutrição personalizado.
Meta calórica: ${userContext.targetCalories} kcal. Consumido hoje: ${userContext.dailyCalories} kcal.
Responda em português. Seja conciso e motivador.`;

    const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'system', content: systemPrompt }, ...messages],
        tools: [{
          type: 'function',
          function: {
            name: 'log_food',
            description: 'Registra um alimento no diário',
            parameters: {
              type: 'object',
              properties: {
                food_name: { type: 'string' },
                calories: { type: 'integer' },
                protein: { type: 'number' },
                carbs: { type: 'number' },
                fat: { type: 'number' },
                meal_type: { type: 'string', enum: ['breakfast', 'lunch', 'dinner', 'snack'] },
              },
              required: ['food_name', 'calories', 'meal_type'],
            },
          },
        }],
        tool_choice: 'auto',
        max_tokens: 500,
      }),
    });

    const completion = await openaiRes.json();
    const choice = completion.choices[0];
    let foodLogged = false;

    if (choice.message.tool_calls?.length) {
      for (const toolCall of choice.message.tool_calls) {
        if (toolCall.function.name === 'log_food') {
          const args = JSON.parse(toolCall.function.arguments);
          await supabase.from('food_logs').insert({
            user_id: user.id,
            ...args,
          });
          foodLogged = true;
        }
      }
    }

    const message = choice.message.content ?? 'Alimento registrado!';

    return new Response(JSON.stringify({ message, foodLogged }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
