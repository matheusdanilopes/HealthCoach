'use client';

import { useEffect, useState } from 'react';
import { MessageCircle, SquarePen, Trash2, Check, X } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import { cn } from '@/lib/utils';
import { conversationGroup, shortWhen } from './chat-dates';

interface ConversationSummary {
  id: string;
  title: string;
  started_at: string;
  last_at: string;
  messages: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  currentId: string | null;
  onOpen: (id: string) => void;
  onDeleted: (id: string) => void;
  onNew: () => void;
}

/** Conversas salvas com a Nina: reabrir, apagar ou começar outra. */
export default function ConversationsSheet({ open, onClose, currentId, onOpen, onDeleted, onNew }: Props) {
  const [items, setItems] = useState<ConversationSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    /* eslint-disable-next-line react-hooks/set-state-in-effect -- recarrega a lista a cada abertura */
    setConfirming(null);
    fetch('/api/chat/conversations', { cache: 'no-store' })
      .then(async (r) => {
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data.error ?? 'Não foi possível carregar as conversas.');
        return data.conversations as ConversationSummary[];
      })
      .then((list) => { if (alive) { setItems(list); setError(null); } })
      .catch((e: Error) => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, [open]);

  const remove = async (id: string) => {
    setDeleting(id);
    try {
      const r = await fetch(`/api/chat/conversations?id=${id}`, { method: 'DELETE' });
      if (!r.ok) throw new Error();
      setItems((prev) => prev?.filter((c) => c.id !== id) ?? null);
      onDeleted(id);
    } catch {
      setError('Não consegui apagar a conversa. Tente de novo.');
    } finally {
      setDeleting(null);
      setConfirming(null);
    }
  };

  // Agrupa mantendo a ordem (mais recentes primeiro).
  const groups: { label: string; list: ConversationSummary[] }[] = [];
  for (const c of items ?? []) {
    const label = conversationGroup(c.last_at);
    const g = groups[groups.length - 1];
    if (g?.label === label) g.list.push(c);
    else groups.push({ label, list: [c] });
  }

  return (
    <Modal open={open} onClose={onClose} title="Conversas com a Nina">
      <div className="flex flex-col gap-4 -mt-1">
        <button
          type="button"
          onClick={onNew}
          className="flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-600 text-white text-[13px] font-semibold py-3 shadow-md shadow-emerald-600/25 transition-transform active:scale-[0.98]"
        >
          <SquarePen size={14} /> Nova conversa
        </button>

        {error && <p className="text-[12px] text-rose-600 dark:text-rose-400 text-center animate-fade-in">{error}</p>}

        {items === null && !error && (
          <div className="flex flex-col gap-2" aria-busy aria-label="Carregando conversas">
            {[0, 1, 2].map((i) => <div key={i} className="skeleton h-[58px] rounded-2xl" />)}
          </div>
        )}

        {items?.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <MessageCircle size={22} className="text-zinc-300 dark:text-zinc-600" />
            <p className="text-[13px] text-zinc-500 dark:text-zinc-400">Nenhuma conversa salva ainda.</p>
          </div>
        )}

        {groups.map((g) => (
          <section key={g.label}>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500 mb-1.5 px-1">{g.label}</p>
            <ul className="stagger flex flex-col gap-1.5" style={{ ['--enter-base' as string]: '0s' }}>
              {g.list.map((c) => {
                const current = c.id === currentId;
                const askDelete = confirming === c.id;
                return (
                  <li
                    key={c.id}
                    className={cn(
                      'group relative flex items-center gap-2 rounded-2xl border transition-colors',
                      current
                        ? 'border-emerald-300/80 dark:border-emerald-800 bg-emerald-50/70 dark:bg-emerald-950/25'
                        : 'border-zinc-200/70 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800/60'
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => onOpen(c.id)}
                      className="flex-1 min-w-0 text-left pl-3.5 py-2.5 transition-transform active:scale-[0.99]"
                    >
                      <p className="text-[13px] font-medium text-zinc-800 dark:text-zinc-100 line-clamp-1">{c.title}</p>
                      <p className="mt-0.5 text-[11px] text-zinc-400 dark:text-zinc-500 tabular-nums">
                        {shortWhen(c.last_at)} · {c.messages} {c.messages === 1 ? 'mensagem' : 'mensagens'}
                        {current && <span className="ml-1.5 font-semibold text-emerald-600 dark:text-emerald-400">· aberta</span>}
                      </p>
                    </button>
                    {askDelete ? (
                      <span className="flex items-center gap-1 pr-2 animate-fade-in">
                        <button
                          type="button"
                          onClick={() => remove(c.id)}
                          disabled={deleting === c.id}
                          aria-label="Confirmar: apagar conversa"
                          className="h-8 px-2.5 rounded-xl bg-rose-500 text-white text-[11px] font-semibold flex items-center gap-1 active:scale-95 disabled:opacity-50"
                        >
                          <Check size={12} /> Apagar
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirming(null)}
                          aria-label="Cancelar"
                          className="h-8 w-8 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-500 flex items-center justify-center active:scale-95"
                        >
                          <X size={13} />
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirming(c.id)}
                        aria-label="Apagar conversa"
                        className="mr-2 h-8 w-8 rounded-xl flex items-center justify-center text-zinc-300 dark:text-zinc-600 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors active:scale-90"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}

        {items && items.length > 0 && (
          <p className="text-[10px] text-center text-zinc-400 dark:text-zinc-500 pb-1">
            Apagar uma conversa não remove os alimentos que ela registrou no diário.
          </p>
        )}
      </div>
    </Modal>
  );
}
