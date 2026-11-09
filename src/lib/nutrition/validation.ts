/**
 * Validação de um lançamento de alimento — função pura, usada no servidor
 * (ao salvar), no app (para mostrar o aviso antes de salvar) e no script de
 * auditoria dos registros antigos.
 *
 * Só se aplica a itens com calories > 0 e quantity_g informado: café sem
 * açúcar (0 kcal), refrigerante zero e exercício (kcal negativo) passam direto.
 *
 * ERRO (bloqueia e pede correção)
 *   - kcal/g > 9: nada passa de 9 kcal/g (gordura pura).
 * AVISO (salva com needs_review = true e mostra o selo)
 *   - macros informados e |4·P + 4·C + 9·G − kcal| > 10% das kcal;
 *   - kcal/100 g mais de 30% fora do alimento correspondente (TACO ou rótulo).
 *
 * A regra dos macros não vale quando kcal e macros foram calculados pelo app a
 * partir da própria referência: a TACO usa fatores de conversão específicos de
 * cada alimento (e conta fibra no carboidrato), então 168 dos 591 itens dela
 * não fecham 4/4/9 dentro de 10% — avisar sobre o valor da tabela oficial
 * seria um falso positivo. Para valores estimados ou digitados ela vale.
 */
import { nutrientsFor, type Per100g } from './calc';

export const MAX_KCAL_PER_G = 9;
export const MACRO_TOLERANCE = 0.1;
/** Folga mínima (kcal) da regra dos macros: kcal inteiro e macros com 1 casa já erram ~1 kcal. */
export const MACRO_TOLERANCE_MIN_KCAL = 2;
export const REFERENCE_TOLERANCE = 0.3;

export type FoodSource = 'taco' | 'rotulo' | 'estimado' | 'manual';
export const FOOD_SOURCES: FoodSource[] = ['taco', 'rotulo', 'estimado', 'manual'];

export interface FoodReference extends Per100g {
  nome: string;
  /** De onde vem a referência: tabela TACO ou rótulo salvo pelo usuário. */
  source: 'taco' | 'rotulo';
}

export interface ValidationInput {
  calories: number;
  quantity_g?: number | null;
  protein?: number | null;
  carbs?: number | null;
  fat?: number | null;
  reference?: FoodReference | null;
}

export type IssueCode = 'kcal_density' | 'macro_mismatch' | 'reference_deviation';

export interface ValidationIssue {
  code: IssueCode;
  severity: 'error' | 'warning';
  message: string;
}

export interface ValidationResult {
  /** skipped = regra não se aplica (kcal ≤ 0 ou sem gramas). */
  status: 'ok' | 'warning' | 'error' | 'skipped';
  issues: ValidationIssue[];
  /** Algum aviso: salvar com needs_review. */
  needsReview: boolean;
  /** Algum erro: não salvar. */
  blocked: boolean;
}

const fmt = (n: number, digits = 1) =>
  n.toLocaleString('pt-BR', { maximumFractionDigits: digits, minimumFractionDigits: 0 });

/** Os valores informados são os que o app calcularia a partir da referência. */
export function derivedFromReference(input: ValidationInput, ref: Per100g): boolean {
  if (!input.quantity_g || input.quantity_g <= 0) return false;
  const expected = nutrientsFor(input.quantity_g, ref);
  if (Math.abs(input.calories - expected.calories) > 1) return false;
  const close = (got: number | null | undefined, want: number | null) =>
    want == null ? got == null || got === 0 : got != null && Math.abs(got - want) <= 0.15;
  return close(input.protein, expected.protein) && close(input.carbs, expected.carbs) && close(input.fat, expected.fat);
}

/**
 * Regra dos macros sozinha (não depende das gramas): |4·P + 4·C + 9·G − kcal|
 * acima de 10% das kcal. Pulada quando os valores vieram da própria referência.
 */
export function macroIssue(input: ValidationInput): ValidationIssue | null {
  if (!(input.calories > 0)) return null;
  const macros = [input.protein, input.carbs, input.fat];
  const hasMacros = macros.some((v) => v != null) && macros.some((v) => (v ?? 0) > 0);
  if (!hasMacros) return null;
  if (input.reference && derivedFromReference(input, input.reference)) return null;
  const fromMacros = 4 * (input.protein ?? 0) + 4 * (input.carbs ?? 0) + 9 * (input.fat ?? 0);
  const diff = Math.abs(fromMacros - input.calories);
  if (diff <= Math.max(MACRO_TOLERANCE * input.calories, MACRO_TOLERANCE_MIN_KCAL)) return null;
  return {
    code: 'macro_mismatch',
    severity: 'warning',
    message: `Os macros somam ${Math.round(fromMacros)} kcal (4·P + 4·C + 9·G), mas o item tem ${input.calories} kcal — diferença de ${Math.round((diff / input.calories) * 100)}%.`,
  };
}

export function validateFoodEntry(input: ValidationInput): ValidationResult {
  const issues: ValidationIssue[] = [];
  const grams = input.quantity_g ?? 0;
  if (!(input.calories > 0) || !(grams > 0)) {
    return { status: 'skipped', issues, needsReview: false, blocked: false };
  }

  const kcalPerG = input.calories / grams;
  if (kcalPerG > MAX_KCAL_PER_G) {
    issues.push({
      code: 'kcal_density',
      severity: 'error',
      message: `${input.calories} kcal em ${fmt(grams)} g dá ${fmt(kcalPerG)} kcal/g — acima de ${MAX_KCAL_PER_G} kcal/g, o máximo possível (gordura pura). Confira as gramas ou as kcal.`,
    });
  }

  const ref = input.reference ?? null;
  const macro = macroIssue(input);
  if (macro) issues.push(macro);

  if (ref && ref.kcal_100g > 0) {
    const per100 = kcalPerG * 100;
    const deviation = (per100 - ref.kcal_100g) / ref.kcal_100g;
    if (Math.abs(deviation) > REFERENCE_TOLERANCE) {
      const origin = ref.source === 'taco' ? 'na TACO' : 'no rótulo salvo';
      issues.push({
        code: 'reference_deviation',
        severity: 'warning',
        message: `${Math.round(per100)} kcal/100 g está ${Math.round(Math.abs(deviation) * 100)}% ${deviation > 0 ? 'acima' : 'abaixo'} do valor ${origin} para "${ref.nome}" (${Math.round(ref.kcal_100g)} kcal/100 g).`,
      });
    }
  }

  const blocked = issues.some((i) => i.severity === 'error');
  const needsReview = issues.some((i) => i.severity === 'warning');
  return { status: blocked ? 'error' : needsReview ? 'warning' : 'ok', issues, needsReview, blocked };
}

/** needs_review do registro: estimado pela IA sempre pede revisão. */
export function needsReviewFor(source: FoodSource | null | undefined, result: ValidationResult): boolean {
  return source === 'estimado' || result.needsReview;
}
