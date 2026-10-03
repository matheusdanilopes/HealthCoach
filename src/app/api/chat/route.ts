import { NextResponse } from 'next/server';
import { FunctionCallingConfigMode, Type } from '@google/genai';
import { auth } from '@/auth';
import { supabase } from '@/lib/db';
import { withGeminiRetry } from '@/lib/gemini-retry';
import { callGroq } from '@/lib/groq';
import { DEFAULT_AI_TIMEOUT_MS, GEMINI_MODEL, aiErrorResponse, getGemini } from '@/lib/ai';
import { brazilToday } from '@/lib/timezone';
import { detectIntent, buildDynamicContext } from '@/lib/chat-context';

const MEAL_TYPES = ['breakfast', 'morning_snack', 'lunch', 'afternoon_snack', 'dinner', 'supper', 'pre_workout', 'post_workout', 'other'];
const MAX_HISTORY = 20;
const MAX_MESSAGE_CHARS = 4000;
// Newer models can spend part of the output budget on hidden reasoning; a
// tight budget left replies empty or cut mid-sentence.
const MAX_REPLY_TOKENS = 1024;
const EMPTY_REPLY = 'Desculpe, não consegui formular uma resposta agora. Pode repetir?';

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
        enum: MEAL_TYPES,
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

// Keeps only well-formed messages, caps their size and makes the history start
// with a user turn (the client seeds the chat with an assistant greeting).
function sanitizeMessages(input: unknown): IncomingMessage[] {
  if (!Array.isArray(input)) return [];
  const messages = input
    .filter((m): m is IncomingMessage =>
      typeof m === 'object' && m !== null &&
      (m.role === 'user' || m.role === 'assistant') &&
      typeof m.content === 'string' && m.content.trim() !== '')
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_MESSAGE_CHARS) }))
    .slice(-MAX_HISTORY);
  while (messages.length && messages[0].role !== 'user') messages.shift();
  return messages;
}

function optionalNumber(value: unknown): number | null {
  const n = Number(value);
  return value != null && Number.isFinite(n) && n >= 0 ? Math.round(n * 10) / 10 : null;
}

// Text-only fallback when Gemini is down: Groq gets the conversation as a
// transcript and is told it cannot log food, so it never claims it did.
async function groqReply(systemInstruction: string, messages: IncomingMessage[]): Promise<string> {
  const transcript = messages
    .map((m) => `${m.role === 'user' ? 'Usuário' : 'Coach'}: ${m.content}`)
    .join('\n\n');
  return callGroq(
    `${systemInstruction}

AVISO: o registro automático de alimentos está indisponível agora. NÃO diga que registrou nada; se o usuário relatar uma refeição, dê a estimativa e peça para registrá-la pelo diário.
Responda somente à última mensagem do usuário, como Coach, sem prefixo.`,
    [{ text: transcript }],
    { maxOutputTokens: MAX_REPLY_TOKENS, temperature: 0.7 }
  );
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const user = session.user;

    const body = await req.json().catch(() => null);
    const messages = sanitizeMessages(body?.messages);
    if (messages.length === 0 || messages[messages.length - 1].role !== 'user') {
      return NextResponse.json({ error: 'Mensagem inválida.' }, { status: 400 });
    }

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

    let response;
    try {
      response = await withGeminiRetry(() =>
        getGemini().models.generateContent({
          model: GEMINI_MODEL,
          contents,
          config: {
            systemInstruction,
            tools: [{ functionDeclarations: [LOG_FOOD_DECLARATION] }],
            toolConfig: { functionCallingConfig: { mode: FunctionCallingConfigMode.AUTO } },
            maxOutputTokens: MAX_REPLY_TOKENS,
            temperature: 0.7,
            httpOptions: { timeout: DEFAULT_AI_TIMEOUT_MS },
          },
        })
      );
    } catch (geminiErr) {
      console.error('[chat] Gemini failed, falling back to Groq:', geminiErr instanceof Error ? geminiErr.message : geminiErr);
      try {
        const message = await groqReply(systemInstruction, messages);
        return NextResponse.json({ message: message.trim() || EMPTY_REPLY, foodLogged: false, foodLog: null });
      } catch (groqErr) {
        console.error('[chat] Groq fallback also failed:', groqErr instanceof Error ? groqErr.message : groqErr);
        throw geminiErr;
      }
    }

    let foodLogged = false;
    let assistantMessage = '';
    let insertedRow: Record<string, unknown> | null = null;

    const call = response.functionCalls?.find((c) => c.name === 'log_food');
    if (call) {
      const args = (call.args ?? {}) as Record<string, unknown>;
      const foodName = typeof args.food_name === 'string' ? args.food_name.trim().slice(0, 200) : '';
      const calories = optionalNumber(args.calories);
      const mealType = MEAL_TYPES.includes(args.meal_type as string) ? (args.meal_type as string) : 'other';

      let functionResult: string;
      if (!foodName || calories === null) {
        // Don't insert a row with a blank name or missing calories.
        functionResult = 'Erro: nome do alimento ou calorias ausentes. Peça mais detalhes ao usuário.';
      } else {
        try {
          const { data, error } = await supabase.from('food_logs').insert({
            user_id: user.id,
            food_name: foodName,
            meal_type: mealType,
            calories: Math.round(calories),
            protein: optionalNumber(args.protein),
            carbs: optionalNumber(args.carbs),
            fat: optionalNumber(args.fat),
            // Diary days follow the Brazil calendar, not UTC.
            log_date: brazilToday(),
          }).select().single();
          if (error) console.error('[chat] food_logs insert error:', error.message);
          else insertedRow = data as Record<string, unknown>;
        } catch (e) {
          console.error('[chat] food_logs insert failed:', e);
        }
        foodLogged = insertedRow !== null;
        functionResult = foodLogged
          ? `Registrado: ${foodName}, ${Math.round(calories)} kcal`
          : 'Erro ao registrar';
      }

      // The row may already be saved, so a failed follow-up must not turn into
      // an error response — the user would resend and log the food twice.
      try {
        const modelParts = response.candidates?.[0]?.content?.parts ?? [];
        const followUp = await withGeminiRetry(() =>
          getGemini().models.generateContent({
            model: GEMINI_MODEL,
            contents: [
              ...contents,
              { role: 'model', parts: modelParts },
              {
                role: 'user',
                parts: [{ functionResponse: { name: 'log_food', response: { result: functionResult } } }],
              },
            ],
            config: {
              systemInstruction,
              maxOutputTokens: MAX_REPLY_TOKENS,
              temperature: 0.7,
              httpOptions: { timeout: DEFAULT_AI_TIMEOUT_MS },
            },
          })
        );
        assistantMessage = followUp.text ?? '';
      } catch (followErr) {
        console.error('[chat] follow-up failed:', followErr instanceof Error ? followErr.message : followErr);
      }

      if (!assistantMessage.trim()) {
        assistantMessage = foodLogged
          ? `✅ Registrei ${foodName} (${Math.round(calories ?? 0)} kcal) no seu diário.`
          : 'Não consegui registrar esse alimento. Pode me dizer o nome e a quantidade?';
      }
    } else {
      assistantMessage = response.text ?? '';
    }

    if (!assistantMessage.trim()) assistantMessage = EMPTY_REPLY;

    return NextResponse.json({ message: assistantMessage, foodLogged, foodLog: insertedRow ?? null });
  } catch (error) {
    return aiErrorResponse(error, 'chat', 'Desculpe, tive um problema. Tente novamente.');
  }
}
