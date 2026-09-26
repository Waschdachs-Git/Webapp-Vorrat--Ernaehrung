import { useObservable } from 'dexie-react-hooks';
import { db } from '@/db/database';

/** The logged-in sync user (or the local "unauthorized" user). */
export function useCloudUser() {
  return useObservable(db.cloud.currentUser);
}

export function useSyncState() {
  return useObservable(db.cloud.syncState);
}

/** Start the e-mail + code login; the dialog is rendered by CloudLoginSheet. */
export function startCloudLogin(): void {
  // Rejects when the user cancels the dialog – nothing to handle then.
  db.cloud.login().catch(() => undefined);
}
