import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isRetryable, withGeminiRetry } from '@/lib/gemini-retry';

// Mensagem real gravada em chat_messages.meta quando o saldo acabou.
const DEPLETED = '{"error":{"code":402,"message":"Your prepayment credits are depleted. Please go to AI Studio at https://ai.studio/projects to manage your project and billing.","status":"RESOURCE_EXHAUSTED"}}';

test('falta de saldo (402) não é repetida', () => {
  assert.equal(isRetryable(new Error(DEPLETED)), false);
  assert.equal(isRetryable(Object.assign(new Error('x'), { status: 402 })), false);
});

test('sobrecarga e limite por minuto continuam sendo repetidos', () => {
  assert.equal(isRetryable(new Error('{"error":{"code":503,"status":"UNAVAILABLE"}}')), true);
  assert.equal(isRetryable(new Error('{"error":{"code":429,"status":"RESOURCE_EXHAUSTED"}}')), true);
  assert.equal(isRetryable(Object.assign(new Error('x'), { status: 503 })), true);
  // O 429 por minuto também cita "billing" e precisa continuar sendo repetido.
  assert.equal(isRetryable(new Error('{"error":{"code":429,"message":"You exceeded your current quota, please check your plan and billing details.","status":"RESOURCE_EXHAUSTED"}}')), true);
});

test('withGeminiRetry desiste na primeira falha por saldo', async () => {
  let calls = 0;
  await assert.rejects(
    withGeminiRetry(async () => { calls++; throw new Error(DEPLETED); }, 4, 1),
    /credits are depleted/
  );
  assert.equal(calls, 1);
});

test('withGeminiRetry repete erro passageiro até dar certo', async () => {
  let calls = 0;
  const result = await withGeminiRetry(async () => {
    if (++calls < 3) throw new Error('503 UNAVAILABLE');
    return 'ok';
  }, 4, 1);
  assert.equal(result, 'ok');
  assert.equal(calls, 3);
});
