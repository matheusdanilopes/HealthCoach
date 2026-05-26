import { NextResponse } from 'next/server';
import { supabase } from '@/lib/db';
import bcrypt from 'bcryptjs';
import {
  calculateAge,
  calculateTMB,
  calculateTDEE,
  calculateTargetCalories,
  calculateWaterTarget,
} from '@/lib/calculations';

const VALID_ACTIVITY_LEVELS = ['sedentary', 'moderate', 'active'];
const VALID_SEX = ['male', 'female'];

export async function POST(req: Request) {
  try {
    const { email, password, fullName, birthDate, sex, weight, height, activityLevel } =
      await req.json();

    if (!email || !password || !fullName || !birthDate || !sex || !weight || !height || !activityLevel) {
      return NextResponse.json({ error: 'Todos os campos são obrigatórios.' }, { status: 400 });
    }
    if (typeof password !== 'string' || password.length < 6) {
      return NextResponse.json({ error: 'Senha deve ter pelo menos 6 caracteres.' }, { status: 400 });
    }
    if (!VALID_SEX.includes(sex)) {
      return NextResponse.json({ error: 'Sexo inválido.' }, { status: 400 });
    }
    if (!VALID_ACTIVITY_LEVELS.includes(activityLevel)) {
      return NextResponse.json({ error: 'Nível de atividade inválido.' }, { status: 400 });
    }

    const w = parseFloat(weight);
    const h = parseFloat(height);
    const age = calculateAge(birthDate);

    if (isNaN(w) || w <= 0 || isNaN(h) || h <= 0 || isNaN(age) || age <= 0 || age > 130) {
      return NextResponse.json({ error: 'Dados de perfil inválidos.' }, { status: 400 });
    }

    const { data: existing } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ error: 'Email já cadastrado.' }, { status: 409 });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const tmb = calculateTMB(w, h, age, sex);
    const tdee = calculateTDEE(tmb, activityLevel as 'sedentary' | 'moderate' | 'active');
    const targetCal = calculateTargetCalories(tdee);
    const targetWater = calculateWaterTarget(w);
    const today = new Date().toISOString().split('T')[0];

    const { data: newUser, error: insertError } = await supabase
      .from('users')
      .insert({
        email,
        password_hash: passwordHash,
        full_name: fullName,
        birth_date: birthDate,
        sex,
        current_weight: w,
        height_cm: h,
        activity_level: activityLevel,
        tdee,
        target_calories: targetCal,
        target_water_ml: targetWater,
      })
      .select('id')
      .single();

    if (insertError) throw insertError;
    if (!newUser?.id) {
      return NextResponse.json({ error: 'Erro interno.' }, { status: 500 });
    }

    try {
      await supabase.from('weight_logs').upsert({
        user_id: newUser.id,
        weight_kg: w,
        log_date: today,
      });
    } catch (weightErr) {
      console.error('weight_log insert failed (non-fatal):', weightErr);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Register error:', message, err);
    if (message.includes('duplicate key') || message.includes('unique') || message.includes('already exists')) {
      return NextResponse.json({ error: 'Email já cadastrado.' }, { status: 409 });
    }
    if (message.includes('DATABASE_URL') || message.includes('connection') || message.includes('database') || message.includes('relation')) {
      return NextResponse.json({ error: 'Serviço temporariamente indisponível. Tente novamente em instantes.' }, { status: 503 });
    }
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 });
  }
}
