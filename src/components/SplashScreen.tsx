'use client';

import { useState, useEffect } from 'react';
import { LogoIcon } from './ui/Logo';

export default function SplashScreen() {
  const [rendered, setRendered] = useState(false);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    try {
      if (sessionStorage.getItem('hc-splash')) return;
    } catch {}
    setRendered(true);
    const t = setTimeout(() => {
      setVisible(false);
      try { sessionStorage.setItem('hc-splash', '1'); } catch {}
    }, 1600);
    return () => clearTimeout(t);
  }, []);

  if (!rendered) return null;

  return (
    <div
      className={[
        'fixed inset-0 z-[200] flex flex-col items-center justify-center select-none',
        'bg-white dark:bg-[#0a0a0b]',
        'transition-opacity duration-500 ease-out',
        visible ? 'opacity-100' : 'opacity-0 pointer-events-none',
      ].join(' ')}
    >
      <div className="flex flex-col items-center gap-6">
        {/* Icon with ambient glow */}
        <div className="relative animate-splash-icon">
          <div className="absolute inset-0 rounded-[32px] bg-emerald-500/20 blur-2xl scale-125" />
          <div className="relative h-[88px] w-[88px] rounded-[28px] bg-gradient-to-br from-emerald-500 to-emerald-800 flex items-center justify-center shadow-2xl shadow-emerald-700/40">
            <LogoIcon size={44} />
          </div>
        </div>

        {/* Brand text */}
        <div className="text-center animate-splash-text">
          <p className="text-[28px] font-bold text-zinc-900 dark:text-zinc-100 tracking-tight leading-none">
            HealthCoach
          </p>
          <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400 mt-2 tracking-[0.2em] uppercase">
            AI Coach
          </p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="absolute bottom-12 w-16 h-[2px] rounded-full bg-zinc-200 dark:bg-zinc-800 overflow-hidden">
        <div className="h-full bg-emerald-500 rounded-full animate-splash-progress" />
      </div>
    </div>
  );
}
