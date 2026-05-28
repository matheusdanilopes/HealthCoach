'use client';

import { useState, useRef, useEffect, memo, useCallback } from 'react';
import { X, Send, Loader2, Bot, User, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ChatMessage, FoodLog, Profile } from '@/types';

interface AIChatProps {
  profile: Profile;
  dailyCalories: number;
  dailyWater: number;
  userId: string;
  onFoodLogged?: (log: FoodLog) => void;
}

const MessageBubble = memo(function MessageBubble({ msg }: { msg: ChatMessage }) {
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
      </div>
    </div>
  );
});

const MAX_HISTORY = 10;

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

  const sendMessage = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: ChatMessage = { role: 'user', content: text };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      // Limit history sent to reduce payload size
      const allMessages = [...messages, userMsg];
      const trimmed = allMessages.slice(-MAX_HISTORY);

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: trimmed.map((m) => ({ role: m.role, content: m.content })),
          userContext: {
            userId,
            name: profile.full_name,
            targetCalories: profile.target_calories,
            dailyCalories,
            remaining: (profile.target_calories ?? 0) - dailyCalories,
            dailyWater,
            targetWater: profile.target_water_ml,
            weight: profile.current_weight,
          },
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        // Restore input on transient errors so the user can resend without retyping
        if (res.status === 503 || res.status === 429) setInput(text);
        setMessages((prev) => [...prev, {
          role: 'assistant',
          content: data.error ?? 'Desculpe, tive um problema. Tente novamente.',
        }]);
        return;
      }

      if (data.message) setMessages((prev) => [...prev, { role: 'assistant', content: data.message }]);
      // Optimistic update - no router.refresh() needed
      if (data.foodLogged && data.foodLog && onFoodLogged) onFoodLogged(data.foodLog as FoodLog);
    } catch {
      // Restore input on network errors too
      setInput(text);
      setMessages((prev) => [...prev, {
        role: 'assistant',
        content: 'Desculpe, tive um problema. Tente novamente.',
      }]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, messages, profile, dailyCalories, dailyWater, userId, onFoodLogged]);

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
                <MessageBubble key={i} msg={msg} />
              ))}
              {loading && (
                <div className="flex items-center gap-2">
                  <div className="h-6 w-6 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
                    <Bot size={10} className="text-zinc-500 dark:text-zinc-400" />
                  </div>
                  <div className="bg-white dark:bg-zinc-800 border border-zinc-100 dark:border-zinc-700/60 rounded-2xl rounded-bl-sm px-4 py-2.5">
                    <Loader2 size={11} className="animate-spin text-zinc-400" />
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
