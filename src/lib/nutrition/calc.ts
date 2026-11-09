/** Valores nutricionais por 100 g (TACO ou rótulo). */
export interface Per100g {
  kcal_100g: number;
  protein_100g: number | null;
  carbs_100g: number | null;
  fat_100g: number | null;
}

export interface Nutrients {
  calories: number;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
}

export const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * kcal = gramas × kcal_100g / 100 (idem macros). kcal inteiro, macros com uma
 * casa. Um macro sem valor na tabela ("NA", ex.: proteína do azeite) conta como
 * 0 quando os outros existem; se a tabela não tem nenhum macro, fica null.
 */
export function nutrientsFor(grams: number, ref: Per100g): Nutrients {
  const hasMacros = ref.protein_100g != null || ref.carbs_100g != null || ref.fat_100g != null;
  const macro = (v: number | null) => (hasMacros ? round1((grams * (v ?? 0)) / 100) : null);
  return {
    calories: Math.round((grams * ref.kcal_100g) / 100),
    protein: macro(ref.protein_100g),
    carbs: macro(ref.carbs_100g),
    fat: macro(ref.fat_100g),
  };
}

/** Converte os valores de uma porção do rótulo para 100 g. */
export function per100FromPortion(
  portionG: number,
  portion: { calories: number; protein?: number | null; carbs?: number | null; fat?: number | null },
): Per100g {
  const to100 = (v: number | null | undefined) =>
    v == null ? null : Math.round(((v * 100) / portionG) * 100) / 100;
  return {
    kcal_100g: to100(portion.calories) ?? 0,
    protein_100g: to100(portion.protein),
    carbs_100g: to100(portion.carbs),
    fat_100g: to100(portion.fat),
  };
}
