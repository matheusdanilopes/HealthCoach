'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { signOut } from 'next-auth/react';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import { LogOut, Save, Zap, Target, ShieldCheck } from 'lucide-react';
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
    { value: 'sedentary', emoji: '🛋️', label: 'Sedentário' },
    { value: 'moderate',  emoji: '🚶', label: 'Moderado'  },
    { value: 'active',    emoji: '🏃', label: 'Ativo'     },
  ];

  return (
    <div className="flex flex-col gap-5 pt-8 pb-4">
      <div>
        <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">Perfil</h1>
        <p className="text-sm text-zinc-400 dark:text-zinc-500">{email}</p>
      </div>

      {profile?.tdee && (
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-sm dark:shadow-none">
            <div className="flex items-center gap-1.5 mb-2">
              <Zap size={13} className="text-amber-500" />
              <p className="text-xs text-zinc-400 dark:text-zinc-500">TDEE</p>
            </div>
            <p className="text-2xl font-bold tabular-nums text-zinc-900 dark:text-zinc-100">{profile.tdee.toLocaleString('pt-BR')}</p>
            <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">kcal/dia</p>
          </div>
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-sm dark:shadow-none">
            <div className="flex items-center gap-1.5 mb-2">
              <Target size={13} className="text-blue-600 dark:text-blue-400" />
              <p className="text-xs text-zinc-400 dark:text-zinc-500">Meta</p>
            </div>
            <p className="text-2xl font-bold tabular-nums text-blue-600 dark:text-blue-400">{profile.target_calories?.toLocaleString('pt-BR')}</p>
            <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">kcal/dia</p>
          </div>
        </div>
      )}

      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-sm dark:shadow-none">
        <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-5">Dados pessoais</p>
        <form onSubmit={handleSave} className="flex flex-col gap-4">
          <Input label="Nome completo" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          <Input label="Data de nascimento" type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Peso (kg)" type="number" step="0.1" value={weight} onChange={(e) => setWeight(e.target.value)} />
            <Input label="Altura (cm)" type="number" value={height} onChange={(e) => setHeight(e.target.value)} />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Nível de atividade</label>
            <div className="grid grid-cols-3 gap-2">
              {ACTIVITY_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setActivityLevel(opt.value as any)}
                  className={cn(
                    'py-2.5 px-2 rounded-xl border text-xs font-medium transition-all text-center active:scale-95',
                    activityLevel === opt.value
                      ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-400'
                      : 'bg-zinc-50 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 hover:border-zinc-300 dark:hover:border-zinc-600'
                  )}
                >
                  <span className="block text-base mb-0.5">{opt.emoji}</span>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <Button type="submit" loading={loading} variant={saved ? 'secondary' : 'primary'} className="w-full">
            <Save size={15} />
            {saved ? 'Salvo!' : 'Salvar alterações'}
          </Button>
        </form>
      </div>

      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-sm dark:shadow-none">
        <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-3">Conta</p>
        <div className="flex flex-col gap-2">
          <Link
            href="/admin"
            className="h-10 px-4 w-full inline-flex items-center justify-center gap-2 rounded-xl text-sm font-medium bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 transition-all duration-150"
          >
            <ShieldCheck size={16} />
            Gerenciar usuários
          </Link>
          <Button variant="danger" onClick={handleSignOut} className="w-full">
            <LogOut size={15} />
            Sair da conta
          </Button>
        </div>
      </div>
    </div>
  );
}
