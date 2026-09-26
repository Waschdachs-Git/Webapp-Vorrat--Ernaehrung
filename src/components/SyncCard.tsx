import { type ReactNode, useState } from 'react';
import { Cloud, RefreshCw } from 'lucide-react';
import { db, ensureSeeded } from '@/db/database';
import { userTables } from '@/db/transfer';
import { startCloudLogin, useCloudUser, useSyncState } from '@/hooks/useCloud';
import { Button, Card, cx } from './ui';

/** Settings card: log in to sync between devices, see the sync status. */
export function SyncCard(): ReactNode {
  const user = useCloudUser();
  const loggedIn = Boolean(user?.isLoggedIn);

  return (
    <Card>
      <div className="mb-1 flex items-center gap-2">
        <Cloud size={18} className="text-muted" />
        <h2 className="font-serif text-[21px] font-semibold tracking-[-0.01em] text-text">
          Synchronisierung
        </h2>
      </div>
      {loggedIn ? <LoggedIn email={user?.email ?? user?.userId ?? ''} /> : <LoggedOut />}
    </Card>
  );
}

function LoggedIn({ email }: { email: string }): ReactNode {
  const sync = useSyncState();
  const [syncing, setSyncing] = useState(false);
  const status = describe(sync?.phase, sync?.error);

  const syncNow = async () => {
    setSyncing(true);
    try {
      await db.cloud.sync({ purpose: 'pull', wait: true });
    } catch {
      // The status line shows the error.
    } finally {
      setSyncing(false);
    }
  };

  const logout = async () => {
    try {
      await db.cloud.logout();
    } catch {
      return; // cancelled in the confirmation dialog
    }
    // Logging out empties the local database; restore the bundled foods.
    await ensureSeeded(true);
  };

  return (
    <>
      <p className="mb-3 text-[14px] text-muted">
        Angemeldet als <span className="font-medium text-text">{email}</span>
      </p>
      <p className="mb-4 flex items-center gap-2 text-[14px]">
        <span
          aria-hidden
          className={cx('h-2 w-2 shrink-0 rounded-full', {
            ok: 'bg-accent',
            busy: 'bg-warn',
            offline: 'bg-faint',
            error: 'bg-danger',
          }[status.tone])}
        />
        <span className={status.tone === 'error' ? 'text-danger' : 'text-text'}>
          {status.text}
        </span>
      </p>
      <div className="flex gap-2">
        <Button variant="secondary" block onClick={syncNow} disabled={syncing}>
          <RefreshCw size={16} className={syncing ? 'animate-spin' : undefined} />
          Jetzt abgleichen
        </Button>
        <Button variant="danger" block onClick={logout}>
          Abmelden
        </Button>
      </div>
      <p className="mt-3 text-[12.5px] text-faint">
        Beim Abmelden werden die Daten von diesem Gerät entfernt – in deinem
        Konto bleiben sie erhalten.
      </p>
    </>
  );
}

function LoggedOut(): ReactNode {
  const [confirmReplace, setConfirmReplace] = useState(false);

  // Second device: start empty so nothing from here overwrites the account.
  // While logged out nothing is tracked for sync, so clearing stays local.
  const replaceAndLogin = async () => {
    await db.transaction('rw', userTables(), () =>
      Promise.all(userTables().map((t) => t.clear())),
    );
    startCloudLogin();
  };

  return (
    <>
      <p className="mb-4 text-[14px] text-muted">
        Melde dich auf iPhone und iPad mit derselben E-Mail an. Dann sind
        Vorrat, Einkaufsliste, Rezepte und Tagebuch auf beiden Geräten gleich.
        Die Daten dieses Geräts kommen dabei in dein Konto.
      </p>
      <Button block onClick={startCloudLogin}>
        Anmelden
      </Button>

      {!confirmReplace ? (
        <button
          type="button"
          onClick={() => setConfirmReplace(true)}
          className="mt-3 w-full py-2 text-center text-[14px] font-medium text-accent"
        >
          Konto schon auf einem anderen Gerät? Daten von dort laden
        </button>
      ) : (
        <div className="mt-4 rounded-xl border border-danger/30 bg-danger/5 p-3">
          <p className="text-[14px] font-medium text-text">
            Daten auf diesem Gerät ersetzen
          </p>
          <p className="mt-1 text-[13px] text-muted">
            Alles, was hier gespeichert ist, wird gelöscht. Nach dem Anmelden
            lädt die App die Daten aus deinem Konto.
          </p>
          <div className="mt-3 flex gap-2">
            <Button variant="secondary" block onClick={() => setConfirmReplace(false)}>
              Abbrechen
            </Button>
            <Button variant="danger" block onClick={replaceAndLogin}>
              Ersetzen &amp; anmelden
            </Button>
          </div>
        </div>
      )}
    </>
  );
}

function describe(
  phase: string | undefined,
  error: Error | undefined,
): { text: string; tone: 'ok' | 'busy' | 'offline' | 'error' } {
  switch (phase) {
    case 'in-sync':
      return { text: 'Alles abgeglichen', tone: 'ok' };
    case 'offline':
      return { text: 'Offline – Änderungen werden später übertragen', tone: 'offline' };
    case 'error':
      return {
        text: `Abgleich fehlgeschlagen${error?.message ? `: ${error.message}` : ''}`,
        tone: 'error',
      };
    default:
      return { text: 'Wird abgeglichen …', tone: 'busy' };
  }
}
