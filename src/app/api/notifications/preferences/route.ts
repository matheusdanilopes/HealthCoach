import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { supabase } from '@/lib/db';

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data } = await supabase
    .from('notification_preferences')
    .select('enabled, imports, processing, updates')
    .eq('user_id', session.user.id)
    .single();

  return NextResponse.json(
    data ?? { enabled: true, imports: true, processing: true, updates: true },
  );
}

export async function PUT(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const allowed = ['enabled', 'imports', 'processing', 'updates'] as const;
  const patch: Partial<Record<typeof allowed[number], boolean>> = {};
  for (const key of allowed) {
    if (typeof body[key] === 'boolean') patch[key] = body[key];
  }

  await supabase.from('notification_preferences').upsert(
    { user_id: session.user.id, ...patch, updated_at: new Date().toISOString() },
    { onConflict: 'user_id' },
  );

  return NextResponse.json({ ok: true });
}
