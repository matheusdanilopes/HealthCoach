'use client';

import { useState } from 'react';
import { ChefHat, Sparkles, Loader2, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  targetCalories: number;
  proteinGoal: number | null;
  carbsGoal: number | null;
  fatGoal: number | null;
}

interface Marmita {
  nome: string;
  descricao: string;
  calorias: number;
  proteina: number;
  carboidratos: number;
  gordura: number;
  ingredientes: string[];
  preparo: string;
}

interface MarmitaCardProps {
  marmita: Marmita;
  index: number;
}

function MarmitaCard({ marmita, index }: MarmitaCardProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800/80 rounded-2xl overflow-hidden shadow-[0_1px_3px_0_rgb(0,0,0,0.04)] dark:shadow-none">
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-xl bg-orange-50 dark:bg-orange-950/20 text-orange-500 flex items-center justify-center flex-shrink-0 text-lg font-bold">
            {index + 1}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[15px] font-semibold text-zinc-900 dark:text-zinc-100 leading-tight">
              {marmita.nome}
            </p>
            <p className="text-[12px] text-zinc-400 dark:text-zinc-500 mt-0.5 leading-snug">
              {marmita.descricao}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-2 mt-3">
          {[
            { label: 'Kcal', value: marmita.calorias, color: 'text-orange-600 dark:text-orange-400' },
            { label: 'Prot', value: `${marmita.proteina}g`, color: 'text-blue-600 dark:text-blue-400' },
            { label: 'Carb', value: `${marmita.carboidratos}g`, color: 'text-yellow-600 dark:text-yellow-400' },
            { label: 'Gord', value: `${marmita.gordura}g`, color: 'text-pink-600 dark:text-pink-400' },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-zinc-50 dark:bg-zinc-800/60 rounded-xl p-2 text-center">
              <p className={cn('text-[13px] font-bold tabular-nums leading-none', color)}>{value}</p>
              <p className="text-[9px] uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mt-1 font-semibold">{label}</p>
            </div>
          ))}
        </div>

        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-1.5 mt-3 text-[12px] font-medium text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
        >
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          {expanded ? 'Ocultar detalhes' : 'Ver ingredientes e preparo'}
        </button>
      </div>

      {expanded && (
        <div className="border-t border-zinc-50 dark:border-zinc-800/60 p-4 flex flex-col gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-2">
              Ingredientes
            </p>
            <ul className="flex flex-col gap-1">
              {marmita.ingredientes.map((item, i) => (
                <li key={i} className="flex items-start gap-2 text-[13px] text-zinc-700 dark:text-zinc-300">
                  <span className="text-emerald-500 mt-0.5">•</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-2">
              Modo de preparo
            </p>
            <p className="text-[13px] text-zinc-700 dark:text-zinc-300 leading-relaxed">
              {marmita.preparo}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export default function MarmitasClient({ targetCalories, proteinGoal, carbsGoal, fatGoal }: Props) {
  const [marmitas, setMarmitas] = useState<Marmita[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preferences, setPreferences] = useState('');

  async function generate() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/marmitas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetCalories, proteinGoal, carbsGoal, fatGoal, preferences }),
      });
      if (!res.ok) throw new Error('Erro ao gerar marmitas');
      const data = await res.json();
      setMarmitas(data.marmitas ?? []);
    } catch {
      setError('Não foi possível gerar as sugestões. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 pt-8 pb-6 animate-fade-in">
      <div>
        <h1 className="text-[22px] font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">
          Marmitas Inteligentes
        </h1>
        <p className="text-[13px] text-zinc-400 dark:text-zinc-500 mt-0.5 font-medium">
          Sugestões de refeições geradas com IA
        </p>
      </div>

      <div className="bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800/80 rounded-2xl p-4 shadow-[0_1px_3px_0_rgb(0,0,0,0.04)] dark:shadow-none flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <ChefHat size={15} className="text-orange-500" />
          <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
            Preferências opcionais
          </p>
        </div>
        <textarea
          value={preferences}
          onChange={(e) => setPreferences(e.target.value)}
          placeholder="Ex: sem glúten, vegetariano, alto teor proteico, ingredientes simples..."
          rows={3}
          className="w-full resize-none text-[13px] text-zinc-800 dark:text-zinc-200 bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-100 dark:border-zinc-700/50 rounded-xl px-3 py-2.5 placeholder-zinc-300 dark:placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 transition"
        />
        <div className="flex items-center gap-2 text-[12px] text-zinc-400 dark:text-zinc-500">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          Meta calórica: <span className="font-semibold text-zinc-600 dark:text-zinc-300">{targetCalories} kcal/dia</span>
        </div>

        <button
          onClick={generate}
          disabled={loading}
          className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-semibold text-[14px] transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? (
            <Loader2 size={16} className="animate-spin" />
          ) : marmitas.length > 0 ? (
            <RefreshCw size={16} />
          ) : (
            <Sparkles size={16} />
          )}
          {loading ? 'Gerando...' : marmitas.length > 0 ? 'Gerar novamente' : 'Gerar marmitas'}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/40 rounded-2xl px-4 py-3 text-[13px] text-red-600 dark:text-red-400 font-medium">
          {error}
        </div>
      )}

      {marmitas.length > 0 && (
        <div className="flex flex-col gap-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
            Sugestões geradas
          </p>
          {marmitas.map((m, i) => (
            <MarmitaCard key={i} marmita={m} index={i} />
          ))}
        </div>
      )}

      {!loading && marmitas.length === 0 && !error && (
        <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
          <div className="h-14 w-14 rounded-2xl bg-orange-50 dark:bg-orange-950/20 flex items-center justify-center text-2xl">
            🍱
          </div>
          <div>
            <p className="text-[14px] font-semibold text-zinc-600 dark:text-zinc-400">
              Pronto para montar suas marmitas?
            </p>
            <p className="text-[12px] text-zinc-400 dark:text-zinc-500 mt-1 max-w-[240px] leading-relaxed">
              Clique em Gerar marmitas para receber sugestões personalizadas com base nas suas metas.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
