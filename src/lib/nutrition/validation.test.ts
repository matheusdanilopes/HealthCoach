import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateFoodEntry, needsReviewFor, derivedFromReference, type FoodReference } from '@/lib/nutrition/validation';
import { nutrientsFor } from '@/lib/nutrition/calc';
import { tacoByName } from '@/lib/nutrition/testing';

// ── Casos reais pedidos ──────────────────────────────────────────────────────

test('biscoito recheado 30 g com 672 kcal → ERRO (22,4 kcal/g)', () => {
  const r = validateFoodEntry({ calories: 672, quantity_g: 30, reference: tacoByName('Biscoito, doce, recheado com chocolate') });
  assert.equal(r.status, 'error');
  assert.equal(r.blocked, true);
  assert.ok(r.issues.some((i) => i.code === 'kcal_density' && i.severity === 'error'));
});

test('biscoito recheado 30 g com 672 kcal, sem referência → ERRO do mesmo jeito', () => {
  const r = validateFoodEntry({ calories: 672, quantity_g: 30 });
  assert.equal(r.status, 'error');
});

test('frango 220 g, 350 kcal, P 41,8 e G 4,4 → AVISO (macros somam ~207)', () => {
  const r = validateFoodEntry({ calories: 350, quantity_g: 220, protein: 41.8, fat: 4.4 });
  assert.equal(r.status, 'warning');
  assert.equal(r.blocked, false);
  assert.equal(r.needsReview, true);
  const issue = r.issues.find((i) => i.code === 'macro_mismatch');
  assert.ok(issue);
  assert.match(issue.message, /207 kcal/);
});

test('frango 220 g com a referência da TACO (peito grelhado): kcal batem, macros não → AVISO', () => {
  const ref = tacoByName('Frango, peito, sem pele, grelhado');
  const r = validateFoodEntry({ calories: 350, quantity_g: 220, protein: 41.8, fat: 4.4, reference: ref });
  assert.equal(r.status, 'warning');
  assert.deepEqual(r.issues.map((i) => i.code), ['macro_mismatch']);
});

test('macarrão cozido 100 g com 157 kcal → AVISO (referência 102 kcal/100 g)', () => {
  // A TACO 4ª ed. não tem macarrão cozido: a referência de 102 kcal/100 g é a
  // informada pelo usuário (como um alimento de rótulo salvo).
  const ref: FoodReference = { nome: 'Macarrão cozido', source: 'rotulo', kcal_100g: 102, protein_100g: null, carbs_100g: null, fat_100g: null };
  const r = validateFoodEntry({ calories: 157, quantity_g: 100, reference: ref });
  assert.equal(r.status, 'warning');
  const issue = r.issues.find((i) => i.code === 'reference_deviation');
  assert.ok(issue);
  assert.match(issue.message, /54% acima/);
});

test('arroz branco cozido 100 g com 128 kcal → OK (TACO: Arroz, tipo 1, cozido)', () => {
  const ref = tacoByName('Arroz, tipo 1, cozido');
  const r = validateFoodEntry({ calories: 128, quantity_g: 100, protein: 2.5, carbs: 28.1, fat: 0.2, reference: ref });
  assert.equal(r.status, 'ok');
  assert.deepEqual(r.issues, []);
});

test('arroz calculado pelo app a partir da TACO → OK', () => {
  const ref = tacoByName('Arroz, tipo 1, cozido');
  const r = validateFoodEntry({ ...nutrientsFor(100, ref), quantity_g: 100, reference: ref });
  assert.equal(r.status, 'ok');
});

test('café 50 ml (TACO: Café, infusão 10%) → OK', () => {
  const ref = tacoByName('Café, infusão 10%');
  const values = nutrientsFor(50, ref);
  assert.equal(values.calories, 5);
  const r = validateFoodEntry({ ...values, quantity_g: 50, reference: ref });
  assert.equal(r.status, 'ok');
});

test('café sem açúcar com 0 kcal → fora da validação (OK)', () => {
  const r = validateFoodEntry({ calories: 0, quantity_g: 50 });
  assert.equal(r.status, 'skipped');
  assert.equal(r.blocked, false);
  assert.equal(r.needsReview, false);
});

test('refrigerante zero 350 ml, 0 kcal → OK', () => {
  const r = validateFoodEntry({ calories: 0, quantity_g: 350, protein: 0, carbs: 0, fat: 0 });
  assert.equal(r.status, 'skipped');
  assert.equal(r.blocked, false);
});

test('exercício (kcal negativo) → fora da validação (OK)', () => {
  const r = validateFoodEntry({ calories: -300, quantity_g: null });
  assert.equal(r.status, 'skipped');
  const r2 = validateFoodEntry({ calories: -300, quantity_g: 60 });
  assert.equal(r2.status, 'skipped');
});

// ── Regras em detalhe ────────────────────────────────────────────────────────

test('sem gramas não há como validar: skipped', () => {
  assert.equal(validateFoodEntry({ calories: 500 }).status, 'skipped');
});

test('exatamente 9 kcal/g (óleo) não é erro', () => {
  const r = validateFoodEntry({ calories: 90, quantity_g: 10, fat: 10 });
  assert.equal(r.status, 'ok');
});

test('macros ausentes não disparam a regra dos macros', () => {
  const r = validateFoodEntry({ calories: 200, quantity_g: 100 });
  assert.equal(r.status, 'ok');
});

test('TACO que não fecha 4/4/9 (alface) não gera aviso quando calculada pelo app', () => {
  const ref = tacoByName('Alface, crespa, crua');
  const values = nutrientsFor(200, ref);
  assert.ok(derivedFromReference({ ...values, quantity_g: 200 }, ref));
  assert.equal(validateFoodEntry({ ...values, quantity_g: 200, reference: ref }).status, 'ok');
});

test('desvio de 30% exato ainda é OK; acima é aviso', () => {
  const ref: FoodReference = { nome: 'X', source: 'taco', kcal_100g: 100, protein_100g: null, carbs_100g: null, fat_100g: null };
  assert.equal(validateFoodEntry({ calories: 130, quantity_g: 100, reference: ref }).status, 'ok');
  assert.equal(validateFoodEntry({ calories: 131, quantity_g: 100, reference: ref }).status, 'warning');
  assert.equal(validateFoodEntry({ calories: 69, quantity_g: 100, reference: ref }).status, 'warning');
});

test('needs_review: estimado sempre; demais só com aviso', () => {
  const ok = validateFoodEntry({ calories: 128, quantity_g: 100 });
  const warn = validateFoodEntry({ calories: 350, quantity_g: 220, protein: 41.8, fat: 4.4 });
  assert.equal(needsReviewFor('estimado', ok), true);
  assert.equal(needsReviewFor('taco', ok), false);
  assert.equal(needsReviewFor('manual', warn), true);
  assert.equal(needsReviewFor(null, ok), false);
});
