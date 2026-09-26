import { type ReactNode, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Search, Package, X, ChevronDown } from 'lucide-react';
import { db } from '@/db/database';
import { PageHeader } from '@/components/PageHeader';
import { AddInventorySheet } from '@/components/AddInventorySheet';
import { SwipeRow } from '@/components/SwipeRow';
import { AddButton, EmptyState, Input, Section, TextTabs } from '@/components/ui';
import { useUndo } from '@/components/UndoToast';
import { isExpiringSoon, isLowStaple } from '@/lib/actions';
import { daysUntil } from '@/lib/date';
import { formatAmount, relativeBestBefore } from '@/lib/format';
import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  type FoodCategory,
} from '@/lib/categories';
import type { InventoryItem, StorageLocation } from '@/db/types';

const LOCATIONS: { key: StorageLocation; label: string }[] = [
  { key: 'fridge', label: 'Kühlschrank' },
  { key: 'freezer', label: 'Gefrierer' },
  { key: 'pantry', label: 'Vorratsschrank' },
];

type Filter = 'all' | 'expired' | 'expiring' | 'low' | StorageLocation;

/** Group by where it is stored, or by what kind of food it is. */
type GroupMode = 'location' | 'category';

interface Group {
  key: string;
  label: string;
  items: InventoryItem[];
}

/** Urgency drives both the dot colour and the sort order. */
type Urgency = 'expired' | 'soon' | 'low' | 'none';

function urgencyOf(item: InventoryItem): Urgency {
  const days = item.bestBefore ? daysUntil(item.bestBefore) : null;
  if (days !== null && days < 0) return 'expired';
  if (isExpiringSoon(item)) return 'soon';
  if (isLowStaple(item)) return 'low';
  return 'none';
}

const URGENCY_RANK: Record<Urgency, number> = {
  expired: 3,
  soon: 2,
  low: 1,
  none: 0,
};

function byUrgencyThenDate(a: InventoryItem, b: InventoryItem): number {
  const d = URGENCY_RANK[urgencyOf(b)] - URGENCY_RANK[urgencyOf(a)];
  if (d !== 0) return d;
  // Then by best-before, undated items last, finally alphabetical.
  const da = a.bestBefore ? daysUntil(a.bestBefore) : Infinity;
  const dbb = b.bestBefore ? daysUntil(b.bestBefore) : Infinity;
  if (da !== dbb) return da - dbb;
  return a.name.localeCompare(b.name, 'de');
}

export function Inventory(): ReactNode {
  const items = useLiveQuery(() => db.inventory.toArray(), []);
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [groupMode, setGroupMode] = useState<GroupMode>('location');
  const [addOpen, setAddOpen] = useState(false);
  const [editItem, setEditItem] = useState<InventoryItem | undefined>();
  const showUndo = useUndo();

  const all = useMemo(() => items ?? [], [items]);

  // Counts feed the filter chips, so the tab answers "what needs attention?"
  // before any scrolling happens.
  const counts = useMemo(() => {
    let expired = 0;
    let expiring = 0;
    let low = 0;
    for (const i of all) {
      const u = urgencyOf(i);
      if (u === 'expired') expired++;
      else if (u === 'soon') expiring++;
      if (isLowStaple(i)) low++;
    }
    return { expired, expiring, low };
  }, [all]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return all.filter((i) => {
      if (q && !`${i.name} ${i.brand ?? ''}`.toLowerCase().includes(q)) {
        return false;
      }
      switch (filter) {
        case 'all':
          return true;
        case 'expired':
          return urgencyOf(i) === 'expired';
        case 'expiring':
          return urgencyOf(i) === 'soon';
        case 'low':
          return isLowStaple(i);
        default:
          return i.location === filter;
      }
    });
  }, [all, query, filter]);

  const groups = useMemo<Group[]>(() => {
    const buckets = new Map<string, InventoryItem[]>();
    for (const i of visible) {
      const key =
        groupMode === 'location' ? i.location : (i.category ?? 'other');
      const list = buckets.get(key);
      if (list) list.push(i);
      else buckets.set(key, [i]);
    }

    for (const list of buckets.values()) list.sort(byUrgencyThenDate);

    // Keep a stable, meaningful order: storage order or supermarket order.
    const order: string[] =
      groupMode === 'location'
        ? LOCATIONS.map((l) => l.key)
        : CATEGORY_ORDER;
    const labelOf = (key: string): string =>
      groupMode === 'location'
        ? (LOCATIONS.find((l) => l.key === key)?.label ?? key)
        : CATEGORY_LABELS[key as FoodCategory];

    return order
      .filter((key) => (buckets.get(key)?.length ?? 0) > 0)
      .map((key) => ({ key, label: labelOf(key), items: buckets.get(key)! }));
  }, [visible, groupMode]);

  const removeItem = async (item: InventoryItem) => {
    if (item.id === undefined) return;
    await db.inventory.delete(item.id);
    // Re-adding with the original id keeps diary references intact.
    showUndo(`„${item.name}“ gelöscht`, async () => {
      await db.inventory.add(item);
    });
  };

  const openEdit = (item: InventoryItem) => {
    setEditItem(item);
    setAddOpen(true);
  };

  const openAdd = () => {
    setEditItem(undefined);
    setAddOpen(true);
  };

  const closeSearch = () => {
    setSearchOpen(false);
    setQuery('');
  };

  return (
    <div className="pb-24">
      <PageHeader
        title="Vorrat"
        action={
          <div className="flex items-center gap-1">
            <button
              onClick={() => (searchOpen ? closeSearch() : setSearchOpen(true))}
              aria-label={searchOpen ? 'Suche schließen' : 'Suchen'}
              className="flex h-10 w-10 items-center justify-center rounded-full text-muted active:bg-surface-2"
            >
              {searchOpen ? <X size={21} /> : <Search size={21} />}
            </button>
            <AddButton label="Artikel" onClick={openAdd} />
          </div>
        }
      />

      {searchOpen && (
        <div className="px-5 pb-3">
          <Input
            autoFocus
            placeholder="Vorrat durchsuchen…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      )}

      <div className="px-5">
        {all.length > 0 && (
          <TextTabs
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: 'Alle', count: all.length },
              ...(counts.expired > 0
                ? [{ value: 'expired' as Filter, label: 'Abgelaufen', count: counts.expired, tone: 'danger' as const }]
                : []),
              ...(counts.expiring > 0
                ? [{ value: 'expiring' as Filter, label: 'Läuft ab', count: counts.expiring, tone: 'warn' as const }]
                : []),
              ...(counts.low > 0
                ? [{ value: 'low' as Filter, label: 'Wenig', count: counts.low }]
                : []),
            ]}
            trailing={
              <label className="relative flex items-center">
                <span className="sr-only">Ordnen nach</span>
                <select
                  value={groupMode}
                  onChange={(e) => setGroupMode(e.target.value as GroupMode)}
                  className="min-h-[44px] appearance-none bg-transparent pr-5 text-[14px] font-medium text-muted outline-none"
                >
                  <option value="location">Nach Ort</option>
                  <option value="category">Nach Art</option>
                </select>
                <ChevronDown
                  size={14}
                  aria-hidden
                  className="pointer-events-none absolute right-0 text-muted"
                />
              </label>
            }
          />
        )}

        <div className="mt-6">
          {all.length === 0 ? (
            <EmptyState
              icon={<Package size={28} />}
              title="Dein Vorrat ist leer"
              hint="Scanne einen Barcode oder füge Artikel manuell hinzu."
            />
          ) : visible.length === 0 ? (
            <EmptyState
              title="Nichts gefunden"
              hint="Andere Suche oder anderen Filter probieren."
            />
          ) : (
            // Masonry via CSS columns keeps two iPad columns balanced.
            <div className="md:columns-2 md:gap-10">
              {groups.map((group) => (
                <Section
                  key={group.key}
                  title={group.label}
                  className="mb-9 break-inside-avoid"
                  action={
                    <span className="tnum text-[13px] text-faint">
                      {group.items.length}
                    </span>
                  }
                >
                  <ul>
                    {group.items.map((item) => (
                      <li key={item.id} className="border-b border-border last:border-b-0">
                        <SwipeRow className="" onSwipeLeft={() => removeItem(item)}>
                          <InventoryRow item={item} onClick={() => openEdit(item)} />
                        </SwipeRow>
                      </li>
                    ))}
                  </ul>
                </Section>
              ))}
            </div>
          )}
        </div>
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
  const urgency = urgencyOf(item);
  const low = isLowStaple(item);
  const days = item.bestBefore ? daysUntil(item.bestBefore) : null;

  // The second line always answers the same question – how long does it
  // keep? – and appends stock only when it is running low.
  const keeps = item.bestBefore
    ? days !== null && days > 60
      ? `MHD ${new Date(item.bestBefore + 'T00:00:00').toLocaleDateString('de-DE', { month: 'short', year: 'numeric' })}`
      : relativeBestBefore(item.bestBefore)
    : 'Ohne MHD';
  const tone =
    urgency === 'expired' ? 'text-danger' : urgency === 'soon' ? 'text-warn' : 'text-faint';

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-[60px] w-full items-center gap-3 bg-bg py-2.5 text-left active:bg-surface-2"
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[16px] text-text">{item.name}</span>
        <span className="tnum block truncate text-[13px]">
          <span className={tone}>{keeps}</span>
          {low && item.minStock !== undefined && (
            <span className="text-protein">
              {' '}· fast leer (unter {formatAmount(item.minStock, item.unit)})
            </span>
          )}
        </span>
      </span>
      <span className="tnum shrink-0 text-[15px] text-muted">
        {formatAmount(item.amount, item.unit)}
      </span>
    </button>
  );
}
