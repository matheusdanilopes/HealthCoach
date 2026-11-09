/**
 * Auditoria (somente leitura) dos registros antigos de food_logs pelas mesmas
 * regras da validação. Núcleo puro — o acesso ao banco fica em
 * scripts/audit-food-logs.ts.
 *
 * Registros antigos não têm quantity_g: as gramas são lidas do nome quando o
 * app as escreveu lá ("Arroz (100g)"); e a referência é procurada pelo nome
 * (rótulos do usuário, depois TACO). As duas inferências são indicadas no
 * resultado para quem for revisar.
 */
import { CUSTOM_MIN_SCORE, TACO_MIN_SCORE, pickBestMatch } from './match';
import { gramsFromName, normalizeFoodName, stripQuantity } from './normalize';
import { macroIssue, validateFoodEntry, type FoodReference, type ValidationResult } from './validation';

export interface AuditLog {
  id: string;
  food_name: string;
  log_date: string;
  calories: number;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  quantity_g?: number | null;
  taco_food_id?: number | null;
  custom_food_id?: string | null;
}

export type RefRow = FoodReference & { id: number | string; nome_normalizado?: string | null };

export interface AuditFinding {
  log: AuditLog;
  grams: number | null;
  gramsFrom: 'quantity_g' | 'nome' | null;
  reference: FoodReference | null;
  referenceFrom: 'id' | 'nome' | null;
  result: ValidationResult;
}

export function auditFoodLog(log: AuditLog, taco: RefRow[], customs: RefRow[]): AuditFinding {
  let grams: number | null = null;
  let gramsFrom: AuditFinding['gramsFrom'] = null;
  if (log.quantity_g && log.quantity_g > 0) {
    grams = Number(log.quantity_g);
    gramsFrom = 'quantity_g';
  } else {
    const parsed = gramsFromName(log.food_name);
    if (parsed) { grams = parsed.grams; gramsFrom = 'nome'; }
  }

  let reference: RefRow | null = null;
  let referenceFrom: AuditFinding['referenceFrom'] = null;
  if (log.custom_food_id) reference = customs.find((c) => c.id === log.custom_food_id) ?? null;
  if (!reference && log.taco_food_id) reference = taco.find((t) => t.id === log.taco_food_id) ?? null;
  if (reference) referenceFrom = 'id';
  else {
    const name = stripQuantity(log.food_name);
    if (normalizeFoodName(name)) {
      reference = pickBestMatch(name, customs, CUSTOM_MIN_SCORE)?.candidate
        ?? pickBestMatch(name, taco, TACO_MIN_SCORE)?.candidate
        ?? null;
      if (reference) referenceFrom = 'nome';
    }
  }

  const input = {
    calories: Number(log.calories),
    protein: log.protein == null ? null : Number(log.protein),
    carbs: log.carbs == null ? null : Number(log.carbs),
    fat: log.fat == null ? null : Number(log.fat),
    quantity_g: grams,
    reference,
  };
  let result = validateFoodEntry(input);
  // Sem gramas as regras de kcal/g e de desvio não se aplicam, mas a dos
  // macros sim (não depende do peso).
  if (result.status === 'skipped') {
    const macro = macroIssue(input);
    if (macro) result = { status: 'warning', issues: [macro], needsReview: true, blocked: false };
  }
  return { log, grams, gramsFrom, reference, referenceFrom, result };
}

/** Só os registros com ERRO ou AVISO. */
export function auditFoodLogs(logs: AuditLog[], taco: RefRow[], customs: RefRow[]): AuditFinding[] {
  return logs
    .map((l) => auditFoodLog(l, taco, customs))
    .filter((f) => f.result.issues.length > 0);
}
