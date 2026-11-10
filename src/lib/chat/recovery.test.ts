import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HistoryUnavailableError, isUuid, newId, replyInHistory, waitForReply } from '@/lib/chat/recovery';

const Q = '11111111-1111-4111-8111-111111111111';
const OLD = '22222222-2222-4222-8222-222222222222';

const history = [
  { id: OLD, role: 'user', content: 'ok' },
  { id: 'a0', role: 'assistant', content: 'resposta antiga' },
  { id: Q, role: 'user', content: 'ok' },
];

test('replyInHistory acha a resposta pela pergunta (id), não pelo texto', () => {
  assert.equal(replyInHistory(history, Q), null, 'pergunta repetida não pega a resposta antiga');
  const withReply = [...history, { id: 'a1', role: 'assistant', content: 'resposta nova' }];
  assert.equal(replyInHistory(withReply, Q)?.id, 'a1');
  assert.equal(replyInHistory(withReply, 'outra'), null);
});

test('replyInHistory ignora resposta vazia', () => {
  assert.equal(replyInHistory([...history, { id: 'a1', role: 'assistant', content: '  ' }], Q), null);
});

const noWait = async () => {};

test('waitForReply busca até a resposta aparecer', async () => {
  let calls = 0;
  const reply = await waitForReply(
    async () => (++calls < 3 ? history : [...history, { id: 'a1', role: 'assistant', content: 'chegou' }]),
    Q, () => true, { sleep: noWait }
  );
  assert.equal(reply?.content, 'chegou');
  assert.equal(calls, 3);
});

test('waitForReply tolera falhas de rede', async () => {
  let calls = 0;
  const reply = await waitForReply(async () => {
    if (++calls < 3) throw new Error('offline');
    return [...history, { id: 'a1', role: 'assistant', content: 'chegou' }];
  }, Q, () => true, { sleep: noWait });
  assert.equal(reply?.id, 'a1');
});

test('waitForReply desiste se a pergunta nem chegou ao servidor', async () => {
  let calls = 0;
  const reply = await waitForReply(async () => { calls++; return history.slice(0, 2); }, Q, () => true, { sleep: noWait, graceFetches: 3 });
  assert.equal(reply, null);
  assert.equal(calls, 3);
});

test('waitForReply desiste com o histórico indisponível', async () => {
  let calls = 0;
  const reply = await waitForReply(async () => { calls++; throw new HistoryUnavailableError(); }, Q, () => true, { sleep: noWait });
  assert.equal(reply, null);
  assert.equal(calls, 1);
});

test('waitForReply respeita o prazo, keepGoing e só busca com o app visível', async () => {
  let t = 0;
  let calls = 0;
  const reply = await waitForReply(async () => { calls++; return history; }, Q, () => true, {
    timeoutMs: 10_000, intervalMs: 3_000, now: () => t, sleep: async (ms) => { t += ms; }, visible: () => false,
  });
  assert.equal(reply, null);
  assert.equal(calls, 0, 'em segundo plano não busca');

  let go = true;
  const stopped = await waitForReply(async () => { go = false; return history; }, Q, () => go, { sleep: noWait });
  assert.equal(stopped, null);
});

test('newId gera uuids válidos', () => {
  for (let i = 0; i < 20; i++) assert.ok(isUuid(newId()));
  assert.equal(isUuid('nao-e-uuid'), false);
});
