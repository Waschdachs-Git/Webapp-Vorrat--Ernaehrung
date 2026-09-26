import { type ReactNode, useState } from 'react';
import { Button, Field, Input, Select, SegmentedControl, cx } from './ui';
import { ACTIVITY_LABELS } from '@/lib/health';
import type {
  ActivityLevel,
  Goal,
  Profile,
  Sex,
} from '@/db/types';

export interface ProfileDraft {
  name: string;
  /** null until chosen: it changes the BMR formula, so no silent default. */
  sex: Sex | null;
  birthdate: string;
  heightCm: string;
  weightKg: string;
  activityLevel: ActivityLevel;
  goal: Goal;
  targetRateKgPerWeek: string;
  allergies: string;
  dietPrefs: string;
}

export function emptyDraft(): ProfileDraft {
  return {
    name: '',
    sex: null,
    birthdate: '',
    heightCm: '',
    weightKg: '',
    activityLevel: 'moderate',
    goal: 'maintain',
    targetRateKgPerWeek: '0.5',
    allergies: '',
    dietPrefs: '',
  };
}

export function draftFromProfile(p: Profile): ProfileDraft {
  return {
    name: p.name,
    sex: p.sex,
    birthdate: p.birthdate,
    heightCm: String(p.heightCm),
    weightKg: String(p.weightKg),
    activityLevel: p.activityLevel,
    goal: p.goal,
    targetRateKgPerWeek: String(p.targetRateKgPerWeek),
    allergies: p.allergies.join(', '),
    dietPrefs: p.dietPrefs.join(', '),
  };
}

export function draftToProfile(d: ProfileDraft, id: string): Profile {
  return {
    id,
    name: d.name.trim() || 'Ich',
    sex: d.sex ?? 'd',
    birthdate: d.birthdate,
    heightCm: parseFloat(d.heightCm) || 0,
    weightKg: parseFloat(d.weightKg) || 0,
    activityLevel: d.activityLevel,
    goal: d.goal,
    targetRateKgPerWeek: parseFloat(d.targetRateKgPerWeek) || 0,
    allergies: splitList(d.allergies),
    dietPrefs: splitList(d.dietPrefs),
  };
}

function splitList(s: string): string[] {
  return s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}

const SEX_OPTIONS: { value: Sex; label: string }[] = [
  { value: 'w', label: 'Weiblich' },
  { value: 'm', label: 'Männlich' },
  { value: 'd', label: 'Divers' },
];

export function ProfileForm({
  draft,
  setDraft,
  onSubmit,
  submitLabel,
  inSheet = false,
}: {
  draft: ProfileDraft;
  setDraft: (d: ProfileDraft) => void;
  onSubmit: () => void;
  submitLabel: string;
  /** Inside a bottom sheet the fade has to match the sheet surface. */
  inSheet?: boolean;
}): ReactNode {
  const [submitting, setSubmitting] = useState(false);
  // Say what is missing instead of showing a silently disabled button.
  const missing = [
    draft.sex === null && 'Geschlecht',
    !draft.birthdate && 'Geburtsdatum',
    !(parseFloat(draft.heightCm) > 0) && 'Größe',
    !(parseFloat(draft.weightKg) > 0) && 'Gewicht',
  ].filter(Boolean) as string[];
  const valid =
    draft.sex !== null &&
    draft.birthdate &&
    parseFloat(draft.heightCm) > 0 &&
    parseFloat(draft.weightKg) > 0;

  const submit = async () => {
    setSubmitting(true);
    try {
      await onSubmit();
    } finally {
      setSubmitting(false);
    }
  };

  const set = <K extends keyof ProfileDraft>(key: K, value: ProfileDraft[K]) =>
    setDraft({ ...draft, [key]: value });

  return (
    <div className="flex flex-col gap-4">
      <Field label="Name (optional)">
        <Input value={draft.name} onChange={(e) => set('name', e.target.value)} placeholder="Wie heißt du?" />
      </Field>

      <Field label="Geschlecht" hint="Fließt in die Grundumsatz-Formel ein.">
        <SegmentedControl
          value={draft.sex}
          onChange={(v) => set('sex', v)}
          options={SEX_OPTIONS}
        />
      </Field>

      <Field label="Geburtsdatum">
        <Input
          type="date"
          value={draft.birthdate}
          onChange={(e) => set('birthdate', e.target.value)}
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Größe (cm)">
          <Input
            type="number"
            inputMode="decimal"
            value={draft.heightCm}
            onChange={(e) => set('heightCm', e.target.value)}
            placeholder="z. B. 175"
          />
        </Field>
        <Field label="Gewicht (kg)">
          <Input
            type="number"
            inputMode="decimal"
            value={draft.weightKg}
            onChange={(e) => set('weightKg', e.target.value)}
            placeholder="z. B. 70"
          />
        </Field>
      </div>

      <Field label="Aktivitätslevel">
        <Select
          value={draft.activityLevel}
          onChange={(e) => set('activityLevel', e.target.value as ActivityLevel)}
        >
          {(Object.keys(ACTIVITY_LABELS) as ActivityLevel[]).map((k) => (
            <option key={k} value={k}>
              {ACTIVITY_LABELS[k]}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Ziel">
        <SegmentedControl
          value={draft.goal}
          onChange={(v) => set('goal', v)}
          options={[
            // Short labels: "Gewicht halten" wrapped onto two lines.
            { value: 'lose' as Goal, label: 'Abnehmen' },
            { value: 'maintain' as Goal, label: 'Halten' },
            { value: 'gain' as Goal, label: 'Zunehmen' },
          ]}
        />
      </Field>

      {draft.goal !== 'maintain' && (
        <Field
          label="Zielrate (kg pro Woche)"
          hint="Empfohlen: 0,25–0,75 kg/Woche."
        >
          <Input
            type="number"
            inputMode="decimal"
            step="0.25"
            value={draft.targetRateKgPerWeek}
            onChange={(e) => set('targetRateKgPerWeek', e.target.value)}
          />
        </Field>
      )}

      <Field label="Allergien" hint="Mehrere mit Komma trennen">
        <Input value={draft.allergies} onChange={(e) => set('allergies', e.target.value)} placeholder="z. B. Nüsse, Laktose" />
      </Field>

      <Field label="Ernährungsvorlieben" hint="Mehrere mit Komma trennen">
        <Input value={draft.dietPrefs} onChange={(e) => set('dietPrefs', e.target.value)} placeholder="z. B. vegetarisch" />
      </Field>

      {/* Stays reachable at the bottom of long forms. Solid background so
          field hints never show through the bar. */}
      <div
        className={cx(
          'sticky bottom-0 border-t border-border pb-[calc(env(safe-area-inset-bottom)+12px)] pt-3',
          // Match the parent's horizontal padding so the bar spans edge to edge.
          // The downward shadow in the page colour covers the strip below the bar.
          inSheet
            ? '-mx-5 bg-surface px-5 shadow-[0_24px_0_0_rgb(var(--c-surface))]'
            : '-mx-6 bg-bg px-6 shadow-[0_24px_0_0_rgb(var(--c-bg))]',
        )}
      >
        {missing.length > 0 && (
          <p className="mb-2 text-center text-[12.5px] text-muted">
            Noch offen: {missing.join(', ')}
          </p>
        )}
        <Button block disabled={!valid || submitting} onClick={submit}>
          {submitLabel}
        </Button>
      </div>
    </div>
  );
}
