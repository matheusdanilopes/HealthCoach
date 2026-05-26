'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { signOut } from 'next-auth/react';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import { LogOut, Save, Zap, Target, ShieldCheck, ChevronRight, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Profile } from '@/types';

interface ProfileClientProps {
  profile: Profile | null;
  userId: string;
  email: string;
}

const ACTIVITY_OPTIONS = [
  { value: 'sedentary', label: 'Sedentário', desc: 'Pouco exercício', icon: '🛋️' },
  { value: 'moderate',  label: 'Moderado',   desc: '3–5x/semana',    icon: '🚶' },
  { value: 'active',    label: 'Ativo',       desc: '6–7x/semana',    icon: '🏃' },
];

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
    setTimeout(() => setSaved(false), 2500);
    router.refresh();
  }

  async function handleSignOut() {
    await signOut({ callbackUrl: '/login' });
  }

  const initials = (profile?.full_name ?? email)
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');

  return (
    <div className="flex flex-col gap-4 pt-6 pb-4 animate-fade-in">
      {/* Identity */}
      <div className="flex items-center gap-4">
        <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center flex-shrink-0 shadow-md shadow-blue-600/20">
          <span className="text-lg font-bold text-white tracking-tight">{initials}</span>
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 leading-tight truncate tracking-tight">
            {profile?.full_name || 'Meu perfil'}
          </h1>
          <p className="text-[13px] text-zinc-400 dark:text-zinc-500 truncate mt-0.5">{email}</p>
        </div>
      </div>

      {/* Stats */}
      {profile?.tdee && (
        <div className="grid grid-cols-2 gap-2.5">
          <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-100/80 dark:border-amber-900/30 rounded-2xl p-4">
            <div className="flex items-center gap-1.5 mb-2.5">
              <Zap size={12} className="text-amber-500" />
              <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
                TDEE
              </p>
            </div>
            <p className="text-2xl font-bold tabular-nums text-zinc-900 dark:text-zinc-100 leading-none tracking-tight">
              {profile.tdee.toLocaleString('pt-BR')}
            </p>
            <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-1">kcal/dia</p>
          </div>
          <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-100/80 dark:border-blue-900/30 rounded-2xl p-4">
            <div className="flex items-center gap-1.5 mb-2.5">
              <Target size={12} className="text-blue-600 dark:text-blue-400" />
              <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
                Meta
              </p>
            </div>
            <p className="text-2xl font-bold tabular-nums text-blue-600 dark:text-blue-400 leading-none tracking-tight">
              {profile.target_calories?.toLocaleString('pt-BR')}
            </p>
            <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-1">kcal/dia</p>
          </div>
        </div>
      )}

      {/* Personal data form */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800/80 rounded-2xl overflow-hidden shadow-[0_1px_3px_0_rgb(0,0,0,0.04)] dark:shadow-none">
        <div className="px-5 py-3.5 border-b border-zinc-50 dark:border-zinc-800/60">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
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

          {/* Activity level */}
          <div className="flex flex-col gap-2">
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
                      'flex flex-col items-center gap-2 px-2 py-3.5 rounded-xl border text-center transition-all duration-150 active:scale-[0.97]',
                      isSelected
                        ? 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800/60'
                        : 'bg-zinc-50/80 dark:bg-zinc-800/40 border-zinc-200/80 dark:border-zinc-700/40 hover:border-zinc-300 dark:hover:border-zinc-600'
                    )}
                  >
                    <span className="text-xl leading-none">{opt.icon}</span>
                    <div>
                      <p className={cn(
                        'text-[11px] font-semibold leading-none',
                        isSelected ? 'text-blue-700 dark:text-blue-400' : 'text-zinc-700 dark:text-zinc-300'
                      )}>
                        {opt.label}
                      </p>
                      <p className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-0.5">{opt.desc}</p>
                    </div>
                    {isSelected && (
                      <div className="h-3.5 w-3.5 rounded-full bg-blue-600 dark:bg-blue-500 flex items-center justify-center">
                        <Check size={7} className="text-white" strokeWidth={3} />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <Button
            type="submit"
            loading={loading}
            variant={saved ? 'secondary' : 'primary'}
            className="w-full"
          >
            {saved ? <Check size={14} /> : <Save size={14} />}
            {saved ? 'Salvo!' : 'Salvar alterações'}
          </Button>
        </form>
      </div>

      {/* Account */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800/80 rounded-2xl overflow-hidden shadow-[0_1px_3px_0_rgb(0,0,0,0.04)] dark:shadow-none">
        <div className="px-5 py-3.5 border-b border-zinc-50 dark:border-zinc-800/60">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
            Conta
          </p>
        </div>
        <div className="p-2">
          <Link
            href="/admin"
            className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-colors group"
          >
            <div className="h-8 w-8 rounded-lg bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center flex-shrink-0">
              <ShieldCheck size={14} className="text-zinc-500 dark:text-zinc-400" />
            </div>
            <span className="text-[13px] font-medium text-zinc-700 dark:text-zinc-300 flex-1">
              Gerenciar usuários
            </span>
            <ChevronRight size={13} className="text-zinc-300 dark:text-zinc-600 group-hover:text-zinc-400 transition-colors" />
          </Link>
          <button
            onClick={handleSignOut}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors group"
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
