/**
 * Normalização de nomes de alimento para busca: minúsculas, sem acento e sem
 * pontuação. É o mesmo algoritmo usado para gerar taco_foods.nome_normalizado
 * (scripts/taco/build_taco_seed.py) — mudar um exige mudar o outro.
 */
export function normalizeFoodName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/** Tira a quantidade que o app põe no nome ("Arroz (100g)" → "Arroz"). */
export function stripQuantity(foodName: string): string {
  return foodName.replace(/\s*\(.*$/, '').trim();
}

/**
 * Gramas escritas no nome do alimento, ex.: "Manga (150g (1 unidade))" → 150.
 * Mililitros contam como gramas (densidade ≈ 1). Usado só para auditar
 * registros antigos, que não têm quantity_g.
 */
export function gramsFromName(foodName: string): { grams: number; unit: 'g' | 'ml' } | null {
  const m = foodName.match(/(\d+(?:[.,]\d+)?)\s*(g|gr|gramas|ml)(?![\p{L}])/iu);
  if (!m) return null;
  const grams = Number(m[1].replace(',', '.'));
  if (!Number.isFinite(grams) || grams <= 0) return null;
  return { grams, unit: m[2].toLowerCase() === 'ml' ? 'ml' : 'g' };
}
