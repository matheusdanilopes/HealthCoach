'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { signOut } from 'next-auth/react';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import { LogOut, Save, Zap, Target, ShieldCheck, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Profile } from '@/types';

interface ProfileClientProps {
  profile: Profile | null;
  userId: string;
  email: string;
}

export default function ProfileClient({ profile, userId, email }: ProfileClientProps) {
  const router = useRouter();
  const [fullName, setFullName] = useState(profile?.full_name ?? '');
  const [birthDate, setBirthDate] = useState(profile?.birth_date ?? '');
  const [weight, setWeight] = useState(String(profile?.current_weight ?? ''));
  const [height, setHeight] = useState(String(profile?.height_cm ?? ''));
  const [activityLevel, setActivityLevel] = useState(profile?.activity_level ?? 'sedentary');
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    await fetch('/api/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fullName, birthDate, weight, height, activityLevel }),
    });
    setLoading(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    router.refresh();
  }

  async function handleSignOut() {
    await signOut({ callbackUrl: '/login' });
  }

  const ACTIVITY_OPTIONS = [
    { value: 'sedentary', label: 'Sedentário',   desc: 'Pouco exercício' },
    { value: 'moderate',  label: 'Moderado',      desc: '3–5x por semana' },
    { value: 'active',    label: 'Ativo',          desc: '6–7x por semana' },
  ];

  const initials = (profile?.full_name ?? email)
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');

  return (
    <div className="flex flex-col gap-4 pt-6 pb-4">
      {/* Avatar + identity */}
      <div className="flex items-center gap-4 mb-2">
        <div className="h-14 w-14 rounded-2xl bg-blue-50 dark:bg-blue-900/30 border border-blue-100 dark:border-blue-800 flex items-center justify-center flex-shrink-0">
          <span className="text-lg font-bold text-blue-600 dark:text-blue-400">{initials}</span>
        </div>
        <div>
          <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100 leading-tight">
            {profile?.full_name || 'Meu perfil'}
          </h1>
          <p className="text-sm text-zinc-400 dark:text-zinc-500">{email}</p>
        </div>
      </div>

      {/* Stats */}
      {profile?.tdee && (
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-900/40 rounded-2xl p-4">
            <div className="flex items-center gap-1.5 mb-2">
              <Zap size={13} className="text-amber-500" />
              <p className="text-[10px] uppercase tracking-wider text-zinc-400 dark:text-zinc-500 font-medium">TDEE</p>
            </div>
            <p className="text-2xl font-bold tabular-nums text-zinc-900 dark:text-zinc-100 leading-none">
              {profile.tdee.toLocaleString('pt-BR')}
            </p>
            <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-1">kcal/dia</p>
          </div>
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-900/40 rounded-2xl p-4">
            <div className="flex items-center gap-1.5 mb-2">
              <Target size={13} className="text-blue-600 dark:text-blue-400" />
              <p className="text-[10px] uppercase tracking-wider text-zinc-400 dark:text-zinc-500 font-medium">Meta</p>
            </div>
            <p className="text-2xl font-bold tabular-nums text-blue-600 dark:text-blue-400 leading-none">
              {profile.target_calories?.toLocaleString('pt-BR')}
            </p>
            <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-1">kcal/dia</p>
          </div>
        </div>
      )}

      {/* Personal data form */}
      <div className="bg-white dark:bg-zinc-900/80 border border-zinc-100 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-[0_1px_3px_0_rgb(0,0,0,0.04)] dark:shadow-none">
        <div className="px-5 py-4 border-b border-zinc-50 dark:border-zinc-800">
          <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
            Dados pessoais
          </p>
        </div>
        <form onSubmit={handleSave} className="p-5 flex flex-col gap-4">
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

          <div className="flex flex-col gap-2">
            <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
              Nível de atividade
            </label>
            <div className="flex flex-col gap-1.5">
              {ACTIVITY_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setActivityLevel(opt.value as any)}
                  className={cn(
                    'flex items-center justify-between px-4 py-3 rounded-xl border text-left transition-all',
                    activityLevel === opt.value
                      ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-400'
                      : 'bg-zinc-50 dark:bg-zinc-800/60 border-zinc-200 dark:border-zinc-700/60 text-zinc-600 dark:text-zinc-400 hover:border-zinc-300 dark:hover:border-zinc-600'
                  )}
                >
                  <div>
                    <p className="text-sm font-medium leading-none mb-0.5">{opt.label}</p>
                    <p className="text-[11px] text-zinc-400 dark:text-zinc-500">{opt.desc}</p>
                  </div>
                  {activityLevel === opt.value && (
                    <div className="h-4 w-4 rounded-full bg-blue-600 dark:bg-blue-500 flex items-center justify-center flex-shrink-0">
                      <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                        <path d="M1.5 4l2 2 3-3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>

          <Button
            type="submit"
            loading={loading}
            variant={saved ? 'secondary' : 'primary'}
            className="w-full"
          >
            <Save size={14} />
            {saved ? 'Salvo!' : 'Salvar alterações'}
          </Button>
        </form>
      </div>

      {/* Account actions */}
      <div className="bg-white dark:bg-zinc-900/80 border border-zinc-100 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-[0_1px_3px_0_rgb(0,0,0,0.04)] dark:shadow-none">
        <div className="px-5 py-4 border-b border-zinc-50 dark:border-zinc-800">
          <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
            Conta
          </p>
        </div>
        <div className="p-2">
          <Link
            href="/admin"
            className="flex items-center justify-between px-3 py-3 rounded-xl hover:bg-zinc-50 dark:hover:bg-zinc-800/60 transition-colors group"
          >
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-lg bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
                <ShieldCheck size={15} className="text-zinc-500 dark:text-zinc-400" />
              </div>
              <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Gerenciar usuários
              </span>
            </div>
            <ChevronRight size={14} className="text-zinc-300 dark:text-zinc-600 group-hover:text-zinc-400 transition-colors" />
          </Link>
          <button
            onClick={handleSignOut}
            className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors group"
          >
            <div className="h-8 w-8 rounded-lg bg-red-50 dark:bg-red-900/20 flex items-center justify-center">
              <LogOut size={15} className="text-red-500" />
            </div>
            <span className="text-sm font-medium text-red-500 dark:text-red-400">
              Sair da conta
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
