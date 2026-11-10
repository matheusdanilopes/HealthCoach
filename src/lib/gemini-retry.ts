const RETRYABLE = [
  '503', 'UNAVAILABLE', '429', 'RESOURCE_EXHAUSTED', 'quota', 'high demand', 'try again',
  // Transient server/network failures
  'INTERNAL', 'DEADLINE_EXCEEDED', 'fetch failed', 'ECONNRESET', 'ETIMEDOUT',
];
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

// Falta de saldo (402) também vem como RESOURCE_EXHAUSTED, mas não passa
// sozinha: repetir só somava ~7 s de espera antes de cair no Groq.
const BILLING = ['credits are depleted', 'prepayment credits'];

export function isRetryable(err: unknown): boolean {
  // The SDK's ApiError exposes the HTTP status directly.
  const status = (err as { status?: unknown })?.status;
  if (status === 402) return false;
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes('"code":402') || BILLING.some((token) => msg.includes(token))) return false;
  if (typeof status === 'number' && RETRYABLE_STATUS.has(status)) return true;
  return RETRYABLE.some((token) => msg.includes(token));
}

export async function withGeminiRetry<T>(fn: () => Promise<T>, maxAttempts = 4, baseDelayMs = 1000): Promise<T> {
  let delay = baseDelayMs;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === maxAttempts || !isRetryable(err)) throw err;
      await new Promise((r) => setTimeout(r, delay));
      delay *= 2;
    }
  }
  // unreachable, satisfies TS
  throw new Error('Retry exhausted');
}
