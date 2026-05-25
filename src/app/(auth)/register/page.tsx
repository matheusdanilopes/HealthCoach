'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import ThemeToggle from '@/components/ui/ThemeToggle';
import { Activity, ChevronRight, ChevronLeft } from 'lucide-react';

const ACTIVITY_OPTIONS = [
  { value: 'sedentary', label: 'Sedentário', desc: 'Pouco ou nenhum exercício',       icon: '🛋️' },
  { value: 'moderate',  label: 'Moderado',   desc: 'Exercício 3-5x por semana',        icon: '🚶' },
  { value: 'active',    label: 'Ativo',       desc: 'Exercício intenso 6-7x por semana', icon: '🏃' },
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

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-5 bg-zinc-50 dark:bg-zinc-950 py-8">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-sm animate-fade-in">
        <div className="flex flex-col items-center gap-2 mb-8">
          <div className="h-14 w-14 rounded-2xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 flex items-center justify-center shadow-sm">
            <Activity className="text-blue-600 dark:text-blue-400" size={28} />
          </div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">HealthCoach AI</h1>
          <div className="flex items-center gap-2 mt-1">
            {(['account', 'profile'] as const).map((s, i) => (
              <div key={s} className={`h-1.5 rounded-full transition-all duration-300 ${
                s === step ? 'w-6 bg-blue-600' : i < ['account', 'profile'].indexOf(step) ? 'w-3 bg-blue-300 dark:bg-blue-700' : 'w-3 bg-zinc-200 dark:bg-zinc-700'
              }`} />
            ))}
          </div>
        </div>

        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm dark:shadow-none">
          {step === 'account' ? (
            <>
              <h2 className="font-semibold text-zinc-900 dark:text-zinc-100 mb-1">Criar conta</h2>
              <p className="text-sm text-zinc-400 dark:text-zinc-500 mb-5">Passo 1 de 2</p>
              <form onSubmit={handleAccountStep} className="flex flex-col gap-4">
                <Input label="Nome completo" placeholder="Seu nome" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
                <Input label="Email" type="email" placeholder="seu@email.com" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
                <Input label="Senha" type="password" placeholder="Mínimo 6 caracteres" value={password} onChange={(e) => setPassword(e.target.value)} required error={error} autoComplete="new-password" />
                <Button type="submit" size="lg" className="w-full mt-1">
                  Continuar <ChevronRight size={16} />
                </Button>
              </form>
            </>
          ) : (
            <>
              <button onClick={() => setStep('account')} className="flex items-center gap-1 text-sm text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 mb-3 -ml-1 transition-colors">
                <ChevronLeft size={16} /> Voltar
              </button>
              <h2 className="font-semibold text-zinc-900 dark:text-zinc-100 mb-1">Seu perfil de saúde</h2>
              <p className="text-sm text-zinc-400 dark:text-zinc-500 mb-5">Passo 2 de 2 — Anamnese</p>

              <form onSubmit={handleProfileStep} className="flex flex-col gap-4">
                <Input label="Data de nascimento" type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} required />

                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Sexo biológico</label>
                  <div className="grid grid-cols-2 gap-2">
                    {[{ value: 'male', label: '♂ Masculino' }, { value: 'female', label: '♀ Feminino' }].map((opt) => (
                      <button key={opt.value} type="button" onClick={() => setSex(opt.value as 'male' | 'female')}
                        className={`h-11 rounded-xl border text-sm font-medium transition-all ${sex === opt.value ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-400 dark:border-blue-700 text-blue-700 dark:text-blue-400' : 'bg-zinc-50 dark:bg-zinc-800 border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:border-zinc-400 dark:hover:border-zinc-600'}`}>
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <Input label="Peso (kg)" type="number" step="0.1" placeholder="70" value={weight} onChange={(e) => setWeight(e.target.value)} required min="30" max="300" />
                  <Input label="Altura (cm)" type="number" placeholder="170" value={height} onChange={(e) => setHeight(e.target.value)} required min="100" max="250" />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Nível de atividade física</label>
                  <div className="flex flex-col gap-2">
                    {ACTIVITY_OPTIONS.map((opt) => (
                      <button key={opt.value} type="button" onClick={() => setActivityLevel(opt.value as typeof activityLevel)}
                        className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${activityLevel === opt.value ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-700' : 'bg-zinc-50 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600'}`}>
                        <span className="text-xl">{opt.icon}</span>
                        <div>
                          <p className={`text-sm font-medium ${activityLevel === opt.value ? 'text-blue-700 dark:text-blue-400' : 'text-zinc-700 dark:text-zinc-300'}`}>{opt.label}</p>
                          <p className="text-xs text-zinc-400 dark:text-zinc-500">{opt.desc}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {error && (
                  <p className="text-sm text-red-500 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl px-3 py-2">{error}</p>
                )}

                <Button type="submit" loading={loading} size="lg" className="w-full mt-1">
                  Começar jornada 🚀
                </Button>
              </form>
            </>
          )}
        </div>

        <p className="text-center text-sm text-zinc-400 dark:text-zinc-500 mt-4">
          Já tem conta?{' '}
          <Link href="/login" className="text-blue-600 dark:text-blue-400 hover:underline font-medium">Entrar</Link>
        </p>
      </div>
    </div>
  );
}
