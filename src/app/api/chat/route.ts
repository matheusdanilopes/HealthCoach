import { NextResponse } from 'next/server';
import { GoogleGenAI, FunctionCallingConfigMode, Type } from '@google/genai';
import { auth } from '@/auth';
import { supabase } from '@/lib/db';
import { withGeminiRetry } from '@/lib/gemini-retry';
import { detectIntent, buildDynamicContext } from '@/lib/chat-context';

let gemini: GoogleGenAI | null = null;
function getGemini(): GoogleGenAI {
  return (gemini ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! }));
}

const LOG_FOOD_DECLARATION = {
  name: 'log_food',
  description: 'Registra um alimento no diário do usuário',
  parameters: {
    type: Type.OBJECT,
    properties: {
      food_name: { type: Type.STRING, description: 'Nome do alimento ou refeição' },
      calories: { type: Type.INTEGER, description: 'Calorias estimadas em kcal' },
      protein: { type: Type.NUMBER, description: 'Proteína em gramas' },
      carbs: { type: Type.NUMBER, description: 'Carboidratos em gramas' },
      fat: { type: Type.NUMBER, description: 'Gordura em gramas' },
      meal_type: {
        type: Type.STRING,
        enum: ['breakfast', 'morning_snack', 'lunch', 'afternoon_snack', 'dinner', 'supper', 'pre_workout', 'post_workout', 'other'],
        description: 'Tipo de refeição',
      },
    },
    required: ['food_name', 'calories', 'meal_type'],
  },
};

interface IncomingMessage {
  role: 'user' | 'assistant';
  content: string;
}

const FOOD_COACHING_RULES = `INSTRUÇÕES:
1. Quando o usuário mencionar que comeu algo, use a função log_food para registrar.
2. Estime calorias e macros com MÁXIMO CONSERVADORISMO (referências TACO):
   - NUNCA assuma 100g para porções vagas — prefira sempre subestimar
   - "um pedaço" = 20-35g | "um pouco" = 5-15g | "uma colher" = 10-15g (sopa) ou 5g (chá)
   - Proteína PRATO PRINCIPAL: 80-120g | RECHEIO (tapioca, crepioca, wrap): 40-60g
   - Condimentos (maionese, requeijão, manteiga): 5-10g (1 col. chá), NÃO 1 col. sopa
   - Frango cozido: 159 kcal/100g | Ovo (1 un ≈ 50g): 74 kcal | Arroz cozido: 128 kcal/100g
   - Mandioca frita (1 pedaço ≈ 30g): 62 kcal | Batata frita: 180 kcal/100g (porção: 60-80g)
   - Pão francês (1 un ≈ 50g): 135 kcal | Maionese (5g): 33 kcal | Mussarela (25g): 66 kcal
   - Pastel pequeno (1 un ≈ 70g): 225 kcal | Amendoim (1 punhado ≈ 20g): 118 kcal
3. Seja encorajador e use os dados reais para personalizar suas respostas.
4. Responda sempre em português do Brasil.
5. Seja conciso — respostas curtas e diretas, com emojis quando apropriado.
6. Dê feedback sobre o progresso baseado nos dados do contexto.`;

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const user = session.user;

    const { messages }: { messages: IncomingMessage[] } = await req.json();

    // Detect intent from the latest user message
    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
    const intent = lastUserMsg ? detectIntent(lastUserMsg.content) : 'general_coaching';

    // Build dynamic context — fetches only data relevant to the detected intent
    const dynamicContext = await buildDynamicContext(user.id, intent);

    console.log(`[chat] intent=${intent} | user=${user.id}`);

    const systemInstruction = `Você é um coach de saúde e nutrição personalizado, amigável e motivador. Você está ajudando o usuário a alcançar seus objetivos de saúde através do controle alimentar e de hábitos.

CONTEXTO DO USUÁRIO:
${dynamicContext}

${FOOD_COACHING_RULES}`;

    const contents = messages.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

    const response = await withGeminiRetry(() =>
      getGemini().models.generateContent({
        model: 'gemini-2.5-flash',
        contents,
        config: {
          systemInstruction,
          tools: [{ functionDeclarations: [LOG_FOOD_DECLARATION] }],
          toolConfig: { functionCallingConfig: { mode: FunctionCallingConfigMode.AUTO } },
          maxOutputTokens: 500,
          temperature: 0.7,
          thinkingConfig: { thinkingBudget: 0 },
        },
      })
    );

    let foodLogged = false;
    let assistantMessage = '';
    let insertedRow: Record<string, unknown> | null = null;

    const functionCalls = response.functionCalls;
    if (functionCalls?.length) {
      const call = functionCalls[0];
      if (call.name === 'log_food') {
        const args = call.args as {
          food_name: string;
          calories: number;
          meal_type: string;
          protein?: number;
          carbs?: number;
          fat?: number;
        };

        const today = new Date().toISOString().split('T')[0];
        let insertError: unknown = null;
        try {
          const { data, error } = await supabase.from('food_logs').insert({
            user_id: user.id,
            food_name: args.food_name,
            meal_type: args.meal_type,
            calories: args.calories,
            protein: args.protein ?? null,
            carbs: args.carbs ?? null,
            fat: args.fat ?? null,
            log_date: today,
          }).select().single();
          if (error) insertError = error;
          else insertedRow = data as Record<string, unknown>;
        } catch (e) {
          insertError = e;
        }

        foodLogged = !insertError;
        const functionResult = insertError
          ? 'Erro ao registrar'
          : `Registrado: ${args.food_name}, ${args.calories} kcal`;

        const modelParts = response.candidates?.[0]?.content?.parts ?? [];
        const followUp = await withGeminiRetry(() =>
          getGemini().models.generateContent({
            model: 'gemini-2.5-flash',
            contents: [
              ...contents,
              { role: 'model', parts: modelParts },
              {
                role: 'user',
                parts: [{ functionResponse: { name: 'log_food', response: { result: functionResult } } }],
              },
            ],
            config: { systemInstruction, maxOutputTokens: 400, temperature: 0.7, thinkingConfig: { thinkingBudget: 0 } },
          })
        );

        assistantMessage = followUp.text ?? '';
      }
    } else {
      assistantMessage = response.text ?? '';
    }

    return NextResponse.json({ message: assistantMessage, foodLogged, foodLog: insertedRow ?? null });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('Chat API error:', msg);
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
        { error: 'Limite de requisições da API atingido. Aguarde 1-2 minutos e tente novamente. Se o problema persistir, o limite diário pode ter sido atingido.' },
        { status: 429 }
      );
    }
    return NextResponse.json(
      { error: 'Erro interno. Verifique se a chave GEMINI_API_KEY está configurada.' },
      { status: 500 }
    );
  }
}
