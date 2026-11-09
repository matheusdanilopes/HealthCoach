import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickBestMatch, preparationConflict, TACO_MIN_SCORE, CUSTOM_MIN_SCORE } from '@/lib/nutrition/match';
import { normalizeFoodName, gramsFromName, stripQuantity } from '@/lib/nutrition/normalize';
import { similarity } from '@/lib/nutrition/trigram';
import { nutrientsFor, per100FromPortion } from '@/lib/nutrition/calc';
import { loadTaco, tacoByName } from '@/lib/nutrition/testing';

const match = (q: string) => pickBestMatch(q, loadTaco(), TACO_MIN_SCORE)?.candidate.nome ?? null;

test('normalização igual à do seed (sem acento, sem pontuação)', () => {
  assert.equal(normalizeFoodName('Pão, trigo, francês'), 'pao trigo frances');
  assert.equal(normalizeFoodName('  Café, infusão 10%  '), 'cafe infusao 10');
  for (const row of loadTaco().slice(0, 50)) assert.equal(normalizeFoodName(row.nome), row.nome_normalizado);
});

test('similaridade no método do pg_trgm', () => {
  assert.equal(similarity('arroz', 'arroz'), 1);
  assert.equal(similarity('abc', ''), 0);
  // "  c", " ca", "cat", "at " × "  c", " ca", "cad", "ado", "do " → 2 / 7
  assert.equal(similarity('cat', 'cado'), 2 / 7);
});

test('nome no padrão TACO casa exatamente', () => {
  assert.equal(match('Arroz, tipo 1, cozido'), 'Arroz, tipo 1, cozido');
  assert.equal(match('Frango, peito, sem pele, grelhado'), 'Frango, peito, sem pele, grelhado');
  assert.equal(match('pao trigo frances'), 'Pão, trigo, francês');
});

test('variações próximas casam', () => {
  assert.equal(match('Feijão carioca cozido'), 'Feijão, carioca, cozido');
  assert.equal(match('Banana prata crua'), 'Banana, prata, crua');
  assert.equal(match('Biscoito doce recheado com chocolate'), 'Biscoito, doce, recheado com chocolate');
});

test('macarrão cozido NÃO casa com macarrão cru (TACO não tem o cozido)', () => {
  assert.equal(preparationConflict(['macarrao', 'cozido'], ['macarrao', 'trigo', 'cru']), true);
  assert.equal(match('Macarrão, trigo, cozido'), null);
  assert.equal(match('Macarrão cozido'), null);
});

test('alimento principal diferente não casa', () => {
  // "cozido" sozinho não pode puxar "Arroz, tipo 1, cozido"
  assert.equal(match('Whey protein'), null);
  assert.equal(match('Bombom Sonho de Valsa'), null);
});

test('rótulo do usuário: nome igual ou bem parecido', () => {
  const customs = [{ nome: 'Whey Growth Chocolate', nome_normalizado: 'whey growth chocolate' }];
  assert.ok(pickBestMatch('whey growth chocolate', customs, CUSTOM_MIN_SCORE));
  assert.ok(pickBestMatch('Whey Growth sabor chocolate', customs, CUSTOM_MIN_SCORE));
  assert.equal(pickBestMatch('Whey baunilha', customs, CUSTOM_MIN_SCORE), null);
});

test('cálculo: kcal = g × kcal_100g / 100, arredondado', () => {
  const arroz = tacoByName('Arroz, tipo 1, cozido');
  assert.deepEqual(nutrientsFor(100, arroz), { calories: 128, protein: 2.5, carbs: 28.1, fat: 0.2 });
  assert.deepEqual(nutrientsFor(150, arroz), { calories: 192, protein: 3.8, carbs: 42.1, fat: 0.3 });
  const azeite = tacoByName('Azeite, de oliva, extra virgem');
  assert.deepEqual(nutrientsFor(10, azeite), { calories: 88, protein: 0, carbs: 0, fat: 10 });
  const cachaca = tacoByName('Cana, aguardente 1');
  assert.deepEqual(nutrientsFor(50, cachaca), { calories: 108, protein: null, carbs: null, fat: null });
});

test('rótulo: porção convertida para 100 g', () => {
  assert.deepEqual(per100FromPortion(30, { calories: 120, protein: 24, carbs: 3, fat: 1.5 }), {
    kcal_100g: 400, protein_100g: 80, carbs_100g: 10, fat_100g: 5,
  });
});

test('gramas no nome dos registros antigos', () => {
  assert.deepEqual(gramsFromName('Manga tommy (150g (1 unidade média))'), { grams: 150, unit: 'g' });
  assert.deepEqual(gramsFromName('Esfirra de carne (1 un (80g))'), { grams: 80, unit: 'g' });
  assert.deepEqual(gramsFromName('Café coado sem açúcar (50ml)'), { grams: 50, unit: 'ml' });
  assert.equal(gramsFromName('Pão francês (1 unidade)'), null);
  assert.equal(stripQuantity('Arroz branco cozido (60g)'), 'Arroz branco cozido');
});
