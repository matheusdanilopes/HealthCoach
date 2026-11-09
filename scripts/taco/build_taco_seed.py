"""Gera a migração de seed da TACO a partir da planilha oficial.

Fonte: TACO - Tabela Brasileira de Composição de Alimentos, 4ª edição revisada
e ampliada (NEPA/UNICAMP, 2011), planilha publicada em
https://www.nepa.unicamp.br/arquivo/uploads/taco-4a-edicao/taco-4a-edicao-2/

Uso:
  python3 -I scripts/taco/build_taco_seed.py <planilha.xlsx>

Escreve:
  db/taco/taco_foods.csv                         (para revisão humana)
  db/migrations/002_taco_foods_seed.sql         (INSERT idempotente)

Regras de conversão (nenhum valor é inventado):
  - Usa a aba "CMVCol taco3": colunas Energia (kcal), Proteína, Lipídeos e
    Carboidrato, todas por 100 g de parte comestível.
  - "Tr" (traços) vira 0.
  - "NA" (não aplicável) e "*" (não analisado) viram NULL.
  - Alimentos sem valor de energia (kcal "NA" ou "*") ficam de fora — sem
    kcal não há como calcular nada a partir deles.
  - Carboidratos negativos (calculados por diferença na TACO, ex.: -0,02 g)
    viram 0.
  - Valores arredondados a 2 casas decimais.
  - Nomes conferidos contra o PDF oficial da mesma edição; a planilha traz o
    item 540 só como "L" — o PDF (e os valores, 117 kcal) confirmam "Feijoada".
"""

import csv
import hashlib
import os
import sys
import unicodedata

import openpyxl

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


# Correções de nome conferidas no PDF oficial (taco_4_edicao_ampliada_e_revisada.pdf).
NAME_FIXES = {540: 'Feijoada'}


def normalize(name: str) -> str:
    # Mesmo algoritmo de src/lib/nutrition/normalize.ts
    s = unicodedata.normalize('NFD', name.lower())
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    s = ''.join(c if c.isalnum() else ' ' for c in s)
    return ' '.join(s.split())


def num(v):
    if v is None:
        return None
    if isinstance(v, (int, float)):
        return float(v)
    s = str(v).strip()
    if s.lower() == 'tr':
        return 0.0
    if s in ('NA', '*', '', '-'):
        return None
    return float(s.replace(',', '.'))


def sql_str(s: str) -> str:
    return "'" + s.replace("'", "''") + "'"


def sql_num(x) -> str:
    return 'NULL' if x is None else f'{x:.2f}'


def main(path: str) -> None:
    digest = hashlib.sha256(open(path, 'rb').read()).hexdigest()
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    ws = wb['CMVCol taco3']
    category = None
    foods, skipped = [], []
    for row in ws.iter_rows(values_only=True):
        a, b = row[0], row[1]
        if isinstance(a, str) and b is None and all(x is None for x in row[2:10]):
            category = a.strip()
            continue
        if not (isinstance(a, (int, float)) and b):
            continue
        nome = NAME_FIXES.get(int(a), ' '.join(str(b).split()))
        kcal = num(row[3])
        if kcal is None:
            skipped.append(f'{int(a)} {nome}')
            continue
        clamp = lambda x: None if x is None else max(0.0, round(x, 2))
        foods.append({
            'id': int(a), 'nome': nome, 'categoria': category,
            'kcal': round(kcal, 2), 'protein': clamp(num(row[5])),
            'carbs': clamp(num(row[8])), 'fat': clamp(num(row[6])),
        })

    with open(os.path.join(ROOT, 'db/taco/taco_foods.csv'), 'w', newline='', encoding='utf-8') as f:
        w = csv.writer(f)
        w.writerow(['id', 'nome', 'categoria', 'kcal_100g', 'protein_100g', 'carbs_100g', 'fat_100g'])
        for r in foods:
            w.writerow([r['id'], r['nome'], r['categoria'], sql_num(r['kcal']),
                        '' if r['protein'] is None else sql_num(r['protein']),
                        '' if r['carbs'] is None else sql_num(r['carbs']),
                        '' if r['fat'] is None else sql_num(r['fat'])])

    lines = [
        '-- Seed da TACO 4ª edição (NEPA/UNICAMP). GERADO por scripts/taco/build_taco_seed.py — não editar à mão.',
        f'-- Planilha de origem sha256: {digest}',
        f'-- {len(foods)} alimentos. Fora (sem valor de energia na TACO): {"; ".join(skipped)}.',
        '-- Idempotente: ON CONFLICT (id) DO NOTHING. Reverter: db/rollback/002_taco_foods_seed.down.sql',
        '',
        'INSERT INTO taco_foods (id, nome, nome_normalizado, categoria, kcal_100g, protein_100g, carbs_100g, fat_100g) VALUES',
    ]
    values = [
        f"  ({r['id']}, {sql_str(r['nome'])}, {sql_str(normalize(r['nome']))}, {sql_str(r['categoria'])}, "
        f"{sql_num(r['kcal'])}, {sql_num(r['protein'])}, {sql_num(r['carbs'])}, {sql_num(r['fat'])})"
        for r in foods
    ]
    lines.append(',\n'.join(values))
    lines.append('ON CONFLICT (id) DO NOTHING;')
    with open(os.path.join(ROOT, 'db/migrations/002_taco_foods_seed.sql'), 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines) + '\n')
    print(f'{len(foods)} alimentos; ignorados: {skipped}')


if __name__ == '__main__':
    main(sys.argv[1])
