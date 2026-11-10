import { useObservable } from 'dexie-react-hooks';
import { db } from '@/db/database';
import { accountTablesLoaded } from '@/db/cloudState';

/** The logged-in sync user (or the local "unauthorized" user). */
export function useCloudUser() {
  return useObservable(db.cloud.currentUser);
}

export function useSyncState() {
  return useObservable(db.cloud.syncState);
}

/** True once the first sync after a login has loaded the account's data. */
export function useAccountLoaded(): boolean {
  const state = useObservable(db.cloud.persistedSyncState);
  return accountTablesLoaded(state?.syncedTables);
}

/** Start the e-mail + code login; the dialog is rendered by CloudLoginSheet. */
export function startCloudLogin(): void {
  // Rejects when the user cancels the dialog – nothing to handle then.
  db.cloud.login().catch(() => undefined);
}
