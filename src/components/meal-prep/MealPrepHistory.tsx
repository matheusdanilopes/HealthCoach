'use client';

import { useState, useEffect } from 'react';
import {
  BookOpen, Star, ShoppingCart, Trash2,
  Loader2, Check, AlertCircle, ChefHat,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import RecipeModal, { type RecipeModalData } from './RecipeModal';

interface SavedRecipe {
  id:             string;
  name:           string;
  meal_count:     number;
  goal:           string;
  budget:         string;
  plan_label:     string;
  avg_calories:   number;
  avg_protein:    number;
  avg_carbs:      number;
  avg_fat:        number;
  estimated_cost: number;
  cost_per_meal:  number;
  ingredients:    { name: string; quantity: string }[];
  steps:          { title: string; items: string[] }[];
  shopping_list:  { name: string; amount: string; category: string; total_cost: number }[];
  ai_explanation: string | null;
  is_favorite:    boolean;
  created_at:     string;
}

const GOAL_LABELS: Record<string, string> = {
  emagrecimento: 'Emagrecer',
  manutencao:    'Manutenção',
  massa:         'Ganho de Massa',
};
const BUDGET_LABELS: Record<string, string> = {
  economico: 'Econômico',
  moderado:  'Moderado',
  premium:   'Premium',
};

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return iso;
  }
}

function toModalData(r: SavedRecipe): RecipeModalData {
  return {
    title:          r.name,
    plan_label:     r.plan_label,
    goal:           r.goal,
    budget:         r.budget,
    meal_count:     r.meal_count,
    avg_calories:   r.avg_calories,
    avg_protein:    r.avg_protein,
    avg_carbs:      r.avg_carbs,
    avg_fat:        r.avg_fat,
    estimated_cost: r.estimated_cost,
    cost_per_meal:  r.cost_per_meal,
    ingredients:    r.ingredients ?? [],
    steps:          r.steps ?? [],
    ai_explanation: r.ai_explanation ?? undefined,
  };
}

type SendState = 'idle' | 'sending' | 'success' | 'error';

export default function MealPrepHistory() {
  const [recipes,     setRecipes]     = useState<SavedRecipe[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [activeRecipe,setActiveRecipe]= useState<SavedRecipe | null>(null);
  const [sendStates,  setSendStates]  = useState<Record<string, SendState>>({});
  const [deleting,    setDeleting]    = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/meal-prep/history')
      .then((r) => r.json())
      .then((data) => { setRecipes(data.recipes ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  async function handleToggleFavorite(recipe: SavedRecipe) {
    const newVal = !recipe.is_favorite;
    setRecipes((prev) => prev.map((r) => r.id === recipe.id ? { ...r, is_favorite: newVal } : r));
    await fetch(`/api/meal-prep/${recipe.id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ is_favorite: newVal }),
    }).catch(() => {
      setRecipes((prev) => prev.map((r) => r.id === recipe.id ? { ...r, is_favorite: !newVal } : r));
    });
  }

  async function handleDelete(id: string) {
    const snapshot = [...recipes];
    setDeleting(id);
    setRecipes((prev) => prev.filter((r) => r.id !== id));
    try {
      const res = await fetch(`/api/meal-prep/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
    } catch {
      setRecipes(snapshot);
    } finally {
      setDeleting(null);
    }
  }

  async function handleSend(recipe: SavedRecipe) {
    if (!recipe.shopping_list?.length) return;
    setSendStates((prev) => ({ ...prev, [recipe.id]: 'sending' }));
    try {
      const res  = await fetch('/api/shopping-list/send', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ items: recipe.shopping_list }),
      });
      const data = await res.json();
      setSendStates((prev) => ({ ...prev, [recipe.id]: data.failed > 0 ? 'error' : 'success' }));
    } catch {
      setSendStates((prev) => ({ ...prev, [recipe.id]: 'error' }));
    }
    setTimeout(() => setSendStates((prev) => ({ ...prev, [recipe.id]: 'idle' })), 3000);
  }

  if (loading) {
    return (
      <div className="bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800/80 rounded-2xl p-5 shadow-[0_1px_3px_0_rgb(0,0,0,0.04)] dark:shadow-none">
        <div className="flex items-center gap-2 mb-4">
          <ChefHat size={13} className="text-emerald-500" />
          <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
            Minhas Marmitas Aprovadas
          </p>
        </div>
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="h-24 rounded-2xl bg-zinc-50 dark:bg-zinc-800/60 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (recipes.length === 0) {
    return (
      <div className="bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800/80 rounded-2xl p-5 shadow-[0_1px_3px_0_rgb(0,0,0,0.04)] dark:shadow-none">
        <div className="flex items-center gap-2 mb-3">
          <ChefHat size={13} className="text-emerald-500" />
          <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
            Minhas Marmitas Aprovadas
          </p>
        </div>
        <div className="flex flex-col items-center gap-2 py-4 text-center">
          <span className="text-2xl">🍱</span>
          <p className="text-[13px] font-semibold text-zinc-500 dark:text-zinc-400">
            Nenhuma marmita aprovada ainda
          </p>
          <p className="text-[11px] text-zinc-400 dark:text-zinc-500 max-w-[220px] leading-relaxed">
            Gere e aprove cardápios acima para salvá-los aqui.
          </p>
        </div>
      </div>
    );
  }

  const favorites = recipes.filter((r) => r.is_favorite);
  const rest      = recipes.filter((r) => !r.is_favorite);
  const sorted    = [...favorites, ...rest];

  return (
    <>
      <div className="bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800/80 rounded-2xl p-5 shadow-[0_1px_3px_0_rgb(0,0,0,0.04)] dark:shadow-none">
        {/* Header */}
        <div className="flex items-center gap-2 mb-1">
          <ChefHat size={13} className="text-emerald-500" />
          <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
            Minhas Marmitas Aprovadas
          </p>
        </div>
        <p className="text-[12px] text-zinc-500 dark:text-zinc-400 mb-4 leading-relaxed">
          Receitas que você aprovou — acesse o passo a passo e envie para sua lista de compras.
        </p>

        <div className="space-y-3">
          {sorted.map((recipe) => {
            const sendState = sendStates[recipe.id] ?? 'idle';
            const isDeleting = deleting === recipe.id;
            return (
              <div key={recipe.id} className={cn(
                'border rounded-2xl p-4 transition-all duration-200',
                recipe.is_favorite
                  ? 'border-amber-200 dark:border-amber-800/60 bg-amber-50/40 dark:bg-amber-950/10'
                  : 'border-zinc-100 dark:border-zinc-700/60 bg-white dark:bg-zinc-900/50',
                isDeleting && 'opacity-40 pointer-events-none'
              )}>
                {/* Title row */}
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {recipe.is_favorite && (
                        <Star size={11} className="text-amber-400 fill-amber-400 flex-shrink-0" />
                      )}
                      <p className="text-[13px] font-bold text-zinc-800 dark:text-zinc-200 leading-snug">
                        🍱 {recipe.name}
                      </p>
                    </div>
                    <p className="text-[11px] text-zinc-400 dark:text-zinc-500">{formatDate(recipe.created_at)}</p>
                  </div>
                  <span className="text-[12px] font-semibold text-zinc-500 dark:text-zinc-400 whitespace-nowrap flex-shrink-0">
                    R$ {recipe.estimated_cost?.toFixed(0)}
                  </span>
                </div>

                {/* Tags */}
                <div className="flex flex-wrap gap-1 mb-3">
                  <span className="px-1.5 py-0.5 rounded-full text-[9px] font-semibold bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400">
                    {GOAL_LABELS[recipe.goal] ?? recipe.goal}
                  </span>
                  <span className="px-1.5 py-0.5 rounded-full text-[9px] font-semibold bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400">
                    {BUDGET_LABELS[recipe.budget] ?? recipe.budget}
                  </span>
                  <span className="px-1.5 py-0.5 rounded-full text-[9px] font-semibold bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400">
                    {recipe.meal_count} marmitas
                  </span>
                  <span className="px-1.5 py-0.5 rounded-full text-[9px] font-semibold bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400">
                    Opção {recipe.plan_label}
                  </span>
                </div>

                {/* Macros mini */}
                <div className="flex gap-2 mb-3">
                  {[
                    { v: recipe.avg_calories, u: 'kcal', c: '#10b981' },
                    { v: recipe.avg_protein,  u: 'prot', c: '#6366f1' },
                    { v: recipe.avg_carbs,    u: 'carbs', c: '#f59e0b' },
                    { v: recipe.avg_fat,      u: 'gord', c: '#ef4444' },
                  ].map(({ v, u, c }) => (
                    <div key={u} className="flex-1 flex flex-col items-center py-1.5 rounded-lg border border-zinc-100 dark:border-zinc-700/50 bg-zinc-50 dark:bg-zinc-800/60">
                      <span className="text-[13px] font-bold tabular-nums leading-tight" style={{ color: c }}>{v}</span>
                      <span className="text-[9px] text-zinc-400 dark:text-zinc-500">{u}</span>
                    </div>
                  ))}
                </div>

                {/* Actions */}
                <div className="flex gap-1.5">
                  {/* Favorite toggle */}
                  <button
                    onClick={() => handleToggleFavorite(recipe)}
                    title={recipe.is_favorite ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
                    className={cn(
                      'flex items-center justify-center w-9 h-9 rounded-xl transition-all border',
                      recipe.is_favorite
                        ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800/60 text-amber-400'
                        : 'bg-zinc-50 dark:bg-zinc-800 border-zinc-100 dark:border-zinc-700/50 text-zinc-400 hover:text-amber-400 hover:border-amber-200 dark:hover:border-amber-800/60'
                    )}>
                    <Star size={13} className={recipe.is_favorite ? 'fill-amber-400' : ''} />
                  </button>

                  {/* Ver passo a passo */}
                  <button
                    onClick={() => setActiveRecipe(recipe)}
                    className="flex flex-1 items-center justify-center gap-1.5 py-2 rounded-xl text-[12px] font-semibold transition-all bg-zinc-50 dark:bg-zinc-800 border border-zinc-100 dark:border-zinc-700/50 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700">
                    <BookOpen size={12} />
                    Passo a passo
                  </button>

                  {/* Enviar para lista */}
                  <button
                    onClick={() => handleSend(recipe)}
                    disabled={sendState === 'sending'}
                    className={cn(
                      'flex flex-1 items-center justify-center gap-1.5 py-2 rounded-xl text-[12px] font-semibold transition-all border',
                      sendState === 'success'
                        ? 'bg-emerald-500 border-emerald-500 text-white'
                        : sendState === 'error'
                        ? 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900/40 text-red-500'
                        : 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-100 dark:border-emerald-900/30 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/40',
                      sendState === 'sending' && 'opacity-60 cursor-not-allowed'
                    )}>
                    {sendState === 'sending' && <Loader2 size={12} className="animate-spin" />}
                    {sendState === 'success' && <Check size={12} />}
                    {sendState === 'error'   && <AlertCircle size={12} />}
                    {sendState === 'idle'    && <ShoppingCart size={12} />}
                    {sendState === 'success' ? 'Enviado!' : sendState === 'error' ? 'Erro' : 'Lista'}
                  </button>

                  {/* Delete */}
                  <button
                    onClick={() => handleDelete(recipe.id)}
                    title="Excluir receita"
                    className="flex items-center justify-center w-9 h-9 rounded-xl transition-all border bg-zinc-50 dark:bg-zinc-800 border-zinc-100 dark:border-zinc-700/50 text-zinc-400 hover:bg-red-50 dark:hover:bg-red-950/20 hover:text-red-400 hover:border-red-200 dark:hover:border-red-900/40">
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Recipe modal */}
      {activeRecipe && (
        <RecipeModal
          recipe={toModalData(activeRecipe)}
          onClose={() => setActiveRecipe(null)}
        />
      )}
    </>
  );
}
