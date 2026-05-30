'use client';

import { memo, useEffect, useState, useCallback, useRef } from 'react';
import {
  Sparkles, Apple, Dumbbell, TrendingUp, Brain,
  ChevronRight, RefreshCw, Droplets, Star, ChevronDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AIInsight } from '@/types';

const TYPE_CONFIG = {
  nutrition:  { icon: Apple,      label: 'Nutrição'    },
  hydration:  { icon: Droplets,   label: 'Hidratação'  },
  workout:    { icon: Dumbbell,   label: 'Treino'      },
  body:       { icon: TrendingUp, label: 'Corpo'       },
  behavior:   { icon: Brain,      label: 'Hábitos'     },
  motivation: { icon: Star,       label: 'Motivação'   },
};

const PRIORITY_CONFIG = {
  positivo: {
    badge: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border-emerald-200/80 dark:border-emerald-800/50',
    dot:   'bg-emerald-500',
    icon:  'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400',
    label: 'Positivo',
  },
  atencao: {
    badge: 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border-amber-200/80 dark:border-amber-800/50',
    dot:   'bg-amber-500',
    icon:  'bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400',
    label: 'Atenção',
  },
  recomendacao: {
    badge: 'bg-violet-50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-400 border-violet-200/80 dark:border-violet-800/50',
    dot:   'bg-violet-500',
    icon:  'bg-violet-50 dark:bg-violet-950/40 text-violet-600 dark:text-violet-400',
    label: 'Recomendação',
  },
  informativo: {
    badge: 'bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-400 border-sky-200/80 dark:border-sky-800/50',
    dot:   'bg-sky-500',
    icon:  'bg-sky-50 dark:bg-sky-950/40 text-sky-600 dark:text-sky-400',
    label: 'Info',
  },
};

function InsightSkeleton() {
  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800/80 rounded-2xl shadow-[0_1px_3px_0_rgb(0,0,0,0.05)] dark:shadow-none overflow-hidden">
      <div className="h-[2px] bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-600" />
      <div className="p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="h-2.5 w-2.5 rounded-full bg-zinc-100 dark:bg-zinc-800 animate-pulse" />
            <div className="h-2.5 w-28 rounded-full bg-zinc-100 dark:bg-zinc-800 animate-pulse" />
          </div>
        </div>
        <div className="flex items-start gap-3">
          <div className="h-9 w-9 rounded-xl bg-zinc-100 dark:bg-zinc-800 animate-pulse flex-shrink-0" />
          <div className="flex-1 space-y-2 pt-0.5">
            <div className="h-3.5 w-2/3 rounded-full bg-zinc-100 dark:bg-zinc-800 animate-pulse" />
            <div className="h-3 w-full rounded-full bg-zinc-100 dark:bg-zinc-800 animate-pulse" />
            <div className="h-3 w-4/5 rounded-full bg-zinc-100 dark:bg-zinc-800 animate-pulse" />
          </div>
        </div>
      </div>
    </div>
  );
}

function InsightError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800/80 rounded-2xl shadow-[0_1px_3px_0_rgb(0,0,0,0.05)] dark:shadow-none overflow-hidden">
      <div className="h-[2px] bg-gradient-to-r from-zinc-300 via-zinc-200 to-zinc-300 dark:from-zinc-700 dark:via-zinc-600 dark:to-zinc-700" />
      <div className="p-5 flex items-center gap-3">
        <div className="h-9 w-9 rounded-xl bg-zinc-50 dark:bg-zinc-800 flex items-center justify-center flex-shrink-0">
          <Brain size={16} className="text-zinc-300 dark:text-zinc-600" />
        </div>
        <div className="flex-1">
          <p className="text-[13px] text-zinc-400 dark:text-zinc-500">Insights temporariamente indisponíveis</p>
        </div>
        <button
          onClick={onRetry}
          className="text-[12px] font-semibold text-emerald-600 dark:text-emerald-400 hover:underline whitespace-nowrap"
        >
          Tentar novamente
        </button>
      </div>
    </div>
  );
}

const AUTO_REFRESH_DEBOUNCE_MS = 1_500;

interface AIInsightCardProps {
  userId: string;
  refreshKey?: number;
  onOpenChat?: (message: string) => void;
}

const AIInsightCard = memo(function AIInsightCard({
  userId: _userId,
  refreshKey = 0,
  onOpenChat,
}: AIInsightCardProps) {
  const [insight, setInsight]       = useState<AIInsight | null>(null);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [expanded, setExpanded]     = useState(false);
  const debounceRef                 = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchInsight = useCallback(async (force = false) => {
    if (force) {
      setRefreshing(true);
    } else {
      setLoading((prev) => prev || true);
    }
    try {
      const res = await fetch(force ? '/api/ai-insights?refresh=1' : '/api/ai-insights');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: AIInsight = await res.json();
      if (data && data.id) {
        setInsight(data);
        setExpanded(false);
        setError(false);
      } else {
        throw new Error('Invalid response');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn('[AIInsightCard] fetch failed:', msg);
      setError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchInsight(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (refreshKey === 0) return;
    setRefreshing(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchInsight(true), AUTO_REFRESH_DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  if (loading && !insight) return <InsightSkeleton />;
  if (error && !insight)   return <InsightError onRetry={() => fetchInsight()} />;
  if (!insight)            return null;

  const typeConfig = TYPE_CONFIG[insight.type as keyof typeof TYPE_CONFIG]            ?? TYPE_CONFIG.behavior;
  const prioConfig = PRIORITY_CONFIG[insight.priority as keyof typeof PRIORITY_CONFIG] ?? PRIORITY_CONFIG.informativo;
  const Icon       = typeConfig.icon;

  const expandedText = typeof insight.metadata?.expanded === 'string' && insight.metadata.expanded
    ? insight.metadata.expanded
    : null;

  function handleCTA() {
    if (!onOpenChat) return;
    const msg = `Quero saber mais sobre: "${insight!.title}". ${insight!.message}`;
    onOpenChat(msg);
  }

  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800/80 rounded-2xl shadow-[0_1px_3px_0_rgb(0,0,0,0.05)] dark:shadow-none overflow-hidden animate-fade-in">
      {/* Gradient accent bar */}
      <div className="h-[2px] bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-600" />

      <div className="p-5">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-1.5">
            <Sparkles size={11} className="text-emerald-500 flex-shrink-0" />
            <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
              Insights com IA
            </span>
          </div>
          <button
            onClick={() => fetchInsight(true)}
            disabled={refreshing}
            className="p-1 rounded-lg text-zinc-300 dark:text-zinc-600 hover:text-zinc-500 dark:hover:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800/70 transition-all disabled:opacity-40 active:scale-90"
            aria-label="Atualizar insight"
          >
            <RefreshCw size={12} className={cn(refreshing && 'animate-spin')} />
          </button>
        </div>

        {/* Content */}
        <div className="flex items-start gap-3">
          <div className={cn('h-9 w-9 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5', prioConfig.icon)}>
            <Icon size={16} />
          </div>

          <div className="flex-1">
            {/* Title + priority badge */}
            <div className="flex items-start gap-2 mb-2">
              <h3 className="flex-1 text-[14px] font-semibold text-zinc-900 dark:text-zinc-100 leading-snug">
                {insight.title}
              </h3>
              <span className={cn(
                'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border flex-shrink-0 mt-0.5',
                prioConfig.badge,
              )}>
                <span className={cn('h-1.5 w-1.5 rounded-full', prioConfig.dot)} />
                {prioConfig.label}
              </span>
            </div>

            {/* Main message — never truncated */}
            <p className="text-[13px] text-zinc-500 dark:text-zinc-400 leading-relaxed">
              {insight.message}
            </p>

            {/* Expandable deeper analysis */}
            {expandedText && (
              <>
                <div
                  className="overflow-hidden transition-all duration-300 ease-in-out"
                  style={{ maxHeight: expanded ? '500px' : '0' }}
                >
                  <p className="text-[13px] text-zinc-500 dark:text-zinc-400 leading-relaxed mt-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
                    {expandedText}
                  </p>
                </div>
                <button
                  onClick={() => setExpanded(!expanded)}
                  className="mt-2 flex items-center gap-1 text-[12px] font-semibold text-emerald-600 dark:text-emerald-400 hover:text-emerald-500 dark:hover:text-emerald-300 transition-colors"
                >
                  {expanded ? 'Ver menos' : 'Ver mais'}
                  <ChevronDown
                    size={12}
                    strokeWidth={2.5}
                    className={cn('transition-transform duration-200', expanded && 'rotate-180')}
                  />
                </button>
              </>
            )}
          </div>
        </div>

        {/* CTA → opens chat with context */}
        {insight.cta && onOpenChat && (
          <div className="flex justify-end mt-4">
            <button
              onClick={handleCTA}
              className="flex items-center gap-1.5 h-8 px-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-[12px] font-semibold shadow-sm shadow-emerald-600/25 transition-all active:scale-[0.97]"
            >
              {insight.cta}
              <ChevronRight size={12} strokeWidth={2.5} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
});

export default AIInsightCard;
