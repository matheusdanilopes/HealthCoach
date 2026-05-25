import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';

export async function GET() {
  const checks: Record<string, string> = {};

  checks.database_url = process.env.DATABASE_URL ? 'SET' : 'MISSING';
  checks.auth_secret = process.env.AUTH_SECRET ? 'SET' : 'MISSING';

  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ ok: false, checks, error: 'DATABASE_URL não configurado' }, { status: 503 });
  }

  try {
    await sql`SELECT 1 AS ok`;
    checks.db_connection = 'OK';
  } catch (err) {
    checks.db_connection = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, checks }, { status: 503 });
  }

  try {
    await sql`SELECT COUNT(*) FROM users`;
    checks.table_users = 'OK';
  } catch (err) {
    checks.table_users = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, checks }, { status: 503 });
  }

  return NextResponse.json({ ok: true, checks });
}
