import { type ReactNode, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Search, Package, Apple, Pencil, ScanLine } from 'lucide-react';
import { db } from '@/db/database';
import { BottomSheet } from './BottomSheet';
import { LazyBarcodeScanner } from './LazyBarcodeScanner';
import {
  Button,
  Field,
  Input,
  SegmentedControl,
  cx,
} from './ui';
import { scaleNutriments } from '@/lib/nutrition';
import { lookupBarcode } from '@/lib/openfoodfacts';
import { diaryItemFromPer100, logFood } from '@/lib/actions';
import type { MealType, Nutriments, Unit } from '@/db/types';
import { formatAmount, unitLabel } from '@/lib/format';

type Source = 'inventory' | 'foods' | 'free' | 'scan';

interface Picked {
  name: string;
  unit: Unit;
  per100: Nutriments;
  sourceType: 'inventory' | 'custom' | 'barcode';
  refId?: number;
  /** Known weight of one piece (unit 'pcs' only). */
  gramsPerPiece?: number;
}

/** Fallback weight per piece when the item has none stored yet. */
const DEFAULT_GRAMS_PER_PIECE = 100;

const MEAL_OPTIONS: { value: MealType; label: string }[] = [
  { value: 'breakfast', label: 'Frühstück' },
  { value: 'lunch', label: 'Mittag' },
  { value: 'dinner', label: 'Abend' },
  { value: 'snack', label: 'Snack' },
];

export function LogFoodSheet({
  open,
  onClose,
  defaultMeal,
}: {
  open: boolean;
  onClose: () => void;
  defaultMeal: MealType;
}): ReactNode {
  const [meal, setMeal] = useState<MealType>(defaultMeal);
  const [source, setSource] = useState<Source>('inventory');
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<Picked | null>(null);

  const inventory = useLiveQuery(() => db.inventory.toArray(), []);
  const foods = useLiveQuery(() => db.foodsLocal.toArray(), []);

  const reset = () => {
    setPicked(null);
    setQuery('');
    setSource('inventory');
    setMeal(defaultMeal);
  };

  const close = () => {
    reset();
    onClose();
  };

  const inventoryWithNutrition = useMemo(
    () =>
      (inventory ?? []).filter(
        (i) => i.nutrimentsPer100 && i.amount > 0 && match(i.name, query),
      ),
    [inventory, query],
  );
  const filteredFoods = useMemo(
    () => (foods ?? []).filter((f) => match(f.name, query)),
    [foods, query],
  );

  if (picked) {
    return (
      <BottomSheet open={open} onClose={close} title={picked.name}>
        <PortionStep
          picked={picked}
          meal={meal}
          setMeal={setMeal}
          onBack={() => setPicked(null)}
          onDone={close}
        />
      </BottomSheet>
    );
  }

  return (
    <BottomSheet open={open} onClose={close} title="Essen loggen">
      <div className="flex flex-col gap-4">
        <SegmentedControl
          value={meal}
          onChange={setMeal}
          options={MEAL_OPTIONS}
        />

        <div className="flex gap-1 rounded-xl bg-surface-2 p-1">
          <SourceTab icon={<Package size={16} />} label="Vorrat" active={source === 'inventory'} onClick={() => setSource('inventory')} />
          <SourceTab icon={<Apple size={16} />} label="Standard" active={source === 'foods'} onClick={() => setSource('foods')} />
          <SourceTab icon={<ScanLine size={16} />} label="Scan" active={source === 'scan'} onClick={() => setSource('scan')} />
          <SourceTab icon={<Pencil size={16} />} label="Frei" active={source === 'free'} onClick={() => setSource('free')} />
        </div>

        {source === 'scan' ? (
          <ScanPick onPicked={setPicked} onManual={() => setSource('free')} />
        ) : source === 'free' ? (
          <FreePick onPicked={setPicked} />
        ) : (
          <>
            <div className="relative">
              <Search
                size={18}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint"
              />
              <Input
                placeholder="Suchen…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex max-h-[44vh] flex-col gap-1 overflow-y-auto">
              {source === 'inventory'
                ? inventoryWithNutrition.map((i) => (
                    <PickRow
                      key={i.id}
                      title={i.name}
                      sub={`${formatAmount(i.amount, i.unit)} im Vorrat${i.brand ? ` · ${i.brand}` : ''}`}
                      onClick={() =>
                        setPicked({
                          name: i.name,
                          unit: i.unit,
                          per100: i.nutrimentsPer100!,
                          sourceType: 'inventory',
                          refId: i.id,
                          gramsPerPiece: i.gramsPerPiece,
                        })
                      }
                    />
                  ))
                : filteredFoods.map((f) => (
                    <PickRow
                      key={f.id}
                      title={f.name}
                      sub={`${Math.round(f.kcal)} kcal / 100 ${f.defaultUnit}`}
                      onClick={() =>
                        setPicked({
                          name: f.name,
                          unit: f.defaultUnit,
                          per100: {
                            kcal: f.kcal,
                            protein: f.protein,
                            carbs: f.carbs,
                            fat: f.fat,
                          },
                          sourceType: 'custom',
                        })
                      }
                    />
                  ))}
              {source === 'inventory' && inventoryWithNutrition.length === 0 && (
                <p className="px-1 py-6 text-center text-[13px] text-faint">
                  Keine Vorratsartikel mit Nährwerten. Über „Standard“ oder „Frei“ loggen.
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </BottomSheet>
  );
}

function SourceTab({
  icon,
  label,
  active,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}): ReactNode {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        'flex flex-1 items-center justify-center gap-1.5 rounded-lg px-1 py-2 text-[12px] font-medium transition-colors',
        active ? 'bg-surface text-text shadow-card' : 'text-muted',
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function PickRow({
  title,
  sub,
  onClick,
}: {
  title: string;
  sub: string;
  onClick: () => void;
}): ReactNode {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left active:bg-surface-2"
    >
      <div className="min-w-0">
        <p className="truncate text-[15px] font-medium text-text">{title}</p>
        <p className="truncate text-[12px] text-faint">{sub}</p>
      </div>
    </button>
  );
}

function PortionStep({
  picked,
  meal,
  setMeal,
  onBack,
  onDone,
}: {
  picked: Picked;
  meal: MealType;
  setMeal: (m: MealType) => void;
  onBack: () => void;
  onDone: () => void;
}): ReactNode {
  const isPcs = picked.unit === 'pcs';
  const presets = isPcs ? [1, 2, 3] : [50, 100, 150, 200];
  const [amount, setAmount] = useState<number>(isPcs ? 1 : 100);
  const [gramsPerPiece, setGramsPerPiece] = useState<number>(
    picked.gramsPerPiece ?? DEFAULT_GRAMS_PER_PIECE,
  );
  const [saving, setSaving] = useState(false);

  // Nutriments are per 100 g, so pieces have to be converted to grams first.
  const nutritionGrams = isPcs ? amount * gramsPerPiece : amount;
  const scaled = scaleNutriments(picked.per100, nutritionGrams);

  const save = async () => {
    setSaving(true);
    // Remember the weight per piece on the item so it is pre-filled next time.
    if (isPcs && picked.sourceType === 'inventory' && picked.refId !== undefined) {
      if (gramsPerPiece !== picked.gramsPerPiece) {
        await db.inventory.update(picked.refId, { gramsPerPiece });
      }
    }
    await logFood({
      mealType: meal,
      item: diaryItemFromPer100({
        name: picked.name,
        amount, // in the item's own unit -> what gets subtracted from stock
        unit: picked.unit,
        per100: picked.per100,
        sourceType: picked.sourceType,
        refId: picked.refId,
        nutritionAmount: nutritionGrams,
      }),
    });
    onDone();
  };

  return (
    <div className="flex flex-col gap-4">
      <SegmentedControl value={meal} onChange={setMeal} options={MEAL_OPTIONS} />

      <Field label={`Menge (${unitLabel(picked.unit)})`}>
        <Input
          type="number"
          inputMode="decimal"
          value={amount || ''}
          onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
          autoFocus
        />
      </Field>
      <div className="flex flex-wrap gap-2">
        {presets.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setAmount(p)}
            className={cx(
              'rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors',
              amount === p
                ? 'bg-accent text-white'
                : 'bg-surface-2 text-muted',
            )}
          >
            {formatAmount(p, picked.unit)}
          </button>
        ))}
      </div>

      {isPcs && (
        <Field
          label="Gewicht pro Stück (g)"
          hint="Nährwerte gelten pro 100 g – daher wird das Stückgewicht gebraucht."
        >
          <Input
            type="number"
            inputMode="decimal"
            value={gramsPerPiece || ''}
            onChange={(e) => setGramsPerPiece(parseFloat(e.target.value) || 0)}
          />
        </Field>
      )}

      <div className="grid grid-cols-4 gap-2 rounded-2xl bg-surface-2 p-3 text-center">
        <Stat label="kcal" value={Math.round(scaled.kcal)} />
        <Stat label="Protein" value={`${scaled.protein} g`} />
        <Stat label="Carbs" value={`${scaled.carbs} g`} />
        <Stat label="Fett" value={`${scaled.fat} g`} />
      </div>

      {picked.sourceType === 'inventory' && (
        <p className="text-[12px] text-faint">
          Wird gebucht und vom Vorrat abgezogen
          {isPcs ? ` (entspricht ${Math.round(nutritionGrams)} g).` : '.'}
        </p>
      )}

      <div className="flex gap-2">
        <Button variant="secondary" onClick={onBack}>
          Zurück
        </Button>
        <Button
          block
          onClick={save}
          disabled={saving || amount <= 0 || (isPcs && gramsPerPiece <= 0)}
        >
          Loggen
        </Button>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: ReactNode }): ReactNode {
  return (
    <div>
      <p className="tnum text-[16px] font-semibold text-text">{value}</p>
      <p className="text-[11px] text-faint">{label}</p>
    </div>
  );
}

function FreePick({ onPicked }: { onPicked: (p: Picked) => void }): ReactNode {
  const [name, setName] = useState('');
  const [per100, setPer100] = useState({ kcal: '', protein: '', carbs: '', fat: '' });

  const ready = name.trim() && per100.kcal !== '';
  return (
    <div className="flex flex-col gap-3">
      <Field label="Bezeichnung">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="z. B. Restaurant-Bowl" />
      </Field>
      <p className="text-[12px] text-faint">Nährwerte pro 100 g/ml</p>
      <div className="grid grid-cols-2 gap-3">
        {(['kcal', 'protein', 'carbs', 'fat'] as const).map((k) => (
          <Field key={k} label={k === 'kcal' ? 'kcal' : k === 'protein' ? 'Protein (g)' : k === 'carbs' ? 'Carbs (g)' : 'Fett (g)'}>
            <Input
              type="number"
              inputMode="decimal"
              value={per100[k]}
              onChange={(e) => setPer100({ ...per100, [k]: e.target.value })}
            />
          </Field>
        ))}
      </div>
      <Button
        block
        disabled={!ready}
        onClick={() =>
          onPicked({
            name: name.trim(),
            unit: 'g',
            per100: {
              kcal: parseFloat(per100.kcal) || 0,
              protein: parseFloat(per100.protein) || 0,
              carbs: parseFloat(per100.carbs) || 0,
              fat: parseFloat(per100.fat) || 0,
            },
            sourceType: 'custom',
          })
        }
      >
        Weiter
      </Button>
    </div>
  );
}

function ScanPick({
  onPicked,
  onManual,
}: {
  onPicked: (p: Picked) => void;
  onManual: () => void;
}): ReactNode {
  const [status, setStatus] = useState<'scan' | 'loading' | 'notfound'>('scan');

  const handle = async (code: string) => {
    setStatus('loading');
    const res = await lookupBarcode(code);
    if (res.status === 'found' && res.product.nutrimentsPer100) {
      onPicked({
        name: res.product.name,
        unit: 'g',
        per100: res.product.nutrimentsPer100,
        sourceType: 'barcode',
      });
    } else {
      setStatus('notfound');
    }
  };

  if (status === 'loading') {
    return <p className="py-8 text-center text-[14px] text-muted">Produkt wird geladen…</p>;
  }
  if (status === 'notfound') {
    return (
      <div className="py-6 text-center">
        <p className="text-[14px] text-muted">
          Kein Produkt mit Nährwerten gefunden.
        </p>
        <div className="mt-3 flex justify-center gap-2">
          <Button variant="secondary" onClick={() => setStatus('scan')}>
            Nochmal versuchen
          </Button>
          <Button variant="secondary" onClick={onManual}>
            Frei eingeben
          </Button>
        </div>
      </div>
    );
  }
  return <LazyBarcodeScanner onResult={handle} onManual={onManual} />;
}

function match(name: string, query: string): boolean {
  return name.toLowerCase().includes(query.trim().toLowerCase());
}
