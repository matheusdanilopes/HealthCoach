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
    const [info] = await sql<{ db: string; schema: string }>`
      SELECT current_database() AS db, current_schema() AS schema
    `;
    checks.current_database = info.db;
    checks.current_schema = info.schema;
  } catch (err) {
    checks.current_database = err instanceof Error ? err.message : String(err);
  }

  try {
    const rows = await sql<{ tablename: string }>`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename
    `;
    checks.tables_in_public = rows.map(r => r.tablename).join(', ') || '(nenhuma)';
  } catch (err) {
    checks.tables_in_public = err instanceof Error ? err.message : String(err);
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
