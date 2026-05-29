import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { supabase } from '@/lib/db';
import { sendPushToSubscriptions, type PushSendOptions } from '@/lib/webpush';
import { brazilToday } from '@/lib/timezone';

async function getTotalHydration(
  userId: string,
  date: string,
): Promise<{ totalMl: number; lastLogAt: string | null }> {
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

  const allEntries = [
    ...(waterData ?? []).map((r: { created_at: string }) => r.created_at),
    ...(foodData  ?? []).map((r: { created_at: string }) => r.created_at),
  ].sort().reverse();

  return { totalMl: waterMl + mealMl, lastLogAt: allEntries[0] ?? null };
}

function buildNotification(
  totalMl: number,
  target: number,
  bHour: number,
): { title: string; body: string; opts: PushSendOptions } {
  const remaining = Math.max(0, target - totalMl);
  const pct       = target > 0 ? Math.round((totalMl / target) * 100) : 0;
  const isEvening = bHour >= 19;

  if (isEvening && pct < 50) {
    return {
      title: 'Atenção com a hidratação 💧',
      body:  `Noite chegando e você só tomou ${pct}% da meta. Faltam ${remaining}ml — tente beber agora!`,
      opts:  { urgency: 'high', topic: 'hc-hydration', ttl: 4 * 3600 },
    };
  }

  if (isEvening) {
    return {
      title: 'Hidratação do dia quase completa 💧',
      body:  `Faltam apenas ${remaining}ml para completar a meta de hoje.`,
      opts:  { urgency: 'high', topic: 'hc-hydration', ttl: 4 * 3600 },
    };
  }

  return {
    title: 'Hora de beber água 💧',
    body:  `Você está há mais de 2h sem se hidratar. Faltam ${remaining}ml para a meta diária.`,
    opts:  { urgency: 'high', topic: 'hc-hydration', ttl: 8 * 3600 },
  };
}

async function checkUserHydration(userId: string): Promise<'notified' | 'ok' | 'no_sub' | 'skipped' | 'error'> {
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

  const bDate = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  const bHour = bDate.getHours();

  // Quiet hours: 22:00–07:00 Brazil time
  if (bHour >= 22 || bHour < 7) return 'skipped';

  const target = profile?.target_water_ml ?? 2500;
  const { totalMl, lastLogAt } = await getTotalHydration(userId, brazilToday());

  // Already met goal
  if (totalMl >= target) return 'ok';

  const minSince = lastLogAt
    ? Math.floor((Date.now() - new Date(lastLogAt).getTime()) / 60_000)
    : 999;

  // Only notify if >2h without any hydration event
  if (minSince <= 120) return 'ok';

  const { title, body, opts } = buildNotification(totalMl, target, bHour);

  try {
    const { sent, expired, failed } = await sendPushToSubscriptions(
      subs.map((s) => ({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } })),
      { title, body, tag: 'hc-hydration', url: '/dashboard' },
      opts,
    );

    if (expired.length > 0) {
      await supabase
        .from('push_subscriptions')
        .delete()
        .in('endpoint', expired)
        .eq('user_id', userId);
    }

    if (sent > 0) {
      console.info(`[hydration-check] notified userId=${userId} sent=${sent} expired=${expired} failed=${failed}`);
      return 'notified';
    }

    if (failed > 0) {
      console.error(`[hydration-check] all sends failed userId=${userId} failed=${failed}`);
      return 'error';
    }

    return 'ok';
  } catch (err) {
    console.error(`[hydration-check] push error userId=${userId}:`, err instanceof Error ? err.message : err);
    return 'error';
  }
}

// GET /api/notifications/hydration-check?cron=1  — Vercel Cron (requires Authorization header)
// GET /api/notifications/hydration-check          — manual self-check (authenticated user)
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const isCron = searchParams.get('cron') === '1';

  if (isCron) {
    const cronSecret = process.env.CRON_SECRET;
    const authHeader = req.headers.get('authorization') ?? '';
    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: rows } = await supabase
      .from('push_subscriptions')
      .select('user_id')
      .limit(500);

    const uniqueUsers: string[] = [...new Set((rows ?? []).map((r: { user_id: string }) => r.user_id))];
    const results = await Promise.allSettled(uniqueUsers.map((uid) => checkUserHydration(uid)));

    const counts = { notified: 0, ok: 0, skipped: 0, no_sub: 0, error: 0 };
    results.forEach((r) => {
      if (r.status === 'fulfilled') counts[r.value]++;
      else counts.error++;
    });

    console.info(`[hydration-check] cron done users=${uniqueUsers.length}`, counts);
    return NextResponse.json({ checked: uniqueUsers.length, ...counts });
  }

  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const result = await checkUserHydration(session.user.id);
  return NextResponse.json({ result });
}
