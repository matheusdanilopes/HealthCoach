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

export async function POST(req: Request) {
  try {
    const { email, password, fullName, birthDate, sex, weight, height, activityLevel } =
      await req.json();

    if (!email || !password || !fullName || !birthDate || !sex || !weight || !height || !activityLevel) {
      return NextResponse.json({ error: 'Todos os campos são obrigatórios.' }, { status: 400 });
    }

    const w = parseFloat(weight);
    const h = parseFloat(height);
    const age = calculateAge(birthDate);

    if (isNaN(w) || isNaN(h) || isNaN(age) || w <= 0 || h <= 0 || age <= 0) {
      return NextResponse.json({ error: 'Dados de saúde inválidos.' }, { status: 400 });
    }

    const existing = await sql`SELECT id FROM users WHERE email = ${email}`;
    if (existing.length > 0) {
      return NextResponse.json({ error: 'Email já cadastrado.' }, { status: 409 });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const tmb = calculateTMB(w, h, age, sex);
    const tdee = calculateTDEE(tmb, activityLevel);
    const targetCal = calculateTargetCalories(tdee);
    const targetWater = calculateWaterTarget(w);

    const today = new Date().toISOString().split('T')[0];

    const [newUser] = await sql<{ id: string }>`
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

    await sql`
      INSERT INTO weight_logs (user_id, weight_kg, log_date)
      VALUES (${newUser.id}, ${w}, ${today})
      ON CONFLICT (user_id, log_date) DO NOTHING
    `;

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Register error:', message, err);
    if (message.includes('duplicate key') || message.includes('unique') || message.includes('already exists')) {
      return NextResponse.json({ error: 'Email já cadastrado.' }, { status: 409 });
    }
    // Temporary: expose error detail to help diagnose the issue
    return NextResponse.json({ error: `Erro interno: ${message.substring(0, 200)}` }, { status: 500 });
  }
}
