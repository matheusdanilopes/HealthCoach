import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { sql } from '@/lib/db';

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  }

  try {
    const users = await sql`SELECT id, email, full_name, created_at FROM users ORDER BY created_at DESC`;
    return NextResponse.json(users);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json({ error: 'ID obrigatório.' }, { status: 400 });
  }
  if (id === session.user.id) {
    return NextResponse.json(
      { error: 'Não é possível excluir sua própria conta.' },
      { status: 400 }
    );
  }

  await sql`DELETE FROM users WHERE id = ${id}`;

  return NextResponse.json({ ok: true });
}
