import { type ReactNode, Suspense, lazy, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Settings as SettingsIcon,
  Plus,
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
import { Button, Card, Field, Input, EmptyState } from '@/components/ui';
import {
  ACTIVITY_LABELS,
  GOAL_LABELS,
  calculateTargets,
  effectiveTargets,
  tdee,
} from '@/lib/health';
import { ageFromBirthdate, todayISO } from '@/lib/date';
import type { Targets } from '@/db/types';

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
    await db.profile.put(draftToProfile(draft, PROFILE_ID));
    setEditOpen(false);
  };

  const addWeight = async () => {
    const w = parseFloat(newWeight);
    if (!(w > 0)) return;
    const today = todayISO();
    const existing = (weights ?? []).find((x) => x.date === today);
    if (existing?.id !== undefined) {
      await db.weightLog.update(existing.id, { weightKg: w });
    } else {
      await db.weightLog.add({ date: today, weightKg: w });
    }
    // Keep the profile's current weight in sync with the latest entry.
    await db.profile.update(PROFILE_ID, { weightKg: w });
    setNewWeight('');
  };

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

      <div className="flex flex-col gap-5 px-5">
        {/* Identity + key facts */}
        <Card>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-[20px] font-semibold text-text">{profile.name}</p>
              <p className="mt-0.5 text-[13px] text-muted">
                {age} Jahre · {profile.heightCm} cm · {GOAL_LABELS[profile.goal]}
              </p>
            </div>
            <button
              onClick={openEdit}
              className="-mr-1 min-h-[40px] shrink-0 px-1 text-[14px] font-medium text-accent active:opacity-60"
            >
              Bearbeiten
            </button>
          </div>
          <div className="mt-3 text-[13px] text-faint">
            {ACTIVITY_LABELS[profile.activityLevel]} · Erhaltungsbedarf ca.{' '}
            <span className="tnum">{Math.round(tdee(profile))}</span> kcal
          </div>
        </Card>

        {/* Targets */}
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[15px] font-semibold text-text">Tagesziele</h2>
            <button
              onClick={() => setTargetsOpen(true)}
              className="min-h-[40px] px-1 text-[14px] font-medium text-accent active:opacity-60"
            >
              Bearbeiten
            </button>
          </div>
          <div className="grid grid-cols-4 gap-2 text-center">
            <TargetStat label="kcal" value={targets.kcal} />
            <TargetStat label="Protein" value={`${targets.protein} g`} />
            <TargetStat label="Kohlenh." value={`${targets.carbs} g`} />
            <TargetStat label="Fett" value={`${targets.fat} g`} />
          </div>
          {JSON.stringify(targets) !== JSON.stringify(calculated) && (
            <p className="mt-3 text-[12px] text-faint">
              Manuell angepasst (berechnet: {calculated.kcal} kcal).
            </p>
          )}
        </Card>

        {/* Weight log + chart */}
        <Card>
          <div className="mb-3 flex items-center gap-1.5">
            <h2 className="text-[15px] font-semibold text-text">Gewichtsverlauf</h2>
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
              placeholder="Aktuelles Gewicht (kg)"
              value={newWeight}
              onChange={(e) => setNewWeight(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addWeight()}
            />
            <Button onClick={addWeight} className="px-3" aria-label="Eintragen">
              <Plus size={20} />
            </Button>
          </div>

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
            <div className="mt-3 flex flex-col gap-1.5 border-t border-border pt-3">
              {[...(weights ?? [])]
                .reverse()
                .slice(0, 5)
                .map((w, i, arr) => {
                  const prev = arr[i + 1];
                  const diff = prev ? w.weightKg - prev.weightKg : 0;
                  return (
                    <div
                      key={w.id}
                      className="flex items-center justify-between text-[13px]"
                    >
                      <span className="text-muted">
                        {new Date(w.date + 'T00:00:00').toLocaleDateString('de-DE', {
                          weekday: 'short',
                          day: 'numeric',
                          month: 'numeric',
                        })}
                      </span>
                      <span className="tnum flex items-baseline gap-3">
                        {prev && Math.abs(diff) >= 0.05 && (
                          <span className="text-[12px] text-faint">
                            {diff > 0 ? '+' : '−'}
                            {Math.abs(diff).toLocaleString('de-DE', { maximumFractionDigits: 1 })}
                          </span>
                        )}
                        <span className="font-medium text-text">
                          {w.weightKg.toLocaleString('de-DE')} kg
                        </span>
                      </span>
                    </div>
                  );
                })}
            </div>
          )}
        </Card>

        <p className="px-1 pb-2 text-center text-[12px] text-faint">
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

function TargetStat({ label, value }: { label: string; value: ReactNode }): ReactNode {
  return (
    <div>
      <p className="tnum text-[18px] font-semibold text-text">{value}</p>
      <p className="text-[11px] text-faint">{label}</p>
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
