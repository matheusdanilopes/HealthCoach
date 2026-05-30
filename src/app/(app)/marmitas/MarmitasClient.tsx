'use client';

import { useState, useRef } from 'react';
import {
  Sparkles, Loader2, ChevronDown, ChevronUp,
  ThumbsUp, ThumbsDown, ShoppingCart, CheckCircle2, Plus, Trash2,
  Check, Copy, BookOpen, Send, AlertCircle, ArrowLeft,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import RecipeModal, { type RecipeModalData } from '@/components/meal-prep/RecipeModal';
import MealPrepHistory from '@/components/meal-prep/MealPrepHistory';

// ── Types ───────────────────────────────────────────────────────────────────

type GoalType   = 'emagrecimento' | 'manutencao' | 'massa';
type BudgetType = 'economico' | 'moderado' | 'premium';
type PageStep   = 'config' | 'reviewing' | 'shopping';
type ShoppingCat = 'proteinas' | 'carboidratos' | 'hortifruti' | 'temperos' | 'outros';

interface MealPrepConfig { mealCount: number; budget: BudgetType; goal: GoalType }

interface MealItem {
  name: string; protein_source: string; carb_source: string; vegetable: string;
  calories: number; protein_g: number; carbs_g: number; fat_g: number;
}

interface ShoppingItem {
  name: string; amount: string; category: ShoppingCat; total_cost: number;
}

interface MealPlan {
  id: string; label: string; title: string;
  meals: MealItem[];
  avg_calories: number; avg_protein: number; avg_carbs: number; avg_fat: number;
  estimated_cost: number; cost_per_meal: number;
  shopping_list: ShoppingItem[];
  ingredients: { name: string; quantity: string }[];
  steps: { title: string; items: string[]; duration?: string }[];
  ai_explanation?: string;
  tempo_preparo_min?: number;
  tempo_cozimento_min?: number;
  porcoes?: number;
  approved: boolean;
  savedId?: string;
  isLoading?: boolean;
}

interface ConsolidatedItem {
  name: string; amount: string; amountValue: number; unit: string;
  category: ShoppingCat; total_cost: number; checked: boolean; isManual?: boolean;
}

// ── Constants ────────────────────────────────────────────────────────────────

const PLAN_LABELS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

const CAT_LABELS: Record<ShoppingCat, string> = {
  proteinas:    '🥩 Proteínas',
  carboidratos: '🌾 Carboidratos',
  hortifruti:   '🥦 Hortifruti',
  temperos:     '🧄 Temperos',
  outros:       '🛒 Outros',
};
const CAT_ORDER: Record<ShoppingCat, number> = {
  proteinas: 0, carboidratos: 1, hortifruti: 2, temperos: 3, outros: 4,
};

const MEAL_COUNTS = [5, 10, 15, 20] as const;

const GOAL_OPTS: { value: GoalType; label: string; desc: string }[] = [
  { value: 'emagrecimento', label: 'Emagrecer',       desc: 'Déficit calórico e alta proteína' },
  { value: 'manutencao',    label: 'Manutenção',      desc: 'Macros equilibrados' },
  { value: 'massa',         label: 'Ganhar Massa',    desc: 'Superávit calórico e proteína máxima' },
];
const BUDGET_OPTS: { value: BudgetType; label: string; desc: string }[] = [
  { value: 'economico', label: 'Econômico', desc: 'R$ 9–11 por marmita' },
  { value: 'moderado',  label: 'Moderado',  desc: 'R$ 13–16 por marmita' },
  { value: 'premium',   label: 'Premium',   desc: 'R$ 19–23 por marmita' },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseAmount(amount: string): { value: number; unit: string } {
  const m = amount.match(/^([\d,\.]+)\s*(.*)/);
  if (!m) return { value: 1, unit: amount };
  return { value: parseFloat(m[1].replace(',', '.')), unit: m[2].trim() };
}

function formatAmount(value: number, unit: string): string {
  const fixed = value % 1 === 0 ? value.toFixed(0) : value.toFixed(1).replace('.', ',');
  return unit ? `${fixed} ${unit}` : fixed;
}

function consolidate(plans: MealPlan[]): ConsolidatedItem[] {
  const map = new Map<string, ConsolidatedItem>();
  for (const plan of plans) {
    for (const item of plan.shopping_list) {
      const key = `${item.name.toLowerCase().trim()}|${item.category}`;
      const { value, unit } = parseAmount(item.amount);
      const existing = map.get(key);
      if (existing && existing.unit === unit) {
        existing.amountValue += value;
        existing.total_cost  += item.total_cost;
        existing.amount = formatAmount(existing.amountValue, existing.unit);
      } else {
        map.set(existing ? `${key}|${unit}` : key, {
          name: item.name, amount: item.amount, amountValue: value,
          unit, category: item.category, total_cost: item.total_cost,
          checked: false,
        });
      }
    }
  }
  return Array.from(map.values()).sort(
    (a, b) => (CAT_ORDER[a.category] ?? 5) - (CAT_ORDER[b.category] ?? 5)
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

function OptionButton<T extends string>({
  opt, selected, onClick,
}: { opt: { value: T; label: string; desc?: string }; selected: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all border w-full',
        selected
          ? 'bg-emerald-500 text-white border-emerald-500 shadow-sm shadow-emerald-200 dark:shadow-emerald-900/30'
          : 'bg-zinc-50 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700 hover:border-emerald-300 dark:hover:border-emerald-700'
      )}
    >
      <div className="flex-1">
        <p className="text-[13px] font-semibold leading-tight">{opt.label}</p>
        {opt.desc && (
          <p className={cn('text-[11px] mt-0.5', selected ? 'text-emerald-100' : 'text-zinc-400 dark:text-zinc-500')}>
            {opt.desc}
          </p>
        )}
      </div>
      {selected && <Check size={14} className="flex-shrink-0" />}
    </button>
  );
}

function LoadingCard({ label }: { label: string }) {
  return (
    <div className="border border-zinc-100 dark:border-zinc-700/60 rounded-2xl p-4 animate-pulse">
      <div className="flex items-center gap-2 mb-3">
        <div className="h-5 w-14 bg-zinc-100 dark:bg-zinc-800 rounded-full" />
        <div className="h-4 w-32 bg-zinc-100 dark:bg-zinc-800 rounded-lg" />
      </div>
      <div className="space-y-2 mb-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-3 bg-zinc-100 dark:bg-zinc-800 rounded-lg" style={{ width: `${65 + i * 8}%` }} />
        ))}
      </div>
      <div className="flex gap-2 mb-3">
        {[1, 2, 3, 4].map((i) => <div key={i} className="flex-1 h-14 bg-zinc-100 dark:bg-zinc-800 rounded-xl" />)}
      </div>
      <div className="flex items-center justify-center gap-2 text-[12px] text-zinc-400 dark:text-zinc-500 py-2">
        <Loader2 size={14} className="animate-spin text-emerald-500" />
        Gerando Opção {label}…
      </div>
    </div>
  );
}

function PlanCard({
  plan, mealCount, onApprove, onReject, approving, rejecting, onViewSteps,
}: {
  plan: MealPlan; mealCount: number;
  onApprove: () => void; onReject: () => void;
  approving: boolean; rejecting: boolean;
  onViewSteps?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  if (plan.isLoading) return <LoadingCard label={plan.label} />;

  return (
    <div className={cn(
      'border rounded-2xl overflow-hidden transition-all duration-300',
      plan.approved
        ? 'border-emerald-200 dark:border-emerald-800/60 bg-emerald-50/40 dark:bg-emerald-950/10'
        : 'border-zinc-100 dark:border-zinc-700/60 bg-white dark:bg-zinc-900/60'
    )}>
      <div className="p-4">
        {/* Header row */}
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <span className={cn(
              'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide',
              plan.approved
                ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400'
                : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400'
            )}>
              {plan.approved && <CheckCircle2 size={9} />}
              Opção {plan.label}
            </span>
            {plan.approved && (
              <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                Aprovada ✓
              </span>
            )}
          </div>
          <span className="text-[12px] font-semibold text-zinc-500 dark:text-zinc-400 whitespace-nowrap">
            R$ {plan.estimated_cost.toFixed(0)}
          </span>
        </div>

        <p className="text-[15px] font-bold text-zinc-800 dark:text-zinc-200 mb-1">
          🍱 {plan.title}
        </p>

        {/* Meta info */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-3 text-[11px] text-zinc-400 dark:text-zinc-500">
          <span>{mealCount} marmitas</span>
          {plan.tempo_preparo_min && <span>· ⏱ {plan.tempo_preparo_min + (plan.tempo_cozimento_min ?? 0)} min total</span>}
          {plan.porcoes && plan.porcoes !== mealCount && <span>· {plan.porcoes} porções</span>}
          <span>· R$ {plan.cost_per_meal.toFixed(2)}/marmita</span>
        </div>

        {/* Meals list */}
        <div className="space-y-1.5 mb-3">
          {(expanded ? plan.meals : plan.meals.slice(0, 3)).map((meal, i) => (
            <div key={i} className="flex items-start gap-1.5">
              <span className="text-zinc-300 dark:text-zinc-600 mt-0.5 flex-shrink-0">•</span>
              <div className="min-w-0">
                <p className="text-[12px] text-zinc-700 dark:text-zinc-300 font-medium leading-snug">{meal.name}</p>
                <p className="text-[11px] text-zinc-400 dark:text-zinc-500 leading-snug">
                  {meal.protein_source} · {meal.carb_source} · {meal.vegetable}
                </p>
              </div>
            </div>
          ))}
          {plan.meals.length > 3 && (
            <button onClick={() => setExpanded(!expanded)}
              className="flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold mt-1">
              {expanded
                ? <><ChevronUp size={11} />Mostrar menos</>
                : <><ChevronDown size={11} />{plan.meals.length - 3} refeição(ões) a mais</>}
            </button>
          )}
        </div>

        {/* Macros per meal box */}
        <div className="mb-1">
          <p className="text-[9px] text-zinc-400 dark:text-zinc-500 uppercase tracking-wider font-semibold mb-1.5">
            Por marmita
          </p>
          <div className="grid grid-cols-4 gap-1.5">
            {[
              { label: 'kcal', value: plan.avg_calories, color: '#10b981' },
              { label: 'prot', value: `${plan.avg_protein}g`, color: '#6366f1' },
              { label: 'carbs', value: `${plan.avg_carbs}g`, color: '#f59e0b' },
              { label: 'gord', value: `${plan.avg_fat}g`, color: '#ef4444' },
            ].map(({ label, value, color }) => (
              <div key={label} className="flex flex-col items-center px-2 py-2 rounded-xl border border-zinc-100 dark:border-zinc-700/60 bg-zinc-50 dark:bg-zinc-800/60">
                <span className="text-[15px] font-bold tabular-nums leading-tight" style={{ color }}>{value}</span>
                <span className="text-[9px] text-zinc-400 dark:text-zinc-500 mt-0.5">{label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* AI explanation */}
        {plan.ai_explanation && (
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400 italic leading-relaxed mb-3">
            {plan.ai_explanation}
          </p>
        )}

        {/* View step-by-step — always visible when steps exist */}
        {plan.steps?.length > 0 && (
          <button onClick={onViewSteps}
            className={cn(
              'w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-[12px] font-semibold transition-all border',
              plan.approved
                ? 'bg-zinc-50 dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 border-zinc-100 dark:border-zinc-700/50 text-zinc-600 dark:text-zinc-300'
                : 'bg-zinc-50 dark:bg-zinc-800/60 hover:bg-zinc-100 dark:hover:bg-zinc-700 border-zinc-100 dark:border-zinc-700/40 text-zinc-500 dark:text-zinc-400'
            )}>
            <BookOpen size={13} />
            Ver passo a passo completo
          </button>
        )}

        {/* Approve / Reject */}
        {!plan.approved && (
          <div className="flex gap-2 mt-1">
            <button onClick={onApprove} disabled={approving || rejecting}
              className={cn(
                'flex-1 flex items-center justify-center gap-1.5 py-3 rounded-xl text-[13px] font-semibold transition-all',
                'bg-emerald-500 hover:bg-emerald-600 active:scale-[0.97] text-white',
                (approving || rejecting) && 'opacity-60 cursor-not-allowed'
              )}>
              {approving ? <Loader2 size={14} className="animate-spin" /> : <ThumbsUp size={14} />}
              Aprovar
            </button>
            <button onClick={onReject} disabled={approving || rejecting}
              className={cn(
                'flex-1 flex items-center justify-center gap-1.5 py-3 rounded-xl text-[13px] font-semibold transition-all',
                'bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 active:scale-[0.97] text-zinc-700 dark:text-zinc-300',
                (approving || rejecting) && 'opacity-60 cursor-not-allowed'
              )}>
              {rejecting ? <Loader2 size={14} className="animate-spin" /> : <ThumbsDown size={14} />}
              Nova Opção
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

export default function MarmitasClient() {
  const [step,         setStep]         = useState<PageStep>('config');
  const [config,       setConfig]       = useState<MealPrepConfig>({ mealCount: 10, budget: 'economico', goal: 'emagrecimento' });
  const [plans,        setPlans]        = useState<MealPlan[]>([]);
  const [actingId,     setActingId]     = useState<string | null>(null);
  const [actingType,   setActingType]   = useState<'approve' | 'reject' | null>(null);
  const [addingNew,    setAddingNew]    = useState(false);
  const [genError,     setGenError]     = useState<string | null>(null);
  const [customCount,  setCustomCount]  = useState('');
  const [showCustom,   setShowCustom]   = useState(false);
  const [activeRecipe, setActiveRecipe] = useState<RecipeModalData | null>(null);
  const [shoppingItems, setShoppingItems] = useState<ConsolidatedItem[]>([]);
  const [newItemName,  setNewItemName]  = useState('');
  const [newItemQty,   setNewItemQty]   = useState('');
  const [newItemCat,   setNewItemCat]   = useState<ShoppingCat>('outros');
  const [copied,       setCopied]       = useState(false);
  const [sendState,    setSendState]    = useState<'idle' | 'sending' | 'success' | 'error'>('idle');
  const [confirmReset, setConfirmReset] = useState(false);

  const planCounterRef = useRef(0);
  const approvedPlans  = plans.filter((p) => p.approved);
  const canGoShopping  = approvedPlans.length >= 1;

  // ── API ─────────────────────────────────────────────────────────────────────

  async function callAPI(existingMealNames: string[], planIndex: number): Promise<MealPlan> {
    const res = await fetch('/api/meal-prep', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config, existingMealNames, planIndex }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return {
      id:                  crypto.randomUUID(),
      label:               PLAN_LABELS[planIndex % 26],
      title:               data.title            ?? 'Cardápio',
      meals:               data.meals            ?? [],
      avg_calories:        data.avg_calories     ?? 0,
      avg_protein:         data.avg_protein      ?? 0,
      avg_carbs:           data.avg_carbs        ?? 0,
      avg_fat:             data.avg_fat          ?? 0,
      estimated_cost:      data.estimated_cost   ?? 0,
      cost_per_meal:       data.cost_per_meal    ?? 0,
      shopping_list:       data.shopping_list    ?? [],
      ingredients:         data.ingredients      ?? [],
      steps:               data.steps            ?? [],
      ai_explanation:      data.ai_explanation,
      tempo_preparo_min:   data.tempo_preparo_min,
      tempo_cozimento_min: data.tempo_cozimento_min,
      porcoes:             data.porcoes,
      approved:            false,
    };
  }

  function getExistingMeals(currentPlans: MealPlan[]): string[] {
    const proteins = currentPlans.flatMap((p) => p.meals.map((m) => m.protein_source));
    const titles   = currentPlans.filter((p) => p.title).map((p) => p.title);
    return [...new Set([...proteins, ...titles])];
  }

  function planToModal(plan: MealPlan): RecipeModalData {
    return {
      title:               plan.title,
      plan_label:          plan.label,
      goal:                config.goal,
      budget:              config.budget,
      meal_count:          config.mealCount,
      avg_calories:        plan.avg_calories,
      avg_protein:         plan.avg_protein,
      avg_carbs:           plan.avg_carbs,
      avg_fat:             plan.avg_fat,
      estimated_cost:      plan.estimated_cost,
      cost_per_meal:       plan.cost_per_meal,
      ingredients:         plan.ingredients   ?? [],
      steps:               plan.steps         ?? [],
      ai_explanation:      plan.ai_explanation,
      tempo_preparo_min:   plan.tempo_preparo_min,
      tempo_cozimento_min: plan.tempo_cozimento_min,
      porcoes:             plan.porcoes,
    };
  }

  // ── Handlers ────────────────────────────────────────────────────────────────

  async function handleGenerate() {
    setGenError(null);
    planCounterRef.current = 2;
    setStep('reviewing');

    const stub = (label: string, id: string): MealPlan => ({
      id, label, title: '', meals: [], avg_calories: 0, avg_protein: 0,
      avg_carbs: 0, avg_fat: 0, estimated_cost: 0, cost_per_meal: 0,
      shopping_list: [], ingredients: [], steps: [], approved: false, isLoading: true,
    });
    setPlans([stub('A', 'loading-a'), stub('B', 'loading-b')]);

    try {
      const [planA, planB] = await Promise.all([callAPI([], 0), callAPI([], 1)]);
      setPlans([planA, planB]);
    } catch {
      setGenError('Não foi possível gerar os cardápios. Tente novamente.');
      setStep('config');
      setPlans([]);
    }
  }

  async function handleApprove(planId: string) {
    setActingId(planId);
    setActingType('approve');
    const planToSave = plans.find((p) => p.id === planId);
    setPlans((prev) => prev.map((p) => (p.id === planId ? { ...p, approved: true } : p)));

    if (planToSave) {
      fetch('/api/meal-prep/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: planToSave, config, planLabel: planToSave.label }),
      })
        .then((r) => r.json())
        .then((data) => {
          if (data.id) setPlans((prev) => prev.map((p) => (p.id === planId ? { ...p, savedId: data.id } : p)));
        })
        .catch(() => {});
    }

    const idx = planCounterRef.current++;
    setAddingNew(true);
    try {
      const newPlan = await callAPI(getExistingMeals(plans), idx);
      setPlans((prev) => [...prev, newPlan]);
    } catch { /* ignore */ }
    setActingId(null);
    setActingType(null);
    setAddingNew(false);
  }

  async function handleReject(planId: string) {
    setActingId(planId);
    setActingType('reject');
    const remaining = plans.filter((p) => p.id !== planId);
    const idx = planCounterRef.current++;
    const loadingLabel = PLAN_LABELS[idx % 26];
    const loadingId = `loading-${idx}`;

    // Replace rejected plan with a loading card immediately for smooth UX
    setPlans([
      ...remaining,
      {
        id: loadingId, label: loadingLabel, title: '', meals: [], avg_calories: 0,
        avg_protein: 0, avg_carbs: 0, avg_fat: 0, estimated_cost: 0, cost_per_meal: 0,
        shopping_list: [], ingredients: [], steps: [], approved: false, isLoading: true,
      },
    ]);

    setAddingNew(true);
    try {
      const newPlan = await callAPI(getExistingMeals(remaining), idx);
      setPlans((prev) => prev.map((p) => (p.id === loadingId ? newPlan : p)));
    } catch {
      setPlans((prev) => prev.filter((p) => p.id !== loadingId));
    }
    setActingId(null);
    setActingType(null);
    setAddingNew(false);
  }

  function handleGoShopping() {
    setShoppingItems(consolidate(approvedPlans));
    setSendState('idle');
    setStep('shopping');
  }

  function handleReset() {
    setStep('config');
    setPlans([]);
    setGenError(null);
    setSendState('idle');
    setConfirmReset(false);
    planCounterRef.current = 0;
  }

  function handleResetClick() {
    if (approvedPlans.length > 0) {
      setConfirmReset(true);
    } else {
      handleReset();
    }
  }

  function handleToggleCheck(idx: number) {
    setShoppingItems((prev) => prev.map((item, i) => (i === idx ? { ...item, checked: !item.checked } : item)));
  }

  function handleRemoveItem(idx: number) {
    setShoppingItems((prev) => prev.filter((_, i) => i !== idx));
  }

  function handleAddItem() {
    const name = newItemName.trim();
    if (!name) return;
    const qty = newItemQty.trim();
    setShoppingItems((prev) => [
      ...prev,
      { name, amount: qty, amountValue: 0, unit: '', category: newItemCat, total_cost: 0, checked: false, isManual: true },
    ]);
    setNewItemName('');
    setNewItemQty('');
  }

  function handleCopyList() {
    const total     = shoppingItems.reduce((s, i) => s + i.total_cost, 0);
    const totalMeals = approvedPlans.length * config.mealCount;
    const costPer   = totalMeals > 0 ? total / totalMeals : 0;

    let text = `🥗 LISTA DE COMPRAS — MARMITAS\n`;
    text += `${totalMeals} marmitas · R$ ${total.toFixed(0)} total · R$ ${costPer.toFixed(2)}/marmita\n\n`;
    for (const [cat, label] of Object.entries(CAT_LABELS) as [ShoppingCat, string][]) {
      const catItems = shoppingItems.filter((i) => i.category === cat);
      if (!catItems.length) continue;
      text += `${label}\n`;
      for (const item of catItems)
        text += `${item.checked ? '✓' : '•'} ${item.name}${item.amount ? ` → ${item.amount}` : ''}${item.total_cost > 0 ? `  (R$ ${item.total_cost.toFixed(0)})` : ''}\n`;
      text += '\n';
    }
    if (total > 0) text += `TOTAL ESTIMADO: R$ ${total.toFixed(0)}`;
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }).catch(() => {});
  }

  async function handleSendToList() {
    if (!shoppingItems.length) return;
    setSendState('sending');
    try {
      const res  = await fetch('/api/shopping-list/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: shoppingItems }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setSendState(data.failed > 0 ? 'error' : 'success');
    } catch {
      setSendState('error');
    }
  }

  // ── Computed ─────────────────────────────────────────────────────────────────

  const totalCost   = shoppingItems.reduce((s, i) => s + i.total_cost, 0);
  const totalMeals  = approvedPlans.length * config.mealCount;
  const costPerMeal = totalMeals > 0 ? totalCost / totalMeals : 0;
  const checkedCount = shoppingItems.filter((i) => i.checked).length;

  // ── Step indicator ───────────────────────────────────────────────────────────

  const STEPS = [
    { key: 'config',    label: 'Configurar' },
    { key: 'reviewing', label: 'Escolher'   },
    { key: 'shopping',  label: 'Compras'    },
  ] as const;

  const stepIndex = STEPS.findIndex((s) => s.key === step);

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <>
      <div className="flex flex-col gap-5 pt-6 pb-10 animate-fade-in">

        {/* Page header */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-[22px] font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">
              Marmitas Inteligentes
            </h1>
            <p className="text-[13px] text-zinc-400 dark:text-zinc-500 mt-0.5 font-medium">
              Planejamento semanal personalizado com IA
            </p>
          </div>
          {step !== 'config' && !confirmReset && (
            <button onClick={handleResetClick}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12px] font-semibold text-zinc-500 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors flex-shrink-0">
              <ArrowLeft size={13} />
              Recomeçar
            </button>
          )}
          {step !== 'config' && confirmReset && (
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <button onClick={() => setConfirmReset(false)}
                className="px-2.5 py-1.5 rounded-xl text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors">
                Cancelar
              </button>
              <button onClick={handleReset}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[11px] font-semibold text-white bg-red-500 hover:bg-red-600 transition-colors">
                <Trash2 size={11} />
                Perder {approvedPlans.length} aprovada{approvedPlans.length > 1 ? 's' : ''}?
              </button>
            </div>
          )}
        </div>

        {/* Step progress */}
        <div className="flex items-center gap-0">
          {STEPS.map((s, i) => (
            <div key={s.key} className="flex items-center flex-1">
              <div className="flex flex-col items-center flex-1">
                <div className={cn(
                  'h-1.5 w-full rounded-full transition-all duration-300',
                  i < stepIndex  ? 'bg-emerald-400 dark:bg-emerald-600' :
                  i === stepIndex ? 'bg-emerald-500' : 'bg-zinc-200 dark:bg-zinc-700'
                )} />
                <p className={cn(
                  'text-[10px] mt-1.5 font-medium transition-colors',
                  i === stepIndex ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-400 dark:text-zinc-600'
                )}>
                  {s.label}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* ── CONFIG ──────────────────────────────────────────────────────── */}
        {step === 'config' && (
          <div className="flex flex-col gap-4">
            {/* How it works */}
            <div className="bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/30 rounded-2xl p-4">
              <p className="text-[12px] font-semibold text-emerald-700 dark:text-emerald-400 mb-1.5">
                Como funciona
              </p>
              <ol className="space-y-1">
                {[
                  'Configure objetivo, orçamento e quantidade de marmitas.',
                  'A IA gera opções de cardápios variados — aprove ou peça uma nova.',
                  'Com 1 cardápio aprovado, gere a lista de compras consolidada.',
                ].map((text, i) => (
                  <li key={i} className="flex items-start gap-2 text-[12px] text-emerald-700 dark:text-emerald-400">
                    <span className="font-bold flex-shrink-0">{i + 1}.</span>
                    <span>{text}</span>
                  </li>
                ))}
              </ol>
            </div>

            {genError && (
              <div className="px-4 py-3 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-100 dark:border-red-900/40 text-[13px] text-red-600 dark:text-red-400">
                {genError}
              </div>
            )}

            {/* Goal */}
            <div className="bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800/80 rounded-2xl p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-3">
                Meu objetivo
              </p>
              <div className="flex flex-col gap-2">
                {GOAL_OPTS.map((opt) => (
                  <OptionButton
                    key={opt.value}
                    opt={opt}
                    selected={config.goal === opt.value}
                    onClick={() => setConfig((c) => ({ ...c, goal: opt.value }))}
                  />
                ))}
              </div>
            </div>

            {/* Budget */}
            <div className="bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800/80 rounded-2xl p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-3">
                Orçamento
              </p>
              <div className="flex flex-col gap-2">
                {BUDGET_OPTS.map((opt) => (
                  <OptionButton
                    key={opt.value}
                    opt={opt}
                    selected={config.budget === opt.value}
                    onClick={() => setConfig((c) => ({ ...c, budget: opt.value }))}
                  />
                ))}
              </div>
            </div>

            {/* Meal count */}
            <div className="bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800/80 rounded-2xl p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-3">
                Quantidade de marmitas
              </p>
              <div className="flex flex-wrap gap-2 mb-2">
                {MEAL_COUNTS.map((n) => (
                  <button key={n}
                    onClick={() => { setConfig((c) => ({ ...c, mealCount: n })); setShowCustom(false); }}
                    className={cn(
                      'px-4 py-2 rounded-xl text-[13px] font-semibold transition-all border',
                      config.mealCount === n && !showCustom
                        ? 'bg-emerald-500 text-white border-emerald-500'
                        : 'bg-zinc-50 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700 hover:border-emerald-300 dark:hover:border-emerald-700'
                    )}>
                    {n}
                  </button>
                ))}
                <button onClick={() => setShowCustom((v) => !v)}
                  className={cn(
                    'px-4 py-2 rounded-xl text-[13px] font-semibold transition-all border',
                    showCustom
                      ? 'bg-emerald-500 text-white border-emerald-500'
                      : 'bg-zinc-50 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700 hover:border-emerald-300 dark:hover:border-emerald-700'
                  )}>
                  Outro
                </button>
              </div>
              {showCustom && (
                <div className="flex items-center gap-2 mt-1">
                  <input
                    type="number" min={1} max={50}
                    value={customCount}
                    onChange={(e) => {
                      const val = e.target.value;
                      setCustomCount(val);
                      const n = parseInt(val);
                      if (!isNaN(n)) setConfig((c) => ({ ...c, mealCount: Math.min(Math.max(n, 1), 50) }));
                    }}
                    placeholder="1–50"
                    className="w-24 px-3 py-2 rounded-xl text-[13px] border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-emerald-400/40"
                  />
                  <span className="text-[12px] text-zinc-400 dark:text-zinc-500">marmitas</span>
                </div>
              )}
            </div>

            <button onClick={handleGenerate}
              className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl bg-emerald-500 hover:bg-emerald-600 active:scale-[0.98] text-white font-bold text-[15px] transition-all shadow-sm shadow-emerald-200 dark:shadow-none">
              <Sparkles size={17} />
              Gerar Sugestões de Cardápio
            </button>

            {/* Saved recipes history */}
            <div className="mt-1">
              <MealPrepHistory />
            </div>
          </div>
        )}

        {/* ── REVIEWING ───────────────────────────────────────────────────── */}
        {step === 'reviewing' && (
          <div className="flex flex-col gap-3">
            {/* Approved counter + quick action */}
            {approvedPlans.length > 0 && (
              <div className={cn(
                'flex items-center justify-between px-4 py-3 rounded-xl border transition-all',
                'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/60'
              )}>
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={15} className="text-emerald-500" />
                  <span className="text-[13px] font-semibold text-zinc-700 dark:text-zinc-300">
                    {approvedPlans.length} cardápio{approvedPlans.length > 1 ? 's' : ''} aprovado{approvedPlans.length > 1 ? 's' : ''}
                  </span>
                </div>
                <button onClick={handleGoShopping}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-semibold bg-emerald-500 text-white hover:bg-emerald-600 transition-colors">
                  <ShoppingCart size={12} />
                  Lista
                </button>
              </div>
            )}

            {plans.map((plan) => (
              <PlanCard
                key={plan.id}
                plan={plan}
                mealCount={config.mealCount}
                onApprove={() => handleApprove(plan.id)}
                onReject={() => handleReject(plan.id)}
                approving={actingId === plan.id && actingType === 'approve'}
                rejecting={actingId === plan.id && actingType === 'reject'}
                onViewSteps={() => setActiveRecipe(planToModal(plan))}
              />
            ))}

            {/* Empty state — all generations failed */}
            {plans.length === 0 && !addingNew && (
              <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
                <div className="text-3xl">😔</div>
                <div>
                  <p className="text-[14px] font-semibold text-zinc-600 dark:text-zinc-400">
                    Não foi possível gerar opções
                  </p>
                  <p className="text-[12px] text-zinc-400 dark:text-zinc-500 mt-1 max-w-[240px] leading-relaxed">
                    Todas as tentativas falharam. Verifique a conexão e tente recomeçar.
                  </p>
                </div>
                <button onClick={handleReset}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-[13px] font-semibold bg-emerald-500 text-white hover:bg-emerald-600 transition-colors">
                  <ArrowLeft size={13} />
                  Recomeçar
                </button>
              </div>
            )}

            {addingNew && (
              <div className="flex items-center justify-center gap-2 py-3 text-[12px] text-zinc-400 dark:text-zinc-500">
                <Loader2 size={13} className="animate-spin text-emerald-500" />
                Gerando nova opção…
              </div>
            )}

            {canGoShopping && (
              <button onClick={handleGoShopping}
                className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl bg-emerald-500 hover:bg-emerald-600 active:scale-[0.98] text-white font-semibold text-[14px] transition-all mt-1">
                <ShoppingCart size={16} />
                Ver Lista de Compras
              </button>
            )}
          </div>
        )}

        {/* ── SHOPPING ────────────────────────────────────────────────────── */}
        {step === 'shopping' && (
          <div className="flex flex-col gap-4">
            {/* Summary */}
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'Marmitas',        value: totalMeals,              fmt: (v: number) => String(v),              color: '' },
                { label: 'Total estimado',  value: totalCost,               fmt: (v: number) => `R$ ${v.toFixed(0)}`,  color: 'emerald' },
                { label: 'Por marmita',     value: costPerMeal,             fmt: (v: number) => `R$ ${v.toFixed(2)}`,  color: '' },
              ].map(({ label, value, fmt, color }) => (
                <div key={label} className={cn(
                  'text-center p-3 rounded-xl border',
                  color === 'emerald'
                    ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-100 dark:border-emerald-900/30'
                    : 'bg-zinc-50 dark:bg-zinc-800/60 border-zinc-100 dark:border-zinc-700/50'
                )}>
                  <p className={cn('text-[9px] leading-tight', color === 'emerald' ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-400 dark:text-zinc-500')}>{label}</p>
                  <p className={cn('text-[17px] font-bold tabular-nums mt-0.5', color === 'emerald' ? 'text-emerald-700 dark:text-emerald-300' : 'text-zinc-800 dark:text-zinc-200')}>{fmt(value)}</p>
                </div>
              ))}
            </div>

            {/* Progress bar */}
            {shoppingItems.length > 0 && (
              <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-100 dark:border-zinc-700/50">
                <div className="flex-1 h-1.5 bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                    style={{ width: `${shoppingItems.length > 0 ? (checkedCount / shoppingItems.length) * 100 : 0}%` }}
                  />
                </div>
                <span className="text-[12px] font-semibold text-zinc-600 dark:text-zinc-300 whitespace-nowrap">
                  {checkedCount}/{shoppingItems.length} itens
                </span>
              </div>
            )}

            {/* Items by category */}
            {(Object.keys(CAT_LABELS) as ShoppingCat[]).map((cat) => {
              const catItems = shoppingItems.map((item, idx) => ({ ...item, idx })).filter((i) => i.category === cat);
              if (!catItems.length) return null;
              const catTotal = catItems.reduce((s, i) => s + i.total_cost, 0);
              return (
                <div key={cat} className="rounded-xl border border-zinc-100 dark:border-zinc-700/50 overflow-hidden">
                  <div className="flex items-center justify-between px-3 py-2 bg-zinc-50 dark:bg-zinc-800/60">
                    <span className="text-[11px] font-semibold text-zinc-600 dark:text-zinc-300">{CAT_LABELS[cat]}</span>
                    {catTotal > 0 && <span className="text-[10px] text-zinc-400 dark:text-zinc-500">R$ {catTotal.toFixed(0)}</span>}
                  </div>
                  <div className="divide-y divide-zinc-50 dark:divide-zinc-800/60">
                    {catItems.map((item) => (
                      <div key={item.idx} className={cn(
                        'flex items-center gap-3 px-3 py-2.5 bg-white dark:bg-zinc-900/50 transition-opacity',
                        item.checked && 'opacity-50'
                      )}>
                        {/* Checkbox */}
                        <button onClick={() => handleToggleCheck(item.idx)}
                          className={cn(
                            'flex-shrink-0 h-5 w-5 rounded-md border transition-all flex items-center justify-center',
                            item.checked
                              ? 'bg-emerald-500 border-emerald-500'
                              : 'border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800'
                          )}>
                          {item.checked && <Check size={10} className="text-white" />}
                        </button>

                        <div className="flex-1 min-w-0">
                          <p className={cn(
                            'text-[13px] font-medium text-zinc-700 dark:text-zinc-300',
                            item.checked && 'line-through text-zinc-400 dark:text-zinc-600'
                          )}>
                            {item.name}
                          </p>
                          {item.amount && (
                            <p className="text-[11px] text-zinc-400 dark:text-zinc-500">{item.amount}</p>
                          )}
                        </div>

                        {item.total_cost > 0 && (
                          <span className="text-[12px] font-semibold tabular-nums text-zinc-500 dark:text-zinc-400 flex-shrink-0">
                            R$ {item.total_cost.toFixed(0)}
                          </span>
                        )}

                        <button onClick={() => handleRemoveItem(item.idx)}
                          className="flex-shrink-0 text-zinc-300 dark:text-zinc-600 hover:text-red-400 transition-colors">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}

            {/* Add item manually */}
            <div className="bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800/80 rounded-2xl p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-3">
                Adicionar item
              </p>
              <div className="flex flex-col gap-2">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newItemName}
                    onChange={(e) => setNewItemName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddItem()}
                    placeholder="Nome do item..."
                    className="flex-1 px-3 py-2 rounded-xl text-[13px] border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 placeholder-zinc-400 dark:placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-emerald-400/40"
                  />
                  <input
                    type="text"
                    value={newItemQty}
                    onChange={(e) => setNewItemQty(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddItem()}
                    placeholder="Qtd."
                    className="w-20 px-3 py-2 rounded-xl text-[13px] border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 placeholder-zinc-400 dark:placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-emerald-400/40"
                  />
                </div>
                <div className="flex gap-2">
                  <select
                    value={newItemCat}
                    onChange={(e) => setNewItemCat(e.target.value as ShoppingCat)}
                    className="flex-1 px-2 py-2 rounded-xl text-[12px] border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 focus:outline-none"
                  >
                    <option value="proteinas">Proteínas</option>
                    <option value="carboidratos">Carboidratos</option>
                    <option value="hortifruti">Hortifruti</option>
                    <option value="temperos">Temperos</option>
                    <option value="outros">Outros</option>
                  </select>
                  <button onClick={handleAddItem} disabled={!newItemName.trim()}
                    className="flex items-center justify-center h-[42px] w-[42px] rounded-xl bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex-shrink-0">
                    <Plus size={16} />
                  </button>
                </div>
              </div>
            </div>

            {/* Send to list */}
            <button onClick={handleSendToList} disabled={sendState === 'sending'}
              className={cn(
                'w-full flex items-center justify-center gap-2 py-4 rounded-2xl font-semibold text-[14px] transition-all active:scale-[0.98]',
                sendState === 'success' ? 'bg-emerald-500 text-white' :
                sendState === 'error'   ? 'bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/40 text-red-600 dark:text-red-400' :
                'bg-emerald-500 hover:bg-emerald-600 text-white shadow-sm shadow-emerald-200 dark:shadow-none',
                sendState === 'sending' && 'opacity-70 cursor-not-allowed'
              )}>
              {sendState === 'sending' && <><Loader2 size={15} className="animate-spin" />Enviando…</>}
              {sendState === 'success' && <><Check size={15} />Itens enviados para a Lista!</>}
              {sendState === 'error'   && <><AlertCircle size={15} />Erro — Tentar novamente</>}
              {sendState === 'idle'    && <><Send size={15} />Enviar para Lista de Compras</>}
            </button>

            {/* Copy */}
            <button onClick={handleCopyList}
              className={cn(
                'w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-[13px] transition-all',
                copied
                  ? 'bg-emerald-500 text-white'
                  : 'bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-300'
              )}>
              {copied ? <><Check size={14} />Lista copiada!</> : <><Copy size={14} />Copiar lista de compras</>}
            </button>

            {/* Back to recipes */}
            <button onClick={() => setStep('reviewing')}
              className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-[12px] font-medium text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors">
              <ArrowLeft size={12} />
              Voltar para os cardápios
            </button>
          </div>
        )}
      </div>

      {activeRecipe && (
        <RecipeModal recipe={activeRecipe} onClose={() => setActiveRecipe(null)} />
      )}
    </>
  );
}
