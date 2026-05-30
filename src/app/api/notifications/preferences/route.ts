import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { supabase } from '@/lib/db';

// GET /api/notifications/preferences
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data } = await supabase
    .from('notification_preferences')
    .select('*')
    .eq('user_id', session.user.id)
    .single();

  return NextResponse.json(data ?? {
    hydration:   true,
    meals:       true,
    workouts:    true,
    insights:    true,
    goals:       true,
    quiet_start: 22,
    quiet_end:   7,
  });
}

// PUT /api/notifications/preferences
export async function PUT(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as {
    hydration?:   boolean;
    meals?:       boolean;
    workouts?:    boolean;
    insights?:    boolean;
    goals?:       boolean;
    quiet_start?: number;
    quiet_end?:   number;
  };

  const { error } = await supabase
    .from('notification_preferences')
    .upsert(
      { user_id: session.user.id, ...body, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    );

  if (error) {
    console.error('[preferences] upsert error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
