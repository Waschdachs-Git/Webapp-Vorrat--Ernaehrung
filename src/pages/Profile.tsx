import { type ReactNode, Suspense, lazy, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Settings as SettingsIcon,
  Plus,
  Trash2,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { db, PROFILE_ID } from '@/db/database';
import { PageHeader } from '@/components/PageHeader';
import { BottomSheet } from '@/components/BottomSheet';

import {
  ProfileForm,
  draftFromProfile,
  draftToProfile,
  type ProfileDraft,
} from '@/components/ProfileForm';
import { Button, Field, Input, EmptyState } from '@/components/ui';
import {
  ACTIVITY_LABELS,
  GOAL_LABELS,
  calculateTargets,
  effectiveTargets,
  tdee,
} from '@/lib/health';
import { ageFromBirthdate, todayISO } from '@/lib/date';
import { parseDecimal } from '@/lib/format';
import {
  MAX_WEIGHT_KG,
  MIN_WEIGHT_KG,
  deleteWeight,
  isPlausibleWeight,
  saveWeight,
  updateWeight,
} from '@/lib/weight';
import { useUndo } from '@/components/UndoToast';
import type { Targets, WeightLog } from '@/db/types';

// Recharts is only needed once there are at least two weight entries.
const WeightChart = lazy(() =>
  import('@/components/WeightChart').then((m) => ({ default: m.WeightChart })),
);

export function Profile(): ReactNode {
  const profile = useLiveQuery(() => db.profile.get(PROFILE_ID), []);
  const weights = useLiveQuery(
    () => db.weightLog.orderBy('date').toArray(),
    [],
  );
  const navigate = useNavigate();

  const [editOpen, setEditOpen] = useState(false);
  const [draft, setDraft] = useState<ProfileDraft | null>(null);
  const [targetsOpen, setTargetsOpen] = useState(false);
  const [newWeight, setNewWeight] = useState('');
  const [weightError, setWeightError] = useState<string | null>(null);
  const [editWeight, setEditWeight] = useState<WeightLog | null>(null);
  const [showAllWeights, setShowAllWeights] = useState(false);
  const showUndo = useUndo();

  if (!profile) {
    return (
      <div className="pb-24">
        <PageHeader title="Profil" />
        <EmptyState title="Kein Profil" />
      </div>
    );
  }

  const targets = effectiveTargets(profile);
  const calculated = calculateTargets(profile);
  const age = ageFromBirthdate(profile.birthdate);

  const openEdit = () => {
    setDraft(draftFromProfile(profile));
    setEditOpen(true);
  };

  const saveEdit = async () => {
    if (!draft) return;
    // Update, not put: replacing the whole row would silently drop what the
    // form does not show – the manually adjusted targets.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { id, ...fields } = draftToProfile(draft, PROFILE_ID);
    await db.profile.update(PROFILE_ID, fields);
    setEditOpen(false);
  };

  const addWeight = async () => {
    if (newWeight.trim() === '') return;
    const w = parseDecimal(newWeight);
    if (!isPlausibleWeight(w)) {
      setWeightError(WEIGHT_RANGE_HINT);
      return;
    }
    setWeightError(null);
    try {
      // Also keeps the profile's current weight in line with the latest entry.
      await saveWeight(todayISO(), w);
      setNewWeight('');
    } catch (err) {
      console.error('Gewicht speichern fehlgeschlagen:', err);
      setWeightError('Konnte nicht gespeichert werden. Bitte noch einmal versuchen.');
    }
  };

  const removeWeight = async (entry: WeightLog) => {
    if (entry.id === undefined) return;
    const undo = await deleteWeight(entry.id);
    setEditWeight(null);
    showUndo(`Gewicht vom ${formatWeightDate(entry.date)} gelöscht`, undo);
  };

  const newestFirst = [...(weights ?? [])].reverse();

  const chartData = (weights ?? []).map((w) => {
    const [, m, d] = w.date.split('-');
    return { date: `${Number(d)}.${Number(m)}.`, kg: w.weightKg };
  });

  // Trend over the last ~30 days, compared against the oldest entry in range.
  const trend = (() => {
    const list = weights ?? [];
    if (list.length < 2) return null;
    const latest = list[list.length - 1]!;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    const cut = cutoff.toISOString().slice(0, 10);
    const base = list.find((w) => w.date >= cut) ?? list[0]!;
    if (base === latest) return null;
    const days = Math.max(
      1,
      Math.round(
        (new Date(latest.date).getTime() - new Date(base.date).getTime()) / 86_400_000,
      ),
    );
    return { latest: latest.weightKg, delta: latest.weightKg - base.weightKg, days };
  })();

  return (
    <div className="pb-24">
      <PageHeader
        title="Profil"
        action={
          <button
            onClick={() => navigate('/einstellungen')}
            aria-label="Einstellungen"
            className="flex h-10 w-10 items-center justify-center rounded-full text-muted active:bg-surface-2"
          >
            <SettingsIcon size={22} />
          </button>
        }
      />

      <div className="grid grid-cols-[minmax(0,1fr)] gap-9 px-5 md:grid-cols-2 md:items-start md:gap-10">
        {/* iPad: identity and targets left, weight right. */}
        <div className="flex flex-col gap-9">
        {/* Identity + key facts */}
        <section>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate font-serif text-[26px] font-semibold tracking-[-0.01em] text-text">{profile.name}</p>
              <p className="mt-0.5 text-[13px] text-muted">
                {age} Jahre · {profile.heightCm} cm · {GOAL_LABELS[profile.goal]}
              </p>
            </div>
            <button
              onClick={openEdit}
              className="min-h-[40px] shrink-0 text-[15px] font-medium text-accent active:opacity-60"
            >
              Bearbeiten
            </button>
          </div>
          <div className="mt-3 text-[13px] text-faint">
            {ACTIVITY_LABELS[profile.activityLevel]} · Erhaltungsbedarf ca.{' '}
            <span className="tnum whitespace-nowrap">{Math.round(tdee(profile)).toLocaleString('de-DE')}{'\u00a0'}kcal</span>
          </div>
        </section>

        {/* Targets */}
        <section>
          <div className="mb-3 flex items-baseline justify-between border-b border-text/80 dark:border-text/35 pb-2">
            <h2 className="font-serif text-[21px] font-semibold tracking-[-0.01em] text-text">Tagesziele</h2>
            <button
              onClick={() => setTargetsOpen(true)}
              className="min-h-[40px] shrink-0 text-[15px] font-medium text-accent active:opacity-60"
            >
              Bearbeiten
            </button>
          </div>
          <div className="grid grid-cols-4 gap-2">
            <TargetStat label="kcal" value={targets.kcal.toLocaleString('de-DE')} />
            <TargetStat label="Protein" value={`${targets.protein}\u00a0g`} />
            <TargetStat label="Kohlenh." value={`${targets.carbs}\u00a0g`} />
            <TargetStat label="Fett" value={`${targets.fat}\u00a0g`} />
          </div>
          {JSON.stringify(targets) !== JSON.stringify(calculated) && (
            <p className="mt-3 text-[12px] text-faint">
              Manuell angepasst (berechnet: {calculated.kcal} kcal).
            </p>
          )}
        </section>

        </div>

        {/* Weight log + chart */}
        <section>
          <div className="mb-4 flex items-center gap-1.5 border-b border-text/80 dark:border-text/35 pb-2">
            <h2 className="font-serif text-[21px] font-semibold tracking-[-0.01em] text-text">Gewichtsverlauf</h2>
          </div>

          {trend && (
            <div className="mb-4 flex items-baseline gap-3">
              <span className="tnum text-[28px] font-semibold leading-none text-text">
                {trend.latest.toLocaleString('de-DE')}
                <span className="ml-1 text-[15px] font-medium text-muted">kg</span>
              </span>
              <span
                className={`tnum text-[13px] font-medium ${
                  (profile.goal === 'lose' && trend.delta < 0) ||
                  (profile.goal === 'gain' && trend.delta > 0)
                    ? 'text-accent'
                    : 'text-muted'
                }`}
              >
                {trend.delta > 0 ? '+' : trend.delta < 0 ? '−' : '±'}
                {Math.abs(trend.delta).toLocaleString('de-DE', { maximumFractionDigits: 1 })} kg
                in {trend.days} Tagen
              </span>
            </div>
          )}

          <div className="mb-3 flex gap-2">
            <Input
              type="number"
              inputMode="decimal"
              step="any"
              placeholder="Aktuelles Gewicht (kg)"
              aria-label="Aktuelles Gewicht in Kilogramm"
              value={newWeight}
              onChange={(e) => {
                setNewWeight(e.target.value);
                setWeightError(null);
              }}
              onKeyDown={(e) => e.key === 'Enter' && addWeight()}
              className="min-w-0 flex-1"
            />
            <Button
              onClick={addWeight}
              // Keep the field focused so iOS does not shift the layout
              // under the finger (see the shopping list).
              onMouseDown={(e) => e.preventDefault()}
              className="shrink-0 px-3"
              aria-label="Eintragen"
            >
              <Plus size={20} />
            </Button>
          </div>
          {weightError && (
            <p role="alert" className="-mt-1 mb-3 text-[13px] text-danger">
              {weightError}
            </p>
          )}

          {chartData.length >= 2 ? (
            <Suspense
              fallback={<div className="h-44 w-full animate-pulse rounded-xl bg-surface-2" />}
            >
              <WeightChart data={chartData} />
            </Suspense>
          ) : (
            <p className="py-4 text-center text-[13px] text-faint">
              Trage mind. zwei Werte ein, um den Verlauf zu sehen.
            </p>
          )}

          {(weights?.length ?? 0) > 0 && (
            <div className="mt-3 border-t border-border pt-1">
              <ul>
                {newestFirst
                  .slice(0, showAllWeights ? undefined : 5)
                  .map((w, i) => {
                    // From the full list, so the last visible row has one too.
                    const prev = newestFirst[i + 1];
                    const diff = prev ? w.weightKg - prev.weightKg : 0;
                    return (
                      <li key={w.id}>
                        {/* Tap to correct or remove – a typo must be fixable. */}
                        <button
                          type="button"
                          onClick={() => setEditWeight(w)}
                          aria-label={`Gewicht vom ${formatWeightDate(w.date)} bearbeiten`}
                          className="-mx-2 flex min-h-[40px] w-[calc(100%+1rem)] items-center justify-between rounded-[10px] px-2 text-[14px] active:bg-surface-2"
                        >
                          <span className="text-muted">{formatWeightDate(w.date)}</span>
                          <span className="tnum flex items-baseline gap-3">
                            {prev && Math.abs(diff) >= 0.05 && (
                              <span className="text-[12.5px] text-faint">
                                {diff > 0 ? '+' : '−'}
                                {Math.abs(diff).toLocaleString('de-DE', { maximumFractionDigits: 1 })}
                              </span>
                            )}
                            <span className="font-medium text-text">
                              {w.weightKg.toLocaleString('de-DE')} kg
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
              </ul>
              {(weights?.length ?? 0) > 5 && (
                <button
                  type="button"
                  onClick={() => setShowAllWeights((v) => !v)}
                  className="min-h-[40px] text-[14px] font-medium text-accent active:opacity-60"
                >
                  {showAllWeights ? 'Weniger anzeigen' : `Alle ${weights?.length} Einträge anzeigen`}
                </button>
              )}
            </div>
          )}
        </section>

        <p className="pb-2 text-center text-[12px] text-faint md:col-span-2">
          Alle Werte sind Schätzungen zur Orientierung, keine medizinische
          Beratung.
        </p>
      </div>

      <BottomSheet open={editOpen} onClose={() => setEditOpen(false)} title="Profil bearbeiten">
        {draft && (
          <ProfileForm
            draft={draft}
            setDraft={setDraft}
            onSubmit={saveEdit}
            submitLabel="Speichern"
            inSheet
          />
        )}
      </BottomSheet>

      <WeightEntrySheet
        key={editWeight?.id ?? 'none'}
        entry={editWeight}
        onClose={() => setEditWeight(null)}
        onDelete={removeWeight}
      />

      <TargetsSheet
        // Remount when the targets change so the inputs show current values.
        key={`${targets.kcal}-${targets.protein}-${targets.carbs}-${targets.fat}`}
        open={targetsOpen}
        onClose={() => setTargetsOpen(false)}
        calculated={calculated}
        current={targets}
      />
    </div>
  );
}

const WEIGHT_RANGE_HINT = `Bitte ein Gewicht zwischen ${MIN_WEIGHT_KG} und ${MAX_WEIGHT_KG} kg eingeben.`;

function formatWeightDate(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00`).toLocaleDateString('de-DE', {
    weekday: 'short',
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
  });
}

/** Correct or remove one entry of the weight log. */
function WeightEntrySheet({
  entry,
  onClose,
  onDelete,
}: {
  entry: WeightLog | null;
  onClose: () => void;
  onDelete: (entry: WeightLog) => void;
}): ReactNode {
  const [value, setValue] = useState(entry ? String(entry.weightKg) : '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!entry || entry.id === undefined) return;
    const w = parseDecimal(value);
    if (!isPlausibleWeight(w)) {
      setError(WEIGHT_RANGE_HINT);
      return;
    }
    setBusy(true);
    try {
      await updateWeight(entry.id, w);
      onClose();
    } catch (err) {
      console.error('Gewicht ändern fehlgeschlagen:', err);
      setError('Konnte nicht gespeichert werden. Bitte noch einmal versuchen.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet
      open={!!entry}
      onClose={onClose}
      title={entry ? `Gewicht am ${formatWeightDate(entry.date)}` : 'Gewicht'}
    >
      {entry && (
        <div className="flex flex-col gap-4">
          <Field label="Gewicht (kg)">
            <Input
              type="number"
              inputMode="decimal"
              step="any"
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                setError(null);
              }}
              autoFocus
            />
          </Field>
          {error && (
            <p role="alert" className="-mt-2 text-[13px] text-danger">
              {error}
            </p>
          )}
          <Button block onClick={save} disabled={busy}>
            Speichern
          </Button>
          <Button variant="danger" block onClick={() => onDelete(entry)} disabled={busy}>
            <Trash2 size={16} /> Eintrag löschen
          </Button>
        </div>
      )}
    </BottomSheet>
  );
}

function TargetStat({ label, value }: { label: string; value: ReactNode }): ReactNode {
  return (
    <div>
      <p className="tnum font-serif text-[26px] font-medium leading-tight text-text">{value}</p>
      <p className="text-[12.5px] text-muted">{label}</p>
    </div>
  );
}

function TargetsSheet({
  open,
  onClose,
  calculated,
  current,
}: {
  open: boolean;
  onClose: () => void;
  calculated: Targets;
  current: Targets;
}): ReactNode {
  const [vals, setVals] = useState({
    kcal: String(current.kcal),
    protein: String(current.protein),
    carbs: String(current.carbs),
    fat: String(current.fat),
  });

  const save = async () => {
    await db.profile.update(PROFILE_ID, {
      customTargets: {
        kcal: parseInt(vals.kcal) || calculated.kcal,
        protein: parseInt(vals.protein) || calculated.protein,
        carbs: parseInt(vals.carbs) || calculated.carbs,
        fat: parseInt(vals.fat) || calculated.fat,
      },
    });
    onClose();
  };

  const reset = async () => {
    await db.profile.update(PROFILE_ID, { customTargets: undefined });
    onClose();
  };

  return (
    <BottomSheet open={open} onClose={onClose} title="Tagesziele anpassen">
      <div className="flex flex-col gap-3">
        <p className="text-[13px] text-muted">
          Berechnet: {calculated.kcal} kcal · {calculated.protein} P ·{' '}
          {calculated.carbs} K · {calculated.fat} F. Du kannst überschreiben.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="kcal">
            <Input
              type="number"
              value={vals.kcal}
              onChange={(e) => setVals({ ...vals, kcal: e.target.value })}
            />
          </Field>
          <Field label="Protein (g)">
            <Input
              type="number"
              value={vals.protein}
              onChange={(e) => setVals({ ...vals, protein: e.target.value })}
            />
          </Field>
          <Field label="Kohlenhydrate (g)">
            <Input
              type="number"
              value={vals.carbs}
              onChange={(e) => setVals({ ...vals, carbs: e.target.value })}
            />
          </Field>
          <Field label="Fett (g)">
            <Input
              type="number"
              value={vals.fat}
              onChange={(e) => setVals({ ...vals, fat: e.target.value })}
            />
          </Field>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={reset}>
            Zurücksetzen
          </Button>
          <Button block onClick={save}>
            Speichern
          </Button>
        </div>
      </div>
    </BottomSheet>
  );
}
