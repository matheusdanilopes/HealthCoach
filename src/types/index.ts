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
}

export interface WaterLog {
  id: string;
  user_id: string;
  log_date: string;
  amount_ml: number;
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

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';
export type ActivityLevel = 'sedentary' | 'moderate' | 'active';
