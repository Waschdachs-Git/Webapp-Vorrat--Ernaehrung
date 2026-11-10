import type { Dispatch, ReactNode, SetStateAction } from 'react';
import { Field, Input, Select, SegmentedControl } from './ui';
import { classifyWithHints } from '@/db/database';
import { unitLabel, parseDecimal } from '@/lib/format';
import type { OffProduct } from '@/lib/openfoodfacts';
import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  classify,
  type FoodCategory,
} from '@/lib/categories';
import type {
  InventoryItem,
  Nutriments,
  StorageLocation,
  Unit,
} from '@/db/types';

/** Form state of an inventory item (strings, as typed). */
export interface Draft {
  name: string;
  brand: string;
  barcode?: string;
  location: StorageLocation;
  amount: string;
  unit: Unit;
  gramsPerPiece: string;
  category: FoodCategory;
  /** True once the user picked the category by hand. */
  categoryTouched: boolean;
  bestBefore: string;
  isStaple: boolean;
  minStock: string;
  nutriments: { kcal: string; protein: string; carbs: string; fat: string };
}

export const EMPTY_DRAFT: Draft = {
  name: '',
  brand: '',
  location: 'fridge',
  amount: '',
  unit: 'g',
  gramsPerPiece: '',
  category: 'other',
  categoryTouched: false,
  bestBefore: '',
  isStaple: false,
  minStock: '',
  nutriments: { kcal: '', protein: '', carbs: '', fat: '' },
};

const LOCATION_OPTIONS: { value: StorageLocation; label: string }[] = [
  { value: 'fridge', label: 'Kühlschrank' },
  { value: 'freezer', label: 'Gefrierer' },
  { value: 'pantry', label: 'Schrank' },
];

export function draftFromItem(item: InventoryItem): Draft {
  return {
    name: item.name,
    brand: item.brand ?? '',
    barcode: item.barcode,
    location: item.location,
    amount: String(item.amount),
    unit: item.unit,
    gramsPerPiece:
      item.gramsPerPiece !== undefined ? String(item.gramsPerPiece) : '',
    category: item.category ?? 'other',
    categoryTouched: item.category !== undefined,
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

/**
 * A scanned product as a draft: name, brand and nutrition from Open Food
 * Facts, the package size as amount and a storage place guessed from the
 * category – all still editable before anything is saved.
 */
export function draftFromProduct(p: OffProduct, barcode: string): Draft {
  const category = classify(p.name, p.categoryTags);
  return {
    ...EMPTY_DRAFT,
    name: p.name,
    brand: p.brand ?? '',
    barcode,
    category,
    location: guessLocation(p.name, category, p.categoryTags),
    amount: p.packageSize ? String(p.packageSize.amount) : '',
    unit: p.packageSize?.unit ?? 'g',
    nutriments: p.nutrimentsPer100
      ? {
          kcal: String(p.nutrimentsPer100.kcal),
          protein: String(p.nutrimentsPer100.protein),
          carbs: String(p.nutrimentsPer100.carbs),
          fat: String(p.nutrimentsPer100.fat),
        }
      : EMPTY_DRAFT.nutriments,
  };
}

/** Where a product usually goes – only a starting point for the form. */
export function guessLocation(
  name: string,
  category: FoodCategory,
  categoryTags: string[] = [],
): StorageLocation {
  if (categoryTags.some((t) => t.includes('frozen')) || /tiefkühl|\(tk\)|\btk\b/i.test(name)) {
    return 'freezer';
  }
  if (category === 'dairy' || category === 'meat') return 'fridge';
  if (category === 'vegetables') {
    return /zwiebel|kartoffel|knoblauch|kürbis/i.test(name) ? 'pantry' : 'fridge';
  }
  return 'pantry';
}

/** Draft -> stored fields. `addedAt` is kept when editing. */
export function itemFromDraft(draft: Draft, addedAt: string): Omit<InventoryItem, 'id'> {
  return {
    name: draft.name.trim(),
    brand: draft.brand.trim() || undefined,
    barcode: draft.barcode,
    location: draft.location,
    amount: parseDecimal(draft.amount),
    unit: draft.unit,
    gramsPerPiece:
      draft.unit === 'pcs' && draft.gramsPerPiece
        ? parseDecimal(draft.gramsPerPiece)
        : undefined,
    category: draft.category,
    nutrimentsPer100: parseNutriments(draft.nutriments),
    bestBefore: draft.bestBefore || undefined,
    isStaple: draft.isStaple,
    minStock: draft.isStaple && draft.minStock ? parseDecimal(draft.minStock) : undefined,
    addedAt,
  };
}

function parseNutriments(n: Draft['nutriments']): Nutriments | undefined {
  const hasAny = n.kcal || n.protein || n.carbs || n.fat;
  if (!hasAny) return undefined;
  return {
    kcal: parseDecimal(n.kcal),
    protein: parseDecimal(n.protein),
    carbs: parseDecimal(n.carbs),
    fat: parseDecimal(n.fat),
  };
}

/**
 * The fields of an inventory item. `quick` is for putting shopping away:
 * name, amount, best-before and place first, the rest folded away.
 */
export function InventoryFields({
  draft,
  setDraft,
  layout = 'full',
}: {
  draft: Draft;
  setDraft: Dispatch<SetStateAction<Draft>>;
  layout?: 'full' | 'quick';
}): ReactNode {
  const name = (
    <Field label="Name">
      <Input
        value={draft.name}
        onChange={(e) => setDraft({ ...draft, name: e.target.value })}
        onBlur={async () => {
          // Suggest a category once, unless the user already chose one.
          if (draft.categoryTouched || !draft.name.trim()) return;
          const guess = await classifyWithHints(draft.name);
          setDraft((d) => (d.categoryTouched ? d : { ...d, category: guess }));
        }}
        placeholder="z. B. Haferflocken"
      />
    </Field>
  );

  const category = (
    <Field label="Kategorie" hint="Wird automatisch erkannt – Korrekturen werden gemerkt.">
      <Select
        value={draft.category}
        onChange={(e) =>
          setDraft({
            ...draft,
            category: e.target.value as FoodCategory,
            categoryTouched: true,
          })
        }
      >
        {CATEGORY_ORDER.map((c) => (
          <option key={c} value={c}>
            {CATEGORY_LABELS[c]}
          </option>
        ))}
      </Select>
    </Field>
  );

  const brand = (
    <Field label="Marke (optional)">
      <Input value={draft.brand} onChange={(e) => setDraft({ ...draft, brand: e.target.value })} />
    </Field>
  );

  const location = (
    <Field label="Lagerort">
      <SegmentedControl
        value={draft.location}
        onChange={(loc) => setDraft({ ...draft, location: loc })}
        options={LOCATION_OPTIONS}
      />
    </Field>
  );

  const amount = (
    <>
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
      {draft.unit === 'pcs' && (
        <Field
          label="Gewicht pro Stück (g)"
          hint="Für die Nährwert-Berechnung beim Loggen. Kann später ergänzt werden."
        >
          <Input
            type="number"
            inputMode="decimal"
            value={draft.gramsPerPiece}
            onChange={(e) => setDraft({ ...draft, gramsPerPiece: e.target.value })}
            placeholder="z. B. 55 für ein Ei"
          />
        </Field>
      )}
    </>
  );

  const bestBefore = (
    <Field label="Mindesthaltbarkeit (optional)">
      <Input
        type="date"
        value={draft.bestBefore}
        onChange={(e) => setDraft({ ...draft, bestBefore: e.target.value })}
      />
    </Field>
  );

  const nutriments = (
    <details className="rounded-xl border border-border bg-surface px-3.5 py-2.5">
      <summary className="cursor-pointer text-[14px] font-medium text-muted">
        Nährwerte pro 100 {draft.unit === 'pcs' ? 'g' : draft.unit}
      </summary>
      <div className="mt-3 grid grid-cols-2 gap-3">
        {(['kcal', 'protein', 'carbs', 'fat'] as const).map((k) => (
          <Field
            key={k}
            label={k === 'kcal' ? 'kcal' : k === 'protein' ? 'Protein (g)' : k === 'carbs' ? 'Kohlenhydrate (g)' : 'Fett (g)'}
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
  );

  const staple = (
    <>
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
        <Field label={`Mindestbestand (${unitLabel(draft.unit)})`}>
          <Input
            type="number"
            inputMode="decimal"
            value={draft.minStock}
            onChange={(e) => setDraft({ ...draft, minStock: e.target.value })}
          />
        </Field>
      )}
    </>
  );

  if (layout === 'quick') {
    return (
      <>
        {name}
        {amount}
        {bestBefore}
        {location}
        <details className="rounded-xl border border-border bg-surface px-3.5 py-2.5">
          <summary className="cursor-pointer text-[14px] font-medium text-muted">
            Weitere Angaben
            <span className="font-normal text-faint"> · Kategorie, Marke, Nährwerte</span>
          </summary>
          <div className="mt-3 flex flex-col gap-3">
            {category}
            {brand}
            {nutriments}
            {staple}
          </div>
        </details>
      </>
    );
  }

  return (
    <>
      {name}
      {category}
      {brand}
      {location}
      {amount}
      {bestBefore}
      {nutriments}
      {staple}
    </>
  );
}
