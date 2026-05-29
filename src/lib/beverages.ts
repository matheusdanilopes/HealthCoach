/**
 * Local heuristic beverage detection — runs without AI calls.
 * Priority: explicit ml/L in name > volume descriptor > default for category.
 *
 * Rules per spec:
 *   Full (100%):    água, água com gás, água saborizada sem açúcar
 *   Partial (50-95%): suco natural, café, chá, leite, isotônico, água de coco, kefir, kombucha, limonada, caldo
 *   None (0%):      bebidas alcoólicas, refrigerantes açucarados, milkshakes, ultraprocessados
 *
 * NOTE: JavaScript \b is ASCII-only and fails on accented chars ('á','é','ã'…).
 * All patterns use (?<!\p{L}) / (?!\p{L}) with the /u flag instead of \b,
 * so that "água", "chá", "café" etc. are correctly matched in Portuguese.
 */

export interface BeverageDetection {
  isBeverage: boolean;
  hydrationFactor: number; // 0–1 fraction that counts toward hydration
  estimatedMl: number;     // ml estimated to count (raw_ml × factor)
  confidence: 'high' | 'medium' | 'low';
}

// Helper: compile a pattern with proper Unicode word boundaries
// Uses negative lookbehind/ahead for Unicode letters (\p{L}, requires /u flag)
function wb(src: string, flags = 'iu'): RegExp {
  return new RegExp(`(?<!\\p{L})${src}(?!\\p{L})`, flags);
}

// Patterns that disqualify a beverage from contributing to hydration
const EXCLUDED: RegExp[] = [
  wb('cerveja|beer|heineken|brahma|skol|itaipava|bohemia|budweiser|corona'),
  wb('vinho|wine|espumante|champagne|prosecco|sake'),
  wb('cacha[cç]a|caipirinha|pinga'),
  wb('whisk(?:e)?y|bourbon|scotch'),
  wb('vodka|rum|tequila|gin|licor'),
  wb('drinks?|coquetel|cocktail|highball'),
  wb('refrigerante|coca.?cola|pepsi|guaran[aá].{0,3}ant[aá]rtica|fanta|sprite|schweppes'),
  wb('milkshake|shake\\s+(?:de|ao)'),
  wb('energ[eé]tico|monster|red.?bull|volt|adrenaline'),
  wb('aperol|campari|limoncello'),
  // Sugary boxed/canned juices
  wb('suco\\s+(?:de\\s+)?(?:caixa|lata)|n[eé]ctar'),
  wb('refri'),
];

interface BeverageRule {
  pattern: RegExp;
  factor: number;
  defaultMl: number;
}

// Order matters: more specific patterns first
const BEVERAGE_RULES: BeverageRule[] = [
  // 100% hydrating — pure water variants (most specific first)
  { pattern: wb('água\\s+com\\s+gás'),        factor: 1.00, defaultMl: 300 },
  { pattern: wb('água\\s+saborizada'),         factor: 1.00, defaultMl: 300 },
  { pattern: wb('água\\s+mineral'),            factor: 1.00, defaultMl: 300 },
  { pattern: wb('água\\s+de\\s+coco'),         factor: 0.95, defaultMl: 250 },
  { pattern: wb('água'),                       factor: 1.00, defaultMl: 300 },

  // Tea / coffee / herbal
  { pattern: wb('caf[eé]'),                    factor: 0.85, defaultMl: 80  },
  { pattern: wb('ch[aá]'),                     factor: 0.85, defaultMl: 200 },
  { pattern: wb('chimarr[aã]o|terere|terer[eê]|mate'), factor: 0.80, defaultMl: 250 },

  // Natural juices
  { pattern: wb('suco|juice'),                 factor: 0.80, defaultMl: 200 },
  { pattern: wb('limonada'),                   factor: 0.80, defaultMl: 250 },
  { pattern: wb('vitamina'),                   factor: 0.75, defaultMl: 250 },

  // Milk / dairy-based (most specific first)
  { pattern: wb('leite\\s+de\\s+coco'),        factor: 0.50, defaultMl: 100 },
  { pattern: wb('leite'),                      factor: 0.80, defaultMl: 200 },
  { pattern: wb('kefir'),                      factor: 0.75, defaultMl: 200 },
  { pattern: wb('iogurte\\s+(?:l[ií]quido|para\\s+beber)'), factor: 0.70, defaultMl: 170 },

  // Sports / functional
  { pattern: wb('isot[oô]nico|gatorade|powerade'), factor: 0.75, defaultMl: 500 },
  { pattern: wb('kombucha'),                   factor: 0.70, defaultMl: 300 },

  // Soups / broths
  { pattern: wb('caldo|consomm[eé]'),          factor: 0.50, defaultMl: 250 },
  { pattern: wb('sopa'),                       factor: 0.45, defaultMl: 250 },

  // Smoothies (natural)
  { pattern: wb('smoothie|green\\s+juice|detox'), factor: 0.70, defaultMl: 250 },
];

// Volume descriptor → ml (when explicit ml/L not found in name)
const VOLUME_DESCRIPTORS: Array<{ pattern: RegExp; ml: number }> = [
  { pattern: wb('garraf[aã]o'),    ml: 1000 },
  { pattern: wb('garrafa'),        ml: 500  },
  { pattern: wb('garrafinhas?'),   ml: 300  },
  { pattern: wb('lata'),           ml: 350  },
  { pattern: wb('x[ií]cara|cup'),  ml: 80   },
  { pattern: wb('caneca'),         ml: 280  },
  { pattern: /copo\s+ameri/iu,     ml: 200  },
  { pattern: /copo\s+gran/iu,      ml: 400  },
  { pattern: wb('copo'),           ml: 250  },
  { pattern: wb('ta[cç]a|goblet'), ml: 250  },
];

function extractRawMl(text: string): number | null {
  // Explicit "NNNml"
  const mlM = text.match(/(\d+)\s*ml\b/i);
  if (mlM) return Math.min(parseInt(mlM[1], 10), 5000);

  // Explicit "N.N L" or "NL"
  const lM = text.match(/(\d+(?:[.,]\d+)?)\s*l(?:itros?)?\b/i);
  if (lM) return Math.min(Math.round(parseFloat(lM[1].replace(',', '.')) * 1000), 5000);

  // Quantity × descriptor, e.g. "2 copos" or "3 xícaras"
  const qtyM = text.match(/(\d+)\s+(copos?|garrafas?|latas?|x[ií]caras?|canecas?)/iu);
  if (qtyM) {
    const qty  = parseInt(qtyM[1], 10);
    const word = qtyM[2];
    for (const d of VOLUME_DESCRIPTORS) {
      if (d.pattern.test(word)) return Math.min(d.ml * qty, 2000);
    }
    return Math.min(qty * 250, 2000);
  }

  // Single descriptor in the whole text
  for (const d of VOLUME_DESCRIPTORS) {
    if (d.pattern.test(text)) return d.ml;
  }

  return null;
}

export function detectBeverage(foodName: string): BeverageDetection {
  // Check exclusions first
  for (const ex of EXCLUDED) {
    if (ex.test(foodName)) {
      return { isBeverage: true, hydrationFactor: 0, estimatedMl: 0, confidence: 'high' };
    }
  }

  // Match beverage rules
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
