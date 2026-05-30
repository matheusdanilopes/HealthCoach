'use client';

import { useState, useRef } from 'react';
import {
  UtensilsCrossed, ShoppingCart, CheckCircle2, RefreshCw,
  Copy, Check, Loader2, ChevronDown, ChevronUp, Sparkles,
  ThumbsUp, ThumbsDown, Package, Send, AlertCircle, BookOpen,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import RecipeModal, { type RecipeModalData } from './RecipeModal';

// ── Types ──────────────────────────────────────────────────────────────────

type GoalType    = 'emagrecimento' | 'manutencao' | 'massa';
type BudgetType  = 'economico' | 'moderado' | 'premium';
type WidgetStep  = 'config' | 'reviewing' | 'shopping';
type ShoppingCat = 'proteinas' | 'carboidratos' | 'hortifruti' | 'temperos' | 'outros';

interface MealPrepConfig {
  mealCount: number;
  budget:    BudgetType;
  goal:      GoalType;
}

interface MealItem {
  name:           string;
  protein_source: string;
  carb_source:    string;
  vegetable:      string;
  calories:       number;
  protein_g:      number;
  carbs_g:        number;
  fat_g:          number;
}

interface ShoppingItem {
  name:       string;
  amount:     string;
  category:   ShoppingCat;
  total_cost: number;
}

interface MealPlan {
  id:             string;
  label:          string;
  title:          string;
  meals:          MealItem[];
  avg_calories:   number;
  avg_protein:    number;
  avg_carbs:      number;
  avg_fat:        number;
  estimated_cost: number;
  cost_per_meal:  number;
  shopping_list:  ShoppingItem[];
  ingredients:    { name: string; quantity: string }[];
  steps:          { title: string; items: string[] }[];
  ai_explanation?: string;
  approved:       boolean;
  savedId?:       string;
  isLoading?:     boolean;
}

interface ConsolidatedItem {
  name:        string;
  amount:      string;
  amountValue: number;
  unit:        string;
  category:    ShoppingCat;
  total_cost:  number;
}

// ── Constants ──────────────────────────────────────────────────────────────

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

const MEAL_COUNTS   = [5, 10, 15, 20] as const;
const GOAL_OPTS: { value: GoalType; label: string }[] = [
  { value: 'emagrecimento', label: 'Emagrecer' },
  { value: 'manutencao',    label: 'Manutenção' },
  { value: 'massa',         label: 'Ganho de Massa' },
];
const BUDGET_OPTS: { value: BudgetType; label: string }[] = [
  { value: 'economico', label: 'Econômico' },
  { value: 'moderado',  label: 'Moderado' },
  { value: 'premium',   label: 'Premium' },
];

// ── Helpers ────────────────────────────────────────────────────────────────

function parseAmount(amount: string): { value: number; unit: string } {
  const m = amount.match(/^([\d,\.]+)\s*(.*)/);
  if (!m) return { value: 1, unit: amount };
  return { value: parseFloat(m[1].replace(',', '.')), unit: m[2].trim() };
}

function formatAmount(value: number, unit: string): string {
  const fixed = value % 1 === 0 ? value.toFixed(0) : value.toFixed(1).replace('.', ',');
  return unit ? `${fixed} ${unit}` : fixed;
}

function consolidate(approvedPlans: MealPlan[]): ConsolidatedItem[] {
  const map = new Map<string, ConsolidatedItem>();
  for (const plan of approvedPlans) {
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
        });
      }
    }
  }
  return Array.from(map.values()).sort(
    (a, b) => (CAT_ORDER[a.category] ?? 5) - (CAT_ORDER[b.category] ?? 5)
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────

function PillSelector<T extends string>({
  options, value, onChange,
}: {
  options: { value: T; label: string }[];
  value:   T;
  onChange:(v: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => (
        <button key={opt.value} onClick={() => onChange(opt.value)}
          className={cn(
            'px-3 py-1.5 rounded-xl text-[12px] font-semibold transition-all duration-150 border',
            value === opt.value
              ? 'bg-emerald-500 text-white border-emerald-500'
              : 'bg-zinc-50 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700 hover:border-emerald-300 dark:hover:border-emerald-700'
          )}>
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function MacroPill({ label, value, unit, color }: { label: string; value: number; unit: string; color: string }) {
  return (
    <div className="flex flex-col items-center px-2.5 py-2 rounded-xl border border-zinc-100 dark:border-zinc-700/60 bg-zinc-50 dark:bg-zinc-800/60 min-w-0">
      <span className="text-[18px] font-bold tabular-nums leading-tight" style={{ color }}>{value}</span>
      <span className="text-[9px] text-zinc-400 dark:text-zinc-500 font-medium mt-0.5">{unit}</span>
      <span className="text-[9px] text-zinc-400 dark:text-zinc-500">{label}</span>
    </div>
  );
}

function LoadingCard({ label }: { label: string }) {
  return (
    <div className="border border-zinc-100 dark:border-zinc-700/60 rounded-2xl p-4 animate-pulse">
      <div className="flex items-center gap-2 mb-3">
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-zinc-200 dark:bg-zinc-700 text-zinc-400 dark:text-zinc-500 w-14 h-5" />
        <div className="h-4 w-28 bg-zinc-100 dark:bg-zinc-800 rounded-lg" />
      </div>
      <div className="space-y-2 mb-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-3 bg-zinc-100 dark:bg-zinc-800 rounded-lg" style={{ width: `${70 + i * 8}%` }} />
        ))}
      </div>
      <div className="flex gap-2 mb-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="flex-1 h-12 bg-zinc-100 dark:bg-zinc-800 rounded-xl" />
        ))}
      </div>
      <div className="flex items-center justify-center gap-1 text-[12px] text-zinc-400 dark:text-zinc-500 py-1">
        <Loader2 size={14} className="animate-spin" />
        <span>Gerando Opção {label}…</span>
      </div>
    </div>
  );
}

function PlanCard({
  plan, mealCount, onApprove, onReject, approving, rejecting, onViewSteps,
}: {
  plan:         MealPlan;
  mealCount:    number;
  onApprove:    () => void;
  onReject:     () => void;
  approving:    boolean;
  rejecting:    boolean;
  onViewSteps?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  if (plan.isLoading) return <LoadingCard label={plan.label} />;

  return (
    <div className={cn(
      'border rounded-2xl p-4 transition-all duration-300',
      plan.approved
        ? 'border-emerald-200 dark:border-emerald-800/60 bg-emerald-50/50 dark:bg-emerald-950/20'
        : 'border-zinc-100 dark:border-zinc-700/60 bg-white dark:bg-zinc-900/50'
    )}>
      {/* Header */}
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
            <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">✓ Aprovado</span>
          )}
        </div>
        <span className="text-[12px] font-semibold text-zinc-500 dark:text-zinc-400 whitespace-nowrap">
          R$ {plan.estimated_cost.toFixed(0)}
        </span>
      </div>

      <p className="text-[14px] font-bold text-zinc-800 dark:text-zinc-200 mb-3">
        🍱 {plan.title}
      </p>

      {/* Meals list */}
      <div className="space-y-1.5 mb-3">
        {(expanded ? plan.meals : plan.meals.slice(0, 3)).map((meal, i) => (
          <div key={i} className="flex items-start gap-1.5">
            <span className="text-zinc-300 dark:text-zinc-600 mt-[3px] flex-shrink-0">•</span>
            <div className="min-w-0">
              <p className="text-[12px] text-zinc-700 dark:text-zinc-300 font-medium leading-snug">{meal.name}</p>
              <p className="text-[11px] text-zinc-400 dark:text-zinc-500 leading-snug">{meal.protein_source} · {meal.carb_source} · {meal.vegetable}</p>
            </div>
          </div>
        ))}
        {plan.meals.length > 3 && (
          <button onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold mt-1">
            {expanded ? <><ChevronUp size={11} />Mostrar menos</> : <><ChevronDown size={11} />{plan.meals.length - 3} refeição(ões) a mais</>}
          </button>
        )}
      </div>

      {/* Macros */}
      <div className="grid grid-cols-4 gap-1.5 mb-3">
        <MacroPill label="kcal/dia" value={plan.avg_calories} unit="kcal"    color="#10b981" />
        <MacroPill label="proteína" value={plan.avg_protein}  unit="g"       color="#6366f1" />
        <MacroPill label="carbs"    value={plan.avg_carbs}    unit="g"       color="#f59e0b" />
        <MacroPill label="gordura"  value={plan.avg_fat}      unit="g"       color="#ef4444" />
      </div>

      {/* Footer info */}
      <div className="flex items-center justify-between text-[11px] text-zinc-400 dark:text-zinc-500 mb-3 pb-3 border-b border-zinc-100 dark:border-zinc-800/60">
        <span>{mealCount} marmitas</span>
        <span>R$ {plan.cost_per_meal.toFixed(2)}/marmita</span>
      </div>

      {/* AI explanation */}
      {plan.ai_explanation && (
        <p className="text-[11px] text-zinc-500 dark:text-zinc-400 italic leading-relaxed mb-3">
          {plan.ai_explanation}
        </p>
      )}

      {/* Approved actions */}
      {plan.approved && plan.steps?.length > 0 && (
        <button
          onClick={onViewSteps}
          className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-[12px] font-semibold transition-all bg-zinc-50 dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 border border-zinc-100 dark:border-zinc-700/50 text-zinc-600 dark:text-zinc-300">
          <BookOpen size={13} />
          Ver passo a passo
        </button>
      )}

      {/* Approve / reject buttons */}
      {!plan.approved && (
        <div className="flex gap-2">
          <button onClick={onApprove} disabled={approving || rejecting}
            className={cn(
              'flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-[13px] font-semibold transition-all',
              'bg-emerald-500 hover:bg-emerald-600 active:scale-[0.97] text-white',
              (approving || rejecting) && 'opacity-60 cursor-not-allowed'
            )}>
            {approving ? <Loader2 size={13} className="animate-spin" /> : <ThumbsUp size={13} />}
            Aprovar
          </button>
          <button onClick={onReject} disabled={approving || rejecting}
            className={cn(
              'flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-[13px] font-semibold transition-all',
              'bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 active:scale-[0.97] text-zinc-700 dark:text-zinc-300',
              (approving || rejecting) && 'opacity-60 cursor-not-allowed'
            )}>
            {rejecting ? <Loader2 size={13} className="animate-spin" /> : <ThumbsDown size={13} />}
            Nova Opção
          </button>
        </div>
      )}
    </div>
  );
}

// ── Main Widget ────────────────────────────────────────────────────────────

export default function SmartMealPrepWidget() {
  const [step,        setStep]        = useState<WidgetStep>('config');
  const [config,      setConfig]      = useState<MealPrepConfig>({ mealCount: 10, budget: 'economico', goal: 'emagrecimento' });
  const [plans,       setPlans]       = useState<MealPlan[]>([]);
  const [actingId,    setActingId]    = useState<string | null>(null);
  const [actingType,  setActingType]  = useState<'approve' | 'reject' | null>(null);
  const [addingNew,   setAddingNew]   = useState(false);
  const [copied,      setCopied]      = useState(false);
  const [genError,    setGenError]    = useState<string | null>(null);
  const [customCount, setCustomCount] = useState('');
  const [showCustom,  setShowCustom]  = useState(false);
  const [sendState,   setSendState]   = useState<'idle' | 'sending' | 'success' | 'error'>('idle');
  const [sendResult,  setSendResult]  = useState<{ sent: number; failed: number } | null>(null);
  const [activeRecipe,setActiveRecipe]= useState<RecipeModalData | null>(null);

  const planCounterRef = useRef(0);

  const approvedPlans  = plans.filter((p) => p.approved);
  const canConsolidate = approvedPlans.length >= 2;

  // ── API calls ──────────────────────────────────────────────────────────

  async function callAPI(existingMealNames: string[], planIndex: number): Promise<MealPlan> {
    const res = await fetch('/api/meal-prep', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ config, existingMealNames, planIndex }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return {
      id:             crypto.randomUUID(),
      label:          PLAN_LABELS[planIndex % 26],
      title:          data.title         ?? 'Cardápio',
      meals:          data.meals         ?? [],
      avg_calories:   data.avg_calories  ?? 0,
      avg_protein:    data.avg_protein   ?? 0,
      avg_carbs:      data.avg_carbs     ?? 0,
      avg_fat:        data.avg_fat       ?? 0,
      estimated_cost: data.estimated_cost ?? 0,
      cost_per_meal:  data.cost_per_meal  ?? 0,
      shopping_list:  data.shopping_list  ?? [],
      ingredients:    data.ingredients   ?? [],
      steps:          data.steps         ?? [],
      ai_explanation: data.ai_explanation,
      approved:       false,
    };
  }

  function getExistingMeals(currentPlans: MealPlan[]): string[] {
    return currentPlans.flatMap((p) => p.meals.map((m) => m.protein_source));
  }

  function planToModalData(plan: MealPlan): RecipeModalData {
    return {
      title:          plan.title,
      plan_label:     plan.label,
      goal:           config.goal,
      budget:         config.budget,
      meal_count:     config.mealCount,
      avg_calories:   plan.avg_calories,
      avg_protein:    plan.avg_protein,
      avg_carbs:      plan.avg_carbs,
      avg_fat:        plan.avg_fat,
      estimated_cost: plan.estimated_cost,
      cost_per_meal:  plan.cost_per_meal,
      ingredients:    plan.ingredients ?? [],
      steps:          plan.steps ?? [],
      ai_explanation: plan.ai_explanation,
    };
  }

  // ── Handlers ───────────────────────────────────────────────────────────

  async function handleGenerate() {
    setGenError(null);
    planCounterRef.current = 2;
    setStep('reviewing');

    const loadingA: MealPlan = {
      id: 'loading-a', label: 'A', title: '', meals: [], avg_calories: 0, avg_protein: 0,
      avg_carbs: 0, avg_fat: 0, estimated_cost: 0, cost_per_meal: 0, shopping_list: [],
      ingredients: [], steps: [], approved: false, isLoading: true,
    };
    const loadingB: MealPlan = {
      id: 'loading-b', label: 'B', title: '', meals: [], avg_calories: 0, avg_protein: 0,
      avg_carbs: 0, avg_fat: 0, estimated_cost: 0, cost_per_meal: 0, shopping_list: [],
      ingredients: [], steps: [], approved: false, isLoading: true,
    };
    setPlans([loadingA, loadingB]);

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

    // Fire-and-forget persistence
    if (planToSave) {
      fetch('/api/meal-prep/save', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ plan: planToSave, config, planLabel: planToSave.label }),
      }).then((r) => r.json()).then((data) => {
        if (data.id) {
          setPlans((prev) => prev.map((p) => p.id === planId ? { ...p, savedId: data.id } : p));
        }
      }).catch(() => {});
    }

    const idx = planCounterRef.current++;
    setAddingNew(true);
    try {
      const existing = getExistingMeals(plans);
      const newPlan  = await callAPI(existing, idx);
      setPlans((prev) => [...prev, newPlan]);
    } catch { /* silently ignore */ }

    setActingId(null);
    setActingType(null);
    setAddingNew(false);
  }

  async function handleReject(planId: string) {
    setActingId(planId);
    setActingType('reject');

    const remaining = plans.filter((p) => p.id !== planId);
    setPlans(remaining);

    const idx = planCounterRef.current++;
    setAddingNew(true);
    try {
      const existing = getExistingMeals(remaining);
      const newPlan  = await callAPI(existing, idx);
      setPlans((prev) => [...prev.filter((p) => p.id !== planId), newPlan]);
    } catch { /* silently ignore */ }

    setActingId(null);
    setActingType(null);
    setAddingNew(false);
  }

  function handleCopyList() {
    const items     = consolidate(approvedPlans);
    const total     = items.reduce((s, i) => s + i.total_cost, 0);
    const totalMeals = approvedPlans.length * config.mealCount;
    const costPer   = total / totalMeals;

    let text = `🥗 LISTA DE COMPRAS — MARMITAS\n`;
    text    += `${totalMeals} marmitas · R$ ${total.toFixed(0)} total · R$ ${costPer.toFixed(2)}/marmita\n\n`;

    for (const [cat, label] of Object.entries(CAT_LABELS) as [ShoppingCat, string][]) {
      const catItems = items.filter((i) => i.category === cat);
      if (!catItems.length) continue;
      text += `${label}\n`;
      for (const item of catItems)
        text += `• ${item.name} → ${item.amount}  (R$ ${item.total_cost.toFixed(0)})\n`;
      text += '\n';
    }

    text += `TOTAL ESTIMADO: R$ ${total.toFixed(0)}`;

    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }).catch(() => {});
  }

  async function handleSendToShoppingList() {
    const items = consolidate(approvedPlans);
    if (!items.length) return;

    setSendState('sending');
    setSendResult(null);
    try {
      const res = await fetch('/api/shopping-list/send', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ items }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setSendResult({ sent: data.sent ?? 0, failed: data.failed ?? 0 });
      setSendState(data.failed > 0 ? 'error' : 'success');
    } catch {
      setSendState('error');
      setSendResult(null);
    }
  }

  function handleReset() {
    setStep('config');
    setPlans([]);
    setGenError(null);
    setSendState('idle');
    setSendResult(null);
    planCounterRef.current = 0;
  }

  // ── Shopping list view ─────────────────────────────────────────────────

  const shoppingItems = step === 'shopping' ? consolidate(approvedPlans) : [];
  const totalCost     = shoppingItems.reduce((s, i) => s + i.total_cost, 0);
  const totalMeals    = approvedPlans.length * config.mealCount;
  const costPerMeal   = totalMeals > 0 ? totalCost / totalMeals : 0;

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <>
      <div className="bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800/80 rounded-2xl p-5 shadow-[0_1px_3px_0_rgb(0,0,0,0.04)] dark:shadow-none">

        {/* Widget header */}
        <div className="flex items-center gap-2 mb-1">
          <span className="text-emerald-500"><UtensilsCrossed size={13} /></span>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
            Ideias de Marmitas Inteligentes
          </p>
        </div>
        <p className="text-[12px] text-zinc-500 dark:text-zinc-400 mb-4 leading-relaxed">
          Com base na sua alimentação recente, a IA prepara sugestões de marmitas para a próxima semana.
        </p>

        {/* ── CONFIG STEP ──────────────────────────────────────────────── */}
        {step === 'config' && (
          <div className="space-y-4">
            {genError && (
              <div className="px-3 py-2.5 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-100 dark:border-red-900/40 text-[12px] text-red-600 dark:text-red-400">
                {genError}
              </div>
            )}

            <div>
              <p className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 mb-2">Objetivo</p>
              <PillSelector
                options={GOAL_OPTS}
                value={config.goal}
                onChange={(v) => setConfig((c) => ({ ...c, goal: v }))}
              />
            </div>

            <div>
              <p className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 mb-2">Orçamento</p>
              <PillSelector
                options={BUDGET_OPTS}
                value={config.budget}
                onChange={(v) => setConfig((c) => ({ ...c, budget: v }))}
              />
            </div>

            <div>
              <p className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 mb-2">Quantidade de marmitas</p>
              <div className="flex flex-wrap gap-2">
                {MEAL_COUNTS.map((n) => (
                  <button key={n} onClick={() => { setConfig((c) => ({ ...c, mealCount: n })); setShowCustom(false); }}
                    className={cn(
                      'px-3 py-1.5 rounded-xl text-[12px] font-semibold transition-all duration-150 border',
                      config.mealCount === n && !showCustom
                        ? 'bg-emerald-500 text-white border-emerald-500'
                        : 'bg-zinc-50 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700 hover:border-emerald-300 dark:hover:border-emerald-700'
                    )}>
                    {n}
                  </button>
                ))}
                <button onClick={() => setShowCustom((v) => !v)}
                  className={cn(
                    'px-3 py-1.5 rounded-xl text-[12px] font-semibold transition-all duration-150 border',
                    showCustom
                      ? 'bg-emerald-500 text-white border-emerald-500'
                      : 'bg-zinc-50 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700 hover:border-emerald-300 dark:hover:border-emerald-700'
                  )}>
                  Personalizado
                </button>
              </div>
              {showCustom && (
                <div className="mt-2 flex items-center gap-2">
                  <input
                    type="number"
                    min={1} max={50}
                    value={customCount}
                    onChange={(e) => {
                      setCustomCount(e.target.value);
                      const n = parseInt(e.target.value);
                      if (!isNaN(n) && n > 0 && n <= 50)
                        setConfig((c) => ({ ...c, mealCount: n }));
                    }}
                    placeholder="Ex: 12"
                    className="w-24 px-3 py-1.5 rounded-xl text-[13px] border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                  />
                  <span className="text-[12px] text-zinc-400 dark:text-zinc-500">marmitas</span>
                </div>
              )}
            </div>

            <button onClick={handleGenerate}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-emerald-500 hover:bg-emerald-600 active:scale-[0.98] text-white font-semibold text-[14px] transition-all shadow-sm shadow-emerald-200 dark:shadow-none">
              <Sparkles size={16} />
              Gerar Sugestões de Cardápio
            </button>
          </div>
        )}

        {/* ── REVIEWING STEP ───────────────────────────────────────────── */}
        {step === 'reviewing' && (
          <div className="space-y-3">
            {/* Approved counter */}
            {approvedPlans.length > 0 && (
              <div className={cn(
                'flex items-center justify-between px-3 py-2.5 rounded-xl border transition-all',
                canConsolidate
                  ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/60'
                  : 'bg-zinc-50 dark:bg-zinc-800/40 border-zinc-100 dark:border-zinc-700/50'
              )}>
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={14} className={canConsolidate ? 'text-emerald-500' : 'text-zinc-400'} />
                  <span className="text-[12px] font-semibold text-zinc-700 dark:text-zinc-300">
                    {approvedPlans.length} cardápio{approvedPlans.length > 1 ? 's' : ''} aprovado{approvedPlans.length > 1 ? 's' : ''}
                  </span>
                </div>
                {!canConsolidate && (
                  <span className="text-[11px] text-zinc-400 dark:text-zinc-500">
                    Aprove mais {2 - approvedPlans.length}
                  </span>
                )}
              </div>
            )}

            {/* Plan cards */}
            {plans.map((plan) => (
              <PlanCard
                key={plan.id}
                plan={plan}
                mealCount={config.mealCount}
                onApprove={() => handleApprove(plan.id)}
                onReject={() => handleReject(plan.id)}
                approving={actingId === plan.id && actingType === 'approve'}
                rejecting={actingId === plan.id && actingType === 'reject'}
                onViewSteps={() => setActiveRecipe(planToModalData(plan))}
              />
            ))}

            {/* Loading indicator for new plan */}
            {addingNew && (
              <div className="flex items-center justify-center gap-2 py-4 text-[12px] text-zinc-400 dark:text-zinc-500">
                <Loader2 size={13} className="animate-spin text-emerald-500" />
                Gerando nova opção…
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2 pt-1">
              {canConsolidate && (
                <button onClick={() => setStep('shopping')}
                  className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl bg-emerald-500 hover:bg-emerald-600 active:scale-[0.98] text-white font-semibold text-[14px] transition-all">
                  <ShoppingCart size={15} />
                  Ver Lista de Compras
                </button>
              )}
              <button onClick={handleReset}
                className={cn(
                  'flex items-center justify-center gap-1.5 py-3 px-4 rounded-2xl font-semibold text-[13px] transition-all',
                  'bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-300',
                  canConsolidate ? 'w-auto' : 'flex-1'
                )}>
                <RefreshCw size={13} />
                {canConsolidate ? '' : 'Recomeçar'}
              </button>
            </div>
          </div>
        )}

        {/* ── SHOPPING STEP ────────────────────────────────────────────── */}
        {step === 'shopping' && (
          <div className="space-y-4">
            {/* Summary */}
            <div className="grid grid-cols-3 gap-2">
              <div className="text-center p-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-100 dark:border-zinc-700/50">
                <p className="text-[9px] text-zinc-400 dark:text-zinc-500 leading-tight">Marmitas</p>
                <p className="text-[16px] font-bold tabular-nums text-zinc-800 dark:text-zinc-200 mt-0.5">{totalMeals}</p>
              </div>
              <div className="text-center p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900/30">
                <p className="text-[9px] text-emerald-600 dark:text-emerald-400 leading-tight">Total</p>
                <p className="text-[16px] font-bold tabular-nums text-emerald-700 dark:text-emerald-300 mt-0.5">R$ {totalCost.toFixed(0)}</p>
              </div>
              <div className="text-center p-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-100 dark:border-zinc-700/50">
                <p className="text-[9px] text-zinc-400 dark:text-zinc-500 leading-tight">Por marmita</p>
                <p className="text-[16px] font-bold tabular-nums text-zinc-800 dark:text-zinc-200 mt-0.5">R$ {costPerMeal.toFixed(2)}</p>
              </div>
            </div>

            {/* Section header */}
            <div className="flex items-center gap-2">
              <Package size={13} className="text-emerald-500" />
              <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
                Ingredientes Consolidados
              </p>
            </div>

            {/* Shopping list by category */}
            <div className="space-y-3">
              {(Object.keys(CAT_LABELS) as ShoppingCat[]).map((cat) => {
                const catItems = shoppingItems.filter((i) => i.category === cat);
                if (!catItems.length) return null;
                const catTotal = catItems.reduce((s, i) => s + i.total_cost, 0);
                return (
                  <div key={cat} className="rounded-xl border border-zinc-100 dark:border-zinc-700/50 overflow-hidden">
                    <div className="flex items-center justify-between px-3 py-2 bg-zinc-50 dark:bg-zinc-800/60">
                      <span className="text-[11px] font-semibold text-zinc-600 dark:text-zinc-300">{CAT_LABELS[cat]}</span>
                      <span className="text-[10px] text-zinc-400 dark:text-zinc-500">R$ {catTotal.toFixed(0)}</span>
                    </div>
                    <div className="divide-y divide-zinc-50 dark:divide-zinc-800/60">
                      {catItems.map((item, i) => (
                        <div key={i} className="flex items-center justify-between px-3 py-2.5 bg-white dark:bg-zinc-900/50">
                          <div className="min-w-0">
                            <p className="text-[13px] font-medium text-zinc-700 dark:text-zinc-300 truncate">{item.name}</p>
                            <p className="text-[11px] text-zinc-400 dark:text-zinc-500">{item.amount}</p>
                          </div>
                          <span className="text-[12px] font-semibold tabular-nums text-zinc-500 dark:text-zinc-400 ml-3 flex-shrink-0">
                            R$ {item.total_cost.toFixed(0)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Approved cardápios info */}
            <div className="text-[11px] text-zinc-400 dark:text-zinc-500 px-1 leading-relaxed">
              Lista baseada em {approvedPlans.length} cardápio{approvedPlans.length > 1 ? 's' : ''} aprovado{approvedPlans.length > 1 ? 's' : ''}: {approvedPlans.map((p) => `Opção ${p.label}`).join(' + ')}.
              Valores são estimativas de preços médios de mercado.
            </div>

            {/* Send to shopping list */}
            <button
              onClick={handleSendToShoppingList}
              disabled={sendState === 'sending'}
              className={cn(
                'w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl font-semibold text-[14px] transition-all active:scale-[0.98]',
                sendState === 'success'
                  ? 'bg-emerald-500 text-white'
                  : sendState === 'error'
                  ? 'bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/40 text-red-600 dark:text-red-400'
                  : 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-sm shadow-emerald-200 dark:shadow-none',
                sendState === 'sending' && 'opacity-70 cursor-not-allowed'
              )}>
              {sendState === 'sending' && <><Loader2 size={15} className="animate-spin" />Enviando itens…</>}
              {sendState === 'success' && <><Check size={15} />{sendResult?.sent ?? 0} itens enviados para a Lista!</>}
              {sendState === 'error'   && <><AlertCircle size={15} />{sendResult ? `${sendResult.sent} enviados · ${sendResult.failed} com erro` : 'Erro ao enviar — Tentar novamente'}</>}
              {sendState === 'idle'    && <><Send size={15} />Enviar para Lista de Compras</>}
            </button>

            {/* Actions */}
            <div className="flex gap-2">
              <button onClick={handleCopyList}
                className={cn(
                  'flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl font-semibold text-[12px] transition-all',
                  copied
                    ? 'bg-emerald-500 text-white'
                    : 'bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-300'
                )}>
                {copied ? <><Check size={13} />Copiado!</> : <><Copy size={13} />Copiar</>}
              </button>
              <button onClick={() => setStep('reviewing')}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl font-semibold text-[12px] transition-all bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-300">
                <ChevronUp size={13} />
                Cardápios
              </button>
            </div>

            <button onClick={handleReset}
              className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-[12px] font-medium text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors">
              <RefreshCw size={12} />
              Gerar novos cardápios
            </button>
          </div>
        )}
      </div>

      {/* Recipe step-by-step modal */}
      {activeRecipe && (
        <RecipeModal
          recipe={activeRecipe}
          onClose={() => setActiveRecipe(null)}
        />
      )}
    </>
  );
}
