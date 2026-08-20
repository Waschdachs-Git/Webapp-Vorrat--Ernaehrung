import Dexie, { type Table } from 'dexie';
import type {
  Profile,
  WeightLog,
  InventoryItem,
  ShoppingItem,
  OwnRecipe,
  DiaryEntry,
  LocalFood,
  Settings,
  CategoryHint,
} from './types';
import { SEED_FOODS } from './seed';
import { classify, type FoodCategory } from '@/lib/categories';

export const PROFILE_ID = 1;
export const SETTINGS_ID = 1;

export const DEFAULT_ACCENT = '#3b6e4f';

export class AppDatabase extends Dexie {
  profile!: Table<Profile, number>;
  weightLog!: Table<WeightLog, number>;
  inventory!: Table<InventoryItem, number>;
  shoppingList!: Table<ShoppingItem, number>;
  recipesOwn!: Table<OwnRecipe, number>;
  diary!: Table<DiaryEntry, number>;
  foodsLocal!: Table<LocalFood, number>;
  settings!: Table<Settings, number>;
  categoryHints!: Table<CategoryHint, string>;

  constructor() {
    super('vorrat-ernaehrung');
    this.version(1).stores({
      // Only indexed fields are listed; objects are stored whole.
      profile: 'id',
      weightLog: '++id, date',
      inventory: '++id, name, location, isStaple, bestBefore, barcode',
      shoppingList: '++id, name, checked, source',
      recipesOwn: '++id, title, *tags',
      diary: '++id, datetime, mealType',
      foodsLocal: '++id, name',
      settings: 'id',
    });

    // v2: IndexedDB cannot index boolean values, so the `isStaple` and
    // `checked` indexes never held any records — they were dead weight and
    // made `where('checked')` look usable when it always returns nothing.
    // `addedAt` replaces them where an index is actually useful.
    this.version(2).stores({
      inventory: '++id, name, location, bestBefore, barcode, addedAt',
      shoppingList: '++id, name, source, addedAt',
    });

    // v3: remembered category corrections, keyed by the lowercased name.
    this.version(3).stores({
      categoryHints: 'name',
    });
  }
}

export const db = new AppDatabase();

let seedPromise: Promise<void> | null = null;

/**
 * Ensure default settings and seed foods exist. Idempotent + de-duped.
 * Pass `force` after replacing the database (import) so the memoised promise
 * does not swallow the re-seed.
 */
export function ensureSeeded(force = false): Promise<void> {
  if (force) seedPromise = null;
  if (!seedPromise) {
    seedPromise = (async () => {
      const existingSettings = await db.settings.get(SETTINGS_ID);
      if (!existingSettings) {
        await db.settings.put({
          id: SETTINGS_ID,
          accentColor: DEFAULT_ACCENT,
          theme: 'system',
        });
      }
      const foodCount = await db.foodsLocal.count();
      if (foodCount === 0) {
        await db.foodsLocal.bulkAdd(SEED_FOODS as LocalFood[]);
      }
    })();
  }
  return seedPromise;
}

/**
 * Classification with the learned layer in front: a correction the user made
 * for this name wins over both the OFF tags and the keyword rules.
 */
export async function classifyWithHints(
  name: string,
  offTags?: string[],
): Promise<FoodCategory> {
  const key = name.trim().toLowerCase();
  if (key) {
    const hint = await db.categoryHints.get(key);
    if (hint) return hint.category;
  }
  return classify(name, offTags);
}

/** Remember a manual correction so the same product lands right next time. */
export async function rememberCategory(
  name: string,
  category: FoodCategory,
): Promise<void> {
  const key = name.trim().toLowerCase();
  if (!key) return;
  await db.categoryHints.put({ name: key, category });
}

/**
 * One-off pass over items that predate the category feature. Runs on startup
 * and only touches rows that have no category yet.
 */
export async function backfillCategories(): Promise<void> {
  const items = await db.inventory.toArray();
  for (const item of items) {
    if (item.category || item.id === undefined) continue;
    await db.inventory.update(item.id, {
      category: await classifyWithHints(item.name),
    });
  }
  const shopping = await db.shoppingList.toArray();
  for (const entry of shopping) {
    if (entry.category || entry.id === undefined) continue;
    await db.shoppingList.update(entry.id, {
      category: await classifyWithHints(entry.name),
    });
  }
}
