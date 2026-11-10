import { ensureSeeded } from '@/db/database';
import { isRow, sanitizeDump } from '@/db/sanitize';
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
  const tables = await dumpUserData();
  // Credentials do not belong in a file that gets mailed or uploaded: the
  // Spoonacular key stays on the device (and in the synced settings).
  tables.settings = (tables.settings ?? []).map((row) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { spoonacularApiKey, ...rest } = row as Record<string, unknown>;
    return rest;
  });

  const payload: BackupFile = {
    app: 'vorrat-ernaehrung',
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    tables,
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
  // Safari starts the download asynchronously; revoking right away can
  // cancel it.
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export interface ImportResult {
  /** Rows of the file that were unusable and left out. */
  skipped: number;
}

/** Replace all user data from a previously exported JSON file. */
export async function importData(text: string): Promise<ImportResult> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Die Datei ist keine Backup-Datei dieser App.');
  }
  if (!isRow(parsed) || parsed.app !== 'vorrat-ernaehrung' || !isRow(parsed.tables)) {
    throw new Error('Die Datei ist keine Backup-Datei dieser App.');
  }
  if (typeof parsed.version === 'number' && parsed.version > BACKUP_VERSION) {
    throw new Error(
      'Dieses Backup stammt aus einer neueren App-Version. Bitte zuerst die App aktualisieren.',
    );
  }
  // Checked completely before anything is deleted.
  const { dump, skipped } = sanitizeDump(parsed.tables);
  await writeDump(dump, { replace: true });
  await ensureSeeded(true);
  return { skipped };
}
