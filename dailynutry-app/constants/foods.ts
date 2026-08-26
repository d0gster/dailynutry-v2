/**
 * DailyNutry — domain types for diet plans.
 *
 * Type definitions only. No plan data is hardcoded here — a plan comes from a
 * real import at runtime and is stored locally on the device (never in source,
 * to avoid shipping anyone's personal/health data).
 */

export interface FoodItem {
  name: string;
  rawQty: number;
  unit: string;
  cookedQty?: number;
  cookedUnit?: string;
  householdMeasure?: string;
  yieldFactor?: number;
  // ─── TACO enrichment (populated by ai-gateway, never by the user) ──────
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  tacoId?: number;
}

export interface FoodGroup {
  name: string;
  category: 'carb' | 'protein' | 'legume' | 'dairy' | 'fruit' | 'salad' | 'other';
  items: FoodItem[];
}

export interface Meal {
  id: string;
  time: string;
  name: string;
  icon: string;
  groups: FoodGroup[];
  notes?: string;
  substitutions?: Substitution[];
}

export interface Substitution {
  index: number;
  label: string;
  groups: FoodGroup[];
}

export interface DietPlan {
  id: string;
  patientName: string;
  nutritionistName: string;
  crn: string;
  planDate: string;
  notes: string[];
  meals: Meal[];
}
