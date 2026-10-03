const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
// Groq retires models often (llama-4-scout on 2026-06-17, then qwen3.6-27b),
// and a single hardcoded ID silently broke the whole fallback. Candidates are
// tried in order until one exists; the first that answers is reused.
// GROQ_MODEL, when set, is tried first.
const VISION_MODELS = ['qwen/qwen3.8-27b', 'meta-llama/llama-4-maverick-17b-128e-instruct', 'meta-llama/llama-4-scout-17b-16e-instruct'];
const TEXT_MODELS   = ['qwen/qwen3.8-27b', 'llama-3.3-70b-versatile', 'openai/gpt-oss-120b'];
let workingVisionModel: string | null = null;
let workingTextModel: string | null   = null;

function candidateModels(hasImage: boolean): string[] {
  const cached = hasImage ? workingVisionModel : workingTextModel;
  const list   = [process.env.GROQ_MODEL, cached, ...(hasImage ? VISION_MODELS : TEXT_MODELS)];
  return [...new Set(list.filter((m): m is string => !!m))];
}

// Reasoning models spend max_tokens on a hidden "thinking" pass first, which
// can leave the JSON truncated. Each family takes a different knob.
function reasoningParams(model: string): Record<string, string> {
  if (/qwen3/i.test(model))   return { reasoning_effort: 'none' };
  if (/gpt-oss/i.test(model)) return { reasoning_effort: 'low' };
  return {};
}

function isModelUnavailable(status: number, body: string): boolean {
  return status === 404 || /model_not_found|model_decommissioned|does not exist|decommissioned/i.test(body);
}

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
export interface GroqOptions {
  maxOutputTokens?: number;
  temperature?: number;
  maxAttempts?: number;
  /** Per-attempt ceiling so a hung request doesn't hold the function open. */
  timeoutMs?: number;
}

export async function callGroq(
  system: string,
  parts: GroqPart[],
  opts: GroqOptions = {}
): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY not configured');

  const hasImage = parts.some((p) => 'inlineData' in p);
  let lastErr: unknown = null;
  for (const model of candidateModels(hasImage)) {
    try {
      const content = await callGroqModel(model, apiKey, system, parts, opts);
      if (hasImage) workingVisionModel = model;
      else          workingTextModel   = model;
      return content;
    } catch (err) {
      lastErr = err;
      if (!(err instanceof GroqModelUnavailableError)) throw err;
      console.warn(`[groq] Model ${model} unavailable, trying next candidate`);
    }
  }
  throw lastErr ?? new Error('No Groq model available');
}

class GroqModelUnavailableError extends Error {}

async function callGroqModel(
  model: string,
  apiKey: string,
  system: string,
  parts: GroqPart[],
  { maxOutputTokens = 2048, temperature = 0.2, maxAttempts = 2, timeoutMs = 30_000 }: GroqOptions
): Promise<string> {
  let delay = 500;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let res: Response;
    try {
      res = await fetch(GROQ_API_URL, {
        method: 'POST',
        signal: AbortSignal.timeout(timeoutMs),
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: toGroqContent(parts) },
          ],
          temperature,
          max_completion_tokens: maxOutputTokens,
          ...reasoningParams(model),
        }),
      });
    } catch (err) {
      // Network failure or timeout — retry like a 5xx.
      if (attempt === maxAttempts) throw err;
      await new Promise((r) => setTimeout(r, delay));
      delay *= 2;
      continue;
    }

    if (res.ok) {
      const json = await res.json();
      const content = json?.choices?.[0]?.message?.content;
      if (typeof content !== 'string' || !content) throw new Error('Empty response from Groq');
      return content;
    }

    const errBody = await res.text().catch(() => '');
    const message = `Groq API error ${res.status} (${model}): ${errBody.slice(0, 300)}`;
    if (isModelUnavailable(res.status, errBody)) throw new GroqModelUnavailableError(message);
    const err = new Error(message);
    if (attempt === maxAttempts || !RETRYABLE_STATUS.has(res.status)) throw err;
    await new Promise((r) => setTimeout(r, delay));
    delay *= 2;
  }

  throw new Error('Groq retry exhausted');
}
