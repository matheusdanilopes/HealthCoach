import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { supabase } from '@/lib/db';
import BodyMetricsClient from './BodyMetricsClient';
import type { BodyMetrics } from '@/types';

export default async function BodyMetricsPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const { data } = await supabase
    .from('body_metrics')
    .select('*')
    .eq('user_id', session.user.id)
    .order('date', { ascending: false });

  const metrics: BodyMetrics[] = (data ?? []).map((r) => ({
    id: r.id,
    user_id: r.user_id,
    date: r.date,
    weight: parseFloat(String(r.weight)),
    muscle_mass: r.muscle_mass != null ? parseFloat(String(r.muscle_mass)) : null,
    body_fat: r.body_fat != null ? parseFloat(String(r.body_fat)) : null,
    visceral_fat: r.visceral_fat != null ? parseFloat(String(r.visceral_fat)) : null,
    created_at: r.created_at,
    updated_at: r.updated_at,
  }));

  return <BodyMetricsClient initialMetrics={metrics} />;
}
