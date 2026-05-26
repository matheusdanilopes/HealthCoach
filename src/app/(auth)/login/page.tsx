'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import ThemeToggle from '@/components/ui/ThemeToggle';
import { LogoIcon } from '@/components/ui/Logo';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const result = await signIn('credentials', { email, password, redirect: false });
    if (result?.error) {
      setError('Email ou senha inválidos.');
      setLoading(false);
      return;
    }
    router.push('/dashboard');
    router.refresh();
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-[#f8f8f8] dark:bg-[#0a0a0b]">
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
              Seu coach de saúde personalizado
            </p>
          </div>
        </div>

        {/* Card */}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800/80 rounded-2xl shadow-[0_2px_8px_0_rgb(0,0,0,0.06)] dark:shadow-none p-6">
          <div className="mb-5">
            <h2 className="text-[17px] font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">
              Entrar na conta
            </h2>
            <p className="text-[13px] text-zinc-400 dark:text-zinc-500 mt-1">
              Bem-vindo de volta
            </p>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
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
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />

            {error && (
              <div className="flex items-center gap-2 bg-red-50 dark:bg-red-950/30 border border-red-100 dark:border-red-900/40 rounded-xl px-4 py-3">
                <span className="h-1.5 w-1.5 rounded-full bg-red-500 flex-shrink-0" />
                <p className="text-[13px] text-red-600 dark:text-red-400">{error}</p>
              </div>
            )}

            <Button type="submit" loading={loading} className="w-full mt-1">
              Entrar
            </Button>
          </form>
        </div>

        <p className="text-center text-[13px] text-zinc-400 dark:text-zinc-500 mt-6">
          Não tem conta?{' '}
          <Link
            href="/register"
            className="text-emerald-600 dark:text-emerald-400 hover:text-emerald-500 font-medium transition-colors"
          >
            Criar conta
          </Link>
        </p>
      </div>
    </div>
  );
}
