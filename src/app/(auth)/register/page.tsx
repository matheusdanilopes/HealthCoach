'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import ThemeToggle from '@/components/ui/ThemeToggle';
import { ChevronRight, ChevronLeft, Check } from 'lucide-react';
import { LogoIcon } from '@/components/ui/Logo';
import { cn } from '@/lib/utils';

const ACTIVITY_OPTIONS = [
  { value: 'sedentary', label: 'Sedentário', desc: 'Pouco ou nenhum exercício' },
  { value: 'moderate',  label: 'Moderado',   desc: 'Exercício 3–5x por semana' },
  { value: 'active',    label: 'Ativo',       desc: 'Exercício intenso 6–7x por semana' },
];

export default function RegisterPage() {
  const router = useRouter();
  const [step, setStep] = useState<'account' | 'profile'>('account');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [sex, setSex] = useState<'male' | 'female'>('male');
  const [weight, setWeight] = useState('');
  const [height, setHeight] = useState('');
  const [activityLevel, setActivityLevel] = useState<'sedentary' | 'moderate' | 'active'>('sedentary');

  async function handleAccountStep(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 6) { setError('Senha deve ter pelo menos 6 caracteres.'); return; }
    setError('');
    setStep('profile');
  }

  async function handleProfileStep(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const res = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, fullName, birthDate, sex, weight, height, activityLevel }),
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? 'Erro ao criar conta.');
      setLoading(false);
      return;
    }
    const result = await signIn('credentials', { email, password, redirect: false });
    if (result?.error) {
      setError('Conta criada, mas erro ao entrar. Tente fazer login.');
      setLoading(false);
      return;
    }
    router.push('/dashboard');
    router.refresh();
  }

  const steps = ['account', 'profile'] as const;
  const currentStepIndex = steps.indexOf(step);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-[#f8f8f8] dark:bg-[#0a0a0b] py-10">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-[380px] animate-fade-in">
        {/* Brand */}
        <div className="flex flex-col items-center gap-3 mb-7">
          <div className="h-[60px] w-[60px] rounded-[20px] bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center shadow-xl shadow-emerald-600/25">
            <LogoIcon size={30} />
          </div>
          <div className="text-center">
            <h1 className="text-[22px] font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">
              HealthCoach AI
            </h1>
            <p className="text-[13px] text-zinc-400 dark:text-zinc-500 mt-1">
              Crie sua conta em 2 passos
            </p>
          </div>

          {/* Step indicator */}
          <div className="flex items-center gap-2 mt-1">
            {steps.map((s, i) => (
              <div
                key={s}
                className={cn(
                  'h-1 rounded-full transition-all duration-300',
                  i === currentStepIndex
                    ? 'w-8 bg-emerald-600'
                    : i < currentStepIndex
                      ? 'w-5 bg-emerald-400 dark:bg-emerald-600'
                      : 'w-5 bg-zinc-200 dark:bg-zinc-700'
                )}
              />
            ))}
          </div>
        </div>

        {/* Card */}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800/80 rounded-2xl shadow-[0_2px_8px_0_rgb(0,0,0,0.06)] dark:shadow-none p-6">
          {step === 'account' ? (
            <>
              <div className="mb-5">
                <h2 className="text-[17px] font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">
                  Criar conta
                </h2>
                <p className="text-[13px] text-zinc-400 dark:text-zinc-500 mt-1">
                  Passo 1 de 2 — Acesso
                </p>
              </div>
              <form onSubmit={handleAccountStep} className="flex flex-col gap-4">
                <Input
                  label="Nome completo"
                  placeholder="Seu nome"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                />
                <Input
                  label="Email"
                  type="email"
                  placeholder="seu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
                <Input
                  label="Senha"
                  type="password"
                  placeholder="Mínimo 6 caracteres"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  error={error}
                  autoComplete="new-password"
                />
                <Button type="submit" className="w-full mt-1 gap-1.5">
                  Continuar
                  <ChevronRight size={14} />
                </Button>
              </form>
            </>
          ) : (
            <>
              <button
                onClick={() => setStep('account')}
                className="flex items-center gap-1 text-[12px] text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 mb-6 transition-colors"
              >
                <ChevronLeft size={13} />
                Voltar
              </button>
              <div className="mb-5">
                <h2 className="text-[17px] font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">
                  Perfil de saúde
                </h2>
                <p className="text-[13px] text-zinc-400 dark:text-zinc-500 mt-1">
                  Passo 2 de 2 — Anamnese
                </p>
              </div>

              <form onSubmit={handleProfileStep} className="flex flex-col gap-4">
                <Input
                  label="Data de nascimento"
                  type="date"
                  value={birthDate}
                  onChange={(e) => setBirthDate(e.target.value)}
                  required
                />

                <div className="flex flex-col gap-3">
                  <label className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest">
                    Sexo biológico
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    {[{ value: 'male', label: 'Masculino' }, { value: 'female', label: 'Feminino' }].map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setSex(opt.value as 'male' | 'female')}
                        className={cn(
                          'h-12 rounded-xl border text-[13px] font-medium transition-all duration-150',
                          sex === opt.value
                            ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-700/60 text-emerald-700 dark:text-emerald-400'
                            : 'bg-zinc-50/80 dark:bg-zinc-800/40 border-zinc-200/80 dark:border-zinc-700/40 text-zinc-600 dark:text-zinc-400 hover:border-zinc-300 dark:hover:border-zinc-600'
                        )}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <Input
                    label="Peso (kg)"
                    type="number"
                    step="0.1"
                    placeholder="70"
                    value={weight}
                    onChange={(e) => setWeight(e.target.value)}
                    required
                    min="30"
                    max="300"
                  />
                  <Input
                    label="Altura (cm)"
                    type="number"
                    placeholder="170"
                    value={height}
                    onChange={(e) => setHeight(e.target.value)}
                    required
                    min="100"
                    max="250"
                  />
                </div>

                <div className="flex flex-col gap-3">
                  <label className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest">
                    Nível de atividade
                  </label>
                  <div className="flex flex-col gap-2.5">
                    {ACTIVITY_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setActivityLevel(opt.value as typeof activityLevel)}
                        className={cn(
                          'flex items-center justify-between px-5 py-4 rounded-xl border text-left transition-all duration-150',
                          activityLevel === opt.value
                            ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/60'
                            : 'bg-zinc-50/80 dark:bg-zinc-800/40 border-zinc-200/80 dark:border-zinc-700/40 hover:border-zinc-300 dark:hover:border-zinc-600'
                        )}
                      >
                        <div>
                          <p className={cn(
                            'text-[13px] font-medium leading-none mb-1',
                            activityLevel === opt.value
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : 'text-zinc-700 dark:text-zinc-300'
                          )}>
                            {opt.label}
                          </p>
                          <p className="text-[11px] text-zinc-400 dark:text-zinc-500">{opt.desc}</p>
                        </div>
                        {activityLevel === opt.value && (
                          <div className="h-4 w-4 rounded-full bg-emerald-600 dark:bg-emerald-500 flex items-center justify-center flex-shrink-0">
                            <Check size={8} className="text-white" strokeWidth={3} />
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                {error && (
                  <div className="flex items-center gap-2 bg-red-50 dark:bg-red-950/30 border border-red-100 dark:border-red-900/40 rounded-xl px-4 py-3">
                    <span className="h-1.5 w-1.5 rounded-full bg-red-500 flex-shrink-0" />
                    <p className="text-[13px] text-red-600 dark:text-red-400">{error}</p>
                  </div>
                )}

                <Button type="submit" loading={loading} className="w-full mt-1">
                  Começar jornada
                </Button>
              </form>
            </>
          )}
        </div>

        <p className="text-center text-[13px] text-zinc-400 dark:text-zinc-500 mt-6">
          Já tem conta?{' '}
          <Link
            href="/login"
            className="text-emerald-600 dark:text-emerald-400 hover:text-emerald-500 font-medium transition-colors"
          >
            Entrar
          </Link>
        </p>
      </div>
    </div>
  );
}
