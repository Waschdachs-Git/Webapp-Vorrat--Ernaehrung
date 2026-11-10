import { type ReactNode, useState } from 'react';
import { db, PROFILE_ID, cloudEnabled } from '@/db/database';
import {
  startCloudLogin,
  useAccountLoaded,
  useCloudUser,
  useSyncState,
} from '@/hooks/useCloud';
import {
  ProfileForm,
  emptyDraft,
  draftToProfile,
} from '@/components/ProfileForm';
import { Button } from '@/components/ui';
import { todayISO } from '@/lib/date';

/** First-run onboarding. Shown until a profile exists. */
export function Onboarding({ onDone }: { onDone: () => void }): ReactNode {
  const [draft, setDraft] = useState(emptyDraft());
  const user = useCloudUser();
  const sync = useSyncState();
  // Logged in, but the account's data has not arrived yet. A profile created
  // now would overwrite the one in the account – so the form waits.
  const [startFresh, setStartFresh] = useState(false);
  const loggedIn = cloudEnabled && Boolean(user?.isLoggedIn);
  const accountLoaded = useAccountLoaded();
  const waiting = loggedIn && !accountLoaded && !startFresh;

  const save = async () => {
    const profile = draftToProfile(draft, PROFILE_ID);
    await db.profile.put(profile);
    // Seed the weight log with the starting weight.
    if (profile.weightKg > 0) {
      await db.weightLog.add({ date: todayISO(), weightKg: profile.weightKg });
    }
    onDone();
  };

  return (
    <div className="mx-auto min-h-full max-w-lg px-6 pb-16 pt-[calc(env(safe-area-inset-top)+40px)]">
      <div className="mb-6">
        <p className="text-[15px] font-medium text-muted">
          Willkommen
        </p>
        <h1 className="mt-1 font-serif text-[38px] font-semibold leading-[1.05] tracking-[-0.015em] text-text">
          Vorrat &amp; Ernährung
        </h1>
        {!waiting && (
          <p className="mt-2 text-[15px] text-muted">
            Ein paar Angaben, dann berechnen wir deine Tagesziele. Ohne Anmeldung
            bleibt alles lokal auf diesem Gerät.
          </p>
        )}
      </div>

      {waiting ? (
        <AccountLoading
          email={user?.email ?? ''}
          stalled={sync?.phase === 'error' || sync?.phase === 'offline'}
          onStartFresh={() => setStartFresh(true)}
        />
      ) : (
        <>
          {cloudEnabled && <ExistingAccount email={loggedIn ? (user?.email ?? '') : null} />}

          <ProfileForm
            draft={draft}
            setDraft={setDraft}
            onSubmit={save}
            submitLabel="Los geht's"
          />

          <p className="mt-5 text-center text-[12px] text-faint">
            Die berechneten Werte sind Schätzungen zur Orientierung – keine
            medizinische Beratung.
          </p>
        </>
      )}
    </div>
  );
}

/** Shown instead of the form until the first sync after a login is done. */
function AccountLoading({
  email,
  stalled,
  onStartFresh,
}: {
  email: string;
  stalled: boolean;
  onStartFresh: () => void;
}): ReactNode {
  return (
    <div className="border-y border-border py-6" role="status">
      <p className="text-[15px] text-text">
        Angemeldet als <span className="font-medium">{email}</span>.
      </p>
      {stalled ? (
        <>
          <p className="mt-2 text-[15px] text-muted">
            Deine Daten konnten noch nicht geladen werden – vermutlich fehlt
            gerade die Internetverbindung. Sobald sie da ist, geht es von
            allein weiter.
          </p>
          <div className="mt-4 flex flex-col gap-2">
            <Button
              variant="secondary"
              block
              onClick={() => {
                db.cloud.sync({ purpose: 'pull', wait: false }).catch(() => undefined);
              }}
            >
              Erneut versuchen
            </Button>
            <button
              type="button"
              onClick={onStartFresh}
              className="min-h-[40px] text-[14px] font-medium text-muted active:opacity-60"
            >
              Trotzdem ein neues Profil anlegen
            </button>
          </div>
        </>
      ) : (
        <p className="mt-2 flex items-center gap-2.5 text-[15px] text-muted">
          <span
            aria-hidden
            className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-border border-t-accent"
          />
          Deine Daten werden geladen …
        </p>
      )}
    </div>
  );
}

/**
 * Second device: log in instead of filling the form. Once the first sync has
 * brought the profile down, the app leaves onboarding by itself.
 */
function ExistingAccount({ email }: { email: string | null }): ReactNode {
  if (email !== null) {
    return (
      <p className="mb-6 border-y border-border py-3 text-[14px] text-muted">
        Angemeldet als <span className="font-medium text-text">{email}</span>. In
        deinem Konto gibt es noch kein Profil – leg es hier an.
      </p>
    );
  }

  return (
    <div className="mb-6 flex items-center justify-between gap-3 border-y border-border py-3">
      <p className="text-[14px] text-muted">Schon auf einem anderen Gerät eingerichtet?</p>
      <button
        type="button"
        onClick={startCloudLogin}
        className="shrink-0 py-1 text-[15px] font-semibold text-accent"
      >
        Anmelden
      </button>
    </div>
  );
}
