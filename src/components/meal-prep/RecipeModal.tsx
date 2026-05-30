'use client';

import { ShoppingBag, ChefHat } from 'lucide-react';
import Modal from '@/components/ui/Modal';

interface RecipeIngredient { name: string; quantity: string }
interface RecipeStep       { title: string; items: string[] }

export interface RecipeModalData {
  title:          string;
  plan_label?:    string;
  goal?:          string;
  budget?:        string;
  meal_count?:    number;
  avg_calories:   number;
  avg_protein:    number;
  avg_carbs:      number;
  avg_fat:        number;
  estimated_cost: number;
  cost_per_meal:  number;
  ingredients:    RecipeIngredient[];
  steps:          RecipeStep[];
  ai_explanation?: string;
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

export default function RecipeModal({ recipe, onClose }: { recipe: RecipeModalData; onClose: () => void }) {
  return (
    <Modal open={true} onClose={onClose} title={`📖 ${recipe.title}`}>
      <div className="space-y-5">

        {/* Tags */}
        <div className="flex flex-wrap gap-1.5">
          {recipe.plan_label && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400">
              Opção {recipe.plan_label}
            </span>
          )}
          {recipe.goal && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
              {GOAL_LABELS[recipe.goal] ?? recipe.goal}
            </span>
          )}
          {recipe.budget && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
              {BUDGET_LABELS[recipe.budget] ?? recipe.budget}
            </span>
          )}
          {recipe.meal_count != null && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
              {recipe.meal_count} marmitas
            </span>
          )}
        </div>

        {/* Macros */}
        <div className="grid grid-cols-4 gap-1.5">
          {([
            { label: 'kcal', value: recipe.avg_calories, color: '#10b981' },
            { label: 'prot', value: recipe.avg_protein,  color: '#6366f1' },
            { label: 'carbs', value: recipe.avg_carbs,   color: '#f59e0b' },
            { label: 'gord', value: recipe.avg_fat,      color: '#ef4444' },
          ] as const).map(({ label, value, color }) => (
            <div key={label} className="flex flex-col items-center px-2 py-2 rounded-xl border border-zinc-100 dark:border-zinc-700/60 bg-zinc-50 dark:bg-zinc-800/60">
              <span className="text-[16px] font-bold tabular-nums leading-tight" style={{ color }}>{value}</span>
              <span className="text-[9px] text-zinc-400 dark:text-zinc-500 font-medium mt-0.5">{label}</span>
            </div>
          ))}
        </div>

        {/* Cost */}
        <div className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900/30">
          <span className="text-[12px] text-emerald-700 dark:text-emerald-400 font-semibold">Custo estimado</span>
          <div>
            <span className="text-[14px] font-bold text-emerald-700 dark:text-emerald-400">R$ {recipe.estimated_cost.toFixed(0)}</span>
            <span className="text-[11px] text-emerald-600 dark:text-emerald-500 ml-2">· R$ {recipe.cost_per_meal.toFixed(2)}/marmita</span>
          </div>
        </div>

        {/* AI explanation */}
        {recipe.ai_explanation && (
          <p className="text-[12px] text-zinc-500 dark:text-zinc-400 italic leading-relaxed px-1">
            {recipe.ai_explanation}
          </p>
        )}

        {/* Ingredients */}
        {recipe.ingredients.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2.5">
              <ShoppingBag size={13} className="text-emerald-500" />
              <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
                Ingredientes
              </p>
            </div>
            <div className="rounded-xl border border-zinc-100 dark:border-zinc-700/50 overflow-hidden">
              {recipe.ingredients.map((ing, i) => (
                <div key={i} className={`flex items-center justify-between px-3 py-2.5 bg-white dark:bg-zinc-900/50${i > 0 ? ' border-t border-zinc-50 dark:border-zinc-800/60' : ''}`}>
                  <span className="text-[13px] text-zinc-700 dark:text-zinc-300 font-medium">{ing.name}</span>
                  <span className="text-[12px] text-zinc-400 dark:text-zinc-500 ml-3 flex-shrink-0">{ing.quantity}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Steps */}
        {recipe.steps.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2.5">
              <ChefHat size={13} className="text-emerald-500" />
              <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
                Modo de Preparo
              </p>
            </div>
            <div className="space-y-3">
              {recipe.steps.map((step, i) => (
                <div key={i} className="rounded-xl border border-zinc-100 dark:border-zinc-700/50 overflow-hidden">
                  <div className="px-3 py-2 bg-zinc-50 dark:bg-zinc-800/60">
                    <p className="text-[11px] font-semibold text-zinc-600 dark:text-zinc-300">{step.title}</p>
                  </div>
                  <div className="px-3 py-2.5 space-y-1.5 bg-white dark:bg-zinc-900/50">
                    {step.items.map((item, j) => (
                      <div key={j} className="flex items-start gap-2">
                        <span className="text-emerald-400 mt-0.5 flex-shrink-0 text-[11px] font-bold">{j + 1}.</span>
                        <p className="text-[12px] text-zinc-600 dark:text-zinc-400 leading-snug">{item}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
