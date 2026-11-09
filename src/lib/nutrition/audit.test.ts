import { test } from 'node:test';
import assert from 'node:assert/strict';
import { auditFoodLog, auditFoodLogs, type AuditLog } from '@/lib/nutrition/audit';
import { loadTaco } from '@/lib/nutrition/testing';

const taco = loadTaco();
const log = (food_name: string, calories: number, extra: Partial<AuditLog> = {}): AuditLog => ({
  id: food_name, food_name, log_date: '2026-11-01', calories, protein: null, carbs: null, fat: null, ...extra,
});

test('biscoito com gramas no nome e kcal impossíveis → ERRO', () => {
  const f = auditFoodLog(log('Biscoito recheado (30g)', 672), taco, []);
  assert.equal(f.grams, 30);
  assert.equal(f.gramsFrom, 'nome');
  assert.equal(f.result.status, 'error');
});

test('frango sem gramas no nome: só a regra dos macros se aplica', () => {
  const f = auditFoodLog(log('Frango grelhado', 350, { protein: 41.8, fat: 4.4 }), taco, []);
  assert.equal(f.grams, null);
  assert.deepEqual(f.result.issues.map((i) => i.code), ['macro_mismatch']);
});

test('desvio da TACO achada pelo nome', () => {
  const f = auditFoodLog(log('Feijão carioca cozido (100g)', 160), taco, []);
  assert.equal(f.referenceFrom, 'nome');
  assert.equal(f.reference?.nome, 'Feijão, carioca, cozido');
  assert.deepEqual(f.result.issues.map((i) => i.code), ['reference_deviation']);
});

test('registros OK, exercício e bebida zero ficam fora da lista', () => {
  const logs = [
    log('Arroz, tipo 1, cozido (100g)', 128, { protein: 2.5, carbs: 28.1, fat: 0.2 }),
    log('Refrigerante zero (350ml)', 0),
    log('Caminhada', -250),
    log('Café coado (50ml)', 5),
  ];
  assert.deepEqual(auditFoodLogs(logs, taco, []), []);
});

test('rótulo do usuário tem prioridade sobre a TACO', () => {
  const customs = [{ id: 'c1', nome: 'Biscoito recheado Marca X', nome_normalizado: 'biscoito recheado marca x', source: 'rotulo' as const, kcal_100g: 480, protein_100g: 6, carbs_100g: 70, fat_100g: 20 }];
  const f = auditFoodLog(log('Biscoito recheado Marca X (30g)', 300), taco, customs);
  assert.equal(f.reference?.source, 'rotulo');
  assert.equal(f.result.status, 'error'); // 10 kcal/g
});
