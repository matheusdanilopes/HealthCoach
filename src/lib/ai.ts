import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { withGeminiRetry } from '@/lib/gemini-retry';
import { callGroq, type GroqPart } from '@/lib/groq';

export const GEMINI_MODEL = 'gemini-3.5-flash';

// Per-attempt ceiling so a hung Gemini request fails over to Groq instead of
// holding the serverless function until the platform kills it.
export const DEFAULT_AI_TIMEOUT_MS = 30_000;

let gemini: GoogleGenAI | null = null;
export function getGemini(): GoogleGenAI {
  return (gemini ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! }));
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// Parses the JSON object in a model response, tolerating markdown fences,
// text around the object and trailing commas.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function extractJSON(raw: string): any {
  const stripped = raw.replace(/```(?:json)?\s*/gi, '').replace(/```/g, '').trim();
  const parse = (text: string) => {
    try {
      return JSON.parse(text);
    } catch (err) {
      // Trailing commas before } or ] are a common model slip.
      const fixed = text.replace(/,\s*([}\]])/g, '$1');
      if (fixed === text) throw err;
      return JSON.parse(fixed);
    }
  };
  try {
    return parse(stripped);
  } catch {
    // Use balanced-brace extraction so trailing text with braces doesn't break the parse
    const start = stripped.indexOf('{');
    if (start === -1) throw new Error('No JSON found in response');
    let depth = 0;
    let inString = false;
    let escape = false;
    for (let i = start; i < stripped.length; i++) {
      const ch = stripped[i];
      if (escape) { escape = false; continue; }
      if (ch === '\\' && inString) { escape = true; continue; }
      if (ch === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (ch === '{') depth++;
      else if (ch === '}' && --depth === 0) return parse(stripped.slice(start, i + 1));
    }
    throw new Error('No valid JSON object found in response');
  }
}

export interface GenerateOptions {
  /** Short tag for logs, e.g. "food-analyze". */
  label: string;
  system: string;
  parts: GroqPart[];
  maxOutputTokens: number;
  temperature: number;
  /** Ask Gemini for a JSON response (JSON mode). */
  json?: boolean;
  /** Per-attempt timeout; raise it for long outputs. */
  timeoutMs?: number;
}

async function callGemini(opts: GenerateOptions): Promise<string> {
  const response = await withGeminiRetry(() =>
    getGemini().models.generateContent({
      model: GEMINI_MODEL,
      contents: [{ role: 'user', parts: opts.parts }],
      config: {
        systemInstruction: opts.system,
        maxOutputTokens: opts.maxOutputTokens,
        temperature: opts.temperature,
        httpOptions: { timeout: opts.timeoutMs ?? DEFAULT_AI_TIMEOUT_MS },
        ...(opts.json ? { responseMimeType: 'application/json' } : {}),
      },
    })
  );
  const text = response.text ?? '';
  const finishReason = response.candidates?.[0]?.finishReason;
  if (text && finishReason === 'MAX_TOKENS') {
    console.warn(`[${opts.label}] Gemini hit maxOutputTokens (${opts.maxOutputTokens}); response may be truncated`);
  }
  if (!text) {
    const reason = response.candidates?.[0]?.finishReason ?? 'unknown';
    throw new Error(`Empty response from Gemini (finishReason=${reason})`);
  }
  return text;
}

// Raised when every provider answered but none produced usable JSON. Carries
// the raw responses so routes can still try a field-level recovery.
export class AIParseError extends Error {
  constructor(public readonly raws: string[]) {
    super('Failed to parse AI response');
    this.name = 'AIParseError';
  }
}

// Gemini (JSON mode) first, Groq as fallback. A response that doesn't parse
// or fails `validate` also triggers the fallback, not only provider errors.
// Throws the provider error when neither answered, AIParseError otherwise.
export async function generateJSON<T = Record<string, unknown>>(
  opts: GenerateOptions & { validate?: (data: T) => boolean }
): Promise<T> {
  const raws: string[] = [];
  const tryParse = (raw: string, provider: string): T | null => {
    raws.push(raw);
    try {
      const data = extractJSON(raw) as T;
      if (opts.validate && !opts.validate(data)) throw new Error('Response failed validation');
      return data;
    } catch (err) {
      console.error(`[${opts.label}] ${provider} JSON invalid:`, errorMessage(err), 'raw:', raw.slice(0, 300));
      return null;
    }
  };

  const groqOpts = {
    maxOutputTokens: opts.maxOutputTokens,
    temperature: opts.temperature,
    timeoutMs: opts.timeoutMs,
  };
  let geminiErr: unknown = null;
  try {
    const data = tryParse(await callGemini({ ...opts, json: true }), 'Gemini');
    if (data) return data;
  } catch (err) {
    geminiErr = err;
    console.error(`[${opts.label}] Gemini failed, falling back to Groq:`, errorMessage(err));
  }

  try {
    const data = tryParse(await callGroq(opts.system, opts.parts, groqOpts), 'Groq');
    if (data) return data;
  } catch (groqErr) {
    console.error(`[${opts.label}] Groq fallback also failed:`, errorMessage(groqErr));
    if (raws.length === 0) throw geminiErr ?? groqErr;
  }

  throw new AIParseError(raws);
}

function isOverloadError(err: unknown): boolean {
  const msg = errorMessage(err);
  return msg.includes('503') || msg.includes('UNAVAILABLE') || msg.includes('high demand');
}

function isRateLimitError(err: unknown): boolean {
  const msg = errorMessage(err);
  return msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('quota');
}

// Maps a provider error to a user-facing response. Raw provider messages are
// only logged — they can be long, in English or mention configuration.
export function aiErrorResponse(err: unknown, label: string, fallbackMessage: string): NextResponse {
  console.error(`[${label}] Error:`, errorMessage(err));
  if (isOverloadError(err)) {
    return NextResponse.json(
      { error: 'O modelo de IA está com alta demanda no momento. Tente novamente em alguns instantes.' },
      { status: 503 }
    );
  }
  if (isRateLimitError(err)) {
    return NextResponse.json(
      { error: 'Limite de requisições atingido. Aguarde alguns segundos e tente novamente.' },
      { status: 429 }
    );
  }
  return NextResponse.json({ error: fallbackMessage }, { status: 500 });
}
