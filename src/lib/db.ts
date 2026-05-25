import { neon } from '@neondatabase/serverless';

let _client: ReturnType<typeof neon> | undefined;

function client() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not configured. Set it in your Vercel environment variables.');
  }
  return (_client ??= neon(process.env.DATABASE_URL));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function sql<T = any>(
  strings: TemplateStringsArray,
  ...values: unknown[]
): Promise<T[]> {
  return client()(strings, ...values) as unknown as Promise<T[]>;
}
