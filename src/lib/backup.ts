import { ensureSeeded } from '@/db/database';
import { dumpUserData, writeDump, type TableDump } from '@/db/transfer';

// v2: string ids (sync). v1 files with numeric ids still import fine because
// ids are regenerated on import anyway.
const BACKUP_VERSION = 2;

interface BackupFile {
  app: 'vorrat-ernaehrung';
  version: number;
  exportedAt: string;
  tables: TableDump;
}

/** Export all user data to a downloadable JSON file. */
export async function exportData(): Promise<void> {
  const payload: BackupFile = {
    app: 'vorrat-ernaehrung',
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    tables: await dumpUserData(),
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

/** Replace all user data from a previously exported JSON file. */
export async function importData(text: string): Promise<void> {
  const parsed = JSON.parse(text) as Partial<BackupFile>;
  if (parsed.app !== 'vorrat-ernaehrung' || !parsed.tables) {
    throw new Error('Ungültige Backup-Datei.');
  }
  await writeDump(parsed.tables, { replace: true });
  await ensureSeeded(true);
}
