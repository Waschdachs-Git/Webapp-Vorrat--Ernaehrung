import { db } from './database';
import { loggedInToSync } from './cloudState';
import { dumpUserData, userTables, writeDump, type TableDump } from './transfer';

/**
 * "Load the data from my account" on a device that already holds data means
 * emptying it first – whatever is local at login is uploaded and would mix
 * into the account. The login that follows can still be abandoned: cancelled,
 * a mistyped address, or iOS closing the app while the code is fetched from
 * Mail. So the device's data is parked here before it is cleared and put
 * back if no login happened.
 */
const STASH_KEY = 'vorrat:pre-login-data';

export async function stashAndClearLocalData(): Promise<void> {
  const dump = await dumpUserData();
  try {
    localStorage.setItem(STASH_KEY, JSON.stringify(dump));
  } catch {
    // Nothing has been deleted at this point.
    throw new Error(
      'Die Daten dieses Geräts konnten nicht zwischengespeichert werden. Bitte sichere sie zuerst über „Export“.',
    );
  }
  // While logged out nothing is tracked for sync, so clearing stays local.
  await db.transaction('rw', userTables(), () =>
    Promise.all(userTables().map((t) => t.clear())),
  );
}

function readStash(): TableDump | null {
  try {
    const raw = localStorage.getItem(STASH_KEY);
    return raw ? (JSON.parse(raw) as TableDump) : null;
  } catch {
    return null;
  }
}

function dropStash(): void {
  try {
    localStorage.removeItem(STASH_KEY);
  } catch {
    // Storage unavailable – then there was no stash either.
  }
}

/**
 * Settle a parked data set: forget it once the device is logged in, put it
 * back when the login was abandoned. Returns true if data was restored.
 * Safe to call at every start; without a stash it does nothing.
 */
export async function settleLoginStash(): Promise<boolean> {
  const stash = readStash();
  if (!stash) return false;

  const loggedIn = await loggedInToSync();
  if (loggedIn === undefined) return false; // unknown – decide next time
  if (loggedIn) {
    dropStash();
    return false;
  }
  // Only into an empty device: if a new profile was set up meanwhile, the
  // user chose to start over.
  const empty = (await db.profile.count()) === 0 && (await db.inventory.count()) === 0;
  if (empty) await writeDump(stash, { replace: false, keepIds: true });
  dropStash();
  return empty;
}
