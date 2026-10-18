const RETRYABLE = [
  '503', 'UNAVAILABLE', '429', 'RESOURCE_EXHAUSTED', 'quota', 'high demand', 'try again',
  // Transient server/network failures
  'INTERNAL', 'DEADLINE_EXCEEDED', 'fetch failed', 'ECONNRESET', 'ETIMEDOUT',
];
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

function isRetryable(err: unknown): boolean {
  // The SDK's ApiError exposes the HTTP status directly.
  const status = (err as { status?: unknown })?.status;
  if (typeof status === 'number' && RETRYABLE_STATUS.has(status)) return true;
  const msg = err instanceof Error ? err.message : String(err);
  return RETRYABLE.some((token) => msg.includes(token));
}

export async function withGeminiRetry<T>(fn: () => Promise<T>, maxAttempts = 4): Promise<T> {
  let delay = 1000;
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
