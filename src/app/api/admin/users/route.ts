import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { supabase } from '@/lib/db';

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  }

  const { data: users, error } = await supabase
    .from('users')
    .select('id, email, full_name, created_at')
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(users);
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

  await supabase.from('users').delete().eq('id', id);

  return NextResponse.json({ ok: true });
}
