import postgres from 'postgres';

let _client: ReturnType<typeof postgres> | undefined;

function client() {
  return (_client ??= postgres(process.env.DATABASE_URL!, {
    max: 1,
    prepare: false,
    ssl: 'require',
  }));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function sql<T = any>(
  strings: TemplateStringsArray,
  ...values: unknown[]
): Promise<T[]> {
  return client()(strings, ...values) as unknown as Promise<T[]>;
}
