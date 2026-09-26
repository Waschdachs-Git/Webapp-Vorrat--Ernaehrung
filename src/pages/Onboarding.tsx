import { type ReactNode, useState } from 'react';
import { db, PROFILE_ID, cloudEnabled } from '@/db/database';
import { startCloudLogin, useCloudUser, useSyncState } from '@/hooks/useCloud';
import {
  ProfileForm,
  emptyDraft,
  draftToProfile,
} from '@/components/ProfileForm';
import { todayISO } from '@/lib/date';

/** First-run onboarding. Shown until a profile exists. */
export function Onboarding({ onDone }: { onDone: () => void }): ReactNode {
  const [draft, setDraft] = useState(emptyDraft());

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
        <p className="mt-2 text-[15px] text-muted">
          Ein paar Angaben, dann berechnen wir deine Tagesziele. Ohne Anmeldung
          bleibt alles lokal auf diesem Gerät.
        </p>
      </div>

      {cloudEnabled && <ExistingAccount />}

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
    </div>
  );
}

/**
 * Second device: log in instead of filling the form. Once the first sync has
 * brought the profile down, the app leaves onboarding by itself.
 */
function ExistingAccount(): ReactNode {
  const user = useCloudUser();
  const sync = useSyncState();

  if (user?.isLoggedIn) {
    const done = sync?.phase === 'in-sync';
    return (
      <p className="mb-6 border-y border-border py-3 text-[14px] text-muted">
        Angemeldet als <span className="font-medium text-text">{user.email}</span>.{' '}
        {done
          ? 'In deinem Konto gibt es noch kein Profil – leg es hier an.'
          : 'Deine Daten werden geladen …'}
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
