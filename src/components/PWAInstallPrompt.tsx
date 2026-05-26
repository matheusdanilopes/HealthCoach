'use client';

import { useState, useEffect } from 'react';
import { Download, X, Share2 } from 'lucide-react';
import { LogoIcon } from './ui/Logo';

type Platform = 'android' | 'ios' | 'other';

function detectPlatform(): Platform {
  const ua = navigator.userAgent.toLowerCase();
  if (/iphone|ipad|ipod/.test(ua)) return 'ios';
  if (/android/.test(ua)) return 'android';
  return 'other';
}

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    ('standalone' in navigator && (navigator as { standalone?: boolean }).standalone === true)
  );
}

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export default function PWAInstallPrompt() {
  const [platform, setPlatform] = useState<Platform | null>(null);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [show, setShow] = useState(false);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    if (isStandalone()) return;
    try {
      if (localStorage.getItem('pwa-prompt-dismissed')) return;
    } catch {}

    const p = detectPlatform();
    setPlatform(p);

    if (p === 'android') {
      const handler = (e: Event) => {
        e.preventDefault();
        setDeferredPrompt(e as BeforeInstallPromptEvent);
        setShow(true);
      };
      window.addEventListener('beforeinstallprompt', handler);
      return () => window.removeEventListener('beforeinstallprompt', handler);
    }

    if (p === 'ios') {
      const t = setTimeout(() => setShow(true), 3000);
      return () => clearTimeout(t);
    }
  }, []);

  function dismiss() {
    setShow(false);
    try { localStorage.setItem('pwa-prompt-dismissed', '1'); } catch {}
  }

  async function install() {
    if (!deferredPrompt) return;
    setInstalling(true);
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') setShow(false);
    setInstalling(false);
    setDeferredPrompt(null);
  }

  if (!show || !platform || platform === 'other') return null;

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
          {platform === 'ios' ? (
            <div className="flex flex-col gap-2.5">
              <p className="text-[12px] text-zinc-500 dark:text-zinc-400 leading-relaxed mb-1">
                Para instalar no iPhone ou iPad:
              </p>
              <div className="flex items-center gap-3 bg-zinc-50 dark:bg-zinc-800/60 rounded-xl px-3.5 py-2.5">
                <Share2 size={15} className="text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
                <span className="text-[12px] text-zinc-700 dark:text-zinc-300">
                  1. Toque em <strong>Compartilhar</strong> (ícone de caixa com seta)
                </span>
              </div>
              <div className="flex items-center gap-3 bg-zinc-50 dark:bg-zinc-800/60 rounded-xl px-3.5 py-2.5">
                <Download size={15} className="text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
                <span className="text-[12px] text-zinc-700 dark:text-zinc-300">
                  2. Selecione <strong>Adicionar à Tela de Início</strong>
                </span>
              </div>
              <button
                onClick={dismiss}
                className="mt-1 w-full h-9 rounded-xl border border-zinc-200 dark:border-zinc-700 text-[12px] font-medium text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
              >
                Entendido
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <p className="text-[12px] text-zinc-500 dark:text-zinc-400 leading-relaxed">
                Instale o app para acesso rápido, offline e experiência nativa.
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
          )}
        </div>
      </div>
    </div>
  );
}
