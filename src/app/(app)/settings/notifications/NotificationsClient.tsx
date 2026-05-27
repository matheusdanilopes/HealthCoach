'use client';

import { useEffect, useState, useTransition } from 'react';
import { Bell, BellOff, CheckCircle2, AlertCircle, Loader2, ArrowLeft, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { useNotifications } from '@/hooks/useNotifications';
import type { NotificationPreferences } from '@/lib/notifications/types';

const CATEGORIES: { key: keyof Omit<NotificationPreferences, 'enabled'>; label: string; desc: string }[] = [
  { key: 'imports',    label: 'Importações',   desc: 'Iniciada, concluída ou com erro' },
  { key: 'processing', label: 'Processamentos', desc: 'Finalização de análises e sincronizações' },
  { key: 'updates',    label: 'Atualizações',   desc: 'Novidades e alertas do app' },
];

export default function NotificationsClient() {
  const { permissionState, isSubscribed: isEnabled, isLoading, subscribe: enable, unsubscribe: disable } = useNotifications();
  const [prefs, setPrefs] = useState<NotificationPreferences>({
    enabled: true, imports: true, processing: true, updates: true,
  });
  const [loadingPrefs, setLoadingPrefs] = useState(true);
  const [testStatus, setTestStatus] = useState<'idle' | 'sending' | 'ok' | 'error'>('idle');
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    fetch('/api/notifications/preferences')
      .then(r => r.json())
      .then(setPrefs)
      .catch(() => {})
      .finally(() => setLoadingPrefs(false));
  }, []);

  async function handleToggle() {
    if (isEnabled) {
      await disable();
    } else {
      await enable();
    }
  }

  function handlePrefToggle(key: keyof NotificationPreferences) {
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next);
    startTransition(async () => {
      await fetch('/api/notifications/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [key]: next[key] }),
      });
    });
  }

  async function handleTest() {
    setTestStatus('sending');
    try {
      const res = await fetch('/api/notifications/test', { method: 'POST' });
      setTestStatus(res.ok ? 'ok' : 'error');
    } catch {
      setTestStatus('error');
    }
    setTimeout(() => setTestStatus('idle'), 3000);
  }

  const isUnsupported = permissionState === 'unsupported';
  const isDenied = permissionState === 'denied';

  return (
    <div className="flex flex-col gap-4 pt-6 pb-8 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href="/profile"
          className="h-8 w-8 rounded-lg bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center flex-shrink-0 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
        >
          <ArrowLeft size={14} className="text-zinc-600 dark:text-zinc-400" />
        </Link>
        <div>
          <h1 className="text-[17px] font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">
            Notificações
          </h1>
          <p className="text-[12px] text-zinc-400 dark:text-zinc-500">Gerencie alertas do app</p>
        </div>
      </div>

      {/* Unsupported */}
      {isUnsupported && (
        <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-800/40 rounded-2xl p-4 flex items-start gap-3">
          <AlertCircle size={16} className="text-amber-500 flex-shrink-0 mt-0.5" />
          <p className="text-[13px] text-amber-700 dark:text-amber-400">
            Seu navegador não suporta notificações. Use Chrome, Firefox ou Safari atualizado.
          </p>
        </div>
      )}

      {/* Denied */}
      {isDenied && (
        <div className="bg-red-50 dark:bg-red-950/20 border border-red-200/60 dark:border-red-800/40 rounded-2xl p-4 flex items-start gap-3">
          <BellOff size={16} className="text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-[13px] font-medium text-red-600 dark:text-red-400">Permissão bloqueada</p>
            <p className="text-[12px] text-red-500/80 dark:text-red-400/70 mt-0.5">
              Ative as notificações nas configurações do navegador para este site.
            </p>
          </div>
        </div>
      )}

      {/* Main toggle */}
      {!isUnsupported && (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800/80 rounded-3xl overflow-hidden shadow-[0_1px_3px_0_rgb(0,0,0,0.04)] dark:shadow-none">
          <div className="px-5 py-3.5 border-b border-zinc-50 dark:border-zinc-800/60">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
              Status
            </p>
          </div>
          <div className="p-4">
            <button
              onClick={handleToggle}
              disabled={isLoading || isDenied}
              className={cn(
                'w-full flex items-center justify-between px-4 py-3.5 rounded-xl border transition-all duration-200 active:scale-[0.98]',
                isEnabled
                  ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200/80 dark:border-emerald-800/40'
                  : 'bg-zinc-50/80 dark:bg-zinc-800/40 border-zinc-200/80 dark:border-zinc-700/40',
                (isLoading || isDenied) && 'opacity-50 cursor-not-allowed',
              )}
            >
              <div className="flex items-center gap-3">
                <div className={cn(
                  'h-9 w-9 rounded-xl flex items-center justify-center flex-shrink-0',
                  isEnabled ? 'bg-emerald-600' : 'bg-zinc-200 dark:bg-zinc-700',
                )}>
                  {isLoading
                    ? <Loader2 size={15} className="text-white animate-spin" />
                    : isEnabled
                      ? <Bell size={15} className="text-white" />
                      : <BellOff size={15} className="text-zinc-500 dark:text-zinc-400" />
                  }
                </div>
                <div className="text-left">
                  <p className={cn(
                    'text-[13px] font-semibold leading-none',
                    isEnabled ? 'text-emerald-700 dark:text-emerald-400' : 'text-zinc-700 dark:text-zinc-300',
                  )}>
                    {isEnabled ? 'Notificações ativas' : 'Notificações desativadas'}
                  </p>
                  <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-0.5">
                    {isEnabled ? 'Toque para desativar' : 'Toque para ativar'}
                  </p>
                </div>
              </div>
              <div className={cn(
                'relative h-6 w-11 rounded-full transition-colors duration-200 flex-shrink-0',
                isEnabled ? 'bg-emerald-500' : 'bg-zinc-200 dark:bg-zinc-600',
              )}>
                <span className={cn(
                  'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-all duration-200',
                  isEnabled ? 'left-[22px]' : 'left-0.5',
                )} />
              </div>
            </button>
          </div>
        </div>
      )}

      {/* Category preferences */}
      {isEnabled && !loadingPrefs && (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800/80 rounded-3xl overflow-hidden shadow-[0_1px_3px_0_rgb(0,0,0,0.04)] dark:shadow-none">
          <div className="px-5 py-3.5 border-b border-zinc-50 dark:border-zinc-800/60">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
              Categorias
            </p>
          </div>
          <div className="p-3 flex flex-col gap-1">
            {CATEGORIES.map(({ key, label, desc }) => {
              const active = prefs[key];
              return (
                <button
                  key={key}
                  onClick={() => handlePrefToggle(key)}
                  disabled={isPending}
                  className="w-full flex items-center justify-between px-3 py-3 rounded-xl hover:bg-zinc-50 dark:hover:bg-zinc-800/60 transition-colors"
                >
                  <div className="text-left">
                    <p className="text-[13px] font-medium text-zinc-800 dark:text-zinc-200">{label}</p>
                    <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-0.5">{desc}</p>
                  </div>
                  <div className={cn(
                    'relative h-5 w-9 rounded-full transition-colors duration-200 flex-shrink-0',
                    active ? 'bg-emerald-500' : 'bg-zinc-200 dark:bg-zinc-600',
                  )}>
                    <span className={cn(
                      'absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-all duration-200',
                      active ? 'left-[18px]' : 'left-0.5',
                    )} />
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Test notification */}
      {isEnabled && (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800/80 rounded-3xl overflow-hidden shadow-[0_1px_3px_0_rgb(0,0,0,0.04)] dark:shadow-none">
          <div className="px-5 py-3.5 border-b border-zinc-50 dark:border-zinc-800/60">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
              Testar
            </p>
          </div>
          <div className="p-4">
            <button
              onClick={handleTest}
              disabled={testStatus === 'sending'}
              className={cn(
                'w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border transition-all duration-150 active:scale-[0.98]',
                testStatus === 'ok'
                  ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200/80 dark:border-emerald-800/40'
                  : testStatus === 'error'
                    ? 'bg-red-50 dark:bg-red-950/20 border-red-200/80 dark:border-red-800/40'
                    : 'bg-zinc-50/80 dark:bg-zinc-800/40 border-zinc-200/80 dark:border-zinc-700/40 hover:border-zinc-300 dark:hover:border-zinc-600',
                testStatus === 'sending' && 'opacity-70 cursor-wait',
              )}
            >
              <div className={cn(
                'h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0',
                testStatus === 'ok' ? 'bg-emerald-600' : testStatus === 'error' ? 'bg-red-500' : 'bg-zinc-200 dark:bg-zinc-700',
              )}>
                {testStatus === 'sending'
                  ? <Loader2 size={14} className="text-zinc-500 animate-spin" />
                  : testStatus === 'ok'
                    ? <CheckCircle2 size={14} className="text-white" />
                    : testStatus === 'error'
                      ? <AlertCircle size={14} className="text-white" />
                      : <RefreshCw size={14} className="text-zinc-500 dark:text-zinc-400" />
                }
              </div>
              <span className={cn(
                'text-[13px] font-medium',
                testStatus === 'ok' ? 'text-emerald-700 dark:text-emerald-400'
                  : testStatus === 'error' ? 'text-red-600 dark:text-red-400'
                    : 'text-zinc-700 dark:text-zinc-300',
              )}>
                {testStatus === 'sending' ? 'Enviando...'
                  : testStatus === 'ok' ? 'Notificação enviada!'
                    : testStatus === 'error' ? 'Falha ao enviar'
                      : 'Enviar notificação de teste'}
              </span>
            </button>
            <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-3 px-1">
              A notificação aparece em até 30 segundos enquanto o app estiver aberto.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
