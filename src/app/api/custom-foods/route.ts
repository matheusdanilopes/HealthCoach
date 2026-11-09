/**
 * Alimentos de rótulo (industrializados) do usuário.
 *
 * GET    → lista do usuário
 * POST   { nome, porcao_g, calories, protein?, carbs?, fat? }  valores DA PORÇÃO,
 *        como estão no rótulo; o app converte para 100 g. Nome repetido
 *        (normalizado) atualiza o rótulo existente do mesmo usuário.
 * DELETE ?id=
 *
 * Toda consulta filtra por user_id.
 */
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { sql } from '@/lib/db';
import { per100FromPortion } from '@/lib/nutrition/calc';
import { normalizeFoodName } from '@/lib/nutrition/normalize';
import { validateFoodEntry } from '@/lib/nutrition/validation';

const COLS = 'id, nome, nome_normalizado, kcal_100g, protein_100g, carbs_100g, fat_100g, porcao_g, fonte, created_at';

const optionalNumber = (v: unknown) => {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : NaN;
};

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const rows = await sql.query(
    `SELECT ${COLS} FROM custom_foods WHERE user_id = $1 ORDER BY nome`,
    [session.user.id],
  );
  return NextResponse.json({ foods: rows });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => null);

  const nome = typeof body?.nome === 'string' ? body.nome.trim().slice(0, 200) : '';
  const nomeNormalizado = normalizeFoodName(nome);
  const porcao = Number(body?.porcao_g);
  const calories = Number(body?.calories);
  const protein = optionalNumber(body?.protein);
  const carbs = optionalNumber(body?.carbs);
  const fat = optionalNumber(body?.fat);

  if (!nomeNormalizado) return NextResponse.json({ error: 'Informe o nome do alimento.' }, { status: 400 });
  if (!(porcao > 0 && porcao <= 5000)) return NextResponse.json({ error: 'Informe a porção do rótulo em gramas.' }, { status: 400 });
  if (!(calories >= 0)) return NextResponse.json({ error: 'Informe as kcal da porção.' }, { status: 400 });
  if ([protein, carbs, fat].some((v) => Number.isNaN(v))) {
    return NextResponse.json({ error: 'Macros devem ser números positivos.' }, { status: 400 });
  }

  // As mesmas regras do lançamento: kcal/g > 9 é erro de digitação.
  const validation = validateFoodEntry({ calories, quantity_g: porcao, protein, carbs, fat });
  if (validation.blocked) {
    return NextResponse.json({ error: validation.issues[0].message, validation }, { status: 422 });
  }
  if ([protein, carbs, fat].some((v) => v != null && v > porcao)) {
    return NextResponse.json({ error: 'Um macro não pode passar do peso da porção.' }, { status: 422 });
  }

  const per100 = per100FromPortion(porcao, { calories, protein, carbs, fat });
  const [row] = await sql.query(
    `INSERT INTO custom_foods (user_id, nome, nome_normalizado, kcal_100g, protein_100g, carbs_100g, fat_100g, porcao_g, fonte)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'rotulo')
     ON CONFLICT (user_id, nome_normalizado) DO UPDATE SET
       nome = EXCLUDED.nome, kcal_100g = EXCLUDED.kcal_100g, protein_100g = EXCLUDED.protein_100g,
       carbs_100g = EXCLUDED.carbs_100g, fat_100g = EXCLUDED.fat_100g, porcao_g = EXCLUDED.porcao_g
     RETURNING ${COLS}`,
    [session.user.id, nome, nomeNormalizado, per100.kcal_100g, per100.protein_100g, per100.carbs_100g, per100.fat_100g, porcao],
  );
  // Avisos (ex.: macros que não fecham com as kcal) não impedem: o rótulo é o que está impresso.
  return NextResponse.json({ food: row, validation });
}

export async function DELETE(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  // Lançamentos que usavam o rótulo ficam com custom_food_id NULL (FK ON DELETE SET NULL).
  await sql`DELETE FROM custom_foods WHERE id = ${id} AND user_id = ${session.user.id}`;
  return NextResponse.json({ ok: true });
}
