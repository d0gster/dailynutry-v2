import { z } from 'zod';

/**
 * Zod schema for the LLM's diet-plan extraction.
 *
 * It mirrors the `ESTRUTURA ESPERADA` in the original prompt and the `DietPlan`
 * interface in `dailynutry-app/constants/foods.ts`. The LLM returns a PARTIAL
 * plan (no `id`/`icon` — the app fills those in `confirm.tsx`), so this schema
 * validates exactly the surface the model is responsible for.
 *
 * This is the guardrail: anything the model returns that doesn't fit gets
 * rejected and sent back for repair.
 */

export const FOOD_CATEGORIES = [
  'carb',
  'protein',
  'legume',
  'dairy',
  'fruit',
  'salad',
  'other',
] as const;

export const FoodItemSchema = z.object({
  name: z.string().min(1),
  // "à vontade" items legitimately have 0; never negative.
  rawQty: z.number().nonnegative().default(0),
  unit: z.string().default(''),
  householdMeasure: z.string().optional(),
  // ─── Enrichment fields (populated by enrichPlan, never by the LLM) ─────
  calories: z.number().optional(),
  protein: z.number().optional(),
  carbs: z.number().optional(),
  fat: z.number().optional(),
  tacoId: z.number().optional(),
  yieldFactor: z.number().optional(),
  cookedQty: z.number().optional(),
  cookedUnit: z.string().optional(),
});

export const FoodGroupSchema = z.object({
  name: z.string().min(1),
  // Unknown/garbage categories are coerced to "other" by sanitization, but the
  // schema itself stays strict so we can detect when the model went off-script.
  category: z.enum(FOOD_CATEGORIES),
  items: z.array(FoodItemSchema).min(1, 'a group must have at least one item'),
});

export const MealSchema = z.object({
  id: z.string().min(1),
  time: z.string().regex(/^\d{1,2}:\d{2}$/, 'time must be HH:MM'),
  name: z.string().min(1),
  notes: z.string().optional(),
  groups: z.array(FoodGroupSchema).min(1, 'a meal must have at least one group'),
});

export const DietPlanExtractionSchema = z.object({
  patientName: z.string().optional(),
  nutritionistName: z.string().optional(),
  crn: z.string().optional(),
  planDate: z.string().optional(),
  notes: z.array(z.string()).default([]),
  meals: z.array(MealSchema).min(1, 'plan must have at least one meal'),
});

export type DietPlanExtraction = z.infer<typeof DietPlanExtractionSchema>;
export type FoodCategory = (typeof FOOD_CATEGORIES)[number];
