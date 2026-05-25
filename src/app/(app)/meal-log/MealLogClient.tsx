'use client';

import { useState, useRef, useEffect } from 'react';
import { Camera, ImageIcon, Type, Upload, X, Loader2, CheckCircle2, ChevronDown, ChevronUp, History } from 'lucide-react';
import { cn } from '@/lib/utils';
import Button from '@/components/ui/Button';
import type { FoodAnalysis, MealHistoryItem } from '@/types';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

type Tab = 'text' | 'image';

interface EditableFood extends FoodAnalysis {
  _key: string;
}

interface Totals {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

async function compressImage(file: File): Promise<{ base64: string; thumbnail: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);

      const MAX_DIM = 800;
      const scale = Math.min(1, MAX_DIM / Math.max(img.width, img.height));
      const fullCanvas = document.createElement('canvas');
      fullCanvas.width = Math.round(img.width * scale);
      fullCanvas.height = Math.round(img.height * scale);
      fullCanvas.getContext('2d')!.drawImage(img, 0, 0, fullCanvas.width, fullCanvas.height);
      const base64 = fullCanvas.toDataURL('image/jpeg', 0.75).split(',')[1];

      const THUMB_DIM = 160;
      const thumbScale = Math.min(1, THUMB_DIM / Math.max(img.width, img.height));
      const thumbCanvas = document.createElement('canvas');
      thumbCanvas.width = Math.round(img.width * thumbScale);
      thumbCanvas.height = Math.round(img.height * thumbScale);
      thumbCanvas.getContext('2d')!.drawImage(img, 0, 0, thumbCanvas.width, thumbCanvas.height);
      const thumbnail = thumbCanvas.toDataURL('image/jpeg', 0.6);

      resolve({ base64, thumbnail, mimeType: 'image/jpeg' });
    };

    img.onerror = reject;
    img.src = url;
  });
}

function MacroCard({ label, value, unit, bg, text }: { label: string; value: number; unit: string; bg: string; text: string }) {
  return (
    <div className={cn('rounded-2xl p-3 flex flex-col gap-0.5', bg)}>
      <span className={cn('text-xl font-bold tabular-nums leading-tight', text)}>{Math.round(value)}</span>
      <span className={cn('text-[10px] font-medium', text, 'opacity-70')}>{unit}</span>
      <span className={cn('text-[10px] font-semibold', text)}>{label}</span>
    </div>
  );
}

function HistoryCard({ item }: { item: MealHistoryItem }) {
  const [open, setOpen] = useState(false);
  const parsed = item.parsed_json;

  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden">
      <button onClick={() => setOpen((v) => !v)} className="w-full flex items-center gap-3 p-4 text-left">
        {item.image_url ? (
          <img
            src={item.image_url}
            alt="Refeição"
            className="h-12 w-12 rounded-xl object-cover flex-shrink-0 bg-zinc-100 dark:bg-zinc-800"
          />
        ) : (
          <div className="h-12 w-12 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center flex-shrink-0">
            <Type size={18} className="text-zinc-400" />
          </div>
        )}

        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">
            {item.raw_text
              ? item.raw_text.length > 55
                ? item.raw_text.slice(0, 55) + '…'
                : item.raw_text
              : `${parsed.foods?.length ?? 0} alimento${(parsed.foods?.length ?? 0) !== 1 ? 's' : ''} identificado${(parsed.foods?.length ?? 0) !== 1 ? 's' : ''}`}
          </p>
          <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">
            {formatDistanceToNow(new Date(item.created_at), { locale: ptBR, addSuffix: true })}
          </p>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-sm font-bold tabular-nums text-zinc-900 dark:text-zinc-100">
              {item.total_calories} kcal
            </span>
            <span className="text-xs text-zinc-400">
              P:{Math.round(item.total_protein ?? 0)}g · C:{Math.round(item.total_carbs ?? 0)}g · G:{Math.round(item.total_fat ?? 0)}g
            </span>
          </div>
        </div>

        {open ? (
          <ChevronUp size={16} className="text-zinc-400 flex-shrink-0" />
        ) : (
          <ChevronDown size={16} className="text-zinc-400 flex-shrink-0" />
        )}
      </button>

      {open && parsed.foods?.length > 0 && (
        <div className="border-t border-zinc-100 dark:border-zinc-800 px-4 py-3 flex flex-col gap-2">
          {parsed.foods.map((food, i) => (
            <div key={i} className="flex items-center justify-between gap-2">
              <div className="flex-1 min-w-0">
                <span className="text-sm text-zinc-700 dark:text-zinc-300">{food.name}</span>
                {food.quantity && (
                  <span className="text-xs text-zinc-400 ml-1.5">{food.quantity}</span>
                )}
              </div>
              <span className="text-sm font-medium tabular-nums text-zinc-500 dark:text-zinc-400 flex-shrink-0">
                {food.calories} kcal
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function MealLogClient({ initialHistory }: { initialHistory: MealHistoryItem[] }) {
  const [tab, setTab] = useState<Tab>('text');
  const [text, setText] = useState('');
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageData, setImageData] = useState<{ base64: string; thumbnail: string; mimeType: string } | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [foods, setFoods] = useState<EditableFood[]>([]);
  const [hasResult, setHasResult] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [history, setHistory] = useState<MealHistoryItem[]>(initialHistory);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const totals: Totals = foods.reduce(
    (acc, f) => ({
      calories: acc.calories + (Number(f.calories) || 0),
      protein: acc.protein + (Number(f.protein) || 0),
      carbs: acc.carbs + (Number(f.carbs) || 0),
      fat: acc.fat + (Number(f.fat) || 0),
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${ta.scrollHeight}px`;
  }, [text]);

  function clearResult() {
    setFoods([]);
    setHasResult(false);
    setError(null);
    setSaved(false);
  }

  function switchTab(t: Tab) {
    setTab(t);
    clearResult();
  }

  async function processFile(file: File) {
    if (!file.type.startsWith('image/')) {
      setError('Formato inválido. Use JPG, PNG ou WebP.');
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setError('Imagem muito grande. Máximo 20MB.');
      return;
    }
    setError(null);
    clearResult();
    setImagePreview(URL.createObjectURL(file));
    setImageData(null);
    try {
      const data = await compressImage(file);
      setImageData(data);
    } catch {
      setError('Erro ao processar imagem.');
    }
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    e.target.value = '';
  }

  function removeImage() {
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImagePreview(null);
    setImageData(null);
    clearResult();
  }

  async function analyze() {
    setAnalyzing(true);
    setError(null);
    clearResult();

    try {
      const body =
        tab === 'text'
          ? { type: 'text', text }
          : { type: 'image', imageBase64: imageData!.base64, mimeType: imageData!.mimeType };

      const res = await fetch('/api/meal-analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Erro na análise');

      setFoods(
        (data.foods ?? []).map((f: FoodAnalysis, i: number) => ({ ...f, _key: String(i) }))
      );
      setHasResult(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido');
    } finally {
      setAnalyzing(false);
    }
  }

  async function save() {
    setSaving(true);
    setError(null);

    try {
      const cleanFoods = foods.map(({ _key: _, ...f }) => f);
      const body = {
        input_type: tab,
        raw_text: tab === 'text' ? text : null,
        image_url: tab === 'image' && imageData ? imageData.thumbnail : null,
        parsed_json: {
          foods: cleanFoods,
          totalCalories: Math.round(totals.calories),
          totalProtein: Math.round(totals.protein),
          totalCarbs: Math.round(totals.carbs),
          totalFat: Math.round(totals.fat),
        },
        total_calories: Math.round(totals.calories),
        total_protein: Math.round(totals.protein),
        total_carbs: Math.round(totals.carbs),
        total_fat: Math.round(totals.fat),
      };

      const res = await fetch('/api/meal-history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Erro ao salvar');

      setHistory((prev) => [data, ...prev]);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  }

  function startNew() {
    setText('');
    removeImage();
    clearResult();
  }

  function updateFood(key: string, field: keyof FoodAnalysis, raw: string) {
    setFoods((prev) =>
      prev.map((f) =>
        f._key === key
          ? {
              ...f,
              [field]: field === 'name' || field === 'quantity' ? raw : Number(raw) || 0,
            }
          : f
      )
    );
  }

  const canAnalyze = tab === 'text' ? text.trim().length > 0 : imageData !== null;

  return (
    <div className="flex flex-col gap-5 pt-8 pb-4 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">Analisar Refeição</h1>
        <p className="text-sm text-zinc-400 dark:text-zinc-500">IA identifica alimentos e macros nutricionais</p>
      </div>

      {/* Tab switcher */}
      <div className="grid grid-cols-2 gap-1 bg-zinc-100 dark:bg-zinc-800 rounded-2xl p-1">
        {(['text', 'image'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => switchTab(t)}
            className={cn(
              'flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-medium transition-all duration-200',
              tab === t
                ? 'bg-white dark:bg-zinc-900 shadow-sm text-zinc-900 dark:text-zinc-100'
                : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'
            )}
          >
            {t === 'text' ? <Type size={15} /> : <Camera size={15} />}
            {t === 'text' ? 'Texto' : 'Imagem'}
          </button>
        ))}
      </div>

      {/* Text mode */}
      {tab === 'text' && (
        <div className="relative bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-sm dark:shadow-none">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => {
              setText(e.target.value.slice(0, 500));
              clearResult();
            }}
            placeholder="Ex: arroz, feijão e frango grelhado"
            rows={3}
            className="w-full resize-none bg-transparent px-4 pt-4 pb-10 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none leading-relaxed"
          />
          <span className="absolute bottom-3 right-4 text-xs text-zinc-300 dark:text-zinc-600 select-none">
            {text.length}/500
          </span>
        </div>
      )}

      {/* Image mode — upload zone */}
      {tab === 'image' && !imagePreview && (
        <div
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const file = e.dataTransfer.files?.[0];
            if (file) processFile(file);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onClick={() => fileInputRef.current?.click()}
          className={cn(
            'flex flex-col items-center gap-4 border-2 border-dashed rounded-2xl p-8 cursor-pointer transition-all duration-200',
            dragOver
              ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/10'
              : 'border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 hover:border-blue-300 dark:hover:border-blue-600 hover:bg-blue-50/50 dark:hover:bg-blue-900/5'
          )}
        >
          <div className="h-16 w-16 rounded-2xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
            <Upload size={28} className="text-zinc-400" />
          </div>
          <div className="text-center">
            <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Adicionar foto da refeição</p>
            <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">JPG, PNG, WebP · Máx 20MB</p>
            <p className="text-xs text-zinc-400 dark:text-zinc-500">ou arraste aqui</p>
          </div>
          <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => {
                fileInputRef.current?.setAttribute('capture', 'environment');
                fileInputRef.current?.click();
              }}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-colors"
            >
              <Camera size={13} />
              Câmera
            </button>
            <button
              type="button"
              onClick={() => {
                fileInputRef.current?.removeAttribute('capture');
                fileInputRef.current?.click();
              }}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 text-xs font-semibold transition-colors"
            >
              <ImageIcon size={13} />
              Galeria
            </button>
          </div>
        </div>
      )}

      {/* Image mode — preview */}
      {tab === 'image' && imagePreview && (
        <div className="relative rounded-2xl overflow-hidden bg-zinc-100 dark:bg-zinc-800 shadow-sm dark:shadow-none">
          <img
            src={imagePreview}
            alt="Preview da refeição"
            className="w-full max-h-72 object-cover"
          />
          <div className="absolute top-3 right-3 flex gap-2">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="h-8 w-8 rounded-full bg-black/50 backdrop-blur-sm text-white flex items-center justify-center transition-opacity hover:opacity-80"
              title="Trocar imagem"
            >
              <Camera size={14} />
            </button>
            <button
              onClick={removeImage}
              className="h-8 w-8 rounded-full bg-black/50 backdrop-blur-sm text-white flex items-center justify-center transition-opacity hover:opacity-80"
              title="Remover imagem"
            >
              <X size={14} />
            </button>
          </div>
          {!imageData && (
            <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
              <Loader2 size={28} className="text-white animate-spin" />
            </div>
          )}
        </div>
      )}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        onChange={handleFileInput}
      />

      {/* Error banner */}
      {error && (
        <div className="rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Analyze button */}
      {!hasResult && !analyzing && (
        <Button
          onClick={analyze}
          disabled={!canAnalyze}
          size="lg"
          className="w-full"
        >
          {tab === 'text' ? 'Analisar texto' : 'Analisar imagem'}
        </Button>
      )}

      {/* Skeleton while analyzing */}
      {analyzing && (
        <div className="flex flex-col gap-3 animate-pulse pointer-events-none">
          <div className="grid grid-cols-4 gap-2">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-24 rounded-2xl bg-zinc-200 dark:bg-zinc-800" />
            ))}
          </div>
          <div className="h-40 rounded-2xl bg-zinc-200 dark:bg-zinc-800" />
        </div>
      )}

      {/* Analysis result */}
      {hasResult && !analyzing && (
        <div className="flex flex-col gap-4 animate-slide-up">
          {/* Macro summary cards */}
          <div className="grid grid-cols-4 gap-2">
            <MacroCard
              label="Calorias"
              value={totals.calories}
              unit="kcal"
              bg="bg-orange-50 dark:bg-orange-900/20"
              text="text-orange-700 dark:text-orange-300"
            />
            <MacroCard
              label="Proteína"
              value={totals.protein}
              unit="g"
              bg="bg-red-50 dark:bg-red-900/20"
              text="text-red-700 dark:text-red-300"
            />
            <MacroCard
              label="Carbos"
              value={totals.carbs}
              unit="g"
              bg="bg-amber-50 dark:bg-amber-900/20"
              text="text-amber-700 dark:text-amber-300"
            />
            <MacroCard
              label="Gordura"
              value={totals.fat}
              unit="g"
              bg="bg-emerald-50 dark:bg-emerald-900/20"
              text="text-emerald-700 dark:text-emerald-300"
            />
          </div>

          {/* Editable food list */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-sm dark:shadow-none">
            <div className="px-4 py-3 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
              <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Alimentos identificados</span>
              <span className="text-xs text-zinc-400">{foods.length} item{foods.length !== 1 ? 's' : ''}</span>
            </div>

            {foods.map((food) => (
              <div
                key={food._key}
                className="px-4 py-3 border-b last:border-0 border-zinc-100 dark:border-zinc-800"
              >
                <div className="flex items-start justify-between gap-2 mb-2.5">
                  <input
                    value={food.name}
                    onChange={(e) => updateFood(food._key, 'name', e.target.value)}
                    className="flex-1 text-sm font-semibold text-zinc-900 dark:text-zinc-100 bg-transparent focus:outline-none focus:underline underline-offset-2 decoration-dotted"
                  />
                  <input
                    value={food.quantity}
                    onChange={(e) => updateFood(food._key, 'quantity', e.target.value)}
                    className="w-14 text-xs text-right text-zinc-400 dark:text-zinc-500 bg-transparent focus:outline-none focus:underline underline-offset-2 decoration-dotted"
                  />
                </div>
                <div className="grid grid-cols-4 gap-1">
                  {(
                    [
                      { field: 'calories', label: 'kcal' },
                      { field: 'protein', label: 'prot' },
                      { field: 'carbs', label: 'carb' },
                      { field: 'fat', label: 'gord' },
                    ] as { field: keyof FoodAnalysis; label: string }[]
                  ).map(({ field, label }) => (
                    <div key={field} className="flex flex-col gap-0.5">
                      <span className="text-[9px] uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                        {label}
                      </span>
                      <input
                        type="number"
                        min="0"
                        value={food[field] as number}
                        onChange={(e) => updateFood(food._key, field, e.target.value)}
                        className="w-full text-sm font-semibold tabular-nums text-zinc-700 dark:text-zinc-300 bg-transparent focus:outline-none focus:underline underline-offset-2 decoration-dotted"
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Save / New analysis */}
          {saved ? (
            <div className="flex flex-col gap-2">
              <div className="h-12 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 flex items-center justify-center gap-2 text-emerald-600 dark:text-emerald-400 text-sm font-semibold">
                <CheckCircle2 size={18} />
                Salvo no histórico!
              </div>
              <Button variant="secondary" onClick={startNew} className="w-full">
                Nova análise
              </Button>
            </div>
          ) : (
            <div className="flex gap-2">
              <Button variant="secondary" onClick={clearResult} className="flex-1">
                Cancelar
              </Button>
              <Button onClick={save} loading={saving} className="flex-1">
                Salvar refeição
              </Button>
            </div>
          )}
        </div>
      )}

      {/* History */}
      {history.length > 0 && (
        <div className="flex flex-col gap-3 mt-1">
          <div className="flex items-center gap-2">
            <History size={15} className="text-zinc-400 dark:text-zinc-500" />
            <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Histórico de análises</h2>
          </div>
          {history.map((item) => (
            <HistoryCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}
