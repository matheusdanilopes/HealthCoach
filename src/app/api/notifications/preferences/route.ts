import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { insertInto, sql } from '@/lib/db';
import { DEFAULT_PREFERENCES, type NotificationPreferences } from '@/lib/notification-sender';

const BOOL_KEYS = ['hydration', 'meals', 'workouts', 'goals'] as const;
const HOUR_KEYS = ['quiet_start', 'quiet_end'] as const;

// GET /api/notifications/preferences
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const [data] = await sql`
    SELECT hydration, meals, workouts, goals, quiet_start, quiet_end
    FROM notification_preferences WHERE user_id = ${session.user.id}
  `;

  return NextResponse.json({ ...DEFAULT_PREFERENCES, ...(data ?? {}) });
}

// PUT /api/notifications/preferences — accepts any subset of the preference fields
export async function PUT(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const update: Partial<NotificationPreferences> = {};
  for (const k of BOOL_KEYS) {
    if (typeof body[k] === 'boolean') update[k] = body[k];
  }
  for (const k of HOUR_KEYS) {
    const v = body[k];
    if (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 23) update[k] = v;
  }

  try {
    await insertInto(
      'notification_preferences',
      { user_id: session.user.id, ...update, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[preferences] upsert error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
