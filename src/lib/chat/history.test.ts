import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dayLabel, formatAverages, formatDay, formatPastConversations, resolveRange, type DayRow } from '@/lib/chat/history';

const TODAY = '2026-11-15';

const day = (date: string, extra: Partial<DayRow> = {}): DayRow => ({
  date, kcal_consumed: 0, protein_g: 0, carbs_g: 0, fat_g: 0, kcal_burned: 0, water_ml: 0,
  workout_sessions: 0, workout_minutes: null, weight_kg: null, body_fat_pct: null, muscle_mass_kg: null,
  ...extra,
});

test('dayLabel mostra dia/mês e dia da semana', () => {
  assert.equal(dayLabel('2026-11-14'), '14/11 (sáb)');
  assert.equal(dayLabel('2026-11-15'), '15/11 (dom)');
});

test('resolveRange: período normal, invertido e só com início', () => {
  assert.deepEqual(resolveRange({ data_inicio: '2026-11-08', data_fim: '2026-11-14' }, TODAY),
    { start: '2026-11-08', end: '2026-11-14', meals: false, note: null });
  assert.deepEqual(resolveRange({ data_inicio: '2026-11-14', data_fim: '2026-11-08' }, TODAY),
    { start: '2026-11-08', end: '2026-11-14', meals: false, note: null });
  assert.deepEqual(resolveRange({ data_inicio: '2026-11-14' }, TODAY),
    { start: '2026-11-14', end: '2026-11-14', meals: false, note: null });
});

test('resolveRange: limita futuro, período longo e refeições', () => {
  assert.deepEqual(resolveRange({ data_inicio: '2026-11-20', data_fim: '2026-11-21' }, TODAY),
    { error: 'Não há registros no futuro (hoje é 2026-11-15).' });
  const capped = resolveRange({ data_inicio: '2025-01-01', data_fim: '2026-12-31' }, TODAY);
  assert.ok(!('error' in capped));
  assert.equal(capped.end, TODAY);
  assert.equal(capped.start, '2026-07-19');
  assert.match(capped.note ?? '', /120 dias/);
  const meals = resolveRange({ data_inicio: '2026-11-01', data_fim: '2026-11-14', incluir_refeicoes: true }, TODAY);
  assert.ok(!('error' in meals));
  assert.equal(meals.meals, false);
  assert.match(meals.note ?? '', /até 7 dias/);
  assert.deepEqual(resolveRange({ data_inicio: 'ontem' }, TODAY), { error: 'data_inicio inválida: use AAAA-MM-DD.' });
});

test('formatDay mostra só o que foi registrado', () => {
  assert.equal(
    formatDay(day('2026-11-14', { kcal_consumed: 1890, protein_g: 107.4, carbs_g: 180, fat_g: 60, water_ml: 1800, kcal_burned: 300, weight_kg: 82.4 })),
    '14/11 (sáb): 1890 kcal | 107g prot | 180g carb | 60g gord | água 1800ml | treino -300 kcal | peso 82,4kg'
  );
  assert.equal(formatDay(day('2026-11-13', { weight_kg: 82.9 })), '13/11 (sex): sem refeições registradas | peso 82,9kg');
});

test('formatAverages: médias dos dias com refeição, meta e variação de peso', () => {
  const out = formatAverages([
    day('2026-11-12', { kcal_consumed: 2000, protein_g: 100, weight_kg: 83 }),
    day('2026-11-13', { weight_kg: 82.5 }),
    day('2026-11-14', { kcal_consumed: 1600, protein_g: 120, water_ml: 2000, kcal_burned: 250, weight_kg: 82.4 }),
  ], { calories: 1800, protein: 140 });
  assert.match(out, /Média \(2 dias com refeições\): 1800 kcal \| 110g prot/);
  assert.match(out, /dentro da meta de kcal em 1\/2 dias/);
  assert.match(out, /Água: média 2000ml \(1 dias\)/);
  assert.match(out, /Dias com treino: 1/);
  assert.match(out, /83kg .* → 82,4kg .*, -0,6kg/);
});

test('formatPastConversations: pergunta com a resposta, por conversa, em ordem', () => {
  const out = formatPastConversations([
    { conversation_id: 'b', role: 'assistant', content: 'Tente **frango** no jantar.', created_at: '2026-11-14T22:00:05Z' },
    { conversation_id: 'b', role: 'user', content: 'O que janto?', created_at: '2026-11-14T22:00:00Z' },
    { conversation_id: 'a', role: 'assistant', content: 'Beba mais água.', created_at: '2026-11-12T12:00:05Z' },
    { conversation_id: 'a', role: 'user', content: 'Como está\nminha água?', created_at: '2026-11-12T12:00:00Z' },
  ]);
  assert.equal(out, [
    '— Conversa de 12/11',
    '  Usuário: "Como está minha água?"',
    '  Você: "Beba mais água."',
    '— Conversa de 14/11',
    '  Usuário: "O que janto?"',
    '  Você: "Tente frango no jantar."',
  ].join('\n'));
});
