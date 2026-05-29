/**
 * Local heuristic beverage detection — runs without AI calls.
 * Priority: explicit ml/L in name > volume descriptor > default for category.
 *
 * Rules per spec:
 *   Full (100%):    água, água com gás, água saborizada sem açúcar
 *   Partial (50-95%): suco natural, café, chá, leite, isotônico, água de coco, kefir, kombucha, limonada, caldo
 *   None (0%):      bebidas alcoólicas, refrigerantes açucarados, milkshakes, ultraprocessados
 */

export interface BeverageDetection {
  isBeverage: boolean;
  hydrationFactor: number; // 0–1 fraction that counts toward hydration
  estimatedMl: number;     // ml estimated to count (raw_ml × factor)
  confidence: 'high' | 'medium' | 'low';
}

// Patterns that disqualify a beverage from contributing to hydration
const EXCLUDED: RegExp[] = [
  /\bcerveja\b|\bbeer\b|\heineken|\bbrahma\b|\bskol\b|\bitaipava\b|\bbohemia\b|\bbudweiser\b/i,
  /\bvinho\b|\bwine\b|\bespumante\b|\bchampagne\b|\bprosecco\b|\bsake\b/i,
  /\bcacha[cç]a\b|\bcaipirinha\b|\bpinga\b/i,
  /\bwhisk(?:e)?y\b|\bbourbon\b|\bscotch\b/i,
  /\bvodka\b|\brum\b|\btequila\b|\bgin\b|\blicor\b|\bapertura\b|\baperол\b/i,
  /\bdrinks?\b|\bcoquetel\b|\bcocktail\b|\bhighball\b/i,
  /\brefrigerante\b|\bcoca.cola\b|\bpepsi\b|\bguaran[aá].?antártica\b|\bfanta\b|\bsprite\b|\bschweppes\b/i,
  /\bmilkshake\b|\bshake\s+(de|ao)\b/i,
  /\benerg[eé]tico\b|\bmonster\b|\bred.?bull\b|\bvolt\b|\badrenaline\b/i,
  /\baperol\b|\bcampari\b|\blimoncello\b/i,
  // Sugary artificial drinks
  /\bsuco\s+(de\s+)?caixa\b|\bsuco\s+(de\s+)?lata\b|\bnéctar\b/i,
  /\brefri\b/i,
];

interface BeverageRule {
  pattern: RegExp;
  factor: number;   // hydration factor
  defaultMl: number; // ml when no volume hint found
}

// Order matters: more specific patterns first
const BEVERAGE_RULES: BeverageRule[] = [
  // 100% hydrating — pure water variants
  { pattern: /\bágua\s+com\s+gás\b/i,       factor: 1.00, defaultMl: 300 },
  { pattern: /\bágua\s+saborizada\b/i,       factor: 1.00, defaultMl: 300 },
  { pattern: /\bágua\s+mineral\b/i,          factor: 1.00, defaultMl: 300 },
  { pattern: /\bágua\s+de\s+coco\b/i,        factor: 0.95, defaultMl: 250 },
  { pattern: /\bágua\b/i,                    factor: 1.00, defaultMl: 300 },

  // Tea / coffee / herbal
  { pattern: /\bcaf[eé]\b/i,                 factor: 0.85, defaultMl: 80  },
  { pattern: /\bchá\b/i,                     factor: 0.85, defaultMl: 200 },
  { pattern: /\bchimarrão\b|\bmate\b|\bterere\b|\btereré\b/i, factor: 0.80, defaultMl: 250 },

  // Natural juices
  { pattern: /\bsuco\b|\bjuice\b/i,          factor: 0.80, defaultMl: 200 },
  { pattern: /\blimonada\b/i,                factor: 0.80, defaultMl: 250 },
  { pattern: /\bvitamina\b/i,                factor: 0.75, defaultMl: 250 },

  // Milk / dairy-based
  { pattern: /\bleite\s+de\s+coco\b/i,       factor: 0.50, defaultMl: 100 },
  { pattern: /\bleite\b/i,                   factor: 0.80, defaultMl: 200 },
  { pattern: /\bkefir\b/i,                   factor: 0.75, defaultMl: 200 },
  { pattern: /\biogurte\s+(l[ií]quido|para\s+beber)\b/i, factor: 0.70, defaultMl: 170 },

  // Sports / functional
  { pattern: /\bisot[oô]nico\b|\bgatorade\b|\bpowerade\b/i, factor: 0.75, defaultMl: 500 },
  { pattern: /\bkombucha\b/i,                factor: 0.70, defaultMl: 300 },

  // Soups / broths
  { pattern: /\bcaldo\b|\bconsomm[eé]\b/i,   factor: 0.50, defaultMl: 250 },
  { pattern: /\bsopa\b/i,                    factor: 0.45, defaultMl: 250 },

  // Smoothies (natural)
  { pattern: /\bsmoothie\b|\bgreen\s+juice\b|\bdetox\b/i, factor: 0.70, defaultMl: 250 },
];

// Volume descriptor → ml (applied when explicit ml/L not found)
const VOLUME_DESCRIPTORS: Array<{ pattern: RegExp; ml: number }> = [
  { pattern: /\bgarraf[aã]o\b/i,          ml: 1000 },
  { pattern: /\bgarrafa\b/i,              ml: 500  },
  { pattern: /\bgarrafinhas?\b/i,         ml: 300  },
  { pattern: /\blata\b/i,                 ml: 350  },
  { pattern: /\bxícara\b|\bcup\b/i,       ml: 80   },
  { pattern: /\bcaneca\b/i,              ml: 280   },
  { pattern: /\bcopo\s+ameri/i,          ml: 200   },
  { pattern: /\bcopo\s+gran/i,           ml: 400   },
  { pattern: /\bcopo\b/i,               ml: 250   },
  { pattern: /\btaça\b|\bgoblet\b/i,    ml: 250   },
];

function extractRawMl(text: string): number | null {
  // Explicit "NNNml"
  const mlM = text.match(/(\d+)\s*ml\b/i);
  if (mlM) return Math.min(parseInt(mlM[1], 10), 5000);

  // Explicit "N.N L" or "NL"
  const lM = text.match(/(\d+(?:[.,]\d+)?)\s*l(?:itros?)?\b/i);
  if (lM) return Math.min(Math.round(parseFloat(lM[1].replace(',', '.')) * 1000), 5000);

  // Quantity × descriptor, e.g. "2 copos"
  const qtyM = text.match(/\b(\d+)\s+(copos?|garrafas?|latas?|xícaras?|canecas?)\b/i);
  if (qtyM) {
    const qty  = parseInt(qtyM[1], 10);
    const word = qtyM[2].toLowerCase();
    for (const d of VOLUME_DESCRIPTORS) {
      if (d.pattern.test(word)) return Math.min(d.ml * qty, 2000);
    }
    return Math.min(qty * 250, 2000);
  }

  // Single descriptor
  for (const d of VOLUME_DESCRIPTORS) {
    if (d.pattern.test(text)) return d.ml;
  }

  return null;
}

export function detectBeverage(foodName: string): BeverageDetection {
  // Check exclusions first (non-hydrating beverages)
  for (const ex of EXCLUDED) {
    if (ex.test(foodName)) {
      return { isBeverage: true, hydrationFactor: 0, estimatedMl: 0, confidence: 'high' };
    }
  }

  // Try beverage rules
  for (const rule of BEVERAGE_RULES) {
    if (rule.pattern.test(foodName)) {
      const rawMl     = extractRawMl(foodName);
      const volMl     = Math.min(rawMl ?? rule.defaultMl, 2000);
      const hydratoMl = Math.round(volMl * rule.factor);
      const confidence: BeverageDetection['confidence'] = rawMl ? 'high' : 'low';
      return {
        isBeverage: true,
        hydrationFactor: rule.factor,
        estimatedMl: hydratoMl,
        confidence,
      };
    }
  }

  return { isBeverage: false, hydrationFactor: 0, estimatedMl: 0, confidence: 'low' };
}
