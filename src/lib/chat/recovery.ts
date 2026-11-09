/**
 * Recuperação da resposta do Coach quando a conexão cai no meio do turno.
 *
 * No celular, sair do app (trocar de aplicativo, bloquear a tela) derruba a
 * conexão. O servidor termina o turno e grava a resposta mesmo assim
 * (src/app/api/chat/route.ts); o app só precisa buscá-la no histórico.
 */

export interface HistoryMessage {
  id: string;
  role: string;
  content: string;
}

/** Tempo máximo procurando a resposta depois que a conexão caiu (o turno tem até 90 s). */
export const RECOVERY_MS = 100_000;
/** Intervalo entre as buscas no histórico. */
export const RECOVERY_INTERVAL_MS = 3_000;
/** Sem nenhum evento (nem o ping de 8 s) por este tempo, a conexão está morta. */
export const NO_SIGNAL_MS = 20_000;

/**
 * A resposta à pergunta `questionId` (id gerado pelo app e gravado pelo
 * servidor). Pelo id, e não pelo texto: perguntas repetidas ("ok") não
 * confundem uma resposta antiga com a nova.
 */
export function replyInHistory<T extends HistoryMessage>(history: T[], questionId: string): T | null {
  const i = history.findIndex((m) => m.id === questionId && m.role === 'user');
  if (i === -1) return null;
  return history.slice(i + 1).find((m) => m.role === 'assistant' && m.content.trim() !== '') ?? null;
}

/** Sem a pergunta no histórico depois de buscas que funcionaram, o servidor não a recebeu. */
export const QUESTION_GRACE_FETCHES = 3;

/** O histórico não existe (tabela ainda não criada): não adianta insistir. */
export class HistoryUnavailableError extends Error {
  constructor() {
    super('history unavailable');
    this.name = 'HistoryUnavailableError';
  }
}

/**
 * Busca o histórico até a resposta aparecer, o prazo acabar ou `keepGoing`
 * dizer que não vale mais a pena (componente desmontado). Desiste antes se a
 * pergunta nem chegou ao servidor ou se o histórico está indisponível.
 */
export async function waitForReply<T extends HistoryMessage>(
  fetchHistory: () => Promise<T[]>,
  questionId: string,
  keepGoing: () => boolean,
  opts: {
    timeoutMs?: number;
    intervalMs?: number;
    graceFetches?: number;
    visible?: () => boolean;
    sleep?: (ms: number) => Promise<void>;
    now?: () => number;
  } = {}
): Promise<T | null> {
  const now = opts.now ?? Date.now;
  const deadline = now() + (opts.timeoutMs ?? RECOVERY_MS);
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const visible = opts.visible ?? (() => true);
  let fetchesWithoutQuestion = 0;
  while (now() < deadline && keepGoing()) {
    // Em segundo plano o navegador congela a rede: busca só com o app à vista.
    if (visible()) {
      try {
        const history = await fetchHistory();
        const reply = replyInHistory(history, questionId);
        if (reply) return reply;
        if (!history.some((m) => m.id === questionId) &&
            ++fetchesWithoutQuestion >= (opts.graceFetches ?? QUESTION_GRACE_FETCHES)) {
          return null;
        }
      } catch (err) {
        if (err instanceof HistoryUnavailableError) return null;
        /* rede ainda instável: tenta de novo */
      }
    }
    await sleep(opts.intervalMs ?? RECOVERY_INTERVAL_MS);
  }
  return null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID_RE.test(v);

/** crypto.randomUUID só existe em contexto seguro; o resto é reserva. */
export function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const hex = Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16));
  hex[12] = '4';
  hex[16] = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  const h = hex.join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
