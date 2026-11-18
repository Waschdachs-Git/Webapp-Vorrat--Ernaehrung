import { db } from '@/db/database';
import type { InventoryItem } from '@/db/types';

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** The earlier of two optional ISO dates. */
export function earliest(a?: string, b?: string): string | undefined {
  if (!a) return b;
  if (!b) return a;
  return a < b ? a : b;
}

/**
 * Put a newly bought package into stock: onto an existing item (same unit)
 * or as a new one. Returns a function that undoes exactly this.
 *
 * Joins the caller's transaction when there is one.
 */
export async function storePurchase(
  fresh: Omit<InventoryItem, 'id'>,
  mergeInto?: string,
): Promise<() => Promise<unknown>> {
  return db.transaction('rw', db.inventory, async () => {
    // Read again: the amount may have changed since the form was opened.
    const current = mergeInto !== undefined ? await db.inventory.get(mergeInto) : undefined;
    if (current?.id !== undefined && current.unit === fresh.unit) {
      // The older package runs out first, so its date stays the one to watch.
      const oldDate = current.amount > 0 ? current.bestBefore : undefined;
      await db.inventory.update(current.id, {
        ...fresh,
        addedAt: current.addedAt,
        amount: round1(current.amount + fresh.amount),
        bestBefore: earliest(oldDate, fresh.bestBefore),
      });
      return () => db.inventory.put(current);
    }
    const id = await db.inventory.add(fresh as InventoryItem);
    return () => db.inventory.delete(id);
  });
}

/** An item of that barcode already in stock (the fullest one, if several). */
export async function findByBarcode(barcode: string): Promise<InventoryItem | undefined> {
  const hits = await db.inventory.where('barcode').equals(barcode).toArray();
  return hits.sort((a, b) => b.amount - a.amount)[0];
}
