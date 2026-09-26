import { type ReactNode, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Plus,
  AlarmClock,
  Shuffle,
  RotateCcw,
  Beef,
  CookingPot,
  ChevronRight,
} from 'lucide-react';
import { db } from '@/db/database';
import { PageHeader } from '@/components/PageHeader';
import { CalorieRing } from '@/components/CalorieRing';
import { MacroBars } from '@/components/MacroBars';
import { LogFoodSheet } from '@/components/LogFoodSheet';
import { CookRecipeSheet } from '@/components/CookRecipeSheet';
import {
  DiaryItemSheet,
  type DiaryItemRef,
} from '@/components/DiaryItemSheet';
import { useUndo } from '@/components/UndoToast';
import { AddButton, Card, cx } from '@/components/ui';
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
  OwnRecipe,
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

  return (
    <div className="pb-24">
      <PageHeader
        title="Heute"
        subtitle={todayLabel}
        action={<AddButton label="Eintragen" onClick={() => openLog()} />}
      />

      {/* minmax(0,…) is essential: without it the grid track grows to the
          min-content width of the scrolling chip row and overflows the phone. */}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 px-5 md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] md:items-start">
        {/* Left column on iPad: the day at a glance */}
        <div className="flex min-w-0 flex-col gap-5 md:sticky md:top-2">
          <Card className="flex flex-col items-center gap-4 py-5">
            <CalorieRing consumed={consumed.kcal} goal={targets.kcal} size={156} stroke={12} />
            <div className="w-full">
              <MacroBars consumed={consumed} targets={targets} />
            </div>
          </Card>
          {/* On iPad the week sits under the ring; on the phone it moves to
              the end so meals stay above the fold. */}
          <div className="hidden md:block">
            <WeekStrip goal={targets.kcal} />
          </div>
        </div>

        {/* Right column on iPad: what to do next */}
        <div className="flex min-w-0 flex-col gap-5">
          {recentItems.length > 0 && (
            <section>
              <SectionTitle hint="Tippen trägt dieselbe Menge ein">
                Schnell nochmal
              </SectionTitle>
              {/* Fade on the right edge signals that the row scrolls. */}
              <div className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5 [mask-image:linear-gradient(to_right,black_calc(100%-40px),transparent)] md:mx-0 md:px-0">
                {recentItems.map((item) => (
                  <button
                    key={item.name}
                    type="button"
                    onClick={() => quickLog(item)}
                    aria-label={`${item.name} erneut loggen`}
                    className="flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-full border border-border bg-surface px-3.5 text-[13px] font-medium text-text active:bg-surface-2"
                  >
                    <RotateCcw size={14} className="text-accent" />
                    {item.name}
                    <span className="tnum text-faint">
                      {formatAmount(item.amount, item.unit)}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          )}

          <section>
            <SectionTitle>Mahlzeiten</SectionTitle>

            {/* All four meals are always shown: an empty slot is the fastest
                way to log exactly that meal. */}
            <div className="overflow-hidden rounded-2xl border border-border bg-surface">
              {MEALS.map(({ key, label }, idx) => {
                const list = byMeal[key];
                const kcal = list.reduce((s, e) => s + e.totals.kcal, 0);
                return (
                  <div
                    key={key}
                    className={cx(idx > 0 && 'border-t border-border')}
                  >
                    <div className="flex min-h-[48px] items-center justify-between pl-4 pr-2">
                      <p className="text-[13px] font-semibold uppercase tracking-wide text-faint">
                        {label}
                        {list.length > 0 && (
                          <span className="tnum ml-2 font-medium normal-case tracking-normal text-muted">
                            {Math.round(kcal)} kcal
                          </span>
                        )}
                      </p>
                      <button
                        type="button"
                        onClick={() => openLog(key)}
                        aria-label={`${label} hinzufügen`}
                        className="flex h-10 w-10 items-center justify-center rounded-full text-accent active:bg-accent-soft"
                      >
                        <Plus size={20} />
                      </button>
                    </div>
                    {list.map((entry) =>
                      entry.items.map((item, i) => (
                        <button
                          key={`${entry.id}-${i}`}
                          type="button"
                          onClick={() =>
                            entry.id !== undefined &&
                            setEditTarget({ entryId: entry.id, itemIndex: i, item })
                          }
                          className="flex min-h-[48px] w-full items-center justify-between gap-3 px-4 pb-2.5 text-left active:bg-surface-2"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-[15px] text-text">
                              {item.name}
                            </p>
                            <p className="tnum text-[12px] text-faint">
                              {formatAmount(item.amount, item.unit)} ·{' '}
                              {formatTime(entry.datetime)}
                            </p>
                          </div>
                          <span className="tnum shrink-0 text-[15px] font-medium text-muted">
                            {Math.round(item.kcal)} kcal
                          </span>
                        </button>
                      )),
                    )}
                  </div>
                );
              })}
            </div>
            {entries.length === 0 && (
              <p className="mt-2 px-1 text-[13px] text-faint">
                Tippe auf <span className="font-medium text-muted">+</span> neben
                einer Mahlzeit, um sie zu erfassen.
              </p>
            )}
          </section>

          {recs.length > 0 && (
            <section>
              <SectionTitle>Vorschläge</SectionTitle>
              <div className="flex flex-col gap-2">
                {recs.map((r) => (
                  <RecommendationCard
                    key={r.id}
                    rec={r}
                    onAction={() => runRecommendation(r)}
                  />
                ))}
              </div>
            </section>
          )}

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

function SectionTitle({
  children,
  hint,
}: {
  children: ReactNode;
  hint?: string;
}): ReactNode {
  return (
    <div className="mb-2 flex items-baseline justify-between gap-3 px-1">
      <h2 className="shrink-0 text-[15px] font-semibold text-text">{children}</h2>
      {hint && <span className="truncate text-[12px] text-faint">{hint}</span>}
    </div>
  );
}

function RecommendationCard({
  rec,
  onAction,
}: {
  rec: Recommendation;
  onAction: () => void;
}): ReactNode {
  const icon =
    rec.kind === 'protein' ? (
      <Beef size={18} />
    ) : rec.kind === 'expiring' ? (
      <AlarmClock size={18} />
    ) : rec.kind === 'fit' ? (
      <CookingPot size={18} />
    ) : (
      <Shuffle size={18} />
    );
  const Wrapper = rec.action ? 'button' : 'div';
  return (
    <Wrapper
      {...(rec.action ? { type: 'button' as const, onClick: onAction } : {})}
      className={cx(
        'flex w-full items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3 text-left',
        rec.action && 'active:bg-surface-2',
      )}
    >
      <span
        className={cx(
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
          rec.kind === 'expiring' ? 'bg-warn/15 text-warn' : 'bg-accent-soft text-accent',
        )}
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-medium leading-snug text-text">{rec.title}</p>
        <p className="text-[13px] leading-snug text-muted">{rec.detail}</p>
      </div>
      {rec.action && <ChevronRight size={18} className="shrink-0 text-faint" />}
    </Wrapper>
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
    <Card>
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-[15px] font-semibold text-text">Letzte 7 Tage</h2>
        {avg > 0 && (
          <span className="tnum text-[12px] text-faint">Ø {avg} kcal</span>
        )}
      </div>
      <div className="relative flex h-24 items-end gap-2">
        {/* Goal line */}
        <div
          className="pointer-events-none absolute inset-x-0 border-t border-dashed border-border"
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
                  'w-full origin-bottom rounded-md',
                  t === 0 ? 'bg-surface-2' : over ? 'bg-warn/70' : isToday ? 'bg-accent' : 'bg-accent/45',
                )}
                style={{ height: t === 0 ? '4px' : `${Math.max(6, (t / max) * 100)}%` }}
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
              'flex-1 text-center text-[11px]',
              i === 6 ? 'font-semibold text-text' : 'text-faint',
            )}
          >
            {new Date(d + 'T00:00:00').toLocaleDateString('de-DE', { weekday: 'narrow' })}
          </span>
        ))}
      </div>
    </Card>
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
