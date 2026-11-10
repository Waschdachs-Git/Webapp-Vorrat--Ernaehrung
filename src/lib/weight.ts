import { db, PROFILE_ID } from '@/db/database';

/** Bounds for a body weight in kg. Outside of them it is a typing mistake. */
export const MIN_WEIGHT_KG = 20;
export const MAX_WEIGHT_KG = 400;

/**
 * A mistyped weight ("608" for 60,8) would not just bend the chart: the
 * profile weight follows the log, and with it the calculated targets.
 */
export function isPlausibleWeight(kg: number): boolean {
  return Number.isFinite(kg) && kg >= MIN_WEIGHT_KG && kg <= MAX_WEIGHT_KG;
}

/** The profile's current weight is the most recent log entry. */
async function syncProfileWeight(): Promise<void> {
  const latest = await db.weightLog.orderBy('date').last();
  if (latest) await db.profile.update(PROFILE_ID, { weightKg: latest.weightKg });
}

/** Record the weight for a day (one entry per day; a second one replaces it). */
export async function saveWeight(date: string, weightKg: number): Promise<void> {
  await db.transaction('rw', db.weightLog, db.profile, async () => {
    const existing = await db.weightLog.where('date').equals(date).first();
    if (existing?.id !== undefined) {
      await db.weightLog.update(existing.id, { weightKg });
    } else {
      await db.weightLog.add({ date, weightKg });
    }
    await syncProfileWeight();
  });
}

/** Change one entry's value. */
export async function updateWeight(id: string, weightKg: number): Promise<void> {
  await db.transaction('rw', db.weightLog, db.profile, async () => {
    await db.weightLog.update(id, { weightKg });
    await syncProfileWeight();
  });
}

/** Remove an entry; returns a function that puts it back. */
export async function deleteWeight(id: string): Promise<() => Promise<void>> {
  return db.transaction('rw', db.weightLog, db.profile, async () => {
    const entry = await db.weightLog.get(id);
    await db.weightLog.delete(id);
    await syncProfileWeight();
    return async () => {
      if (!entry) return;
      await db.transaction('rw', db.weightLog, db.profile, async () => {
        await db.weightLog.put(entry);
        await syncProfileWeight();
      });
    };
  });
}
