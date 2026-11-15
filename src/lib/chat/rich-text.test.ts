import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRichText } from '@/lib/chat/rich-text';

test('parágrafos separados por linha em branco; linhas seguidas ficam juntas', () => {
  assert.deepEqual(parseRichText('Oi!\nTudo certo.\n\nPróximo passo.'), [
    { type: 'p', lines: ['Oi!', 'Tudo certo.'] },
    { type: 'p', lines: ['Próximo passo.'] },
  ]);
});

test('listas com -, • e * viram uma lista só', () => {
  assert.deepEqual(parseRichText('Hoje:\n- **Calorias:** 1.890\n• Proteína: 107 g\n* Água: 1,5 L'), [
    { type: 'p', lines: ['Hoje:'] },
    { type: 'ul', items: ['**Calorias:** 1.890', 'Proteína: 107 g', 'Água: 1,5 L'] },
  ]);
});

test('lista numerada mantém o número', () => {
  assert.deepEqual(parseRichText('1. Beba água\n2) Coma proteína'), [
    { type: 'ol', items: [{ n: 1, text: 'Beba água' }, { n: 2, text: 'Coma proteína' }] },
  ]);
});

test('# e linha inteira em negrito viram título; separador some', () => {
  assert.deepEqual(parseRichText('## Resumo\n---\n**Opções para o jantar:**\n- Omelete'), [
    { type: 'h', text: 'Resumo' },
    { type: 'h', text: 'Opções para o jantar' },
    { type: 'ul', items: ['Omelete'] },
  ]);
});

test('texto depois de uma lista começa um parágrafo novo', () => {
  assert.deepEqual(parseRichText('- Arroz\nBoa escolha!'), [
    { type: 'ul', items: ['Arroz'] },
    { type: 'p', lines: ['Boa escolha!'] },
  ]);
});
