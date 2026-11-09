'use client';

import { Utensils, ChartColumn, Lightbulb, Bell, ShieldCheck, Sparkles } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import CoachAvatar from './CoachAvatar';
import {
  COACH_CAPABILITIES, COACH_LIMITS, COACH_NAME, COACH_ROLE, COACH_TAGLINE, COACH_TIPS,
  type CoachCapabilityIcon,
} from '@/lib/coach-persona';

export const CAPABILITY_ICON: Record<CoachCapabilityIcon, typeof Utensils> = {
  utensils:  Utensils,
  chart:     ChartColumn,
  lightbulb: Lightbulb,
  bell:      Bell,
};

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500 mb-2">
      {children}
    </p>
  );
}

/** "Sobre a Nina": quem é, o que faz, como usar melhor e limites. */
export default function CoachAboutModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title={`Sobre a ${COACH_NAME}`}>
      <div className="flex flex-col gap-5">
        <div className="flex items-center gap-3">
          <CoachAvatar size={56} />
          <div className="min-w-0">
            <p className="text-[17px] font-bold text-zinc-900 dark:text-zinc-50 leading-tight">{COACH_NAME}</p>
            <p className="text-[12px] font-medium text-emerald-600 dark:text-emerald-400">{COACH_ROLE}</p>
            <p className="text-[12px] text-zinc-500 dark:text-zinc-400 mt-0.5">{COACH_TAGLINE}</p>
          </div>
        </div>

        <p className="text-[13px] leading-relaxed text-zinc-600 dark:text-zinc-300">
          Oi! Eu sou a {COACH_NAME}. Conheço suas metas e seus registros do dia, então minhas respostas usam os seus
          números. Falo de forma direta e sem julgamento: um dia fora da meta é só um dado, e a gente ajusta o próximo
          passo juntos.
        </p>

        <div>
          <SectionLabel>O que eu faço</SectionLabel>
          <ul className="flex flex-col gap-2.5">
            {COACH_CAPABILITIES.map((c) => {
              const Icon = CAPABILITY_ICON[c.icon];
              return (
                <li key={c.title} className="flex gap-3">
                  <span className="h-8 w-8 flex-shrink-0 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 flex items-center justify-center">
                    <Icon className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold text-zinc-800 dark:text-zinc-100">{c.title}</p>
                    <p className="text-[12px] text-zinc-500 dark:text-zinc-400 leading-snug">{c.description}</p>
                    <p className="text-[11px] text-zinc-400 dark:text-zinc-500 italic mt-0.5">Ex.: “{c.example}”</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        <div>
          <SectionLabel>Como aproveitar melhor</SectionLabel>
          <ul className="flex flex-col gap-1.5">
            {COACH_TIPS.map((tip) => (
              <li key={tip} className="flex gap-2 text-[12px] text-zinc-600 dark:text-zinc-300 leading-snug">
                <Sparkles className="w-3 h-3 mt-0.5 flex-shrink-0 text-amber-500" />
                <span>{tip}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-2xl bg-zinc-50 dark:bg-zinc-800/50 p-3.5">
          <div className="flex items-center gap-1.5 mb-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-400" />
            <p className="text-[12px] font-semibold text-zinc-700 dark:text-zinc-200">Importante</p>
          </div>
          <ul className="flex flex-col gap-1 list-disc pl-4">
            {COACH_LIMITS.map((l) => (
              <li key={l} className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-snug">{l}</li>
            ))}
          </ul>
        </div>
      </div>
    </Modal>
  );
}
