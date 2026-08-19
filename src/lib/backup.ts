import { db, ensureSeeded } from '@/db/database';

const BACKUP_VERSION = 1;

interface BackupFile {
  app: 'vorrat-ernaehrung';
  version: number;
  exportedAt: string;
  tables: {
    profile: unknown[];
    weightLog: unknown[];
    inventory: unknown[];
    shoppingList: unknown[];
    recipesOwn: unknown[];
    diary: unknown[];
    foodsLocal: unknown[];
    settings: unknown[];
  };
}

/** Export all local data to a downloadable JSON file. */
export async function exportData(): Promise<void> {
  const payload: BackupFile = {
    app: 'vorrat-ernaehrung',
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    tables: {
      profile: await db.profile.toArray(),
      weightLog: await db.weightLog.toArray(),
      inventory: await db.inventory.toArray(),
      shoppingList: await db.shoppingList.toArray(),
      recipesOwn: await db.recipesOwn.toArray(),
      diary: await db.diary.toArray(),
      foodsLocal: await db.foodsLocal.toArray(),
      settings: await db.settings.toArray(),
    },
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `vorrat-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Replace all local data from a previously exported JSON file. */
export async function importData(text: string): Promise<void> {
  const parsed = JSON.parse(text) as Partial<BackupFile>;
  if (parsed.app !== 'vorrat-ernaehrung' || !parsed.tables) {
    throw new Error('Ungültige Backup-Datei.');
  }
  const t = parsed.tables;

  await db.transaction(
    'rw',
    [
      db.profile,
      db.weightLog,
      db.inventory,
      db.shoppingList,
      db.recipesOwn,
      db.diary,
      db.foodsLocal,
      db.settings,
    ],
    async () => {
      await Promise.all([
        db.profile.clear(),
        db.weightLog.clear(),
        db.inventory.clear(),
        db.shoppingList.clear(),
        db.recipesOwn.clear(),
        db.diary.clear(),
        db.foodsLocal.clear(),
        db.settings.clear(),
      ]);
      await db.profile.bulkAdd(asArray(t.profile));
      await db.weightLog.bulkAdd(asArray(t.weightLog));
      await db.inventory.bulkAdd(asArray(t.inventory));
      await db.shoppingList.bulkAdd(asArray(t.shoppingList));
      await db.recipesOwn.bulkAdd(asArray(t.recipesOwn));
      await db.diary.bulkAdd(asArray(t.diary));
      await db.foodsLocal.bulkAdd(asArray(t.foodsLocal));
      await db.settings.bulkAdd(asArray(t.settings));
    },
  );

  await ensureSeeded(true);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asArray(v: unknown): any[] {
  return Array.isArray(v) ? v : [];
}
