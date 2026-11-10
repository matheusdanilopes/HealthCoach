'use client';

import { useState, useRef, useEffect, memo, useCallback } from 'react';
import { X, Send, Loader2, User, ThumbsUp, ThumbsDown, Info, Flame, Beef, Droplets, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { readSSE } from '@/lib/chat/sse';
import { HistoryUnavailableError, NO_SIGNAL_MS, newId, waitForReply } from '@/lib/chat/recovery';
import { COACH_CAPABILITIES, COACH_NAME, COACH_ROLE, coachSuggestions } from '@/lib/coach-persona';
import type { ChatMessage, FoodLog, Profile } from '@/types';
import CoachAvatar from './CoachAvatar';
import CoachAboutModal, { CAPABILITY_ICON } from './CoachAboutModal';

interface AIChatProps {
  profile: Profile;
  dailyCalories: number;
  dailyProtein: number;
  dailyWater: number;
  userId: string;
  onFoodLogged?: (log: FoodLog) => void;
}

type Rate = (messageId: string, rating: 1 | -1 | null, comment?: string) => void;

/** 👍/👎 da resposta. O 👎 abre um campo opcional "o que estava errado?". */
function Rating({ messageId, value, onRate }: { messageId: string; value: 1 | -1 | null | undefined; onRate: Rate }) {
  const [commenting, setCommenting] = useState(false);
  const [comment, setComment] = useState('');
  const [sent, setSent] = useState(false);

  const base = 'inline-flex items-center rounded-full p-1 transition-colors';
  const idle = 'text-zinc-400 dark:text-zinc-500 hover:text-emerald-600 dark:hover:text-emerald-400';

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-0.5">
      <button
        type="button"
        onClick={() => { setCommenting(false); onRate(messageId, value === 1 ? null : 1); }}
        aria-label={value === 1 ? 'Desfazer avaliação positiva' : 'Resposta útil'}
        aria-pressed={value === 1}
        className={cn(base, value === 1 ? 'text-emerald-600 dark:text-emerald-400' : idle)}
      >
        <ThumbsUp size={12} />
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
        <ThumbsDown size={12} />
      </button>
      {commenting && value === -1 && (
        <form
          className="basis-full mt-1 flex items-center gap-1.5"
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
            className="flex-1 min-w-0 text-[12px] rounded-full border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900/40 px-3 py-1.5 text-zinc-700 dark:text-zinc-200 placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-emerald-400"
          />
          <button type="submit" className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400 px-2 py-1.5">
            Enviar
          </button>
        </form>
      )}
      {sent && value === -1 && (
        <span className="basis-full text-[10px] text-zinc-400 dark:text-zinc-500">Obrigada — isso me ajuda a melhorar.</span>
      )}
    </div>
  );
}

const MessageBubble = memo(function MessageBubble({ msg, onRate }: { msg: ChatMessage; onRate: Rate }) {
  const isUser = msg.role === 'user';
  return (
    <div className={cn('flex gap-2 items-end', isUser ? 'flex-row-reverse' : 'flex-row')}>
      {isUser ? (
        <div className="h-6 w-6 rounded-full flex items-center justify-center flex-shrink-0 bg-emerald-100 dark:bg-emerald-900/40">
          <User size={10} className="text-emerald-600 dark:text-emerald-400" />
        </div>
      ) : (
        <CoachAvatar size={24} />
      )}
      <div className={cn(
        'max-w-[80%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed',
        isUser
          ? 'bg-emerald-600 text-white rounded-br-sm'
          : 'bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 rounded-bl-sm border border-zinc-100 dark:border-zinc-700/60'
      )}>
        {msg.content.split('\n').map((line, i, arr) => (
          <span key={i}>{line}{i < arr.length - 1 && <br />}</span>
        ))}
        {!isUser && msg.id && <Rating messageId={msg.id} value={msg.rating} onRate={onRate} />}
      </div>
    </div>
  );
});

const fmt = (n: number) => Math.round(n).toLocaleString('pt-BR');

function DayStat({ icon: Icon, tone, value, target, unit, label }: {
  icon: typeof Flame; tone: string; value: string; target: string | null; unit: string; label: string;
}) {
  return (
    <div className="flex-auto min-w-0 flex items-center gap-1.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 px-2 py-1.5" title={label}>
      <Icon size={12} className={cn('flex-shrink-0', tone)} aria-hidden />
      <p className="text-[11px] leading-tight text-zinc-500 dark:text-zinc-400 truncate">
        <span className="font-semibold tabular-nums text-zinc-800 dark:text-zinc-100">{value}</span>
        {target && <span className="tabular-nums">/{target}</span>}
        <span className="sr-only"> {label}</span> {unit}
      </p>
    </div>
  );
}

/** Resumo do dia no topo do chat: o que a Nina está vendo agora. */
function DaySummary({ calories, caloriesTarget, protein, proteinTarget, waterMl, waterTargetMl }: {
  calories: number; caloriesTarget: number | null;
  protein: number; proteinTarget: number | null;
  waterMl: number; waterTargetMl: number;
}) {
  const liters = (ml: number) => (ml / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
  return (
    <div className="flex gap-1.5 px-3 py-2 border-b border-zinc-100 dark:border-zinc-800/60 flex-shrink-0" aria-label="Resumo de hoje">
      <DayStat icon={Flame} tone="text-orange-500" label="calorias consumidas"
        value={fmt(calories)} target={caloriesTarget ? fmt(caloriesTarget) : null} unit="kcal" />
      <DayStat icon={Beef} tone="text-rose-500" label="proteína"
        value={fmt(protein)} target={proteinTarget ? fmt(proteinTarget) : null} unit="g" />
      <DayStat icon={Droplets} tone="text-sky-500" label="água"
        value={liters(waterMl)} target={liters(waterTargetMl)} unit="L" />
    </div>
  );
}

/** Apresentação da Nina e perguntas prontas, enquanto a conversa não começou. */
function Intro({ suggestions, onPick, onAbout, disabled }: {
  suggestions: string[]; onPick: (text: string) => void; onAbout: () => void; disabled: boolean;
}) {
  return (
    <div className="flex flex-col gap-3 pl-8">
      <div className="flex flex-wrap gap-1.5">
        {suggestions.map((s) => (
          <button
            key={s}
            type="button"
            disabled={disabled}
            onClick={() => onPick(s)}
            className="text-[12px] rounded-full border border-emerald-200 dark:border-emerald-800/70 bg-emerald-50/60 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 px-3 py-1.5 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 disabled:opacity-50 transition-colors"
          >
            {s}
          </button>
        ))}
      </div>
      <div className="rounded-2xl border border-zinc-100 dark:border-zinc-700/60 bg-white dark:bg-zinc-800 p-3">
        <p className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 mb-2">O que eu faço</p>
        <ul className="grid grid-cols-2 gap-x-2 gap-y-2">
          {COACH_CAPABILITIES.map((c) => {
            const Icon = CAPABILITY_ICON[c.icon];
            return (
              <li key={c.title} className="flex items-center gap-2">
                <span className="h-6 w-6 flex-shrink-0 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 flex items-center justify-center">
                  <Icon size={11} className="text-emerald-600 dark:text-emerald-400" />
                </span>
                <span className="text-[11px] text-zinc-700 dark:text-zinc-200 leading-tight">{c.title}</span>
              </li>
            );
          })}
        </ul>
        <button
          type="button"
          onClick={onAbout}
          className="mt-2.5 inline-flex items-center gap-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400 hover:underline"
        >
          Conheça a {COACH_NAME} e dicas de uso <ChevronRight size={11} />
        </button>
      </div>
    </div>
  );
}

const MAX_HISTORY = 10;

/** Mensagem como vem de /api/chat/history. */
interface HistoryRow {
  id: string;
  role: string;
  content: string;
  rating?: 1 | -1 | null;
  food_log?: unknown;
}

export default function AIChat({ profile, dailyCalories, dailyProtein, dailyWater, onFoodLogged }: AIChatProps) {
  const [open, setOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  // Hora local em que o chat foi aberto (para sugerir a refeição certa).
  const [hour, setHour] = useState(12);
  const [messages, setMessages] = useState<ChatMessage[]>([{
    role: 'assistant',
    content: `Oi${profile.full_name ? `, ${profile.full_name.split(' ')[0]}` : ''}! Eu sou a ${COACH_NAME}, sua coach de saúde 🌿\nMe conta o que você comeu ou pergunte o que quiser. Já estou vendo seus números de hoje.`,
  }]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Scroll to bottom only when messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input when chat opens
  useEffect(() => {
    if (open) {
      const t = setTimeout(() => inputRef.current?.focus(), 100);
      return () => clearTimeout(t);
    }
  }, [open]);

  // Conversa desta tela (o chat começa do zero a cada abertura do dashboard):
  // é por ela, e pelo id da pergunta, que a resposta é achada no histórico.
  const conversationIdRef = useRef<string | null>(null);
  // Turno em andamento: hora do último evento recebido (inclui o ping de 8 s)
  // e pedido de reconexão (o app voltou do segundo plano com o stream parado).
  const abortRef = useRef<AbortController | null>(null);
  const lastEventRef = useRef(0);
  const mountedRef = useRef(true);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
    };
  }, []);

  // Voltou para o app com uma resposta em andamento e sem sinal do servidor
  // há um tempo: a conexão morreu em segundo plano (alguns navegadores deixam
  // o fetch "pendurado" em vez de falhar). Encerra e vai buscar no histórico.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible' || !abortRef.current) return;
      if (Date.now() - lastEventRef.current < NO_SIGNAL_MS) return;
      abortRef.current.abort();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  const rateMessage = useCallback<Rate>((messageId, rating, comment) => {
    setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, rating } : m)));
    fetch('/api/chat/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message_id: messageId, rating, comment }),
    }).catch(() => { /* avaliação é opcional: não atrapalha o chat */ });
  }, []);

  const send = useCallback(async (raw: string) => {
    const text = raw.trim();
    if (!text || loading) return;

    const conversationId = (conversationIdRef.current ??= newId());
    const userMsg: ChatMessage = { id: newId(), role: 'user', content: text };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    const controller = new AbortController();
    abortRef.current = controller;
    lastEventRef.current = Date.now();

    const addReply = (reply: { id?: string | null; content: string; rating?: 1 | -1 | null; foodLog?: unknown }) => {
      if (!mountedRef.current) return;
      setMessages((prev) => [...prev, {
        role: 'assistant',
        content: reply.content,
        id: reply.id ?? undefined,
        rating: reply.rating ?? null,
      }]);
      // Optimistic update - no router.refresh() needed
      if (reply.foodLog && onFoodLogged) onFoodLogged(reply.foodLog as FoodLog);
    };
    const addError = (content: string, restoreInput: boolean) => {
      if (!mountedRef.current) return;
      // Restore input so the user can resend without retyping
      if (restoreInput) setInput(text);
      setMessages((prev) => [...prev, { role: 'assistant', content }]);
    };

    try {
      // Limit history sent to reduce payload size
      const trimmed = [...messages, userMsg].slice(-MAX_HISTORY);

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          conversation_id: conversationId,
          message_id: userMsg.id,
          messages: trimmed.map((m) => ({ role: m.role, content: m.content })),
        }),
      });

      if (!res.ok || !res.body || !res.headers.get('content-type')?.includes('text/event-stream')) {
        const data = await res.json().catch(() => ({}));
        addError(data.error ?? 'Desculpe, tive um problema. Tente novamente.', res.status === 503 || res.status === 429);
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
            content: typeof d.message === 'string' && d.message ? d.message : 'Desculpe, tive um problema. Tente novamente.',
            foodLog: d.foodLogged ? d.foodLog : null,
          });
        } else if (event.type === 'error') {
          finished = true;
          const code = Number(event.data.status);
          addError(
            typeof event.data.error === 'string' ? event.data.error : 'Desculpe, tive um problema. Tente novamente.',
            code === 503 || code === 429
          );
        }
      }
      // Stream fechado sem "done" nem "error": a conexão caiu no meio.
      if (!finished) throw new Error('stream interrompido');
    } catch {
      // A conexão caiu (quase sempre: a pessoa saiu do app no meio da espera).
      // O servidor termina e grava a resposta mesmo assim — busca no histórico
      // antes de falar em erro.
      if (!mountedRef.current) return;
      setStatus('A conexão caiu — buscando sua resposta…');
      const reply = await waitForReply<HistoryRow>(
        async () => {
          const r = await fetch(`/api/chat/history?conversation_id=${conversationId}`, { cache: 'no-store' });
          if (r.status === 501) throw new HistoryUnavailableError();
          if (!r.ok) throw new Error(`history ${r.status}`);
          const data = await r.json();
          return Array.isArray(data.messages) ? data.messages : [];
        },
        userMsg.id!,
        () => mountedRef.current,
        { visible: () => document.visibilityState !== 'hidden' }
      );
      if (reply) {
        addReply({ id: reply.id, content: reply.content, rating: reply.rating, foodLog: reply.food_log });
      } else {
        addError('Desculpe, tive um problema. Tente novamente.', true);
      }
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      if (mountedRef.current) {
        setStatus(null);
        setLoading(false);
      }
    }
  }, [loading, messages, onFoodLogged]);

  const sendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    send(input);
  };

  const started = messages.some((m) => m.role === 'user');
  const suggestions = coachSuggestions({
    hour,
    caloriesLeft: profile.target_calories ? profile.target_calories - dailyCalories : null,
    proteinLeft: profile.target_protein_g ? profile.target_protein_g - dailyProtein : null,
    waterLeftMl: profile.target_water_ml - dailyWater,
  });

  return (
    <>
      {/* FAB */}
      {!open && (
        <button
          onClick={() => { setHour(new Date().getHours()); setOpen(true); }}
          className="fixed bottom-[68px] right-4 z-40 h-12 w-12 rounded-full shadow-lg shadow-emerald-600/30 ring-2 ring-white dark:ring-zinc-900 flex items-center justify-center transition-all duration-200 active:scale-95 hover:scale-105"
          aria-label={`Conversar com a ${COACH_NAME}, sua coach`}
        >
          <CoachAvatar size={48} />
        </button>
      )}

      {/* Chat window */}
      {open && (
        <div className="fixed bottom-[64px] right-0 left-0 sm:left-auto sm:right-4 z-50 sm:w-[380px] animate-slide-up">
          <div
            className="mx-3 sm:mx-0 bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800/80 rounded-2xl shadow-2xl shadow-black/10 dark:shadow-black/60 flex flex-col overflow-hidden"
            style={{ maxHeight: '75vh', height: 520 }}
          >
            {/* Header */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-100 dark:border-zinc-800/60 flex-shrink-0">
              <button
                type="button"
                onClick={() => setAboutOpen(true)}
                className="flex items-center gap-2.5 min-w-0 text-left rounded-xl -m-1 p-1 hover:bg-zinc-50 dark:hover:bg-zinc-800/60 transition-colors"
                aria-label={`Sobre a ${COACH_NAME}`}
              >
                <span className="relative">
                  <CoachAvatar size={34} />
                  <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-zinc-900" />
                </span>
                <span className="min-w-0">
                  <span className="flex items-center gap-1 text-[13px] font-semibold text-zinc-900 dark:text-zinc-100 leading-none">
                    {COACH_NAME}
                    <Info size={11} className="text-zinc-400 dark:text-zinc-500" />
                  </span>
                  <span className="block text-[10px] text-emerald-600 dark:text-emerald-400 mt-1 font-medium">
                    {COACH_ROLE} · online
                  </span>
                </span>
              </button>
              <button
                onClick={() => setOpen(false)}
                aria-label="Fechar chat"
                className="ml-auto h-7 w-7 rounded-lg bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 flex items-center justify-center text-zinc-400 dark:text-zinc-500 transition-colors"
              >
                <X size={12} />
              </button>
            </div>

            <DaySummary
              calories={dailyCalories}
              caloriesTarget={profile.target_calories}
              protein={dailyProtein}
              proteinTarget={profile.target_protein_g}
              waterMl={dailyWater}
              waterTargetMl={profile.target_water_ml}
            />

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 bg-zinc-50/40 dark:bg-zinc-950/40">
              {messages.map((msg, i) => (
                <MessageBubble key={msg.id ?? i} msg={msg} onRate={rateMessage} />
              ))}
              {!started && (
                <Intro suggestions={suggestions} onPick={send} onAbout={() => setAboutOpen(true)} disabled={loading} />
              )}
              {loading && (
                <div className="flex items-center gap-2">
                  <CoachAvatar size={24} />
                  <div className="bg-white dark:bg-zinc-800 border border-zinc-100 dark:border-zinc-700/60 rounded-2xl rounded-bl-sm px-4 py-2.5 flex items-center gap-2">
                    <Loader2 size={11} className="animate-spin text-zinc-400" />
                    {status && <span className="text-[12px] text-zinc-500 dark:text-zinc-400">{status}</span>}
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            {/* Input */}
            <form
              onSubmit={sendMessage}
              className="flex items-center gap-2 p-3 border-t border-zinc-100 dark:border-zinc-800/60 flex-shrink-0 bg-white dark:bg-zinc-900"
            >
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={`Fale com a ${COACH_NAME}…`}
                aria-label={`Mensagem para a ${COACH_NAME}`}
                disabled={loading}
                className="flex-1 h-10 bg-zinc-50/80 dark:bg-zinc-800/50 border border-zinc-200/80 dark:border-zinc-700/50 rounded-xl px-3.5 text-[13px] text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/25 focus:border-emerald-400/80 disabled:opacity-50 transition-all"
              />
              <button
                type="submit"
                disabled={!input.trim() || loading}
                aria-label="Enviar"
                className="h-10 w-10 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-30 flex items-center justify-center text-white transition-all active:scale-95"
              >
                <Send size={13} />
              </button>
            </form>
          </div>
        </div>
      )}

      <CoachAboutModal open={aboutOpen} onClose={() => setAboutOpen(false)} />
    </>
  );
}
