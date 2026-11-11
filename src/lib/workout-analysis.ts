// Cálculos determinísticos da análise de treino. O servidor faz as contas e
// entrega os resultados prontos para a IA, que só interpreta — modelos erram
// aritmética e isso fazia a mesma entrada render estimativas diferentes.

export type Confidence = 'alta' | 'média' | 'baixa';
export type Sex = 'male' | 'female';

const INTENSITY_LEVEL: Record<string, number> = {
  leve: 0,
  baixa: 0,
  moderada: 1,
  intensa: 2,
  alta: 2,
  'muito intensa': 3,
  'muito alta': 3,
  'máxima': 3,
};

const LEVEL_LABEL = ['leve', 'moderada', 'intensa', 'muito intensa'] as const;

export function intensityLevel(label: string | null | undefined): number | null {
  if (!label) return null;
  return INTENSITY_LEVEL[label.trim().toLowerCase()] ?? null;
}

/** RPE 1-3 leve, 4-6 moderada, 7-8 intensa, 9-10 máxima. */
export function rpeLevel(rpe: number): number | null {
  if (!Number.isFinite(rpe) || rpe < 1 || rpe > 10) return null;
  if (rpe <= 3) return 0;
  if (rpe <= 6) return 1;
  if (rpe <= 8) return 2;
  return 3;
}

/** FC máxima estimada pela fórmula de Tanaka (2001): 208 − 0,7 × idade. */
export function estimateMaxHR(age: number): number {
  return Math.round(208 - 0.7 * age);
}

/** Zona pelo % da FC máxima: < 60 leve, 60-75 moderada, 75-85 intensa, > 85 muito intensa. */
export function hrZoneLevel(pctMaxHR: number): number {
  if (pctMaxHR < 60) return 0;
  if (pctMaxHR < 75) return 1;
  if (pctMaxHR <= 85) return 2;
  return 3;
}

/**
 * Gasto pela FC média — Keytel et al. (2005). Só vale em exercício
 * (FC ~90-200 bpm); fora disso a equação perde o sentido.
 */
export function keytelKcal(opts: {
  heartRate: number;
  weightKg: number;
  age: number;
  sex: Sex;
  minutes: number;
}): number | null {
  const { heartRate: hr, weightKg: w, age: a, sex, minutes } = opts;
  if (!(hr >= 90 && hr <= 200) || !(w > 0) || !(a > 0) || !(minutes > 0)) return null;
  const kjPerMin = sex === 'male'
    ? -55.0969 + 0.6309 * hr + 0.1988 * w + 0.2017 * a
    : -20.4022 + 0.4472 * hr - 0.1263 * w + 0.074 * a;
  const kcal = (kjPerMin / 4.184) * minutes;
  return kcal > 0 ? Math.round(kcal) : null;
}

export function speedKmh(distanceKm: number, minutes: number): number | null {
  if (!(distanceKm > 0) || !(minutes > 0)) return null;
  return distanceKm / (minutes / 60);
}

const SPEED_RANGE: Record<string, [number, number]> = {
  caminhada: [2, 8],
  corrida: [5, 22],
  ciclismo: [5, 45],
};

/** Velocidade plausível para a modalidade? null quando não há faixa de referência. */
export function speedIsPlausible(workoutType: string, speed: number): boolean | null {
  const range = SPEED_RANGE[workoutType];
  if (!range) return null;
  return speed >= range[0] && speed <= range[1];
}

/**
 * MET pelo ritmo, equações metabólicas do ACSM em terreno plano:
 * caminhada VO2 = 0,1 × v + 3,5; corrida VO2 = 0,2 × v + 3,5 (v em m/min).
 */
export function acsmMet(workoutType: string, speed: number): number | null {
  const mPerMin = (speed * 1000) / 60;
  let vo2: number;
  if (workoutType === 'caminhada' && speed >= 2.5 && speed <= 7.5) vo2 = 0.1 * mPerMin + 3.5;
  else if (workoutType === 'corrida' && speed >= 6 && speed <= 22) vo2 = 0.2 * mPerMin + 3.5;
  else return null;
  return Math.round((vo2 / 3.5) * 10) / 10;
}

export interface WorkoutInput {
  workoutType?: string;
  intensity?: string;
  minutes: number;
  heartRate?: number;
  distanceKm?: number;
  rpe?: number;
  smartwatchKcal?: number;
  weightKg: number;
  age?: number;
  sex?: Sex;
}

export interface WorkoutFacts {
  /** Linhas prontas para o prompt. */
  lines: string[];
  /** Contradições detectadas pelo servidor — impedem confiança alta. */
  contradictions: string[];
}

const pct = (a: number, b: number) => Math.round((Math.abs(a - b) / b) * 100);

/** Fatos calculados a partir dos dados do treino e do perfil. */
export function buildWorkoutFacts(input: WorkoutInput): WorkoutFacts {
  const lines: string[] = [];
  const contradictions: string[] = [];
  const hours = input.minutes / 60;
  const kcalPerMet = Math.round(input.weightKg * hours);
  const declared = intensityLevel(input.intensity);

  lines.push(`- Gasto de 1 MET nesta duração: ${kcalPerMet} kcal (kcal = MET × ${kcalPerMet})`);

  if (input.rpe) {
    const level = rpeLevel(input.rpe);
    if (level !== null && declared !== null) {
      const diff = Math.abs(level - declared);
      if (diff <= 1) {
        lines.push(`- RPE ${input.rpe} × intensidade declarada (${input.intensity}): coerentes`);
      } else {
        const msg = `RPE ${input.rpe} (${LEVEL_LABEL[level]}) contradiz a intensidade declarada (${input.intensity})`;
        lines.push(`- ${msg}`);
        contradictions.push(msg);
      }
    }
  }

  let hrKcal: number | null = null;
  if (input.heartRate && input.age) {
    const maxHR = estimateMaxHR(input.age);
    const pctMax = Math.round((input.heartRate / maxHR) * 100);
    const zone = hrZoneLevel(pctMax);
    lines.push(
      `- FC máxima estimada (Tanaka): ${maxHR} bpm; FC média = ${pctMax}% da máxima → zona ${LEVEL_LABEL[zone]}`
    );
    if (declared !== null && Math.abs(zone - declared) >= 2) {
      const msg = `zona de FC (${LEVEL_LABEL[zone]}) contradiz a intensidade declarada (${input.intensity})`;
      lines.push(`- Atenção: ${msg}`);
      contradictions.push(msg);
    }
    if (input.sex) {
      hrKcal = keytelKcal({
        heartRate: input.heartRate,
        weightKg: input.weightKg,
        age: input.age,
        sex: input.sex,
        minutes: input.minutes,
      });
      if (hrKcal) lines.push(`- Estimativa pela FC (Keytel 2005): ${hrKcal} kcal`);
    }
  }

  if (input.distanceKm && input.workoutType) {
    const speed = speedKmh(input.distanceKm, input.minutes);
    if (speed) {
      const speedStr = speed.toFixed(1);
      lines.push(`- Velocidade média: ${speedStr} km/h`);
      const plausible = speedIsPlausible(input.workoutType, speed);
      if (plausible === false) {
        const msg = `velocidade de ${speedStr} km/h incomum para ${input.workoutType}`;
        lines.push(`- Atenção: ${msg} — distância ou duração possivelmente errada`);
        contradictions.push(msg);
      } else {
        const met = acsmMet(input.workoutType, speed);
        if (met) {
          lines.push(`- MET pelo ritmo (equação ACSM): ${met.toFixed(1)} → ${Math.round(met * kcalPerMet)} kcal`);
        }
      }
    }
  }

  if (input.smartwatchKcal && hrKcal) {
    const diff = pct(input.smartwatchKcal, hrKcal);
    lines.push(`- Smartwatch × estimativa pela FC: diferença de ${diff}%`);
    if (diff > 40) {
      const msg = `kcal do smartwatch diverge ${diff}% da estimativa pela FC`;
      contradictions.push(msg);
    }
  }

  return { lines, contradictions };
}

/** Faixa coerente (min ≤ estimativa ≤ max) ou null se a IA não mandou uma utilizável. */
export function normalizeRange(
  estimated: number,
  min: unknown,
  max: unknown
): { min: number; max: number } | null {
  const lo = Math.round(Number(min));
  const hi = Math.round(Number(max));
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || lo <= 0 || hi <= 0) return null;
  const a = Math.min(lo, hi);
  const b = Math.max(lo, hi);
  if (estimated < a || estimated > b) return null;
  return { min: a, max: b };
}

// Meia-largura da faixa em relação à estimativa.
export const CONFIDENCE_THRESHOLDS = { alta: 0.12, média: 0.25 } as const;

/**
 * Confiança derivada da faixa de incerteza: até ±12% alta, até ±25% média,
 * acima disso baixa. Contradições detectadas pelo servidor limitam a média.
 */
export function confidenceFromRange(
  estimated: number,
  range: { min: number; max: number } | null,
  contradictions: string[] = []
): Confidence {
  if (!range || estimated <= 0) return contradictions.length ? 'baixa' : 'média';
  const halfWidth = (range.max - range.min) / 2 / estimated;
  let confidence: Confidence =
    halfWidth <= CONFIDENCE_THRESHOLDS.alta + 1e-9 ? 'alta'
    : halfWidth <= CONFIDENCE_THRESHOLDS.média + 1e-9 ? 'média'
    : 'baixa';
  if (contradictions.length && confidence === 'alta') confidence = 'média';
  return confidence;
}
