'use client';

import { useState, useEffect } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISSED_KEY = 'hc-install-dismissed';

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosHint, setShowIosHint] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Already installed as PWA
    if (window.matchMedia('(display-mode: standalone)').matches) return;
    // User already dismissed
    try {
      if (localStorage.getItem(DISMISSED_KEY)) return;
    } catch {}

    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

    if (isIos && isSafari) {
      setShowIosHint(true);
      setVisible(true);
      return;
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setVisible(true);
    };

    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const dismiss = () => {
    setVisible(false);
    try { localStorage.setItem(DISMISSED_KEY, '1'); } catch {}
  };

  const install = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setVisible(false);
    }
    setDeferredPrompt(null);
  };

  if (!visible) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 flex justify-center z-[150]">
    <div
      role="banner"
      className={[
        'w-full max-w-sm',
        'bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700/60',
        'rounded-2xl shadow-xl shadow-black/10 dark:shadow-black/40 p-4',
        'flex items-start gap-3',
        'animate-slide-up',
      ].join(' ')}
    >
      <div className="h-10 w-10 shrink-0 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center shadow-md shadow-emerald-600/30">
        <svg className="h-5 w-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2L12 14M12 14L8 10M12 14L16 10" />
          <path d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
        </svg>
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-semibold text-zinc-900 dark:text-zinc-100 leading-tight">
          Instalar HealthCoach
        </p>

        {showIosHint ? (
          <p className="text-[12px] text-zinc-500 dark:text-zinc-400 mt-0.5 leading-snug">
            Toque em{' '}
            <span className="inline-flex items-center gap-0.5 font-medium text-zinc-700 dark:text-zinc-300">
              <svg className="h-3.5 w-3.5 inline" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2L12 14M12 14L8 10M12 14L16 10" />
                <rect x="3" y="16" width="18" height="5" rx="1" />
              </svg>
              Compartilhar
            </span>{' '}
            e depois &quot;Adicionar à Tela Inicial&quot;.
          </p>
        ) : (
          <p className="text-[12px] text-zinc-500 dark:text-zinc-400 mt-0.5 leading-snug">
            Acesse mais rápido, sem precisar do navegador.
          </p>
        )}

        {!showIosHint && (
          <button
            onClick={install}
            className="mt-2 h-7 px-3 text-[12px] font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors"
          >
            Instalar
          </button>
        )}
      </div>

      <button
        onClick={dismiss}
        aria-label="Fechar"
        className="shrink-0 h-6 w-6 flex items-center justify-center rounded-full text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
      >
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
    </div>
  );
}
