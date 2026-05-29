import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { supabase } from '@/lib/db';
import { sendPushToSubscriptions } from '@/lib/webpush';
import { brazilToday } from '@/lib/timezone';

// Returns total hydration for a user on a given date:
// direct water_logs + meal-sourced hydration from food_logs
async function getTotalHydration(userId: string, date: string): Promise<{ totalMl: number; lastLogAt: string | null }> {
  const [{ data: waterData }, { data: foodData }] = await Promise.all([
    supabase
      .from('water_logs')
      .select('amount_ml, created_at')
      .eq('user_id', userId)
      .eq('log_date', date)
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('food_logs')
      .select('hydration_ml, created_at')
      .eq('user_id', userId)
      .eq('log_date', date)
      .gt('hydration_ml', 0),
  ]);

  const waterMl = (waterData ?? []).reduce((s: number, r: { amount_ml: number }) => s + r.amount_ml, 0);
  const mealMl  = (foodData  ?? []).reduce((s: number, r: { hydration_ml: number }) => s + r.hydration_ml, 0);

  // Last hydration event (water log or food log with hydration)
  const waterEntries = (waterData ?? []).map((r: { created_at: string }) => r.created_at);
  const foodEntries  = (foodData  ?? []).map((r: { created_at: string }) => r.created_at);
  const allEntries   = [...waterEntries, ...foodEntries].sort().reverse();
  const lastLogAt    = allEntries[0] ?? null;

  return { totalMl: waterMl + mealMl, lastLogAt };
}

async function checkUserHydration(userId: string): Promise<'notified' | 'ok' | 'no_sub' | 'skipped'> {
  const [{ data: subs }, { data: profile }] = await Promise.all([
    supabase
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth')
      .eq('user_id', userId),
    supabase
      .from('users')
      .select('target_water_ml, full_name')
      .eq('id', userId)
      .single(),
  ]);

  if (!subs || subs.length === 0) return 'no_sub';

  // Quiet hours check (Brazil time)
  const bHour = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' })).getHours();
  if (bHour >= 22 || bHour < 7) return 'skipped';

  const target = profile?.target_water_ml ?? 2500;
  const { totalMl, lastLogAt } = await getTotalHydration(userId, brazilToday());

  const minSince = lastLogAt
    ? Math.floor((Date.now() - new Date(lastLogAt).getTime()) / 60_000)
    : 999;

  // Already met goal — skip notification
  if (totalMl >= target) return 'ok';

  // Only notify if >2h without any hydration event (water or meal)
  if (minSince <= 120) return 'ok';

  const title = 'Hora de beber água 💧';
  const body  = 'Você está há mais de 2h sem se hidratar. Cuide-se!';

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
    const auth_header = req.headers.get('authorization') ?? '';
    const cronSecret  = process.env.CRON_SECRET;
    if (!cronSecret || auth_header !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

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

  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const result = await checkUserHydration(session.user.id);
  return NextResponse.json({ result });
}
