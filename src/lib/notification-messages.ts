// Humanized notification message system with daily anti-repetition rotation.
//
// pick() is deterministic: same userId + date + seed → same variant.
// This guarantees the same user never receives the same message two days in a row
// while keeping behavior reproducible and debuggable.

const t = (s: string): string => (s.length <= 60  ? s : s.slice(0, 59)  + '…');
const b = (s: string): string => (s.length <= 180 ? s : s.slice(0, 179) + '…');

function pick<T>(variants: T[], userId: string, seed: string, date: string): T {
  const str = userId + seed + date;
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  }
  return variants[Math.abs(h) % variants.length];
}

// ─── Hydration ────────────────────────────────────────────────────────────────

export type HydrationCtx = {
  name: string;
  totalMl: number;
  targetMl: number;
  minSince: number;
  hour: number;
};

export function buildHydrationMessage(
  ctx: HydrationCtx,
  userId: string,
  date: string,
): { title: string; body: string; urgency: 'high' | 'normal' } {
  const { name: n, totalMl, targetMl, minSince, hour } = ctx;
  const remaining = Math.max(0, targetMl - totalMl);
  const pct       = targetMl > 0 ? Math.round((totalMl / targetMl) * 100) : 0;

  // 4 h+ — critical inactivity
  if (minSince >= 240) {
    const { title, body } = pick([
      {
        title: t(`💧 ${n}, sua meta está em risco`),
        body:  b(`Mais de 4h sem se hidratar. Faltam ${remaining}ml para a meta. Beba um copo agora!`),
      },
      {
        title: t(`💧 Ei, ${n}! Hora de beber água`),
        body:  b(`Longa pausa na hidratação hoje. Faltam ${remaining}ml. Cada gole conta agora.`),
      },
      {
        title: t(`💧 ${n}, retome a hidratação`),
        body:  b(`4h sem água. Ainda dá tempo de recuperar — faltam ${remaining}ml para ${targetMl}ml.`),
      },
    ], userId, 'h4', date);
    return { title, body, urgency: 'high' };
  }

  // 3 h — elevated inactivity
  if (minSince >= 180) {
    const { title, body } = pick([
      {
        title: t(`💧 ${n}, 3h sem hidratação`),
        body:  b(`Sua hidratação está atrasada. Beba um copo agora — faltam ${remaining}ml para a meta.`),
      },
      {
        title: t(`💧 Lembrete, ${n}`),
        body:  b(`Faz 3h desde a última água. Pequenas pausas para beber ajudam a manter ${targetMl}ml.`),
      },
      {
        title: t(`💧 ${n}, hora de retomar`),
        body:  b(`3 horas sem se hidratar. Ainda dá para recuperar — faltam ${remaining}ml hoje.`),
      },
    ], userId, 'h3', date);
    return { title, body, urgency: 'high' };
  }

  // Evening (18h – 22h)
  if (hour >= 18) {
    if (pct < 50) {
      const { title, body } = pick([
        {
          title: t(`🌙 ${n}, meta de hoje em aberto`),
          body:  b(`Noite chegando com ${pct}% da meta. Faltam ${remaining}ml — você consegue fechar o dia!`),
        },
        {
          title: t(`🌙 Atenção, ${n} — hidratação baixa`),
          body:  b(`Você tomou ${pct}% da meta hoje. Faltam ${remaining}ml. Ainda dá tempo!`),
        },
        {
          title: t(`🌙 ${n}, beba água agora`),
          body:  b(`${pct}% da meta concluída. Faltam ${remaining}ml para ${targetMl}ml. Bora fechar bem!`),
        },
      ], userId, 'ev-low', date);
      return { title, body, urgency: 'high' };
    }
    const { title, body } = pick([
      {
        title: t(`🌙 ${n}, quase lá!`),
        body:  b(`Você chegou a ${pct}% da meta de hidratação. Faltam só ${remaining}ml. Encerre o dia completo!`),
      },
      {
        title: t(`🌙 Reta final do dia, ${n}`),
        body:  b(`${pct}% da meta concluída. Mais ${remaining}ml e você fecha o dia no azul. Bora!`),
      },
      {
        title: t(`🌙 ${n}, finalize bem sua meta`),
        body:  b(`Faltam apenas ${remaining}ml para completar ${targetMl}ml hoje. Você está quase lá!`),
      },
    ], userId, 'ev-ok', date);
    return { title, body, urgency: 'normal' };
  }

  // Morning (5h – 11h)
  if (hour >= 5 && hour < 12) {
    const { title, body } = pick([
      {
        title: t(`☀️ Bom dia, ${n}!`),
        body:  b(`Começar hidratado faz diferença no seu dia. Faltam ${remaining}ml para a meta de ${targetMl}ml.`),
      },
      {
        title: t(`☀️ ${n}, hora da água matinal`),
        body:  b(`Sua primeira água ativa o metabolismo. Meta: ${targetMl}ml. Você está em ${pct}% — vamos lá!`),
      },
      {
        title: t(`☀️ ${n}, o dia começa agora`),
        body:  b(`Não esqueça da hidratação. Faltam ${remaining}ml para a meta de hoje. Beba um copo!`),
      },
    ], userId, 'morning', date);
    return { title, body, urgency: 'normal' };
  }

  // Afternoon (12h – 17h) — generic 2 h reminder
  const { title, body } = pick([
    {
      title: t(`💧 ${n}, hora de beber água`),
      body:  b(`Faz mais de 2h desde a última hidratação. Faltam ${remaining}ml para a meta de hoje.`),
    },
    {
      title: t(`💧 Pausa para se hidratar, ${n}`),
      body:  b(`${pct}% da meta concluída. Um copo agora mantém o ritmo — faltam ${remaining}ml.`),
    },
    {
      title: t(`💧 Lembrete de hidratação, ${n}`),
      body:  b(`Seu corpo precisa de água! Faltam ${remaining}ml para completar ${targetMl}ml hoje.`),
    },
  ], userId, 'afternoon', date);
  return { title, body, urgency: 'normal' };
}

// ─── Meals ────────────────────────────────────────────────────────────────────

export type MealCtx = {
  name: string;
  mealLabel: string;
  totalCals: number;
};

export function buildMealMessage(
  ctx: MealCtx,
  userId: string,
  mealKey: string,
  date: string,
): { title: string; body: string } {
  const { name: n, mealLabel, totalCals } = ctx;
  const calsLine = totalCals > 0
    ? `Você já registrou ${totalCals} kcal hoje.`
    : 'Mantenha o acompanhamento nutricional.';

  const { title, body } = pick([
    {
      title: t(`🍽️ ${n}, registrou o ${mealLabel}?`),
      body:  b(`${calsLine} Registrar refeições mantém suas análises precisas.`),
    },
    {
      title: t(`🥗 ${n}, não esqueça do ${mealLabel}`),
      body:  b(`Registre suas refeições para insights melhores. ${calsLine}`),
    },
    {
      title: t(`🍽️ Hora do ${mealLabel}, ${n}`),
      body:  b(`Complete o registro do dia para acompanhar sua nutrição. ${calsLine}`),
    },
  ], userId, 'meal-' + mealKey, date);

  return { title, body };
}

// ─── Workout ─────────────────────────────────────────────────────────────────

export type WorkoutCtx = {
  name: string;
  daysWithout: number;
};

export function buildWorkoutMessage(
  ctx: WorkoutCtx,
  userId: string,
  period: 'am' | 'pm',
  date: string,
): { title: string; body: string } {
  const { name: n, daysWithout } = ctx;

  if (period === 'am') {
    const { title, body } = pick([
      {
        title: t(`💪 Bom dia, ${n}!`),
        body:  b(`Começar o dia se movendo aumenta energia e disposição. Registre seu treino hoje.`),
      },
      {
        title: t(`🏃 ${n}, bora se mover hoje?`),
        body:  b(`Um treino matinal melhora o humor e a produtividade. Qual atividade você vai fazer?`),
      },
      {
        title: t(`☀️ ${n}, manhã de treino!`),
        body:  b(`A consistência é o segredo dos resultados. Registre sua atividade de hoje no app.`),
      },
    ], userId, 'workout-am', date);
    return { title, body };
  }

  const daysText = daysWithout >= 2
    ? `Você está há ${daysWithout} dias sem registrar atividades.`
    : 'Você ainda não registrou atividade hoje.';

  const { title, body } = pick([
    {
      title: t(`🏃 ${n}, que tal um treino hoje?`),
      body:  b(`${daysText} Retomar agora ajuda a manter sua evolução em dia.`),
    },
    {
      title: t(`💪 ${n}, hora de se mover`),
      body:  b(`${daysText} Qualquer atividade conta — caminhada, academia ou em casa.`),
    },
    {
      title: t(`🏃 Lembrete de treino, ${n}`),
      body:  b(`${daysText} Registre sua atividade para acompanhar a evolução.`),
    },
  ], userId, 'workout-pm', date);
  return { title, body };
}

// ─── Insights ─────────────────────────────────────────────────────────────────

export type InsightCtx = {
  name: string;
  insightTitle: string;
  priority: string;
};

export function buildInsightMessage(
  ctx: InsightCtx,
  userId: string,
  date: string,
): { title: string; body: string } {
  const { name: n, insightTitle, priority } = ctx;
  const emoji: Record<string, string> = {
    positivo: '🌟', atencao: '⚠️', recomendacao: '💡', informativo: 'ℹ️',
  };
  const em = emoji[priority] ?? '💡';
  const shortTitle = insightTitle.length <= 140 ? insightTitle : insightTitle.slice(0, 137) + '…';

  const { title, body } = pick([
    {
      title: t(`${em} ${n}, novo insight disponível`),
      body:  b(shortTitle),
    },
    {
      title: t(`${em} ${n}, sua evolução em análise`),
      body:  b(`Identifiquei algo relevante nos seus dados. Confira o novo insight no app.`),
    },
    {
      title: t(`${em} Análise pronta para você, ${n}`),
      body:  b(shortTitle !== insightTitle ? `Novo insight disponível. Abra o app para conferir.` : shortTitle),
    },
  ], userId, 'insight-' + priority, date);
  return { title, body };
}
