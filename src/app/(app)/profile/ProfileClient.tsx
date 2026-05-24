'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import { LogOut, Save, Activity, User } from 'lucide-react';
import {
  calculateAge,
  calculateTMB,
  calculateTDEE,
  calculateTargetCalories,
  calculateWaterTarget,
} from '@/lib/calculations';
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
  const [height, setHeight] = useState(String(profile?.height ?? ''));
  const [activityLevel, setActivityLevel] = useState(profile?.activity_level ?? 'sedentary');
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    const supabase = createClient();
    const w = parseFloat(weight);
    const h = parseFloat(height);
    const age = calculateAge(birthDate);
    const sex = (profile as any)?.sex ?? 'male';
    const tmb = calculateTMB(w, h, age, sex);
    const tdee = calculateTDEE(tmb, activityLevel as any);
    const targetCal = calculateTargetCalories(tdee);
    const targetWater = calculateWaterTarget(w);

    await supabase.from('profiles').update({
      full_name: fullName,
      birth_date: birthDate,
      current_weight: w,
      height: h,
      activity_level: activityLevel,
      tdee,
      target_calories: targetCal,
      target_water_ml: targetWater,
      updated_at: new Date().toISOString(),
    }).eq('id', userId);

    setLoading(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    router.refresh();
  }

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
  }

  return (
    <div className="flex flex-col gap-5 pt-5">
      <div>
        <h1 className="text-xl font-bold text-zinc-100">Perfil</h1>
        <p className="text-sm text-zinc-500">{email}</p>
      </div>

      {/* Stats summary */}
      {profile?.tdee && (
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <Activity size={14} className="text-emerald-400" />
              <p className="text-xs text-zinc-500 uppercase tracking-wide">TDEE</p>
            </div>
            <p className="text-2xl font-bold text-zinc-100">{profile.tdee}</p>
            <p className="text-xs text-zinc-500">kcal/dia</p>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <User size={14} className="text-blue-400" />
              <p className="text-xs text-zinc-500 uppercase tracking-wide">Meta</p>
            </div>
            <p className="text-2xl font-bold text-emerald-400">{profile.target_calories}</p>
            <p className="text-xs text-zinc-500">kcal/dia</p>
          </div>
        </div>
      )}

      {/* Edit form */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
        <p className="text-sm font-medium text-zinc-300 mb-4">Editar dados pessoais</p>
        <form onSubmit={handleSave} className="flex flex-col gap-4">
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

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-zinc-300">Nível de atividade</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { value: 'sedentary', label: '🛋️ Sedentário' },
                { value: 'moderate', label: '🚶 Moderado' },
                { value: 'active', label: '🏃 Ativo' },
              ].map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setActivityLevel(opt.value as any)}
                  className={`py-2 px-1 rounded-xl border text-xs transition-all text-center ${
                    activityLevel === opt.value
                      ? 'bg-emerald-500/10 border-emerald-500 text-emerald-400'
                      : 'bg-zinc-800 border-zinc-700 text-zinc-500'
                  }`}
                >
                  {opt.label}
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
            <Save size={16} />
            {saved ? 'Salvo! ✓' : 'Salvar alterações'}
          </Button>
        </form>
      </div>

      {/* Danger zone */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
        <p className="text-sm font-medium text-zinc-400 mb-3">Conta</p>
        <Button variant="danger" onClick={handleSignOut} className="w-full">
          <LogOut size={16} />
          Sair da conta
        </Button>
      </div>
    </div>
  );
}
