import { NextResponse } from 'next/server';

const TRANSIENT   = ['503', 'UNAVAILABLE', 'high demand', 'try again'];
const RATE_LIMIT  = ['429', 'RESOURCE_EXHAUSTED', 'quota'];
const AUTH_FAIL   = ['401', 'UNAUTHENTICATED', 'ACCESS_TOKEN_TYPE_UNSUPPORTED', 'invalid authentication'];

function isTransient(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return TRANSIENT.some((t) => msg.includes(t));
}

function isRateLimit(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return RATE_LIMIT.some((t) => msg.includes(t));
}

function isAuthError(msg: string): boolean {
  return AUTH_FAIL.some((t) => msg.includes(t));
}

function isRetryable(err: unknown): boolean {
  return isTransient(err) || isRateLimit(err);
}

export async function withGeminiRetry<T>(fn: () => Promise<T>, maxAttempts = 4): Promise<T> {
  let delay = 1000;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === maxAttempts || !isRetryable(err)) throw err;
      // Rate limits (429) need much longer waits — Gemini's RPM window is 60s.
      // Cap at 30s per attempt; three retries cover ~54s total.
      const waitMs = isRateLimit(err) ? Math.min(delay * 8, 30_000) : delay;
      await new Promise((r) => setTimeout(r, waitMs));
      delay *= 2;
    }
  }
  throw new Error('Retry exhausted');
}

/** Returns a NextResponse for known Gemini API errors, or null for unknown errors. */
export function geminiErrorResponse(err: unknown): NextResponse | null {
  const msg = err instanceof Error ? err.message : String(err);

  if (isAuthError(msg)) {
    return NextResponse.json(
      { error: 'Chave da API do Gemini inválida ou não configurada. Verifique a variável GEMINI_API_KEY.' },
      { status: 401 }
    );
  }
  if (msg.includes('503') || msg.includes('UNAVAILABLE') || msg.includes('high demand')) {
    return NextResponse.json(
      { error: 'O modelo de IA está com alta demanda no momento. Tente novamente em alguns instantes.' },
      { status: 503 }
    );
  }
  if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('quota')) {
    return NextResponse.json(
      { error: 'Limite de requisições da API atingido. Aguarde 1-2 minutos e tente novamente. Se o problema persistir, o limite diário pode ter sido atingido.' },
      { status: 429 }
    );
  }
  return null;
}
