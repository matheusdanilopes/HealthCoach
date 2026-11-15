import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FunctionCallingConfigMode, type Content, type GenerateContentConfig, type GenerateContentResponse } from '@google/genai';
import {
  DEEP_TIMEOUT_MS,
  EMPTY_REPLY,
  normalizeLogFoodArgs,
  runChatTurn,
  sanitizeMessages,
  type FoodLogRow,
  type TurnDeps,
  type TurnInput,
} from '@/lib/chat/turn';
import { geminiResponse, textResponse } from '@/lib/chat/testing';

type Request = { model: string; contents: Content[]; config: GenerateContentConfig; timeoutMs: number };

/** Nomes das ferramentas declaradas numa requisição. */
const toolNames = (req: Request) =>
  (req.config.tools?.[0] as { functionDeclarations?: { name?: string }[] } | undefined)?.functionDeclarations?.map((d) => d.name);

function setup(responses: Array<GenerateContentResponse | Error>, opts: { insertFails?: boolean; groq?: string | Error } = {}) {
  const requests: Request[] = [];
  const inserted: FoodLogRow[] = [];
  const deps: TurnDeps = {
    generate: async (req) => {
      requests.push(req);
      const next = responses.shift();
      if (!next) throw new Error('chamada inesperada ao modelo');
      if (next instanceof Error) throw next;
      return next;
    },
    insertFoodLog: async (row) => {
      if (opts.insertFails) throw new Error('db down');
      inserted.push(row);
      return { id: 'f1', ...row };
    },
    groqReply: async () => {
      if (opts.groq instanceof Error) throw opts.groq;
      return opts.groq ?? 'resposta do groq';
    },
  };
  return { deps, requests, inserted };
}

const input = (content = 'Comi 2 ovos no café'): TurnInput => ({
  userId: 'u1',
  systemInstruction: 'sistema',
  messages: [{ role: 'user', content }],
  logDate: '2026-11-09',
  model: 'gemini-3.8-flash',
});

const logFoodCall = (args: Record<string, unknown>, thoughtSignature = 'assinatura-123') =>
  geminiResponse([{ functionCall: { name: 'log_food', args }, thoughtSignature }]);

// Silencia os console.error esperados (falhas simuladas).
function quiet<T>(fn: () => Promise<T>): Promise<T> {
  const original = console.error;
  console.error = () => {};
  return fn().finally(() => { console.error = original; });
}

test('resposta só em texto: uma rodada, ferramenta liberada (AUTO) e uso registrado', async () => {
  const { deps, requests } = setup([textResponse('Ótima escolha! 💪')]);
  const r = await runChatTurn(input('Como estou hoje?'), deps);
  assert.equal(r.message, 'Ótima escolha! 💪');
  assert.equal(r.foodLogged, false);
  assert.equal(r.meta.rounds, 1);
  assert.equal(r.meta.provider, 'gemini');
  assert.equal(r.meta.model, 'gemini-3.8-flash');
  assert.deepEqual(r.meta.usage, { input: 100, output: 20, thinking: 30 });
  assert.equal(requests[0].config.toolConfig?.functionCallingConfig?.mode, FunctionCallingConfigMode.AUTO);
  assert.equal(requests[0].config.temperature, undefined, 'Gemini 3 sem temperatura fixa');
  assert.equal(requests[0].config.thinkingConfig?.thinkingLevel, 'LOW');
});

test('log_food: grava, devolve a thoughtSignature e responde com ferramentas proibidas (NONE)', async () => {
  const { deps, requests, inserted } = setup([
    logFoodCall({ food_name: '2 ovos cozidos', calories: 148, protein: 12.6, carbs: 1, fat: 10, meal_type: 'breakfast' }),
    textResponse('✅ Registrado! Ótima proteína no café.'),
  ]);
  const r = await runChatTurn(input(), deps);

  assert.equal(r.foodLogged, true);
  assert.equal(r.message, '✅ Registrado! Ótima proteína no café.');
  assert.deepEqual(inserted, [{
    user_id: 'u1', food_name: '2 ovos cozidos', meal_type: 'breakfast', calories: 148,
    protein: 12.6, carbs: 1, fat: 10, log_date: '2026-11-09',
  }]);

  const followUp = requests[1];
  const modelTurn = followUp.contents.at(-2)!;
  assert.equal(modelTurn.role, 'model');
  assert.equal(modelTurn.parts?.[0].thoughtSignature, 'assinatura-123', 'a assinatura volta na mesma parte');
  const toolTurn = followUp.contents.at(-1)!;
  assert.equal(toolTurn.role, 'user', 'resposta de função vai como "user"');
  assert.equal(toolTurn.parts?.[0].functionResponse?.response?.result, 'Registrado: 2 ovos cozidos, 148 kcal');
  assert.ok(followUp.config.tools?.length, 'ferramentas continuam declaradas na rodada final');
  assert.equal(followUp.config.toolConfig?.functionCallingConfig?.mode, FunctionCallingConfigMode.NONE);

  assert.equal(r.meta.rounds, 2);
  assert.deepEqual(r.meta.usage, { input: 200, output: 40, thinking: 60 });
  assert.equal(r.meta.tools.length, 1);
  assert.equal(r.meta.tools[0].result, 'Registrado: 2 ovos cozidos, 148 kcal');
});

test('rodada final vazia: resposta padrão confirmando o registro', async () => {
  const { deps } = setup([
    logFoodCall({ food_name: 'Banana', calories: 89, meal_type: 'morning_snack' }),
    textResponse(''),
  ]);
  const r = await runChatTurn(input('comi uma banana'), deps);
  assert.equal(r.message, '✅ Registrei Banana (89 kcal) no seu diário.');
  assert.equal(r.meta.fallback, 'follow_up');
});

test('rodada final que falha não vira erro (o alimento já foi gravado)', async () => {
  const { deps, inserted } = setup([
    logFoodCall({ food_name: 'Banana', calories: 89, meal_type: 'morning_snack' }),
    new Error('500 INTERNAL'),
  ]);
  const r = await quiet(() => runChatTurn(input('comi uma banana'), deps));
  assert.equal(inserted.length, 1);
  assert.equal(r.foodLogged, true);
  assert.match(r.message, /Registrei Banana/);
});

test('pedido de ferramenta na rodada proibida é ignorado (não grava duas vezes)', async () => {
  const { deps, inserted } = setup([
    logFoodCall({ food_name: 'Pão francês', calories: 135, meal_type: 'breakfast' }),
    geminiResponse([{ text: 'Registrado!' }, { functionCall: { name: 'log_food', args: { food_name: 'Pão francês', calories: 135 } } }]),
  ]);
  const r = await runChatTurn(input('comi um pão'), deps);
  assert.equal(inserted.length, 1);
  assert.equal(r.message, 'Registrado!');
  assert.equal(r.meta.ignoredToolCalls, 1);
});

test('parâmetros "quase certos" são corrigidos; desconhecidos voltam como aviso', async () => {
  const { deps, requests, inserted } = setup([
    logFoodCall({ name: 'Tapioca com frango', kcal: 260, proteina: 15, meal: 'afternoon_snack', porcao: '1 un' }),
    textResponse('Anotado!'),
  ]);
  await runChatTurn(input('comi uma tapioca'), deps);
  assert.equal(inserted[0].food_name, 'Tapioca com frango');
  assert.equal(inserted[0].calories, 260);
  assert.equal(inserted[0].protein, 15);
  assert.equal(inserted[0].meal_type, 'afternoon_snack');
  const result = requests[1].contents.at(-1)!.parts?.[0].functionResponse?.response?.result as string;
  assert.match(result, /parâmetros desconhecidos ignorados: porcao/);
});

test('normalizeLogFoodArgs: o nome declarado vence o apelido', () => {
  const { args, unknown } = normalizeLogFoodArgs({ kcal: 100, calories: 120, foo: 1 });
  assert.equal(args.calories, 120);
  assert.deepEqual(unknown, ['foo']);
});

test('sem calorias não grava e pede detalhes ao modelo', async () => {
  const { deps, requests, inserted } = setup([
    logFoodCall({ food_name: 'Salada', meal_type: 'lunch' }),
    textResponse('Quanto de salada?'),
  ]);
  const r = await runChatTurn(input('comi salada'), deps);
  assert.equal(inserted.length, 0);
  assert.equal(r.foodLogged, false);
  assert.match(requests[1].contents.at(-1)!.parts?.[0].functionResponse?.response?.result as string, /calorias ausentes/);
});

test('falha ao gravar: avisa o modelo e não diz que registrou', async () => {
  const { deps, requests } = setup([
    logFoodCall({ food_name: 'Arroz', calories: 128, meal_type: 'lunch' }),
    textResponse(''),
  ], { insertFails: true });
  const r = await quiet(() => runChatTurn(input('comi arroz'), deps));
  assert.equal(r.foodLogged, false);
  assert.equal(requests[1].contents.at(-1)!.parts?.[0].functionResponse?.response?.result, 'Erro ao registrar');
  assert.match(r.message, /Não consegui registrar/);
});

test('primeira rodada vazia: resposta padrão em vez de balão em branco', async () => {
  const { deps } = setup([textResponse('')]);
  const r = await runChatTurn(input('oi'), deps);
  assert.equal(r.message, EMPTY_REPLY);
  assert.equal(r.meta.fallback, 'empty');
});

test('raciocínio não aparece na resposta', async () => {
  const { deps } = setup([geminiResponse([{ text: 'pensando…', thought: true }, { text: 'Resposta final' }])]);
  const r = await runChatTurn(input('oi'), deps);
  assert.equal(r.message, 'Resposta final');
});

test('Gemini fora: responde pelo Groq e registra no meta', async () => {
  const { deps } = setup([new Error('503 UNAVAILABLE')], { groq: '  Olá pelo Groq  ' });
  const r = await quiet(() => runChatTurn(input('oi'), deps));
  assert.equal(r.message, 'Olá pelo Groq');
  assert.equal(r.meta.provider, 'groq');
  assert.match(r.meta.geminiError ?? '', /503/);
});

test('Gemini e Groq fora: propaga o erro do Gemini', async () => {
  const { deps } = setup([new Error('503 UNAVAILABLE')], { groq: new Error('groq down') });
  await quiet(() => assert.rejects(runChatTurn(input('oi'), deps), /503/));
});

test('sanitizeMessages descarta a saudação inicial e mensagens malformadas', () => {
  const out = sanitizeMessages([
    { role: 'assistant', content: 'Olá! Sou seu coach.' },
    { role: 'user', content: 'Comi pão' },
    { role: 'system', content: 'x' },
    { role: 'user', content: '   ' },
    { role: 'assistant', content: 'Registrado' },
    'lixo',
  ]);
  assert.deepEqual(out, [{ role: 'user', content: 'Comi pão' }, { role: 'assistant', content: 'Registrado' }]);
});

/* ─── consultar_historico ─────────────────────────────────────────────── */

const historyCall = (args: Record<string, unknown>) =>
  geminiResponse([{ functionCall: { name: 'consultar_historico', args }, thoughtSignature: 'sig-h' }]);

function withHistory(responses: Array<GenerateContentResponse | Error>, answer: string | Error = 'Período 14/11 (sex): 1800 kcal') {
  const s = setup(responses);
  const queries: Record<string, unknown>[] = [];
  s.deps.queryHistory = async (_userId, args) => {
    queries.push(args);
    if (answer instanceof Error) throw answer;
    return answer;
  };
  return { ...s, queries };
}

test('consulta o histórico e responde; ferramentas seguem liberadas depois da consulta', async () => {
  const { deps, requests, queries } = withHistory([
    historyCall({ data_inicio: '2026-11-08', data_fim: '2026-11-08' }),
    textResponse('Ontem você comeu 1.800 kcal.'),
  ]);
  const r = await runChatTurn(input('O que comi ontem?'), deps);
  assert.equal(r.message, 'Ontem você comeu 1.800 kcal.');
  assert.equal(r.foodLogged, false);
  assert.deepEqual(queries, [{ data_inicio: '2026-11-08', data_fim: '2026-11-08' }]);
  assert.equal(r.meta.rounds, 2);
  assert.deepEqual(toolNames(requests[0]), ['log_food', 'consultar_historico']);
  assert.equal(requests[1].config.toolConfig?.functionCallingConfig?.mode, FunctionCallingConfigMode.AUTO);
  assert.equal(requests[1].contents.at(-1)!.parts?.[0].functionResponse?.response?.result, 'Período 14/11 (sex): 1800 kcal');
  assert.equal(requests[1].contents.at(-2)!.parts?.[0].thoughtSignature, 'sig-h');
});

test('sem queryHistory a ferramenta não é declarada', async () => {
  const { deps, requests } = setup([textResponse('oi')]);
  await runChatTurn(input('oi'), deps);
  assert.deepEqual(toolNames(requests[0]), ['log_food']);
});

test('consultas em sequência param no limite de rodadas (última rodada sem ferramentas)', async () => {
  const { deps, requests, queries } = withHistory([
    historyCall({ data_inicio: '2026-11-01', data_fim: '2026-11-07' }),
    historyCall({ data_inicio: '2026-10-01', data_fim: '2026-10-31' }),
    historyCall({ data_inicio: '2026-09-01', data_fim: '2026-09-30' }),
    textResponse('Resumo dos meses.'),
  ]);
  const r = await runChatTurn(input('Compare meus meses'), deps);
  assert.equal(r.message, 'Resumo dos meses.');
  assert.equal(queries.length, 3);
  assert.equal(r.meta.rounds, 4);
  assert.equal(requests[3].config.toolConfig?.functionCallingConfig?.mode, FunctionCallingConfigMode.NONE);
});

test('consulta e depois registra: rodada final proibida, um registro só', async () => {
  const { deps, requests, inserted } = withHistory([
    historyCall({ data_inicio: '2026-11-08', data_fim: '2026-11-08', incluir_refeicoes: true }),
    logFoodCall({ food_name: 'Omelete', calories: 200, meal_type: 'dinner' }),
    textResponse('Registrei o mesmo jantar de ontem!'),
  ]);
  const r = await runChatTurn(input('Jantei o mesmo de ontem'), deps);
  assert.equal(inserted.length, 1);
  assert.equal(r.foodLogged, true);
  assert.equal(r.message, 'Registrei o mesmo jantar de ontem!');
  assert.equal(requests[2].config.toolConfig?.functionCallingConfig?.mode, FunctionCallingConfigMode.NONE);
});

test('dois log_food na mesma resposta: só o primeiro grava, o segundo recebe aviso', async () => {
  const { deps, requests, inserted } = setup([
    geminiResponse([
      { functionCall: { name: 'log_food', args: { food_name: 'Arroz', calories: 130, meal_type: 'lunch' } } },
      { functionCall: { name: 'log_food', args: { food_name: 'Feijão', calories: 80, meal_type: 'lunch' } } },
    ]),
    textResponse('Registrei o arroz.'),
  ]);
  const r = await runChatTurn(input('Almocei arroz e feijão'), deps);
  assert.equal(inserted.length, 1);
  assert.equal(r.foodLogged, true);
  const parts = requests[1].contents.at(-1)!.parts!;
  assert.equal(parts.length, 2, 'uma resposta para cada chamada');
  assert.match(parts[1].functionResponse?.response?.result as string, /Ignorado/);
});

test('falha na consulta vira aviso ao modelo, não erro', async () => {
  const { deps, requests } = withHistory([
    historyCall({ data_inicio: '2026-11-01', data_fim: '2026-11-07' }),
    textResponse('Não consegui ver a semana.'),
  ], new Error('db down'));
  const r = await quiet(() => runChatTurn(input('Como foi minha semana?'), deps));
  assert.equal(r.message, 'Não consegui ver a semana.');
  assert.match(requests[1].contents.at(-1)!.parts?.[0].functionResponse?.response?.result as string, /Erro ao consultar/);
});

test('rodada depois da consulta falha: o erro sobe (nada foi gravado, reenviar é seguro)', async () => {
  const { deps } = withHistory([
    historyCall({ data_inicio: '2026-11-01', data_fim: '2026-11-07' }),
    new Error('503 overloaded'),
  ]);
  await assert.rejects(runChatTurn(input('Como foi minha semana?'), deps), /503/);
});

/* ─── nível de raciocínio ─────────────────────────────────────────────── */

test('padrão: raciocínio low com o limite normal de 30 s', async () => {
  const { deps, requests } = setup([textResponse('ok')]);
  const r = await runChatTurn(input('Oi'), deps);
  assert.equal(requests[0].config.thinkingConfig?.thinkingLevel, 'LOW');
  assert.equal(requests[0].timeoutMs, 30_000);
  assert.deepEqual(r.meta.thinking, ['low']);
});

test('medium: rodadas dentro da folga usam medium e limite maior; depois volta para low', async () => {
  let clock = 0;
  const s = withHistory([
    historyCall({ data_inicio: '2026-10-01', data_fim: '2026-11-08' }),
    historyCall({ data_inicio: '2026-09-01', data_fim: '2026-09-30' }),
    textResponse('Análise'),
  ]);
  s.deps.now = () => clock;
  const generate = s.deps.generate;
  // Cada rodada "leva" 20 s: a 1ª e a 2ª começam com folga (0 s e 20 s), a 3ª não (40 s).
  s.deps.generate = async (req) => { const res = await generate(req); clock += 20_000; return res; };

  const r = await runChatTurn({ ...input('Por que não estou emagrecendo?'), thinking: 'medium' }, s.deps);

  assert.equal(r.message, 'Análise');
  assert.deepEqual(s.requests.map((q) => q.config.thinkingConfig?.thinkingLevel), ['MEDIUM', 'MEDIUM', 'LOW']);
  assert.deepEqual(s.requests.map((q) => q.timeoutMs), [DEEP_TIMEOUT_MS, DEEP_TIMEOUT_MS, 30_000]);
  assert.deepEqual(r.meta.thinking, ['medium', 'medium', 'low']);
});
