const TZ = 'America/Sao_Paulo';

function brazilDate(): Date {
  return new Date(new Date().toLocaleString('en-US', { timeZone: TZ }));
}

export function brazilToday(): string {
  const d = brazilDate();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function brazilDayOfWeek(): number {
  return brazilDate().getDay();
}

export function brazilHour(): number {
  return brazilDate().getHours();
}

export function brazilNDaysAgo(n: number, fromDate?: string): string {
  const base = fromDate ?? brazilToday();
  const d = new Date(base + 'T12:00:00');
  d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0];
}

// "HH:mm" in Brazil time for an ISO timestamp.
export function brazilTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
}
