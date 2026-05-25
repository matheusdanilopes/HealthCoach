import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';

export async function GET() {
  const checks: Record<string, string> = {};

  // Check environment variables
  checks.DATABASE_URL = process.env.DATABASE_URL
    ? `set (starts with: ${process.env.DATABASE_URL.slice(0, 30)}...)`
    : 'MISSING';
  checks.AUTH_SECRET = process.env.AUTH_SECRET ? 'set' : 'MISSING';

  // Check DB connection and tables
  try {
    const tables = await sql<{ table_name: string }>`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `;
    checks.db_connection = 'ok';
    checks.db_tables = tables.map((t) => t.table_name).join(', ') || 'none';
  } catch (err) {
    checks.db_connection = `error: ${err instanceof Error ? err.message : String(err)}`;
    checks.db_tables = 'unknown';
  }

  const allOk = !Object.values(checks).some((v) => v.includes('MISSING') || v.includes('error'));

  return NextResponse.json({ ok: allOk, checks }, { status: allOk ? 200 : 500 });
}
