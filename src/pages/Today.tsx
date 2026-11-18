import { type ReactNode, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { motion } from 'framer-motion';
import { Plus, ChevronLeft, ChevronRight } from 'lucide-react';
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
import { isUsableEntry, useDiaryDay } from '@/hooks/useToday';
import { useTodayISO } from '@/hooks/useDay';
import {
  defaultMealType,
  deleteDiaryItem,
  repeatDiaryItem,
} from '@/lib/actions';
import { formatTime, localDayBounds, shiftDay, toISODate } from '@/lib/date';
import {
  buildRecommendations,
  type Recommendation,
} from '@/lib/recommendations';
import { formatDiaryAmount } from '@/lib/format';
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
  // Re-renders at midnight and when the app returns to the foreground.
  const today = useTodayISO();
  // null = follow today (also across midnight); a date = looking back to add
  // or correct what was eaten on an earlier day.
  const [picked, setPicked] = useState<string | null>(null);
  const day = picked !== null && picked < today ? picked : today;
  const isToday = day === today;
  const showDay = (d: string) => setPicked(d >= today ? null : d);
  const { targets, consumed, remaining, entries, profile } = useDiaryDay(day);
  const [log, setLog] = useState<LogRequest | null>(null);
  const [editTarget, setEditTarget] = useState<DiaryItemRef | null>(null);
  const [cookTarget, setCookTarget] = useState<OwnRecipe | null>(null);
  const showUndo = useUndo();

  const inventory = useLiveQuery(() => db.inventory.toArray(), []);
  const foods = useLiveQuery(() => db.foodsLocal.toArray(), []);
  const recipes = useLiveQuery(() => db.recipesOwn.toArray(), []);
  const recentDiary = useLiveQuery(
    async () =>
      (await db.diary.orderBy('datetime').reverse().limit(30).toArray()).filter(isUsableEntry),
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
    today,
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

  const title = isToday ? 'Heute' : relativeDayTitle(day, today);

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
        title={title}
        subtitle={
          <DayNav
            day={day}
            today={today}
            onStep={(delta) => showDay(shiftDay(day, delta))}
            onToday={() => setPicked(null)}
          />
        }
        action={<AddButton prominent label="Eintragen" onClick={() => openLog()} />}
      />

      {/* minmax(0,…) is essential: without it the grid track grows to the
          min-content width of the scrolling chip row and overflows the phone. */}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-9 px-5 md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] md:items-start md:gap-10">
        <div className="flex min-w-0 flex-col gap-9 md:sticky md:top-2">
          <DayBalance consumed={consumed} targets={targets} />
          {/* Suggestions plan the rest of today – not useful for a past day. */}
          {isToday && <div className="hidden md:block">{suggestionList}</div>}
          <div className="hidden md:block">
            <WeekStrip goal={targets.kcal} today={today} selected={day} onSelect={showDay} />
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-9">
          <Section title="Mahlzeiten">
            {isToday && recentItems.length > 0 && (
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
                      {formatDiaryAmount(item)}
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
                              {formatDiaryAmount(item)} · {formatTime(entry.datetime)}
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

          {isToday && <div className="md:hidden">{suggestionList}</div>}
          <div className="md:hidden">
            <WeekStrip goal={targets.kcal} today={today} selected={day} onSelect={showDay} />
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
          day={isToday ? undefined : day}
        />
      )}
      <DiaryItemSheet
        key={editTarget ? `${editTarget.entryId}-${editTarget.itemIndex}` : 'edit-none'}
        target={editTarget}
        onClose={() => setEditTarget(null)}
      />
      <CookRecipeSheet
        key={cookTarget?.id ?? 'cook-none'}
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
function WeekStrip({
  goal,
  today,
  selected,
  onSelect,
}: {
  goal: number;
  today: string;
  /** The day shown above; highlighted here. */
  selected: string;
  onSelect: (day: string) => void;
}): ReactNode {
  const days = useMemo(() => {
    const out: string[] = [];
    for (let i = 6; i >= 0; i--) out.push(shiftDay(today, -i));
    return out;
  }, [today]);

  const totals = useLiveQuery(async () => {
    const { start } = localDayBounds(days[0]!);
    const { end } = localDayBounds(days[6]!);
    const rows = await db.diary.where('datetime').between(start, end, true, true).toArray();
    const map = new Map<string, number>();
    for (const r of rows.filter(isUsableEntry)) {
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
      <div className="relative mt-4">
        {/* Goal line across the 5rem bar area (h-20). */}
        <div
          className="pointer-events-none absolute inset-x-0 border-t border-dashed border-faint/50"
          style={{ top: `${(1 - goal / max) * 5}rem` }}
          aria-hidden
        />
        <div className="flex gap-2">
          {totals.map((t, i) => {
            const d = days[i]!;
            const over = t > goal * 1.05;
            const isSelected = d === selected;
            return (
              // Tap a day to see – and complete – what was eaten then.
              <button
                key={d}
                type="button"
                onClick={() => onSelect(d)}
                aria-pressed={isSelected}
                aria-label={`${longDate(d)}: ${Math.round(t).toLocaleString('de-DE')} kcal`}
                className="flex flex-1 flex-col items-stretch gap-1.5 rounded-[8px] active:bg-surface-2"
              >
                <span className="flex h-20 flex-col justify-end">
                  <span
                    className={cx(
                      'w-full rounded-[4px]',
                      t === 0
                        ? 'border border-dashed border-border'
                        : over
                          ? 'bg-warn/70'
                          : isSelected
                            ? 'bg-accent'
                            : 'bg-accent/40',
                    )}
                    // Empty days show a dashed outline at goal height instead of a
                    // hairline stub, so a new user's week does not look broken.
                    style={{ height: `${t === 0 ? (goal / max) * 100 : Math.max(6, (t / max) * 100)}%` }}
                  />
                </span>
                <span
                  className={cx(
                    'text-center text-[12px]',
                    isSelected ? 'font-semibold text-text' : 'text-faint',
                  )}
                >
                  {new Date(d + 'T12:00:00').toLocaleDateString('de-DE', { weekday: 'narrow' })}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </Section>
  );
}

function longDate(day: string): string {
  const d = new Date(`${day}T12:00:00`);
  return d.toLocaleDateString('de-DE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    ...(d.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' as const } : {}),
  });
}

/** "Gestern", "Vorgestern", else the weekday – the page title of a past day. */
function relativeDayTitle(day: string, today: string): string {
  if (day === shiftDay(today, -1)) return 'Gestern';
  if (day === shiftDay(today, -2)) return 'Vorgestern';
  return new Date(`${day}T12:00:00`).toLocaleDateString('de-DE', { weekday: 'long' });
}

/** Date with arrows to step through the days; the future stays closed. */
function DayNav({
  day,
  today,
  onStep,
  onToday,
}: {
  day: string;
  today: string;
  onStep: (delta: number) => void;
  onToday: () => void;
}): ReactNode {
  const isToday = day === today;
  const arrow =
    'flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted active:bg-surface-2 disabled:opacity-25';
  return (
    <span className="-ml-2.5 flex items-center gap-0.5">
      <button type="button" aria-label="Vorheriger Tag" onClick={() => onStep(-1)} className={arrow}>
        <ChevronLeft size={20} />
      </button>
      <span className="min-w-0 truncate">{longDate(day)}</span>
      <button
        type="button"
        aria-label="Nächster Tag"
        onClick={() => onStep(1)}
        disabled={isToday}
        className={arrow}
      >
        <ChevronRight size={20} />
      </button>
      {!isToday && (
        <button
          type="button"
          onClick={onToday}
          className="ml-auto min-h-[36px] shrink-0 pl-2 text-[15px] font-semibold text-accent active:opacity-60"
        >
          Zu heute
        </button>
      )}
    </span>
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
    // An unknown meal (data from elsewhere) is shown under snacks, not lost.
    (groups[e.mealType] ?? groups.snack).push(e);
  }
  return groups;
}
