import { type ReactNode, useCallback, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Check, ChevronRight, Plus } from 'lucide-react';
import { classifyWithHints, db, rememberCategory } from '@/db/database';
import { BottomSheet } from './BottomSheet';
import { LazyBarcodeScanner } from './LazyBarcodeScanner';
import { Button, Field, Select } from './ui';
import {
  type Draft,
  EMPTY_DRAFT,
  InventoryFields,
  draftFromItem,
  draftFromProduct,
  guessLocation,
  itemFromDraft,
} from './InventoryForm';
import { lookupBarcode } from '@/lib/openfoodfacts';
import { runAutoRestock } from '@/lib/actions';
import { nowISO } from '@/lib/date';
import { formatAmount } from '@/lib/format';
import { namesMatch } from '@/lib/match';
import type { InventoryItem, ShoppingItem } from '@/db/types';

type Step = 'scan' | 'form';

/**
 * Put the shopping away: scan one product after the other, check amount and
 * best-before, and each lands in stock – added to what is already there –
 * while its entry leaves the shopping list. Nothing is stored before the
 * user confirms the amount.
 */
export function PutAwaySheet({
  open,
  onClose,
  focusEntryId,
}: {
  open: boolean;
  onClose: () => void;
  /** Opened from one row: that entry is what the first scan is for. */
  focusEntryId?: string;
}): ReactNode {
  const list = useLiveQuery(() => db.shoppingList.toArray(), []);
  const [step, setStep] = useState<Step>('scan');
  // Bumped after each product so the camera starts fresh for the next one.
  const [round, setRound] = useState(0);
  const [focusId, setFocusId] = useState(focusEntryId);
  const [searching, setSearching] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [info, setInfo] = useState<string | null>(null);
  const [entryId, setEntryId] = useState('');
  const [existing, setExisting] = useState<InventoryItem | null>(null);
  const [addUp, setAddUp] = useState(true);
  const [saving, setSaving] = useState(false);
  const [last, setLast] = useState<{ name: string; undo: () => Promise<void> } | null>(null);

  const byName = (a: ShoppingItem, b: ShoppingItem) => a.name.localeCompare(b.name, 'de');
  const inCart = (list ?? []).filter((s) => s.checked).sort(byName);
  const candidates = [...inCart, ...(list ?? []).filter((s) => !s.checked).sort(byName)];
  const focusEntry = candidates.find((s) => s.id === focusId);

  const showForm = (next: Draft, known: InventoryItem | undefined, entry: ShoppingItem | undefined, note: string | null) => {
    setDraft(next);
    setExisting(known ?? null);
    setAddUp(true);
    setEntryId(entry?.id ?? '');
    setInfo(note);
    setStep('form');
  };

  const handleScan = async (code: string) => {
    setLast(null);
    setSearching(true);
    const [res, known] = await Promise.all([lookupBarcode(code), findExisting(code)]);
    setSearching(false);
    const product = res.status === 'found' ? res.product : undefined;

    let next: Draft;
    if (known) {
      // Bought before: keep the user's name, place and settings; only the
      // amount (one package) and the new best-before are open.
      next = { ...draftFromItem(known), amount: '', bestBefore: '' };
      if (product?.packageSize?.unit === known.unit) {
        next.amount = String(product.packageSize.amount);
      }
    } else if (product) {
      const category = await classifyWithHints(product.name, product.categoryTags);
      next = {
        ...draftFromProduct(product, code),
        category,
        location: guessLocation(product.name, category, product.categoryTags),
      };
    } else {
      next = { ...EMPTY_DRAFT, barcode: code, ...(focusEntry ? fromEntry(focusEntry) : {}) };
    }

    const entry = focusEntry ?? bestEntry(next.name, candidates);
    showForm(
      next,
      known,
      entry,
      product || known
        ? 'Menge und Mindesthaltbarkeit prüfen, dann einräumen.'
        : res.status === 'not-found'
          ? 'Produkt nicht gefunden – bitte Name und Menge eintragen.'
          : 'Keine Verbindung – bitte Name und Menge eintragen.',
    );
  };

  // A stable callback: the scanner restarts the camera whenever it changes.
  const scanRef = useRef(handleScan);
  scanRef.current = handleScan;
  const onScan = useCallback((code: string) => void scanRef.current(code), []);

  const startFromEntry = async (entry: ShoppingItem) => {
    setLast(null);
    const known = await findExisting(undefined, entry.name);
    if (known) {
      // Keep the stock item's unit; the planned amount only fits if it matches.
      const fits = entry.amount !== undefined && (entry.unit ?? known.unit) === known.unit;
      showForm(
        { ...draftFromItem(known), amount: fits ? String(entry.amount) : '', bestBefore: '' },
        known,
        entry,
        null,
      );
      return;
    }
    const category = entry.category ?? (await classifyWithHints(entry.name));
    showForm(
      { ...EMPTY_DRAFT, ...fromEntry(entry), category, location: guessLocation(entry.name, category) },
      undefined,
      entry,
      null,
    );
  };

  const startBlank = () => {
    setLast(null);
    showForm(EMPTY_DRAFT, undefined, undefined, null);
  };

  const backToScan = () => {
    setStep('scan');
    setInfo(null);
    setRound((r) => r + 1);
  };

  const save = async () => {
    setSaving(true);
    const fresh = itemFromDraft(draft, nowISO());
    const entry = candidates.find((s) => s.id === entryId);

    let undoStock: () => Promise<unknown>;
    if (existing?.id !== undefined && addUp && existing.unit === fresh.unit) {
      const previous = { ...existing };
      // The older package runs out first, so its date stays the one to watch.
      const oldDate = existing.amount > 0 ? existing.bestBefore : undefined;
      await db.inventory.update(existing.id, {
        ...fresh,
        addedAt: existing.addedAt,
        amount: Math.round((existing.amount + fresh.amount) * 10) / 10,
        bestBefore: earliest(oldDate, fresh.bestBefore),
      });
      undoStock = () => db.inventory.put(previous);
    } else {
      const id = await db.inventory.add(fresh as InventoryItem);
      undoStock = () => db.inventory.delete(id);
    }
    if (entry?.id !== undefined) await db.shoppingList.delete(entry.id);
    if (draft.categoryTouched) await rememberCategory(fresh.name, draft.category);
    await runAutoRestock();

    setLast({
      name: fresh.name,
      undo: async () => {
        await undoStock();
        if (entry) await db.shoppingList.put(entry);
        await runAutoRestock();
      },
    });
    setFocusId(undefined);
    setSaving(false);
    backToScan();
  };

  const undoLast = async () => {
    if (!last) return;
    setLast(null);
    await last.undo();
  };

  const amountOk = parseFloat(draft.amount) > 0;

  return (
    <BottomSheet open={open} onClose={onClose} title="Einkauf einräumen">
      {step === 'scan' ? (
        <div className="flex flex-col gap-4">
          {last && (
            <p className="flex items-center gap-2 text-[14px] text-text">
              <Check size={16} strokeWidth={2.6} className="shrink-0 text-accent" />
              <span className="min-w-0 flex-1 truncate">„{last.name}“ eingeräumt</span>
              <button
                type="button"
                onClick={undoLast}
                className="shrink-0 font-medium text-accent active:opacity-60"
              >
                Rückgängig
              </button>
            </p>
          )}
          {focusEntry && (
            <p className="text-[14px] text-muted">
              Für „{focusEntry.name}“: Barcode scannen – oder unten ohne Barcode eintragen.
            </p>
          )}
          {searching ? (
            <p className="py-16 text-center text-[14px] text-muted">Produkt wird gesucht…</p>
          ) : (
            <LazyBarcodeScanner key={round} onResult={onScan} />
          )}

          <div>
            {inCart.length > 0 ? (
              <>
                <p className="text-[13px] font-semibold text-muted">Noch im Wagen</p>
                <p className="mb-1 text-[12.5px] text-faint">Antippen, um ohne Barcode einzutragen.</p>
                <ul>
                  {inCart.map((entry) => (
                    <li key={entry.id} className="border-b border-border last:border-b-0">
                      <button
                        type="button"
                        onClick={() => startFromEntry(entry)}
                        className="flex min-h-[48px] w-full items-center gap-3 text-left active:bg-surface-2"
                      >
                        <span className="min-w-0 flex-1 truncate text-[15px] text-text">{entry.name}</span>
                        {entry.amount !== undefined && entry.unit && (
                          <span className="tnum shrink-0 text-[13px] text-faint">
                            {formatAmount(entry.amount, entry.unit)}
                          </span>
                        )}
                        <ChevronRight size={16} className="shrink-0 text-faint" />
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="text-[14px] text-accent">Alles aus dem Wagen ist eingeräumt.</p>
            )}
            <button
              type="button"
              onClick={startBlank}
              className="mt-2 flex min-h-[44px] items-center gap-2 text-[15px] font-medium text-accent active:opacity-60"
            >
              <Plus size={16} /> Anderer Artikel ohne Barcode
            </button>
          </div>

          <Button block variant={inCart.length > 0 ? 'secondary' : 'primary'} onClick={onClose}>
            Fertig
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {info && (
            <p className="rounded-xl bg-surface-2 px-3 py-2 text-[13px] text-muted">{info}</p>
          )}
          {existing && (
            <label className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface px-3.5 py-3">
              <span>
                <span className="block text-[14px] font-medium text-text">
                  Schon im Vorrat: {formatAmount(existing.amount, existing.unit)}
                </span>
                <span className="block text-[12px] text-faint">
                  {existing.unit === draft.unit
                    ? 'Neue Menge dazuzählen statt eigenem Eintrag'
                    : 'Andere Einheit – wird als eigener Eintrag gespeichert'}
                </span>
              </span>
              <input
                type="checkbox"
                checked={addUp && existing.unit === draft.unit}
                disabled={existing.unit !== draft.unit}
                onChange={(e) => setAddUp(e.target.checked)}
                className="h-6 w-6 shrink-0 accent-accent"
                aria-label="Zum vorhandenen Bestand dazuzählen"
              />
            </label>
          )}
          <Field label="Von der Einkaufsliste">
            <Select value={entryId} onChange={(e) => setEntryId(e.target.value)}>
              <option value="">Nicht auf der Liste</option>
              {candidates.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                  {s.checked ? '' : ' (noch offen)'}
                </option>
              ))}
            </Select>
          </Field>
          <InventoryFields draft={draft} setDraft={setDraft} layout="quick" />
          <Button
            block
            className="mt-1"
            disabled={saving || !draft.name.trim() || !amountOk}
            onClick={save}
          >
            Einräumen
          </Button>
          {!amountOk && (
            <p className="-mt-1 text-center text-[12.5px] text-faint">Bitte die Menge eintragen.</p>
          )}
          <Button variant="ghost" block onClick={backToScan}>
            Zurück zum Scanner
          </Button>
        </div>
      )}
    </BottomSheet>
  );
}

/** Name and the planned amount of a shopping entry as form values. */
function fromEntry(entry: ShoppingItem): Partial<Draft> {
  return {
    name: entry.name,
    amount: entry.amount !== undefined ? String(entry.amount) : '',
    unit: entry.unit ?? 'g',
    bestBefore: '',
  };
}

/** Same barcode, or else exactly the same name, already in stock. */
async function findExisting(barcode?: string, name?: string): Promise<InventoryItem | undefined> {
  if (barcode) {
    const hit = await db.inventory.where('barcode').equals(barcode).first();
    if (hit) return hit;
  }
  const key = name?.trim().toLowerCase();
  if (!key) return undefined;
  return (await db.inventory.toArray()).find((i) => i.name.trim().toLowerCase() === key);
}

/**
 * Which list entry a scanned product most likely is: "Fettarme H-Milch 1,5 %"
 * is the "Milch" on the list. Falls back to a shared word, so the brand-heavy
 * product names still find their plain entry.
 */
function bestEntry(name: string, entries: ShoppingItem[]): ShoppingItem | undefined {
  if (!name.trim()) return undefined;
  const direct = entries.find((e) => namesMatch(e.name, name));
  if (direct) return direct;
  const words = (s: string) => s.toLowerCase().split(/[^a-zäöüß]+/).filter((w) => w.length >= 4);
  const mine = words(name);
  return entries.find((e) =>
    words(e.name).some((w) => mine.some((m) => m.includes(w) || w.includes(m))),
  );
}

function earliest(a?: string, b?: string): string | undefined {
  if (!a) return b;
  if (!b) return a;
  return a < b ? a : b;
}
