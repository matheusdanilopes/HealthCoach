import { NextResponse } from 'next/server';
import { supabase } from '@/lib/db';
import { brazilToday } from '@/lib/timezone';
import { verifyCronSecret } from '@/lib/cron-auth';
import {
  sendNotificationToUser,
  getUsersWithSubscriptions,
  isBrazilQuietHour,
  brazilHour,
} from '@/lib/notification-sender';
import { sendPushToSubscriptions } from '@/lib/webpush';
import { logNotification } from '@/lib/notification-logger';

// ─── Hydration ────────────────────────────────────────────────────────────────

async function getTotalHydration(userId: string, date: string) {
  const [{ data: water }, { data: food }] = await Promise.all([
    supabase.from('water_logs').select('amount_ml, created_at').eq('user_id', userId).eq('log_date', date).limit(50),
    supabase.from('food_logs').select('hydration_ml, created_at').eq('user_id', userId).eq('log_date', date).gt('hydration_ml', 0),
  ]);
  const waterMl = (water ?? []).reduce((s: number, r: { amount_ml: number }) => s + r.amount_ml, 0);
  const mealMl  = (food  ?? []).reduce((s: number, r: { hydration_ml: number }) => s + r.hydration_ml, 0);
  const all = [
    ...(water ?? []).map((r: { created_at: string }) => r.created_at),
    ...(food  ?? []).map((r: { created_at: string }) => r.created_at),
  ].sort().reverse();
  return { totalMl: waterMl + mealMl, lastLogAt: all[0] ?? null };
}

async function runHydrationCheck(userId: string): Promise<string> {
  const bHour = brazilHour();
  const { data: profile } = await supabase.from('users').select('target_water_ml').eq('id', userId).single();
  const target = (profile as { target_water_ml: number } | null)?.target_water_ml ?? 2500;
  const { totalMl, lastLogAt } = await getTotalHydration(userId, brazilToday());
  if (totalMl >= target) return 'ok';
  const minSince = lastLogAt ? Math.floor((Date.now() - new Date(lastLogAt).getTime()) / 60_000) : 999;
  if (minSince <= 120) return 'ok';

  const remaining = Math.max(0, target - totalMl);
  const pct = target > 0 ? Math.round((totalMl / target) * 100) : 0;
  const isEvening = bHour >= 19;

  let title: string, body: string;
  if (isEvening && pct < 50) {
    title = 'Atenção com a hidratação 💧';
    body  = `Noite chegando e você só tomou ${pct}% da meta. Faltam ${remaining}ml!`;
  } else if (isEvening) {
    title = 'Hidratação do dia quase completa 💧';
    body  = `Faltam apenas ${remaining}ml para completar a meta de hoje.`;
  } else {
    title = 'Hora de beber água 💧';
    body  = `Você está há mais de 2h sem se hidratar. Faltam ${remaining}ml para a meta.`;
  }

  return await sendNotificationToUser(userId, { title, body, tag: 'hc-hydration', url: '/dashboard', category: 'hydration' },
    { urgency: 'high', topic: 'hc-hydration', ttl: isEvening ? 4 * 3600 : 8 * 3600 });
}

// ─── Meal reminders ───────────────────────────────────────────────────────────

async function runMealReminders(userId: string): Promise<string> {
  const bHour = brazilHour();
  const windows = [
    { key: 'breakfast', label: 'café da manhã', tag: 'hc-meal-breakfast', minH: 8,  maxH: 10 },
    { key: 'lunch',     label: 'almoço',        tag: 'hc-meal-lunch',     minH: 11, maxH: 14 },
    { key: 'snack',     label: 'lanche',         tag: 'hc-meal-snack',     minH: 15, maxH: 17 },
    { key: 'dinner',    label: 'jantar',         tag: 'hc-meal-dinner',    minH: 18, maxH: 21 },
  ];
  const win = windows.find((w) => bHour >= w.minH && bHour <= w.maxH);
  if (!win) return 'skipped';

  const { data } = await supabase.from('food_logs').select('meal_type, calories').eq('user_id', userId).eq('log_date', brazilToday());
  const meals = (data ?? []) as Array<{ meal_type: string; calories: number }>;
  if (meals.some((m) => m.meal_type === win.key)) return 'ok';
  const total = meals.reduce((s, m) => s + m.calories, 0);

  return await sendNotificationToUser(userId, {
    title:    `Hora de registrar ${win.label} 🍽️`,
    body:     total > 0 ? `Você já registrou ${total} kcal hoje. Complete o registro!` : 'Registre suas refeições para acompanhar a nutrição.',
    tag:      win.tag,
    url:      '/diary',
    category: 'meal',
  }, { urgency: 'normal', ttl: 3600 });
}

// ─── Workout reminders ────────────────────────────────────────────────────────

async function runWorkoutReminders(userId: string): Promise<string> {
  const bHour = brazilHour();
  const inAM = bHour >= 7  && bHour <= 9;
  const inPM = bHour >= 17 && bHour <= 19;
  if (!inAM && !inPM) return 'skipped';

  const { data } = await supabase.from('food_logs').select('id').eq('user_id', userId).eq('log_date', brazilToday()).lt('calories', 0).limit(1);
  if ((data ?? []).length > 0) return 'ok';

  return await sendNotificationToUser(userId, {
    title:    inAM ? 'Bom dia! Hora de se mover 💪' : 'Que tal um treino hoje? 🏃',
    body:     inAM ? 'Comece o dia com energia! Registre seu treino.' : 'Você ainda não registrou atividade hoje.',
    tag:      'hc-workout',
    url:      '/dashboard',
    category: 'workout',
  }, { urgency: 'normal', ttl: 3 * 3600, topic: 'hc-workout' });
}

// ─── Insights push ────────────────────────────────────────────────────────────

async function runInsightsPush(userId: string): Promise<string> {
  const since = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
  const { data } = await supabase.from('ai_insights').select('id, priority, title').eq('user_id', userId)
    .is('read_at', null).gte('generated_at', since).order('generated_at', { ascending: false }).limit(1);
  const rows = (data ?? []) as Array<{ id: string; priority: string; title: string }>;
  if (rows.length === 0) return 'ok';

  const emoji: Record<string, string> = { positivo: '🌟', atencao: '⚠️', recomendacao: '💡', informativo: 'ℹ️' };
  const insight = rows[0];
  return await sendNotificationToUser(userId, {
    title:    `${emoji[insight.priority] ?? '💡'} Novo insight para você`,
    body:     insight.title,
    tag:      `hc-insight-${insight.id}`,
    url:      '/dashboard',
    category: 'insight',
  }, { urgency: 'normal', ttl: 6 * 3600, topic: 'hc-insight' });
}

// ─── Retry queue ──────────────────────────────────────────────────────────────

async function runRetryQueue(): Promise<{ success: number; failed: number; exhausted: number }> {
  const counts = { success: 0, failed: 0, exhausted: 0 };
  const { data } = await supabase.from('notification_retry_queue')
    .select('id, user_id, category, payload, attempts, max_attempts')
    .lte('next_retry_at', new Date().toISOString())
    .order('next_retry_at', { ascending: true }).limit(50);

  type RetryRow = { id: string; user_id: string; category: string; payload: { notif: { title: string; body: string; tag: string; url: string; category: string }; opts: object }; attempts: number; max_attempts: number };
  const queue = (data ?? []) as RetryRow[];

  for (const item of queue) {
    const newAttempts = item.attempts + 1;
    if (newAttempts > item.max_attempts) {
      await supabase.from('notification_retry_queue').delete().eq('id', item.id);
      counts.exhausted++;
      continue;
    }
    const result = await sendNotificationToUser(item.user_id, item.payload.notif as Parameters<typeof sendNotificationToUser>[1], item.payload.opts as Parameters<typeof sendNotificationToUser>[2], false);
    if (result === 'notified') {
      await supabase.from('notification_retry_queue').delete().eq('id', item.id);
      counts.success++;
    } else {
      const delay = Math.pow(2, newAttempts) * 60;
      await supabase.from('notification_retry_queue')
        .update({ attempts: newAttempts, next_retry_at: new Date(Date.now() + delay * 1000).toISOString(), last_error: result })
        .eq('id', item.id);
      counts.failed++;
    }
  }
  return counts;
}

// ─── Cleanup (weekly — runs every Sunday when called) ─────────────────────────

async function runCleanup(): Promise<{ stale: number; oldLogs: number }> {
  const day = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' })).getDay();
  if (day !== 0) return { stale: 0, oldLogs: 0 }; // only on Sundays

  const sixtyDaysAgo  = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

  const [{ data: stale }, { data: logs }] = await Promise.all([
    supabase.from('push_subscriptions').delete().lt('last_used_at', sixtyDaysAgo).select('id'),
    supabase.from('notification_logs').delete().lt('sent_at', ninetyDaysAgo).select('id'),
  ]);
  return { stale: (stale ?? []).length, oldLogs: (logs ?? []).length };
}

// ─── Unified cron handler ─────────────────────────────────────────────────────

// GET /api/notifications/run?t=am  — 8:00 AM Brazil (11:00 UTC)
// GET /api/notifications/run?t=pm  — 6:00 PM Brazil (21:00 UTC)
export async function GET(req: Request) {
  const authErr = verifyCronSecret(req);
  if (authErr) return authErr;

  if (isBrazilQuietHour()) {
    return NextResponse.json({ skipped: true, reason: 'quiet_hours' });
  }

  const users = await getUsersWithSubscriptions();
  const counts = { hydration: { notified: 0, ok: 0, skipped: 0, error: 0 }, meal: { notified: 0, ok: 0, skipped: 0, error: 0 }, workout: { notified: 0, ok: 0, skipped: 0, error: 0 }, insight: { notified: 0, ok: 0, skipped: 0, error: 0 } };

  const chunkSize = 50;
  for (let ci = 0; ci < users.length; ci += chunkSize) {
    const chunk = users.slice(ci, ci + chunkSize);
    await Promise.allSettled(chunk.map(async (uid) => {
      const [h, m, w, i] = await Promise.allSettled([
        runHydrationCheck(uid),
        runMealReminders(uid),
        runWorkoutReminders(uid),
        runInsightsPush(uid),
      ]);
      for (const [key, res] of [['hydration', h], ['meal', m], ['workout', w], ['insight', i]] as const) {
        const val = res.status === 'fulfilled' ? res.value : 'error';
        const bucket = counts[key];
        if (val === 'notified') bucket.notified++;
        else if (val === 'ok')  bucket.ok++;
        else if (val === 'skipped' || val === 'opt_out' || val === 'no_sub') bucket.skipped++;
        else bucket.error++;
      }
    }));
  }

  const retry   = await runRetryQueue();
  const cleanup = await runCleanup();

  const bHour = brazilHour();
  console.info(`[cron-run] brazilHour=${bHour} users=${users.length}`, counts, { retry, cleanup });

  return NextResponse.json({ brazilHour: bHour, users: users.length, counts, retry, cleanup });
}

// Keep unused imports happy
void sendPushToSubscriptions;
void logNotification;
