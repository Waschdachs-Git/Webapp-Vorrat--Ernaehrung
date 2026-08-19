import { type ReactNode, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Plus, Search, Package, Snowflake, Refrigerator, Archive } from 'lucide-react';
import { db } from '@/db/database';
import { PageHeader } from '@/components/PageHeader';
import { AddInventorySheet } from '@/components/AddInventorySheet';
import { SwipeRow } from '@/components/SwipeRow';
import { Button, Badge, EmptyState, Input, cx } from '@/components/ui';
import { isExpiringSoon, isLowStaple } from '@/lib/actions';
import { daysUntil, formatDay } from '@/lib/date';
import type { InventoryItem, StorageLocation } from '@/db/types';

const LOCATIONS: { key: StorageLocation; label: string; icon: ReactNode }[] = [
  { key: 'fridge', label: 'Kühlschrank', icon: <Refrigerator size={16} /> },
  { key: 'freezer', label: 'Gefrierer', icon: <Snowflake size={16} /> },
  { key: 'pantry', label: 'Vorrat', icon: <Archive size={16} /> },
];

export function Inventory(): ReactNode {
  const items = useLiveQuery(() => db.inventory.toArray(), []);
  const [query, setQuery] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [editItem, setEditItem] = useState<InventoryItem | undefined>();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (items ?? []).filter(
      (i) => !q || i.name.toLowerCase().includes(q) || i.brand?.toLowerCase().includes(q),
    );
  }, [items, query]);

  const grouped = useMemo(() => {
    const map: Record<StorageLocation, InventoryItem[]> = {
      fridge: [],
      freezer: [],
      pantry: [],
    };
    for (const i of filtered) map[i.location].push(i);
    for (const loc of Object.keys(map) as StorageLocation[]) {
      map[loc].sort(sortItems);
    }
    return map;
  }, [filtered]);

  const openEdit = (item: InventoryItem) => {
    setEditItem(item);
    setAddOpen(true);
  };

  const openAdd = () => {
    setEditItem(undefined);
    setAddOpen(true);
  };

  return (
    <div className="pb-24">
      <PageHeader
        title="Vorrat"
        action={
          <Button onClick={openAdd} className="h-10 px-3">
            <Plus size={18} /> Hinzufügen
          </Button>
        }
      />

      <div className="px-5">
        <div className="relative mb-4">
          <Search
            size={18}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint"
          />
          <Input
            placeholder="Vorrat durchsuchen…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        {(items?.length ?? 0) === 0 ? (
          <EmptyState
            icon={<Package size={28} />}
            title="Dein Vorrat ist leer"
            hint="Scanne einen Barcode oder füge Artikel manuell hinzu."
          />
        ) : (
          <div className="flex flex-col gap-5">
            {LOCATIONS.map(({ key, label, icon }) =>
              grouped[key].length > 0 ? (
                <section key={key}>
                  <div className="mb-2 flex items-center gap-1.5 text-muted">
                    {icon}
                    <h2 className="text-[14px] font-semibold">{label}</h2>
                    <span className="text-[13px] text-faint">
                      · {grouped[key].length}
                    </span>
                  </div>
                  <div className="flex flex-col gap-2">
                    {grouped[key].map((item) => (
                      <SwipeRow
                        key={item.id}
                        onSwipeLeft={() =>
                          item.id !== undefined && db.inventory.delete(item.id)
                        }
                      >
                        <InventoryRow item={item} onClick={() => openEdit(item)} />
                      </SwipeRow>
                    ))}
                  </div>
                </section>
              ) : null,
            )}
          </div>
        )}
      </div>

      <AddInventorySheet
        // Remount per target so the form initialises from the item being edited.
        key={editItem?.id ?? 'new'}
        open={addOpen}
        onClose={() => setAddOpen(false)}
        editItem={editItem}
      />
    </div>
  );
}

function InventoryRow({
  item,
  onClick,
}: {
  item: InventoryItem;
  onClick: () => void;
}): ReactNode {
  const expiring = isExpiringSoon(item);
  const low = isLowStaple(item);
  const days = item.bestBefore ? daysUntil(item.bestBefore) : null;
  const expired = days !== null && days < 0;

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between gap-3 rounded-2xl border border-border bg-surface px-4 py-3 text-left active:bg-surface-2"
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <p className="truncate text-[15px] font-medium text-text">{item.name}</p>
          {item.isStaple && <Badge>Basis</Badge>}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          {item.bestBefore && (
            <span
              className={cx(
                'text-[12px]',
                expired ? 'text-danger' : expiring ? 'text-warn' : 'text-faint',
              )}
            >
              MHD {formatDay(item.bestBefore)}
            </span>
          )}
          {expired ? (
            <Badge tone="danger">abgelaufen</Badge>
          ) : expiring ? (
            <Badge tone="warn">läuft bald ab</Badge>
          ) : null}
          {low && <Badge tone="danger">wenig</Badge>}
        </div>
      </div>
      <span className="tnum shrink-0 text-[15px] font-medium text-text">
        {item.amount} {item.unit}
      </span>
    </button>
  );
}

function sortItems(a: InventoryItem, b: InventoryItem): number {
  // Expiring/low first, then alphabetic.
  const sa = scoreUrgency(a);
  const sb = scoreUrgency(b);
  if (sa !== sb) return sb - sa;
  return a.name.localeCompare(b.name, 'de');
}

function scoreUrgency(i: InventoryItem): number {
  let s = 0;
  if (isExpiringSoon(i)) s += 2;
  if (isLowStaple(i)) s += 1;
  return s;
}
