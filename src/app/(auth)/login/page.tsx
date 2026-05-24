'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { Activity } from 'lucide-react';

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
    <div className="min-h-screen flex flex-col items-center justify-center px-4 bg-zinc-950">
      <div className="w-full max-w-sm animate-fade-in">
        <div className="flex flex-col items-center gap-2 mb-8">
          <div className="h-14 w-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
            <Activity className="text-emerald-400" size={28} />
          </div>
          <h1 className="text-2xl font-bold text-zinc-100">HealthCoach AI</h1>
          <p className="text-sm text-zinc-500">Seu coach de saúde personalizado</p>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
          <h2 className="font-semibold text-zinc-100 mb-5">Entrar na conta</h2>

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
              <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">
                {error}
              </p>
            )}

            <Button type="submit" loading={loading} size="lg" className="w-full mt-1">
              Entrar
            </Button>
          </form>
        </div>

        <p className="text-center text-sm text-zinc-500 mt-4">
          Não tem conta?{' '}
          <Link href="/register" className="text-emerald-400 hover:text-emerald-300 font-medium">
            Criar conta
          </Link>
        </p>
      </div>
    </div>
  );
}
