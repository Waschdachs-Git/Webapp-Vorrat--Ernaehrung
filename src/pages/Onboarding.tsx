import { type ReactNode, useState } from 'react';
import { db, PROFILE_ID } from '@/db/database';
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
          Ein paar Angaben, dann berechnen wir deine Tagesziele. Alles bleibt
          lokal auf diesem Gerät.
        </p>
      </div>

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
