/** Apoio aos testes: a TACO real (db/taco/taco_foods.csv, gerado da planilha oficial). */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { normalizeFoodName } from './normalize';
import type { FoodReference } from './validation';

export interface TacoRow extends FoodReference {
  id: number;
  categoria: string;
  nome_normalizado: string;
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

let cache: TacoRow[] | null = null;

export function loadTaco(): TacoRow[] {
  if (cache) return cache;
  const lines = readFileSync(join(process.cwd(), 'db/taco/taco_foods.csv'), 'utf8').trim().split(/\r?\n/).slice(1);
  const num = (s: string) => (s === '' ? null : Number(s));
  cache = lines.map((line) => {
    const [id, nome, categoria, kcal, p, c, g] = parseCsvLine(line);
    return {
      id: Number(id), nome, categoria, nome_normalizado: normalizeFoodName(nome), source: 'taco' as const,
      kcal_100g: Number(kcal), protein_100g: num(p), carbs_100g: num(c), fat_100g: num(g),
    };
  });
  return cache;
}

export function tacoByName(nome: string): TacoRow {
  const row = loadTaco().find((r) => r.nome === nome);
  if (!row) throw new Error(`TACO sem "${nome}"`);
  return row;
}
