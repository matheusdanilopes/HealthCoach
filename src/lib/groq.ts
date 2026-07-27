const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
// meta-llama/llama-4-scout-17b-16e-instruct was deprecated by Groq on 2026-06-17
// and stopped accepting requests; qwen/qwen3.6-27b is the current vision-capable
// replacement (same image_url/base64 data-URI request shape).
const GROQ_MODEL = process.env.GROQ_MODEL || 'qwen/qwen3.6-27b';
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

export type GroqPart = { text: string } | { inlineData: { mimeType: string; data: string } };

function toGroqContent(parts: GroqPart[]) {
  return parts.map((part) =>
    'text' in part
      ? { type: 'text' as const, text: part.text }
      : {
          type: 'image_url' as const,
          image_url: { url: `data:${part.inlineData.mimeType};base64,${part.inlineData.data}` },
        }
  );
}

// Fallback provider for when Gemini is unavailable. Groq exposes an OpenAI-compatible
// chat completions API, so requests are translated from Gemini's `parts` shape here.
export async function callGroq(
  system: string,
  parts: GroqPart[],
  maxOutputTokens = 2048,
  maxAttempts = 2
): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY not configured');

  // Qwen 3.6 defaults to an extended "thinking" pass before answering, which
  // would eat into max_tokens and can leave the JSON response truncated.
  // reasoning_effort is only recognized by Qwen models on Groq.
  const isQwenReasoningModel = /qwen3/i.test(GROQ_MODEL);

  let delay = 500;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const res = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: toGroqContent(parts) },
        ],
        temperature: 0.2,
        max_completion_tokens: maxOutputTokens,
        ...(isQwenReasoningModel ? { reasoning_effort: 'none' } : {}),
      }),
    });

    if (res.ok) {
      const json = await res.json();
      const content = json?.choices?.[0]?.message?.content;
      if (typeof content !== 'string' || !content) throw new Error('Empty response from Groq');
      return content;
    }

    const errBody = await res.text().catch(() => '');
    const err = new Error(`Groq API error ${res.status}: ${errBody.slice(0, 300)}`);
    if (attempt === maxAttempts || !RETRYABLE_STATUS.has(res.status)) throw err;
    await new Promise((r) => setTimeout(r, delay));
    delay *= 2;
  }

  throw new Error('Groq retry exhausted');
}
