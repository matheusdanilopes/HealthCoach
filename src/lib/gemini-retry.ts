const RETRYABLE = ['503', 'UNAVAILABLE', '429', 'RESOURCE_EXHAUSTED', 'quota', 'high demand', 'try again'];

function isRetryable(err: unknown): boolean {
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
