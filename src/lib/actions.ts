import { db } from '@/db/database';
import { nowISO, todayISO } from './date';
import {
  addNutriments,
  EMPTY_NUTRIMENTS,
  round1,
  scaleNutriments,
} from './nutrition';
import type {
  DiaryEntry,
  DiaryItem,
  InventoryItem,
  MealType,
  Nutriments,
  OwnRecipe,
} from '@/db/types';

/** Time-of-day based default meal type, used to pre-select the picker. */
export function defaultMealType(d = new Date()): MealType {
  const h = d.getHours();
  if (h < 10) return 'breakfast';
  if (h < 15) return 'lunch';
  if (h < 21) return 'dinner';
  return 'snack';
}

/** Append a diary entry from a list of items. */
async function bookDiary(mealType: MealType, items: DiaryItem[]): Promise<void> {
  const totals = items.reduce<Nutriments>(
    (acc, i) =>
      addNutriments(acc, {
        kcal: i.kcal,
        protein: i.protein,
        carbs: i.carbs,
        fat: i.fat,
      }),
    { ...EMPTY_NUTRIMENTS },
  );
  const entry: DiaryEntry = {
    datetime: nowISO(),
    mealType,
    items,
    totals,
  };
  await db.diary.add(entry);
}

/**
 * Log a single food portion: books it into the diary and — when it came from
 * an inventory item — subtracts the amount from stock, then runs auto-restock.
 */
export async function logFood(args: {
  mealType: MealType;
  item: DiaryItem;
}): Promise<void> {
  await bookDiary(args.mealType, [args.item]);
  if (args.item.sourceType === 'inventory' && args.item.refId !== undefined) {
    await subtractInventory(args.item.refId, args.item.amount);
  }
  await runAutoRestock();
}

/**
 * Cook a recipe: subtract every ingredient that matches inventory stock and
 * book the recipe's per-serving nutrition (× servings cooked) into the diary.
 */
export async function cookRecipe(args: {
  mealType: MealType;
  recipe: OwnRecipe;
  servingsCooked: number;
}): Promise<void> {
  const { recipe, servingsCooked, mealType } = args;
  const inventory = await db.inventory.toArray();

  // Subtract matched ingredients (scaled to the cooked portion of the recipe).
  const factor = servingsCooked / Math.max(1, recipe.servings);
  for (const ing of recipe.ingredients) {
    const match = inventory.find(
      (inv) =>
        inv.unit === ing.unit && namesMatch(inv.name, ing.name) && inv.amount > 0,
    );
    if (match?.id !== undefined) {
      await subtractInventory(match.id, ing.amount * factor);
    }
  }

  const per = recipe.nutritionPerServing ?? EMPTY_NUTRIMENTS;
  const scaled: Nutriments = {
    kcal: per.kcal * servingsCooked,
    protein: per.protein * servingsCooked,
    carbs: per.carbs * servingsCooked,
    fat: per.fat * servingsCooked,
  };
  const item: DiaryItem = {
    name: recipe.title,
    amount: servingsCooked,
    unit: 'pcs',
    kcal: scaled.kcal,
    protein: scaled.protein,
    carbs: scaled.carbs,
    fat: scaled.fat,
    sourceType: 'recipe',
    refId: recipe.id,
  };
  await bookDiary(mealType, [item]);
  await runAutoRestock();
}

/** Reduce an inventory item's amount, clamping at 0. */
export async function subtractInventory(id: number, amount: number): Promise<void> {
  const item = await db.inventory.get(id);
  if (!item) return;
  const next = Math.max(0, Math.round((item.amount - amount) * 10) / 10);
  await db.inventory.update(id, { amount: next });
}

/**
 * Build a scaled diary item from per-100 g nutriments.
 *
 * `amount` is the logged quantity in the item's own unit (and what gets
 * subtracted from stock). `nutritionAmount` is the quantity in grams/ml used
 * for the nutrition maths — they differ for items measured in pieces, where
 * grams = pieces x gramsPerPiece.
 */
export function diaryItemFromPer100(args: {
  name: string;
  amount: number;
  unit: DiaryItem['unit'];
  per100: Nutriments;
  sourceType: DiaryItem['sourceType'];
  refId?: number;
  nutritionAmount?: number;
}): DiaryItem {
  const n = scaleNutriments(args.per100, args.nutritionAmount ?? args.amount);
  return {
    name: args.name,
    amount: args.amount,
    unit: args.unit,
    kcal: n.kcal,
    protein: n.protein,
    carbs: n.carbs,
    fat: n.fat,
    sourceType: args.sourceType,
    refId: args.refId,
  };
}

/**
 * Auto-restock: staples below their minStock get added to the shopping list
 * (no duplicates); they are removed again once refilled above the threshold.
 */
export async function runAutoRestock(): Promise<void> {
  const [inventory, shopping] = await Promise.all([
    db.inventory.toArray(),
    db.shoppingList.toArray(),
  ]);

  for (const item of inventory) {
    if (!item.isStaple || item.minStock === undefined || item.id === undefined) {
      continue;
    }
    const low = item.amount < item.minStock;
    const existing = shopping.find(
      (s) => s.source === 'auto-restock' && s.linkedInventoryId === item.id,
    );

    if (low && !existing) {
      await db.shoppingList.add({
        name: item.name,
        category: item.category,
        amount: item.minStock,
        unit: item.unit,
        checked: false,
        source: 'auto-restock',
        linkedInventoryId: item.id,
        addedAt: nowISO(),
      });
    } else if (!low && existing?.id !== undefined && !existing.checked) {
      // Refilled again -> remove the auto-generated entry.
      await db.shoppingList.delete(existing.id);
    }
  }
}

/** Give an amount back to stock (used when a diary entry is reduced/removed). */
export async function restoreInventory(id: number, amount: number): Promise<void> {
  const item = await db.inventory.get(id);
  if (!item) return;
  const next = Math.max(0, Math.round((item.amount + amount) * 10) / 10);
  await db.inventory.update(id, { amount: next });
}

/** Recalculate an entry's totals from its items. */
function recalcTotals(items: DiaryItem[]): Nutriments {
  return items.reduce<Nutriments>(
    (acc, i) =>
      addNutriments(acc, {
        kcal: i.kcal,
        protein: i.protein,
        carbs: i.carbs,
        fat: i.fat,
      }),
    { ...EMPTY_NUTRIMENTS },
  );
}

/**
 * Remove one item from a diary entry. Anything that came from stock is
 * credited back. The entry itself is deleted once its last item is gone.
 */
export async function deleteDiaryItem(
  entryId: number,
  itemIndex: number,
): Promise<void> {
  const entry = await db.diary.get(entryId);
  const item = entry?.items[itemIndex];
  if (!entry || !item) return;

  if (item.sourceType === 'inventory' && item.refId !== undefined) {
    await restoreInventory(item.refId, item.amount);
  }

  const items = entry.items.filter((_, i) => i !== itemIndex);
  if (items.length === 0) {
    await db.diary.delete(entryId);
  } else {
    await db.diary.update(entryId, { items, totals: recalcTotals(items) });
  }
  await runAutoRestock();
}

/**
 * Change the logged amount of one diary item. Nutriments scale proportionally
 * and the difference is applied to stock.
 */
export async function updateDiaryItemAmount(
  entryId: number,
  itemIndex: number,
  newAmount: number,
): Promise<void> {
  const entry = await db.diary.get(entryId);
  const item = entry?.items[itemIndex];
  if (!entry || !item || newAmount <= 0 || item.amount <= 0) return;

  const factor = newAmount / item.amount;
  const updated: DiaryItem = {
    ...item,
    amount: newAmount,
    kcal: round1(item.kcal * factor),
    protein: round1(item.protein * factor),
    carbs: round1(item.carbs * factor),
    fat: round1(item.fat * factor),
  };

  if (item.sourceType === 'inventory' && item.refId !== undefined) {
    const delta = newAmount - item.amount;
    if (delta > 0) await subtractInventory(item.refId, delta);
    else if (delta < 0) await restoreInventory(item.refId, -delta);
  }

  const items = entry.items.map((it, i) => (i === itemIndex ? updated : it));
  await db.diary.update(entryId, { items, totals: recalcTotals(items) });
  await runAutoRestock();
}

/** Log a previously eaten item again, unchanged (quick log). */
export async function repeatDiaryItem(
  item: DiaryItem,
  mealType: MealType,
): Promise<void> {
  await logFood({ mealType, item: { ...item } });
}

function namesMatch(a: string, b: string): boolean {
  const x = a.trim().toLowerCase();
  const y = b.trim().toLowerCase();
  return x === y || x.includes(y) || y.includes(x);
}

export function isExpiringSoon(item: InventoryItem, days = 3): boolean {
  if (!item.bestBefore) return false;
  const target = new Date(item.bestBefore + 'T00:00:00').getTime();
  const now = new Date(todayISO() + 'T00:00:00').getTime();
  return (target - now) / 86_400_000 <= days;
}

export function isLowStaple(item: InventoryItem): boolean {
  return (
    item.isStaple && item.minStock !== undefined && item.amount < item.minStock
  );
}
