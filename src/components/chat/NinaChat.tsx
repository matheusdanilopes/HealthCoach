'use client';

import { useState, useRef, useEffect, useLayoutEffect, memo, useCallback, Fragment } from 'react';
import {
  ArrowUp, ThumbsUp, ThumbsDown, Info, Flame, Beef, Droplets, ChevronRight, ChevronDown,
  SquarePen, CircleCheck, RotateCcw, Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { readSSE } from '@/lib/chat/sse';
import { parseRichText } from '@/lib/chat/rich-text';
import { HistoryUnavailableError, NO_SIGNAL_MS, newId, waitForReply } from '@/lib/chat/recovery';
import { COACH_CAPABILITIES, COACH_NAME, COACH_ROLE, coachSuggestions } from '@/lib/coach-persona';
import type { ChatMessage, FoodLog, Profile } from '@/types';
import CoachAvatar from './CoachAvatar';
import CoachAboutModal, { CAPABILITY_ICON } from './CoachAboutModal';

/* ─── Tipos e persistência ─────────────────────────────────────────────── */

/** O que aparece no cartão "registrado no diário" abaixo da resposta. */
interface LoggedFood {
  food_name: string;
  calories: number;
  protein: number | null;
}

interface UiMessage extends ChatMessage {
  /** Chave estável só da tela (respostas de erro não têm id). */
  key: string;
  foodLog?: LoggedFood | null;
  /** Resposta de erro: não vai para o histórico e oferece "tentar de novo". */
  error?: boolean;
  /** Texto da pergunta que falhou, para reenviar. */
  retryText?: string;
}

/** Conversa guardada na aba: navegar pelo app e voltar não apaga a conversa. */
interface StoredChat {
  day: string;
  conversationId: string | null;
  messages: UiMessage[];
  /** Pergunta sem resposta quando a tela foi fechada: a resposta é buscada ao voltar. */
  pending: { questionId: string; text: string } | null;
}

const storageKey = (userId: string) => `hc:nina-chat:${userId}`;

function loadChat(userId: string, day: string): StoredChat | null {
  try {
    const raw = sessionStorage.getItem(storageKey(userId));
    if (!raw) return null;
    const data = JSON.parse(raw) as StoredChat;
    // Conversa de outro dia: os números mudaram, começa de novo.
    if (data.day !== day || !Array.isArray(data.messages)) return null;
    return data;
  } catch {
    return null;
  }
}

function saveChat(userId: string, chat: StoredChat) {
  try {
    sessionStorage.setItem(storageKey(userId), JSON.stringify({ ...chat, messages: chat.messages.slice(-60) }));
  } catch { /* sem storage (aba anônima, cota): a conversa só não sobrevive à navegação */ }
}

function clearChat(userId: string) {
  try { sessionStorage.removeItem(storageKey(userId)); } catch { /* idem */ }
}

function toLoggedFood(raw: unknown): LoggedFood | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<FoodLog>;
  if (typeof r.food_name !== 'string') return null;
  return {
    food_name: r.food_name,
    calories: Number(r.calories) || 0,
    protein: r.protein == null ? null : Number(r.protein),
  };
}

/* ─── Texto formatado (negrito, itálico, listas, títulos) ─────────────── */

const INLINE_RE = /(\*\*[^*]+\*\*|__[^_]+__|\*[^*\s][^*]*\*|_[^_\s][^_]*_|`[^`]+`)/g;

/** Negrito, itálico e `código` dentro de uma linha; asteriscos soltos somem. */
function Inline({ text }: { text: string }) {
  const parts = text.split(INLINE_RE);
  return (
    <>
      {parts.map((p, i) => {
        if (!p) return null;
        if ((p.startsWith('**') && p.endsWith('**')) || (p.startsWith('__') && p.endsWith('__'))) {
          return <strong key={i} className="font-semibold text-zinc-900 dark:text-white">{p.slice(2, -2)}</strong>;
        }
        if (p.length > 2 && ((p.startsWith('*') && p.endsWith('*')) || (p.startsWith('_') && p.endsWith('_')))) {
          return <em key={i}>{p.slice(1, -1)}</em>;
        }
        if (p.startsWith('`') && p.endsWith('`')) {
          return <span key={i} className="font-semibold">{p.slice(1, -1)}</span>;
        }
        return <Fragment key={i}>{p.replace(/\*{1,3}/g, '')}</Fragment>;
      })}
    </>
  );
}

/** Resposta da Nina com formatação; nunca injeta HTML vindo da IA. */
function RichText({ text }: { text: string }) {
  const blocks = parseRichText(text);
  return (
    <div className="flex flex-col gap-2">
      {blocks.map((b, i) => {
        switch (b.type) {
          case 'h':
            return (
              <p key={i} className={cn('text-[13px] font-semibold text-zinc-900 dark:text-white', i > 0 && 'pt-1')}>
                <Inline text={b.text} />
              </p>
            );
          case 'ul':
            return (
              <ul key={i} className="flex flex-col gap-1">
                {b.items.map((item, j) => (
                  <li key={j} className="flex gap-2">
                    <span className="mt-[9px] h-1.5 w-1.5 flex-shrink-0 rounded-full bg-emerald-500" aria-hidden />
                    <span className="min-w-0"><Inline text={item} /></span>
                  </li>
                ))}
              </ul>
            );
          case 'ol':
            return (
              <ol key={i} className="flex flex-col gap-1.5">
                {b.items.map((item, j) => (
                  <li key={j} className="flex gap-2">
                    <span className="mt-[2px] h-[18px] min-w-[18px] px-1 flex-shrink-0 rounded-full bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold tabular-nums flex items-center justify-center" aria-hidden>
                      {item.n}
                    </span>
                    <span className="min-w-0"><span className="sr-only">{item.n}. </span><Inline text={item.text} /></span>
                  </li>
                ))}
              </ol>
            );
          default:
            return (
              <p key={i}>
                {b.lines.map((l, j) => (
                  <Fragment key={j}><Inline text={l} />{j < b.lines.length - 1 && <br />}</Fragment>
                ))}
              </p>
            );
        }
      })}
    </div>
  );
}

/* ─── Avaliação 👍/👎 ───────────────────────────────────────────────────── */

type Rate = (messageId: string, rating: 1 | -1 | null, comment?: string) => void;

/** 👍/👎 da resposta. O 👎 abre um campo opcional "o que estava errado?". */
function Rating({ messageId, value, onRate }: { messageId: string; value: 1 | -1 | null | undefined; onRate: Rate }) {
  const [commenting, setCommenting] = useState(false);
  const [comment, setComment] = useState('');
  const [sent, setSent] = useState(false);

  const base = 'inline-flex items-center justify-center h-7 w-7 rounded-full transition-[color,background-color,transform] duration-200 active:scale-75';
  const idle = 'text-zinc-400 dark:text-zinc-500 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:text-emerald-400 dark:hover:bg-emerald-950/40';

  return (
    <div className="flex flex-wrap items-center gap-0.5 -ml-1">
      <button
        type="button"
        onClick={() => { setCommenting(false); onRate(messageId, value === 1 ? null : 1); }}
        aria-label={value === 1 ? 'Desfazer avaliação positiva' : 'Resposta útil'}
        aria-pressed={value === 1}
        className={cn(base, value === 1 ? 'text-emerald-600 dark:text-emerald-400' : idle)}
      >
        <ThumbsUp size={13} className={cn(value === 1 && 'chat-rate-pop')} fill={value === 1 ? 'currentColor' : 'none'} fillOpacity={0.2} />
      </button>
      <button
        type="button"
        onClick={() => {
          const next = value === -1 ? null : -1;
          setCommenting(next === -1);
          setSent(false);
          onRate(messageId, next);
        }}
        aria-label={value === -1 ? 'Desfazer avaliação negativa' : 'Resposta com problema'}
        aria-pressed={value === -1}
        className={cn(base, value === -1 ? 'text-rose-600 dark:text-rose-400' : idle)}
      >
        <ThumbsDown size={13} className={cn(value === -1 && 'chat-rate-pop')} fill={value === -1 ? 'currentColor' : 'none'} fillOpacity={0.2} />
      </button>
      {commenting && value === -1 && (
        <form
          className="basis-full mt-1 flex items-center gap-1.5 animate-fade-in"
          onSubmit={(e) => {
            e.preventDefault();
            if (!comment.trim()) return;
            onRate(messageId, -1, comment.trim());
            setSent(true);
            setCommenting(false);
          }}
        >
          <input
            autoFocus
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            maxLength={1000}
            placeholder="O que estava errado? (opcional)"
            className="flex-1 min-w-0 text-[12px] rounded-full border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-1.5 text-zinc-700 dark:text-zinc-200 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/25"
          />
          <button type="submit" className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 px-2 py-1.5">
            Enviar
          </button>
        </form>
      )}
      {sent && value === -1 && (
        <span className="basis-full text-[10px] text-zinc-400 dark:text-zinc-500 animate-fade-in">Obrigada — isso me ajuda a melhorar.</span>
      )}
    </div>
  );
}

/* ─── Mensagens ─────────────────────────────────────────────────────────── */

const fmt = (n: number) => Math.round(n).toLocaleString('pt-BR');

function FoodLoggedCard({ food }: { food: LoggedFood }) {
  return (
    <div className="chat-card-in mt-2 flex items-center gap-2.5 rounded-2xl border border-emerald-200/70 dark:border-emerald-800/50 bg-emerald-50/80 dark:bg-emerald-950/30 px-3 py-2">
      <span className="h-7 w-7 flex-shrink-0 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-sm shadow-emerald-600/30">
        <CircleCheck size={14} className="chat-check-draw" />
      </span>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700/80 dark:text-emerald-300/80 leading-none">
          Registrado no diário
        </p>
        <p className="text-[12px] text-zinc-700 dark:text-zinc-200 line-clamp-2 mt-1 leading-snug">
          <span className="font-semibold">{food.food_name}</span>
          <span className="text-zinc-500 dark:text-zinc-400"> · {fmt(food.calories)} kcal{food.protein ? ` · ${fmt(food.protein)} g prot.` : ''}</span>
        </p>
      </div>
    </div>
  );
}

const MessageRow = memo(function MessageRow({ msg, showAvatar, animate, onRate, onRetry }: {
  msg: UiMessage; showAvatar: boolean; animate: boolean; onRate: Rate; onRetry: (msg: UiMessage) => void;
}) {
  const isUser = msg.role === 'user';
  return (
    <div className={cn('flex flex-col', isUser ? 'items-end' : 'items-start', animate && (isUser ? 'chat-in-user' : 'chat-in-nina'))}>
      <div className={cn('flex w-full gap-2 items-end', isUser ? 'justify-end' : 'justify-start')}>
        {!isUser && (
          <span className="w-7 flex-shrink-0">
            {showAvatar && <CoachAvatar size={28} />}
          </span>
        )}
        <div
          className={cn(
            'min-w-0 max-w-[84%] px-3.5 py-2.5 text-[14px] leading-[1.55] break-words rounded-[20px]',
            isUser
              ? 'bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-sm shadow-emerald-600/20'
              : msg.error
                ? 'bg-rose-50 dark:bg-rose-950/30 text-rose-800 dark:text-rose-200 border border-rose-200/70 dark:border-rose-900/50'
                : 'bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-200 border border-zinc-200/60 dark:border-zinc-800 shadow-sm shadow-black/[0.03]',
            isUser && showAvatar && 'rounded-br-md',
            !isUser && showAvatar && 'rounded-bl-md'
          )}
        >
          {isUser ? <span className="whitespace-pre-wrap">{msg.content}</span> : <RichText text={msg.content} />}
          {msg.foodLog && <FoodLoggedCard food={msg.foodLog} />}
        </div>
      </div>
      {!isUser && msg.error && msg.retryText && (
        <button
          type="button"
          onClick={() => onRetry(msg)}
          className="ml-9 mt-1.5 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors active:scale-95"
        >
          <RotateCcw size={11} /> Tentar de novo
        </button>
      )}
      {!isUser && !msg.error && msg.id && (
        <div className="ml-9 mt-0.5"><Rating messageId={msg.id} value={msg.rating} onRate={onRate} /></div>
      )}
    </div>
  );
});

/** "Digitando…": bolinhas da Nina; com a conexão instável, mostra o status. */
function Typing({ status }: { status: string | null }) {
  return (
    <div className="flex gap-2 items-end chat-in-nina" role="status" aria-label={status ?? `${COACH_NAME} está escrevendo`}>
      <span className="w-7 flex-shrink-0 nina-typing-avatar"><CoachAvatar size={28} /></span>
      <div className="rounded-[20px] rounded-bl-md bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 shadow-sm shadow-black/[0.03] px-4 py-3 flex items-center gap-2.5">
        <span className="flex items-center gap-1" aria-hidden>
          {[0, 0.15, 0.3].map((d) => (
            <span key={d} className="nina-dot h-1.5 w-1.5 rounded-full bg-emerald-500" style={{ animationDelay: `${d}s` }} />
          ))}
        </span>
        {status && <span className="text-[12px] text-zinc-500 dark:text-zinc-400 animate-fade-in">{status}</span>}
      </div>
    </div>
  );
}

/* ─── Resumo do dia ─────────────────────────────────────────────────────── */

function DayStat({ icon: Icon, tone, bar, value, target, unit, label, pct }: {
  icon: typeof Flame; tone: string; bar: string; value: string; target: string | null;
  unit: string; label: string; pct: number | null;
}) {
  return (
    <div className="min-w-0 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 px-2.5 py-2" title={label}>
      <p className="flex items-center gap-1 leading-none min-w-0">
        <Icon size={12} className={cn('flex-shrink-0', tone)} aria-hidden />
        <span className="text-[13px] font-bold tabular-nums text-zinc-800 dark:text-zinc-100 truncate">{value}</span>
        <span className="text-[10px] font-medium text-zinc-400 dark:text-zinc-500">{unit}</span>
        <span className="sr-only"> {label}{target ? ` de ${target} ${unit}` : ''}</span>
      </p>
      {pct != null && (
        <div className="mt-1.5 h-1 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden" aria-hidden>
          <div
            className={cn('h-full rounded-full transition-[width] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]', bar)}
            style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
          />
        </div>
      )}
      {target && (
        <p className="mt-1 text-[10px] leading-none text-zinc-400 dark:text-zinc-500 tabular-nums truncate" aria-hidden>
          meta {target}
        </p>
      )}
    </div>
  );
}

function DaySummary({ calories, caloriesTarget, protein, proteinTarget, waterMl, waterTargetMl }: {
  calories: number; caloriesTarget: number | null;
  protein: number; proteinTarget: number | null;
  waterMl: number; waterTargetMl: number;
}) {
  const liters = (ml: number) => (ml / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
  const pct = (v: number, t: number | null) => (t ? (v / t) * 100 : null);
  return (
    <div className="grid grid-cols-3 gap-1.5 flex-shrink-0" aria-label="Resumo de hoje">
      <DayStat icon={Flame} tone="text-orange-500" bar="bg-orange-400" label="calorias consumidas"
        value={fmt(calories)} target={caloriesTarget ? fmt(caloriesTarget) : null} unit="kcal"
        pct={pct(calories, caloriesTarget)} />
      <DayStat icon={Beef} tone="text-rose-500" bar="bg-rose-400" label="proteína"
        value={fmt(protein)} target={proteinTarget ? fmt(proteinTarget) : null} unit="g"
        pct={pct(protein, proteinTarget)} />
      <DayStat icon={Droplets} tone="text-sky-500" bar="bg-sky-400" label="água"
        value={liters(waterMl)} target={liters(waterTargetMl)} unit="L"
        pct={pct(waterMl, waterTargetMl)} />
    </div>
  );
}

/* ─── Boas-vindas ───────────────────────────────────────────────────────── */

function Intro({ firstName, suggestions, onPick, onAbout, disabled }: {
  firstName: string | null; suggestions: string[]; onPick: (text: string) => void;
  onAbout: () => void; disabled: boolean;
}) {
  return (
    <div className="flex flex-col items-center text-center pt-3 pb-1 stagger" style={{ ['--enter-base' as string]: '0.12s' }}>
      <div className="relative h-[92px] w-[92px] flex items-center justify-center">
        <span className="nina-halo absolute inset-0 rounded-full bg-emerald-400/20 dark:bg-emerald-400/10" aria-hidden />
        <span className="nina-halo absolute inset-3 rounded-full bg-emerald-400/25 dark:bg-emerald-400/15" style={{ animationDelay: '0.4s' }} aria-hidden />
        <span className="relative nina-float"><CoachAvatar size={68} className="shadow-lg shadow-emerald-600/25" /></span>
      </div>

      <div className="mt-3">
        <h2 className="text-[19px] font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          Oi{firstName ? `, ${firstName}` : ''}! <span className="inline-block nina-wave">👋</span>
        </h2>
        <p className="mt-1 text-[13px] leading-relaxed text-zinc-500 dark:text-zinc-400 max-w-[300px] mx-auto">
          Eu sou a {COACH_NAME}, sua coach de saúde. Já estou vendo seus números de hoje — me conta o que comeu ou pergunte o que quiser.
        </p>
      </div>

      <div className="mt-4 w-full flex flex-col gap-1.5">
        {suggestions.map((s) => (
          <button
            key={s}
            type="button"
            disabled={disabled}
            onClick={() => onPick(s)}
            className="group w-full flex items-center gap-2.5 text-left rounded-2xl border border-zinc-200/70 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3.5 py-2.5 transition-[transform,border-color,background-color,box-shadow] duration-200 hover:border-emerald-300 dark:hover:border-emerald-800 hover:shadow-md hover:shadow-emerald-600/5 active:scale-[0.98] disabled:opacity-50"
          >
            <span className="h-7 w-7 flex-shrink-0 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 flex items-center justify-center transition-transform duration-300 group-hover:rotate-12">
              <Sparkles size={13} className="text-emerald-600 dark:text-emerald-400" />
            </span>
            <span className="flex-1 text-[13px] font-medium text-zinc-700 dark:text-zinc-200">{s}</span>
            <ChevronRight size={14} className="text-zinc-300 dark:text-zinc-600 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-emerald-500" />
          </button>
        ))}
      </div>

      <div className="mt-4 w-full rounded-2xl bg-zinc-100/70 dark:bg-zinc-900/60 p-3 text-left">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500 mb-2">O que eu faço</p>
        <ul className="grid grid-cols-2 gap-x-2 gap-y-2">
          {COACH_CAPABILITIES.map((c) => {
            const Icon = CAPABILITY_ICON[c.icon];
            return (
              <li key={c.title} className="flex items-center gap-2">
                <span className="h-6 w-6 flex-shrink-0 rounded-lg bg-white dark:bg-zinc-800 flex items-center justify-center">
                  <Icon size={11} className="text-emerald-600 dark:text-emerald-400" />
                </span>
                <span className="text-[11px] text-zinc-600 dark:text-zinc-300 leading-tight">{c.title}</span>
              </li>
            );
          })}
        </ul>
        <button
          type="button"
          onClick={onAbout}
          className="mt-2.5 inline-flex items-center gap-0.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 hover:underline"
        >
          Conheça a {COACH_NAME} e dicas de uso <ChevronRight size={11} />
        </button>
      </div>
    </div>
  );
}

/* ─── Chat ──────────────────────────────────────────────────────────────── */

const MAX_HISTORY = 10;
const MAX_INPUT_CHARS = 2000;
const GENERIC_ERROR = 'Desculpe, tive um problema. Tente novamente.';

/** Mensagem como vem de /api/chat/history. */
interface HistoryRow {
  id: string;
  role: string;
  content: string;
  rating?: 1 | -1 | null;
  food_log?: unknown;
}

interface NinaChatProps {
  userId: string;
  /** Dia (Brasil) dos totais: a conversa guardada é descartada quando o dia vira. */
  day: string;
  profile: Profile;
  initialCalories: number;
  initialProtein: number;
  initialWater: number;
}

export default function NinaChat({ userId, day, profile, initialCalories, initialProtein, initialWater }: NinaChatProps) {
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [pending, setPending] = useState<StoredChat['pending']>(null);
  const [hydrated, setHydrated] = useState(false);
  // Mensagens já na tela ao abrir não animam de novo; só as novas.
  const [animateFrom, setAnimateFrom] = useState(0);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [atBottom, setAtBottom] = useState(true);
  // Hora local (para sugerir a refeição certa); só no cliente.
  const [hour, setHour] = useState(12);
  const [totals, setTotals] = useState({ calories: initialCalories, protein: initialProtein });

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const conversationIdRef = useRef<string | null>(null);
  // Turno em andamento: hora do último evento recebido (inclui o ping de 8 s).
  const abortRef = useRef<AbortController | null>(null);
  const lastEventRef = useRef(0);
  const mountedRef = useRef(true);
  const messagesRef = useRef<UiMessage[]>([]);
  useEffect(() => { messagesRef.current = messages; }, [messages]);

  const firstName = profile.full_name?.split(' ')[0] ?? null;

  /* Rolagem */
  const scrollToBottom = useCallback((smooth = true) => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  }, []);

  const onScroll = () => {
    const el = scrollRef.current;
    if (el) setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 80);
  };

  /* Ciclo de vida */
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
    };
  }, []);

  /* Mensagens: adicionar resposta / erro */
  const addReply = useCallback((reply: { id?: string | null; content: string; rating?: 1 | -1 | null; foodLog?: unknown }) => {
    if (!mountedRef.current) return;
    const food = toLoggedFood(reply.foodLog);
    setMessages((prev) => [...prev, {
      key: newId(),
      role: 'assistant',
      content: reply.content,
      id: reply.id ?? undefined,
      rating: reply.rating ?? null,
      foodLog: food,
    }]);
    if (food && food.calories > 0) {
      setTotals((t) => ({ calories: t.calories + food.calories, protein: t.protein + (food.protein ?? 0) }));
    }
  }, []);

  const addError = useCallback((content: string, retryText?: string) => {
    if (!mountedRef.current) return;
    setMessages((prev) => [...prev, { key: newId(), role: 'assistant', content, error: true, retryText }]);
  }, []);

  /** A conexão caiu: o servidor termina e grava a resposta — busca no histórico. */
  const recover = useCallback(async (conversationId: string, questionId: string, text: string) => {
    setStatus('A conexão caiu — buscando sua resposta…');
    const reply = await waitForReply<HistoryRow>(
      async () => {
        const r = await fetch(`/api/chat/history?conversation_id=${conversationId}`, { cache: 'no-store' });
        if (r.status === 501) throw new HistoryUnavailableError();
        if (!r.ok) throw new Error(`history ${r.status}`);
        const data = await r.json();
        return Array.isArray(data.messages) ? data.messages : [];
      },
      questionId,
      () => mountedRef.current,
      { visible: () => document.visibilityState !== 'hidden' }
    );
    if (!mountedRef.current) return;
    if (reply) addReply({ id: reply.id, content: reply.content, rating: reply.rating, foodLog: reply.food_log });
    else addError(GENERIC_ERROR, text);
  }, [addReply, addError]);

  // Restaura a conversa da aba (e busca a resposta que ficou pendente).
  useEffect(() => {
    const saved = loadChat(userId, day);
    /* eslint-disable react-hooks/set-state-in-effect -- sessionStorage e a hora
       local só existem no cliente: ler no render quebraria a hidratação. */
    setHour(new Date().getHours());
    if (saved) {
      conversationIdRef.current = saved.conversationId;
      setMessages(saved.messages);
      setAnimateFrom(saved.messages.length);
      if (saved.pending && saved.conversationId) {
        const { questionId, text } = saved.pending;
        setPending(saved.pending);
        setLoading(true);
        recover(saved.conversationId, questionId, text).finally(() => {
          if (!mountedRef.current) return;
          setPending(null);
          setStatus(null);
          setLoading(false);
        });
      }
    }
    setHydrated(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Guarda a conversa a cada mudança.
  useEffect(() => {
    if (!hydrated) return;
    if (messages.length === 0 && !pending) { clearChat(userId); return; }
    saveChat(userId, { day, conversationId: conversationIdRef.current, messages, pending });
  }, [hydrated, messages, pending, userId, day]);

  // Ao abrir, vai direto para o fim; depois, segue as novas mensagens.
  useLayoutEffect(() => {
    if (hydrated && messages.length > 0) scrollToBottom(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, scrollToBottom]);

  useEffect(() => {
    if (!hydrated || messages.length === 0) return;
    const last = messages[messages.length - 1];
    if (atBottom || last?.role === 'user') scrollToBottom();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length, loading, status]);

  // Voltou para o app com uma resposta em andamento e sem sinal do servidor
  // há um tempo: a conexão morreu em segundo plano. Encerra e busca no histórico.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible' || !abortRef.current) return;
      if (Date.now() - lastEventRef.current < NO_SIGNAL_MS) return;
      abortRef.current.abort();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  // Campo de texto cresce com o conteúdo (até ~5 linhas).
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 132)}px`;
  }, [input]);

  const rateMessage = useCallback<Rate>((messageId, rating, comment) => {
    setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, rating } : m)));
    fetch('/api/chat/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message_id: messageId, rating, comment }),
    }).catch(() => { /* avaliação é opcional: não atrapalha o chat */ });
  }, []);

  const send = useCallback(async (raw: string, base?: UiMessage[]) => {
    const text = raw.trim().slice(0, MAX_INPUT_CHARS);
    if (!text || loading) return;

    const conversationId = (conversationIdRef.current ??= newId());
    const questionId = newId();
    const userMsg: UiMessage = { key: newId(), id: questionId, role: 'user', content: text };
    const history = [...(base ?? messagesRef.current), userMsg];
    setMessages(history);
    setPending({ questionId, text });
    setInput('');
    setLoading(true);

    const controller = new AbortController();
    abortRef.current = controller;
    lastEventRef.current = Date.now();

    try {
      // Limita o histórico enviado; respostas de erro não são conversa.
      const trimmed = history.filter((m) => !m.error).slice(-MAX_HISTORY);

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          conversation_id: conversationId,
          message_id: questionId,
          messages: trimmed.map((m) => ({ role: m.role, content: m.content })),
        }),
      });

      if (!res.ok || !res.body || !res.headers.get('content-type')?.includes('text/event-stream')) {
        const data = await res.json().catch(() => ({}));
        addError(data.error ?? GENERIC_ERROR, text);
        return;
      }

      let finished = false;
      for await (const event of readSSE(res.body)) {
        lastEventRef.current = Date.now();
        if (event.type === 'done') {
          finished = true;
          const d = event.data;
          addReply({
            id: typeof d.message_id === 'string' ? d.message_id : null,
            content: typeof d.message === 'string' && d.message ? d.message : GENERIC_ERROR,
            foodLog: d.foodLogged ? d.foodLog : null,
          });
        } else if (event.type === 'error') {
          finished = true;
          addError(typeof event.data.error === 'string' ? event.data.error : GENERIC_ERROR, text);
        }
      }
      // Stream fechado sem "done" nem "error": a conexão caiu no meio.
      if (!finished) throw new Error('stream interrompido');
    } catch {
      // Saiu da tela no meio: a resposta pendente é buscada quando voltar.
      if (!mountedRef.current) return;
      await recover(conversationId, questionId, text);
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      if (mountedRef.current) {
        setPending(null);
        setStatus(null);
        setLoading(false);
      }
    }
  }, [loading, addReply, addError, recover]);

  /** Reenvia a pergunta que falhou, sem duplicar a bolha. */
  const retry = useCallback((errorMsg: UiMessage) => {
    if (!errorMsg.retryText || loading) return;
    const list = messagesRef.current;
    const i = list.findIndex((m) => m.key === errorMsg.key);
    // Remove o erro e a pergunta que o originou (a anterior do usuário).
    let base = list.slice(0, i);
    if (base[base.length - 1]?.role === 'user') base = base.slice(0, -1);
    send(errorMsg.retryText, base);
  }, [loading, send]);

  const newConversation = () => {
    if (loading) return;
    abortRef.current?.abort();
    conversationIdRef.current = null;
    setMessages([]);
    setAnimateFrom(0);
    setPending(null);
    setInput('');
    clearChat(userId);
    inputRef.current?.focus();
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    send(input);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send(input);
    }
  };

  const started = messages.length > 0;
  const canSend = input.trim().length > 0 && !loading;
  const suggestions = coachSuggestions({
    hour,
    caloriesLeft: profile.target_calories ? profile.target_calories - totals.calories : null,
    proteinLeft: profile.target_protein_g ? profile.target_protein_g - totals.protein : null,
    waterLeftMl: profile.target_water_ml - initialWater,
  });

  return (
    <div
      className="flex flex-col gap-2.5 pt-3"
      // Ocupa a tela entre o cabeçalho (56 px) e o menu inferior; o espaço
      // de baixo do <main> fica para o botão elevado da Nina.
      style={{ height: 'calc(100dvh - 56px - 5.5rem - env(safe-area-inset-bottom))' }}
    >
      {/* Cabeçalho */}
      <div className="surface flex items-center gap-3 px-3 py-2.5 flex-shrink-0">
        <button
          type="button"
          onClick={() => setAboutOpen(true)}
          className="flex items-center gap-3 min-w-0 text-left rounded-xl -m-1 p-1 hover:bg-zinc-50 dark:hover:bg-zinc-800/60 transition-colors"
          aria-label={`Sobre a ${COACH_NAME}`}
        >
          <span className="relative">
            <CoachAvatar size={40} className={cn(loading && 'nina-typing-avatar')} />
            <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full ring-2 ring-white dark:ring-[#141416]">
              <span className="nina-online absolute inset-0 rounded-full bg-emerald-400" aria-hidden />
              <span className="absolute inset-0 rounded-full bg-emerald-500" />
            </span>
          </span>
          <span className="min-w-0">
            <span className="flex items-center gap-1 text-[15px] font-bold text-zinc-900 dark:text-zinc-50 leading-none">
              {COACH_NAME}
              <Info size={12} className="text-zinc-400 dark:text-zinc-500" />
            </span>
            <span className="relative block h-[14px] mt-1 overflow-hidden text-[11px] font-medium">
              <span
                key={loading ? 'typing' : 'idle'}
                className={cn('block animate-fade-in', loading ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-500 dark:text-zinc-400')}
              >
                {loading ? 'digitando…' : `${COACH_ROLE} · online`}
              </span>
            </span>
          </span>
        </button>
        <button
          type="button"
          onClick={newConversation}
          disabled={!started || loading}
          aria-label="Nova conversa"
          title="Nova conversa"
          className="ml-auto h-9 w-9 rounded-xl bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 flex items-center justify-center text-zinc-500 dark:text-zinc-400 transition-[background-color,transform,opacity] active:scale-90 disabled:opacity-30"
        >
          <SquarePen size={15} />
        </button>
      </div>

      <DaySummary
        calories={totals.calories}
        caloriesTarget={profile.target_calories}
        protein={totals.protein}
        proteinTarget={profile.target_protein_g}
        waterMl={initialWater}
        waterTargetMl={profile.target_water_ml}
      />

      {/* Mensagens */}
      <div className="relative flex-1 min-h-0">
        <div
          ref={scrollRef}
          onScroll={onScroll}
          className="chat-scroll h-full overflow-y-auto overscroll-contain scrollbar-hide px-0.5 py-3 flex flex-col gap-2"
          aria-live="polite"
        >
          {hydrated && !started && (
            <Intro
              firstName={firstName}
              suggestions={suggestions}
              onPick={(s) => send(s)}
              onAbout={() => setAboutOpen(true)}
              disabled={loading}
            />
          )}
          {messages.map((msg, i) => {
            const next = messages[i + 1];
            return (
              <div key={msg.key} className={cn(i > 0 && messages[i - 1].role !== msg.role && 'mt-2')}>
                <MessageRow
                  msg={msg}
                  // Avatar e "rabinho" só na última bolha de uma sequência.
                  showAvatar={!next || next.role !== msg.role}
                  animate={i >= animateFrom}
                  onRate={rateMessage}
                  onRetry={retry}
                />
              </div>
            );
          })}
          {loading && <div className="mt-2"><Typing status={status} /></div>}
        </div>

        {/* Voltar ao fim */}
        <button
          type="button"
          onClick={() => scrollToBottom()}
          aria-label="Ir para a última mensagem"
          tabIndex={atBottom ? -1 : 0}
          className={cn(
            'absolute bottom-2 left-1/2 -translate-x-1/2 h-8 w-8 rounded-full bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 shadow-lg shadow-black/10 flex items-center justify-center text-zinc-500 dark:text-zinc-300 transition-all duration-300',
            atBottom ? 'opacity-0 scale-75 translate-y-2 pointer-events-none' : 'opacity-100 scale-100 translate-y-0'
          )}
        >
          <ChevronDown size={16} />
        </button>
      </div>

      {/* Entrada */}
      <form
        onSubmit={onSubmit}
        className="flex-shrink-0 flex items-end gap-2 rounded-[24px] bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 p-1.5 pl-4 shadow-lg shadow-black/[0.04] dark:shadow-black/40 transition-[box-shadow,border-color] duration-200 focus-within:border-emerald-400/70 dark:focus-within:border-emerald-700 focus-within:shadow-emerald-600/10"
      >
        <textarea
          ref={inputRef}
          rows={1}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          maxLength={MAX_INPUT_CHARS}
          enterKeyHint="send"
          placeholder={loading ? `${COACH_NAME} está respondendo…` : `Fale com a ${COACH_NAME}…`}
          aria-label={`Mensagem para a ${COACH_NAME}`}
          // O contorno fica no formulário (focus-within); o :focus-visible
          // global não está em camada e venceria uma classe utilitária.
          style={{ outline: 'none' }}
          className="flex-1 min-w-0 resize-none bg-transparent py-2 text-[14px] leading-[22px] text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none scrollbar-hide"
        />
        <button
          type="submit"
          disabled={!canSend}
          aria-label="Enviar"
          className={cn(
            'h-9 w-9 flex-shrink-0 rounded-full flex items-center justify-center transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] active:scale-90',
            canSend
              ? 'bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-md shadow-emerald-600/30 scale-100'
              : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500 scale-90'
          )}
        >
          <ArrowUp size={17} strokeWidth={2.5} />
        </button>
      </form>

      <CoachAboutModal open={aboutOpen} onClose={() => setAboutOpen(false)} />
    </div>
  );
}
