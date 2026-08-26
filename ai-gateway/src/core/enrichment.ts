import { searchTacoBatch } from '@/db/taco';
import { searchYieldBatch } from '@/db/yield';
import { type DietPlanExtraction } from './schema';

/** Rounds to one decimal, the precision the app displays. */
function per100gTo(qty: number, per100g: number): number {
  return Math.round((per100g / 100) * qty * 10) / 10;
}

/**
 * Enrich a parsed diet plan with TACO nutritional data and yield factors.
 *
 * For each FoodItem in every meal:
 *   1. TACO match by name → proportional macros for rawQty (the quantity the
 *      nutritionist prescribed — typically cooked/ready).
 *   2. Yield factor by name → so the app can compute the raw purchase quantity
 *      (rawQty / factor) for the shopping list. Honours this device's own
 *      correction to that factor when it has made one.
 *
 * Lookups are batched: two queries for TACO and one for yields, whatever the
 * plan's size. Doing them per item meant a 40-item plan waited on 80 serial
 * round-trips before the user saw anything.
 *
 * This function NEVER fails. If the DB is offline or a name doesn't match, the
 * plan comes back without that enrichment — optional data must never
 * compromise the core extraction.
 */
export async function enrichPlan(
  plan: DietPlanExtraction,
  deviceId: string | null = null,
): Promise<DietPlanExtraction> {
  const items = plan.meals.flatMap((meal) =>
    meal.groups.flatMap((group) => group.items),
  );
  if (items.length === 0) return plan;

  const names = items.map((item) => item.name);

  // Both lookups are independent, and each already swallows its own failures
  // and returns an empty map — so one being unavailable still lets the other
  // enrich what it can. The catch is the backstop for the "never fails"
  // promise above, so it holds even if the db layer stops honouring it.
  let tacoMatches: Awaited<ReturnType<typeof searchTacoBatch>>;
  let yieldMatches: Awaited<ReturnType<typeof searchYieldBatch>>;
  try {
    [tacoMatches, yieldMatches] = await Promise.all([
      searchTacoBatch(names),
      searchYieldBatch(names, deviceId),
    ]);
  } catch (err) {
    console.error('[enrichment] lookup failed (plan returned unenriched):', (err as Error).message);
    return plan;
  }

  for (const item of items) {
    const taco = tacoMatches.get(item.name);
    if (taco) {
      const qty = item.rawQty || 0;
      if (taco.energy_kcal != null) item.calories = per100gTo(qty, taco.energy_kcal);
      if (taco.protein_g != null) item.protein = per100gTo(qty, taco.protein_g);
      if (taco.carb_g != null) item.carbs = per100gTo(qty, taco.carb_g);
      if (taco.fat_g != null) item.fat = per100gTo(qty, taco.fat_g);
      item.tacoId = taco.taco_id;
    }

    const yieldFactor = yieldMatches.get(item.name);
    if (yieldFactor) item.yieldFactor = yieldFactor.factor;
  }

  return plan;
}
