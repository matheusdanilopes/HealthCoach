'use client';

import { useState, useEffect, useCallback } from 'react';
import { Bell, BellOff, CheckCircle, AlertCircle, RefreshCw, Send, Smartphone, Shield, Clock, Activity, ChevronLeft, Droplets, XCircle } from 'lucide-react';
import Link from 'next/link';
import { requestAndSubscribePush, forceResubscribePush } from '@/components/ServiceWorkerRegistration';

type DiagnosticsData = {
  vapidConfigured: boolean;
  serverTimeUTC: string;
  brazilHour: number;
  inQuietHours: boolean;
  deviceCount: number;
  devices: Array<{
    endpointHint: string;
    platform: string;
    registeredAt: string;
    lastUpdated: string;
    lastUsed: string;
  }>;
  preferences: {
    hydration: boolean;
    meals: boolean;
    workouts: boolean;
    insights: boolean;
    goals: boolean;
    quiet_start: number;
    quiet_end: number;
  };
  stats: {
    totalSent: number;
    totalOpened: number;
    lastSentAt: string | null;
    lastOpenedAt: string | null;
  };
  retryQueue: Array<{
    id: string;
    category: string;
    attempts: number;
    max_attempts: number;
    next_retry_at: string;
    last_error: string | null;
  }>;
};

type HydrationStatus = {
  canSend: boolean;
  blocks: {
    quietHours: boolean;
    noSubscription: boolean;
    goalMet: boolean;
    recentlyHydrated: boolean;
    recentlySent: boolean;
    dailyCapReached: boolean;
  };
  hydration: {
    totalMl: number;
    targetMl: number;
    remaining: number;
    pct: number;
    minutesSinceLastLog: number | null;
    lastLogAt: string | null;
  };
  notifications: {
    minutesSinceLastSent: number | null;
    dailySentCount: number;
    dailyCap: number;
    dedupWindowMinutes: number;
    history: Array<{ sent_at: string; title: string; status: string }>;
  };
  timing: {
    brazilHour: number;
    isQuietHours: boolean;
    quietWindow: string;
  };
  devices: Array<{ platform: string; endpointHint: string }>;
};

const BLOCK_LABELS: Record<keyof HydrationStatus['blocks'], string> = {
  quietHours:       'Horário silencioso (22h–7h BRT)',
  noSubscription:   'Nenhum dispositivo registrado',
  goalMet:          'Meta de hidratação já atingida',
  recentlyHydrated: 'Hidratou há menos de 2h',
  recentlySent:     'Notificação enviada há menos de 90min',
  dailyCapReached:  'Limite diário de 4 notificações atingido',
};

type PrefKey = 'hydration' | 'meals' | 'workouts' | 'insights' | 'goals';

const PREF_LABELS: Record<PrefKey, { label: string; emoji: string }> = {
  hydration: { label: 'Hidratação',   emoji: '💧' },
  meals:     { label: 'Refeições',    emoji: '🍽️' },
  workouts:  { label: 'Treinos',      emoji: '💪' },
  insights:  { label: 'Insights IA',  emoji: '🧠' },
  goals:     { label: 'Metas',        emoji: '🎯' },
};

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  }).format(new Date(iso));
}

function PlatformIcon({ platform }: { platform: string }) {
  if (platform === 'ios') return <span className="text-base">🍎</span>;
  if (platform === 'android') return <span className="text-base">🤖</span>;
  return <span className="text-base">🖥️</span>;
}

export default function NotificationsClient() {
  const [diag, setDiag]           = useState<DiagnosticsData | null>(null);
  const [hydStatus, setHydStatus] = useState<HydrationStatus | null>(null);
  const [prefs, setPrefs]         = useState<DiagnosticsData['preferences'] | null>(null);
  const [loading, setLoading]     = useState(true);
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [testState, setTestState]   = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [hydTestState, setHydTestState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [savingPrefs, setSavingPrefs] = useState(false);

  const loadDiag = useCallback(async () => {
    setLoading(true);
    try {
      const [diagRes, hydRes] = await Promise.all([
        fetch('/api/notifications/diagnostics'),
        fetch('/api/notifications/hydration-status'),
      ]);
      if (diagRes.ok) {
        const data = await diagRes.json() as DiagnosticsData;
        setDiag(data);
        setPrefs(data.preferences);
      }
      if (hydRes.ok) {
        setHydStatus(await hydRes.json() as HydrationStatus);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if ('Notification' in window) setPermission(Notification.permission);
    loadDiag();
  }, [loadDiag]);

  async function handleEnableNotifications() {
    const ok = await requestAndSubscribePush();
    if (ok) {
      setPermission('granted');
      await loadDiag();
    } else {
      setPermission(Notification.permission);
    }
  }

  async function handleForceResubscribe() {
    await forceResubscribePush();
    await loadDiag();
  }

  async function handleTestNotification() {
    setTestState('sending');
    try {
      const res = await fetch('/api/notifications/send', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          title:    'Teste de notificação ✅',
          body:     'Sua configuração está funcionando corretamente!',
          tag:      'hc-test',
          url:      '/notifications',
          category: 'test',
        }),
      });
      const data = await res.json() as { sent: number };
      setTestState(data.sent > 0 ? 'sent' : 'error');
    } catch {
      setTestState('error');
    }
    setTimeout(() => setTestState('idle'), 4000);
  }

  async function handleHydrationTest() {
    setHydTestState('sending');
    try {
      const res = await fetch('/api/notifications/hydration-status', { method: 'POST' });
      const data = await res.json() as { result: string };
      setHydTestState(data.result === 'notified' ? 'sent' : 'error');
    } catch {
      setHydTestState('error');
    }
    setTimeout(() => setHydTestState('idle'), 5000);
  }

  async function togglePref(key: PrefKey) {
    if (!prefs) return;
    const previous = prefs;
    const updated  = { ...prefs, [key]: !prefs[key] };
    setPrefs(updated);
    setSavingPrefs(true);
    try {
      const res = await fetch('/api/notifications/preferences', {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(updated),
      });
      if (!res.ok) throw new Error();
    } catch {
      setPrefs(previous);
    } finally {
      setSavingPrefs(false);
    }
  }

  const openRate = diag?.stats.totalSent
    ? Math.round((diag.stats.totalOpened / diag.stats.totalSent) * 100)
    : 0;

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
            Diagnóstico e configurações
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <RefreshCw size={20} className="text-zinc-300 dark:text-zinc-600 animate-spin" />
        </div>
      ) : (
        <>
          {/* Permission Status */}
          <div className={`rounded-2xl border p-4 ${
            permission === 'granted'
              ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-100 dark:border-emerald-900/30'
              : permission === 'denied'
              ? 'bg-red-50 dark:bg-red-950/20 border-red-100 dark:border-red-900/30'
              : 'bg-amber-50 dark:bg-amber-950/20 border-amber-100 dark:border-amber-900/30'
          }`}>
            <div className="flex items-start gap-3">
              {permission === 'granted' ? (
                <CheckCircle size={18} className="text-emerald-600 dark:text-emerald-400 mt-0.5 flex-shrink-0" />
              ) : (
                <AlertCircle size={18} className={`mt-0.5 flex-shrink-0 ${permission === 'denied' ? 'text-red-500' : 'text-amber-500'}`} />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold text-zinc-900 dark:text-zinc-100">
                  {permission === 'granted' ? 'Notificações ativadas' :
                   permission === 'denied'  ? 'Notificações bloqueadas' :
                   'Notificações não configuradas'}
                </p>
                <p className="text-[12px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                  {permission === 'granted'
                    ? `${diag?.deviceCount ?? 0} dispositivo(s) registrado(s)`
                    : permission === 'denied'
                    ? 'Habilite nas configurações do navegador/SO'
                    : 'Toque em ativar para receber lembretes'}
                </p>
                {permission !== 'granted' && permission !== 'denied' && (
                  <button
                    onClick={handleEnableNotifications}
                    className="mt-2.5 inline-flex items-center gap-1.5 text-[12px] font-semibold text-white bg-emerald-600 hover:bg-emerald-700 active:scale-[0.97] transition-all px-3 py-1.5 rounded-lg"
                  >
                    <Bell size={12} />
                    Ativar notificações
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Test & Resubscribe Actions */}
          {permission === 'granted' && (
            <div className="bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800/80 rounded-2xl overflow-hidden">
              <div className="px-4 py-3 border-b border-zinc-50 dark:border-zinc-800/60">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
                  Ferramentas de teste
                </p>
              </div>
              <div className="p-4 space-y-2.5">
                <button
                  onClick={handleTestNotification}
                  disabled={testState === 'sending'}
                  className="w-full flex items-center justify-center gap-2 h-10 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] disabled:opacity-60 transition-all text-white text-[13px] font-semibold"
                >
                  {testState === 'sending' ? (
                    <><RefreshCw size={14} className="animate-spin" /> Enviando...</>
                  ) : testState === 'sent' ? (
                    <><CheckCircle size={14} /> Notificação enviada!</>
                  ) : testState === 'error' ? (
                    <><AlertCircle size={14} /> Falha no envio</>
                  ) : (
                    <><Send size={14} /> Enviar notificação de teste</>
                  )}
                </button>
                <button
                  onClick={handleForceResubscribe}
                  className="w-full flex items-center justify-center gap-2 h-10 rounded-xl bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 active:scale-[0.98] transition-all text-zinc-700 dark:text-zinc-300 text-[13px] font-medium"
                >
                  <RefreshCw size={14} />
                  Forçar re-registro
                </button>
              </div>
            </div>
          )}

          {/* Notification Preferences */}
          {prefs && (
            <div className="bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800/80 rounded-2xl overflow-hidden">
              <div className="px-4 py-3 border-b border-zinc-50 dark:border-zinc-800/60 flex items-center justify-between">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
                  Categorias
                </p>
                {savingPrefs && (
                  <RefreshCw size={11} className="text-zinc-400 animate-spin" />
                )}
              </div>
              <div className="divide-y divide-zinc-50 dark:divide-zinc-800/60">
                {(Object.keys(PREF_LABELS) as PrefKey[]).map((key) => {
                  const { label, emoji } = PREF_LABELS[key];
                  const enabled = prefs[key];
                  return (
                    <button
                      key={key}
                      onClick={() => togglePref(key)}
                      className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-zinc-50/80 dark:hover:bg-zinc-800/40 transition-colors text-left"
                    >
                      <span className="text-base w-6 flex-shrink-0 text-center">{emoji}</span>
                      <span className="flex-1 text-[13px] font-medium text-zinc-700 dark:text-zinc-300">
                        {label}
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

          {/* Delivery Stats */}
          {diag && (
            <div className="bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800/80 rounded-2xl overflow-hidden">
              <div className="px-4 py-3 border-b border-zinc-50 dark:border-zinc-800/60">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
                  Estatísticas de entrega
                </p>
              </div>
              <div className="p-4 grid grid-cols-3 gap-3">
                <div className="text-center">
                  <p className="text-2xl font-bold tabular-nums text-zinc-900 dark:text-zinc-100">
                    {diag.stats.totalSent}
                  </p>
                  <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-0.5">enviadas</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                    {diag.stats.totalOpened}
                  </p>
                  <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-0.5">abertas</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold tabular-nums text-zinc-900 dark:text-zinc-100">
                    {openRate}%
                  </p>
                  <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-0.5">taxa abertura</p>
                </div>
              </div>
              <div className="px-4 pb-4 space-y-1.5">
                <div className="flex items-center justify-between text-[12px]">
                  <span className="text-zinc-500 dark:text-zinc-400">Último envio</span>
                  <span className="text-zinc-700 dark:text-zinc-300 font-medium tabular-nums">
                    {formatDate(diag.stats.lastSentAt)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[12px]">
                  <span className="text-zinc-500 dark:text-zinc-400">Última abertura</span>
                  <span className="text-zinc-700 dark:text-zinc-300 font-medium tabular-nums">
                    {formatDate(diag.stats.lastOpenedAt)}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Devices */}
          {diag && diag.devices.length > 0 && (
            <div className="bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800/80 rounded-2xl overflow-hidden">
              <div className="px-4 py-3 border-b border-zinc-50 dark:border-zinc-800/60">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
                  Dispositivos registrados
                </p>
              </div>
              <div className="divide-y divide-zinc-50 dark:divide-zinc-800/60">
                {diag.devices.map((d, i) => (
                  <div key={i} className="flex items-start gap-3 px-4 py-3">
                    <div className="h-8 w-8 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center flex-shrink-0">
                      <PlatformIcon platform={d.platform} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium text-zinc-700 dark:text-zinc-300 capitalize">
                        {d.platform === 'ios' ? 'iPhone / iPad' : d.platform === 'android' ? 'Android' : 'Desktop'}
                      </p>
                      <p className="text-[11px] text-zinc-400 dark:text-zinc-500 font-mono truncate mt-0.5">
                        …{d.endpointHint}
                      </p>
                      <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-0.5">
                        Último uso: {formatDate(d.lastUsed)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* System Status */}
          {diag && (
            <div className="bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800/80 rounded-2xl overflow-hidden">
              <div className="px-4 py-3 border-b border-zinc-50 dark:border-zinc-800/60">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
                  Status do sistema
                </p>
              </div>
              <div className="divide-y divide-zinc-50 dark:divide-zinc-800/60">
                <StatusRow
                  icon={<Shield size={14} />}
                  label="VAPID configurado"
                  ok={diag.vapidConfigured}
                  value={diag.vapidConfigured ? 'Sim' : 'Não'}
                />
                <StatusRow
                  icon={<Clock size={14} />}
                  label="Hora Brasil"
                  ok={!diag.inQuietHours}
                  value={`${diag.brazilHour}h ${diag.inQuietHours ? '(modo silencioso)' : '(ativo)'}`}
                />
                <StatusRow
                  icon={<Smartphone size={14} />}
                  label="Dispositivos"
                  ok={diag.deviceCount > 0}
                  value={`${diag.deviceCount} registrado(s)`}
                />
                <StatusRow
                  icon={<Activity size={14} />}
                  label="Fila de retry"
                  ok={diag.retryQueue.length === 0}
                  value={diag.retryQueue.length === 0 ? 'Vazia' : `${diag.retryQueue.length} pendente(s)`}
                />
                <StatusRow
                  icon={<Bell size={14} />}
                  label="Permissão"
                  ok={permission === 'granted'}
                  value={permission === 'granted' ? 'Concedida' : permission === 'denied' ? 'Negada' : 'Pendente'}
                />
                {hydStatus && (
                  <StatusRow
                    icon={<Droplets size={14} />}
                    label="Hidratação pronta"
                    ok={hydStatus.canSend}
                    value={hydStatus.canSend ? 'Sim' : `${Object.values(hydStatus.blocks).filter(Boolean).length} bloqueio(s)`}
                  />
                )}
              </div>
            </div>
          )}

          {/* Retry Queue */}
          {diag && diag.retryQueue.length > 0 && (
            <div className="bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800/80 rounded-2xl overflow-hidden">
              <div className="px-4 py-3 border-b border-zinc-50 dark:border-zinc-800/60">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
                  Fila de reenvio
                </p>
              </div>
              <div className="divide-y divide-zinc-50 dark:divide-zinc-800/60">
                {diag.retryQueue.map((item) => (
                  <div key={item.id} className="px-4 py-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[13px] font-medium text-zinc-700 dark:text-zinc-300 capitalize">
                        {item.category}
                      </span>
                      <span className="text-[11px] text-zinc-400 tabular-nums">
                        {item.attempts}/{item.max_attempts} tentativas
                      </span>
                    </div>
                    <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-0.5">
                      Próximo retry: {formatDate(item.next_retry_at)}
                    </p>
                    {item.last_error && (
                      <p className="text-[11px] text-red-400 mt-0.5 truncate">{item.last_error}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Hydration Diagnostic */}
          {hydStatus && (
            <div className="bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800/80 rounded-2xl overflow-hidden">
              <div className="px-4 py-3 border-b border-zinc-50 dark:border-zinc-800/60 flex items-center justify-between">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
                  Diagnóstico — Hidratação
                </p>
                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${hydStatus.canSend ? 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400' : 'bg-red-100 dark:bg-red-950/40 text-red-600 dark:text-red-400'}`}>
                  {hydStatus.canSend ? 'Pronta para enviar' : 'Bloqueada'}
                </span>
              </div>

              {/* Progress bar */}
              <div className="px-4 pt-4 pb-3">
                <div className="flex items-center justify-between text-[12px] mb-1.5">
                  <span className="text-zinc-500 dark:text-zinc-400">Hidratação hoje</span>
                  <span className="font-semibold tabular-nums text-zinc-700 dark:text-zinc-300">
                    {hydStatus.hydration.totalMl}ml / {hydStatus.hydration.targetMl}ml ({hydStatus.hydration.pct}%)
                  </span>
                </div>
                <div className="h-2 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 rounded-full transition-all"
                    style={{ width: `${Math.min(100, hydStatus.hydration.pct)}%` }}
                  />
                </div>
                <div className="flex justify-between mt-1.5 text-[11px] text-zinc-400 dark:text-zinc-500">
                  <span>
                    {hydStatus.hydration.minutesSinceLastLog !== null
                      ? `Última ingestão: ${hydStatus.hydration.minutesSinceLastLog}min atrás`
                      : 'Sem registros hoje'}
                  </span>
                  <span>Faltam {hydStatus.hydration.remaining}ml</span>
                </div>
              </div>

              {/* Blocking conditions */}
              {!hydStatus.canSend && (
                <div className="px-4 pb-3">
                  <p className="text-[11px] font-semibold text-zinc-400 dark:text-zinc-500 mb-2 uppercase tracking-wide">Condições bloqueando o envio</p>
                  <div className="space-y-1.5">
                    {(Object.entries(hydStatus.blocks) as [keyof HydrationStatus['blocks'], boolean][]).map(([key, active]) => (
                      active ? (
                        <div key={key} className="flex items-center gap-2">
                          <XCircle size={13} className="text-red-500 flex-shrink-0" />
                          <span className="text-[12px] text-red-600 dark:text-red-400">{BLOCK_LABELS[key]}</span>
                        </div>
                      ) : null
                    ))}
                  </div>
                </div>
              )}

              {/* Today's notification count */}
              <div className="px-4 pb-3 flex items-center justify-between text-[12px]">
                <span className="text-zinc-500 dark:text-zinc-400">Notificações hoje</span>
                <span className="font-semibold tabular-nums text-zinc-700 dark:text-zinc-300">
                  {hydStatus.notifications.dailySentCount} / {hydStatus.notifications.dailyCap}
                  {hydStatus.notifications.minutesSinceLastSent !== null && ` · última há ${hydStatus.notifications.minutesSinceLastSent}min`}
                </span>
              </div>

              {/* Force test button */}
              {permission === 'granted' && (
                <div className="px-4 pb-4">
                  <button
                    onClick={handleHydrationTest}
                    disabled={hydTestState === 'sending'}
                    className="w-full flex items-center justify-center gap-2 h-10 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-[0.98] disabled:opacity-60 transition-all text-white text-[13px] font-semibold"
                  >
                    {hydTestState === 'sending' ? (
                      <><RefreshCw size={14} className="animate-spin" /> Enviando...</>
                    ) : hydTestState === 'sent' ? (
                      <><CheckCircle size={14} /> Notificação de hidratação enviada!</>
                    ) : hydTestState === 'error' ? (
                      <><AlertCircle size={14} /> Falha — verifique VAPID/subscription</>
                    ) : (
                      <><Droplets size={14} /> Forçar notificação de hidratação</>
                    )}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* iOS / PWA hint */}
          <div className="bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-100 dark:border-zinc-800/50 rounded-2xl p-4">
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-relaxed">
              <strong className="text-zinc-600 dark:text-zinc-300">iPhone / iPad:</strong> As notificações funcionam apenas quando o app está instalado na tela inicial (PWA). Toque em Compartilhar → Adicionar à Tela de Início e habilite notificações nas configurações do iOS.
            </p>
          </div>

          {/* Refresh */}
          <button
            onClick={loadDiag}
            className="w-full flex items-center justify-center gap-2 h-10 rounded-xl text-[13px] font-medium text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors"
          >
            <RefreshCw size={14} />
            Atualizar diagnóstico
          </button>
        </>
      )}
    </div>
  );
}

function StatusRow({
  icon,
  label,
  ok,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  ok: boolean;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className={`h-6 w-6 rounded-full flex items-center justify-center flex-shrink-0 ${ok ? 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400' : 'bg-red-100 dark:bg-red-950/40 text-red-500'}`}>
        {icon}
      </div>
      <span className="flex-1 text-[13px] text-zinc-600 dark:text-zinc-400">{label}</span>
      <span className={`text-[12px] font-medium ${ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`}>
        {value}
      </span>
    </div>
  );
}

// Export empty to avoid module isolation issues
export {};
