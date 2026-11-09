/**
 * Similaridade por trigramas, no mesmo método do pg_trgm do Postgres
 * (similarity()): cada palavra vira "  palavra " e é quebrada em trigramas;
 * o resultado é |A ∩ B| / |A ∪ B|.
 *
 * O banco usa o índice trigram para trazer candidatos; a escolha final é feita
 * aqui, com as mesmas contas, para poder aplicar regras (estado de preparo,
 * alimento principal) e ser testada sem banco.
 */
export function trigrams(text: string): Set<string> {
  const set = new Set<string>();
  for (const word of text.toLowerCase().split(/[^\p{L}\p{N}]+/u)) {
    if (!word) continue;
    const padded = `  ${word} `;
    for (let i = 0; i + 3 <= padded.length; i++) set.add(padded.slice(i, i + 3));
  }
  return set;
}

export function similarity(a: string, b: string): number {
  const A = trigrams(a);
  const B = trigrams(b);
  if (A.size === 0 || B.size === 0) return 0;
  let shared = 0;
  for (const t of A) if (B.has(t)) shared++;
  return shared / (A.size + B.size - shared);
}
