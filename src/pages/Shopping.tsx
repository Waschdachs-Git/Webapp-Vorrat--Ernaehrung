import { type ReactNode, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Plus, ShoppingCart, Check, RefreshCw } from 'lucide-react';
import { db } from '@/db/database';
import { PageHeader } from '@/components/PageHeader';
import { AddInventorySheet } from '@/components/AddInventorySheet';
import { SwipeRow } from '@/components/SwipeRow';
import { Button, Badge, EmptyState, Input, cx } from '@/components/ui';
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

      <div className="px-5">
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
          <div className="flex flex-col gap-2">
            {openByCategory.map((group) => (
              <section key={group.category} className="mb-1">
                <h2 className="px-1 pb-1.5 text-[12px] font-semibold uppercase tracking-wider text-faint">
                  {CATEGORY_LABELS[group.category]}
                </h2>
                <div className="overflow-hidden rounded-2xl border border-border bg-surface">
                  {group.items.map((item, idx) => (
                    <SwipeRow
                      key={item.id}
                      className={idx > 0 ? 'border-t border-border' : ''}
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
                </div>
              </section>
            ))}

            {done.length > 0 && (
              <div className="mt-4">
                <div className="mb-2 flex items-center justify-between">
                  <h2 className="text-[13px] font-semibold uppercase tracking-wide text-faint">
                    Erledigt
                  </h2>
                  <button
                    onClick={clearDone}
                    className="text-[13px] font-medium text-muted active:opacity-60"
                  >
                    Liste leeren
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
    <div className="flex items-center gap-3 bg-surface px-3 py-3">
      <button
        type="button"
        onClick={onToggle}
        aria-label={item.checked ? 'Als offen markieren' : 'Abhaken'}
        className={cx(
          'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
          item.checked ? 'border-accent bg-accent text-white' : 'border-border',
        )}
      >
        {item.checked && <Check size={16} />}
      </button>
      <div className="min-w-0 flex-1">
        <p
          className={cx(
            'truncate text-[15px]',
            item.checked ? 'text-faint line-through' : 'text-text',
          )}
        >
          {item.name}
        </p>
        <div className="mt-0.5 flex items-center gap-1.5">
          {item.amount !== undefined && (
            <span className="text-[12px] text-faint">
              {/* Shopping entries may carry an amount without a unit. */}
              {item.unit ? formatAmount(item.amount, item.unit) : item.amount}
            </span>
          )}
          {item.source === 'auto-restock' && (
            <Badge tone="accent">
              <RefreshCw size={10} className="mr-1" /> Auto
            </Badge>
          )}
        </div>
      </div>
      {item.checked && (
        <button
          type="button"
          onClick={onTakeover}
          className="shrink-0 rounded-lg px-2 py-1 text-[12px] font-medium text-accent active:bg-accent-soft"
        >
          In Vorrat
        </button>
      )}
    </div>
  );
}
