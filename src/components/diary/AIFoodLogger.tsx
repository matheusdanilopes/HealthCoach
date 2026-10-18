'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import { cn, suggestMealType } from '@/lib/utils';
import { Camera, ImagePlus, X, Sparkles, CheckCircle2, RotateCcw, Pencil, Check, AlertTriangle, Droplets, Mic, Square } from 'lucide-react';
import { detectBeverage } from '@/lib/beverages';
import MealTypeSelector from '@/components/diary/MealTypeSelector';
import type { FoodLog, MealType } from '@/types';

interface FoodItem {
  name: string;
  quantity: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  hydration_ml?: number;        // ml that counts toward hydration (0 = not a beverage)
  hydration_confidence?: string;
}

interface AnalysisResult {
  foods: FoodItem[];
  totalCalories: number;
  totalProtein: number;
  totalCarbs: number;
  totalFat: number;
  confidence?: 'low' | 'medium' | 'high';
  portionAssumption?: 'small' | 'medium' | 'large';
}

interface AIFoodLoggerProps {
  open: boolean;
  onClose: () => void;
  userId: string;
  defaultMeal?: MealType | null;
  date?: string;
  onAdded: (log: FoodLog) => void;
}

const MAX_IMAGE_MB = 15;
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const ANALYZE_TIMEOUT_MS = 45_000;

const TAB_LABELS: Record<'text' | 'image' | 'manual' | 'voice', string> = {
  text: 'Texto',
  image: 'Imagem',
  manual: 'Manual',
  voice: 'Voz',
};

const inputCls =
  'w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2 py-1 text-[12px] text-zinc-800 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-emerald-400';

interface SpeechRecognitionResultLike {
  0: { transcript: string };
}
interface SpeechRecognitionEventLike {
  results: ArrayLike<SpeechRecognitionResultLike>;
}
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;
function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function resolveItemHydration(item: FoodItem): number {
  // Use AI-returned value if present and positive
  if (typeof item.hydration_ml === 'number' && item.hydration_ml > 0) return item.hydration_ml;
  // Fall back to local detection using name + quantity
  const text = item.quantity ? `${item.name} ${item.quantity}` : item.name;
  return detectBeverage(text).estimatedMl;
}

export default function AIFoodLogger(props: AIFoodLoggerProps) {
  const { open } = props;
  // Remount the modal's internal state fresh every time it opens, instead of
  // resetting ~12 state variables by hand inside an effect.
  const [wasOpen, setWasOpen] = useState(open);
  const [epoch, setEpoch] = useState(0);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setEpoch(epoch + 1);
  }
  return <AIFoodLoggerModal key={epoch} {...props} />;
}

function AIFoodLoggerModal({
  open,
  onClose,
  defaultMeal,
  date,
  onAdded,
}: AIFoodLoggerProps) {
  const [tab, setTab] = useState<'text' | 'image' | 'manual' | 'voice'>('text');
  const [mealType, setMealType] = useState<MealType | null>(defaultMeal ?? null);
  const [mealError, setMealError] = useState(false);
  const [textInput, setTextInput] = useState('');
  const [manualName, setManualName] = useState('');
  const [manualQuantity, setManualQuantity] = useState('');
  const [manualCalories, setManualCalories] = useState('');
  const [manualProtein, setManualProtein] = useState('');
  const [manualCarbs, setManualCarbs] = useState('');
  const [manualFat, setManualFat] = useState('');
  const [recording, setRecording] = useState(false);
  const [voiceSupported] = useState(
    () => typeof window !== 'undefined' && !!getSpeechRecognitionCtor()
  );
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [prevResult, setPrevResult] = useState<AnalysisResult | null>(null);
  const [editedFoods, setEditedFoods] = useState<FoodItem[]>([]);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editBuffer, setEditBuffer] = useState<FoodItem | null>(null);
  const [bufferAnalyzing, setBufferAnalyzing] = useState(false);
  const [bufferNeedsReanalysis, setBufferNeedsReanalysis] = useState(false);
  const [bufferError, setBufferError] = useState<string | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedIndices, setSavedIndices] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  // Merge AI hydration with local fallback detection whenever a new result comes in.
  if (result !== prevResult) {
    setPrevResult(result);
    if (result) {
      setEditedFoods(result.foods.map((f) => ({
        ...f,
        hydration_ml: resolveItemHydration(f),
      })));
      setEditingIndex(null);
      setEditBuffer(null);
      setSavedIndices(new Set());
    } else {
      setEditedFoods([]);
      setSavedIndices(new Set());
    }
  }

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [textInput]);

  useEffect(() => () => recognitionRef.current?.stop(), []);

  const computedTotal = useMemo(
    () =>
      editedFoods.reduce(
        (acc, f) => ({
          calories: acc.calories + (Number(f.calories) || 0),
          protein: +(acc.protein + (Number(f.protein) || 0)).toFixed(1),
          carbs: +(acc.carbs + (Number(f.carbs) || 0)).toFixed(1),
          fat: +(acc.fat + (Number(f.fat) || 0)).toFixed(1),
        }),
        { calories: 0, protein: 0, carbs: 0, fat: 0 }
      ),
    [editedFoods]
  );

  const totalHydration = useMemo(
    () => editedFoods.reduce((s, f) => s + (f.hydration_ml ?? 0), 0),
    [editedFoods]
  );

  function enterEditMode(i: number) {
    setEditBuffer({ ...editedFoods[i] });
    setEditingIndex(i);
    setBufferNeedsReanalysis(false);
    setBufferError(null);
  }

  function commitEdit() {
    if (editingIndex !== null && editBuffer !== null) {
      setEditedFoods((prev) =>
        prev.map((f, i) => (i === editingIndex ? { ...editBuffer } : f))
      );
      // Values changed since the last save — this item needs to be re-submitted.
      setSavedIndices((prev) => {
        if (!prev.has(editingIndex)) return prev;
        const next = new Set(prev);
        next.delete(editingIndex);
        return next;
      });
    }
    setEditingIndex(null);
    setEditBuffer(null);
    setBufferError(null);
  }

  function cancelEdit() {
    setEditingIndex(null);
    setEditBuffer(null);
    setBufferNeedsReanalysis(false);
    setBufferError(null);
  }

  async function reanalyzeBuffer() {
    if (!editBuffer) return;
    setBufferAnalyzing(true);
    setBufferError(null);
    try {
      const description = editBuffer.quantity.trim()
        ? `${editBuffer.name} ${editBuffer.quantity}`
        : editBuffer.name;
      const res = await fetch('/api/food/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'text', description }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? 'Erro');
      const aiHydration = data.foods?.[0]?.hydration_ml;
      const localHydration = detectBeverage(description).estimatedMl;
      setEditBuffer((prev) =>
        prev
          ? {
              ...prev,
              calories: data.totalCalories ?? prev.calories,
              protein: +(data.totalProtein ?? prev.protein).toFixed(1),
              carbs: +(data.totalCarbs ?? prev.carbs).toFixed(1),
              fat: +(data.totalFat ?? prev.fat).toFixed(1),
              hydration_ml: typeof aiHydration === 'number' ? aiHydration : localHydration,
            }
          : null
      );
      setBufferNeedsReanalysis(false);
    } catch (e) {
      setBufferError(e instanceof Error ? e.message : 'Não foi possível reanalisar. Tente novamente.');
    } finally {
      setBufferAnalyzing(false);
    }
  }

  function handleClose() {
    if (result !== null || editingIndex !== null) {
      setConfirmClose(true);
    } else {
      onClose();
    }
  }

  function handleImageSelect(file: File) {
    setResult(null);
    setError(null);
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      setError('Formato não suportado. Envie uma imagem JPG, PNG ou WEBP.');
      return;
    }
    if (file.size === 0) {
      setError('Arquivo de imagem vazio. Escolha outra foto.');
      return;
    }
    if (file.size > MAX_IMAGE_MB * 1024 * 1024) {
      setError(`Imagem muito grande (máx. ${MAX_IMAGE_MB}MB). Tente uma foto com menor resolução.`);
      return;
    }
    setImageFile(file);
    const reader = new FileReader();
    reader.onerror = () => setError('Não foi possível ler a imagem. Tente outra foto.');
    reader.onload = (e) => setImagePreview(e.target?.result as string);
    reader.readAsDataURL(file);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleImageSelect(file);
    e.target.value = '';
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleImageSelect(file);
  }

  function removeImage() {
    setImageFile(null);
    setImagePreview(null);
    setResult(null);
  }

  function switchTab(t: 'text' | 'image' | 'manual' | 'voice') {
    if (recording) recognitionRef.current?.stop();
    setTab(t);
    setResult(null);
    setError(null);
  }

  function toggleRecording() {
    if (recording) {
      recognitionRef.current?.stop();
      return;
    }
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) return;
    const recognition = new Ctor();
    recognition.lang = 'pt-BR';
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.onresult = (event) => {
      let transcript = '';
      for (let i = 0; i < event.results.length; i++) transcript += event.results[i][0].transcript;
      setTextInput(transcript);
    };
    recognition.onerror = () => setRecording(false);
    recognition.onend = () => setRecording(false);
    recognition.start();
    recognitionRef.current = recognition;
    setRecording(true);
    setError(null);
  }

  function addManualFood() {
    if (!manualName.trim() || !manualCalories) return;
    const food: FoodItem = {
      name: manualName.trim(),
      quantity: manualQuantity.trim(),
      calories: Math.round(Number(manualCalories) || 0),
      protein: Number(manualProtein) || 0,
      carbs: Number(manualCarbs) || 0,
      fat: Number(manualFat) || 0,
      hydration_ml: 0,
    };
    setError(null);
    setResult({
      foods: [food],
      totalCalories: food.calories,
      totalProtein: food.protein,
      totalCarbs: food.carbs,
      totalFat: food.fat,
    });
  }

  async function compressImage(dataUrl: string): Promise<{ base64: string; mimeType: string }> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const MAX_DIM = 1280;
        const scale = Math.min(1, MAX_DIM / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) { reject(new Error('Canvas not available')); return; }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(
          (blob) => {
            if (!blob) { reject(new Error('Image conversion failed')); return; }
            const reader = new FileReader();
            reader.onload = (e) => {
              const result = e.target?.result as string;
              resolve({ base64: result.split(',')[1], mimeType: 'image/jpeg' });
            };
            reader.onerror = () => reject(new Error('Failed to read image'));
            reader.readAsDataURL(blob);
          },
          'image/jpeg',
          0.85
        );
      };
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = dataUrl;
    });
  }

  async function analyze() {
    setAnalyzing(true);
    setError(null);
    try {
      let body: Record<string, unknown>;
      if (tab === 'text' || tab === 'voice') {
        if (!textInput.trim()) return;
        body = { type: 'text', description: textInput.trim() };
      } else {
        if (!imagePreview || !imageFile) return;
        const { base64, mimeType } = await compressImage(imagePreview);
        body = { type: 'image', imageBase64: base64, mimeType };
      }
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), ANALYZE_TIMEOUT_MS);
      let res: Response;
      try {
        res = await fetch('/api/food/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ?? `Erro ao analisar (HTTP ${res.status}).`);
      if (!json) throw new Error('Resposta inválida do servidor. Tente novamente.');
      setResult(json as AnalysisResult);
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') {
        setError('A análise demorou demais e foi cancelada. Tente uma foto menor ou verifique sua conexão.');
      } else if (e instanceof TypeError) {
        setError('Sem conexão com o servidor. Verifique sua internet e tente novamente.');
      } else {
        setError(e instanceof Error ? e.message : 'Não foi possível analisar. Tente novamente.');
      }
    } finally {
      setAnalyzing(false);
    }
  }

  async function saveFood(food: FoodItem): Promise<FoodLog> {
    const res = await fetch('/api/food', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        food_name: food.quantity ? `${food.name} (${food.quantity})` : food.name,
        meal_type: mealType!,
        calories: Math.round(Number(food.calories) || 0),
        protein: Number(food.protein) || null,
        carbs: Number(food.carbs) || null,
        fat: Number(food.fat) || null,
        log_date: date,
        hydration_ml: food.hydration_ml ?? 0,
        hydration_source: (food.hydration_ml ?? 0) > 0 ? 'meal' : null,
        hydration_confidence: food.hydration_confidence ?? null,
      }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.error ?? `Erro ao salvar (HTTP ${res.status}).`);
    if (!data) throw new Error('Resposta inválida do servidor ao salvar.');
    return data as FoodLog;
  }

  async function handleConfirm() {
    if (!result || editedFoods.length === 0) return;
    if (!mealType) {
      setMealError(true);
      return;
    }
    setSaving(true);
    setError(null);

    // Only (re-)submit items not already persisted, so a retry after a partial
    // failure can't insert duplicate rows for foods that already saved.
    const pendingIndices = editedFoods.reduce<number[]>((acc, _, i) => {
      if (!savedIndices.has(i)) acc.push(i);
      return acc;
    }, []);

    const outcomes = await Promise.allSettled(
      pendingIndices.map((i) => saveFood(editedFoods[i]).then((log) => ({ index: i, log })))
    );

    const newSaved = new Set(savedIndices);
    let failCount = 0;
    for (const outcome of outcomes) {
      if (outcome.status === 'fulfilled') {
        newSaved.add(outcome.value.index);
        onAdded(outcome.value.log);
      } else {
        failCount++;
      }
    }
    setSavedIndices(newSaved);

    if (failCount === 0) {
      onClose();
    } else {
      const savedNow = outcomes.length - failCount;
      setError(
        savedNow > 0
          ? `${savedNow} de ${outcomes.length} alimentos salvos. ${failCount} ${failCount === 1 ? 'falhou' : 'falharam'} — tente novamente.`
          : 'Não foi possível salvar. Verifique sua conexão e tente novamente.'
      );
    }
    setSaving(false);
  }

  const canAnalyze =
    tab === 'text' || tab === 'voice'
      ? textInput.trim().length > 0
      : tab === 'image'
      ? !!imagePreview
      : false;

  return (
    <Modal open={open} onClose={handleClose} title="Registrar refeição com IA">
      {confirmClose ? (
        <div className="flex flex-col items-center gap-5 py-3">
          <div className="flex flex-col items-center gap-2 text-center">
            <div className="h-10 w-10 rounded-full bg-amber-50 dark:bg-amber-950/30 flex items-center justify-center">
              <AlertTriangle size={18} className="text-amber-500" />
            </div>
            <p className="text-[14px] font-semibold text-zinc-800 dark:text-zinc-200">
              Sair sem salvar?
            </p>
            <p className="text-[13px] text-zinc-500 dark:text-zinc-400 leading-relaxed">
              {(() => {
                const unsaved = editedFoods.length - savedIndices.size;
                if (unsaved <= 0) return 'As alterações em edição serão descartadas.';
                return `${unsaved} alimento${unsaved !== 1 ? 's' : ''} analisado${unsaved !== 1 ? 's' : ''} ainda não salvo${unsaved !== 1 ? 's' : ''} será${unsaved !== 1 ? 'ão' : ''} descartado${unsaved !== 1 ? 's' : ''}.`;
              })()}
            </p>
          </div>
          <div className="flex gap-2 w-full">
            <button
              type="button"
              onClick={() => setConfirmClose(false)}
              className="flex-1 h-10 rounded-xl border border-zinc-200 dark:border-zinc-700 text-[13px] font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/60 transition-all"
            >
              Continuar
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 h-10 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/60 text-[13px] font-semibold text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-950/50 transition-all"
            >
              Sair mesmo assim
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {/* Meal type selector */}
          <MealTypeSelector
            value={mealType}
            onChange={(meal) => { setMealType(meal); setMealError(false); }}
            suggestedType={suggestMealType(new Date().getHours())}
            error={mealError}
          />

          {/* Mode tabs */}
          {!result && (
            <div className="flex bg-zinc-100 dark:bg-zinc-800/60 rounded-xl p-1 gap-1">
              {(['text', 'image', 'manual', 'voice'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => switchTab(t)}
                  className={cn(
                    'flex-1 py-2 rounded-lg text-[12px] font-medium transition-all whitespace-nowrap',
                    tab === t
                      ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm'
                      : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300'
                  )}
                >
                  {TAB_LABELS[t]}
                </button>
              ))}
            </div>
          )}

          {/* Text / Voice input */}
          {!result && (tab === 'text' || tab === 'voice') && (
            <div className="flex flex-col gap-3">
              {tab === 'voice' && (
                <div className="flex flex-col items-center gap-2 py-2">
                  <button
                    type="button"
                    onClick={toggleRecording}
                    disabled={!voiceSupported}
                    className={cn(
                      'h-16 w-16 rounded-full flex items-center justify-center transition-all disabled:opacity-40 disabled:pointer-events-none',
                      recording
                        ? 'bg-red-500 text-white shadow-lg shadow-red-500/30 animate-pulse'
                        : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/60 hover:bg-emerald-100 dark:hover:bg-emerald-900/40'
                    )}
                  >
                    {recording ? <Square size={20} /> : <Mic size={22} />}
                  </button>
                  <p className="text-[12px] text-zinc-500 dark:text-zinc-400 text-center">
                    {!voiceSupported
                      ? 'Reconhecimento de voz não suportado neste navegador.'
                      : recording
                      ? 'Ouvindo... toque para parar'
                      : 'Toque para falar o que você comeu'}
                  </p>
                </div>
              )}
              <textarea
                ref={textareaRef}
                value={textInput}
                onChange={(e) => { setTextInput(e.target.value); setError(null); }}
                placeholder="Ex: arroz, feijão e frango grelhado"
                rows={3}
                className={cn(
                  'w-full resize-none rounded-xl border bg-zinc-50 dark:bg-zinc-800/60 px-4 py-3',
                  'border-zinc-200 dark:border-zinc-700/60',
                  'text-[14px] leading-relaxed text-zinc-800 dark:text-zinc-100',
                  'placeholder:text-zinc-400 dark:placeholder:text-zinc-500',
                  'focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400/60',
                  'transition-all'
                )}
              />
              <Button onClick={analyze} loading={analyzing} disabled={!canAnalyze} className="w-full gap-2">
                <Sparkles size={14} />
                Analisar com IA
              </Button>
            </div>
          )}

          {/* Manual input */}
          {!result && tab === 'manual' && (
            <div className="flex flex-col gap-3">
              <label className="flex flex-col gap-0.5">
                <span className="text-[10px] text-zinc-400 uppercase tracking-wide">Alimento</span>
                <input
                  type="text"
                  value={manualName}
                  onChange={(e) => setManualName(e.target.value)}
                  placeholder="Ex: 2 ovos mexidos"
                  className={inputCls}
                />
              </label>
              <label className="flex flex-col gap-0.5">
                <span className="text-[10px] text-zinc-400 uppercase tracking-wide">Quantidade (opcional)</span>
                <input
                  type="text"
                  value={manualQuantity}
                  onChange={(e) => setManualQuantity(e.target.value)}
                  placeholder="Ex: 1 unidade"
                  className={inputCls}
                />
              </label>
              <label className="flex flex-col gap-0.5">
                <span className="text-[10px] text-zinc-400 uppercase tracking-wide">Calorias (kcal)</span>
                <input
                  type="number"
                  min={0}
                  value={manualCalories}
                  onChange={(e) => setManualCalories(e.target.value)}
                  placeholder="0"
                  className={inputCls}
                />
              </label>
              <div className="grid grid-cols-3 gap-2">
                <label className="flex flex-col gap-0.5">
                  <span className="text-[10px] text-zinc-400 uppercase tracking-wide">Proteína (g)</span>
                  <input
                    type="number"
                    min={0}
                    step={0.1}
                    value={manualProtein}
                    onChange={(e) => setManualProtein(e.target.value)}
                    placeholder="0"
                    className={inputCls}
                  />
                </label>
                <label className="flex flex-col gap-0.5">
                  <span className="text-[10px] text-zinc-400 uppercase tracking-wide">Carbs (g)</span>
                  <input
                    type="number"
                    min={0}
                    step={0.1}
                    value={manualCarbs}
                    onChange={(e) => setManualCarbs(e.target.value)}
                    placeholder="0"
                    className={inputCls}
                  />
                </label>
                <label className="flex flex-col gap-0.5">
                  <span className="text-[10px] text-zinc-400 uppercase tracking-wide">Gordura (g)</span>
                  <input
                    type="number"
                    min={0}
                    step={0.1}
                    value={manualFat}
                    onChange={(e) => setManualFat(e.target.value)}
                    placeholder="0"
                    className={inputCls}
                  />
                </label>
              </div>
              <Button onClick={addManualFood} disabled={!manualName.trim() || !manualCalories} className="w-full">
                Adicionar
              </Button>
            </div>
          )}

          {/* Image input */}
          {!result && tab === 'image' && (
            <div className="flex flex-col gap-3">
              {!imagePreview ? (
                <>
                  <div
                    onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={cn(
                      'flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed h-44 cursor-pointer transition-all',
                      isDragging
                        ? 'border-emerald-400 bg-emerald-50/50 dark:bg-emerald-950/20'
                        : 'border-zinc-200 dark:border-zinc-700/60 bg-zinc-50/80 dark:bg-zinc-800/40 hover:border-zinc-300 dark:hover:border-zinc-600'
                    )}
                  >
                    <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-zinc-100 dark:bg-zinc-700/60">
                      <ImagePlus size={22} className="text-zinc-400" />
                    </div>
                    <div className="text-center">
                      <p className="text-[13px] font-medium text-zinc-600 dark:text-zinc-300">
                        Arraste ou clique para enviar
                      </p>
                      <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-0.5">
                        JPG · PNG · WEBP
                      </p>
                    </div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => cameraInputRef.current?.click()}
                      className={cn(
                        'flex-1 flex items-center justify-center gap-2 h-10 rounded-xl text-[13px] font-medium transition-all',
                        'border border-zinc-200 dark:border-zinc-700/60 bg-zinc-50 dark:bg-zinc-800/40',
                        'text-zinc-600 dark:text-zinc-300 hover:border-zinc-300 dark:hover:border-zinc-600'
                      )}
                    >
                      <Camera size={14} />
                      Câmera
                    </button>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className={cn(
                        'flex-1 flex items-center justify-center gap-2 h-10 rounded-xl text-[13px] font-medium transition-all',
                        'border border-zinc-200 dark:border-zinc-700/60 bg-zinc-50 dark:bg-zinc-800/40',
                        'text-zinc-600 dark:text-zinc-300 hover:border-zinc-300 dark:hover:border-zinc-600'
                      )}
                    >
                      <ImagePlus size={14} />
                      Galeria
                    </button>
                    <input
                      ref={cameraInputRef}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                  </div>
                </>
              ) : (
                <div className="relative rounded-2xl overflow-hidden bg-zinc-100 dark:bg-zinc-800 shadow-sm">
                  <img src={imagePreview} alt="Preview da refeição" className="w-full h-52 object-cover" />
                  <button
                    onClick={removeImage}
                    className="absolute top-2.5 right-2.5 h-8 w-8 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center hover:bg-black/70 transition-colors"
                  >
                    <X size={13} className="text-white" />
                  </button>
                </div>
              )}

              <Button onClick={analyze} loading={analyzing} disabled={!canAnalyze} className="w-full gap-2">
                <Sparkles size={14} />
                Analisar imagem
              </Button>
            </div>
          )}

          {/* Analysis result */}
          {result && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={15} className="text-emerald-500 flex-shrink-0" />
                <p className="text-[13px] font-semibold text-zinc-700 dark:text-zinc-200 flex-1">
                  {editedFoods.length} alimento{editedFoods.length !== 1 ? 's' : ''} identificado{editedFoods.length !== 1 ? 's' : ''}
                </p>
                {result.confidence && (
                  <span className={cn(
                    'text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0',
                    result.confidence === 'high'
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400'
                      : result.confidence === 'medium'
                      ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400'
                      : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400'
                  )}>
                    {result.confidence === 'high' ? 'Alta confiança' : result.confidence === 'medium' ? 'Estimativa' : 'Incerto'}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setResult(null)}
                  className="flex items-center gap-1 text-[11px] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
                >
                  <RotateCcw size={11} />
                  Refazer
                </button>
              </div>

              {/* Food cards */}
              <div className="flex flex-col gap-2 max-h-64 overflow-y-auto">
                {editedFoods.map((food, i) => (
                  <div
                    key={i}
                    className={cn(
                      'bg-zinc-50 dark:bg-zinc-800/60 rounded-xl px-4 py-3 border border-zinc-100 dark:border-zinc-700/40',
                      savedIndices.has(i) && 'opacity-60'
                    )}
                  >
                    {editingIndex === i && editBuffer ? (
                      <div className="flex flex-col gap-2.5">
                        {/* Name */}
                        <label className="flex flex-col gap-0.5">
                          <span className="text-[10px] text-zinc-400 uppercase tracking-wide">Nome</span>
                          <input
                            type="text"
                            value={editBuffer.name}
                            onChange={(e) => { setEditBuffer((p) => p ? { ...p, name: e.target.value } : null); setBufferNeedsReanalysis(true); }}
                            className={inputCls}
                          />
                        </label>

                        {/* Qty + Re-analyze */}
                        <div className="flex gap-2 items-end">
                          <label className="flex flex-col gap-0.5 flex-1">
                            <span className="text-[10px] text-zinc-400 uppercase tracking-wide">Quantidade</span>
                            <input
                              type="text"
                              value={editBuffer.quantity}
                              onChange={(e) => { setEditBuffer((p) => p ? { ...p, quantity: e.target.value } : null); setBufferNeedsReanalysis(true); }}
                              className={inputCls}
                            />
                          </label>
                          <button
                            type="button"
                            onClick={reanalyzeBuffer}
                            disabled={bufferAnalyzing || !editBuffer.name.trim()}
                            className={`flex items-center gap-1.5 h-[30px] px-2.5 rounded-lg border text-[11px] font-semibold transition-all disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap ${
                              bufferNeedsReanalysis
                                ? 'border-emerald-400 dark:border-emerald-600 bg-emerald-100 dark:bg-emerald-900/50 text-emerald-800 dark:text-emerald-300 ring-2 ring-emerald-400/40'
                                : 'border-emerald-200 dark:border-emerald-800/60 bg-emerald-50/80 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/40'
                            }`}
                          >
                            {bufferAnalyzing
                              ? <span className="h-3 w-3 rounded-full border-2 border-emerald-400 border-t-transparent animate-spin" />
                              : <Sparkles size={11} />
                            }
                            Re-analisar
                          </button>
                        </div>

                        {/* Kcal + macros */}
                        <div className="grid grid-cols-2 gap-2">
                          <label className="flex flex-col gap-0.5">
                            <span className="text-[10px] text-zinc-400 uppercase tracking-wide">Kcal</span>
                            <input
                              type="number" min={0}
                              value={editBuffer.calories}
                              onChange={(e) => setEditBuffer((p) => p ? { ...p, calories: Number(e.target.value) || 0 } : null)}
                              className={inputCls}
                            />
                          </label>
                          <label className="flex flex-col gap-0.5">
                            <span className="text-[10px] text-zinc-400 uppercase tracking-wide">Proteína (g)</span>
                            <input
                              type="number" min={0} step={0.1}
                              value={editBuffer.protein}
                              onChange={(e) => setEditBuffer((p) => p ? { ...p, protein: Number(e.target.value) || 0 } : null)}
                              className={inputCls}
                            />
                          </label>
                          <label className="flex flex-col gap-0.5">
                            <span className="text-[10px] text-zinc-400 uppercase tracking-wide">Carbs (g)</span>
                            <input
                              type="number" min={0} step={0.1}
                              value={editBuffer.carbs}
                              onChange={(e) => setEditBuffer((p) => p ? { ...p, carbs: Number(e.target.value) || 0 } : null)}
                              className={inputCls}
                            />
                          </label>
                          <label className="flex flex-col gap-0.5">
                            <span className="text-[10px] text-zinc-400 uppercase tracking-wide">Gordura (g)</span>
                            <input
                              type="number" min={0} step={0.1}
                              value={editBuffer.fat}
                              onChange={(e) => setEditBuffer((p) => p ? { ...p, fat: Number(e.target.value) || 0 } : null)}
                              className={inputCls}
                            />
                          </label>
                        </div>

                        {/* Hydration field (only shown for beverages) */}
                        {((editBuffer.hydration_ml ?? 0) > 0 || detectBeverage(`${editBuffer.name} ${editBuffer.quantity}`).isBeverage) && (
                          <label className="flex flex-col gap-0.5">
                            <span className="text-[10px] text-teal-500 uppercase tracking-wide flex items-center gap-1">
                              <Droplets size={9} /> Hidratação (ml)
                            </span>
                            <input
                              type="number" min={0} max={2000} step={10}
                              value={editBuffer.hydration_ml ?? 0}
                              onChange={(e) => setEditBuffer((p) => p ? { ...p, hydration_ml: Math.min(Number(e.target.value) || 0, 2000), hydration_confidence: 'medium' } : null)}
                              className={cn(inputCls, 'border-teal-200 dark:border-teal-800/60 focus:ring-teal-400')}
                            />
                          </label>
                        )}

                        {bufferNeedsReanalysis && (
                          <p className="text-[11px] text-amber-600 dark:text-amber-400 text-center -mb-1">
                            Re-analise com IA antes de confirmar
                          </p>
                        )}
                        {bufferError && (
                          <p className="text-[11px] text-red-500 dark:text-red-400 text-center -mb-1">
                            {bufferError}
                          </p>
                        )}
                        <div className="flex gap-2 pt-0.5">
                          <button
                            type="button"
                            onClick={cancelEdit}
                            className="flex-1 h-8 rounded-lg border border-zinc-200 dark:border-zinc-700 text-[12px] font-medium text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-700/50 transition-all"
                          >
                            Cancelar
                          </button>
                          <button
                            type="button"
                            onClick={bufferNeedsReanalysis ? undefined : commitEdit}
                            disabled={bufferNeedsReanalysis}
                            className="flex-1 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 text-[12px] font-semibold text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-all flex items-center justify-center gap-1 disabled:opacity-40 disabled:pointer-events-none"
                          >
                            <Check size={12} />
                            Confirmar
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-start justify-between gap-2 mb-1.5">
                          <div className="flex-1 min-w-0">
                            <p className="text-[13px] font-semibold text-zinc-800 dark:text-zinc-100 leading-snug">
                              {food.name}
                              {food.quantity && (
                                <span className="text-zinc-400 dark:text-zinc-500 font-normal ml-1">
                                  · {food.quantity}
                                </span>
                              )}
                            </p>
                            {(food.hydration_ml ?? 0) > 0 && (
                              <span className="inline-flex items-center gap-0.5 mt-1 px-1.5 py-0.5 rounded-full bg-teal-50 dark:bg-teal-950/40 border border-teal-100 dark:border-teal-900/40">
                                <Droplets size={8} className="text-teal-500" />
                                <span className="text-[9px] font-semibold text-teal-600 dark:text-teal-400">
                                  +{food.hydration_ml}ml hidratação
                                </span>
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <span className="text-[13px] font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                              {food.calories} kcal
                            </span>
                            {savedIndices.has(i) ? (
                              <span title="Já salvo" className="flex items-center text-emerald-500">
                                <CheckCircle2 size={13} />
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => enterEditMode(i)}
                                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
                                title="Editar"
                              >
                                <Pencil size={11} />
                              </button>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-3">
                          <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                            P <span className="font-medium text-zinc-700 dark:text-zinc-300">{food.protein}g</span>
                          </span>
                          <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                            C <span className="font-medium text-zinc-700 dark:text-zinc-300">{food.carbs}g</span>
                          </span>
                          <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                            G <span className="font-medium text-zinc-700 dark:text-zinc-300">{food.fat}g</span>
                          </span>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>

              {/* Totals card */}
              <div className="bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950/40 dark:to-teal-950/30 rounded-xl px-4 py-3.5 border border-emerald-100 dark:border-emerald-900/40">
                <div className="flex items-center justify-between mb-2.5">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
                    Total da refeição
                  </span>
                  <span className="text-[20px] font-bold tabular-nums text-emerald-700 dark:text-emerald-300 leading-none">
                    {computedTotal.calories} <span className="text-[13px] font-medium">kcal</span>
                  </span>
                </div>
                <div className="flex gap-0">
                  {[
                    { label: 'Proteína',    value: computedTotal.protein, unit: 'g', color: 'text-violet-600 dark:text-violet-400' },
                    { label: 'Carboidratos', value: computedTotal.carbs,   unit: 'g', color: 'text-amber-600 dark:text-amber-400' },
                    { label: 'Gorduras',    value: computedTotal.fat,     unit: 'g', color: 'text-rose-500 dark:text-rose-400' },
                  ].map((macro, i, arr) => (
                    <div key={macro.label} className={cn('flex-1 flex flex-col items-center', i < arr.length - 1 && 'border-r border-emerald-100 dark:border-emerald-900/40')}>
                      <span className={cn('text-[15px] font-bold tabular-nums', macro.color)}>
                        {macro.value}{macro.unit}
                      </span>
                      <span className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-0.5">
                        {macro.label}
                      </span>
                    </div>
                  ))}
                </div>
                {totalHydration > 0 && (
                  <div className="mt-2.5 pt-2.5 border-t border-emerald-100 dark:border-emerald-900/40 flex items-center gap-1.5">
                    <Droplets size={11} className="text-teal-500 flex-shrink-0" />
                    <span className="text-[11px] text-teal-600 dark:text-teal-400 font-medium">
                      +{totalHydration}ml contabilizados na hidratação
                    </span>
                  </div>
                )}
              </div>

              <p className="text-[11px] text-zinc-400 dark:text-zinc-500 text-center -mt-1">
                Estimativa aproximada baseada na descrição enviada
              </p>

              {mealError && (
                <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/60 animate-scale-in">
                  <AlertTriangle size={13} className="text-red-500 flex-shrink-0" />
                  <p className="text-[12px] font-semibold text-red-600 dark:text-red-400">
                    Selecione a refeição acima para continuar.
                  </p>
                </div>
              )}

              <Button onClick={handleConfirm} loading={saving} className="w-full">
                {savedIndices.size > 0 && savedIndices.size < editedFoods.length
                  ? `Salvar restantes (${editedFoods.length - savedIndices.size})`
                  : 'Confirmar e salvar'}
              </Button>
            </div>
          )}

          {/* Error */}
          {error && (
            <p className="text-[12px] text-red-500 dark:text-red-400 text-center -mt-1">{error}</p>
          )}
        </div>
      )}
    </Modal>
  );
}
