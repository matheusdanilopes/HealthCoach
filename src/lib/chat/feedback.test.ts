import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFeedback } from '@/lib/chat/feedback';

const ID = '11111111-1111-4111-8111-111111111111';

test('👍, 👎 com comentário e desfazer', () => {
  assert.deepEqual(parseFeedback({ message_id: ID, rating: 1 }), { messageId: ID, rating: 1, comment: null });
  assert.deepEqual(parseFeedback({ message_id: ID, rating: -1, comment: '  calorias erradas ' }), { messageId: ID, rating: -1, comment: 'calorias erradas' });
  assert.deepEqual(parseFeedback({ message_id: ID, rating: null, comment: 'x' }), { messageId: ID, rating: null, comment: null });
});

test('corpo inválido', () => {
  assert.equal(parseFeedback(null), null);
  assert.equal(parseFeedback({ message_id: ID }), null);
  assert.equal(parseFeedback({ message_id: ID, rating: 2 }), null);
  assert.equal(parseFeedback({ message_id: 'abc', rating: 1 }), null);
});

test('comentário é limitado a 1000 caracteres', () => {
  assert.equal(parseFeedback({ message_id: ID, rating: -1, comment: 'a'.repeat(5000) })?.comment?.length, 1000);
});
