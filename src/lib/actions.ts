import { classifyWithHints, db } from '@/db/database';
import { nowISO, todayISO } from './date';
import { isSameFood } from './match';
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
  RecipeIngredient,
} from '@/db/types';

/** Time-of-day based default meal type, used to pre-select the picker. */
export function defaultMealType(d = new Date()): MealType {
  const h = d.getHours();
  if (h < 10) return 'breakfast';
  if (h < 15) return 'lunch';
  if (h < 21) return 'dinner';
  return 'snack';
}

/**
 * Everything a booking touches. Each booking runs in one transaction over
 * these tables, so diary and stock can never end up half-updated – and the
 * change reaches other devices as one unit.
 */
function bookingTables() {
  return [db.diary, db.inventory, db.shoppingList];
}

/** Append a diary entry from a list of items. */
async function bookDiary(
  mealType: MealType,
  items: DiaryItem[],
  at: string = nowISO(),
): Promise<string> {
  const entry: DiaryEntry = {
    datetime: at,
    mealType,
    items,
    totals: recalcTotals(items),
  };
  return db.diary.add(entry);
}

/**
 * Log a single food portion: books it into the diary and — when it came from
 * an inventory item — subtracts the amount from stock, then runs auto-restock.
 */
export async function logFood(args: {
  mealType: MealType;
  item: DiaryItem;
  /** Book at this moment instead of now (for adding to an earlier day). */
  at?: string;
}): Promise<string> {
  return db.transaction('rw', bookingTables(), async () => {
    // Never trust a copied value (quick-log passes an old diary item).
    const { stockTaken: _ignored, ...rest } = args.item;
    const item: DiaryItem = rest;
    if (item.sourceType === 'inventory' && item.refId !== undefined) {
      item.stockTaken = await takeFromInventory(item.refId, item.amount);
    }
    const entryId = await bookDiary(args.mealType, [item], args.at);
    await runAutoRestock();
    return entryId;
  });
}

/**
 * Cook a recipe: subtract every ingredient that matches inventory stock and
 * book the recipe's per-serving nutrition (× servings cooked) into the diary.
 */
export async function cookRecipe(args: {
  mealType: MealType;
  recipe: OwnRecipe;
  servingsCooked: number;
  at?: string;
}): Promise<CookResult> {
  const { recipe, servingsCooked, mealType } = args;
  return db.transaction('rw', bookingTables(), async () => {
    const subtracted: { id: string; amount: number }[] = [];
    const inventory = await db.inventory.toArray();

    // Subtract matched ingredients (scaled to the cooked portion of the recipe).
    const factor = servingsCooked / Math.max(1, recipe.servings);
    for (const ing of recipe.ingredients) {
      let need = round1(ing.amount * factor);
      // Oldest stock first; a second package covers what the first lacks.
      for (const stock of stockFor(inventory, ing)) {
        if (!(need > 0) || stock.id === undefined) break;
        const taken = await takeFromInventory(stock.id, need);
        if (taken > 0) {
          // Record what was actually taken so an undo gives exactly that back.
          subtracted.push({ id: stock.id, amount: taken });
          stock.amount = round1(stock.amount - taken);
          need = round1(need - taken);
        }
      }
    }

    const per = recipe.nutritionPerServing ?? EMPTY_NUTRIMENTS;
    const item: DiaryItem = {
      name: recipe.title,
      amount: servingsCooked,
      unit: 'pcs',
      kcal: round1(per.kcal * servingsCooked),
      protein: round1(per.protein * servingsCooked),
      carbs: round1(per.carbs * servingsCooked),
      fat: round1(per.fat * servingsCooked),
      sourceType: 'recipe',
      refId: recipe.id,
    };
    const entryId = await bookDiary(mealType, [item], args.at);
    await runAutoRestock();
    return { entryId, subtracted };
  });
}

/** Stock items an ingredient can be taken from, soonest best-before first. */
function stockFor(inventory: InventoryItem[], ing: RecipeIngredient): InventoryItem[] {
  return inventory
    .filter((inv) => inv.unit === ing.unit && inv.amount > 0 && isSameFood(inv, ing.name))
    .sort((a, b) => (a.bestBefore ?? '9999').localeCompare(b.bestBefore ?? '9999'));
}

export interface CookResult {
  entryId: string;
  subtracted: { id: string; amount: number }[];
}

/** Reverse a cookRecipe call: drop the diary entry, return the ingredients. */
export async function undoCook(result: CookResult): Promise<void> {
  await db.transaction('rw', bookingTables(), async () => {
    await db.diary.delete(result.entryId);
    for (const s of result.subtracted) await restoreInventory(s.id, s.amount);
    await runAutoRestock();
  });
}

/**
 * Take up to `amount` from an inventory item. Returns what was really taken –
 * less than asked for when the item holds less (or is gone).
 */
export async function takeFromInventory(id: string, amount: number): Promise<number> {
  const item = await db.inventory.get(id);
  if (!item || !(amount > 0)) return 0;
  const taken = round1(Math.max(0, Math.min(item.amount, amount)));
  if (taken > 0) {
    await db.inventory.update(id, { amount: round1(item.amount - taken) });
  }
  return taken;
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
  refId?: string;
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

/**
 * Put recipe ingredients on the shopping list, skipping anything that is
 * already open there. Returns the new entries' ids (for undo).
 */
export async function addIngredientsToShoppingList(
  ingredients: RecipeIngredient[],
): Promise<string[]> {
  const open = (await db.shoppingList.toArray()).filter((s) => !s.checked);
  const added: string[] = [];
  for (const ing of ingredients) {
    if (open.some((s) => isSameFood(s, ing.name))) continue;
    const entry = {
      name: ing.name,
      category: await classifyWithHints(ing.name),
      amount: ing.amount > 0 ? ing.amount : undefined,
      unit: ing.amount > 0 ? ing.unit : undefined,
      checked: false,
      source: 'recipe' as const,
      addedAt: nowISO(),
    };
    const id = await db.shoppingList.add(entry);
    open.push({ ...entry, id });
    added.push(id);
  }
  return added;
}

/** Give an amount back to stock (used when a diary entry is reduced/removed). */
export async function restoreInventory(id: string, amount: number): Promise<void> {
  if (!(amount > 0)) return;
  const item = await db.inventory.get(id);
  if (!item) return; // deleted meanwhile – nothing to give it back to
  await db.inventory.update(id, { amount: round1(item.amount + amount) });
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

/** What an item took from stock; older entries did not record it. */
function takenFromStock(item: DiaryItem): number {
  if (item.sourceType !== 'inventory' || item.refId === undefined) return 0;
  return item.stockTaken ?? item.amount;
}

/**
 * Remove one item from a diary entry. Anything that came from stock is
 * credited back. The entry itself is deleted once its last item is gone.
 */
export async function deleteDiaryItem(
  entryId: string,
  itemIndex: number,
): Promise<void> {
  await db.transaction('rw', bookingTables(), async () => {
    const entry = await db.diary.get(entryId);
    const item = entry?.items[itemIndex];
    if (!entry || !item) return;

    if (item.refId !== undefined) {
      await restoreInventory(item.refId, takenFromStock(item));
    }

    const items = entry.items.filter((_, i) => i !== itemIndex);
    if (items.length === 0) {
      await db.diary.delete(entryId);
    } else {
      await db.diary.update(entryId, { items, totals: recalcTotals(items) });
    }
    await runAutoRestock();
  });
}

/**
 * Change the logged amount of one diary item. Nutriments scale proportionally
 * and the difference is applied to stock.
 */
export async function updateDiaryItemAmount(
  entryId: string,
  itemIndex: number,
  newAmount: number,
): Promise<void> {
  await db.transaction('rw', bookingTables(), async () => {
    const entry = await db.diary.get(entryId);
    const item = entry?.items[itemIndex];
    if (!entry || !item || !(newAmount > 0) || !(item.amount > 0)) return;

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
      const taken = takenFromStock(item);
      if (newAmount > item.amount) {
        // Eaten more: take the difference, as far as the stock goes.
        const more = await takeFromInventory(item.refId, newAmount - item.amount);
        updated.stockTaken = round1(taken + more);
      } else {
        // Eaten less: only what exceeds the new amount goes back.
        const keep = Math.min(taken, newAmount);
        await restoreInventory(item.refId, round1(taken - keep));
        updated.stockTaken = round1(keep);
      }
    }

    const items = entry.items.map((it, i) => (i === itemIndex ? updated : it));
    await db.diary.update(entryId, { items, totals: recalcTotals(items) });
    await runAutoRestock();
  });
}

/** Log a previously eaten item again, unchanged (quick log). */
export async function repeatDiaryItem(
  item: DiaryItem,
  mealType: MealType,
  at?: string,
): Promise<string> {
  return logFood({ mealType, item: { ...item }, at });
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
