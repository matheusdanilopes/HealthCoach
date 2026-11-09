/**
 * Um turno do chat do Coach: Gemini com a ferramenta log_food, Groq (só texto)
 * como reserva quando o Gemini cai.
 *
 * Isolado da rota (src/app/api/chat/route.ts) e com as dependências injetadas
 * para ser testado sem rede nem banco: o modelo, a gravação do alimento e o
 * Groq entram por `TurnDeps`.
 */

import {
  FunctionCallingConfigMode,
  Type,
  type Content,
  type GenerateContentConfig,
  type GenerateContentResponse,
  type Part,
} from '@google/genai';
import { GEMINI_MODEL, addUsage, geminiGenerationConfig, readUsage, type TokenUsage } from '@/lib/ai';

export const MEAL_TYPES = ['breakfast', 'morning_snack', 'lunch', 'afternoon_snack', 'dinner', 'supper', 'pre_workout', 'post_workout', 'other'];
export const MAX_HISTORY = 20;
export const MAX_MESSAGE_CHARS = 4000;
// Newer models can spend part of the output budget on hidden reasoning; a
// tight budget left replies empty or cut mid-sentence.
export const MAX_REPLY_TOKENS = 1024;
const CHAT_TEMPERATURE = 0.7;
export const EMPTY_REPLY = 'Desculpe, não consegui formular uma resposta agora. Pode repetir?';

export const LOG_FOOD_DECLARATION = {
  name: 'log_food',
  description: 'Registra um alimento no diário do usuário. O app calcula kcal e macros pela TACO (ou pelo rótulo salvo pelo usuário) a partir do peso em gramas.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      food_name: { type: Type.STRING, description: 'Nome do alimento' },
      quantity_g: { type: Type.NUMBER, description: 'Peso comestível em gramas (líquidos: ml ≈ g)' },
      taco_name: {
        type: Type.STRING,
        description: 'Descrição exata do alimento na TACO 4ª edição, com o mesmo preparo (ex.: "Arroz, tipo 1, cozido", "Frango, peito, sem pele, grelhado"). Omita se não souber ou se não existir.',
      },
      calories: { type: Type.INTEGER, description: 'Estimativa de kcal para esse peso — usada só se o alimento não estiver na TACO' },
      protein: { type: Type.NUMBER, description: 'Estimativa de proteína em gramas' },
      carbs: { type: Type.NUMBER, description: 'Estimativa de carboidratos em gramas' },
      fat: { type: Type.NUMBER, description: 'Estimativa de gordura em gramas' },
      meal_type: {
        type: Type.STRING,
        enum: MEAL_TYPES,
        description: 'Tipo de refeição',
      },
    },
    required: ['food_name', 'quantity_g', 'calories', 'meal_type'],
  },
};

const LOG_FOOD_PARAMS = Object.keys(LOG_FOOD_DECLARATION.parameters.properties);

// Nomes "quase certos" que o modelo às vezes usa no lugar dos declarados.
// Sem isso, `kcal: 300` era ignorado e o registro falhava por "calorias ausentes".
const LOG_FOOD_ALIASES: Record<string, string> = {
  name: 'food_name', food: 'food_name', nome: 'food_name', alimento: 'food_name', foodName: 'food_name',
  kcal: 'calories', calorias: 'calories', calorie: 'calories',
  proteina: 'protein', 'proteína': 'protein', proteins: 'protein',
  carboidratos: 'carbs', carbohydrates: 'carbs', carb: 'carbs',
  gordura: 'fat', fats: 'fat', gorduras: 'fat',
  meal: 'meal_type', mealType: 'meal_type', refeicao: 'meal_type', 'refeição': 'meal_type',
  grams: 'quantity_g', gramas: 'quantity_g', quantity: 'quantity_g', quantidade: 'quantity_g', peso: 'quantity_g', weight: 'quantity_g',
  taco: 'taco_name', tacoName: 'taco_name', nome_taco: 'taco_name',
};

export const FOOD_COACHING_RULES = `INSTRUÇÕES:
1. Quando o usuário mencionar que comeu algo, use a função log_food para registrar — um alimento por chamada, com o peso em gramas (quantity_g) e, se souber, a descrição exata da TACO 4ª ed. (taco_name). O app calcula kcal e macros pela TACO; calories é só a sua estimativa de reserva.
2. Estime pesos (e a estimativa de calorias) com MÁXIMO CONSERVADORISMO (referências TACO):
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

export function buildSystemInstruction(dynamicContext: string): string {
  return `Você é um coach de saúde e nutrição personalizado, amigável e motivador. Você está ajudando o usuário a alcançar seus objetivos de saúde através do controle alimentar e de hábitos.

CONTEXTO DO USUÁRIO:
${dynamicContext}

${FOOD_COACHING_RULES}`;
}

export interface IncomingMessage {
  role: 'user' | 'assistant';
  content: string;
}

// Keeps only well-formed messages, caps their size and makes the history start
// with a user turn (the client seeds the chat with an assistant greeting).
export function sanitizeMessages(input: unknown): IncomingMessage[] {
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
  return value != null && value !== '' && Number.isFinite(n) && n >= 0 ? Math.round(n * 10) / 10 : null;
}

/**
 * Corrige nomes de parâmetro "quase certos" (kcal → calories, name →
 * food_name…). Os que não dá para corrigir voltam em `unknown`, para o aviso
 * ao modelo em vez de serem ignorados em silêncio.
 */
export function normalizeLogFoodArgs(raw: Record<string, unknown>): { args: Record<string, unknown>; unknown: string[] } {
  const args: Record<string, unknown> = {};
  const unknown: string[] = [];
  for (const [key, value] of Object.entries(raw)) {
    const target = LOG_FOOD_PARAMS.includes(key) ? key : LOG_FOOD_ALIASES[key];
    if (!target) { unknown.push(key); continue; }
    // O nome declarado vence o apelido quando os dois vêm.
    if (!(target in args) || key === target) args[target] = value;
  }
  return { args, unknown };
}

export interface FoodLogRow {
  user_id: string;
  food_name: string;
  meal_type: string;
  /** Estimativa do modelo — o app recalcula pela TACO/rótulo quando acha o alimento. */
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  quantity_g: number | null;
  taco_name: string | null;
  log_date: string;
}

const SOURCE_LABEL: Record<string, string> = {
  taco: 'calculado pela TACO',
  rotulo: 'calculado pelo rótulo salvo',
  estimado: 'estimado (alimento não encontrado na TACO nem nos rótulos)',
  manual: 'informado',
};

/** Texto devolvido ao modelo depois de gravar: valores finais e o que fazer. */
export function describeLoggedFood(foodName: string, row: Record<string, unknown>): string {
  const grams = Number(row.quantity_g) > 0 ? ` (${Number(row.quantity_g)} g)` : '';
  const ref = typeof row.ref_nome === 'string' ? ` — "${row.ref_nome}"` : '';
  let text = `Registrado: ${foodName}${grams}, ${row.calories} kcal, ${SOURCE_LABEL[String(row.source)] ?? 'informado'}${ref}. Use esses valores na resposta.`;
  const warnings = (row.warnings as string[] | undefined) ?? [];
  if (warnings.length) text += ` Ficou marcado para revisão: ${warnings.join(' ')}`;
  if (row.source === 'estimado') {
    text += ' Pergunte se o usuário quer informar os dados do rótulo (porção, kcal e macros) pelo diário, para salvar o alimento e usar valores exatos nas próximas vezes.';
  }
  return text;
}

export interface TurnDeps {
  generate: (req: { model: string; contents: Content[]; config: GenerateContentConfig }) => Promise<GenerateContentResponse>;
  /**
   * Calcula (TACO/rótulo), valida e grava o alimento; devolve a linha inserida
   * ou null se falhar. Lança um erro com name 'FoodValidationError' quando a
   * validação bloqueia (ex.: kcal/g > 9) — a mensagem volta para o modelo.
   */
  insertFoodLog: (row: FoodLogRow) => Promise<Record<string, unknown> | null>;
  /** Resposta só em texto quando o Gemini falha. */
  groqReply: (systemInstruction: string, messages: IncomingMessage[]) => Promise<string>;
  now?: () => number;
}

export interface TurnInput {
  userId: string;
  systemInstruction: string;
  messages: IncomingMessage[];
  /** Dia do diário (calendário do Brasil). */
  logDate: string;
  model?: string;
}

export interface ToolTrace {
  name: string;
  args: Record<string, unknown>;
  result: string;
  ms: number;
}

/** Como a resposta foi produzida — gravado em chat_messages.meta. */
export interface TurnMeta {
  provider: 'gemini' | 'groq';
  model: string;
  rounds: number;
  durationMs: number;
  usage?: TokenUsage;
  tools: ToolTrace[];
  /** Resposta padrão usada porque o modelo não devolveu texto. */
  fallback?: 'empty' | 'follow_up';
  /** Chamada de ferramenta ignorada na rodada em que ferramentas estão proibidas. */
  ignoredToolCalls?: number;
  /** Erro do Gemini quando a resposta veio do Groq. */
  geminiError?: string;
}

export interface TurnResult {
  message: string;
  foodLogged: boolean;
  foodLog: Record<string, unknown> | null;
  meta: TurnMeta;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Texto das partes do candidato, ignorando raciocínio e chamadas de ferramenta. */
function replyText(response: GenerateContentResponse): string {
  const parts = response.candidates?.[0]?.content?.parts ?? [];
  return parts
    .filter((p) => typeof p.text === 'string' && !p.thought)
    .map((p) => p.text)
    .join('');
}

export async function runChatTurn(input: TurnInput, deps: TurnDeps): Promise<TurnResult> {
  const now = deps.now ?? Date.now;
  const started = now();
  const model = input.model ?? GEMINI_MODEL;
  const { systemInstruction, messages } = input;
  const tools = [{ functionDeclarations: [LOG_FOOD_DECLARATION] }];
  const generation = geminiGenerationConfig({
    model,
    maxOutputTokens: MAX_REPLY_TOKENS,
    temperature: CHAT_TEMPERATURE,
    thinking: 'low',
  });

  const contents: Content[] = messages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  const meta: TurnMeta = { provider: 'gemini', model, rounds: 0, durationMs: 0, tools: [] };
  const finish = (message: string, foodLogged: boolean, foodLog: Record<string, unknown> | null): TurnResult => {
    meta.durationMs = now() - started;
    return { message, foodLogged, foodLog, meta };
  };

  let response: GenerateContentResponse;
  try {
    response = await deps.generate({
      model,
      contents,
      config: {
        systemInstruction,
        tools,
        toolConfig: { functionCallingConfig: { mode: FunctionCallingConfigMode.AUTO } },
        ...generation,
      },
    });
    meta.rounds = 1;
    meta.usage = readUsage(response);
  } catch (geminiErr) {
    console.error('[chat] Gemini failed, falling back to Groq:', errorMessage(geminiErr));
    try {
      const message = (await deps.groqReply(systemInstruction, messages)).trim();
      meta.provider = 'groq';
      meta.model = 'groq';
      meta.geminiError = errorMessage(geminiErr).slice(0, 300);
      if (!message) meta.fallback = 'empty';
      return finish(message || EMPTY_REPLY, false, null);
    } catch (groqErr) {
      console.error('[chat] Groq fallback also failed:', errorMessage(groqErr));
      throw geminiErr;
    }
  }

  const call = response.functionCalls?.find((c) => c.name === 'log_food');
  if (!call) {
    const text = replyText(response);
    if (!text.trim()) meta.fallback = 'empty';
    return finish(text.trim() ? text : EMPTY_REPLY, false, null);
  }

  const toolStarted = now();
  const { args, unknown } = normalizeLogFoodArgs((call.args ?? {}) as Record<string, unknown>);
  const foodName = typeof args.food_name === 'string' ? args.food_name.trim().slice(0, 200) : '';
  const calories = optionalNumber(args.calories);
  const grams = optionalNumber(args.quantity_g);
  const quantityG = grams !== null && grams > 0 ? grams : null;
  const tacoName = typeof args.taco_name === 'string' && args.taco_name.trim() ? args.taco_name.trim().slice(0, 200) : null;
  const mealType = MEAL_TYPES.includes(args.meal_type as string) ? (args.meal_type as string) : 'other';

  let foodLog: Record<string, unknown> | null = null;
  let functionResult: string;
  if (!foodName || (calories === null && quantityG === null)) {
    // Sem nome, ou sem peso e sem estimativa, não há o que gravar.
    functionResult = 'Erro: nome do alimento ou quantidade em gramas ausentes. Peça mais detalhes ao usuário.';
  } else {
    let validationError: string | null = null;
    try {
      foodLog = await deps.insertFoodLog({
        user_id: input.userId,
        food_name: foodName,
        meal_type: mealType,
        calories: calories === null ? null : Math.round(calories),
        protein: optionalNumber(args.protein),
        carbs: optionalNumber(args.carbs),
        fat: optionalNumber(args.fat),
        quantity_g: quantityG,
        taco_name: tacoName,
        log_date: input.logDate,
      });
    } catch (e) {
      if (e instanceof Error && e.name === 'FoodValidationError') validationError = e.message;
      else console.error('[chat] food_logs insert failed:', errorMessage(e));
    }
    functionResult = foodLog
      ? describeLoggedFood(foodName, foodLog)
      : validationError
        ? `Erro: não registrado — ${validationError} Peça ao usuário para confirmar o peso e a quantidade.`
        : 'Erro ao registrar';
  }
  if (unknown.length) functionResult += ` (parâmetros desconhecidos ignorados: ${unknown.join(', ')})`;
  const foodLogged = foodLog !== null;
  meta.tools.push({ name: 'log_food', args: call.args ?? {}, result: functionResult, ms: now() - toolStarted });

  // The row may already be saved, so a failed follow-up must not turn into
  // an error response — the user would resend and log the food twice.
  let assistantMessage = '';
  try {
    // As partes do modelo voltam intactas: na família Gemini 3 a chamada de
    // ferramenta traz uma thoughtSignature que PRECISA voltar na mesma parte,
    // senão a API recusa a requisição.
    const modelParts: Part[] = response.candidates?.[0]?.content?.parts ?? [{ functionCall: call }];
    const followUp = await deps.generate({
      model,
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
        // No Gemini 3, tirar as ferramentas de uma conversa que já tem
        // chamadas fazia o modelo devolver vazio. Elas continuam declaradas,
        // mas proibidas (mode NONE).
        tools,
        toolConfig: { functionCallingConfig: { mode: FunctionCallingConfigMode.NONE } },
        ...generation,
      },
    });
    meta.rounds = 2;
    meta.usage = addUsage(meta.usage, readUsage(followUp));
    // Pedido de ferramenta na rodada proibida é ignorado (não registra de novo).
    const extraCalls = followUp.functionCalls?.length ?? 0;
    if (extraCalls) meta.ignoredToolCalls = extraCalls;
    assistantMessage = replyText(followUp);
  } catch (followErr) {
    console.error('[chat] follow-up failed:', errorMessage(followErr));
  }

  if (!assistantMessage.trim()) {
    meta.fallback = 'follow_up';
    assistantMessage = foodLogged
      ? `✅ Registrei ${foodName} (${Math.round(Number(foodLog?.calories ?? calories ?? 0))} kcal) no seu diário.`
      : 'Não consegui registrar esse alimento. Pode me dizer o nome e a quantidade?';
  }

  return finish(assistantMessage, foodLogged, foodLog);
}
