import { NextResponse } from 'next/server';
import { supabase } from '@/lib/db';
import { brazilToday } from '@/lib/timezone';
import { verifyCronSecret } from '@/lib/cron-auth';
import {
  sendNotificationToUser,
  getUsersWithSubscriptions,
  isBrazilQuietHour,
  brazilHour,
} from '@/lib/notification-sender';

type MealWindow = {
  meal: 'café da manhã' | 'almoço' | 'lanche' | 'jantar';
  tag: string;
  startHour: number;
  endHour: number;
  minHoursToRemind: number;
};

const MEAL_WINDOWS: MealWindow[] = [
  { meal: 'café da manhã', tag: 'hc-meal-breakfast', startHour: 7,  endHour: 10, minHoursToRemind: 8 },
  { meal: 'almoço',        tag: 'hc-meal-lunch',     startHour: 11, endHour: 14, minHoursToRemind: 11 },
  { meal: 'lanche',        tag: 'hc-meal-snack',      startHour: 15, endHour: 17, minHoursToRemind: 15 },
  { meal: 'jantar',        tag: 'hc-meal-dinner',     startHour: 18, endHour: 21, minHoursToRemind: 18 },
];

type MealRow = { meal_type: string; calories: number };

async function getUserMealsToday(userId: string): Promise<MealRow[]> {
  const { data } = await supabase
    .from('food_logs')
    .select('meal_type, calories')
    .eq('user_id', userId)
    .eq('log_date', brazilToday());
  return (data ?? []) as MealRow[];
}

async function checkUserMealReminders(userId: string): Promise<'notified' | 'ok' | 'skipped' | 'no_sub' | 'error' | 'opt_out'> {
  if (isBrazilQuietHour()) return 'skipped';

  const bHour = brazilHour();
  const window = MEAL_WINDOWS.find((w) => bHour >= w.startHour && bHour <= w.endHour);
  if (!window) return 'skipped';

  // Only remind after the middle of the meal window
  if (bHour < window.minHoursToRemind + 1) return 'skipped';

  const meals = await getUserMealsToday(userId);
  const mealTypeMap: Record<string, string> = {
    'café da manhã': 'breakfast',
    'almoço': 'lunch',
    'lanche': 'snack',
    'jantar': 'dinner',
  };
  const mealKey = mealTypeMap[window.meal];
  const alreadyLogged = meals.some((m) => m.meal_type === mealKey);

  if (alreadyLogged) return 'ok';

  const totalCalories = meals.reduce((s, m) => s + m.calories, 0);

  const mealLabels: Record<string, string> = {
    breakfast: 'seu café da manhã',
    lunch:     'seu almoço',
    snack:     'um lanche',
    dinner:    'seu jantar',
  };
  const label = mealLabels[mealKey] ?? window.meal;

  const result = await sendNotificationToUser(
    userId,
    {
      title:    `Hora de registrar ${label} 🍽️`,
      body:     totalCalories > 0
        ? `Você já registrou ${totalCalories} kcal hoje. Não esqueça de completar o registro!`
        : `Lembre-se de registrar suas refeições para acompanhar sua nutrição.`,
      tag:      window.tag,
      url:      '/diary',
      category: 'meal',
    },
    { urgency: 'normal', ttl: 3600 },
  );

  return result;
}

// GET /api/notifications/meal-reminders?cron=1
export async function GET(req: Request) {
  const authErr = verifyCronSecret(req);
  if (authErr) return authErr;

  const bHour = brazilHour();
  if (isBrazilQuietHour()) {
    return NextResponse.json({ skipped: true, reason: 'quiet_hours', brazilHour: bHour });
  }

  const uniqueUsers = await getUsersWithSubscriptions();
  const results = await Promise.allSettled(
    uniqueUsers.map((uid) => checkUserMealReminders(uid)),
  );

  const counts = { notified: 0, ok: 0, skipped: 0, no_sub: 0, error: 0, opt_out: 0 };
  results.forEach((r) => {
    if (r.status === 'fulfilled') {
      const k = r.value as keyof typeof counts;
      if (k in counts) counts[k]++;
    } else {
      counts.error++;
    }
  });

  console.info(`[meal-reminders] cron done brazilHour=${bHour} users=${uniqueUsers.length}`, counts);
  return NextResponse.json({ checked: uniqueUsers.length, brazilHour: bHour, ...counts });
}
