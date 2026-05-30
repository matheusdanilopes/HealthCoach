import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { supabase } from '@/lib/db';
import { subDays } from 'date-fns';
import { formatDate } from '@/lib/utils';
import HistoryClient from './HistoryClient';

export default async function HistoryPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const userId = session.user.id;
  const ninetyDaysAgo = formatDate(subDays(new Date(), 90));

  const [
    { data: profileData },
    { data: weightData },
    { data: foodData },
    { data: workoutData },
    { data: waterData },
    { data: bodyMetricsData },
    { data: bodyMeasurementsData },
  ] = await Promise.all([
    supabase
      .from('users')
      .select('target_calories, target_protein_g, target_water_ml, current_weight')
      .eq('id', userId)
      .single(),
    supabase
      .from('weight_logs')
      .select('log_date, weight_kg')
      .eq('user_id', userId)
      .gte('log_date', ninetyDaysAgo)
      .order('log_date'),
    supabase
      .from('food_logs')
      .select('log_date, calories, protein')
      .eq('user_id', userId)
      .gte('log_date', ninetyDaysAgo)
      .gt('calories', 0),
    supabase
      .from('food_logs')
      .select('log_date')
      .eq('user_id', userId)
      .gte('log_date', ninetyDaysAgo)
      .lt('calories', 0),
    supabase
      .from('water_logs')
      .select('log_date, amount_ml')
      .eq('user_id', userId)
      .gte('log_date', ninetyDaysAgo),
    supabase
      .from('body_metrics')
      .select('date, weight, muscle_mass, body_fat, visceral_fat')
      .eq('user_id', userId)
      .order('date'),
    supabase
      .from('body_measurements')
      .select('date, waist, neck, hips, chest, right_arm, left_arm, right_thigh, left_thigh')
      .eq('user_id', userId)
      .order('date'),
  ]);

  const profile = {
    targetCalories: profileData?.target_calories ?? 2000,
    targetProtein:  Number(profileData?.target_protein_g ?? 0),
    targetWater:    profileData?.target_water_ml ?? 2500,
    currentWeight:  profileData?.current_weight ? Number(profileData.current_weight) : null,
  };

  // Weight logs (ascending by date)
  const weightLogs = (weightData ?? []).map((r) => ({
    date:   r.log_date,
    weight: parseFloat(String(r.weight_kg)),
  }));

  // Aggregate food by date
  const foodByDate: Record<string, { calories: number; protein: number }> = {};
  for (const log of foodData ?? []) {
    if (!foodByDate[log.log_date]) foodByDate[log.log_date] = { calories: 0, protein: 0 };
    foodByDate[log.log_date].calories += log.calories;
    foodByDate[log.log_date].protein  += log.protein ?? 0;
  }
  const dailyNutrition = Object.entries(foodByDate)
    .map(([date, d]) => ({ date, calories: Math.round(d.calories), protein: Math.round(d.protein) }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Workout days (unique dates with calorie-burning entries)
  const workoutDays = [...new Set((workoutData ?? []).map((r) => r.log_date))].sort();

  // Aggregate water by date
  const waterByDate: Record<string, number> = {};
  for (const log of waterData ?? []) {
    waterByDate[log.log_date] = (waterByDate[log.log_date] ?? 0) + log.amount_ml;
  }
  const dailyWater = Object.entries(waterByDate)
    .map(([date, total]) => ({ date, total }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Body metrics (ascending — first = oldest, last = newest)
  const bodyMetrics = (bodyMetricsData ?? []).map((r) => ({
    date:         r.date,
    weight:       r.weight       != null ? Number(r.weight)       : null,
    muscle_mass:  r.muscle_mass  != null ? Number(r.muscle_mass)  : null,
    body_fat:     r.body_fat     != null ? Number(r.body_fat)     : null,
    visceral_fat: r.visceral_fat != null ? Number(r.visceral_fat) : null,
  }));

  // Body measurements (ascending — first = oldest, last = newest)
  const bodyMeasurements = (bodyMeasurementsData ?? []).map((r) => {
    const rArm = r.right_arm != null ? Number(r.right_arm) : null;
    const lArm = r.left_arm  != null ? Number(r.left_arm)  : null;
    const rThigh = r.right_thigh != null ? Number(r.right_thigh) : null;
    const lThigh = r.left_thigh  != null ? Number(r.left_thigh)  : null;
    return {
      date:     r.date,
      waist:    r.waist   != null ? Number(r.waist)   : null,
      neck:     r.neck    != null ? Number(r.neck)    : null,
      hips:     r.hips    != null ? Number(r.hips)    : null,
      chest:    r.chest   != null ? Number(r.chest)   : null,
      avgArm:   rArm != null && lArm != null ? (rArm + lArm) / 2 : (rArm ?? lArm),
      avgThigh: rThigh != null && lThigh != null ? (rThigh + lThigh) / 2 : (rThigh ?? lThigh),
    };
  });

  return (
    <HistoryClient
      profile={profile}
      weightLogs={weightLogs}
      dailyNutrition={dailyNutrition}
      workoutDays={workoutDays}
      dailyWater={dailyWater}
      bodyMetrics={bodyMetrics}
      bodyMeasurements={bodyMeasurements}
    />
  );
}
