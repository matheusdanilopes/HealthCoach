import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
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

    const existing = await sql`SELECT id FROM users WHERE email = ${email}`;
    if (existing.length > 0) {
      return NextResponse.json({ error: 'Email já cadastrado.' }, { status: 409 });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const tmb = calculateTMB(w, h, age, sex);
    const tdee = calculateTDEE(tmb, activityLevel as 'sedentary' | 'moderate' | 'active');
    const targetCal = calculateTargetCalories(tdee);
    const targetWater = calculateWaterTarget(w);

    const today = new Date().toISOString().split('T')[0];

    const rows = await sql<{ id: string }>`
      INSERT INTO users (
        email, password_hash, full_name, birth_date, sex,
        current_weight, height_cm, activity_level,
        tdee, target_calories, target_water_ml
      ) VALUES (
        ${email}, ${passwordHash}, ${fullName}, ${birthDate}, ${sex},
        ${w}, ${h}, ${activityLevel},
        ${tdee}, ${targetCal}, ${targetWater}
      ) RETURNING id
    `;

    const newUser = rows[0];
    if (!newUser?.id) {
      return NextResponse.json({ error: 'Erro interno.' }, { status: 500 });
    }

    try {
      await sql`
        INSERT INTO weight_logs (user_id, weight_kg, log_date)
        VALUES (${newUser.id}, ${w}, ${today})
        ON CONFLICT (user_id, log_date) DO NOTHING
      `;
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
