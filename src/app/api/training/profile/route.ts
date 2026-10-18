import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { supabase } from '@/lib/db';
import { parseTrainingProfile } from '@/lib/training-data';

export async function PUT(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const profile = parseTrainingProfile(body && typeof body === 'object' ? body : {});

  const { error } = await supabase.from('training_profiles').upsert({
    user_id: session.user.id,
    experience: profile.experience,
    days_per_week: profile.daysPerWeek,
    session_minutes: profile.sessionMinutes,
    home_equipment: profile.homeEquipment,
    limitations: profile.limitations || null,
    updated_at: new Date().toISOString(),
  });
  if (error) {
    console.error('[training-profile] save failed:', error.message);
    return NextResponse.json({ error: 'Não foi possível salvar o perfil de treino.' }, { status: 500 });
  }

  return NextResponse.json({ profile });
}
