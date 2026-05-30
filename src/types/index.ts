export interface Profile {
  id: string;
  full_name: string | null;
  birth_date: string | null;
  sex: 'male' | 'female' | null;
  current_weight: number | null;
  height_cm: number | null;
  activity_level: 'sedentary' | 'moderate' | 'active' | null;
  tdee: number | null;
  target_calories: number | null;
  target_water_ml: number;
}

export interface FoodLog {
  id: string;
  user_id: string;
  created_at: string;
  food_name: string;
  meal_type: 'breakfast' | 'lunch' | 'dinner' | 'snack' | null;
  calories: number;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  hydration_ml: number;
  hydration_source: 'meal' | 'manual' | null;
  hydration_confidence: 'high' | 'medium' | 'low' | null;
}

export interface WaterLog {
  id: string;
  user_id: string;
  log_date: string;
  amount_ml: number;
}

export interface WaterLogEntry {
  id?: string;
  amount_ml: number;
  created_at: string;
}

export interface WeightLog {
  id: string;
  user_id: string;
  log_date: string;
  weight_kg: number;
}

export interface DailyStats {
  totalCalories: number;
  totalProtein: number;
  totalCarbs: number;
  totalFat: number;
  totalWater: number;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
}

export interface BodyMetrics {
  id: string;
  user_id: string;
  date: string;
  weight: number;
  muscle_mass: number | null;
  body_fat: number | null;
  visceral_fat: number | null;
  created_at: string;
  updated_at: string;
}

export interface BodyMeasurements {
  id: string;
  user_id: string;
  date: string;
  waist: number | null;
  abdomen: number | null;
  hips: number | null;
  chest: number | null;
  right_arm: number | null;
  left_arm: number | null;
  right_thigh: number | null;
  left_thigh: number | null;
  right_calf: number | null;
  left_calf: number | null;
  created_at: string;
  updated_at: string;
}

export interface AIInsight {
  id: string;
  user_id: string;
  type: 'nutrition' | 'hydration' | 'workout' | 'body' | 'behavior' | 'motivation';
  priority: 'informativo' | 'atencao' | 'positivo' | 'recomendacao';
  title: string;
  message: string;
  cta: string | null;
  metadata: Record<string, unknown> | null;
  generated_at: string;
  read_at: string | null;
}

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';
export type ActivityLevel = 'sedentary' | 'moderate' | 'active';
