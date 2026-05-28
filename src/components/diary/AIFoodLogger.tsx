'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import { Camera, ImagePlus, X, Sparkles, CheckCircle2, RotateCcw, Pencil, Check, AlertTriangle } from 'lucide-react';
import type { FoodLog, MealType } from '@/types';

const MEAL_OPTIONS: { value: MealType; label: string; icon: string }[] = [
  { value: 'breakfast', label: 'Café',   icon: '☀️' },
  { value: 'lunch',     label: 'Almoço', icon: '🍽️' },
  { value: 'dinner',    label: 'Jantar',  icon: '🌙' },
  { value: 'snack',     label: 'Lanche',  icon: '🍎' },
];

interface FoodItem {
  name: string;
  quantity: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
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
  defaultMeal?: MealType;
  date?: string;
  onAdded: (log: FoodLog) => void;
}

const inputCls =
  'w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2 py-1 text-[12px] text-zinc-800 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-emerald-400';

export default function AIFoodLogger({
  open,
  onClose,
  defaultMeal = 'lunch',
  date,
  onAdded,
}: AIFoodLoggerProps) {
  const [tab, setTab] = useState<'text' | 'image'>('text');
  const [mealType, setMealType] = useState<MealType>(defaultMeal);
  const [textInput, setTextInput] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [editedFoods, setEditedFoods] = useState<FoodItem[]>([]);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editBuffer, setEditBuffer] = useState<FoodItem | null>(null);
  const [bufferAnalyzing, setBufferAnalyzing] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setMealType(defaultMeal);
      setTab('text');
      setTextInput('');
      setImageFile(null);
      setImagePreview(null);
      setResult(null);
      setEditedFoods([]);
      setEditingIndex(null);
      setEditBuffer(null);
      setConfirmClose(false);
      setError(null);
      setSaving(false);
    }
  }, [open, defaultMeal]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [textInput]);

  useEffect(() => {
    if (result) {
      setEditedFoods(result.foods.map((f) => ({ ...f })));
      setEditingIndex(null);
      setEditBuffer(null);
    } else {
      setEditedFoods([]);
    }
  }, [result]);

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

  // Enter edit mode for a food card — copies to local buffer, changes don't apply until commitEdit()
  function enterEditMode(i: number) {
    setEditBuffer({ ...editedFoods[i] });
    setEditingIndex(i);
  }

  // Apply buffer to editedFoods only when user clicks Confirmar
  function commitEdit() {
    if (editingIndex !== null && editBuffer !== null) {
      setEditedFoods((prev) =>
        prev.map((f, i) => (i === editingIndex ? { ...editBuffer } : f))
      );
    }
    setEditingIndex(null);
    setEditBuffer(null);
  }

  // Discard buffer without applying changes
  function cancelEdit() {
    setEditingIndex(null);
    setEditBuffer(null);
  }

  // Re-analyze the item using the buffered name + quantity
  async function reanalyzeBuffer() {
    if (!editBuffer) return;
    setBufferAnalyzing(true);
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
      setEditBuffer((prev) =>
        prev
          ? {
              ...prev,
              calories: data.totalCalories ?? prev.calories,
              protein: +(data.totalProtein ?? prev.protein).toFixed(1),
              carbs: +(data.totalCarbs ?? prev.carbs).toFixed(1),
              fat: +(data.totalFat ?? prev.fat).toFixed(1),
            }
          : null
      );
    } catch {
      // error shown inline via the buffer state staying unchanged
    } finally {
      setBufferAnalyzing(false);
    }
  }

  // Guard close: if there are unsaved analyzed foods or an open edit, ask for confirmation
  function handleClose() {
    if (result !== null || editingIndex !== null) {
      setConfirmClose(true);
    } else {
      onClose();
    }
  }

  function handleImageSelect(file: File) {
    setImageFile(file);
    setResult(null);
    setError(null);
    const reader = new FileReader();
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
    if (file && file.type.startsWith('image/')) handleImageSelect(file);
  }

  function removeImage() {
    setImageFile(null);
    setImagePreview(null);
    setResult(null);
  }

  function switchTab(t: 'text' | 'image') {
    setTab(t);
    setResult(null);
    setError(null);
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
      if (tab === 'text') {
        if (!textInput.trim()) return;
        body = { type: 'text', description: textInput.trim() };
      } else {
        if (!imagePreview || !imageFile) return;
        const { base64, mimeType } = await compressImage(imagePreview);
        body = { type: 'image', imageBase64: base64, mimeType };
      }
      const res = await fetch('/api/food/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? 'Erro desconhecido');
      setResult(json as AnalysisResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível analisar. Tente novamente.');
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleConfirm() {
    if (!result || editedFoods.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      const promises = editedFoods.map((food) =>
        fetch('/api/food', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            food_name: food.quantity ? `${food.name} (${food.quantity})` : food.name,
            meal_type: mealType,
            calories: Math.round(Number(food.calories) || 0),
            protein: Number(food.protein) || null,
            carbs: Number(food.carbs) || null,
            fat: Number(food.fat) || null,
            log_date: date,
          }),
        }).then((r) => r.json() as Promise<FoodLog>)
      );
      const logs = await Promise.all(promises);
      logs.forEach((log) => onAdded(log));
      onClose(); // direct close after successful save — no unsaved state
    } catch {
      setError('Erro ao salvar. Tente novamente.');
    } finally {
      setSaving(false);
    }
  }

  const canAnalyze = tab === 'text' ? textInput.trim().length > 0 : !!imagePreview;

  return (
    <Modal open={open} onClose={handleClose} title="Registrar refeição com IA">
      {/* Abandonment confirmation overlay */}
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
              {editedFoods.length > 0
                ? `${editedFoods.length} alimento${editedFoods.length !== 1 ? 's' : ''} analisado${editedFoods.length !== 1 ? 's' : ''} será${editedFoods.length !== 1 ? 'ão' : ''} descartado${editedFoods.length !== 1 ? 's' : ''}.`
                : 'As alterações em edição serão descartadas.'}
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
          <div className="flex gap-1.5">
            {MEAL_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setMealType(opt.value)}
                className={cn(
                  'flex-1 flex flex-col items-center gap-1 py-2.5 rounded-xl border text-[11px] font-semibold transition-all duration-150',
                  mealType === opt.value
                    ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/60 text-emerald-700 dark:text-emerald-400'
                    : 'bg-zinc-50/80 dark:bg-zinc-800/40 border-zinc-200/80 dark:border-zinc-700/40 text-zinc-500 dark:text-zinc-400 hover:border-zinc-300 dark:hover:border-zinc-600'
                )}
              >
                <span className="text-base leading-none">{opt.icon}</span>
                <span>{opt.label}</span>
              </button>
            ))}
          </div>

          {/* Mode tabs */}
          {!result && (
            <div className="flex bg-zinc-100 dark:bg-zinc-800/60 rounded-xl p-1 gap-1">
              {(['text', 'image'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => switchTab(t)}
                  className={cn(
                    'flex-1 py-2 rounded-lg text-[13px] font-medium transition-all',
                    tab === t
                      ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm'
                      : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300'
                  )}
                >
                  {t === 'text' ? 'Texto' : 'Imagem'}
                </button>
              ))}
            </div>
          )}

          {/* Text input */}
          {!result && tab === 'text' && (
            <div className="flex flex-col gap-3">
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
                    className="bg-zinc-50 dark:bg-zinc-800/60 rounded-xl px-4 py-3 border border-zinc-100 dark:border-zinc-700/40"
                  >
                    {editingIndex === i && editBuffer ? (
                      /* ── Edit mode: all changes go to editBuffer, not editedFoods ── */
                      <div className="flex flex-col gap-2.5">
                        {/* Name */}
                        <label className="flex flex-col gap-0.5">
                          <span className="text-[10px] text-zinc-400 uppercase tracking-wide">Nome</span>
                          <input
                            type="text"
                            value={editBuffer.name}
                            onChange={(e) => setEditBuffer((p) => p ? { ...p, name: e.target.value } : null)}
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
                              onChange={(e) => setEditBuffer((p) => p ? { ...p, quantity: e.target.value } : null)}
                              className={inputCls}
                            />
                          </label>
                          <button
                            type="button"
                            onClick={reanalyzeBuffer}
                            disabled={bufferAnalyzing || !editBuffer.name.trim()}
                            className="flex items-center gap-1.5 h-[30px] px-2.5 rounded-lg border border-emerald-200 dark:border-emerald-800/60 bg-emerald-50/80 dark:bg-emerald-950/30 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-all disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap"
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

                        {/* Cancel / Confirm — changes only applied here */}
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
                            onClick={commitEdit}
                            className="flex-1 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 text-[12px] font-semibold text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-all flex items-center justify-center gap-1"
                          >
                            <Check size={12} />
                            Confirmar
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* ── View mode ── */
                      <>
                        <div className="flex items-start justify-between gap-2 mb-1.5">
                          <p className="text-[13px] font-semibold text-zinc-800 dark:text-zinc-100 leading-snug flex-1">
                            {food.name}
                            {food.quantity && (
                              <span className="text-zinc-400 dark:text-zinc-500 font-normal ml-1">
                                · {food.quantity}
                              </span>
                            )}
                          </p>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <span className="text-[13px] font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                              {food.calories} kcal
                            </span>
                            <button
                              type="button"
                              onClick={() => enterEditMode(i)}
                              className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
                              title="Editar"
                            >
                              <Pencil size={11} />
                            </button>
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
              </div>

              <p className="text-[11px] text-zinc-400 dark:text-zinc-500 text-center -mt-1">
                Estimativa aproximada baseada na descrição enviada
              </p>

              <Button onClick={handleConfirm} loading={saving} className="w-full">
                Confirmar e salvar
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
