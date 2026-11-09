/** Apoio aos testes do chat: respostas simuladas do Gemini. */
import { GenerateContentResponse, type Part } from '@google/genai';

export function geminiResponse(parts: Part[], usage = { promptTokenCount: 100, candidatesTokenCount: 20, thoughtsTokenCount: 30 }): GenerateContentResponse {
  return Object.assign(new GenerateContentResponse(), {
    candidates: [{ content: { role: 'model', parts }, finishReason: 'STOP' }],
    usageMetadata: usage,
  });
}

export const textResponse = (text: string) => geminiResponse([{ text }]);
