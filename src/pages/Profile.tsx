import { type ReactNode, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Pencil,
  Settings as SettingsIcon,
  Plus,
  TrendingUp,
} from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
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
import { ageFromBirthdate, formatDay, todayISO } from '@/lib/date';
import type { Targets } from '@/db/types';

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

  const chartData = (weights ?? []).map((w) => ({
    date: w.date.slice(5), // MM-DD
    kg: w.weightKg,
  }));

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
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[20px] font-semibold text-text">{profile.name}</p>
              <p className="mt-0.5 text-[13px] text-muted">
                {age} Jahre · {profile.heightCm} cm · {GOAL_LABELS[profile.goal]}
              </p>
            </div>
            <Button variant="secondary" onClick={openEdit} className="h-9 px-3">
              <Pencil size={16} /> Bearbeiten
            </Button>
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
              className="text-[13px] font-medium text-accent active:opacity-60"
            >
              Anpassen
            </button>
          </div>
          <div className="grid grid-cols-4 gap-2 text-center">
            <TargetStat label="kcal" value={targets.kcal} />
            <TargetStat label="Protein" value={`${targets.protein} g`} />
            <TargetStat label="Carbs" value={`${targets.carbs} g`} />
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
            <TrendingUp size={18} className="text-muted" />
            <h2 className="text-[15px] font-semibold text-text">Gewichtsverlauf</h2>
          </div>

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
            <div className="h-44 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--c-border))" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11, fill: 'rgb(var(--c-faint))' }}
                    stroke="rgb(var(--c-border))"
                  />
                  <YAxis
                    domain={['dataMin - 1', 'dataMax + 1']}
                    tick={{ fontSize: 11, fill: 'rgb(var(--c-faint))' }}
                    stroke="rgb(var(--c-border))"
                    width={36}
                  />
                  <Tooltip
                    contentStyle={{
                      background: 'rgb(var(--c-surface))',
                      border: '1px solid rgb(var(--c-border))',
                      borderRadius: 12,
                      fontSize: 12,
                      color: 'rgb(var(--c-text))',
                    }}
                    formatter={(v: number) => [`${v} kg`, 'Gewicht']}
                  />
                  <Line
                    type="monotone"
                    dataKey="kg"
                    stroke="rgb(var(--c-accent))"
                    strokeWidth={2.5}
                    dot={{ r: 3, fill: 'rgb(var(--c-accent))' }}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
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
                .map((w) => (
                  <div
                    key={w.id}
                    className="flex items-center justify-between text-[13px]"
                  >
                    <span className="text-muted">{formatDay(w.date)}</span>
                    <span className="tnum font-medium text-text">{w.weightKg} kg</span>
                  </div>
                ))}
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
          <Field label="Carbs (g)">
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
