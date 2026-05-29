'use client';

import { useState, useEffect, type ReactNode, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { signOut } from 'next-auth/react';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import {
  LogOut,
  Save,
  Zap,
  Target,
  ShieldCheck,
  ChevronRight,
  Check,
  Download,
  RefreshCw,
  Pencil,
  Calculator,
  RotateCcw,
  Bell,
  BellOff,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  calculateTMB,
  calculateTDEE,
  calculateTargetCalories,
  calculateAge,
} from '@/lib/calculations';
import type { Profile } from '@/types';

interface ProfileClientProps {
  profile: Profile | null;
  userId: string;
  email: string;
}

const ACTIVITY_OPTIONS = [
  { value: 'sedentary', label: 'Sedentário', desc: 'Pouco exercício', icon: '🛋️' },
  { value: 'moderate', label: 'Moderado', desc: '3–5×/semana', icon: '🚶' },
  { value: 'active', label: 'Ativo', desc: '6–7×/semana', icon: '🏃' },
];

const MULTIPLIERS: Record<string, number> = {
  sedentary: 1.2,
  moderate: 1.55,
  active: 1.725,
};

function SectionCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800/80 rounded-3xl overflow-hidden shadow-[0_1px_3px_0_rgb(0,0,0,0.04)] dark:shadow-none">
      <div className="px-5 py-3.5 border-b border-zinc-50 dark:border-zinc-800/60">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
          {title}
        </p>
      </div>
      <div className="p-5 flex flex-col gap-4">{children}</div>
    </div>
  );
}

export default function ProfileClient({ profile, userId, email }: ProfileClientProps) {
  const router = useRouter();

  // Personal data
  const [fullName, setFullName] = useState(profile?.full_name ?? '');
  const [birthDate, setBirthDate] = useState(profile?.birth_date ?? '');
  const [sex, setSex] = useState<'male' | 'female'>(profile?.sex ?? 'male');

  // Physical metrics
  const [weight, setWeight] = useState(String(profile?.current_weight ?? ''));
  const [height, setHeight] = useState(String(profile?.height_cm ?? ''));
  const [activityLevel, setActivityLevel] = useState<'sedentary' | 'moderate' | 'active'>(
    (profile?.activity_level ?? 'sedentary') as 'sedentary' | 'moderate' | 'active'
  );

  // Caloric goals — TMB initialized in useEffect to preserve manual values
  const [customTmb, setCustomTmb] = useState('');
  const [isTmbManual, setIsTmbManual] = useState(false);
  const [customMeta, setCustomMeta] = useState(String(profile?.target_calories ?? ''));

  // UI states
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<{
    prompt(): Promise<void>;
    userChoice: Promise<{ outcome: string }>;
  } | null>(null);
  const [swStatus, setSwStatus] = useState<string>('');
  const [notifTest, setNotifTest] = useState<'idle' | 'sending' | 'sent' | 'no-device' | 'error'>('idle');

  // Derive initial TMB — prioritizes TDEE-reverse to preserve any previously saved manual value
  useEffect(() => {
    const w = parseFloat(String(profile?.current_weight ?? ''));
    const h = parseFloat(String(profile?.height_cm ?? ''));
    const bd = profile?.birth_date;
    const s = profile?.sex;
    const hasFormulaInputs = !!(w && h && bd && s);

    if (profile?.tdee && profile?.activity_level && MULTIPLIERS[profile.activity_level]) {
      const reversed = Math.round(profile.tdee / MULTIPLIERS[profile.activity_level]);
      setCustomTmb(String(reversed));
      if (hasFormulaInputs) {
        const formulaTmb = calculateTMB(w, h, calculateAge(bd!), s!);
        // Threshold > 3 avoids false positives from rounding
        setIsTmbManual(Math.abs(reversed - formulaTmb) > 3);
      }
      return;
    }

    if (hasFormulaInputs) {
      const tmb = calculateTMB(w, h, calculateAge(bd!), s!);
      setCustomTmb(String(tmb));
      setIsTmbManual(false);
      if (!profile?.target_calories) {
        const tdee = calculateTDEE(tmb, (profile?.activity_level ?? 'sedentary') as 'sedentary' | 'moderate' | 'active');
        setCustomMeta(String(calculateTargetCalories(tdee)));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const checkSW = () => {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker
          .getRegistration()
          .then((reg) => setSwStatus(reg ? 'ativo' : 'não registrado'))
          .catch(() => setSwStatus('erro'));
      } else {
        setSwStatus('não suportado');
      }
    };
    checkSW();
    window.addEventListener('sw-registered', checkSW);
    return () => window.removeEventListener('sw-registered', checkSW);
  }, []);

  useEffect(() => {
    const stored = (window as { __pwaInstallEvent?: typeof installPrompt }).__pwaInstallEvent;
    if (stored) {
      setInstallPrompt(stored);
      return;
    }
    function onReady() {
      const e = (window as { __pwaInstallEvent?: typeof installPrompt }).__pwaInstallEvent;
      if (e) setInstallPrompt(e);
    }
    window.addEventListener('pwa-install-ready', onReady);
    return () => window.removeEventListener('pwa-install-ready', onReady);
  }, []);

  function handleTmbChange(value: string) {
    setCustomTmb(value);
    setIsTmbManual(true);
  }

  function handleRecalculate() {
    const w = parseFloat(weight);
    const h = parseFloat(height);
    if (!w || !h || !birthDate) return;
    const age = calculateAge(birthDate);
    const tmb = calculateTMB(w, h, age, sex);
    const tdee = calculateTDEE(tmb, activityLevel);
    const meta = calculateTargetCalories(tdee);
    setCustomTmb(String(tmb));
    setCustomMeta(String(meta));
    setIsTmbManual(false);
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    await fetch('/api/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName,
        birthDate,
        weight,
        height,
        sex,
        activityLevel,
        customTmb: customTmb ? Number(customTmb) : null,
        customTargetCalories: customMeta ? Number(customMeta) : null,
      }),
    });
    setLoading(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
    router.refresh();
  }

  async function handleNotifTest() {
    setNotifTest('sending');
    try {
      const res = await fetch('/api/notifications/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Teste de notificação 🔔',
          body: 'Tudo certo! As notificações push estão funcionando.',
          tag: 'hc-test',
          url: '/dashboard',
        }),
      });
      const data = await res.json();
      if (data.sent > 0) {
        setNotifTest('sent');
      } else {
        setNotifTest('no-device');
      }
    } catch {
      setNotifTest('error');
    }
    setTimeout(() => setNotifTest('idle'), 4000);
  }

  async function handleSignOut() {
    await signOut({ callbackUrl: '/login' });
  }

  const initials = (profile?.full_name ?? email)
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');

  const tmbNum = Number(customTmb);
  const metaNum = Number(customMeta);
  const tdeePreview = tmbNum ? calculateTDEE(tmbNum, activityLevel) : null;

  return (
    <div className="flex flex-col gap-4 pt-6 pb-8 animate-fade-in">
      {/* Identity header */}
      <div className="flex items-center gap-4 px-1">
        <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center flex-shrink-0 shadow-md shadow-emerald-600/20">
          <span className="text-lg font-bold text-white tracking-tight">{initials}</span>
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 leading-tight truncate tracking-tight">
            {profile?.full_name || 'Meu perfil'}
          </h1>
          <p className="text-[13px] text-zinc-400 dark:text-zinc-500 truncate mt-0.5">{email}</p>
        </div>
      </div>

      {/* Stats bar */}
      {(tdeePreview || metaNum || profile?.tdee || profile?.target_calories) ? (
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-100/80 dark:border-amber-900/30 rounded-2xl p-4">
            <div className="flex items-center gap-1.5 mb-2.5">
              <Zap size={12} className="text-amber-500" />
              <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
                TDEE
              </p>
            </div>
            <p className="text-2xl font-bold tabular-nums text-zinc-900 dark:text-zinc-100 leading-none tracking-tight">
              {(tdeePreview ?? profile?.tdee ?? 0).toLocaleString('pt-BR')}
            </p>
            <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-1">kcal/dia</p>
          </div>
          <div className="bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-100/80 dark:border-emerald-900/30 rounded-2xl p-4">
            <div className="flex items-center gap-1.5 mb-2.5">
              <Target size={12} className="text-emerald-600 dark:text-emerald-400" />
              <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
                Meta
              </p>
            </div>
            <p className="text-2xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400 leading-none tracking-tight">
              {(metaNum || profile?.target_calories || 0).toLocaleString('pt-BR')}
            </p>
            <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-1">kcal/dia</p>
          </div>
        </div>
      ) : null}

      {/* Form */}
      <form onSubmit={handleSave} className="flex flex-col gap-3">
        {/* Dados pessoais */}
        <SectionCard title="Dados pessoais">
          <Input
            label="Nome completo"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
          />
          <Input
            label="Data de nascimento"
            type="date"
            value={birthDate}
            onChange={(e) => setBirthDate(e.target.value)}
          />

          <div className="flex flex-col gap-2.5">
            <label className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest">
              Sexo biológico
            </label>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  { value: 'male', label: 'Masculino', icon: '♂' },
                  { value: 'female', label: 'Feminino', icon: '♀' },
                ] as const
              ).map((opt) => {
                const isSelected = sex === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setSex(opt.value)}
                    className={cn(
                      'flex items-center gap-2.5 px-3.5 h-11 rounded-xl border transition-all duration-150 active:scale-[0.97]',
                      isSelected
                        ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/60 text-emerald-700 dark:text-emerald-400'
                        : 'bg-zinc-50/80 dark:bg-zinc-800/40 border-zinc-200/80 dark:border-zinc-700/40 text-zinc-600 dark:text-zinc-400 hover:border-zinc-300 dark:hover:border-zinc-600'
                    )}
                  >
                    <span className="text-base leading-none">{opt.icon}</span>
                    <span className="text-[13px] font-medium flex-1 text-left">{opt.label}</span>
                    {isSelected && (
                      <Check size={13} className="text-emerald-600 dark:text-emerald-400" strokeWidth={2.5} />
                    )}
                  </button>
                );
              })}
            </div>
            <p className="text-[10px] text-zinc-400 dark:text-zinc-500">Usado no cálculo da TMB (fórmula de Harris-Benedict).</p>
          </div>
        </SectionCard>

        {/* Métricas físicas */}
        <SectionCard title="Métricas físicas">
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Peso (kg)"
              type="number"
              step="0.1"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
            />
            <Input
              label="Altura (cm)"
              type="number"
              value={height}
              onChange={(e) => setHeight(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-2.5">
            <label className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest">
              Nível de atividade
            </label>
            <div className="grid grid-cols-3 gap-2">
              {ACTIVITY_OPTIONS.map((opt) => {
                const isSelected = activityLevel === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setActivityLevel(opt.value as typeof activityLevel)}
                    className={cn(
                      'flex flex-col items-center gap-2 px-2 py-3 rounded-xl border text-center transition-all duration-150 active:scale-[0.97]',
                      isSelected
                        ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/60'
                        : 'bg-zinc-50/80 dark:bg-zinc-800/40 border-zinc-200/80 dark:border-zinc-700/40 hover:border-zinc-300 dark:hover:border-zinc-600'
                    )}
                  >
                    <span className="text-xl leading-none">{opt.icon}</span>
                    <div>
                      <p
                        className={cn(
                          'text-[11px] font-semibold leading-none',
                          isSelected
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : 'text-zinc-700 dark:text-zinc-300'
                        )}
                      >
                        {opt.label}
                      </p>
                      <p className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-0.5">{opt.desc}</p>
                    </div>
                    {isSelected && (
                      <div className="h-3.5 w-3.5 rounded-full bg-emerald-600 dark:bg-emerald-500 flex items-center justify-center">
                        <Check size={7} className="text-white" strokeWidth={3} />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </SectionCard>

        {/* Metas calóricas */}
        <SectionCard title="Metas calóricas">
          {/* TMB field */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest">
                TMB (kcal/dia)
              </label>
              <div className="flex items-center gap-2">
                {isTmbManual ? (
                  <>
                    <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400 border border-amber-100 dark:border-amber-900/40">
                      <Pencil size={8} />
                      Manual
                    </span>
                    <button
                      type="button"
                      onClick={handleRecalculate}
                      className="flex items-center gap-1 text-[10px] font-medium text-zinc-400 dark:text-zinc-500 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
                    >
                      <RotateCcw size={9} />
                      Usar automático
                    </button>
                  </>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900/40">
                    <Calculator size={8} />
                    Automático
                  </span>
                )}
              </div>
            </div>

            <input
              type="number"
              value={customTmb}
              onChange={(e) => handleTmbChange(e.target.value)}
              min={500}
              max={5000}
              className={cn(
                'h-11 w-full rounded-xl px-3.5 text-sm tabular-nums transition-all duration-150',
                'focus:outline-none focus:ring-2',
                isTmbManual
                  ? 'bg-amber-50/50 dark:bg-amber-950/10 border border-amber-200/80 dark:border-amber-800/30 text-zinc-900 dark:text-zinc-100 focus:ring-amber-400/25 focus:border-amber-400/80'
                  : 'bg-zinc-50/80 dark:bg-zinc-800/50 border border-zinc-200/80 dark:border-zinc-700/50 text-zinc-900 dark:text-zinc-100 focus:ring-emerald-500/25 focus:border-emerald-400/80'
              )}
            />

            <p className="text-[10px] text-zinc-400 dark:text-zinc-500">
              {isTmbManual
                ? 'Valor manual salvo — o sistema não irá sobrescrevê-lo automaticamente.'
                : 'Calculado pela fórmula de Harris-Benedict. Edite o campo para definir um valor manual.'}
            </p>
          </div>

          {/* TDEE preview — read-only */}
          {tdeePreview ? (
            <div className="flex items-center justify-between bg-zinc-50/80 dark:bg-zinc-800/40 rounded-xl px-3.5 py-3 border border-zinc-100 dark:border-zinc-700/40">
              <div className="flex items-center gap-2">
                <Zap size={13} className="text-amber-500" />
                <span className="text-[13px] text-zinc-500 dark:text-zinc-400">
                  TDEE calculado
                </span>
              </div>
              <span className="text-sm font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
                {tdeePreview.toLocaleString('pt-BR')} kcal
              </span>
            </div>
          ) : null}

          {/* Meta calórica */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest">
                Meta calórica (kcal/dia)
              </span>
              {!isTmbManual && (
                <button
                  type="button"
                  onClick={handleRecalculate}
                  className="flex items-center gap-1 text-[10px] font-medium text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 transition-colors"
                >
                  <RefreshCw size={9} />
                  Recalcular
                </button>
              )}
            </div>
            <input
              type="number"
              value={customMeta}
              onChange={(e) => setCustomMeta(e.target.value)}
              min={1200}
              max={9999}
              className="h-11 w-full rounded-xl px-3.5 text-sm tabular-nums bg-zinc-50/80 dark:bg-zinc-800/50 border border-zinc-200/80 dark:border-zinc-700/50 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/25 focus:border-emerald-400/80 transition-all duration-150"
            />
            <p className="text-[10px] text-zinc-400 dark:text-zinc-500">Mínimo de 1.200 kcal/dia.</p>
          </div>
        </SectionCard>

        <Button
          type="submit"
          loading={loading}
          variant={saved ? 'secondary' : 'primary'}
          className="w-full"
        >
          {saved ? <Check size={14} /> : <Save size={14} />}
          {saved ? 'Salvo com sucesso!' : 'Salvar alterações'}
        </Button>
      </form>

      {/* Notificações */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800/80 rounded-3xl overflow-hidden shadow-[0_1px_3px_0_rgb(0,0,0,0.04)] dark:shadow-none">
        <div className="px-5 py-3.5 border-b border-zinc-50 dark:border-zinc-800/60">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
            Notificações
          </p>
        </div>
        <div className="p-3">
          <button
            type="button"
            onClick={handleNotifTest}
            disabled={notifTest === 'sending'}
            className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl hover:bg-teal-50 dark:hover:bg-teal-950/20 transition-colors group disabled:opacity-60"
          >
            <div className="h-8 w-8 rounded-lg bg-teal-50 dark:bg-teal-950/30 flex items-center justify-center flex-shrink-0">
              {notifTest === 'sending'
                ? <Loader2 size={14} className="text-teal-500 animate-spin" />
                : notifTest === 'sent'
                  ? <Bell size={14} className="text-teal-500" />
                  : <BellOff size={14} className="text-teal-500" />
              }
            </div>
            <div className="flex-1 text-left">
              <p className="text-[13px] font-medium text-zinc-700 dark:text-zinc-300">
                Testar notificação push
              </p>
              {notifTest !== 'idle' && (
                <p className={cn(
                  'text-[11px] mt-0.5',
                  notifTest === 'sent' ? 'text-teal-600 dark:text-teal-400' :
                  notifTest === 'no-device' ? 'text-amber-600 dark:text-amber-400' :
                  notifTest === 'error' ? 'text-red-500' :
                  'text-zinc-400'
                )}>
                  {notifTest === 'sending' && 'Enviando…'}
                  {notifTest === 'sent' && '✓ Notificação enviada com sucesso!'}
                  {notifTest === 'no-device' && 'Nenhum dispositivo registrado — ative as notificações no dashboard.'}
                  {notifTest === 'error' && 'Falha ao enviar — verifique as configurações do servidor.'}
                </p>
              )}
            </div>
            <ChevronRight
              size={13}
              className="text-zinc-300 dark:text-zinc-600 group-hover:text-zinc-400 transition-colors flex-shrink-0"
            />
          </button>
        </div>
      </div>

      {/* Conta */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800/80 rounded-3xl overflow-hidden shadow-[0_1px_3px_0_rgb(0,0,0,0.04)] dark:shadow-none">
        <div className="px-5 py-3.5 border-b border-zinc-50 dark:border-zinc-800/60 flex items-center justify-between">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
            Conta
          </p>
          {swStatus && (
            <span
              className={cn(
                'text-[10px] font-medium px-2 py-0.5 rounded-full',
                swStatus === 'ativo'
                  ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400'
                  : 'bg-red-50 text-red-500 dark:bg-red-950/30 dark:text-red-400'
              )}
            >
              SW: {swStatus}
            </span>
          )}
        </div>
        <div className="p-3">
          {installPrompt && (
            <button
              onClick={async () => {
                await installPrompt.prompt();
                const { outcome } = await installPrompt.userChoice;
                if (outcome === 'accepted') {
                  setInstallPrompt(null);
                  (window as { __pwaInstallEvent?: null }).__pwaInstallEvent = null;
                }
              }}
              className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl hover:bg-emerald-50 dark:hover:bg-emerald-950/20 transition-colors group"
            >
              <div className="h-8 w-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 flex items-center justify-center flex-shrink-0">
                <Download size={14} className="text-emerald-600 dark:text-emerald-400" />
              </div>
              <span className="text-[13px] font-medium text-emerald-700 dark:text-emerald-400 flex-1 text-left">
                Instalar app
              </span>
              <ChevronRight
                size={13}
                className="text-zinc-300 dark:text-zinc-600 group-hover:text-zinc-400 transition-colors"
              />
            </button>
          )}
          <Link
            href="/admin"
            className="flex items-center gap-3 px-4 py-3.5 rounded-xl hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-colors group"
          >
            <div className="h-8 w-8 rounded-lg bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center flex-shrink-0">
              <ShieldCheck size={14} className="text-zinc-500 dark:text-zinc-400" />
            </div>
            <span className="text-[13px] font-medium text-zinc-700 dark:text-zinc-300 flex-1">
              Gerenciar usuários
            </span>
            <ChevronRight
              size={13}
              className="text-zinc-300 dark:text-zinc-600 group-hover:text-zinc-400 transition-colors"
            />
          </Link>
          <button
            onClick={handleSignOut}
            className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors group"
          >
            <div className="h-8 w-8 rounded-lg bg-red-50 dark:bg-red-950/30 flex items-center justify-center flex-shrink-0">
              <LogOut size={14} className="text-red-500" />
            </div>
            <span className="text-[13px] font-medium text-red-500 dark:text-red-400">
              Sair da conta
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
