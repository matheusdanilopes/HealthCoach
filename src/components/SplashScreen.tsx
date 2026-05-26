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
    }, 1400);
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
      <div className="flex flex-col items-center gap-5 animate-scale-in">
        <div className="h-[88px] w-[88px] rounded-[28px] bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center shadow-2xl shadow-emerald-600/40">
          <LogoIcon size={44} />
        </div>
        <div className="text-center">
          <p className="text-[28px] font-bold text-zinc-900 dark:text-zinc-100 tracking-tight leading-none">
            HealthCoach
          </p>
          <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400 mt-2 tracking-[0.2em] uppercase">
            AI Coach
          </p>
        </div>
      </div>

      <div className="absolute bottom-14 flex items-center gap-2">
        {[0, 180, 360].map((delay) => (
          <span
            key={delay}
            className="h-1.5 w-1.5 rounded-full bg-emerald-500"
            style={{ animation: `pulse-soft 1.4s ease-in-out ${delay}ms infinite` }}
          />
        ))}
      </div>
    </div>
  );
}
