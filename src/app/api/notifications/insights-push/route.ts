import { NextResponse } from 'next/server';
import { supabase } from '@/lib/db';
import { verifyCronSecret } from '@/lib/cron-auth';
import {
  sendNotificationToUser,
  getUsersWithSubscriptions,
  isBrazilQuietHour,
  brazilHour,
} from '@/lib/notification-sender';

type InsightRow = {
  id: string;
  type: string;
  priority: string;
  title: string;
  message: string;
};

const PRIORITY_EMOJI: Record<string, string> = {
  positivo:     '🌟',
  atencao:      '⚠️',
  recomendacao: '💡',
  informativo:  'ℹ️',
};

async function getUnpushedInsights(userId: string): Promise<InsightRow[]> {
  // Find insights generated in the last 6 hours that haven't been read
  const since = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
  const { data } = await supabase
    .from('ai_insights')
    .select('id, type, priority, title, message')
    .eq('user_id', userId)
    .is('read_at', null)
    .gte('generated_at', since)
    .order('generated_at', { ascending: false })
    .limit(1);
  return (data ?? []) as InsightRow[];
}

async function checkUserInsights(userId: string): Promise<'notified' | 'ok' | 'skipped' | 'no_sub' | 'error' | 'opt_out'> {
  if (isBrazilQuietHour()) return 'skipped';

  const insights = await getUnpushedInsights(userId);
  if (insights.length === 0) return 'ok';

  const insight = insights[0];
  const emoji = PRIORITY_EMOJI[insight.priority] ?? '💡';

  const result = await sendNotificationToUser(
    userId,
    {
      title:    `${emoji} Novo insight para você`,
      body:     insight.title,
      tag:      `hc-insight-${insight.id}`,
      url:      '/dashboard',
      category: 'insight',
    },
    { urgency: 'normal', ttl: 6 * 3600, topic: 'hc-insight' },
  );

  return result;
}

// GET /api/notifications/insights-push?cron=1
export async function GET(req: Request) {
  const authErr = verifyCronSecret(req);
  if (authErr) return authErr;

  const bHour = brazilHour();
  if (isBrazilQuietHour()) {
    return NextResponse.json({ skipped: true, reason: 'quiet_hours', brazilHour: bHour });
  }

  const uniqueUsers = await getUsersWithSubscriptions();
  const results = await Promise.allSettled(
    uniqueUsers.map((uid) => checkUserInsights(uid)),
  );

  const counts = { notified: 0, ok: 0, skipped: 0, no_sub: 0, error: 0, opt_out: 0 };
  results.forEach((r) => {
    if (r.status === 'fulfilled') {
      const k = r.value as keyof typeof counts;
      if (k in counts) counts[k]++;
    } else {
      counts.error++;
    }
  });

  console.info(`[insights-push] cron done brazilHour=${bHour} users=${uniqueUsers.length}`, counts);
  return NextResponse.json({ checked: uniqueUsers.length, brazilHour: bHour, ...counts });
}
