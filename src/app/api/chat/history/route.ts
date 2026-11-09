/**
 * GET /api/chat/history?conversation_id=<uuid> — mensagens gravadas de uma
 * conversa do usuário. O app usa para buscar a resposta quando a conexão cai
 * no meio do turno.
 */

import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { isUuid } from '@/lib/chat/recovery';
import { isMissingSchema, loadConversation } from '@/lib/chat/store';

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const conversationId = new URL(req.url).searchParams.get('conversation_id');
  if (!isUuid(conversationId)) {
    return NextResponse.json({ error: 'conversation_id inválido' }, { status: 400 });
  }

  try {
    return NextResponse.json({ messages: await loadConversation(session.user.id, conversationId) });
  } catch (err) {
    console.error('[chat-history]', err instanceof Error ? err.message : err);
    if (isMissingSchema(err)) {
      return NextResponse.json({ error: 'Histórico indisponível: falta aplicar a tabela chat_messages.' }, { status: 501 });
    }
    return NextResponse.json({ error: 'Não foi possível carregar o histórico.' }, { status: 500 });
  }
}
