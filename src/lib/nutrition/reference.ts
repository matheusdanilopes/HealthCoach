import type { FoodLog } from '@/types';
import type { FoodReference } from './validation';

/** Referência (TACO ou rótulo) que veio junto com o registro em ref_*. */
export function referenceFromLog(log: Pick<FoodLog, 'ref_nome' | 'ref_source' | 'ref_kcal_100g' | 'ref_protein_100g' | 'ref_carbs_100g' | 'ref_fat_100g'>): FoodReference | null {
  if (!log.ref_nome || !log.ref_source || log.ref_kcal_100g == null) return null;
  return {
    nome: log.ref_nome,
    source: log.ref_source,
    kcal_100g: Number(log.ref_kcal_100g),
    protein_100g: log.ref_protein_100g == null ? null : Number(log.ref_protein_100g),
    carbs_100g: log.ref_carbs_100g == null ? null : Number(log.ref_carbs_100g),
    fat_100g: log.ref_fat_100g == null ? null : Number(log.ref_fat_100g),
  };
}
