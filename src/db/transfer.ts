import Dexie, { type Table } from 'dexie';
import {
  db,
  DEFAULT_ACCENT,
  LEGACY_DB_NAME,
  PROFILE_ID,
  SETTINGS_ID,
} from './database';
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

const DEFAULT_SETTINGS: Omit<Settings, 'id'> = {
  accentColor: DEFAULT_ACCENT,
  theme: 'system',
};

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

/**
 * Snapshot of all user data (for export). Ids are kept so the references
 * between rows survive; the sync bookkeeping (owner, realm) is left out –
 * it is of no use in a file and would put the account's e-mail into it.
 */
export async function dumpUserData(): Promise<TableDump> {
  const dump: TableDump = {};
  for (const table of userTables()) {
    const all = (await table.toArray()) as unknown as Record<string, unknown>[];
    dump[table.name as keyof TableDump] = all.map((row) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { owner, realmId, $ts, ...rest } = row;
      return rest;
    });
  }
  return dump;
}

/**
 * Write a dump into the database. Ids are normally not taken over: old dumps
 * have numeric ids, and string ids from another account must not be reused.
 * Fresh ids are generated and the references between tables (shopping item
 * → inventory, diary item → inventory/recipe) are rewritten to match.
 *
 * Two exceptions keep their id: private ids ("#…", scoped to the account by
 * Dexie Cloud – the starter recipes use them so two devices agree on the
 * record), and everything when `keepIds` is set, which is for putting this
 * device's own data back.
 */
export async function writeDump(
  dump: TableDump,
  { replace, keepIds = false }: { replace: boolean; keepIds?: boolean },
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const row = <T extends Record<string, any>>(source: T) => {
    const rest = strip(source);
    const id: unknown = source.id;
    const keep = typeof id === 'string' && (keepIds || id.startsWith('#'));
    return keep ? { ...rest, id } : rest;
  };

  await db.transaction('rw', userTables(), async () => {
    const profile = rows<Profile>(dump.profile)[0];
    const settings = rows<Settings>(dump.settings)[0];
    // The API key is not part of a backup file; an import must not erase it.
    const currentKey = (await db.settings.get(SETTINGS_ID))?.spoonacularApiKey;

    if (replace) {
      // A file without a (valid) profile or settings keeps the current ones:
      // "replace" must not strand the user back in the onboarding.
      const keep = new Set<string>();
      if (!profile) keep.add(db.profile.name);
      if (!settings) keep.add(db.settings.name);
      await Promise.all(
        userTables()
          .filter((t) => !keep.has(t.name))
          .map((t) => t.clear()),
      );
    }

    if (profile) await db.profile.put({ ...strip(profile), id: PROFILE_ID });

    if (settings) {
      const next = { ...DEFAULT_SETTINGS, ...strip(settings), id: SETTINGS_ID };
      if (!next.spoonacularApiKey && currentKey) next.spoonacularApiKey = currentKey;
      await db.settings.put(next);
    }

    await insert(db.weightLog, rows<WeightLog>(dump.weightLog).map(row) as WeightLog[]);

    const inventory = rows<InventoryItem>(dump.inventory);
    const invIds = await insert(db.inventory, inventory.map(row) as InventoryItem[]);
    const invMap = idMap(inventory, invIds);

    const recipes = rows<OwnRecipe>(dump.recipesOwn);
    const recipeIds = await insert(db.recipesOwn, recipes.map(row) as OwnRecipe[]);
    const recipeMap = idMap(recipes, recipeIds);

    await insert(
      db.shoppingList,
      rows<ShoppingItem>(dump.shoppingList).map((s) => ({
        ...row(s),
        linkedInventoryId: remap(invMap, s.linkedInventoryId),
      })) as ShoppingItem[],
    );

    await insert(
      db.diary,
      rows<DiaryEntry>(dump.diary).map((e) => ({
        ...row(e),
        items: (e.items ?? []).map((item) => ({
          ...item,
          refId:
            item.sourceType === 'inventory'
              ? remap(invMap, item.refId)
              : item.sourceType === 'recipe'
                ? remap(recipeMap, item.refId)
                : undefined,
        })),
      })) as DiaryEntry[],
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

/**
 * Insert rows and return their keys in the same order. Rows that bring an
 * id are put (a second run must not fail on it); the others are added and
 * get a generated id.
 */
async function insert<T extends { id?: string }>(
  table: Table<T, string>,
  items: T[],
): Promise<string[]> {
  const keys = new Array<string>(items.length);
  const withId: number[] = [];
  const withoutId: number[] = [];
  items.forEach((item, i) => (item.id !== undefined ? withId : withoutId).push(i));
  if (withId.length > 0) {
    const put = await table.bulkPut(
      withId.map((i) => items[i]!),
      { allKeys: true },
    );
    withId.forEach((i, n) => (keys[i] = put[n]!));
  }
  if (withoutId.length > 0) {
    const added = await table.bulkAdd(
      withoutId.map((i) => items[i]!),
      { allKeys: true },
    );
    withoutId.forEach((i, n) => (keys[i] = added[n]!));
  }
  return keys;
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
