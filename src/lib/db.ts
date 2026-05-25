import { neon } from '@neondatabase/serverless';

let _client: ReturnType<typeof neon> | undefined;

function client() {
  const url = process.env.DATABASE_URL!.replace(/^postgresql:\/\//, 'postgres://');
  return (_client ??= neon(url));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function sql<T = any>(
  strings: TemplateStringsArray,
  ...values: unknown[]
): Promise<T[]> {
  return client()(strings, ...values) as unknown as Promise<T[]>;
}
