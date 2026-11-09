import { NextResponse } from 'next/server';
import { GoogleGenAI, ThinkingLevel, type GenerateContentConfig, type GenerateContentResponse } from '@google/genai';
import { withGeminiRetry } from '@/lib/gemini-retry';
import { callGroq, type GroqPart } from '@/lib/groq';

// GEMINI_MODEL no ambiente troca o modelo sem mudar código — inclusive para
// voltar ao anterior (gemini-3.5-flash) se o novo se comportar mal.
export const GEMINI_MODEL = process.env.GEMINI_MODEL?.trim() || 'gemini-3.8-flash';

export type ThinkingEffort = 'minimal' | 'low' | 'medium' | 'high';

const THINKING_LEVELS: Record<ThinkingEffort, ThinkingLevel> = {
  minimal: ThinkingLevel.MINIMAL,
  low: ThinkingLevel.LOW,
  medium: ThinkingLevel.MEDIUM,
  high: ThinkingLevel.HIGH,
};

// Na família 3 o raciocínio sai do mesmo orçamento de maxOutputTokens e não
// tem teto em tokens: sem folga, respostas vinham vazias ou cortadas.
export const GEMINI3_THINKING_HEADROOM = 4096;

export const isGemini3 = (model: string) => /^gemini-3/.test(model);

/**
 * Configuração de geração por família de modelo.
 * - Gemini 3: thinkingLevel no lugar de orçamento (mandar os dois é erro) e
 *   sem temperature — o Google recomenda o padrão (1.0); temperaturas baixas
 *   podem fazer o modelo entrar em repetição. "low" por padrão: com "medium"
 *   cada resposta passou a levar 30–60 s.
 * - Demais: temperatura do chamador, sem mexer no raciocínio.
 */
export function geminiGenerationConfig(opts: {
  model?: string;
  maxOutputTokens: number;
  temperature: number;
  thinking?: ThinkingEffort;
}): GenerateContentConfig {
  const model = opts.model ?? GEMINI_MODEL;
  if (isGemini3(model)) {
    return {
      maxOutputTokens: opts.maxOutputTokens + GEMINI3_THINKING_HEADROOM,
      thinkingConfig: { thinkingLevel: THINKING_LEVELS[opts.thinking ?? 'low'] },
    };
  }
  return { maxOutputTokens: opts.maxOutputTokens, temperature: opts.temperature };
}

/** Tokens gastos numa chamada (usageMetadata do Gemini). */
export interface TokenUsage {
  input: number;
  output: number;
  thinking: number;
}

export function readUsage(response: Pick<GenerateContentResponse, 'usageMetadata'> | null | undefined): TokenUsage | undefined {
  const u = response?.usageMetadata;
  if (!u) return undefined;
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  return { input: n(u.promptTokenCount), output: n(u.candidatesTokenCount), thinking: n(u.thoughtsTokenCount) };
}

export function addUsage(a: TokenUsage | undefined, b: TokenUsage | undefined): TokenUsage | undefined {
  if (!a && !b) return undefined;
  return {
    input: (a?.input ?? 0) + (b?.input ?? 0),
    output: (a?.output ?? 0) + (b?.output ?? 0),
    thinking: (a?.thinking ?? 0) + (b?.thinking ?? 0),
  };
}

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
  /** Nível de raciocínio na família Gemini 3 (padrão: low). */
  thinking?: ThinkingEffort;
}

async function callGemini(opts: GenerateOptions): Promise<string> {
  const response = await withGeminiRetry(() =>
    getGemini().models.generateContent({
      model: GEMINI_MODEL,
      contents: [{ role: 'user', parts: opts.parts }],
      config: {
        systemInstruction: opts.system,
        ...geminiGenerationConfig(opts),
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

// Maps a provider error to a user-facing message and status. Raw provider
// messages are only logged — they can be long, in English or mention configuration.
export function aiErrorInfo(err: unknown, label: string, fallbackMessage: string): { status: number; error: string } {
  console.error(`[${label}] Error:`, errorMessage(err));
  if (isOverloadError(err)) {
    return { status: 503, error: 'O modelo de IA está com alta demanda no momento. Tente novamente em alguns instantes.' };
  }
  if (isRateLimitError(err)) {
    return { status: 429, error: 'Limite de requisições atingido. Aguarde alguns segundos e tente novamente.' };
  }
  return { status: 500, error: fallbackMessage };
}

export function aiErrorResponse(err: unknown, label: string, fallbackMessage: string): NextResponse {
  const { status, error } = aiErrorInfo(err, label, fallbackMessage);
  return NextResponse.json({ error }, { status });
}
