import { NextResponse } from 'next/server';
import { GoogleGenAI, FunctionCallingConfigMode, Type } from '@google/genai';
import { auth } from '@/auth';
import { supabase } from '@/lib/db';

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
        enum: ['breakfast', 'lunch', 'dinner', 'snack'],
        description: 'Tipo de refeição',
      },
    },
    required: ['food_name', 'calories', 'meal_type'],
  },
};

interface UserContext {
  userId: string;
  name?: string;
  targetCalories?: number;
  dailyCalories?: number;
  remaining?: number;
  dailyWater?: number;
  targetWater?: number;
  weight?: number;
}

interface IncomingMessage {
  role: 'user' | 'assistant';
  content: string;
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const user = session.user;

    const { messages, userContext }: { messages: IncomingMessage[]; userContext: UserContext } =
      await req.json();

    const systemInstruction = `Você é um coach de saúde e nutrição personalizado, amigável e motivador. Você está ajudando o usuário a emagrecer de forma saudável através do controle do déficit calórico.

DADOS ATUAIS DO USUÁRIO:
- Nome: ${userContext.name ?? 'Usuário'}
- Peso atual: ${userContext.weight ? `${userContext.weight}kg` : 'não informado'}
- Meta calórica diária: ${userContext.targetCalories ?? 'não definida'} kcal
- Calorias consumidas hoje: ${userContext.dailyCalories ?? 0} kcal
- Calorias restantes: ${userContext.remaining ?? 0} kcal
- Água consumida hoje: ${userContext.dailyWater ? `${userContext.dailyWater}ml` : '0ml'} / ${userContext.targetWater ?? 2500}ml

INSTRUÇÕES:
1. Quando o usuário mencionar que comeu algo, use a função log_food para registrar.
2. Estime as calorias e macros com base em porções típicas brasileiras quando não especificado.
3. Seja encorajador e use os dados reais para personalizar suas respostas.
4. Responda sempre em português do Brasil.
5. Seja conciso — respostas curtas e diretas, com emojis quando apropriado.
6. Dê feedback sobre o progresso do dia baseado nas calorias restantes.`;

    // Convert messages to Gemini content format (role: 'user' | 'model')
    const contents = messages.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

    const response = await getGemini().models.generateContent({
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
    });

    let foodLogged = false;
    let assistantMessage = '';

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
          const { error } = await supabase.from('food_logs').insert({
            user_id: user.id,
            food_name: args.food_name,
            meal_type: args.meal_type,
            calories: args.calories,
            protein: args.protein ?? null,
            carbs: args.carbs ?? null,
            fat: args.fat ?? null,
            log_date: today,
          });
          if (error) insertError = error;
        } catch (e) {
          insertError = e;
        }

        foodLogged = !insertError;
        const functionResult = insertError
          ? 'Erro ao registrar'
          : `Registrado: ${args.food_name}, ${args.calories} kcal`;

        // Follow-up with the function response
        const modelParts = response.candidates?.[0]?.content?.parts ?? [];
        const followUp = await getGemini().models.generateContent({
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
        });

        assistantMessage = followUp.text ?? '';
      }
    } else {
      assistantMessage = response.text ?? '';
    }

    return NextResponse.json({ message: assistantMessage, foodLogged });
  } catch (error) {
    console.error('Chat API error:', error);
    return NextResponse.json(
      { error: 'Erro interno. Verifique se a chave GEMINI_API_KEY está configurada.' },
      { status: 500 }
    );
  }
}
