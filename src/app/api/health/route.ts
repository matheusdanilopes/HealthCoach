import { NextResponse } from 'next/server';
import { supabase } from '@/lib/db';

export async function GET() {
  const checks: Record<string, string> = {};

  checks.SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
    ? `set (${process.env.NEXT_PUBLIC_SUPABASE_URL})`
    : 'MISSING';
  checks.SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ? 'set' : 'MISSING';
  checks.AUTH_SECRET = process.env.AUTH_SECRET ? 'set' : 'MISSING';

  try {
    const { count, error } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true });

    if (error) throw error;
    checks.users_table = `ok (${count ?? 0} rows)`;
  } catch (err) {
    checks.users_table = `error: ${err instanceof Error ? err.message : String(err)}`;
  }

  const allOk = !Object.values(checks).some((v) => v.includes('MISSING') || v.includes('error'));

  return NextResponse.json({ ok: allOk, checks }, { status: allOk ? 200 : 500 });
}
