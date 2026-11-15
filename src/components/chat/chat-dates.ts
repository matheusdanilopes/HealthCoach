/** Datas no fuso do aparelho, para o chat (só no cliente: o servidor está em UTC). */

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/** Dias inteiros entre a data e hoje (0 = hoje, 1 = ontem). */
export function daysAgo(iso: string, now = new Date()): number {
  return Math.round((startOfDay(now) - startOfDay(new Date(iso))) / 86_400_000);
}

export function sameLocalDay(a: string, b: string): boolean {
  return startOfDay(new Date(a)) === startOfDay(new Date(b));
}

/** Separador entre mensagens de dias diferentes: "Hoje", "Ontem", "sáb., 14 de nov.". */
export function dayDivider(iso: string, now = new Date()): string {
  const n = daysAgo(iso, now);
  if (n === 0) return 'Hoje';
  if (n === 1) return 'Ontem';
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR', {
    weekday: 'short', day: 'numeric', month: 'short',
    ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}),
  });
}

/** Horário na lista de conversas: "14:32", "Ontem", "seg.", "03/11". */
export function shortWhen(iso: string, now = new Date()): string {
  const n = daysAgo(iso, now);
  const d = new Date(iso);
  if (n === 0) return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  if (n === 1) return 'Ontem';
  if (n < 7) return d.toLocaleDateString('pt-BR', { weekday: 'short' });
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', ...(d.getFullYear() !== now.getFullYear() ? { year: '2-digit' } : {}) });
}

/** Grupo da lista de conversas. */
export function conversationGroup(iso: string, now = new Date()): string {
  const n = daysAgo(iso, now);
  if (n === 0) return 'Hoje';
  if (n === 1) return 'Ontem';
  if (n < 7) return 'Últimos 7 dias';
  if (n < 30) return 'Últimos 30 dias';
  return 'Mais antigas';
}
