const TRANSIENT   = ['503', 'UNAVAILABLE', 'high demand', 'try again'];
const RATE_LIMIT  = ['429', 'RESOURCE_EXHAUSTED', 'quota'];

function isTransient(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return TRANSIENT.some((t) => msg.includes(t));
}

function isRateLimit(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return RATE_LIMIT.some((t) => msg.includes(t));
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
