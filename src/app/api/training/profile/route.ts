import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { insertInto } from '@/lib/db';
import { parseTrainingProfile } from '@/lib/training-data';

export async function PUT(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const profile = parseTrainingProfile(body && typeof body === 'object' ? body : {});

  try {
    await insertInto('training_profiles', {
      user_id: session.user.id,
      experience: profile.experience,
      days_per_week: profile.daysPerWeek,
      session_minutes: profile.sessionMinutes,
      home_equipment: profile.homeEquipment,
      limitations: profile.limitations || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });
  } catch (err) {
    console.error('[training-profile] save failed:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Não foi possível salvar o perfil de treino.' }, { status: 500 });
  }

  return NextResponse.json({ profile });
}
