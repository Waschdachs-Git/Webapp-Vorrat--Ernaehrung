import { type ReactNode, useState } from 'react';
import { db, rememberCategory } from '@/db/database';
import { BottomSheet } from './BottomSheet';
import { LazyBarcodeScanner } from './LazyBarcodeScanner';
import { Button, SegmentedControl } from './ui';
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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setStep(editItem ? 'form' : 'scan');
    setDraft(editItem ? draftFromItem(editItem) : EMPTY_DRAFT);
    setScanInfo(null);
    setError(null);
    onClose();
  };

  const handleScan = async (code: string) => {
    setScanInfo('Produkt wird gesucht…');
    const res = await lookupBarcode(code);
    if (res.status === 'found') {
      const p = res.product;
      setDraft(draftFromProduct(p, code));
      // Replace the "searching" notice instead of leaving it standing.
      setScanInfo(
        p.nutrimentsPer100
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

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const payload = itemFromDraft(draft, editItem?.addedAt ?? nowISO());
      await db.transaction('rw', db.inventory, db.shoppingList, async () => {
        if (editItem?.id !== undefined) {
          await db.inventory.update(editItem.id, payload);
        } else {
          await db.inventory.add(payload as InventoryItem);
        }
        await runAutoRestock();
      });
      // A hand-picked category teaches the classifier for next time.
      if (draft.categoryTouched) {
        await rememberCategory(payload.name, draft.category);
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
            onChange={setStep}
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
            {editItem ? 'Speichern' : 'Hinzufügen'}
          </Button>
        </div>
      )}
    </BottomSheet>
  );
}
