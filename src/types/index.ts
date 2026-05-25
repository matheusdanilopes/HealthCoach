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

export interface FoodAnalysis {
  name: string;
  quantity: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface MealAnalysisResult {
  foods: FoodAnalysis[];
  totalCalories: number;
  totalProtein: number;
  totalCarbs: number;
  totalFat: number;
}

export interface MealHistoryItem {
  id: string;
  user_id?: string;
  input_type: 'text' | 'image';
  raw_text: string | null;
  image_url: string | null;
  parsed_json: MealAnalysisResult;
  total_calories: number;
  total_protein: number | null;
  total_carbs: number | null;
  total_fat: number | null;
  created_at: string;
}
