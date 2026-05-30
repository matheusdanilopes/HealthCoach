import type { MealType } from '@/types';

export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ');
}

export function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function todayISO(): string {
  return formatDate(new Date());
}

export function getMealLabel(mealType: string): string {
  const labels: Record<string, string> = {
    breakfast:       'Café da Manhã',
    morning_snack:   'Lanche da Manhã',
    lunch:           'Almoço',
    afternoon_snack: 'Lanche da Tarde',
    dinner:          'Jantar',
    supper:          'Ceia',
    pre_workout:     'Pré-Treino',
    post_workout:    'Pós-Treino',
    other:           'Livre / Outro',
    snack:           'Lanches',
  };
  return labels[mealType] ?? mealType;
}

export function getMealIcon(mealType: string): string {
  const icons: Record<string, string> = {
    breakfast:       '☀️',
    morning_snack:   '🥐',
    lunch:           '🍽️',
    afternoon_snack: '🍎',
    dinner:          '🌙',
    supper:          '🌛',
    pre_workout:     '⚡',
    post_workout:    '💪',
    other:           '🍴',
    snack:           '🍎',
  };
  return icons[mealType] ?? '🍴';
}

export function suggestMealType(hour: number): MealType {
  if (hour >= 5  && hour < 10) return 'breakfast';
  if (hour >= 10 && hour < 12) return 'morning_snack';
  if (hour >= 12 && hour < 15) return 'lunch';
  if (hour >= 15 && hour < 18) return 'afternoon_snack';
  if (hour >= 18 && hour < 22) return 'dinner';
  return 'supper';
}

export function formatCalories(cal: number): string {
  return cal.toLocaleString('pt-BR');
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
