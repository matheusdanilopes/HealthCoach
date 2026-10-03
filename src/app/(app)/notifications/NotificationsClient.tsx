'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { CheckCircle, AlertCircle, RefreshCw, Send, ChevronLeft, Moon, Link2Off, ExternalLink } from 'lucide-react';
import Link from 'next/link';

type TelegramStatus = {
  configured: boolean;
  bot: string | null;
  connected: boolean;
  username: string | null;
  linkedAt: string | null;
};

type Preferences = {
  hydration: boolean;
  meals: boolean;
  workouts: boolean;
  insights: boolean;
  goals: boolean;
  quiet_start: number;
  quiet_end: number;
};

type HistoryItem = {
  id: string;
  category: string;
  title: string;
  status: 'sent' | 'failed';
  sent_at: string;
  opened_at: string | null;
  error_msg: string | null;
};

type PrefKey = 'goals' | 'hydration' | 'meals' | 'workouts' | 'insights';

const PREF_LABELS: Record<PrefKey, { label: string; emoji: string; hint: string }> = {
  goals:     { label: 'Resumos do dia', emoji: '🎯', hint: 'Bom dia com metas e fechamento à noite' },
  hydration: { label: 'Hidratação',     emoji: '💧', hint: 'Até 3/dia, só quando estiver abaixo do ritmo' },
  meals:     { label: 'Refeições',      emoji: '🍽️', hint: 'Café (10h), almoço (14h) e jantar (20h) não registrados' },
  workouts:  { label: 'Treinos',        emoji: '💪', hint: 'Às 18h, após 2 dias ou mais sem treino' },
  insights:  { label: 'Insights IA',    emoji: '🧠', hint: 'Quando um novo insight é gerado' },
};

const CATEGORY_EMOJI: Record<string, string> = {
  hydration: '💧', meal: '🍽️', workout: '💪', insight: '🧠', goal: '🎯', test: '✅', system: 'ℹ️',
};

const HOURS = Array.from({ length: 24 }, (_, h) => h);
const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  }).format(new Date(iso));
}

const card = 'bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800/80 rounded-2xl overflow-hidden';
const cardHeader = 'px-4 py-3 border-b border-zinc-50 dark:border-zinc-800/60 flex items-center justify-between';
const cardTitle = 'text-[10px] font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500';

export default function NotificationsClient() {
  const [tg, setTg]               = useState<TelegramStatus | null>(null);
  const [prefs, setPrefs]         = useState<Preferences | null>(null);
  const [history, setHistory]     = useState<HistoryItem[]>([]);
  const [loading, setLoading]     = useState(true);
  const [linkUrl, setLinkUrl]     = useState<string | null>(null);
  const [linking, setLinking]     = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [testState, setTestState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [savingPrefs, setSavingPrefs] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadStatus = useCallback(async () => {
    const res = await fetch('/api/telegram/link');
    if (!res.ok) return null;
    const data = await res.json() as TelegramStatus;
    setTg(data);
    return data;
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [, prefRes, histRes] = await Promise.all([
        loadStatus(),
        fetch('/api/notifications/preferences'),
        fetch('/api/notifications/history'),
      ]);
      if (prefRes.ok) setPrefs(await prefRes.json() as Preferences);
      if (histRes.ok) setHistory((await histRes.json() as { items: HistoryItem[] }).items);
    } finally {
      setLoading(false);
    }
  }, [loadStatus]);

  useEffect(() => {
    // Initial fetch on mount; loadAll toggles the loading flag.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadAll();
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [loadAll]);

  // After the deep link is opened, wait for the bot to confirm the link.
  function startPolling() {
    if (pollRef.current) clearInterval(pollRef.current);
    const startedAt = Date.now();
    pollRef.current = setInterval(async () => {
      const status = await loadStatus();
      if (status?.connected || Date.now() - startedAt > 3 * 60_000) {
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = null;
        if (status?.connected) {
          setLinkUrl(null);
          loadAll();
        }
      }
    }, 3000);
  }

  async function handleConnect() {
    setLinking(true);
    setLinkError(null);
    try {
      const res = await fetch('/api/telegram/link', { method: 'POST' });
      const data = await res.json() as { url?: string; error?: string };
      if (!res.ok || !data.url) throw new Error(data.error ?? 'Falha ao gerar link');
      setLinkUrl(data.url);
      window.open(data.url, '_blank', 'noopener');
      startPolling();
    } catch (err) {
      setLinkError(err instanceof Error ? err.message : 'Falha ao gerar link');
    } finally {
      setLinking(false);
    }
  }

  async function handleDisconnect() {
    if (!confirm('Parar de receber notificações no Telegram?')) return;
    await fetch('/api/telegram/link', { method: 'DELETE' });
    await loadStatus();
  }

  async function handleTest() {
    setTestState('sending');
    try {
      const res = await fetch('/api/notifications/test', { method: 'POST' });
      const data = await res.json() as { result: string };
      setTestState(data.result === 'sent' ? 'sent' : 'error');
      if (data.result === 'gone') await loadStatus();
      const histRes = await fetch('/api/notifications/history');
      if (histRes.ok) setHistory((await histRes.json() as { items: HistoryItem[] }).items);
    } catch {
      setTestState('error');
    }
    setTimeout(() => setTestState('idle'), 4000);
  }

  async function savePrefs(patch: Partial<Preferences>) {
    if (!prefs) return;
    const previous = prefs;
    setPrefs({ ...prefs, ...patch });
    setSavingPrefs(true);
    try {
      const res = await fetch('/api/notifications/preferences', {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(patch),
      });
      if (!res.ok) throw new Error();
    } catch {
      setPrefs(previous);
    } finally {
      setSavingPrefs(false);
    }
  }

  const morningHour = prefs ? clamp(prefs.quiet_end, 5, 11) : 7;
  const eveningHour = prefs ? clamp(prefs.quiet_start - 1, 18, 23) : 21;

  return (
    <div className="py-6 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href="/profile"
          className="h-8 w-8 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
        >
          <ChevronLeft size={16} className="text-zinc-600 dark:text-zinc-400" />
        </Link>
        <div>
          <h1 className="text-[17px] font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">
            Notificações
          </h1>
          <p className="text-[12px] text-zinc-400 dark:text-zinc-500 mt-0.5">
            Lembretes e resumos pelo Telegram
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <RefreshCw size={20} className="text-zinc-300 dark:text-zinc-600 animate-spin" />
        </div>
      ) : (
        <>
          {/* Telegram connection */}
          <div className={`rounded-2xl border p-4 ${
            tg?.connected
              ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-100 dark:border-emerald-900/30'
              : 'bg-sky-50 dark:bg-sky-950/20 border-sky-100 dark:border-sky-900/30'
          }`}>
            <div className="flex items-start gap-3">
              {tg?.connected
                ? <CheckCircle size={18} className="text-emerald-600 dark:text-emerald-400 mt-0.5 flex-shrink-0" />
                : <Send size={18} className="text-sky-600 dark:text-sky-400 mt-0.5 flex-shrink-0" />}
              <div className="flex-1 min-w-0">
                {!tg?.configured ? (
                  <>
                    <p className="text-[13px] font-semibold text-zinc-900 dark:text-zinc-100">Bot do Telegram não configurado</p>
                    <p className="text-[12px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                      Defina TELEGRAM_BOT_TOKEN e TELEGRAM_BOT_USERNAME no servidor.
                    </p>
                  </>
                ) : tg.connected ? (
                  <>
                    <p className="text-[13px] font-semibold text-zinc-900 dark:text-zinc-100">
                      Conectado{tg.username ? ` como @${tg.username}` : ''}
                    </p>
                    <p className="text-[12px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                      Desde {formatDate(tg.linkedAt)} · bot @{tg.bot}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        onClick={handleTest}
                        disabled={testState === 'sending'}
                        className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-white bg-emerald-600 hover:bg-emerald-700 active:scale-[0.97] disabled:opacity-60 transition-all px-3 py-1.5 rounded-lg"
                      >
                        {testState === 'sending' ? <><RefreshCw size={12} className="animate-spin" /> Enviando…</>
                          : testState === 'sent' ? <><CheckCircle size={12} /> Enviada!</>
                          : testState === 'error' ? <><AlertCircle size={12} /> Falhou</>
                          : <><Send size={12} /> Enviar teste</>}
                      </button>
                      <button
                        onClick={handleDisconnect}
                        className="inline-flex items-center gap-1.5 text-[12px] font-medium text-zinc-600 dark:text-zinc-300 bg-white/70 dark:bg-zinc-800 hover:bg-white dark:hover:bg-zinc-700 transition-colors px-3 py-1.5 rounded-lg"
                      >
                        <Link2Off size={12} /> Desconectar
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="text-[13px] font-semibold text-zinc-900 dark:text-zinc-100">Conecte o Telegram</p>
                    <p className="text-[12px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                      Receba lembretes no ritmo do seu dia e registre água direto pelos botões da mensagem.
                    </p>
                    <button
                      onClick={handleConnect}
                      disabled={linking}
                      className="mt-2.5 inline-flex items-center gap-1.5 text-[12px] font-semibold text-white bg-sky-600 hover:bg-sky-700 active:scale-[0.97] disabled:opacity-60 transition-all px-3 py-1.5 rounded-lg"
                    >
                      {linking ? <RefreshCw size={12} className="animate-spin" /> : <Send size={12} />}
                      Conectar Telegram
                    </button>
                    {linkUrl && (
                      <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-2.5 leading-relaxed">
                        No Telegram, toque em <strong>Iniciar</strong>. Esta página atualiza sozinha.{' '}
                        <a href={linkUrl} target="_blank" rel="noopener" className="inline-flex items-center gap-0.5 text-sky-600 dark:text-sky-400 font-medium">
                          Não abriu? Toque aqui <ExternalLink size={10} />
                        </a>
                      </p>
                    )}
                    {linkError && <p className="text-[11px] text-red-500 mt-2">{linkError}</p>}
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Categories */}
          {prefs && (
            <div className={card}>
              <div className={cardHeader}>
                <p className={cardTitle}>O que receber</p>
                {savingPrefs && <RefreshCw size={11} className="text-zinc-400 animate-spin" />}
              </div>
              <div className="divide-y divide-zinc-50 dark:divide-zinc-800/60">
                {(Object.keys(PREF_LABELS) as PrefKey[]).map((key) => {
                  const { label, emoji, hint } = PREF_LABELS[key];
                  const enabled = prefs[key];
                  return (
                    <button
                      key={key}
                      onClick={() => savePrefs({ [key]: !enabled })}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-zinc-50/80 dark:hover:bg-zinc-800/40 transition-colors text-left"
                    >
                      <span className="text-base w-6 flex-shrink-0 text-center">{emoji}</span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-[13px] font-medium text-zinc-700 dark:text-zinc-300">{label}</span>
                        <span className="block text-[11px] text-zinc-400 dark:text-zinc-500 mt-0.5">
                          {key === 'goals' ? `Bom dia às ${morningHour}h e fechamento às ${eveningHour}h` : hint}
                        </span>
                      </span>
                      <div className={`h-5 w-9 rounded-full transition-colors flex-shrink-0 ${enabled ? 'bg-emerald-500' : 'bg-zinc-200 dark:bg-zinc-700'}`}>
                        <div className={`h-4 w-4 rounded-full bg-white shadow-sm transition-transform mt-0.5 ${enabled ? 'translate-x-4.5' : 'translate-x-0.5'}`} />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Quiet hours */}
          {prefs && (
            <div className={card}>
              <div className={cardHeader}>
                <p className={cardTitle}>Horário silencioso</p>
                <Moon size={12} className="text-zinc-400" />
              </div>
              <div className="p-4 flex items-center gap-3 text-[13px] text-zinc-700 dark:text-zinc-300">
                <span>Das</span>
                <select
                  value={prefs.quiet_start}
                  onChange={(e) => savePrefs({ quiet_start: Number(e.target.value) })}
                  className="h-9 rounded-lg bg-zinc-100 dark:bg-zinc-800 px-2 tabular-nums"
                >
                  {HOURS.map((h) => <option key={h} value={h}>{h}h</option>)}
                </select>
                <span>às</span>
                <select
                  value={prefs.quiet_end}
                  onChange={(e) => savePrefs({ quiet_end: Number(e.target.value) })}
                  className="h-9 rounded-lg bg-zinc-100 dark:bg-zinc-800 px-2 tabular-nums"
                >
                  {HOURS.map((h) => <option key={h} value={h}>{h}h</option>)}
                </select>
              </div>
              <p className="px-4 pb-4 -mt-1 text-[11px] text-zinc-400 dark:text-zinc-500">
                Nada é enviado nesse intervalo (horário de Brasília).
              </p>
            </div>
          )}

          {/* History */}
          <div className={card}>
            <div className={cardHeader}>
              <p className={cardTitle}>Últimas notificações</p>
              <button onClick={loadAll} className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300" aria-label="Atualizar">
                <RefreshCw size={12} />
              </button>
            </div>
            {history.length === 0 ? (
              <p className="px-4 py-5 text-[12px] text-zinc-400 dark:text-zinc-500 text-center">
                Nenhuma notificação enviada ainda.
              </p>
            ) : (
              <div className="divide-y divide-zinc-50 dark:divide-zinc-800/60">
                {history.map((h) => (
                  <div key={h.id} className="flex items-start gap-3 px-4 py-2.5">
                    <span className="text-sm w-5 flex-shrink-0 text-center mt-0.5">{CATEGORY_EMOJI[h.category] ?? '🔔'}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-medium text-zinc-700 dark:text-zinc-300 truncate">{h.title}</p>
                      <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-0.5">
                        {formatDate(h.sent_at)}
                        {h.status === 'failed' && <span className="text-red-500"> · falhou</span>}
                        {h.opened_at && <span className="text-emerald-600 dark:text-emerald-400"> · respondida</span>}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
