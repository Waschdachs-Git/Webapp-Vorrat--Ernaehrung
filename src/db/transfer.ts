import Dexie from 'dexie';
import { db, LEGACY_DB_NAME, PROFILE_ID, SETTINGS_ID } from './database';
import type {
  CategoryHint,
  DiaryEntry,
  InventoryItem,
  OwnRecipe,
  Profile,
  Settings,
  ShoppingItem,
  WeightLog,
} from './types';

/** Raw table contents as found in a backup file or the legacy database. */
export interface TableDump {
  profile?: unknown[];
  weightLog?: unknown[];
  inventory?: unknown[];
  shoppingList?: unknown[];
  recipesOwn?: unknown[];
  diary?: unknown[];
  settings?: unknown[];
  categoryHints?: unknown[];
}

const DUMP_TABLES = [
  'profile',
  'weightLog',
  'inventory',
  'shoppingList',
  'recipesOwn',
  'diary',
  'settings',
  'categoryHints',
] as const;

/** The synced tables, i.e. everything that belongs to the user. */
export function userTables() {
  return [
    db.profile,
    db.weightLog,
    db.inventory,
    db.shoppingList,
    db.recipesOwn,
    db.diary,
    db.settings,
    db.categoryHints,
  ];
}

/** Snapshot of all user data (for export). */
export async function dumpUserData(): Promise<TableDump> {
  const dump: TableDump = {};
  for (const table of userTables()) {
    dump[table.name as keyof TableDump] = await table.toArray();
  }
  return dump;
}

/**
 * Write a dump into the database. Ids are never taken over: old dumps have
 * numeric ids, and even string ids from another account must not be reused.
 * Fresh ids are generated and the references between tables (shopping item
 * → inventory, diary item → inventory/recipe) are rewritten to match.
 */
export async function writeDump(
  dump: TableDump,
  { replace }: { replace: boolean },
): Promise<void> {
  await db.transaction('rw', userTables(), async () => {
    if (replace) {
      await Promise.all(userTables().map((t) => t.clear()));
    }

    const profile = rows<Profile>(dump.profile)[0];
    if (profile) await db.profile.put({ ...strip(profile), id: PROFILE_ID });

    const settings = rows<Settings>(dump.settings)[0];
    if (settings) await db.settings.put({ ...strip(settings), id: SETTINGS_ID });

    await db.weightLog.bulkAdd(rows<WeightLog>(dump.weightLog).map(strip));

    const inventory = rows<InventoryItem>(dump.inventory);
    const invIds = await db.inventory.bulkAdd(inventory.map(strip), {
      allKeys: true,
    });
    const invMap = idMap(inventory, invIds);

    const recipes = rows<OwnRecipe>(dump.recipesOwn);
    const recipeIds = await db.recipesOwn.bulkAdd(recipes.map(strip), {
      allKeys: true,
    });
    const recipeMap = idMap(recipes, recipeIds);

    await db.shoppingList.bulkAdd(
      rows<ShoppingItem>(dump.shoppingList).map((s) => ({
        ...strip(s),
        linkedInventoryId: remap(invMap, s.linkedInventoryId),
      })),
    );

    await db.diary.bulkAdd(
      rows<DiaryEntry>(dump.diary).map((e) => ({
        ...strip(e),
        items: (e.items ?? []).map((item) => ({
          ...item,
          refId:
            item.sourceType === 'inventory'
              ? remap(invMap, item.refId)
              : item.sourceType === 'recipe'
                ? remap(recipeMap, item.refId)
                : undefined,
        })),
      })),
    );

    const hints = rows<CategoryHint>(dump.categoryHints).filter((h) => h.name);
    await db.categoryHints.bulkPut(
      hints.map((h) => ({
        id: `#hint:${h.name}`,
        name: h.name,
        category: h.category,
      })),
    );
  });
}

/**
 * One-time move from the pre-sync database (numeric ids) into the synced
 * one. The old database is deleted only after its data has been written.
 */
export async function migrateLegacyDatabase(): Promise<void> {
  if (!(await Dexie.exists(LEGACY_DB_NAME))) return;

  const legacy = new Dexie(LEGACY_DB_NAME);
  await legacy.open(); // dynamic mode: opens whatever schema is there
  const dump: TableDump = {};
  try {
    const present = new Set(legacy.tables.map((t) => t.name));
    for (const name of DUMP_TABLES) {
      if (present.has(name)) dump[name] = await legacy.table(name).toArray();
    }
  } finally {
    legacy.close();
  }

  // Only fill an empty database; if data is already here the migration ran
  // before and just the cleanup did not finish.
  const alreadyFilled =
    (await db.profile.count()) > 0 || (await db.inventory.count()) > 0;
  if (!alreadyFilled) {
    await writeDump(dump, { replace: false });
  }
  await Dexie.delete(LEGACY_DB_NAME);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rows<T>(v: unknown): (T & { id?: any })[] {
  return Array.isArray(v) ? v.filter((r) => r && typeof r === 'object') : [];
}

/** Drop the id and the sync bookkeeping fields of Dexie Cloud. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function strip<T extends Record<string, any>>(row: T): Omit<T, 'id' | 'owner' | 'realmId' | '$ts'> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { id, owner, realmId, $ts, ...rest } = row;
  return rest;
}

function idMap(
  source: { id?: unknown }[],
  newIds: string[],
): Map<string, string> {
  const map = new Map<string, string>();
  source.forEach((row, i) => {
    const newId = newIds[i];
    if (row.id !== undefined && row.id !== null && newId) {
      map.set(String(row.id), newId);
    }
  });
  return map;
}

function remap(map: Map<string, string>, id: unknown): string | undefined {
  return id === undefined || id === null ? undefined : map.get(String(id));
}
