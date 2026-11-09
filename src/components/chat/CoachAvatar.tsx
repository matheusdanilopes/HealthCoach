import { useId } from 'react';
import { cn } from '@/lib/utils';
import { COACH_NAME } from '@/lib/coach-persona';

/** Avatar ilustrado da Nina (SVG, funciona em qualquer tamanho). */
export default function CoachAvatar({ size = 32, className }: { size?: number; className?: string }) {
  const bg = useId();
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label={COACH_NAME}
      className={cn('flex-shrink-0 rounded-full', className)}
    >
      <defs>
        <linearGradient id={bg} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#34d399" />
          <stop offset="1" stopColor="#059669" />
        </linearGradient>
      </defs>
      <circle cx="32" cy="32" r="32" fill={`url(#${bg})`} />
      {/* Ombros (camiseta) */}
      <path d="M12 64c1-11 9-17 20-17s19 6 20 17z" fill="#ecfdf5" />
      <path d="M26 47.5c1.5 2.5 3.5 3.5 6 3.5s4.5-1 6-3.5" fill="none" stroke="#a7f3d0" strokeWidth="2" strokeLinecap="round" />
      {/* Pescoço */}
      <rect x="28" y="38" width="8" height="10" rx="3" fill="#e8a87c" />
      {/* Coque + folha */}
      <circle cx="32" cy="11.5" r="6.5" fill="#3f2a1e" />
      <path d="M36 7.5c3.5-4 8-4.2 10-3.6-.6 3.6-4 7-9.5 6.4z" fill="#86efac" />
      <path d="M37 9.6c2.6-1.6 4.8-2.8 7.4-4.2" fill="none" stroke="#15803d" strokeWidth="0.9" strokeLinecap="round" />
      {/* Cabelo atrás */}
      <path d="M17 30c0-10 6.5-16 15-16s15 6 15 16v6c0 2-1.5 3-3 3H20c-1.5 0-3-1-3-3z" fill="#3f2a1e" />
      {/* Rosto */}
      <ellipse cx="32" cy="30" rx="11.5" ry="12.5" fill="#f2b98f" />
      {/* Franja */}
      <path d="M20.5 27c1-7.5 6-11 11.5-11 6 0 10.5 3.5 11.5 10-5-.3-9.5-2.4-12-5.6-2.3 3.4-6 5.8-11 6.6z" fill="#3f2a1e" />
      {/* Olhos sorrindo */}
      <path d="M25.5 31c1-1.4 3-1.4 4 0M34.5 31c1-1.4 3-1.4 4 0" fill="none" stroke="#3f2a1e" strokeWidth="1.6" strokeLinecap="round" />
      {/* Bochechas */}
      <circle cx="25" cy="35" r="2.2" fill="#f87171" opacity="0.35" />
      <circle cx="39" cy="35" r="2.2" fill="#f87171" opacity="0.35" />
      {/* Sorriso */}
      <path d="M28.5 36.5c2 2.2 5 2.2 7 0" fill="none" stroke="#9a3412" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
