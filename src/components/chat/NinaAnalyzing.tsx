'use client';

import { useEffect, useId, useState } from 'react';
import { cn } from '@/lib/utils';
import { COACH_NAME } from '@/lib/coach-persona';

export type NinaAnalyzingVariant = 'meal' | 'workout' | 'steps' | 'reanalyze' | 'behavior' | 'mealprep' | 'trainingplan';

const MESSAGES: Record<NinaAnalyzingVariant, string[]> = {
  meal: [
    'Dando uma olhada no seu prato…',
    'Identificando os alimentos…',
    'Estimando as porções…',
    'Consultando a tabela TACO…',
    'Calculando calorias e macros…',
    'Só mais um instante…',
  ],
  workout: [
    'Lendo o seu treino…',
    'Entendendo os exercícios…',
    'Avaliando a intensidade…',
    'Calculando o gasto calórico…',
    'Só mais um instante…',
  ],
  steps: [
    'Contando os seus passos…',
    'Calculando o gasto calórico…',
  ],
  reanalyze: [
    'Reavaliando o alimento…',
    'Estimando a porção…',
    'Consultando a tabela TACO…',
    'Recalculando calorias e macros…',
    'Só mais um instante…',
  ],
  behavior: [
    'Lendo seus registros…',
    'Identificando padrões de comportamento…',
    'Comparando com o seu objetivo…',
    'Montando sua estratégia…',
    'Só mais um instante…',
  ],
  mealprep: [
    'Escolhendo as proteínas…',
    'Combinando carboidratos e legumes…',
    'Ajustando as porções às suas metas…',
    'Calculando macros e custo…',
    'Montando a lista de compras…',
    'Só mais um instante…',
  ],
  trainingplan: [
    'Lendo seu perfil e histórico…',
    'Escolhendo a divisão da semana…',
    'Selecionando os exercícios…',
    'Ajustando séries, repetições e cargas…',
    'Escrevendo as explicações de execução…',
    'Só mais um instante…',
  ],
};

const ORBIT: Record<NinaAnalyzingVariant, string[]> = {
  meal: ['🥗', '🍎', '🍗'],
  workout: ['🏋️', '🔥', '⏱️'],
  steps: ['👟', '🔥', '📍'],
  reanalyze: ['🥗', '🍎', '🍗'],
  behavior: ['📊', '🎯', '💡'],
  mealprep: ['🍱', '🥦', '🍗'],
  trainingplan: ['🏋️', '📅', '💪'],
};

/** Tempo em cada mensagem: análises mais longas avançam mais devagar. */
const MESSAGE_INTERVAL_MS: Partial<Record<NinaAnalyzingVariant, number>> = {
  behavior: 4000,
  mealprep: 3500,
  trainingplan: 6000,
};
const DEFAULT_INTERVAL_MS = 2200;

interface NinaAnalyzingProps {
  variant: NinaAnalyzingVariant;
  /** Foto sendo analisada (aparece com uma linha de varredura). */
  imageSrc?: string | null;
  /** Versão em linha, para o lugar de um botão (ex.: "Re-analisar com IA"). */
  compact?: boolean;
  /** Título acima das mensagens (padrão: "Nina está analisando"). */
  title?: string;
  className?: string;
}

/**
 * A Nina trabalhando enquanto a IA analisa uma refeição ou um treino:
 * ela flutua, pisca, varre com a lupa e as mensagens mostram cada etapa.
 */
export default function NinaAnalyzing({ variant, imageSrc, compact, title, className }: NinaAnalyzingProps) {
  const messages = MESSAGES[variant];
  const heading = title ?? `${COACH_NAME} está analisando`;
  const interval = MESSAGE_INTERVAL_MS[variant] ?? DEFAULT_INTERVAL_MS;
  const [index, setIndex] = useState(0);

  // Avança pelas etapas e para na última ("Só mais um instante…").
  useEffect(() => {
    if (index >= messages.length - 1) return;
    const id = setTimeout(() => setIndex((i) => i + 1), interval);
    return () => clearTimeout(id);
  }, [index, messages.length, interval]);

  if (compact) {
    return (
      <div
        role="status"
        aria-live="polite"
        className={cn(
          'animate-fade-in flex items-center gap-3 rounded-xl px-3 py-2',
          'bg-gradient-to-r from-emerald-50 via-green-50 to-teal-50 border border-emerald-200',
          'dark:from-emerald-950/40 dark:via-green-950/30 dark:to-teal-950/20 dark:border-emerald-800/60',
          className
        )}
      >
        <div className="relative h-10 w-10 flex-shrink-0" aria-hidden="true">
          <div className="nina-halo absolute -inset-0.5 rounded-full bg-emerald-300/40 dark:bg-emerald-500/25 blur-[3px]" />
          <div className="absolute inset-0">
            <NinaFigure />
          </div>
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[10px] font-bold uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
            {heading}
          </span>
          <span key={index} className="animate-count-up truncate text-[12px] font-medium text-zinc-700 dark:text-zinc-200">
            {messages[index]}
          </span>
        </div>
        <Dots />
      </div>
    );
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'animate-fade-in flex flex-col items-center gap-3 rounded-2xl px-4 py-5',
        'bg-gradient-to-br from-emerald-50 via-green-50 to-teal-50 border border-emerald-100',
        'dark:from-emerald-950/40 dark:via-green-950/30 dark:to-teal-950/20 dark:border-emerald-900/40',
        className
      )}
    >
      {imageSrc && (
        <div className="nina-scan relative w-full h-28 rounded-xl overflow-hidden bg-zinc-100 dark:bg-zinc-800">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imageSrc} alt="" className="w-full h-full object-cover opacity-90" />
        </div>
      )}

      <div className="relative h-[132px] w-[132px]" aria-hidden="true">
        {/* Halo + anel tracejado */}
        <div className="nina-halo absolute inset-3 rounded-full bg-emerald-300/30 dark:bg-emerald-500/20 blur-md" />
        <div className="nina-ring absolute inset-0 rounded-full border-2 border-dashed border-emerald-300/70 dark:border-emerald-700/70" />

        {/* Ícones orbitando */}
        <div className="nina-orbit absolute inset-0">
          {ORBIT[variant].map((emoji, i) => (
            <span
              key={emoji}
              className="absolute left-1/2 top-1/2 -ml-3.5 -mt-3.5 h-7 w-7"
              style={{ transform: `rotate(${i * 120}deg) translateY(-66px) rotate(${-i * 120}deg)` }}
            >
              <span className="nina-orbit-item flex h-7 w-7 items-center justify-center rounded-full bg-white dark:bg-zinc-800 shadow-sm text-[14px]">
                {emoji}
              </span>
            </span>
          ))}
        </div>

        {/* Nina */}
        <div className="absolute inset-[22px]">
          <NinaFigure />
        </div>
      </div>

      <div className="flex flex-col items-center gap-1.5 min-h-[40px]">
        <p className="text-[11px] font-bold uppercase tracking-widest text-emerald-600 dark:text-emerald-400 text-center">
          {heading}
        </p>
        <p key={index} className="animate-count-up text-[13px] font-medium text-zinc-700 dark:text-zinc-200 text-center">
          {messages[index]}
        </p>
      </div>

      <Dots />
    </div>
  );
}

function Dots() {
  return (
    <div className="flex flex-shrink-0 gap-1" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="nina-dot h-1.5 w-1.5 rounded-full bg-emerald-500"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </div>
  );
}

/** A Nina do avatar, de olhos abertos, com lupa e brilhos animados. */
function NinaFigure() {
  const bg = useId();
  return (
    <svg viewBox="0 0 64 64" className="h-full w-full overflow-visible">
      <defs>
        <linearGradient id={bg} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#34d399" />
          <stop offset="1" stopColor="#059669" />
        </linearGradient>
        <clipPath id={`${bg}-clip`}>
          <circle cx="32" cy="32" r="32" />
        </clipPath>
      </defs>

      <circle cx="32" cy="32" r="32" fill={`url(#${bg})`} />

      <g clipPath={`url(#${bg}-clip)`}>
        <g className="nina-bob">
          {/* Ombros (camiseta) */}
          <path d="M12 64c1-11 9-17 20-17s19 6 20 17z" fill="#ecfdf5" />
          <path d="M26 47.5c1.5 2.5 3.5 3.5 6 3.5s4.5-1 6-3.5" fill="none" stroke="#a7f3d0" strokeWidth="2" strokeLinecap="round" />
          {/* Pescoço */}
          <rect x="28" y="38" width="8" height="10" rx="3" fill="#e8a87c" />
          {/* Coque + folha balançando */}
          <circle cx="32" cy="11.5" r="6.5" fill="#3f2a1e" />
          <g className="nina-leaf">
            <path d="M36 7.5c3.5-4 8-4.2 10-3.6-.6 3.6-4 7-9.5 6.4z" fill="#86efac" />
            <path d="M37 9.6c2.6-1.6 4.8-2.8 7.4-4.2" fill="none" stroke="#15803d" strokeWidth="0.9" strokeLinecap="round" />
          </g>
          {/* Cabelo atrás */}
          <path d="M17 30c0-10 6.5-16 15-16s15 6 15 16v6c0 2-1.5 3-3 3H20c-1.5 0-3-1-3-3z" fill="#3f2a1e" />
          {/* Rosto */}
          <ellipse cx="32" cy="30" rx="11.5" ry="12.5" fill="#f2b98f" />
          {/* Franja */}
          <path d="M20.5 27c1-7.5 6-11 11.5-11 6 0 10.5 3.5 11.5 10-5-.3-9.5-2.4-12-5.6-2.3 3.4-6 5.8-11 6.6z" fill="#3f2a1e" />
          {/* Olhos abertos (piscam e acompanham a lupa) */}
          <g className="nina-eyes">
            <g className="nina-blink">
              <ellipse cx="27.5" cy="31" rx="1.6" ry="2" fill="#3f2a1e" />
              <ellipse cx="36.5" cy="31" rx="1.6" ry="2" fill="#3f2a1e" />
              <circle cx="28" cy="30.3" r="0.55" fill="#fff" />
              <circle cx="37" cy="30.3" r="0.55" fill="#fff" />
            </g>
          </g>
          {/* Bochechas */}
          <circle cx="25" cy="35" r="2.2" fill="#f87171" opacity="0.35" />
          <circle cx="39" cy="35" r="2.2" fill="#f87171" opacity="0.35" />
          {/* Boquinha concentrada */}
          <path d="M30 37.2c1.3 1 2.7 1 4 0" fill="none" stroke="#9a3412" strokeWidth="1.5" strokeLinecap="round" />
        </g>
      </g>

      {/* Lupa varrendo */}
      <g className="nina-lens">
        <line x1="51" y1="51" x2="57" y2="57" stroke="#3f2a1e" strokeWidth="2.8" strokeLinecap="round" />
        <circle cx="47" cy="47" r="5.8" fill="#ecfeff" fillOpacity="0.55" stroke="#047857" strokeWidth="2.2" />
        <path d="M44 45a3.8 3.8 0 0 1 2.5-1.9" fill="none" stroke="#fff" strokeWidth="1.2" strokeLinecap="round" />
      </g>

      {/* Brilhos */}
      <path className="nina-sparkle" style={{ animationDelay: '0s' }} d="M8 10l1.2 2.8L12 14l-2.8 1.2L8 18l-1.2-2.8L4 14l2.8-1.2z" fill="#fde68a" />
      <path className="nina-sparkle" style={{ animationDelay: '0.6s' }} d="M56 20l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9z" fill="#fff" />
      <path className="nina-sparkle" style={{ animationDelay: '1.2s' }} d="M6 44l.8 1.7 1.7.8-1.7.8L6 49l-.8-1.7-1.7-.8 1.7-.8z" fill="#a7f3d0" />
    </svg>
  );
}
