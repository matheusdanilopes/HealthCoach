export const MAX_FEEDBACK_COMMENT = 1000;

export interface FeedbackInput {
  messageId: string;
  /** 👍 = 1, 👎 = -1, null desfaz. */
  rating: 1 | -1 | null;
  comment: string | null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Valida o corpo de POST /api/chat/feedback; null = inválido. */
export function parseFeedback(body: unknown): FeedbackInput | null {
  const b = (body ?? {}) as Record<string, unknown>;
  const messageId = typeof b.message_id === 'string' && UUID_RE.test(b.message_id) ? b.message_id : null;
  const rating = b.rating === 1 || b.rating === -1 ? b.rating : b.rating === null ? null : undefined;
  if (!messageId || rating === undefined) return null;
  const comment = rating !== null && typeof b.comment === 'string' && b.comment.trim()
    ? b.comment.trim().slice(0, MAX_FEEDBACK_COMMENT)
    : null;
  return { messageId, rating, comment };
}
