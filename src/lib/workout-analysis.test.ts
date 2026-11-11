import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  acsmMet,
  buildWorkoutFacts,
  confidenceFromRange,
  estimateMaxHR,
  keytelKcal,
  normalizeRange,
  rpeLevel,
} from '@/lib/workout-analysis';

test('RPE e FC máxima', () => {
  assert.equal(rpeLevel(7), 2);
  assert.equal(rpeLevel(5), 1);
  assert.equal(rpeLevel(11), null);
  assert.equal(estimateMaxHR(30), 187);
});

test('Keytel: homem 30 anos, 75 kg, FC 140, 60 min', () => {
  const kcal = keytelKcal({ heartRate: 140, weightKg: 75, age: 30, sex: 'male', minutes: 60 });
  assert.ok(kcal && kcal > 770 && kcal < 785, String(kcal));
  assert.equal(keytelKcal({ heartRate: 70, weightKg: 75, age: 30, sex: 'male', minutes: 60 }), null);
});

test('ACSM: corrida a 10 km/h ≈ 10,5 MET; caminhada a 5 km/h ≈ 3,4 MET', () => {
  assert.equal(acsmMet('corrida', 10), 10.5);
  assert.equal(acsmMet('caminhada', 5), 3.4);
  assert.equal(acsmMet('tênis', 10), null);
});

test('RPE a 1 nível da intensidade declarada é coerente', () => {
  const facts = buildWorkoutFacts({
    workoutType: 'tênis', intensity: 'moderada', minutes: 60, rpe: 7, weightKg: 80,
  });
  assert.deepEqual(facts.contradictions, []);
  assert.ok(facts.lines.some((l) => l.includes('coerentes')));
  assert.ok(facts.lines.some((l) => l.includes('kcal = MET × 80')));
});

test('RPE a 2 níveis e velocidade impossível são contradições', () => {
  const facts = buildWorkoutFacts({
    workoutType: 'caminhada', intensity: 'leve', minutes: 30, rpe: 9, distanceKm: 10, weightKg: 70,
  });
  assert.equal(facts.contradictions.length, 2);
});

test('confiança pela faixa: ±12% alta, ±25% média, acima baixa', () => {
  assert.equal(confidenceFromRange(500, { min: 440, max: 560 }), 'alta');
  assert.equal(confidenceFromRange(500, { min: 420, max: 580 }), 'média');
  assert.equal(confidenceFromRange(500, { min: 300, max: 700 }), 'baixa');
  assert.equal(confidenceFromRange(500, { min: 450, max: 550 }, ['x']), 'média');
  assert.equal(confidenceFromRange(500, null), 'média');
});

test('faixa inválida ou que não contém a estimativa é descartada', () => {
  assert.deepEqual(normalizeRange(500, 560, 440), { min: 440, max: 560 });
  assert.equal(normalizeRange(500, 520, 600), null);
  assert.equal(normalizeRange(500, undefined, 600), null);
});
