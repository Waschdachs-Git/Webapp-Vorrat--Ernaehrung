import { type ReactNode, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { db, rememberCategory } from '@/db/database';
import { BottomSheet } from './BottomSheet';
import { LazyBarcodeScanner } from './LazyBarcodeScanner';
import { Button, SegmentedControl } from './ui';
import { useUndo } from './UndoToast';
import {
  type Draft,
  EMPTY_DRAFT,
  InventoryFields,
  draftFromItem,
  draftFromProduct,
  itemFromDraft,
} from './InventoryForm';
import { lookupBarcode } from '@/lib/openfoodfacts';
import { runAutoRestock } from '@/lib/actions';
import { nowISO } from '@/lib/date';
import { formatAmount } from '@/lib/format';
import { findByBarcode, storePurchase } from '@/lib/stock';
import type { InventoryItem } from '@/db/types';

type Step = 'scan' | 'form';

export function AddInventorySheet({
  open,
  onClose,
  onSaved,
  editItem,
}: {
  open: boolean;
  onClose: () => void;
  /** Called only after the item was actually written to the inventory. */
  onSaved?: () => void;
  editItem?: InventoryItem;
}): ReactNode {
  const [step, setStep] = useState<Step>(editItem ? 'form' : 'scan');
  const [scanInfo, setScanInfo] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(() =>
    editItem ? draftFromItem(editItem) : EMPTY_DRAFT,
  );
  // A scanned product that is already in stock: the new package is added to
  // it instead of creating a second entry (switchable).
  const [existing, setExisting] = useState<InventoryItem | null>(null);
  const [addUp, setAddUp] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const showUndo = useUndo();

  const close = () => {
    setStep(editItem ? 'form' : 'scan');
    setDraft(editItem ? draftFromItem(editItem) : EMPTY_DRAFT);
    setScanInfo(null);
    setExisting(null);
    setError(null);
    onClose();
  };

  const handleScan = async (code: string) => {
    setScanInfo('Produkt wird gesucht…');
    const [res, known] = await Promise.all([lookupBarcode(code), findByBarcode(code)]);
    const product = res.status === 'found' ? res.product : undefined;
    setExisting(known ?? null);
    setAddUp(true);

    if (known) {
      // Bought before: keep the name, place and settings given back then;
      // the package size and the new best-before are what is new.
      const next: Draft = { ...draftFromItem(known), amount: '', bestBefore: '' };
      if (product?.packageSize?.unit === known.unit) {
        next.amount = String(product.packageSize.amount);
      }
      setDraft(next);
      setScanInfo('Schon im Vorrat – Menge und Mindesthaltbarkeit der neuen Packung prüfen.');
    } else if (product) {
      setDraft(draftFromProduct(product, code));
      // Replace the "searching" notice instead of leaving it standing.
      setScanInfo(
        product.nutrimentsPer100
          ? 'Daten von Open Food Facts übernommen.'
          : 'Produkt gefunden, aber ohne Nährwerte – bitte ergänzen.',
      );
    } else {
      // Not found or error -> manual fallback, prefill barcode.
      setDraft({ ...EMPTY_DRAFT, barcode: code });
      setScanInfo(
        res.status === 'not-found'
          ? 'Produkt nicht gefunden – bitte manuell ergänzen.'
          : 'Abruf fehlgeschlagen – bitte manuell ergänzen.',
      );
    }
    setStep('form');
  };

  const mergeId =
    !editItem && existing && addUp && existing.unit === draft.unit ? existing.id : undefined;

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const payload = itemFromDraft(draft, editItem?.addedAt ?? nowISO());
      const undo = await db.transaction('rw', db.inventory, db.shoppingList, async () => {
        let revert: (() => Promise<unknown>) | undefined;
        if (editItem?.id !== undefined) {
          await db.inventory.update(editItem.id, payload);
        } else {
          revert = await storePurchase(payload, mergeId);
        }
        await runAutoRestock();
        return revert;
      });
      // A hand-picked category teaches the classifier for next time.
      if (draft.categoryTouched) {
        await rememberCategory(payload.name, draft.category);
      }
      if (mergeId !== undefined && existing && undo) {
        // Adding to stock changes an item the user did not open – say so.
        showUndo(
          `Zu „${existing.name}“ dazugezählt: jetzt ${formatAmount(
            Math.round((existing.amount + payload.amount) * 10) / 10,
            existing.unit,
          )}`,
          async () => {
            await undo();
            await runAutoRestock();
          },
        );
      }
      onSaved?.();
      close();
    } catch (err) {
      console.error('Artikel speichern fehlgeschlagen:', err);
      setError('Konnte nicht gespeichert werden. Bitte noch einmal versuchen.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (editItem?.id === undefined) return;
    const removed = editItem;
    try {
      await db.inventory.delete(removed.id!);
      close();
      // Re-adding with the original id keeps diary references intact.
      showUndo(`„${removed.name}“ gelöscht`, async () => {
        await db.inventory.put(removed);
      });
    } catch (err) {
      console.error('Artikel löschen fehlgeschlagen:', err);
      setError('Konnte nicht gelöscht werden. Bitte noch einmal versuchen.');
    }
  };

  return (
    <BottomSheet
      open={open}
      onClose={close}
      title={editItem ? 'Artikel bearbeiten' : 'Artikel hinzufügen'}
    >
      {!editItem && (
        // Scanning and typing are equal ways in – not "scan, or find the
        // small link underneath".
        <div className="mb-4">
          <SegmentedControl
            value={step}
            onChange={(next) => {
              if (next === 'form') setExisting(null);
              setStep(next);
            }}
            options={[
              { value: 'scan', label: 'Barcode' },
              { value: 'form', label: 'Manuell' },
            ]}
          />
        </div>
      )}
      {step === 'scan' && !editItem ? (
        <LazyBarcodeScanner onResult={handleScan} />
      ) : (
        <div className="flex flex-col gap-3">
          {scanInfo && (
            <p className="rounded-xl bg-surface-2 px-3 py-2 text-[13px] text-muted">
              {scanInfo}
            </p>
          )}
          {!editItem && existing && (
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
          <InventoryFields draft={draft} setDraft={setDraft} />

          {error && (
            <p role="alert" className="text-[13.5px] text-danger">
              {error}
            </p>
          )}

          <Button
            block
            className="mt-1"
            disabled={saving || !draft.name.trim()}
            onClick={save}
          >
            {editItem ? 'Speichern' : mergeId !== undefined ? 'Dazuzählen' : 'Hinzufügen'}
          </Button>
          {editItem?.id !== undefined && (
            // Swiping a row left deletes too – but nobody finds that alone.
            <Button variant="danger" block onClick={remove} disabled={saving}>
              <Trash2 size={16} /> Artikel löschen
            </Button>
          )}
        </div>
      )}
    </BottomSheet>
  );
}
