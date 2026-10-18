import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';

export async function GET() {
  const checks: Record<string, string> = {};

  checks.DATABASE_URL = process.env.DATABASE_URL ? 'set' : 'MISSING';
  checks.AUTH_SECRET = process.env.AUTH_SECRET ? 'set' : 'MISSING';

  try {
    const [{ count }] = await sql`SELECT count(*) AS count FROM users`;
    checks.users_table = `ok (${count ?? 0} rows)`;
  } catch (err) {
    checks.users_table = `error: ${err instanceof Error ? err.message : String(err)}`;
  }

  const allOk = !Object.values(checks).some((v) => v.includes('MISSING') || v.includes('error'));

  return NextResponse.json({ ok: allOk, checks }, { status: allOk ? 200 : 500 });
}
