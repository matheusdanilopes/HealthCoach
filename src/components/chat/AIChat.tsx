'use client';

import { useState, useRef, useEffect, memo, useCallback } from 'react';
import { X, Send, Loader2, Bot, User, Sparkles, ThumbsUp, ThumbsDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { readSSE } from '@/lib/chat/sse';
import { HistoryUnavailableError, NO_SIGNAL_MS, newId, waitForReply } from '@/lib/chat/recovery';
import type { ChatMessage, FoodLog, Profile } from '@/types';

interface AIChatProps {
  profile: Profile;
  dailyCalories: number;
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
        <span className="basis-full text-[10px] text-zinc-400 dark:text-zinc-500">Obrigado — isso ajuda o Coach a melhorar.</span>
      )}
    </div>
  );
}

const MessageBubble = memo(function MessageBubble({ msg, onRate }: { msg: ChatMessage; onRate: Rate }) {
  const isUser = msg.role === 'user';
  return (
    <div className={cn('flex gap-2 items-end', isUser ? 'flex-row-reverse' : 'flex-row')}>
      <div className={cn(
        'h-6 w-6 rounded-full flex items-center justify-center flex-shrink-0',
        isUser
          ? 'bg-emerald-100 dark:bg-emerald-900/40'
          : 'bg-zinc-100 dark:bg-zinc-800'
      )}>
        {isUser
          ? <User size={10} className="text-emerald-600 dark:text-emerald-400" />
          : <Bot size={10} className="text-zinc-500 dark:text-zinc-400" />
        }
      </div>
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

const MAX_HISTORY = 10;

/** Mensagem como vem de /api/chat/history. */
interface HistoryRow {
  id: string;
  role: string;
  content: string;
  rating?: 1 | -1 | null;
  food_log?: unknown;
}

export default function AIChat({ profile, dailyCalories, dailyWater, userId, onFoodLogged }: AIChatProps) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([{
    role: 'assistant',
    content: `Olá${profile.full_name ? `, ${profile.full_name.split(' ')[0]}` : ''}! Sou seu coach de saúde. Diga o que comeu ou faça perguntas sobre sua dieta.`,
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

  const sendMessage = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
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
  }, [input, loading, messages, onFoodLogged]);

  return (
    <>
      {/* FAB */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-[68px] right-4 z-40 h-12 w-12 rounded-2xl shadow-lg shadow-emerald-600/25 bg-emerald-600 hover:bg-emerald-500 text-white flex items-center justify-center transition-all duration-200 active:scale-95"
          aria-label="Abrir coach IA"
        >
          <Sparkles size={17} />
        </button>
      )}

      {/* Chat window */}
      {open && (
        <div className="fixed bottom-[64px] right-0 left-0 sm:left-auto sm:right-4 z-50 sm:w-[380px] animate-slide-up">
          <div
            className="mx-3 sm:mx-0 bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800/80 rounded-2xl shadow-2xl shadow-black/10 dark:shadow-black/60 flex flex-col overflow-hidden"
            style={{ maxHeight: '70vh', height: 450 }}
          >
            {/* Header */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-100 dark:border-zinc-800/60 flex-shrink-0">
              <div className="h-8 w-8 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-100/80 dark:border-emerald-900/50 flex items-center justify-center">
                <Sparkles size={13} className="text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <p className="text-[13px] font-semibold text-zinc-900 dark:text-zinc-100 leading-none">
                  Coach IA
                </p>
                <p className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-0.5 font-medium">
                  Online
                </p>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="ml-auto h-7 w-7 rounded-lg bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 flex items-center justify-center text-zinc-400 dark:text-zinc-500 transition-colors"
              >
                <X size={12} />
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 bg-zinc-50/40 dark:bg-zinc-950/40">
              {messages.map((msg, i) => (
                <MessageBubble key={msg.id ?? i} msg={msg} onRate={rateMessage} />
              ))}
              {loading && (
                <div className="flex items-center gap-2">
                  <div className="h-6 w-6 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
                    <Bot size={10} className="text-zinc-500 dark:text-zinc-400" />
                  </div>
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
                placeholder="Comi 2 ovos e um suco..."
                disabled={loading}
                className="flex-1 h-10 bg-zinc-50/80 dark:bg-zinc-800/50 border border-zinc-200/80 dark:border-zinc-700/50 rounded-xl px-3.5 text-[13px] text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/25 focus:border-emerald-400/80 disabled:opacity-50 transition-all"
              />
              <button
                type="submit"
                disabled={!input.trim() || loading}
                className="h-10 w-10 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-30 flex items-center justify-center text-white transition-all active:scale-95"
              >
                <Send size={13} />
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
