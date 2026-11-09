/**
 * POST /api/chat — turno do Coach, em Server-Sent Events.
 *
 * Por que SSE: com o Gemini 3 uma resposta pode levar dezenas de segundos, e
 * no celular a conexão cai quando a pessoa sai do app no meio da espera. O
 * turno roda desacoplado do stream (registrado com after()), termina e grava
 * a resposta em chat_messages mesmo com o cliente desconectado; o app a busca
 * em /api/chat/history quando a conexão cai (ver AIChat).
 *
 * Corpo: { conversation_id, message_id, messages }
 *   conversation_id / message_id: uuids gerados pelo app — é pelo message_id
 *   da pergunta que o app acha a resposta no histórico.
 *
 * Eventos (cada um `event: <tipo>` + `data: <json>`):
 *   ping  {}                                          sinal de vida a cada 8 s
 *   done  { message, foodLogged, foodLog, message_id } message_id = id gravado (👍/👎)
 *   error { error, status }
 */

import { NextResponse, after } from 'next/server';
import { auth } from '@/auth';
import { insertInto } from '@/lib/db';
import { DEFAULT_AI_TIMEOUT_MS, aiErrorInfo, getGemini } from '@/lib/ai';
import { withGeminiRetry } from '@/lib/gemini-retry';
import { callGroq } from '@/lib/groq';
import { brazilToday } from '@/lib/timezone';
import { detectIntent, buildDynamicContext } from '@/lib/chat-context';
import { formatSSE } from '@/lib/chat/sse';
import { isUuid, newId } from '@/lib/chat/recovery';
import { saveAssistantMessage, saveUserMessage } from '@/lib/chat/store';
import { FoodValidationError, referenceColumns, resolveFood } from '@/lib/nutrition/foods';
import {
  MAX_REPLY_TOKENS,
  buildSystemInstruction,
  runChatTurn,
  sanitizeMessages,
  type IncomingMessage,
  type TurnDeps,
} from '@/lib/chat/turn';

// O turno (Gemini com retries + follow-up) precisa terminar e gravar mesmo
// com o cliente fora; o app procura a resposta por até 100 s.
export const maxDuration = 90;

const PING_MS = 8_000;

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

const deps: TurnDeps = {
  generate: ({ model, contents, config }) =>
    withGeminiRetry(() =>
      getGemini().models.generateContent({
        model,
        contents,
        config: { ...config, httpOptions: { timeout: DEFAULT_AI_TIMEOUT_MS } },
      })
    ),
  // Rótulo do usuário → TACO → estimativa do modelo; ERRO de validação não grava.
  insertFoodLog: async ({ quantity_g, taco_name, calories, protein, carbs, fat, ...row }) => {
    const resolved = await resolveFood(row.user_id, {
      name: row.food_name,
      taco_name,
      grams: quantity_g,
      estimate: { calories: calories ?? 0, protein, carbs, fat },
    });
    if (resolved.validation.blocked) throw new FoodValidationError(resolved.validation);
    const [data] = await insertInto('food_logs', {
      ...row,
      calories: resolved.calories,
      protein: resolved.protein,
      carbs: resolved.carbs,
      fat: resolved.fat,
      quantity_g: resolved.quantity_g,
      source: resolved.source,
      taco_food_id: resolved.taco_food_id,
      custom_food_id: resolved.custom_food_id,
      needs_review: resolved.needs_review,
    }, { returning: '*' });
    if (!data) return null;
    return {
      ...data,
      ...referenceColumns(resolved.reference),
      warnings: resolved.validation.issues.map((i) => i.message),
    };
  },
  groqReply,
};

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = session.user.id;

  const body = await req.json().catch(() => null);
  const messages = sanitizeMessages(body?.messages);
  if (messages.length === 0 || messages[messages.length - 1].role !== 'user') {
    return NextResponse.json({ error: 'Mensagem inválida.' }, { status: 400 });
  }
  // Versões antigas do app (PWA em cache) não mandam os ids: o turno funciona,
  // só não dá para recuperar a resposta se a conexão cair.
  const conversationId = isUuid(body?.conversation_id) ? body.conversation_id : newId();
  const questionId = isUuid(body?.message_id) ? body.message_id : newId();
  const question = messages[messages.length - 1].content;

  const encoder = new TextEncoder();
  let connected = true;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (type: string, payload: unknown) => {
        if (!connected) return;
        try { controller.enqueue(encoder.encode(formatSSE(type, payload))); }
        catch { connected = false; /* cliente desconectou */ }
      };
      // O modelo pode ficar dezenas de segundos sem responder: o app usa o
      // ping para saber se a conexão ainda está de pé.
      const ping = setInterval(() => send('ping', {}), PING_MS);

      const turn = (async () => {
        try {
          await saveUserMessage({ id: questionId, userId, conversationId, content: question });

          const intent = detectIntent(question);
          const dynamicContext = await buildDynamicContext(userId, intent);
          console.log(`[chat] intent=${intent} | user=${userId}`);

          const result = await runChatTurn(
            {
              userId,
              systemInstruction: buildSystemInstruction(dynamicContext),
              messages,
              // Diary days follow the Brazil calendar, not UTC.
              logDate: brazilToday(),
            },
            deps
          );

          // Grava antes do "done": se o cliente caiu, é daqui que ele busca.
          const messageId = await saveAssistantMessage({
            userId,
            conversationId,
            content: result.message,
            foodLogId: typeof result.foodLog?.id === 'string' ? result.foodLog.id : null,
            meta: { ...result.meta, intent },
          });

          send('done', {
            message: result.message,
            foodLogged: result.foodLogged,
            foodLog: result.foodLog,
            message_id: messageId,
          });
        } catch (err) {
          send('error', aiErrorInfo(err, 'chat', 'Desculpe, tive um problema. Tente novamente.'));
        } finally {
          clearInterval(ping);
          try { controller.close(); } catch { /* já fechado */ }
        }
      })();

      // Mantém a função viva até o turno terminar mesmo se o cliente sair —
      // senão a resposta nunca era gravada.
      after(turn);
    },
    cancel() {
      // Cliente desconectou: o turno segue (ver after acima), só para de enviar.
      connected = false;
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      // Evita buffering em proxies (o stream chegaria de uma vez só no fim).
      'X-Accel-Buffering': 'no',
    },
  });
}
