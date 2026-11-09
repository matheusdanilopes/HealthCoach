/**
 * Lista registros antigos de food_logs suspeitos, por usuário, pelas mesmas
 * regras da validação (src/lib/nutrition/validation.ts). SOMENTE LEITURA:
 * todas as consultas rodam em transação READ ONLY e filtram por user_id.
 *
 * Uso:
 *   DATABASE_URL=... npm run audit:food-logs
 *   DATABASE_URL=... npm run audit:food-logs -- --user <uuid>   (um usuário)
 *   DATABASE_URL=... npm run audit:food-logs -- --json          (saída JSON)
 *
 * Rode primeiro contra um branch do Neon. Registros antigos não têm
 * quantity_g: as gramas vêm do nome ("Arroz (100g)") quando existem, e a
 * referência é achada pelo nome — o relatório indica quando foi assim.
 */
import { sql, type Query, type Row } from '@/lib/db';
import { auditFoodLogs, type AuditLog, type RefRow } from '@/lib/nutrition/audit';

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const onlyUser = args.includes('--user') ? args[args.indexOf('--user') + 1] : null;

const num = (v: unknown) => (v == null ? null : Number(v));
const toRef = (source: 'taco' | 'rotulo') => (r: Record<string, unknown>): RefRow => ({
  id: r.id as number | string,
  nome: String(r.nome),
  nome_normalizado: r.nome_normalizado as string,
  source,
  kcal_100g: Number(r.kcal_100g),
  protein_100g: num(r.protein_100g),
  carbs_100g: num(r.carbs_100g),
  fat_100g: num(r.fat_100g),
});

async function readOnly<T extends unknown[]>(queries: Query<Row>[]): Promise<T> {
  return (await sql.transaction(queries, { readOnly: true })) as unknown as T;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('Defina DATABASE_URL (de preferência de um branch do Neon).');
    process.exit(1);
  }

  const [users, tacoRows] = await readOnly<[Record<string, unknown>[], Record<string, unknown>[]]>([
    onlyUser
      ? sql.query('SELECT id, full_name FROM users WHERE id = $1', [onlyUser]) as Query<Row>
      : sql.query('SELECT id, full_name FROM users ORDER BY created_at') as Query<Row>,
    sql.query('SELECT id, nome, nome_normalizado, kcal_100g, protein_100g, carbs_100g, fat_100g FROM taco_foods') as Query<Row>,
  ]);
  const taco = tacoRows.map(toRef('taco'));

  const report = [];
  for (const user of users) {
    const userId = String(user.id);
    const [logRows, customRows] = await readOnly<[Record<string, unknown>[], Record<string, unknown>[]]>([
      sql.query(
        `SELECT id, food_name, log_date, calories, protein, carbs, fat, quantity_g, taco_food_id, custom_food_id
         FROM food_logs WHERE user_id = $1 AND calories > 0 ORDER BY log_date, created_at`,
        [userId],
      ) as Query<Row>,
      sql.query(
        'SELECT id, nome, nome_normalizado, kcal_100g, protein_100g, carbs_100g, fat_100g FROM custom_foods WHERE user_id = $1',
        [userId],
      ) as Query<Row>,
    ]);
    const logs: AuditLog[] = logRows.map((r) => ({
      id: String(r.id), food_name: String(r.food_name), log_date: String(r.log_date),
      calories: Number(r.calories), protein: num(r.protein), carbs: num(r.carbs), fat: num(r.fat),
      quantity_g: num(r.quantity_g), taco_food_id: num(r.taco_food_id), custom_food_id: (r.custom_food_id as string) ?? null,
    }));
    const findings = auditFoodLogs(logs, taco, customRows.map(toRef('rotulo')));
    const count = (code: string) => findings.filter((f) => f.result.issues.some((i) => i.code === code)).length;
    report.push({
      user_id: userId,
      nome: user.full_name,
      registros_analisados: logs.length,
      suspeitos: findings.length,
      erros_kcal_por_g: count('kcal_density'),
      avisos_macros: count('macro_mismatch'),
      avisos_desvio_referencia: count('reference_deviation'),
      itens: findings.map((f) => ({
        id: f.log.id,
        data: f.log.log_date,
        alimento: f.log.food_name,
        kcal: f.log.calories,
        macros: { p: f.log.protein, c: f.log.carbs, g: f.log.fat },
        gramas: f.grams,
        gramas_de: f.gramsFrom,
        referencia: f.reference ? `${f.reference.nome} (${f.reference.source}, ${f.reference.kcal_100g} kcal/100 g)` : null,
        referencia_de: f.referenceFrom,
        status: f.result.status,
        motivos: f.result.issues.map((i) => `${i.severity === 'error' ? 'ERRO' : 'AVISO'}: ${i.message}`),
      })),
    });
  }

  if (asJson) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  for (const u of report) {
    console.log(`\n=== ${u.nome} (${u.user_id}) ===`);
    console.log(`${u.registros_analisados} registros com kcal > 0 · ${u.suspeitos} suspeitos ` +
      `(${u.erros_kcal_por_g} kcal/g > 9 · ${u.avisos_macros} macros · ${u.avisos_desvio_referencia} desvio > 30%)`);
    for (const i of u.itens) {
      const g = i.gramas ? `${i.gramas} g${i.gramas_de === 'nome' ? ' (do nome)' : ''}` : 'sem gramas';
      console.log(`\n  ${i.data}  ${i.alimento}  — ${i.kcal} kcal, ${g}`);
      if (i.referencia) console.log(`    referência${i.referencia_de === 'nome' ? ' aproximada pelo nome' : ''}: ${i.referencia}`);
      for (const m of i.motivos) console.log(`    ${m}`);
    }
  }
  console.log('\nNada foi alterado (consultas somente leitura).');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
