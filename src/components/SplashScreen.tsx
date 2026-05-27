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
        'transition-opacity duration-500 ease-out',
        visible ? 'opacity-100' : 'opacity-0 pointer-events-none',
      ].join(' ')}
      style={{ background: 'linear-gradient(160deg, #059669 0%, #064e3b 55%, #022c22 100%)' }}
    >
      <div className="flex flex-col items-center gap-6">
        {/* Icon with glow + shadow */}
        <div className="relative animate-splash-icon">
          {/* Ambient glow halo */}
          <div className="absolute inset-0 rounded-[32px] bg-emerald-400/30 blur-2xl scale-150" />
          {/* Icon container */}
          <div
            className="relative h-[88px] w-[88px] rounded-[28px] bg-gradient-to-br from-emerald-400 to-emerald-800 flex items-center justify-center"
            style={{ boxShadow: '0 20px 60px rgba(0,0,0,0.45), 0 8px 24px rgba(0,0,0,0.3), 0 0 0 1px rgba(255,255,255,0.08)' }}
          >
            <LogoIcon size={44} />
          </div>
        </div>

        {/* Brand text */}
        <div className="text-center animate-splash-text">
          <p className="text-[28px] font-bold text-white tracking-tight leading-none">
            HealthCoach
          </p>
          <p className="text-sm font-semibold text-emerald-300 mt-2 tracking-[0.2em] uppercase">
            AI Coach
          </p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="absolute bottom-12 w-16 h-[2px] rounded-full bg-white/20 overflow-hidden">
        <div className="h-full bg-white/70 rounded-full animate-splash-progress" />
      </div>
    </div>
  );
}
