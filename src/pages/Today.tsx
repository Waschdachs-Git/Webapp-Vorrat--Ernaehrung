import { type ReactNode, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { motion } from 'framer-motion';
import { Plus, ChevronRight } from 'lucide-react';
import { db } from '@/db/database';
import { PageHeader } from '@/components/PageHeader';
import { LogFoodSheet } from '@/components/LogFoodSheet';
import { CookRecipeSheet } from '@/components/CookRecipeSheet';
import {
  DiaryItemSheet,
  type DiaryItemRef,
} from '@/components/DiaryItemSheet';
import { useUndo } from '@/components/UndoToast';
import { AddButton, Section, cx } from '@/components/ui';
import { useToday } from '@/hooks/useToday';
import {
  defaultMealType,
  deleteDiaryItem,
  repeatDiaryItem,
} from '@/lib/actions';
import { formatTime, localDayBounds, toISODate } from '@/lib/date';
import {
  buildRecommendations,
  type Recommendation,
} from '@/lib/recommendations';
import { formatAmount } from '@/lib/format';
import type {
  DiaryEntry,
  DiaryItem,
  InventoryItem,
  MealType,
  Nutriments,
  OwnRecipe,
  Targets,
} from '@/db/types';

const MEALS: { key: MealType; label: string }[] = [
  { key: 'breakfast', label: 'Frühstück' },
  { key: 'lunch', label: 'Mittag' },
  { key: 'dinner', label: 'Abend' },
  { key: 'snack', label: 'Snacks' },
];

interface LogRequest {
  meal: MealType;
  preset?: InventoryItem;
  /** Changes on every open so the sheet starts fresh. */
  key: number;
}

export function Today(): ReactNode {
  const { targets, consumed, remaining, entries, profile } = useToday();
  const [log, setLog] = useState<LogRequest | null>(null);
  const [editTarget, setEditTarget] = useState<DiaryItemRef | null>(null);
  const [cookTarget, setCookTarget] = useState<OwnRecipe | null>(null);
  const showUndo = useUndo();

  const inventory = useLiveQuery(() => db.inventory.toArray(), []);
  const foods = useLiveQuery(() => db.foodsLocal.toArray(), []);
  const recipes = useLiveQuery(() => db.recipesOwn.toArray(), []);
  const recentDiary = useLiveQuery(
    () => db.diary.orderBy('datetime').reverse().limit(30).toArray(),
    [],
  );

  const recs = useMemo<Recommendation[]>(() => {
    if (!profile) return [];
    return buildRecommendations({
      targets,
      remaining,
      inventory: inventory ?? [],
      foods: foods ?? [],
      recipes: recipes ?? [],
      recentDiary: recentDiary ?? [],
    });
    // `targets`/`remaining` are new objects every render; key on their values.
  }, [
    profile,
    targets.kcal,
    remaining.kcal,
    remaining.protein,
    inventory,
    foods,
    recipes,
    recentDiary,
  ]);

  // "Zuletzt gegessen" – deduplicated by name, newest first.
  const recentItems = useMemo<DiaryItem[]>(() => {
    const seen = new Set<string>();
    const out: DiaryItem[] = [];
    for (const entry of recentDiary ?? []) {
      for (const item of entry.items) {
        const key = item.name.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(item);
        if (out.length >= 6) return out;
      }
    }
    return out;
  }, [recentDiary]);

  const byMeal = useMemo(() => groupByMeal(entries), [entries]);

  const openLog = (meal: MealType = defaultMealType(), preset?: InventoryItem) =>
    setLog({ meal, preset, key: Date.now() });

  const quickLog = async (item: DiaryItem) => {
    const id = await repeatDiaryItem(item, defaultMealType());
    showUndo(`${item.name} gebucht · ${Math.round(item.kcal)} kcal`, () =>
      deleteDiaryItem(id, 0),
    );
  };

  const runRecommendation = (rec: Recommendation) => {
    if (!rec.action) return;
    if (rec.action.type === 'log') {
      const id = rec.action.inventoryId;
      openLog(defaultMealType(), inventory?.find((i) => i.id === id));
    } else {
      const id = rec.action.recipeId;
      setCookTarget(recipes?.find((r) => r.id === id) ?? null);
    }
  };

  const todayLabel = new Date().toLocaleDateString('de-DE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  const suggestionList = recs.length > 0 && (
    <Section title="Vorschläge">
      <ul>
        {recs.map((r) => (
          <li key={r.id} className="border-b border-border last:border-b-0">
            <SuggestionRow rec={r} onAction={() => runRecommendation(r)} />
          </li>
        ))}
      </ul>
    </Section>
  );

  return (
    <div className="pb-24">
      <PageHeader
        title="Heute"
        subtitle={todayLabel}
        action={<AddButton prominent label="Eintragen" onClick={() => openLog()} />}
      />

      {/* minmax(0,…) is essential: without it the grid track grows to the
          min-content width of the scrolling chip row and overflows the phone. */}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-9 px-5 md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] md:items-start md:gap-10">
        <div className="flex min-w-0 flex-col gap-9 md:sticky md:top-2">
          <DayBalance consumed={consumed} targets={targets} />
          <div className="hidden md:block">{suggestionList}</div>
          <div className="hidden md:block">
            <WeekStrip goal={targets.kcal} />
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-9">
          <Section title="Mahlzeiten">
            {recentItems.length > 0 && (
              // Fade on the right edge signals that the row scrolls.
              <div className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5 pb-1 pt-3 [mask-image:linear-gradient(to_right,black_calc(100%-40px),transparent)] md:mx-0 md:px-0">
                <span className="flex shrink-0 items-center pr-1 text-[13px] text-faint">
                  Nochmal:
                </span>
                {recentItems.map((item) => (
                  <button
                    key={item.name}
                    type="button"
                    onClick={() => quickLog(item)}
                    aria-label={`${item.name} erneut eintragen`}
                    className="flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-[8px] border border-border px-3 text-[14px] font-medium text-text active:bg-surface-2"
                  >
                    {item.name}
                    <span className="tnum font-normal text-muted">
                      {formatAmount(item.amount, item.unit)}
                    </span>
                  </button>
                ))}
              </div>
            )}

            <ul>
              {MEALS.map(({ key, label }) => {
                const list = byMeal[key];
                const kcal = list.reduce((s, e) => s + e.totals.kcal, 0);
                return (
                  <li key={key} className="border-b border-border py-2 last:border-b-0">
                    <div className="flex min-h-[44px] items-center justify-between gap-3">
                      <p className="text-[16px] font-semibold text-text">{label}</p>
                      <div className="flex items-center gap-1">
                        {list.length > 0 && (
                          <span className="tnum text-[14px] text-muted">
                            {Math.round(kcal)} kcal
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => openLog(key)}
                          aria-label={`${label} eintragen`}
                          className="-mr-2 flex h-10 w-10 items-center justify-center rounded-full text-accent active:bg-accent-soft"
                        >
                          <Plus size={20} strokeWidth={2.2} />
                        </button>
                      </div>
                    </div>
                    {list.length === 0 && (
                      <p className="pb-1 text-[14px] text-faint">Noch nichts eingetragen</p>
                    )}
                    {list.map((entry) =>
                      entry.items.map((item, i) => (
                        <button
                          key={`${entry.id}-${i}`}
                          type="button"
                          onClick={() =>
                            entry.id !== undefined &&
                            setEditTarget({ entryId: entry.id, itemIndex: i, item })
                          }
                          className="-mx-2 flex min-h-[44px] w-[calc(100%+1rem)] items-center justify-between gap-3 rounded-[10px] px-2 py-1 text-left active:bg-surface-2"
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-[15px] text-text">
                              {item.name}
                            </span>
                            <span className="tnum block text-[13px] text-faint">
                              {formatAmount(item.amount, item.unit)} · {formatTime(entry.datetime)}
                            </span>
                          </span>
                          <span className="tnum shrink-0 text-[15px] text-muted">
                            {Math.round(item.kcal)}
                          </span>
                        </button>
                      )),
                    )}
                  </li>
                );
              })}
            </ul>
          </Section>

          <div className="md:hidden">{suggestionList}</div>
          <div className="md:hidden">
            <WeekStrip goal={targets.kcal} />
          </div>
        </div>
      </div>

      {log && (
        <LogFoodSheet
          key={log.key}
          open
          onClose={() => setLog(null)}
          defaultMeal={log.meal}
          preset={log.preset}
        />
      )}
      <DiaryItemSheet
        key={editTarget ? `${editTarget.entryId}-${editTarget.itemIndex}` : 'none'}
        target={editTarget}
        onClose={() => setEditTarget(null)}
      />
      <CookRecipeSheet
        key={cookTarget?.id ?? 'none'}
        recipe={cookTarget}
        onClose={() => setCookTarget(null)}
      />
    </div>
  );
}

/**
 * The day at a glance, set as type rather than as a fitness ring: one large
 * serif figure, a thin progress rule, and the three macros underneath.
 */
function DayBalance({
  consumed,
  targets,
}: {
  consumed: Nutriments;
  targets: Targets;
}): ReactNode {
  const left = Math.round(targets.kcal - consumed.kcal);
  const over = left < 0;
  const pct = targets.kcal > 0 ? Math.min(1, consumed.kcal / targets.kcal) : 0;
  const macros = [
    { key: 'protein', label: 'Protein', color: 'bg-protein' },
    { key: 'carbs', label: 'Kohlenhydrate', color: 'bg-carbs' },
    { key: 'fat', label: 'Fett', color: 'bg-fat' },
  ] as const;

  return (
    <section aria-label="Tagesbilanz">
      <p className="flex items-baseline gap-2.5">
        <span
          className={cx(
            'tnum font-serif text-[64px] font-medium leading-[0.9] tracking-[-0.03em]',
            over ? 'text-warn' : 'text-text',
          )}
        >
          {Math.abs(left).toLocaleString('de-DE')}
        </span>
        <span className="text-[16px] text-muted">
          {over ? 'kcal über dem Ziel' : 'kcal übrig'}
        </span>
      </p>

      <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-surface-2">
        <motion.div
          className={cx('h-full w-full origin-left rounded-full', over ? 'bg-warn' : 'bg-accent')}
          initial={{ scaleX: 0 }}
          animate={{ scaleX: pct }}
          transition={{ type: 'spring', stiffness: 140, damping: 24 }}
        />
      </div>
      <p className="tnum mt-2 flex justify-between text-[13px] text-faint">
        <span>{Math.round(consumed.kcal).toLocaleString('de-DE')} gegessen</span>
        <span>Ziel {targets.kcal.toLocaleString('de-DE')}</span>
      </p>

      <div className="mt-6 grid grid-cols-3 gap-4">
        {macros.map((m) => {
          const value = consumed[m.key];
          const goal = targets[m.key];
          const rest = Math.round(goal - value);
          return (
            <div key={m.key} className="min-w-0">
              <p className="truncate text-[13px] text-muted">{m.label}</p>
              <p className="tnum mt-0.5 text-[17px] font-semibold text-text">
                {Math.round(value)}
                <span className="text-[13px] font-normal text-faint"> / {goal} g</span>
              </p>
              <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-surface-2">
                <motion.div
                  className={cx('h-full w-full origin-left rounded-full', m.color)}
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: goal > 0 ? Math.min(1, value / goal) : 0 }}
                  transition={{ type: 'spring', stiffness: 140, damping: 24 }}
                />
              </div>
              <p className={cx('tnum mt-1 text-[12px]', rest < 0 ? 'text-warn' : 'text-faint')}>
                {rest < 0 ? `${-rest} g drüber` : `noch ${rest} g`}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

const KICKER: Record<Recommendation['kind'], { text: string; tone: string }> = {
  expiring: { text: 'Zuerst verbrauchen', tone: 'text-warn' },
  protein: { text: 'Protein', tone: 'text-protein' },
  fit: { text: 'Passt noch in den Tag', tone: 'text-accent' },
  variety: { text: 'Abwechslung', tone: 'text-muted' },
};

function SuggestionRow({
  rec,
  onAction,
}: {
  rec: Recommendation;
  onAction: () => void;
}): ReactNode {
  const kicker = KICKER[rec.kind];
  // Titles repeat the kicker ("Zuerst verbrauchen: X") – keep only the subject.
  const title = rec.title.includes(': ') ? rec.title.split(': ').slice(1).join(': ') : rec.title;
  const body = (
    <>
      <span className="min-w-0 flex-1">
        <span className={cx('block text-[12.5px] font-semibold', kicker.tone)}>
          {kicker.text}
        </span>
        <span className="block text-[16px] font-medium leading-snug text-text">{title}</span>
        <span className="block text-[13.5px] leading-snug text-muted">{rec.detail}</span>
      </span>
      {rec.action && <ChevronRight size={18} className="shrink-0 text-faint" />}
    </>
  );
  return rec.action ? (
    <button
      type="button"
      onClick={onAction}
      className="-mx-2 flex w-[calc(100%+1rem)] items-center gap-3 rounded-[10px] px-2 py-3 text-left active:bg-surface-2"
    >
      {body}
    </button>
  ) : (
    <div className="flex items-center gap-3 py-3">{body}</div>
  );
}

/** Last seven days against the goal – plain CSS, no chart library needed. */
function WeekStrip({ goal }: { goal: number }): ReactNode {
  const days = useMemo(() => {
    const out: string[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      out.push(toISODate(d));
    }
    return out;
  }, []);

  const totals = useLiveQuery(async () => {
    const { start } = localDayBounds(days[0]!);
    const { end } = localDayBounds(days[6]!);
    const rows = await db.diary.where('datetime').between(start, end, true, true).toArray();
    const map = new Map<string, number>();
    for (const r of rows) {
      const key = toISODate(new Date(r.datetime));
      map.set(key, (map.get(key) ?? 0) + r.totals.kcal);
    }
    return days.map((d) => map.get(d) ?? 0);
  }, [days]);

  if (!totals || goal <= 0) return null;
  const logged = totals.filter((t) => t > 0);
  const avg = logged.length
    ? Math.round(logged.reduce((a, b) => a + b, 0) / logged.length)
    : 0;
  const max = Math.max(goal * 1.25, ...totals);

  return (
    <Section
      title="Letzte 7 Tage"
      action={
        avg > 0 ? (
          <span className="tnum text-[13px] text-faint">Ø {avg.toLocaleString('de-DE')} kcal</span>
        ) : undefined
      }
    >
      <div className="relative mt-4 flex h-20 items-end gap-2">
        <div
          className="pointer-events-none absolute inset-x-0 border-t border-dashed border-faint/50"
          style={{ bottom: `${(goal / max) * 100}%` }}
          aria-hidden
        />
        {totals.map((t, i) => {
          const over = t > goal * 1.05;
          const isToday = i === 6;
          return (
            <div key={days[i]} className="flex h-full flex-1 flex-col justify-end">
              <div
                className={cx(
                  'w-full rounded-[4px]',
                  t === 0
                    ? 'border border-dashed border-border'
                    : over ? 'bg-warn/70' : isToday ? 'bg-accent' : 'bg-accent/40',
                )}
                // Empty days show a dashed outline at goal height instead of a
                // hairline stub, so a new user's week does not look broken.
                style={{ height: `${t === 0 ? (goal / max) * 100 : Math.max(6, (t / max) * 100)}%` }}
                title={`${Math.round(t)} kcal`}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-1.5 flex gap-2">
        {days.map((d, i) => (
          <span
            key={d}
            className={cx(
              'flex-1 text-center text-[12px]',
              i === 6 ? 'font-semibold text-text' : 'text-faint',
            )}
          >
            {new Date(d + 'T00:00:00').toLocaleDateString('de-DE', { weekday: 'narrow' })}
          </span>
        ))}
      </div>
    </Section>
  );
}

function groupByMeal(entries: DiaryEntry[]): Record<MealType, DiaryEntry[]> {
  const groups: Record<MealType, DiaryEntry[]> = {
    breakfast: [],
    lunch: [],
    dinner: [],
    snack: [],
  };
  for (const e of [...entries].sort((a, b) =>
    a.datetime.localeCompare(b.datetime),
  )) {
    groups[e.mealType].push(e);
  }
  return groups;
}
