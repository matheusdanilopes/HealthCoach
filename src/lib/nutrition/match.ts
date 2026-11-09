/**
 * Escolha do alimento correspondente (TACO ou rótulo) para um nome dado pela
 * IA ou digitado. O banco traz candidatos pelo índice trigram; aqui fica a
 * decisão, com duas travas contra correspondências erradas:
 *
 *  - estado de preparo: "macarrão cozido" nunca casa com "Macarrão, trigo, cru"
 *    (371 kcal × ~100 kcal: o erro seria enorme);
 *  - alimento principal: a primeira palavra do candidato ("frango", "arroz")
 *    precisa aparecer no nome buscado.
 */
import { normalizeFoodName } from './normalize';
import { similarity } from './trigram';

export interface MatchCandidate {
  nome: string;
  nome_normalizado?: string | null;
}

/** Mínimos de similaridade (0–1) para aceitar a correspondência. */
export const TACO_MIN_SCORE = 0.5;
export const CUSTOM_MIN_SCORE = 0.6;

const STATES: Record<string, string[]> = {
  cru: ['cru', 'crua', 'crus', 'cruas'],
  cozido: ['cozido', 'cozida', 'cozidos', 'cozidas'],
  frito: ['frito', 'frita', 'fritos', 'fritas'],
  assado: ['assado', 'assada', 'assados', 'assadas'],
  grelhado: ['grelhado', 'grelhada', 'grelhados', 'grelhadas'],
  refogado: ['refogado', 'refogada', 'refogados', 'refogadas'],
  torrado: ['torrado', 'torrada', 'torrados', 'torradas'],
};
const STATE_OF = new Map(Object.entries(STATES).flatMap(([state, words]) => words.map((w) => [w, state] as const)));

function statesIn(words: string[]): Set<string> {
  const found = new Set<string>();
  for (const w of words) {
    const s = STATE_OF.get(w);
    if (s) found.add(s);
  }
  return found;
}

/** Os dois nomes indicam preparos diferentes (cozido × cru…). */
export function preparationConflict(queryWords: string[], candidateWords: string[]): boolean {
  const q = statesIn(queryWords);
  const c = statesIn(candidateWords);
  if (q.size === 0 || c.size === 0) return false;
  for (const s of q) if (c.has(s)) return false;
  return true;
}

/** A primeira palavra do candidato (o alimento) aparece na busca. */
export function headWordPresent(queryWords: string[], candidateWords: string[]): boolean {
  const head = candidateWords[0];
  if (!head) return false;
  // Plural e pequenas variações ("ovos" × "ovo", "linguica" × "lingüiça").
  return queryWords.some((w) => w === head || (w.length >= 3 && head.length >= 3 && similarity(w, head) >= 0.45));
}

export interface MatchResult<T> {
  candidate: T;
  score: number;
}

export function pickBestMatch<T extends MatchCandidate>(
  query: string,
  candidates: readonly T[],
  minScore: number,
): MatchResult<T> | null {
  const q = normalizeFoodName(query);
  if (!q) return null;
  const qWords = q.split(' ');
  let best: MatchResult<T> | null = null;
  for (const candidate of candidates) {
    const c = candidate.nome_normalizado || normalizeFoodName(candidate.nome);
    const cWords = c.split(' ');
    if (preparationConflict(qWords, cWords)) continue;
    if (!headWordPresent(qWords, cWords)) continue;
    const score = c === q ? 1 : similarity(q, c);
    if (score >= minScore && (!best || score > best.score)) best = { candidate, score };
  }
  return best;
}
