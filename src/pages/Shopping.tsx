import { type ReactNode, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Plus, ShoppingCart, Check, RefreshCw, PackagePlus } from 'lucide-react';
import { db } from '@/db/database';
import { PageHeader } from '@/components/PageHeader';
import { AddInventorySheet } from '@/components/AddInventorySheet';
import { SwipeRow } from '@/components/SwipeRow';
import { Button, EmptyState, Input, cx } from '@/components/ui';
import { useUndo } from '@/components/UndoToast';
import { nowISO } from '@/lib/date';
import type { ShoppingItem } from '@/db/types';
import { formatAmount } from '@/lib/format';
import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  type FoodCategory,
} from '@/lib/categories';
import { classifyWithHints } from '@/db/database';

export function Shopping(): ReactNode {
  const items = useLiveQuery(
    () => db.shoppingList.orderBy('name').toArray(),
    [],
  );
  const [newName, setNewName] = useState('');
  const [restockItem, setRestockItem] = useState<ShoppingItem | null>(null);

  const open = useMemo(
    () => (items ?? []).filter((i) => !i.checked),
    [items],
  );
  const done = useMemo(() => (items ?? []).filter((i) => i.checked), [items]);

  // Grouped in supermarket order, so the list matches the walk through
  // the shop instead of sending you back and forth between aisles.
  const openByCategory = useMemo(() => {
    const buckets = new Map<FoodCategory, typeof open>();
    for (const item of open) {
      const key = item.category ?? 'other';
      const list = buckets.get(key);
      if (list) list.push(item);
      else buckets.set(key, [item]);
    }
    for (const list of buckets.values()) {
      list.sort((a, b) => a.name.localeCompare(b.name, 'de'));
    }
    return CATEGORY_ORDER.filter((c) => buckets.get(c)?.length).map((c) => ({
      category: c,
      items: buckets.get(c)!,
    }));
  }, [open]);

  const add = async () => {
    const name = newName.trim();
    if (!name) return;
    await db.shoppingList.add({
      name,
      category: await classifyWithHints(name),
      checked: false,
      source: 'manual',
      addedAt: nowISO(),
    });
    setNewName('');
  };

  const toggle = (item: ShoppingItem) =>
    item.id !== undefined &&
    db.shoppingList.update(item.id, { checked: !item.checked });

  const showUndo = useUndo();

  const removeItem = async (item: ShoppingItem) => {
    if (item.id === undefined) return;
    await db.shoppingList.delete(item.id);
    showUndo(`„${item.name}“ gelöscht`, async () => {
      await db.shoppingList.add(item);
    });
  };

  const clearDone = async () => {
    const cleared = (items ?? []).filter((i) => i.checked);
    if (cleared.length === 0) return;
    await db.shoppingList.bulkDelete(
      cleared.map((i) => i.id!).filter((id) => id !== undefined),
    );
    showUndo(`${cleared.length} Einträge entfernt`, async () => {
      await db.shoppingList.bulkAdd(cleared);
    });
  };

  return (
    <div className="pb-24">
      <PageHeader title="Einkauf" subtitle={`${open.length} offen`} />

      <div className="max-w-2xl px-5">
        <div className="mb-4 flex gap-2">
          <Input
            placeholder="Artikel hinzufügen…"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && add()}
          />
          <Button onClick={add} className="px-3" aria-label="Hinzufügen">
            <Plus size={20} />
          </Button>
        </div>

        {(items?.length ?? 0) === 0 ? (
          <EmptyState
            icon={<ShoppingCart size={28} />}
            title="Einkaufsliste ist leer"
            hint="Grundnahrungsmittel landen hier automatisch, wenn der Bestand sinkt."
          />
        ) : (
          <div className="flex flex-col gap-5">
            {open.length > 0 ? (
              /* One continuous list; categories are quiet sub-headings inside
                 it, in supermarket order. */
              <div className="overflow-hidden rounded-2xl border border-border bg-surface">
                {openByCategory.map((group, gi) => (
                  <section key={group.category}>
                    <h2
                      className={cx(
                        'px-4 pb-0.5 pt-2.5 text-[11px] font-semibold uppercase tracking-wider text-faint',
                        gi > 0 && 'border-t border-border',
                      )}
                    >
                      {CATEGORY_LABELS[group.category]}
                    </h2>
                    {group.items.map((item, idx) => (
                      <SwipeRow
                        key={item.id}
                        className={cx(idx > 0 && 'border-t border-border')}
                        onSwipeRight={() => toggle(item)}
                        rightLabel="Erledigt"
                        onSwipeLeft={() => removeItem(item)}
                      >
                        <ShoppingRow
                          item={item}
                          onToggle={() => toggle(item)}
                          onTakeover={() => setRestockItem(item)}
                        />
                      </SwipeRow>
                    ))}
                  </section>
                ))}
              </div>
            ) : (
              <p className="px-1 text-[14px] text-muted">
                Alles erledigt. 🎉
              </p>
            )}

            {done.length > 0 && (
              <div>
                <div className="mb-2 flex items-center justify-between px-1">
                  <h2 className="text-[12px] font-semibold uppercase tracking-wider text-faint">
                    Im Wagen · {done.length}
                  </h2>
                  <button
                    onClick={clearDone}
                    className="min-h-[36px] text-[13px] font-medium text-muted active:opacity-60"
                  >
                    Erledigte entfernen
                  </button>
                </div>
                <div className="overflow-hidden rounded-2xl border border-border bg-surface">
                  {done.map((item, idx) => (
                    <SwipeRow
                      key={item.id}
                      className={idx > 0 ? 'border-t border-border' : ''}
                      onSwipeLeft={() => removeItem(item)}
                    >
                      <ShoppingRow
                        item={item}
                        onToggle={() => toggle(item)}
                        onTakeover={() => setRestockItem(item)}
                      />
                    </SwipeRow>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* "In den Vorrat übernehmen" -> scan/manual flow with the name prefilled. */}
      <AddInventorySheet
        key={restockItem?.id ?? 'none'}
        open={!!restockItem}
        prefillName={restockItem?.name}
        // Remove from the shopping list only after it really landed in stock;
        // cancelling must not discard the entry.
        onSaved={() => {
          if (restockItem?.id !== undefined) {
            void db.shoppingList.delete(restockItem.id);
          }
        }}
        onClose={() => setRestockItem(null)}
      />
    </div>
  );
}

function ShoppingRow({
  item,
  onToggle,
  onTakeover,
}: {
  item: ShoppingItem;
  onToggle: () => void;
  onTakeover: () => void;
}): ReactNode {
  return (
    <div className="flex items-center bg-surface">
      {/* The whole row toggles – in a shop you tap with a thumb, not a pen. */}
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={item.checked}
        aria-label={`${item.name} ${item.checked ? 'wieder offen' : 'abhaken'}`}
        className="flex min-h-[48px] min-w-0 flex-1 items-center gap-3 px-4 py-2 text-left active:bg-surface-2"
      >
        <span
          className={cx(
            'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
            item.checked ? 'border-accent bg-accent text-white' : 'border-faint/60',
          )}
        >
          {item.checked && <Check size={14} strokeWidth={3} />}
        </span>
        <span className="min-w-0 flex-1">
          <span
            className={cx(
              'block truncate text-[15px]',
              item.checked ? 'text-faint line-through' : 'text-text',
            )}
          >
            {item.name}
          </span>
          {(item.amount !== undefined || item.source === 'auto-restock') && (
            <span className="mt-0.5 flex items-center gap-1.5 text-[12px] text-faint">
              {item.amount !== undefined && (
                <span className="tnum">
                  {/* Shopping entries may carry an amount without a unit. */}
                  {item.unit ? formatAmount(item.amount, item.unit) : item.amount}
                </span>
              )}
              {item.source === 'auto-restock' && (
                <span className="flex items-center gap-1 text-accent">
                  <RefreshCw size={11} /> Nachkauf · Vorrat unter Minimum
                </span>
              )}
            </span>
          )}
        </span>
      </button>
      {item.checked && (
        <button
          type="button"
          onClick={onTakeover}
          className="mr-2 flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-lg border border-border px-3 text-[13px] font-medium text-accent active:bg-accent-soft"
        >
          <PackagePlus size={15} /> In Vorrat
        </button>
      )}
    </div>
  );
}
