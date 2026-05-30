import { NextResponse } from 'next/server';
import { auth } from '@/auth';

const EXTERNAL_BASE = 'https://gestao-financeira-tawny.vercel.app/api/shopping-list';

const CAT_MAP: Record<string, string> = {
  proteinas:    'Proteínas',
  carboidratos: 'Carboidratos',
  hortifruti:   'Hortifruti',
  temperos:     'Temperos',
  outros:       'Outros',
};

interface SendItem {
  name:       string;
  amount:     string;
  category:   string;
  total_cost: number;
}

function parseAmount(amount: string): { quantity: number; unit: string } {
  const m = amount.match(/^([\d,\.]+)\s*(.*)/);
  if (!m) return { quantity: 1, unit: amount.trim() || 'unidade' };
  return {
    quantity: parseFloat(m[1].replace(',', '.')),
    unit:     m[2].trim() || 'unidade',
  };
}

function getBearerToken(): string | null {
  // User-provided personal access token takes priority over service role key
  return process.env.SHOPPING_LIST_ACCESS_TOKEN ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? null;
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const token = getBearerToken();
  if (!token) {
    return NextResponse.json(
      { error: 'Token de autenticação não configurado. Adicione SHOPPING_LIST_ACCESS_TOKEN nas variáveis de ambiente.' },
      { status: 503 }
    );
  }

  let items: SendItem[];
  try {
    const body = await req.json();
    items = body.items ?? [];
    if (!Array.isArray(items) || items.length === 0)
      return NextResponse.json({ error: 'Nenhum item para enviar' }, { status: 400 });
  } catch {
    return NextResponse.json({ error: 'Corpo inválido' }, { status: 400 });
  }

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  };

  const results = await Promise.allSettled(
    items.map(async (item) => {
      const { quantity, unit } = parseAmount(item.amount);
      const payload = {
        name:            item.name,
        quantity,
        unit,
        category:        CAT_MAP[item.category] ?? 'Outros',
        estimated_price: item.total_cost > 0 ? Math.round(item.total_cost * 100) / 100 : undefined,
      };

      const controller = new AbortController();
      const timeoutId  = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(`${EXTERNAL_BASE}/items`, {
        method:  'POST',
        headers,
        body:    JSON.stringify(payload),
        signal:  controller.signal,
      }).finally(() => clearTimeout(timeoutId));

      if (!res.ok) {
        const errBody = await res.text().catch(() => res.statusText);
        throw new Error(`${res.status}: ${errBody}`);
      }

      const data = await res.json();
      return { name: item.name, item_id: data.item_id, merged: data.merged ?? false };
    })
  );

  const sent   = results.filter((r) => r.status === 'fulfilled').length;
  const failed = results.filter((r) => r.status === 'rejected').length;
  const errors = results
    .map((r, i) => r.status === 'rejected' ? { name: items[i].name, error: (r as PromiseRejectedResult).reason?.message } : null)
    .filter(Boolean);

  console.log(`[shopping-list/send] user=${session.user.id} | sent=${sent} | failed=${failed}`);

  return NextResponse.json({ success: failed === 0, sent, failed, errors });
}
