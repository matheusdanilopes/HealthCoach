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
    breakfast: 'Café da Manhã',
    lunch: 'Almoço',
    dinner: 'Jantar',
    snack: 'Lanches',
  };
  return labels[mealType] ?? mealType;
}

export function getMealIcon(mealType: string): string {
  const icons: Record<string, string> = {
    breakfast: '☀️',
    lunch: '🍽️',
    dinner: '🌙',
    snack: '🍎',
  };
  return icons[mealType] ?? '🍴';
}

export function formatCalories(cal: number): string {
  return cal.toLocaleString('pt-BR');
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
