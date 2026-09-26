import type {
  DiaryEntry,
  InventoryItem,
  LocalFood,
  OwnRecipe,
  Targets,
} from '@/db/types';
import { daysUntil } from './date';
import { classifyByName } from './categories';

export type RecommendationAction =
  | { type: 'log'; inventoryId: number }
  | { type: 'cook'; recipeId: number };

export interface Recommendation {
  id: string;
  kind: 'protein' | 'fit' | 'expiring' | 'variety';
  title: string;
  detail: string;
  /** What tapping the card does. Without an action the card is read-only. */
  action?: RecommendationAction;
  actionLabel?: string;
}

/**
 * Suggestions for the rest of the day (§4.7), built from what is actually in
 * the kitchen rather than from a generic food list:
 *   1. Expiring stock first – but never things that are already past their
 *      date; eating those is the user's call, not ours to nudge.
 *   2. Protein – only when protein lags behind calories *relatively*. In
 *      absolute grams carbs always "lack" the most, which is how the old
 *      version ended up recommending sugar, honey and raw flour.
 *   3. A recipe that still fits into the remaining calories.
 *   4. Variety – something not cooked recently.
 */
export function buildRecommendations(args: {
  targets: Targets;
  remaining: Targets;
  inventory: InventoryItem[];
  foods: LocalFood[];
  recipes: OwnRecipe[];
  recentDiary: DiaryEntry[];
}): Recommendation[] {
  const { targets, remaining, inventory, foods, recipes, recentDiary } = args;
  const recs: Recommendation[] = [];

  const recentNames = new Set(
    recentDiary.flatMap((e) => e.items.map((i) => i.name.toLowerCase())),
  );
  const edibleStock = inventory.filter(
    (i) =>
      i.id !== undefined &&
      i.amount > 0 &&
      i.nutrimentsPer100 &&
      !(i.bestBefore && daysUntil(i.bestBefore) < 0) &&
      !isIngredient(i.name, i.category),
  );

  // 1. Expiring within two days.
  const expiring = edibleStock
    .filter((i) => i.bestBefore && daysUntil(i.bestBefore) <= 2)
    .sort((a, b) => daysUntil(a.bestBefore!) - daysUntil(b.bestBefore!));
  const first = expiring[0];
  if (first?.id !== undefined) {
    const days = daysUntil(first.bestBefore!);
    const when = days <= 0 ? 'heute' : days === 1 ? 'morgen' : 'übermorgen';
    const others = expiring.slice(1, 3).map((i) => i.name);
    recs.push({
      id: `expiring-${first.id}`,
      kind: 'expiring',
      title: `Zuerst verbrauchen: ${first.name}`,
      detail:
        `Läuft ${when} ab` +
        (others.length ? ` · danach ${others.map(keepTogether).join(', ')}` : ''),
      action: { type: 'log', inventoryId: first.id },
      actionLabel: 'Loggen',
    });
  }

  // 2. Protein lagging behind calories.
  const kcalLeft = ratio(remaining.kcal, targets.kcal);
  const proteinLeft = ratio(remaining.protein, targets.protein);
  if (remaining.protein >= 20 && proteinLeft > kcalLeft + 0.05) {
    const byDensity = (a: { protein: number; kcal: number }) =>
      a.kcal > 0 ? (a.protein * 4) / a.kcal : 0;
    const fromStock = [...edibleStock]
      .filter((i) => byDensity(i.nutrimentsPer100!) >= 0.25)
      .sort(
        (a, b) => byDensity(b.nutrimentsPer100!) - byDensity(a.nutrimentsPer100!),
      );
    const top = fromStock[0];
    const names = fromStock.slice(0, 3).map((i) => i.name);
    const fallback = foods
      .filter((f) => !isIngredient(f.name) && byDensity(f) >= 0.25)
      .sort((a, b) => byDensity(b) - byDensity(a))
      .slice(0, 3)
      .map((f) => f.name);
    recs.push({
      id: 'protein',
      kind: 'protein',
      title: `Noch ${Math.round(remaining.protein)} g Protein offen`,
      detail: names.length
        ? `Im Vorrat: ${names.join(', ')}`
        : `Z. B. ${fallback.join(', ')}`,
      action: top?.id !== undefined ? { type: 'log', inventoryId: top.id } : undefined,
      actionLabel: top ? `${top.name} loggen` : undefined,
    });
  }

  // 3. An own recipe that still fits into today's calories.
  if (remaining.kcal >= 300) {
    const scored = recipes
      .filter(
        (r) =>
          r.id !== undefined &&
          r.nutritionPerServing &&
          r.nutritionPerServing.kcal <= remaining.kcal + 100,
      )
      .map((r) => ({
        recipe: r,
        inStock: r.ingredients.filter((ing) =>
          inventory.some((inv) => inv.amount > 0 && namesMatch(inv.name, ing.name)),
        ).length,
        recent: recentNames.has(r.title.toLowerCase()),
      }))
      .sort(
        (a, b) =>
          Number(a.recent) - Number(b.recent) ||
          b.inStock - a.inStock ||
          b.recipe.nutritionPerServing!.protein - a.recipe.nutritionPerServing!.protein,
      );
    const best = scored[0];
    if (best?.recipe.id !== undefined) {
      const n = best.recipe.nutritionPerServing!;
      recs.push({
        id: `fit-${best.recipe.id}`,
        kind: 'fit',
        title: `Passt noch in deinen Tag: ${best.recipe.title}`,
        detail:
          `${Math.round(n.kcal)} kcal · ${Math.round(n.protein)} g Protein pro Portion` +
          (best.inStock
            ? ` · ${best.inStock}/${best.recipe.ingredients.length} Zutaten da`
            : ''),
        action: { type: 'cook', recipeId: best.recipe.id },
        actionLabel: 'Kochen',
      });
    }
  }

  // 4. Variety, only if there is still room.
  if (recs.length < 3) {
    const fresh = recipes.find(
      (r) =>
        r.id !== undefined &&
        !recentNames.has(r.title.toLowerCase()) &&
        !recs.some((x) => x.id === `fit-${r.id}`),
    );
    if (fresh?.id !== undefined) {
      recs.push({
        id: `variety-${fresh.id}`,
        kind: 'variety',
        title: 'Für Abwechslung',
        detail: `Lange nicht gekocht: ${fresh.title}`,
        action: { type: 'cook', recipeId: fresh.id },
        actionLabel: 'Kochen',
      });
    }
  }

  return recs.slice(0, 3);
}

function ratio(part: number, whole: number): number {
  return whole > 0 ? Math.max(0, part) / whole : 0;
}

/**
 * Cooking ingredients are not a meal: nobody should be told to eat flour,
 * sugar or oil to hit a macro target.
 */
function isIngredient(name: string, category?: string): boolean {
  if (category === 'condiments') return true;
  if (/(mehl|zucker|honig|salz|hefe|backpulver|stärke)/i.test(name)) return true;
  if (/(^|\s)(öl|butter|olivenöl)/i.test(name) || /öl$/i.test(name)) return true;
  return classifyByName(name) === 'condiments';
}

function namesMatch(a: string, b: string): boolean {
  const x = a.trim().toLowerCase();
  const y = b.trim().toLowerCase();
  return x === y || x.includes(y) || y.includes(x);
}

/** "Vollmilch 3,5 %" must not break before the "%" – glue number and unit. */
function keepTogether(name: string): string {
  return name.replace(/(\d) (%|g|kg|ml|l)\b/g, '$1\u00a0$2').replace(/ %/g, '\u00a0%');
}
