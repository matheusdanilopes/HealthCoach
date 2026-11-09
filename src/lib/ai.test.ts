import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ThinkingLevel } from '@google/genai';
import {
  GEMINI3_THINKING_HEADROOM,
  GEMINI_MODEL,
  addUsage,
  aiErrorInfo,
  extractJSON,
  geminiGenerationConfig,
  isGemini3,
  readUsage,
} from '@/lib/ai';

test('modelo padrão é o Gemini 3.8 Flash', () => {
  if (process.env.GEMINI_MODEL) return; // troca proposital pelo ambiente
  assert.equal(GEMINI_MODEL, 'gemini-3.8-flash');
});

test('família 3: thinkingLevel low por padrão, sem temperature e com folga de tokens', () => {
  const config = geminiGenerationConfig({ model: 'gemini-3.8-flash', maxOutputTokens: 1024, temperature: 0.2 });
  assert.equal(config.temperature, undefined);
  assert.equal(config.maxOutputTokens, 1024 + GEMINI3_THINKING_HEADROOM);
  assert.equal(config.thinkingConfig?.thinkingBudget, undefined, 'mandar orçamento e nível juntos é erro');
  assert.deepEqual(config.thinkingConfig, { thinkingLevel: ThinkingLevel.LOW });
});

test('família 3: nível de raciocínio pedido pelo chamador', () => {
  const config = geminiGenerationConfig({ model: 'gemini-3.5-flash', maxOutputTokens: 100, temperature: 0.5, thinking: 'medium' });
  assert.deepEqual(config.thinkingConfig, { thinkingLevel: ThinkingLevel.MEDIUM });
});

test('modelos anteriores mantêm a temperatura e o teto do chamador', () => {
  const config = geminiGenerationConfig({ model: 'gemini-2.5-flash', maxOutputTokens: 800, temperature: 0.2 });
  assert.deepEqual(config, { maxOutputTokens: 800, temperature: 0.2 });
  assert.equal(isGemini3('gemini-2.5-flash'), false);
});

test('uso de tokens é lido e somado entre rodadas', () => {
  const a = readUsage({ usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, thoughtsTokenCount: 3 } });
  const b = readUsage({ usageMetadata: { promptTokenCount: 20, candidatesTokenCount: 7 } });
  assert.deepEqual(addUsage(a, b), { input: 30, output: 12, thinking: 3 });
  assert.equal(readUsage({}), undefined);
  assert.equal(addUsage(undefined, undefined), undefined);
});

test('erros do provedor viram mensagens para o usuário', () => {
  const quiet = console.error;
  console.error = () => {};
  try {
    assert.equal(aiErrorInfo(new Error('503 UNAVAILABLE'), 't', 'x').status, 503);
    assert.equal(aiErrorInfo(new Error('429 RESOURCE_EXHAUSTED'), 't', 'x').status, 429);
    assert.deepEqual(aiErrorInfo(new Error('boom'), 't', 'falhou'), { status: 500, error: 'falhou' });
  } finally {
    console.error = quiet;
  }
});

test('extractJSON tolera cercas de markdown e vírgula sobrando', () => {
  assert.deepEqual(extractJSON('```json\n{"a": 1,}\n```'), { a: 1 });
  assert.deepEqual(extractJSON('Aqui está: {"b": {"c": 2}} fim {x}'), { b: { c: 2 } });
});
