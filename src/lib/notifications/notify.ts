import { supabase } from '@/lib/db';
import type { PushPayload, NotificationCategory } from './types';

export async function sendToUser(userId: string, payload: PushPayload): Promise<void> {
  const { data: prefs } = await supabase
    .from('notification_preferences')
    .select('enabled, imports, processing, updates')
    .eq('user_id', userId)
    .single();

  if (prefs && !prefs.enabled) return;
  if (prefs && !prefs[payload.category as NotificationCategory]) return;

  await supabase.from('notification_queue').insert({
    user_id: userId,
    title: payload.title,
    body: payload.body ?? null,
    url: payload.url ?? '/',
    category: payload.category,
  });
}
