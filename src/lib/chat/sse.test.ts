import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatSSE, readSSE } from '@/lib/chat/sse';

function streamOf(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(c);
      controller.close();
    },
  });
}

async function collect(stream: ReadableStream<Uint8Array>) {
  const out = [];
  for await (const e of readSSE(stream)) out.push(e);
  return out;
}

test('eventos partidos entre chunks (inclusive no meio de um caractere) chegam inteiros', async () => {
  const bytes = new TextEncoder().encode(formatSSE('ping', {}) + formatSSE('done', { message: 'Ótimo café ☕' }));
  const chunks = [];
  for (let i = 0; i < bytes.length; i += 5) chunks.push(bytes.slice(i, i + 5));
  const events = await collect(streamOf(chunks));
  assert.deepEqual(events, [
    { type: 'ping', data: {} },
    { type: 'done', data: { message: 'Ótimo café ☕' } },
  ]);
});

test('aceita CRLF, ignora comentários e JSON inválido, lê o último bloco sem linha em branco', async () => {
  const text = ': keep-alive\r\n\r\nevent: error\r\ndata: {"status":503}\r\n\r\nevent: x\ndata: {quebrado\n\nevent: done\ndata: {"ok":true}';
  const events = await collect(streamOf([new TextEncoder().encode(text)]));
  assert.deepEqual(events, [
    { type: 'error', data: { status: 503 } },
    { type: 'done', data: { ok: true } },
  ]);
});
