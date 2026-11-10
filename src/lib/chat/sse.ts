/**
 * Leitor de Server-Sent Events sobre um ReadableStream de bytes.
 *
 * A fronteira dos chunks de rede não coincide com a dos eventos: um evento
 * pode chegar partido no meio de um caractere multibyte ou de uma linha
 * `data:`. Isolado aqui para ser testado sem subir a tela.
 */

export interface SSEEvent {
  type: string;
  data: Record<string, unknown>;
}

export function formatSSE(type: string, payload: unknown): string {
  return `event: ${type}\ndata: ${JSON.stringify(payload)}\n\n`;
}

export async function* readSSE(body: ReadableStream<Uint8Array>): AsyncGenerator<SSEEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const drain = function* (): Generator<SSEEvent> {
    // Blocos SSE terminam em linha em branco. Aceita \n\n e \r\n\r\n.
    let cut = nextCut(buffer);
    while (cut) {
      const block = buffer.slice(0, cut.start);
      buffer = buffer.slice(cut.end);
      const event = parseBlock(block);
      if (event) yield event;
      cut = nextCut(buffer);
    }
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      yield* drain();
    }
    buffer += decoder.decode();
    yield* drain();
    const rest = parseBlock(buffer);
    if (rest) yield rest;
  } finally {
    try { await reader.cancel(); } catch { /* stream já encerrado */ }
  }
}

function nextCut(buffer: string): { start: number; end: number } | null {
  const lf = buffer.indexOf('\n\n');
  const crlf = buffer.indexOf('\r\n\r\n');
  if (lf === -1 && crlf === -1) return null;
  if (crlf !== -1 && (lf === -1 || crlf < lf)) return { start: crlf, end: crlf + 4 };
  return { start: lf, end: lf + 2 };
}

function parseBlock(block: string): SSEEvent | null {
  if (!block.trim()) return null;
  let type = 'message';
  const data: string[] = [];
  for (const line of block.split(/\r?\n/)) {
    if (line.startsWith(':')) continue; // comentário/keep-alive
    if (line.startsWith('event:')) type = line.slice(6).trim();
    else if (line.startsWith('data:')) data.push(line.slice(5).trim());
  }
  if (data.length === 0) return null;
  try {
    const parsed = JSON.parse(data.join('\n'));
    return { type, data: parsed && typeof parsed === 'object' ? parsed : { value: parsed } };
  } catch {
    return null;
  }
}
