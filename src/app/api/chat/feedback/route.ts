/**
 * POST /api/chat/feedback — 👍/👎 numa resposta do Coach.
 *
 * Corpo: { message_id, rating: 1 | -1 | null, comment? }
 * null desfaz a avaliação. Só vale para respostas do próprio usuário.
 */

import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { parseFeedback } from '@/lib/chat/feedback';
import { isMissingSchema, rateMessage } from '@/lib/chat/store';

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const input = parseFeedback(await req.json().catch(() => null));
  if (!input) {
    return NextResponse.json({ error: 'message_id e rating (1, -1 ou null) são obrigatórios' }, { status: 400 });
  }

  try {
    const found = await rateMessage(session.user.id, input.messageId, input.rating, input.comment);
    if (!found) return NextResponse.json({ error: 'Mensagem não encontrada' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[chat-feedback]', err instanceof Error ? err.message : err);
    if (isMissingSchema(err)) {
      return NextResponse.json({ error: 'Avaliação indisponível: falta aplicar a tabela chat_messages.' }, { status: 501 });
    }
    return NextResponse.json({ error: 'Não foi possível salvar a avaliação.' }, { status: 500 });
  }
}
