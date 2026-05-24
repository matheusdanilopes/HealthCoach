import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { auth } from '@/auth';
import { sql } from '@/lib/db';

let openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!openai) {
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return openai;
}

const LOG_FOOD_TOOL: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'log_food',
    description: 'Registra um alimento no diário do usuário',
    parameters: {
      type: 'object',
      properties: {
        food_name: { type: 'string', description: 'Nome do alimento ou refeição' },
        calories: { type: 'integer', description: 'Calorias estimadas em kcal' },
        protein: { type: 'number', description: 'Proteína em gramas' },
        carbs: { type: 'number', description: 'Carboidratos em gramas' },
        fat: { type: 'number', description: 'Gordura em gramas' },
        meal_type: {
          type: 'string',
          enum: ['breakfast', 'lunch', 'dinner', 'snack'],
          description: 'Tipo de refeição',
        },
      },
      required: ['food_name', 'calories', 'meal_type'],
    },
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

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const user = session.user;

    const { messages, userContext }: { messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[]; userContext: UserContext } =
      await req.json();

    const systemPrompt = `Você é um coach de saúde e nutrição personalizado, amigável e motivador. Você está ajudando o usuário a emagrecer de forma saudável através do controle do déficit calórico.

DADOS ATUAIS DO USUÁRIO:
- Nome: ${userContext.name ?? 'Usuário'}
- Peso atual: ${userContext.weight ? `${userContext.weight}kg` : 'não informado'}
- Meta calórica diária: ${userContext.targetCalories ?? 'não definida'} kcal
- Calorias consumidas hoje: ${userContext.dailyCalories ?? 0} kcal
- Calorias restantes: ${userContext.remaining ?? 0} kcal
- Água consumida hoje: ${userContext.dailyWater ? `${userContext.dailyWater}ml` : '0ml'} / ${userContext.targetWater ?? 2500}ml

INSTRUÇÕES:
1. Quando o usuário mencionar que comeu algo, use a função log_food para registrar. Se mencionar vários alimentos de uma vez, você pode registrá-los separadamente ou agrupados.
2. Estime as calorias e macros com base em porções típicas brasileiras quando não especificado.
3. Seja encorajador e use os dados reais para personalizar suas respostas.
4. Responda sempre em português do Brasil.
5. Seja conciso — respostas curtas e diretas, com emojis quando apropriado.
6. Dê feedback sobre o progresso do dia baseado nas calorias restantes.`;

    const completion = await getOpenAI().chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages,
      ],
      tools: [LOG_FOOD_TOOL],
      tool_choice: 'auto',
      max_tokens: 500,
      temperature: 0.7,
    });

    const choice = completion.choices[0];
    let foodLogged = false;
    let assistantMessage = '';

    if (choice.message.tool_calls?.length) {
      const toolResults: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];

      for (const toolCall of choice.message.tool_calls) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const tc = toolCall as any;
        if (tc.function?.name === 'log_food') {
          const args = JSON.parse(tc.function.arguments);

          const today = new Date().toISOString().split('T')[0];
          let insertError: unknown = null;
          try {
            await sql`
              INSERT INTO food_logs (user_id, food_name, meal_type, calories, protein, carbs, fat, log_date)
              VALUES (${user.id}, ${args.food_name}, ${args.meal_type}, ${args.calories},
                      ${args.protein ?? null}, ${args.carbs ?? null}, ${args.fat ?? null}, ${today})
            `;
          } catch (e) {
            insertError = e;
          }

          foodLogged = !insertError;
          toolResults.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: insertError
              ? 'Erro ao registrar'
              : `Registrado: ${args.food_name}, ${args.calories} kcal`,
          });
        }
      }

      const followUp = await getOpenAI().chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages,
          choice.message,
          ...toolResults,
        ],
        max_tokens: 400,
        temperature: 0.7,
      });

      assistantMessage = followUp.choices[0].message.content ?? '';
    } else {
      assistantMessage = choice.message.content ?? '';
    }

    return NextResponse.json({ message: assistantMessage, foodLogged });
  } catch (error) {
    console.error('Chat API error:', error);
    return NextResponse.json(
      { error: 'Erro interno. Verifique se a chave de API está configurada.' },
      { status: 500 }
    );
  }
}
