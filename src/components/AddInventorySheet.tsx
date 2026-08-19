import { type ReactNode, useState } from 'react';
import { db } from '@/db/database';
import { BottomSheet } from './BottomSheet';
import { BarcodeScanner } from './BarcodeScanner';
import { Button, Field, Input, Select, SegmentedControl } from './ui';
import { lookupBarcode } from '@/lib/openfoodfacts';
import { runAutoRestock } from '@/lib/actions';
import { nowISO } from '@/lib/date';
import type {
  InventoryItem,
  Nutriments,
  StorageLocation,
  Unit,
} from '@/db/types';

type Step = 'scan' | 'form';

const LOCATION_OPTIONS: { value: StorageLocation; label: string }[] = [
  { value: 'fridge', label: 'Kühlschrank' },
  { value: 'freezer', label: 'Gefrierer' },
  { value: 'pantry', label: 'Vorrat' },
];

interface Draft {
  name: string;
  brand: string;
  barcode?: string;
  location: StorageLocation;
  amount: string;
  unit: Unit;
  bestBefore: string;
  isStaple: boolean;
  minStock: string;
  nutriments: { kcal: string; protein: string; carbs: string; fat: string };
}

const EMPTY_DRAFT: Draft = {
  name: '',
  brand: '',
  location: 'fridge',
  amount: '',
  unit: 'g',
  bestBefore: '',
  isStaple: false,
  minStock: '',
  nutriments: { kcal: '', protein: '', carbs: '', fat: '' },
};

export function AddInventorySheet({
  open,
  onClose,
  onSaved,
  editItem,
  prefillName,
}: {
  open: boolean;
  onClose: () => void;
  /** Called only after the item was actually written to the inventory. */
  onSaved?: () => void;
  editItem?: InventoryItem;
  prefillName?: string;
}): ReactNode {
  const [step, setStep] = useState<Step>(
    editItem || prefillName ? 'form' : 'scan',
  );
  const [scanInfo, setScanInfo] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(() =>
    editItem
      ? draftFromItem(editItem)
      : { ...EMPTY_DRAFT, name: prefillName ?? '' },
  );
  const [saving, setSaving] = useState(false);

  const close = () => {
    setStep(editItem ? 'form' : 'scan');
    setDraft(editItem ? draftFromItem(editItem) : EMPTY_DRAFT);
    setScanInfo(null);
    onClose();
  };

  const handleScan = async (code: string) => {
    setScanInfo('Produkt wird gesucht…');
    const res = await lookupBarcode(code);
    if (res.status === 'found') {
      const p = res.product;
      setDraft({
        ...EMPTY_DRAFT,
        name: p.name,
        brand: p.brand ?? '',
        barcode: code,
        nutriments: p.nutrimentsPer100
          ? {
              kcal: String(p.nutrimentsPer100.kcal),
              protein: String(p.nutrimentsPer100.protein),
              carbs: String(p.nutrimentsPer100.carbs),
              fat: String(p.nutrimentsPer100.fat),
            }
          : EMPTY_DRAFT.nutriments,
      });
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
    const nutriments = parseNutriments(draft.nutriments);
    const payload: Omit<InventoryItem, 'id'> = {
      name: draft.name.trim(),
      brand: draft.brand.trim() || undefined,
      barcode: draft.barcode,
      location: draft.location,
      amount: parseFloat(draft.amount) || 0,
      unit: draft.unit,
      nutrimentsPer100: nutriments,
      bestBefore: draft.bestBefore || undefined,
      isStaple: draft.isStaple,
      minStock: draft.isStaple && draft.minStock ? parseFloat(draft.minStock) : undefined,
      addedAt: editItem?.addedAt ?? nowISO(),
    };
    if (editItem?.id !== undefined) {
      await db.inventory.update(editItem.id, payload);
    } else {
      await db.inventory.add(payload as InventoryItem);
    }
    await runAutoRestock();
    setSaving(false);
    onSaved?.();
    close();
  };

  return (
    <BottomSheet
      open={open}
      onClose={close}
      title={editItem ? 'Artikel bearbeiten' : step === 'scan' ? 'Barcode scannen' : 'Artikel hinzufügen'}
    >
      {step === 'scan' && !editItem ? (
        <BarcodeScanner onResult={handleScan} onManual={() => setStep('form')} />
      ) : (
        <div className="flex flex-col gap-3">
          {scanInfo && (
            <p className="rounded-xl bg-surface-2 px-3 py-2 text-[13px] text-muted">
              {scanInfo}
            </p>
          )}
          <Field label="Name">
            <Input
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder="z. B. Haferflocken"
            />
          </Field>
          <Field label="Marke (optional)">
            <Input
              value={draft.brand}
              onChange={(e) => setDraft({ ...draft, brand: e.target.value })}
            />
          </Field>

          <Field label="Lagerort">
            <SegmentedControl
              value={draft.location}
              onChange={(location) => setDraft({ ...draft, location })}
              options={LOCATION_OPTIONS}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Menge">
              <Input
                type="number"
                inputMode="decimal"
                value={draft.amount}
                onChange={(e) => setDraft({ ...draft, amount: e.target.value })}
              />
            </Field>
            <Field label="Einheit">
              <Select
                value={draft.unit}
                onChange={(e) => setDraft({ ...draft, unit: e.target.value as Unit })}
              >
                <option value="g">Gramm (g)</option>
                <option value="ml">Milliliter (ml)</option>
                <option value="pcs">Stück</option>
              </Select>
            </Field>
          </div>

          <Field label="Mindesthaltbarkeit (optional)">
            <Input
              type="date"
              value={draft.bestBefore}
              onChange={(e) => setDraft({ ...draft, bestBefore: e.target.value })}
            />
          </Field>

          <details className="rounded-xl border border-border bg-surface px-3.5 py-2.5">
            <summary className="cursor-pointer text-[14px] font-medium text-muted">
              Nährwerte pro 100 {draft.unit === 'pcs' ? 'g' : draft.unit}
            </summary>
            <div className="mt-3 grid grid-cols-2 gap-3">
              {(['kcal', 'protein', 'carbs', 'fat'] as const).map((k) => (
                <Field
                  key={k}
                  label={k === 'kcal' ? 'kcal' : k === 'protein' ? 'Protein (g)' : k === 'carbs' ? 'Carbs (g)' : 'Fett (g)'}
                >
                  <Input
                    type="number"
                    inputMode="decimal"
                    value={draft.nutriments[k]}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        nutriments: { ...draft.nutriments, [k]: e.target.value },
                      })
                    }
                  />
                </Field>
              ))}
            </div>
          </details>

          <label className="flex items-center justify-between rounded-xl border border-border bg-surface px-3.5 py-3">
            <div>
              <p className="text-[14px] font-medium text-text">Grundnahrungsmittel</p>
              <p className="text-[12px] text-faint">Auto-Nachkauf bei niedrigem Bestand</p>
            </div>
            <input
              type="checkbox"
              checked={draft.isStaple}
              onChange={(e) => setDraft({ ...draft, isStaple: e.target.checked })}
              className="h-6 w-6 accent-accent"
            />
          </label>

          {draft.isStaple && (
            <Field label={`Mindestbestand (${draft.unit})`}>
              <Input
                type="number"
                inputMode="decimal"
                value={draft.minStock}
                onChange={(e) => setDraft({ ...draft, minStock: e.target.value })}
              />
            </Field>
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

function draftFromItem(item: InventoryItem): Draft {
  return {
    name: item.name,
    brand: item.brand ?? '',
    barcode: item.barcode,
    location: item.location,
    amount: String(item.amount),
    unit: item.unit,
    bestBefore: item.bestBefore ?? '',
    isStaple: item.isStaple,
    minStock: item.minStock !== undefined ? String(item.minStock) : '',
    nutriments: {
      kcal: item.nutrimentsPer100 ? String(item.nutrimentsPer100.kcal) : '',
      protein: item.nutrimentsPer100 ? String(item.nutrimentsPer100.protein) : '',
      carbs: item.nutrimentsPer100 ? String(item.nutrimentsPer100.carbs) : '',
      fat: item.nutrimentsPer100 ? String(item.nutrimentsPer100.fat) : '',
    },
  };
}

function parseNutriments(n: Draft['nutriments']): Nutriments | undefined {
  const hasAny = n.kcal || n.protein || n.carbs || n.fat;
  if (!hasAny) return undefined;
  return {
    kcal: parseFloat(n.kcal) || 0,
    protein: parseFloat(n.protein) || 0,
    carbs: parseFloat(n.carbs) || 0,
    fat: parseFloat(n.fat) || 0,
  };
}
