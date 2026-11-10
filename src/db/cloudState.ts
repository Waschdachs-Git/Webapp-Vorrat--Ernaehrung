import { cloudEnabled, db } from './database';

interface Subscribable<T> {
  subscribe(next: (value: T) => void): { unsubscribe(): void };
}

/** First value passing `test`, or undefined after `timeoutMs`. */
function firstMatching<T>(
  source: Subscribable<T>,
  test: (value: T) => boolean,
  timeoutMs: number,
): Promise<T | undefined> {
  return new Promise((resolve) => {
    let done = false;
    let subscription: { unsubscribe(): void } | undefined;
    const finish = (value: T | undefined) => {
      if (done) return;
      done = true;
      window.clearTimeout(timer);
      subscription?.unsubscribe();
      resolve(value);
    };
    const timer = window.setTimeout(() => finish(undefined), timeoutMs);
    subscription = source.subscribe((value) => {
      if (test(value)) finish(value);
    });
    // BehaviorSubjects emit during subscribe(), before `subscription` is set.
    if (done) subscription.unsubscribe();
  });
}

/**
 * Whether this device is logged in to sync – once that is known. The addon
 * loads the stored login asynchronously; `undefined` means it did not report
 * in time.
 */
export async function loggedInToSync(timeoutMs = 5000): Promise<boolean | undefined> {
  if (!cloudEnabled) return false;
  // The stored login is only read once the database is open.
  await db.open().catch(() => undefined);
  const user = await firstMatching(db.cloud.currentUser, (u) => !u.isLoading, timeoutMs);
  return user ? Boolean(user.isLoggedIn) : undefined;
}

/**
 * True when the local data reflects the account: not logged in (nothing to
 * wait for), or logged in and the first sync of that login has brought the
 * tables down. False when that could not be established in time (offline).
 *
 * Deliberately not the sync *phase*: that can still read "in-sync" from
 * before the login. The addon records the tables it has synced for the
 * logged-in user, which is exactly the question.
 */
export async function caughtUpWithAccount(): Promise<boolean> {
  const loggedIn = await loggedInToSync();
  if (loggedIn === undefined) return false;
  if (!loggedIn) return true;
  const state = await firstMatching(
    db.cloud.persistedSyncState,
    (s) => accountTablesLoaded(s?.syncedTables),
    20000,
  );
  return state !== undefined;
}

/** Whether the tables of the logged-in account have been synced once. */
export function accountTablesLoaded(syncedTables: string[] | undefined): boolean {
  return Boolean(syncedTables?.includes('profile'));
}
