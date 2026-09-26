import Dexie, { type Table } from 'dexie';
import dexieCloud from 'dexie-cloud-addon';
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
import { CLOUD_DATABASE_URL } from './cloudConfig';
import { classify, type FoodCategory } from '@/lib/categories';

// Singletons use private ids ("#…"): Dexie Cloud scopes them to the logged-in
// user, so every account has exactly one profile and one settings row.
export const PROFILE_ID = '#profile';
export const SETTINGS_ID = '#settings';

export const DEFAULT_ACCENT = '#247a4e';
/** Previous default; users who never changed it move to the new one. */
const LEGACY_DEFAULT_ACCENT = '#3b6e4f';

/** Name of the pre-sync database (numeric ids), migrated once on startup. */
export const LEGACY_DB_NAME = 'vorrat-ernaehrung';

/** Tables whose rows get a generated id when added without one. */
const ID_PREFIXES: Record<string, string> = {
  weightLog: 'wgt',
  inventory: 'inv',
  shoppingList: 'shp',
  recipesOwn: 'rcp',
  diary: 'dia',
};

function newId(prefix: string): string {
  if (typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return `${prefix}-${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;
}

export class AppDatabase extends Dexie {
  profile!: Table<Profile, string>;
  weightLog!: Table<WeightLog, string>;
  inventory!: Table<InventoryItem, string>;
  shoppingList!: Table<ShoppingItem, string>;
  recipesOwn!: Table<OwnRecipe, string>;
  diary!: Table<DiaryEntry, string>;
  foodsLocal!: Table<LocalFood, string>;
  settings!: Table<Settings, string>;
  categoryHints!: Table<CategoryHint, string>;

  constructor() {
    super('vorrat-ernaehrung-sync', { addons: [dexieCloud] });
    // A new database rather than a version bump: IndexedDB cannot change a
    // table's primary key, and sync needs globally unique string ids instead
    // of auto-incremented numbers. The ids are random UUIDs made on the
    // device (hook below): Dexie Cloud's own "@id" generation refuses to
    // create anything before a first contact with the server, which would
    // break offline use and the migration on first start.
    this.version(1).stores({
      profile: 'id',
      weightLog: 'id, date',
      inventory: 'id, name, location, bestBefore, barcode, addedAt',
      shoppingList: 'id, name, source, addedAt',
      recipesOwn: 'id, title, *tags',
      diary: 'id, datetime, mealType',
      // The bundled food table is reference data – never synced. String ids
      // because the addon rejects auto-increment keys in any table it might
      // sync (it only learns about `unsyncedTables` once a URL is configured).
      foodsLocal: 'id, name',
      settings: 'id',
      categoryHints: 'id',
    });

    for (const [table, prefix] of Object.entries(ID_PREFIXES)) {
      this.table(table).hook('creating', (primKey, obj: { id?: string }) => {
        if (primKey !== undefined) return undefined;
        obj.id = newId(prefix);
        return obj.id;
      });
    }

    if (CLOUD_DATABASE_URL) {
      this.cloud.configure({
        databaseUrl: CLOUD_DATABASE_URL,
        // The app stays fully usable without an account; logging in is an
        // opt-in from the settings (or the onboarding on a second device).
        requireAuth: false,
        customLoginGui: true,
        socialAuth: false,
        // Keep the IndexedDB name stable no matter which cloud DB is used.
        nameSuffix: false,
        unsyncedTables: ['foodsLocal'],
        // The app has its own service worker (vite-plugin-pwa).
        tryUseServiceWorker: false,
      });
    }
  }
}

export const db = new AppDatabase();

/** Whether a cloud database is configured for this build. */
export const cloudEnabled = Boolean(CLOUD_DATABASE_URL);

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
      if (existingSettings?.accentColor.toLowerCase() === LEGACY_DEFAULT_ACCENT) {
        await db.settings.update(SETTINGS_ID, { accentColor: DEFAULT_ACCENT });
      }
      // No default settings row is written: useSettings falls back to the
      // defaults, and a seeded row would overwrite the account's settings
      // when this device logs in for the first time.
      const foodCount = await db.foodsLocal.count();
      if (foodCount === 0) {
        await db.foodsLocal.bulkAdd(
          (SEED_FOODS as LocalFood[]).map((f, i) => ({ ...f, id: `food${i}` })),
        );
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
    const hint = await db.categoryHints.get(hintId(key));
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
  await db.categoryHints.put({ id: hintId(key), name: key, category });
}

function hintId(lowercasedName: string): string {
  return `#hint:${lowercasedName}`;
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
