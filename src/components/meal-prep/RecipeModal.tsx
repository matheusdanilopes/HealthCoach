'use client';

import { ShoppingBag, ChefHat, Clock, Users, Snowflake, Refrigerator } from 'lucide-react';
import Modal from '@/components/ui/Modal';

interface RecipeIngredient { name: string; quantity: string }
interface RecipeStep       { title: string; items: string[]; duration?: string }

export interface RecipeMealPortion {
  name:                string;
  protein_source:      string;
  protein_portion_g?:  number;
  carb_source:         string;
  carb_portion_g?:     number;
  vegetable:           string;
  vegetable_portion_g?: number;
  total_weight_g?:     number;
}

export interface RecipeModalData {
  title:               string;
  plan_label?:         string;
  goal?:               string;
  budget?:             string;
  meal_count?:         number;
  avg_calories:        number;
  avg_protein:         number;
  avg_carbs:           number;
  avg_fat:             number;
  estimated_cost:      number;
  cost_per_meal:       number;
  ingredients:         RecipeIngredient[];
  steps:               RecipeStep[];
  ai_explanation?:     string;
  porcoes?:            number;
  tempo_preparo_min?:  number;
  tempo_cozimento_min?: number;
  meals?:              RecipeMealPortion[];
  marmita_weight_g?:   number;
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

function isStorageStep(step: RecipeStep): boolean {
  const t = step.title.toLowerCase();
  return t.includes('armazenam') || t.includes('congelam') || t.includes('conserv') || t.includes('etapa 4');
}

export default function RecipeModal({ recipe, onClose }: { recipe: RecipeModalData; onClose: () => void }) {
  const prepSteps    = recipe.steps.filter((s) => !isStorageStep(s));
  const storageSteps = recipe.steps.filter((s) => isStorageStep(s));
  const totalTime    = (recipe.tempo_preparo_min ?? 0) + (recipe.tempo_cozimento_min ?? 0);

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
          {(recipe.porcoes ?? recipe.meal_count) != null && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
              {recipe.porcoes ?? recipe.meal_count} marmitas
            </span>
          )}
        </div>

        {/* Time & servings info */}
        {(totalTime > 0 || recipe.tempo_preparo_min || recipe.tempo_cozimento_min) && (
          <div className="flex flex-wrap gap-2">
            {recipe.tempo_preparo_min && (
              <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/30">
                <Clock size={12} className="text-blue-500" />
                <div>
                  <p className="text-[9px] text-blue-500 dark:text-blue-400 leading-none">Preparo</p>
                  <p className="text-[13px] font-bold text-blue-700 dark:text-blue-300">{recipe.tempo_preparo_min} min</p>
                </div>
              </div>
            )}
            {recipe.tempo_cozimento_min && (
              <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-orange-50 dark:bg-orange-950/30 border border-orange-100 dark:border-orange-900/30">
                <ChefHat size={12} className="text-orange-500" />
                <div>
                  <p className="text-[9px] text-orange-500 dark:text-orange-400 leading-none">Cozimento</p>
                  <p className="text-[13px] font-bold text-orange-700 dark:text-orange-300">{recipe.tempo_cozimento_min} min</p>
                </div>
              </div>
            )}
            {totalTime > 0 && (
              <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-100 dark:border-zinc-700/50">
                <Clock size={12} className="text-zinc-400" />
                <div>
                  <p className="text-[9px] text-zinc-400 leading-none">Total</p>
                  <p className="text-[13px] font-bold text-zinc-700 dark:text-zinc-300">{totalTime} min</p>
                </div>
              </div>
            )}
            {(recipe.porcoes ?? recipe.meal_count) != null && (
              <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-100 dark:border-zinc-700/50">
                <Users size={12} className="text-zinc-400" />
                <div>
                  <p className="text-[9px] text-zinc-400 leading-none">Porções</p>
                  <p className="text-[13px] font-bold text-zinc-700 dark:text-zinc-300">{recipe.porcoes ?? recipe.meal_count}</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Macros per meal */}
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500 mb-2">
            Valores por marmita
          </p>
          <div className="grid grid-cols-4 gap-1.5">
            {([
              { label: 'kcal',  value: recipe.avg_calories, color: '#10b981' },
              { label: 'prot',  value: recipe.avg_protein,  color: '#6366f1' },
              { label: 'carbs', value: recipe.avg_carbs,    color: '#f59e0b' },
              { label: 'gord',  value: recipe.avg_fat,      color: '#ef4444' },
            ] as const).map(({ label, value, color }) => (
              <div key={label} className="flex flex-col items-center px-2 py-2.5 rounded-xl border border-zinc-100 dark:border-zinc-700/60 bg-zinc-50 dark:bg-zinc-800/60">
                <span className="text-[17px] font-bold tabular-nums leading-tight" style={{ color }}>{value}</span>
                <span className="text-[9px] text-zinc-400 dark:text-zinc-500 font-medium mt-0.5">{label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Cost */}
        <div className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900/30">
          <span className="text-[12px] text-emerald-700 dark:text-emerald-400 font-semibold">Custo estimado</span>
          <div>
            <span className="text-[14px] font-bold text-emerald-700 dark:text-emerald-400">
              R$ {recipe.estimated_cost.toFixed(0)}
            </span>
            <span className="text-[11px] text-emerald-600 dark:text-emerald-500 ml-2">
              · R$ {recipe.cost_per_meal.toFixed(2)}/marmita
            </span>
          </div>
        </div>

        {/* AI explanation */}
        {recipe.ai_explanation && (
          <p className="text-[12px] text-zinc-500 dark:text-zinc-400 italic leading-relaxed px-1">
            {recipe.ai_explanation}
          </p>
        )}

        {/* Per-meal composition */}
        {recipe.meals && recipe.meals.some((m) => m.protein_portion_g) && (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500 mb-2.5">
              Composição por marmita{recipe.marmita_weight_g ? ` (~${recipe.marmita_weight_g}g)` : ''}
            </p>
            <div className="space-y-2">
              {recipe.meals.filter((m) => m.protein_portion_g).map((meal, i) => (
                <div key={i} className="rounded-xl border border-zinc-100 dark:border-zinc-700/50 overflow-hidden">
                  <div className="px-3 py-2 bg-zinc-50 dark:bg-zinc-800/60">
                    <p className="text-[11px] font-semibold text-zinc-600 dark:text-zinc-300 leading-snug">{meal.name}</p>
                  </div>
                  <div className="px-3 py-2.5 space-y-1.5 bg-white dark:bg-zinc-900/50">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[12px] text-zinc-500 dark:text-zinc-400">🥩 {meal.protein_source}</span>
                      <span className="text-[12px] font-semibold tabular-nums text-zinc-700 dark:text-zinc-300">{meal.protein_portion_g}g</span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[12px] text-zinc-500 dark:text-zinc-400">🌾 {meal.carb_source}</span>
                      <span className="text-[12px] font-semibold tabular-nums text-zinc-700 dark:text-zinc-300">{meal.carb_portion_g}g</span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[12px] text-zinc-500 dark:text-zinc-400">🥦 {meal.vegetable}</span>
                      <span className="text-[12px] font-semibold tabular-nums text-zinc-700 dark:text-zinc-300">{meal.vegetable_portion_g}g</span>
                    </div>
                    {meal.total_weight_g && (
                      <div className="flex items-center justify-between gap-2 pt-1 border-t border-zinc-100 dark:border-zinc-800">
                        <span className="text-[11px] text-zinc-400 dark:text-zinc-500">Total</span>
                        <span className="text-[12px] font-bold tabular-nums text-zinc-600 dark:text-zinc-300">~{meal.total_weight_g}g</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
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
                <div
                  key={i}
                  className={`flex items-center justify-between px-3 py-2.5 bg-white dark:bg-zinc-900/50${i > 0 ? ' border-t border-zinc-50 dark:border-zinc-800/60' : ''}`}
                >
                  <span className="text-[13px] text-zinc-700 dark:text-zinc-300 font-medium">{ing.name}</span>
                  <span className="text-[12px] text-zinc-400 dark:text-zinc-500 ml-3 flex-shrink-0 font-semibold">{ing.quantity}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Preparation steps */}
        {prepSteps.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2.5">
              <ChefHat size={13} className="text-emerald-500" />
              <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
                Modo de Preparo
              </p>
            </div>
            <div className="space-y-2.5">
              {prepSteps.map((step, i) => (
                <div key={i} className="rounded-xl border border-zinc-100 dark:border-zinc-700/50 overflow-hidden">
                  <div className="flex items-center justify-between px-3 py-2 bg-zinc-50 dark:bg-zinc-800/60">
                    <p className="text-[11px] font-semibold text-zinc-600 dark:text-zinc-300">{step.title}</p>
                    {step.duration && (
                      <span className="flex items-center gap-1 text-[10px] text-zinc-400 dark:text-zinc-500">
                        <Clock size={10} />
                        {step.duration}
                      </span>
                    )}
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

        {/* Storage & freezing */}
        {storageSteps.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2.5">
              <Snowflake size={13} className="text-blue-400" />
              <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
                Armazenamento e Congelamento
              </p>
            </div>
            <div className="space-y-2.5">
              {storageSteps.map((step, i) => (
                <div key={i} className="rounded-xl border border-blue-100 dark:border-blue-900/30 overflow-hidden bg-blue-50/40 dark:bg-blue-950/10">
                  <div className="px-3 py-2.5 space-y-1.5">
                    {step.items.map((item, j) => (
                      <div key={j} className="flex items-start gap-2">
                        <Refrigerator size={11} className="text-blue-400 mt-0.5 flex-shrink-0" />
                        <p className="text-[12px] text-zinc-600 dark:text-zinc-400 leading-snug">{item}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Fallback: all steps if none were separated */}
        {prepSteps.length === 0 && storageSteps.length === 0 && recipe.steps.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2.5">
              <ChefHat size={13} className="text-emerald-500" />
              <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
                Modo de Preparo
              </p>
            </div>
            <div className="space-y-2.5">
              {recipe.steps.map((step, i) => (
                <div key={i} className="rounded-xl border border-zinc-100 dark:border-zinc-700/50 overflow-hidden">
                  <div className="flex items-center justify-between px-3 py-2 bg-zinc-50 dark:bg-zinc-800/60">
                    <p className="text-[11px] font-semibold text-zinc-600 dark:text-zinc-300">{step.title}</p>
                    {step.duration && (
                      <span className="flex items-center gap-1 text-[10px] text-zinc-400 dark:text-zinc-500">
                        <Clock size={10} />
                        {step.duration}
                      </span>
                    )}
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
