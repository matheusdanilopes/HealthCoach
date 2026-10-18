import { neon, types, type NeonQueryFunction, type NeonQueryPromise } from '@neondatabase/serverless';

// Values keep the shapes the app already relies on: dates as 'YYYY-MM-DD',
// timestamps as ISO strings, numeric/bigint as JS numbers.
const toIsoTimestamp = (v: string) => v.replace(' ', 'T').replace(/([+-]\d\d)$/, '$1:00');

// Registered globally: the HTTP driver ignores a `types` option given to neon()
// and falls back to these defaults for every query (transactions included).
types.setTypeParser(types.builtins.DATE, (v: string) => v);
types.setTypeParser(types.builtins.TIMESTAMPTZ, toIsoTimestamp);
types.setTypeParser(types.builtins.TIMESTAMP, (v: string) => v.replace(' ', 'T'));
types.setTypeParser(types.builtins.NUMERIC, Number);
types.setTypeParser(types.builtins.INT8, Number);

type Sql = NeonQueryFunction<false, false>;

let _sql: Sql | null = null;

function client(): Sql {
  if (!_sql) _sql = neon(process.env.DATABASE_URL!);
  return _sql;
}

// Lazy so importing this module never requires DATABASE_URL (e.g. at build time).
export const sql = new Proxy((() => {}) as unknown as Sql, {
  apply(_target, _this, args: Parameters<Sql>) {
    return client()(...args);
  },
  get(_target, prop: string | symbol) {
    return client()[prop as keyof Sql];
  },
});

export type Row = Record<string, unknown>;

// Awaitable, and also accepted by sql.transaction([...]).
export type Query<T> = NeonQueryPromise<false, false, T[]>;

function ident(name: string): string {
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) throw new Error(`Invalid SQL identifier: ${name}`);
  return name;
}

function whereClause(where: Row, params: unknown[]): string {
  const parts = Object.entries(where).map(([col, value]) => {
    if (value === null) return `${ident(col)} IS NULL`;
    params.push(value);
    return `${ident(col)} = $${params.length}`;
  });
  return parts.length ? ` WHERE ${parts.join(' AND ')}` : '';
}

// jsonb arrays must be passed through JSON.stringify by the caller: the driver
// serializes JS arrays as Postgres arrays (which is right for text[] columns).
export function insertInto<T = Row>(
  table: string,
  rows: Row | Row[],
  opts: { onConflict?: string; ignoreDuplicates?: boolean; returning?: string } = {},
): Query<T> {
  const list = Array.isArray(rows) ? rows : [rows];
  const cols = [...new Set(list.flatMap((r) => Object.keys(r)))];
  const params: unknown[] = [];
  const values = list.map((r) =>
    `(${cols.map((c) => {
      if (!(c in r)) return 'DEFAULT';
      params.push(r[c]);
      return `$${params.length}`;
    }).join(', ')})`
  );

  let text = `INSERT INTO ${ident(table)} (${cols.map(ident).join(', ')}) VALUES ${values.join(', ')}`;
  if (opts.onConflict) {
    const target = opts.onConflict.split(',').map((c) => ident(c.trim()));
    const updates = cols.filter((c) => !target.includes(c));
    text += ` ON CONFLICT (${target.join(', ')}) ` + (opts.ignoreDuplicates || updates.length === 0
      ? 'DO NOTHING'
      : `DO UPDATE SET ${updates.map((c) => `${ident(c)} = EXCLUDED.${ident(c)}`).join(', ')}`);
  }
  if (opts.returning) text += ` RETURNING ${opts.returning}`;
  return sql.query(text, params) as Query<T>;
}

export function updateWhere<T = Row>(
  table: string,
  patch: Row,
  where: Row,
  opts: { returning?: string } = {},
): Query<T> {
  const params: unknown[] = [];
  const set = Object.entries(patch).map(([col, value]) => {
    params.push(value);
    return `${ident(col)} = $${params.length}`;
  });
  let text = `UPDATE ${ident(table)} SET ${set.join(', ')}${whereClause(where, params)}`;
  if (opts.returning) text += ` RETURNING ${opts.returning}`;
  return sql.query(text, params) as Query<T>;
}
