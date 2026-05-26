'use client';

import { useState, useEffect, useCallback } from 'react';
import { Download, X, Share2 } from 'lucide-react';
import { LogoIcon } from './ui/Logo';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

declare global {
  interface Window {
    __pwaInstallEvent: BeforeInstallPromptEvent | null;
  }
  interface WindowEventMap {
    'pwa-install-ready': Event;
  }
}

function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  return /iphone|ipad|ipod/i.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function isAndroid(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /android/i.test(navigator.userAgent);
}

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    ('standalone' in navigator && (navigator as { standalone?: boolean }).standalone === true)
  );
}

export default function PWAInstallPrompt() {
  const [show, setShow] = useState(false);
  const [ios, setIos] = useState(false);
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installing, setInstalling] = useState(false);

  const dismiss = useCallback(() => {
    setShow(false);
    try {
      const until = Date.now() + 7 * 24 * 60 * 60 * 1000;
      localStorage.setItem('pwa-prompt-dismissed-until', String(until));
    } catch {}
  }, []);

  useEffect(() => {
    if (isStandalone()) return;
    try {
      localStorage.removeItem('pwa-prompt-dismissed');
      const until = Number(localStorage.getItem('pwa-prompt-dismissed-until') ?? 0);
      if (until && Date.now() < until) return;
    } catch {}

    const onIOS = isIOS();
    setIos(onIOS);

    if (onIOS) {
      const t = setTimeout(() => setShow(true), 2000);
      return () => clearTimeout(t);
    }

    // Android: show banner regardless of whether beforeinstallprompt fires.
    // If the event is already captured, use it for one-tap install.
    // Otherwise show after a short delay with manual instructions as fallback.
    if (!isAndroid()) return;

    const stored = window.__pwaInstallEvent;
    if (stored) {
      setPrompt(stored);
      setShow(true);
      return;
    }

    let shown = false;

    function onReady() {
      const e = window.__pwaInstallEvent;
      if (e && !shown) {
        shown = true;
        setPrompt(e);
        setShow(true);
      }
    }
    window.addEventListener('pwa-install-ready', onReady);

    // Fallback: if beforeinstallprompt doesn't fire within 3 s, show
    // the banner anyway with manual "Add to Home Screen" instructions.
    const fallback = setTimeout(() => {
      if (!shown) {
        shown = true;
        setShow(true);
      }
    }, 3000);

    return () => {
      window.removeEventListener('pwa-install-ready', onReady);
      clearTimeout(fallback);
    };
  }, []);

  async function install() {
    if (!prompt) return;
    setInstalling(true);
    prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === 'accepted') {
      setShow(false);
      window.__pwaInstallEvent = null;
    }
    setInstalling(false);
  }

  if (!show) return null;

  return (
    <div className="fixed bottom-[80px] left-3 right-3 z-[150] sm:left-auto sm:right-4 sm:w-[340px] animate-slide-up">
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 rounded-2xl shadow-2xl shadow-black/15 dark:shadow-black/60 overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-zinc-100 dark:border-zinc-800/60">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center flex-shrink-0 shadow-sm shadow-emerald-600/25">
            <LogoIcon size={18} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold text-zinc-900 dark:text-zinc-100 leading-none">
              HealthCoach AI
            </p>
            <p className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-0.5 font-medium">
              Instalar na tela inicial
            </p>
          </div>
          <button
            onClick={dismiss}
            className="h-7 w-7 rounded-lg flex items-center justify-center text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors flex-shrink-0"
          >
            <X size={13} />
          </button>
        </div>

        <div className="p-4">
          {ios ? (
            <div className="flex flex-col gap-2.5">
              <p className="text-[12px] text-zinc-500 dark:text-zinc-400 leading-relaxed mb-0.5">
                Para instalar no iPhone ou iPad:
              </p>
              <div className="flex items-start gap-3 bg-zinc-50 dark:bg-zinc-800/60 rounded-xl px-3.5 py-2.5">
                <Share2 size={15} className="text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5" />
                <span className="text-[12px] text-zinc-700 dark:text-zinc-300 leading-relaxed">
                  Toque em <strong>Compartilhar</strong> (ícone de caixa com seta)
                </span>
              </div>
              <div className="flex items-start gap-3 bg-zinc-50 dark:bg-zinc-800/60 rounded-xl px-3.5 py-2.5">
                <Download size={15} className="text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5" />
                <span className="text-[12px] text-zinc-700 dark:text-zinc-300 leading-relaxed">
                  Selecione <strong>Adicionar à Tela de Início</strong>
                </span>
              </div>
              <button
                onClick={dismiss}
                className="mt-1 w-full h-9 rounded-xl border border-zinc-200 dark:border-zinc-700 text-[12px] font-medium text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
              >
                Entendido
              </button>
            </div>
          ) : prompt ? (
            <div className="flex flex-col gap-3">
              <p className="text-[12px] text-zinc-500 dark:text-zinc-400 leading-relaxed">
                Instale para acesso rápido e experiência nativa.
              </p>
              <button
                onClick={install}
                disabled={installing}
                className="w-full flex items-center justify-center gap-2 h-10 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl text-[13px] font-semibold transition-all active:scale-[0.97] shadow-sm shadow-emerald-600/25"
              >
                <Download size={15} />
                {installing ? 'Instalando…' : 'Instalar app'}
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              <p className="text-[12px] text-zinc-500 dark:text-zinc-400 leading-relaxed mb-0.5">
                Para instalar no Android:
              </p>
              <div className="flex items-start gap-3 bg-zinc-50 dark:bg-zinc-800/60 rounded-xl px-3.5 py-2.5">
                <span className="text-base leading-none flex-shrink-0 mt-px">⋮</span>
                <span className="text-[12px] text-zinc-700 dark:text-zinc-300 leading-relaxed">
                  Toque no menu <strong>⋮</strong> do Chrome
                </span>
              </div>
              <div className="flex items-start gap-3 bg-zinc-50 dark:bg-zinc-800/60 rounded-xl px-3.5 py-2.5">
                <Download size={15} className="text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5" />
                <span className="text-[12px] text-zinc-700 dark:text-zinc-300 leading-relaxed">
                  Selecione <strong>Adicionar à tela inicial</strong>
                </span>
              </div>
              <button
                onClick={dismiss}
                className="mt-1 w-full h-9 rounded-xl border border-zinc-200 dark:border-zinc-700 text-[12px] font-medium text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
              >
                Entendido
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
