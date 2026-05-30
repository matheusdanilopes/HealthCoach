import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { supabase } from '@/lib/db';
import BodyMeasurementsClient from './BodyMeasurementsClient';
import type { BodyMeasurements } from '@/types';

const NUM_FIELDS = [
  'waist','neck','hips','chest',
  'right_arm','left_arm',
  'right_thigh','left_thigh',
  'right_calf','left_calf',
] as const;

function parseRow(r: Record<string, unknown>): BodyMeasurements {
  const result: BodyMeasurements = {
    id: r.id as string,
    user_id: r.user_id as string,
    date: r.date as string,
    waist: null, neck: null, hips: null, chest: null,
    right_arm: null, left_arm: null,
    right_thigh: null, left_thigh: null,
    right_calf: null, left_calf: null,
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
  };
  for (const f of NUM_FIELDS) {
    if (r[f] != null) result[f] = parseFloat(String(r[f]));
  }
  return result;
}

export default async function BodyMeasurementsPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const { data } = await supabase
    .from('body_measurements')
    .select('*')
    .eq('user_id', session.user.id)
    .order('date', { ascending: false });

  const measurements: BodyMeasurements[] = (data ?? []).map(parseRow);

  return <BodyMeasurementsClient initialMeasurements={measurements} />;
}
