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
} from './types';
import { SEED_FOODS } from './seed';

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
