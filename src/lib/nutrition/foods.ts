/**
 * Resolução e validação de alimentos no banco.
 *
 * Ordem ao lançar: rótulo salvo pelo usuário (custom_foods) → TACO
 * (taco_foods) → estimativa da IA. Com o alimento encontrado e as gramas, o
 * app calcula kcal e macros; a IA só identifica alimento + gramas.
 *
 * Toda consulta a custom_foods filtra por user_id.
 */
import { sql } from '@/lib/db';
import { nutrientsFor, round1 } from './calc';
import { CUSTOM_MIN_SCORE, TACO_MIN_SCORE, pickBestMatch } from './match';
import { normalizeFoodName } from './normalize';
import {
  FOOD_SOURCES,
  needsReviewFor,
  validateFoodEntry,
  type FoodReference,
  type FoodSource,
  type ValidationResult,
} from './validation';

export interface TacoFoodRow extends FoodReference {
  id: number;
  nome_normalizado: string;
}

export interface CustomFoodRow extends FoodReference {
  id: string;
  nome_normalizado: string;
  porcao_g: number | null;
}

const TACO_COLS = 'id, nome, nome_normalizado, kcal_100g, protein_100g, carbs_100g, fat_100g';
const CUSTOM_COLS = 'id, nome, nome_normalizado, kcal_100g, protein_100g, carbs_100g, fat_100g, porcao_g';

const asTaco = (r: Record<string, unknown>) => ({ ...r, source: 'taco' }) as TacoFoodRow;
const asCustom = (r: Record<string, unknown>) => ({ ...r, source: 'rotulo' }) as CustomFoodRow;

export async function findTacoMatch(query: string): Promise<TacoFoodRow | null> {
  const q = normalizeFoodName(query);
  if (!q) return null;
  // `%` usa o índice trigram (limite padrão 0,3); a escolha final é do pickBestMatch.
  const rows = (await sql.query(
    `SELECT ${TACO_COLS} FROM taco_foods
     WHERE nome_normalizado = $1 OR nome_normalizado % $1
     ORDER BY similarity(nome_normalizado, $1) DESC LIMIT 15`,
    [q],
  )) as Record<string, unknown>[];
  return pickBestMatch(q, rows.map(asTaco), TACO_MIN_SCORE)?.candidate ?? null;
}

export async function findCustomMatch(userId: string, query: string): Promise<CustomFoodRow | null> {
  const q = normalizeFoodName(query);
  if (!q) return null;
  const rows = (await sql.query(
    `SELECT ${CUSTOM_COLS} FROM custom_foods
     WHERE user_id = $1 AND (nome_normalizado = $2 OR nome_normalizado % $2)
     ORDER BY similarity(nome_normalizado, $2) DESC LIMIT 10`,
    [userId, q],
  )) as Record<string, unknown>[];
  return pickBestMatch(q, rows.map(asCustom), CUSTOM_MIN_SCORE)?.candidate ?? null;
}

export async function getTacoFood(id: number): Promise<TacoFoodRow | null> {
  const rows = (await sql.query(`SELECT ${TACO_COLS} FROM taco_foods WHERE id = $1`, [id])) as Record<string, unknown>[];
  return rows[0] ? asTaco(rows[0]) : null;
}

export async function getCustomFood(userId: string, id: string): Promise<CustomFoodRow | null> {
  const rows = (await sql.query(
    `SELECT ${CUSTOM_COLS} FROM custom_foods WHERE id = $1 AND user_id = $2`,
    [id, userId],
  )) as Record<string, unknown>[];
  return rows[0] ? asCustom(rows[0]) : null;
}

let tacoNamesCache: { at: number; names: string[] } | null = null;

/** Nomes da TACO para a IA escolher (cache de 1 h por instância). */
export async function tacoNames(): Promise<string[]> {
  if (tacoNamesCache && Date.now() - tacoNamesCache.at < 3_600_000) return tacoNamesCache.names;
  const rows = (await sql`SELECT nome FROM taco_foods ORDER BY id`) as { nome: string }[];
  tacoNamesCache = { at: Date.now(), names: rows.map((r) => r.nome) };
  return tacoNamesCache.names;
}

// ── Resolução de um item ─────────────────────────────────────────────────────

export interface FoodQuery {
  /** Nome como o usuário falaria ("Arroz branco cozido"). */
  name: string;
  /** Descrição da TACO escolhida pela IA ("Arroz, tipo 1, cozido"), se houver. */
  taco_name?: string | null;
  /** Peso comestível em gramas (líquidos: ml ≈ g). */
  grams?: number | null;
  /** Estimativa da IA, usada só se o alimento não estiver em lugar nenhum. */
  estimate: { calories: number; protein?: number | null; carbs?: number | null; fat?: number | null };
}

export interface ResolvedFood {
  calories: number;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  quantity_g: number | null;
  source: FoodSource;
  taco_food_id: number | null;
  custom_food_id: string | null;
  reference: FoodReference | null;
  validation: ValidationResult;
  needs_review: boolean;
  /** Estimado: perguntar se o usuário quer informar o rótulo. */
  ask_label: boolean;
}

const cleanGrams = (g: unknown) => {
  const n = Number(g);
  return Number.isFinite(n) && n > 0 ? Math.min(round1(n), 5000) : null;
};

const optional = (v: unknown) => {
  const n = Number(v);
  return v != null && v !== '' && Number.isFinite(n) && n >= 0 ? round1(n) : null;
};

export function referenceOf(row: TacoFoodRow | CustomFoodRow): FoodReference {
  return {
    nome: row.nome, source: row.source,
    kcal_100g: row.kcal_100g, protein_100g: row.protein_100g, carbs_100g: row.carbs_100g, fat_100g: row.fat_100g,
  };
}

export async function resolveFood(userId: string, query: FoodQuery): Promise<ResolvedFood> {
  const grams = cleanGrams(query.grams);
  const names = [query.name, query.taco_name].filter((n): n is string => !!n && !!n.trim());

  let custom: CustomFoodRow | null = null;
  for (const n of names) if (!custom) custom = await findCustomMatch(userId, n);

  let taco: TacoFoodRow | null = null;
  if (!custom) {
    // O nome no padrão TACO (escolhido pela IA da lista oficial) vem primeiro.
    for (const n of [query.taco_name, query.name]) if (!taco && n?.trim()) taco = await findTacoMatch(n);
  }

  const match = custom ?? taco;
  if (match && grams) {
    const values = nutrientsFor(grams, match);
    const reference = referenceOf(match);
    const validation = validateFoodEntry({ ...values, quantity_g: grams, reference });
    const source: FoodSource = custom ? 'rotulo' : 'taco';
    return {
      ...values, quantity_g: grams, source,
      taco_food_id: taco && !custom ? taco.id : null,
      custom_food_id: custom ? custom.id : null,
      reference, validation, needs_review: needsReviewFor(source, validation), ask_label: false,
    };
  }

  const estimate = {
    calories: Math.round(Number(query.estimate.calories) || 0),
    protein: optional(query.estimate.protein),
    carbs: optional(query.estimate.carbs),
    fat: optional(query.estimate.fat),
  };
  const reference = match ? referenceOf(match) : null;
  const validation = validateFoodEntry({ ...estimate, quantity_g: grams, reference });
  return {
    ...estimate, quantity_g: grams, source: 'estimado',
    // Sem gramas não dá para calcular, mas a correspondência fica guardada.
    taco_food_id: taco && !custom ? taco.id : null,
    custom_food_id: custom ? custom.id : null,
    reference, validation, needs_review: true, ask_label: !match,
  };
}

// ── Validação ao salvar ──────────────────────────────────────────────────────

export interface FoodLogInput {
  calories: number;
  protein?: number | null;
  carbs?: number | null;
  fat?: number | null;
  quantity_g?: unknown;
  source?: unknown;
  taco_food_id?: unknown;
  custom_food_id?: unknown;
}

export interface CheckedFoodLog {
  /** Colunas novas de food_logs, prontas para gravar. */
  fields: {
    quantity_g: number | null;
    source: FoodSource | null;
    taco_food_id: number | null;
    custom_food_id: string | null;
    needs_review: boolean;
  };
  reference: FoodReference | null;
  validation: ValidationResult;
}

export class FoodValidationError extends Error {
  constructor(public validation: ValidationResult) {
    super(validation.issues.filter((i) => i.severity === 'error').map((i) => i.message).join(' '));
    this.name = 'FoodValidationError';
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Confere um lançamento antes de gravar: busca a referência pelos ids (o rótulo
 * só se for do próprio usuário), roda a validação e decide needs_review.
 * Lança FoodValidationError quando há ERRO.
 *
 * `source` ausente (versões antigas do app em cache) fica NULL, como os
 * registros anteriores a esta mudança.
 */
export async function checkFoodLog(userId: string, input: FoodLogInput): Promise<CheckedFoodLog> {
  const quantity_g = cleanGrams(input.quantity_g);
  let source: FoodSource | null = FOOD_SOURCES.includes(input.source as FoodSource) ? (input.source as FoodSource) : null;

  const tacoId = Number.isInteger(Number(input.taco_food_id)) && Number(input.taco_food_id) > 0 ? Number(input.taco_food_id) : null;
  const customId = typeof input.custom_food_id === 'string' && UUID.test(input.custom_food_id) ? input.custom_food_id : null;
  const custom = customId ? await getCustomFood(userId, customId) : null;
  const taco = !custom && tacoId ? await getTacoFood(tacoId) : null;

  // Origem declarada sem a referência correspondente não vale.
  if (source === 'taco' && !taco) source = 'manual';
  if (source === 'rotulo' && !custom) source = 'manual';

  const match = custom ?? taco;
  const reference = match ? referenceOf(match) : null;
  const validation = validateFoodEntry({
    calories: input.calories,
    protein: input.protein ?? null,
    carbs: input.carbs ?? null,
    fat: input.fat ?? null,
    quantity_g,
    reference,
  });
  if (validation.blocked) throw new FoodValidationError(validation);

  return {
    fields: {
      quantity_g,
      source,
      taco_food_id: taco ? taco.id : null,
      custom_food_id: custom ? custom.id : null,
      needs_review: needsReviewFor(source, validation),
    },
    reference,
    validation,
  };
}

/** Campos de referência que o app usa para mostrar a origem (ref_*). */
export function referenceColumns(ref: FoodReference | null) {
  return {
    ref_nome: ref?.nome ?? null,
    ref_source: ref?.source ?? null,
    ref_kcal_100g: ref?.kcal_100g ?? null,
    ref_protein_100g: ref?.protein_100g ?? null,
    ref_carbs_100g: ref?.carbs_100g ?? null,
    ref_fat_100g: ref?.fat_100g ?? null,
  };
}

/** SELECT de food_logs com a referência (TACO ou rótulo do mesmo usuário). */
export const FOOD_LOG_WITH_REF_SELECT = `
  f.id, f.user_id, f.food_name, f.meal_type, f.calories, f.protein, f.carbs, f.fat,
  f.hydration_ml, f.hydration_source, f.hydration_confidence, f.created_at,
  f.quantity_g, f.taco_food_id, f.custom_food_id, f.source, f.needs_review,
  coalesce(c.nome, t.nome) AS ref_nome,
  CASE WHEN c.id IS NOT NULL THEN 'rotulo' WHEN t.id IS NOT NULL THEN 'taco' END AS ref_source,
  coalesce(c.kcal_100g, t.kcal_100g) AS ref_kcal_100g,
  CASE WHEN c.id IS NOT NULL THEN c.protein_100g ELSE t.protein_100g END AS ref_protein_100g,
  CASE WHEN c.id IS NOT NULL THEN c.carbs_100g ELSE t.carbs_100g END AS ref_carbs_100g,
  CASE WHEN c.id IS NOT NULL THEN c.fat_100g ELSE t.fat_100g END AS ref_fat_100g
`;
export const FOOD_LOG_WITH_REF_FROM = `
  food_logs f
  LEFT JOIN taco_foods t ON t.id = f.taco_food_id
  LEFT JOIN custom_foods c ON c.id = f.custom_food_id AND c.user_id = f.user_id
`;
