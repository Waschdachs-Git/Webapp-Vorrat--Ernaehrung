import { useLiveQuery } from 'dexie-react-hooks';
import { db, PROFILE_ID } from '@/db/database';
import { localDayBounds } from '@/lib/date';
import { sumDiary, EMPTY_NUTRIMENTS } from '@/lib/nutrition';
import { effectiveTargets } from '@/lib/health';
import type { DiaryEntry, Nutriments, Profile, Targets } from '@/db/types';

export interface TodayData {
  profile: Profile | undefined;
  targets: Targets;
  consumed: Nutriments;
  remaining: Targets;
  entries: DiaryEntry[];
  loading: boolean;
}

const ZERO_TARGETS: Targets = { kcal: 0, protein: 0, carbs: 0, fat: 0 };

/** Aggregated view of one day's diary (YYYY-MM-DD) against the profile's targets. */
export function useDiaryDay(day: string): TodayData {
  const profile = useLiveQuery(() => db.profile.get(PROFILE_ID), []);

  // Range query over the `datetime` index instead of scanning the whole table.
  const entries = useLiveQuery(async () => {
    const { start, end } = localDayBounds(day);
    return db.diary.where('datetime').between(start, end, true, true).toArray();
  }, [day]);

  const loading = profile === undefined || entries === undefined;
  const list = entries ?? [];
  const consumed = sumDiary(list);
  const targets = profile ? effectiveTargets(profile) : ZERO_TARGETS;

  const remaining: Targets = {
    kcal: Math.round(targets.kcal - consumed.kcal),
    protein: Math.round(targets.protein - consumed.protein),
    carbs: Math.round(targets.carbs - consumed.carbs),
    fat: Math.round(targets.fat - consumed.fat),
  };

  return {
    profile: profile ?? undefined,
    targets,
    consumed: consumed ?? EMPTY_NUTRIMENTS,
    remaining,
    entries: list,
    loading,
  };
}
