import { type ReactNode, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Plus, Search, Package, X } from 'lucide-react';
import { db } from '@/db/database';
import { PageHeader } from '@/components/PageHeader';
import { AddInventorySheet } from '@/components/AddInventorySheet';
import { SwipeRow } from '@/components/SwipeRow';
import { Button, EmptyState, Input, cx } from '@/components/ui';
import { useUndo } from '@/components/UndoToast';
import { isExpiringSoon, isLowStaple } from '@/lib/actions';
import { daysUntil } from '@/lib/date';
import { formatAmount, relativeBestBefore } from '@/lib/format';
import type { InventoryItem, StorageLocation } from '@/db/types';

const LOCATIONS: { key: StorageLocation; label: string }[] = [
  { key: 'fridge', label: 'Kühlschrank' },
  { key: 'freezer', label: 'Gefrierer' },
  { key: 'pantry', label: 'Vorrat' },
];

type Filter = 'all' | 'expired' | 'expiring' | 'low' | StorageLocation;

/** Urgency drives both the dot colour and the sort order. */
type Urgency = 'expired' | 'soon' | 'low' | 'none';

function urgencyOf(item: InventoryItem): Urgency {
  const days = item.bestBefore ? daysUntil(item.bestBefore) : null;
  if (days !== null && days < 0) return 'expired';
  if (isExpiringSoon(item)) return 'soon';
  if (isLowStaple(item)) return 'low';
  return 'none';
}

/** Only a best-before within this window earns a line in the list. */
const RELEVANT_DAYS = 14;

const URGENCY_RANK: Record<Urgency, number> = {
  expired: 3,
  soon: 2,
  low: 1,
  none: 0,
};

export function Inventory(): ReactNode {
  const items = useLiveQuery(() => db.inventory.toArray(), []);
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
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

  const grouped = useMemo(() => {
    const map: Record<StorageLocation, InventoryItem[]> = {
      fridge: [],
      freezer: [],
      pantry: [],
    };
    for (const i of visible) map[i.location].push(i);
    for (const loc of Object.keys(map) as StorageLocation[]) {
      map[loc].sort((a, b) => {
        const d = URGENCY_RANK[urgencyOf(b)] - URGENCY_RANK[urgencyOf(a)];
        if (d !== 0) return d;
        // Then by best-before, undated items last, finally alphabetical.
        const da = a.bestBefore ? daysUntil(a.bestBefore) : Infinity;
        const dbb = b.bestBefore ? daysUntil(b.bestBefore) : Infinity;
        if (da !== dbb) return da - dbb;
        return a.name.localeCompare(b.name, 'de');
      });
    }
    return map;
  }, [visible]);

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
            <Button onClick={openAdd} className="h-10 px-3">
              <Plus size={18} /> Hinzufügen
            </Button>
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

      {all.length > 0 && (
        <div className="no-scrollbar flex gap-2 overflow-x-auto px-5 pb-4">
          <Chip
            label="Alle"
            count={all.length}
            active={filter === 'all'}
            onClick={() => setFilter('all')}
          />
          {counts.expired > 0 && (
            <Chip
              label="Abgelaufen"
              count={counts.expired}
              tone="danger"
              active={filter === 'expired'}
              onClick={() => setFilter('expired')}
            />
          )}
          {counts.expiring > 0 && (
            <Chip
              label="Läuft ab"
              count={counts.expiring}
              tone="warn"
              active={filter === 'expiring'}
              onClick={() => setFilter('expiring')}
            />
          )}
          {counts.low > 0 && (
            <Chip
              label="Wenig"
              count={counts.low}
              active={filter === 'low'}
              onClick={() => setFilter('low')}
            />
          )}
          {LOCATIONS.map((loc) => {
            const n = all.filter((i) => i.location === loc.key).length;
            return n > 0 ? (
              <Chip
                key={loc.key}
                label={loc.label}
                count={n}
                active={filter === loc.key}
                onClick={() => setFilter(loc.key)}
              />
            ) : null;
          })}
        </div>
      )}

      <div className="px-5">
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
          <div className="flex flex-col gap-5">
            {LOCATIONS.map(({ key, label }) =>
              grouped[key].length > 0 ? (
                <section key={key}>
                  <h2 className="flex items-baseline gap-2 px-1 pb-1.5 text-[12px] font-semibold uppercase tracking-wider text-faint">
                    {label}
                    <span className="tnum font-medium normal-case tracking-normal">
                      {grouped[key].length}
                    </span>
                  </h2>
                  {/* One bordered container per group; rows are separated by
                      hairlines instead of each being its own card. */}
                  <div className="overflow-hidden rounded-2xl border border-border bg-surface">
                    {grouped[key].map((item, idx) => (
                      <SwipeRow
                        key={item.id}
                        className={idx > 0 ? 'border-t border-border' : ''}
                        onSwipeLeft={() => removeItem(item)}
                      >
                        <InventoryRow
                          item={item}
                          onClick={() => openEdit(item)}
                        />
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

function Chip({
  label,
  count,
  active,
  tone,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  tone?: 'warn' | 'danger';
  onClick: () => void;
}): ReactNode {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cx(
        'flex min-h-[36px] shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-medium transition-colors',
        active
          ? 'border-text bg-text text-bg'
          : 'border-border bg-surface text-muted',
      )}
    >
      {tone && !active && (
        <span
          className={cx(
            'h-[7px] w-[7px] rounded-full',
            tone === 'danger' ? 'bg-danger' : 'bg-warn',
          )}
        />
      )}
      {label}
      <span className="tnum opacity-60">{count}</span>
    </button>
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

  // One status line, and only when it is actionable: a best-before three
  // weeks out tells you nothing while cooking, it just adds a second line to
  // every row. The exact date stays in the detail view.
  const days = item.bestBefore ? daysUntil(item.bestBefore) : null;
  const parts: string[] = [];
  if (item.bestBefore && days !== null && days <= RELEVANT_DAYS) {
    parts.push(relativeBestBefore(item.bestBefore));
  }
  if (low && item.minStock !== undefined) {
    parts.push(`Fast leer · unter ${formatAmount(item.minStock, item.unit)}`);
  }
  const status = parts.join(' · ');

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-[52px] w-full items-center gap-3 bg-surface px-4 py-2.5 text-left active:bg-surface-2"
    >
      <span
        aria-hidden
        className={cx(
          'h-[7px] w-[7px] shrink-0 rounded-full',
          urgency === 'expired'
            ? 'bg-danger'
            : urgency === 'soon' || urgency === 'low'
              ? 'bg-warn'
              : 'bg-transparent',
        )}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-medium text-text">
          {item.name}
        </p>
        {status && (
          <p
            className={cx(
              'truncate text-[12.5px]',
              urgency === 'expired'
                ? 'text-danger'
                : urgency === 'soon' || urgency === 'low'
                  ? 'text-warn'
                  : 'text-faint',
            )}
          >
            {status}
          </p>
        )}
      </div>
      <span className="tnum shrink-0 text-[15px] font-medium text-muted">
        {formatAmount(item.amount, item.unit)}
      </span>
    </button>
  );
}
