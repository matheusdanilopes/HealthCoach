/**
 * GET    /api/chat/conversations           — conversas do usuário com a Nina
 * DELETE /api/chat/conversations?id=<uuid> — apaga uma conversa
 */

import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { isUuid } from '@/lib/chat/recovery';
import { deleteConversation, isMissingSchema, listConversations } from '@/lib/chat/store';

function failure(action: string, err: unknown) {
  console.error(`[chat-conversations] ${action}`, err instanceof Error ? err.message : err);
  if (isMissingSchema(err)) {
    return NextResponse.json({ error: 'Histórico indisponível: falta aplicar a tabela chat_messages.' }, { status: 501 });
  }
  return NextResponse.json({ error: 'Não foi possível carregar as conversas.' }, { status: 500 });
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    return NextResponse.json({ conversations: await listConversations(session.user.id) });
  } catch (err) {
    return failure('list', err);
  }
}

export async function DELETE(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const id = new URL(req.url).searchParams.get('id');
  if (!isUuid(id)) return NextResponse.json({ error: 'id inválido' }, { status: 400 });
  try {
    const deleted = await deleteConversation(session.user.id, id);
    return NextResponse.json({ deleted });
  } catch (err) {
    return failure('delete', err);
  }
}
