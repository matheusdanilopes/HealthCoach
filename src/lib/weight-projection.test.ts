import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeProjectionDays,
  projectWeight,
  weighInTrendPerWeek,
  type DayEnergy,
} from '@/lib/weight-projection';

const days = (n: number, consumed: number, burned = 0): DayEnergy[] =>
  Array.from({ length: n }, (_, i) => ({ date: `2026-11-${String(i + 1).padStart(2, '0')}`, consumed, burned }));

test('normaliza o período', () => {
  assert.equal(normalizeProjectionDays(undefined), 14);
  assert.equal(normalizeProjectionDays(null), 14);
  assert.equal(normalizeProjectionDays('abc'), 14);
  assert.equal(normalizeProjectionDays(1), 3);
  assert.equal(normalizeProjectionDays(500), 90);
  assert.equal(normalizeProjectionDays('21'), 21);
});

test('déficit de 550 kcal/dia → perda de 0,5 kg na semana', () => {
  const p = projectWeight({ windowDays: 14, days: days(14, 1950), weighIns: [], tdee: 2500, currentWeight: 80 })!;
  assert.equal(p.direction, 'loss');
  assert.equal(p.avgBalanceKcal, -550);
  assert.equal(p.changeKg, -0.5);
  assert.equal(p.projectedWeight, 79.5);
  assert.equal(p.signalsAgree, null);
  assert.equal(p.confidence, 'medium');
});

test('superávit, contando o treino como gasto extra', () => {
  const p = projectWeight({ windowDays: 7, days: days(7, 3300, 300), weighIns: [], tdee: 2500, currentWeight: 70 })!;
  assert.equal(p.direction, 'gain');
  assert.equal(p.avgBalanceKcal, 500);
});

test('balanço próximo de zero → estável', () => {
  const p = projectWeight({ windowDays: 7, days: days(7, 2520), weighIns: [], tdee: 2500, currentWeight: 70 })!;
  assert.equal(p.direction, 'stable');
});

test('dias com registro incompleto são ignorados', () => {
  const p = projectWeight({
    windowDays: 14,
    days: [...days(5, 2000), { date: '2026-11-10', consumed: 300, burned: 0 }],
    weighIns: [],
    tdee: 2500,
    currentWeight: 80,
  })!;
  assert.equal(p.loggedDays, 5);
  assert.equal(p.avgBalanceKcal, -500);
});

test('sem dados suficientes → null', () => {
  assert.equal(projectWeight({ windowDays: 14, days: days(2, 2000), weighIns: [], tdee: 2500, currentWeight: 80 }), null);
  assert.equal(projectWeight({ windowDays: 14, days: days(10, 2000), weighIns: [], tdee: null, currentWeight: 80 }), null);
});

test('tendência da balança por regressão linear', () => {
  const t = weighInTrendPerWeek([
    { date: '2026-11-01', weight: 80 },
    { date: '2026-11-08', weight: 79.5 },
    { date: '2026-11-15', weight: 79 },
  ])!;
  assert.ok(Math.abs(t.perWeek - -0.5) < 1e-9);
  assert.equal(t.spanDays, 14);
  // Pesagens no mesmo intervalo de poucos dias não formam tendência.
  assert.equal(weighInTrendPerWeek([{ date: '2026-11-01', weight: 80 }, { date: '2026-11-02', weight: 79 }]), null);
});

test('só pesagens, sem TDEE', () => {
  const p = projectWeight({
    windowDays: 14,
    days: [],
    weighIns: [
      { date: '2026-11-01', weight: 80 },
      { date: '2026-11-08', weight: 80.4 },
      { date: '2026-11-15', weight: 80.8 },
    ],
    tdee: null,
    currentWeight: 80.8,
  })!;
  assert.equal(p.direction, 'gain');
  assert.equal(p.changeKg, 0.4);
  assert.equal(p.avgBalanceKcal, null);
});

test('calorias e balança concordando → confiança alta e média ponderada', () => {
  const weighIns = Array.from({ length: 8 }, (_, i) => ({
    date: `2026-11-${String(i * 2 + 1).padStart(2, '0')}`,
    weight: 80 - (i * 2 * 0.7) / 7,
  }));
  const p = projectWeight({ windowDays: 14, days: days(14, 1950), weighIns, tdee: 2500, currentWeight: 78.6 })!;
  assert.equal(p.signalsAgree, true);
  assert.equal(p.confidence, 'high');
  // Entre a estimativa das calorias (−0,5) e a da balança (−0,7).
  assert.ok(p.changeKg < -0.5 && p.changeKg > -0.7);
});

test('calorias e balança divergindo → confiança baixa', () => {
  const p = projectWeight({
    windowDays: 14,
    days: days(14, 1950),
    weighIns: [
      { date: '2026-11-01', weight: 80 },
      { date: '2026-11-08', weight: 80.6 },
      { date: '2026-11-15', weight: 81.2 },
    ],
    tdee: 2500,
    currentWeight: 81.2,
  })!;
  assert.equal(p.signalsAgree, false);
  assert.equal(p.confidence, 'low');
});
