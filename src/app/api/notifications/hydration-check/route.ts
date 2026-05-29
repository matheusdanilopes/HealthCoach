import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { supabase } from '@/lib/db';
import { sendPushToSubscriptions } from '@/lib/webpush';
import { brazilToday } from '@/lib/timezone';

// Shared logic: check one user's hydration and push if needed
async function checkUserHydration(userId: string): Promise<'notified' | 'ok' | 'no_sub' | 'skipped'> {
  const [{ data: subs }, { data: profile }, { data: waterData }] = await Promise.all([
    supabase
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth')
      .eq('user_id', userId),
    supabase
      .from('users')
      .select('target_water_ml, full_name')
      .eq('id', userId)
      .single(),
    supabase
      .from('water_logs')
      .select('amount_ml, created_at')
      .eq('user_id', userId)
      .eq('log_date', brazilToday())
      .order('created_at', { ascending: false })
      .limit(1),
  ]);

  if (!subs || subs.length === 0) return 'no_sub';

  const target   = profile?.target_water_ml ?? 2500;
  const lastLog  = waterData?.[0] ?? null;
  const minSince = lastLog
    ? Math.floor((Date.now() - new Date(lastLog.created_at).getTime()) / 60_000)
    : 999;

  // Quiet hours check (Brazil time — client uses local time, server approximates)
  const bHour = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' })).getHours();
  if (bHour >= 22 || bHour < 7) return 'skipped';

  let title = '';
  let body  = '';

  if (minSince > 120) {
    title = 'Hora de beber água 💧';
    body  = 'Você está há mais de 2h sem se hidratar. Cuide-se!';
  } else {
    return 'ok';
  }

  try {
    const { expired } = await sendPushToSubscriptions(
      subs.map((s) => ({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } })),
      { title, body, tag: 'hc-hydration', url: '/dashboard' }
    );
    if (expired.length > 0) {
      await supabase.from('push_subscriptions').delete()
        .in('endpoint', expired).eq('user_id', userId);
    }
    console.log(`[hydration-check] Notified user ${userId}`);
    return 'notified';
  } catch {
    return 'ok';
  }
}

// GET /api/notifications/hydration-check — self-check (authenticated user)
// GET /api/notifications/hydration-check?cron=1 — batch (Vercel Cron, requires header)
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const isCron = searchParams.get('cron') === '1';

  if (isCron) {
    // Vercel Cron sends Authorization: Bearer <CRON_SECRET>
    const auth_header = req.headers.get('authorization') ?? '';
    const cronSecret  = process.env.CRON_SECRET;
    if (!cronSecret || auth_header !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get all users with push subscriptions
    const { data: users } = await supabase
      .from('push_subscriptions')
      .select('user_id')
      .limit(500);

    const uniqueUsers = [...new Set((users ?? []).map((r) => r.user_id))];
    const results = await Promise.allSettled(uniqueUsers.map(checkUserHydration));
    const notified = results.filter((r) => r.status === 'fulfilled' && r.value === 'notified').length;

    console.log(`[hydration-check] Cron: checked ${uniqueUsers.length} users, notified ${notified}`);
    return NextResponse.json({ checked: uniqueUsers.length, notified });
  }

  // Self-check
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const result = await checkUserHydration(session.user.id);
  return NextResponse.json({ result });
}
