import { CATEGORY_ORDER, type FoodCategory } from '@/lib/categories';
import type { TableDump } from './transfer';
import type {
  ActivityLevel,
  DiarySourceType,
  Goal,
  MealType,
  Nutriments,
  Sex,
  ShoppingSource,
  StorageLocation,
  ThemeMode,
  Unit,
} from './types';

/**
 * Cleans the tables of a backup file before they are written.
 *
 * An import replaces everything and – with sync on – spreads to every
 * device, so a file that was edited by hand or damaged must not be able to
 * put rows into the database that the app then chokes on. Every row is
 * rebuilt field by field: unknown fields are dropped, optional ones that do
 * not fit are left out, and a row missing something essential is skipped
 * (and counted, so the user can be told).
 *
 * Ids are passed through untouched; they are only used to re-link rows and
 * never stored (see writeDump).
 */

const SEXES: readonly Sex[] = ['m', 'w', 'd'];
const ACTIVITY: readonly ActivityLevel[] = ['sedentary', 'light', 'moderate', 'very', 'extra'];
const GOALS: readonly Goal[] = ['lose', 'maintain', 'gain'];
const LOCATIONS: readonly StorageLocation[] = ['fridge', 'freezer', 'pantry'];
const UNITS: readonly Unit[] = ['g', 'ml', 'pcs'];
const MEALS: readonly MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];
const THEMES: readonly ThemeMode[] = ['system', 'light', 'dark'];
const SOURCES: readonly ShoppingSource[] = ['manual', 'auto-restock', 'recipe'];
const DIARY_SOURCES: readonly DiarySourceType[] = ['inventory', 'recipe', 'custom', 'barcode'];
const CATEGORIES: readonly FoodCategory[] = CATEGORY_ORDER;

type Row = Record<string, unknown>;

export function isRow(v: unknown): v is Row {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function str(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const t = v.trim();
  return t ? t : undefined;
}

function num(v: unknown): number | undefined {
  const n =
    typeof v === 'number'
      ? v
      : typeof v === 'string' && v.trim() !== ''
        ? Number(v.trim().replace(',', '.'))
        : NaN;
  return Number.isFinite(n) ? n : undefined;
}

function positive(v: unknown): number | undefined {
  const n = num(v);
  return n !== undefined && n > 0 ? n : undefined;
}

function nonNegative(v: unknown): number | undefined {
  const n = num(v);
  return n !== undefined && n >= 0 ? n : undefined;
}

function oneOf<T extends string>(v: unknown, allowed: readonly T[]): T | undefined {
  return typeof v === 'string' && (allowed as readonly string[]).includes(v)
    ? (v as T)
    : undefined;
}

/** A real calendar date in the form YYYY-MM-DD. */
function isoDate(v: unknown): string | undefined {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return undefined;
  const d = new Date(`${v}T00:00:00`);
  if (Number.isNaN(d.getTime())) return undefined;
  // Rejects things like 2026-02-31, which Date would roll over.
  const [y, m, day] = v.split('-').map(Number);
  return d.getFullYear() === y && d.getMonth() + 1 === m && d.getDate() === day
    ? v
    : undefined;
}

function isoDateTime(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

function strList(v: unknown): string[] {
  return Array.isArray(v) ? v.map(str).filter((s): s is string => s !== undefined) : [];
}

function nutriments(v: unknown): Nutriments | undefined {
  if (!isRow(v)) return undefined;
  const kcal = nonNegative(v.kcal);
  if (kcal === undefined) return undefined;
  return {
    kcal,
    protein: nonNegative(v.protein) ?? 0,
    carbs: nonNegative(v.carbs) ?? 0,
    fat: nonNegative(v.fat) ?? 0,
  };
}

/** Keep only the keys whose value is defined. */
function compact<T extends Row>(row: T): T {
  for (const key of Object.keys(row)) {
    if (row[key] === undefined) delete row[key];
  }
  return row;
}

function profile(r: Row): Row | null {
  const sex = oneOf(r.sex, SEXES);
  const birthdate = isoDate(r.birthdate);
  const heightCm = positive(r.heightCm);
  const weightKg = positive(r.weightKg);
  if (!sex || !birthdate || !heightCm || !weightKg) return null;

  let customTargets: Row | undefined;
  if (isRow(r.customTargets)) {
    customTargets = compact({
      kcal: positive(r.customTargets.kcal),
      protein: nonNegative(r.customTargets.protein),
      carbs: nonNegative(r.customTargets.carbs),
      fat: nonNegative(r.customTargets.fat),
    });
    if (Object.keys(customTargets).length === 0) customTargets = undefined;
  }

  return compact({
    id: r.id,
    name: str(r.name) ?? 'Ich',
    sex,
    birthdate,
    heightCm,
    weightKg,
    activityLevel: oneOf(r.activityLevel, ACTIVITY) ?? 'moderate',
    goal: oneOf(r.goal, GOALS) ?? 'maintain',
    targetRateKgPerWeek: nonNegative(r.targetRateKgPerWeek) ?? 0.5,
    allergies: strList(r.allergies),
    dietPrefs: strList(r.dietPrefs),
    customTargets,
  });
}

function weight(r: Row): Row | null {
  const date = isoDate(r.date);
  const weightKg = positive(r.weightKg);
  return date && weightKg ? { id: r.id, date, weightKg } : null;
}

function inventoryItem(r: Row, now: string): Row | null {
  const name = str(r.name);
  if (!name) return null;
  const isStaple = r.isStaple === true;
  return compact({
    id: r.id,
    name,
    brand: str(r.brand),
    barcode: typeof r.barcode === 'number' ? String(r.barcode) : str(r.barcode),
    category: oneOf(r.category, CATEGORIES),
    location: oneOf(r.location, LOCATIONS) ?? 'pantry',
    amount: nonNegative(r.amount) ?? 0,
    unit: oneOf(r.unit, UNITS) ?? 'g',
    gramsPerPiece: positive(r.gramsPerPiece),
    nutrimentsPer100: nutriments(r.nutrimentsPer100),
    bestBefore: isoDate(r.bestBefore),
    isStaple,
    minStock: isStaple ? nonNegative(r.minStock) : undefined,
    addedAt: isoDateTime(r.addedAt) ?? now,
  });
}

function shoppingItem(r: Row, now: string): Row | null {
  const name = str(r.name);
  if (!name) return null;
  const amount = positive(r.amount);
  return compact({
    id: r.id,
    name,
    category: oneOf(r.category, CATEGORIES),
    amount,
    unit: amount !== undefined ? oneOf(r.unit, UNITS) : undefined,
    checked: r.checked === true,
    source: oneOf(r.source, SOURCES) ?? 'manual',
    linkedInventoryId: r.linkedInventoryId,
    addedAt: isoDateTime(r.addedAt) ?? now,
  });
}

function recipe(r: Row): Row | null {
  const title = str(r.title);
  if (!title) return null;
  const ingredients = (Array.isArray(r.ingredients) ? r.ingredients : [])
    .filter(isRow)
    .map((ing) => {
      const name = str(ing.name);
      return name
        ? { name, amount: nonNegative(ing.amount) ?? 0, unit: oneOf(ing.unit, UNITS) ?? 'g' }
        : null;
    })
    .filter((ing): ing is NonNullable<typeof ing> => ing !== null);
  const minutes = positive(r.minutes);
  return compact({
    id: r.id,
    title,
    servings: positive(r.servings) ?? 1,
    minutes: minutes !== undefined ? Math.round(minutes) : undefined,
    ingredients,
    steps: strList(r.steps),
    tags: strList(r.tags),
    nutritionPerServing: nutriments(r.nutritionPerServing),
    imageUrl: str(r.imageUrl),
  });
}

function diaryEntry(r: Row): Row | null {
  const datetime = isoDateTime(r.datetime);
  if (!datetime) return null;
  const items = (Array.isArray(r.items) ? r.items : [])
    .filter(isRow)
    .map((it) => {
      const name = str(it.name);
      const amount = positive(it.amount);
      if (!name || amount === undefined) return null;
      return compact({
        name,
        amount,
        unit: oneOf(it.unit, UNITS) ?? 'g',
        kcal: nonNegative(it.kcal) ?? 0,
        protein: nonNegative(it.protein) ?? 0,
        carbs: nonNegative(it.carbs) ?? 0,
        fat: nonNegative(it.fat) ?? 0,
        sourceType: oneOf(it.sourceType, DIARY_SOURCES) ?? 'custom',
        refId: it.refId,
        stockTaken: nonNegative(it.stockTaken),
      });
    })
    .filter((it): it is NonNullable<typeof it> => it !== null);
  if (items.length === 0) return null;

  // Totals are derived data – recompute rather than trust the file.
  const round1 = (n: number) => Math.round(n * 10) / 10;
  const sum = (key: 'kcal' | 'protein' | 'carbs' | 'fat') =>
    round1(items.reduce((acc, it) => acc + (it[key] as number), 0));
  return {
    id: r.id,
    datetime,
    mealType: oneOf(r.mealType, MEALS) ?? 'snack',
    items,
    totals: { kcal: sum('kcal'), protein: sum('protein'), carbs: sum('carbs'), fat: sum('fat') },
  };
}

function settings(r: Row): Row | null {
  const accent = str(r.accentColor);
  return compact({
    id: r.id,
    theme: oneOf(r.theme, THEMES) ?? 'system',
    accentColor: accent && /^#[0-9a-f]{6}$/i.test(accent) ? accent : undefined,
    spoonacularApiKey: str(r.spoonacularApiKey),
  });
}

function categoryHint(r: Row): Row | null {
  const name = str(r.name)?.toLowerCase();
  const category = oneOf(r.category, CATEGORIES);
  return name && category ? { id: r.id, name, category } : null;
}

export interface SanitizedDump {
  dump: TableDump;
  /** Rows that were left out because something essential was missing. */
  skipped: number;
}

export function sanitizeDump(tables: unknown): SanitizedDump {
  if (!isRow(tables)) throw new Error('Ungültige Backup-Datei.');
  const now = new Date().toISOString();
  let skipped = 0;

  const clean = (value: unknown, fn: (r: Row) => Row | null): Row[] => {
    if (value === undefined || value === null) return [];
    if (!Array.isArray(value)) {
      skipped++;
      return [];
    }
    const out: Row[] = [];
    for (const raw of value) {
      const row = isRow(raw) ? fn(raw) : null;
      if (row) out.push(row);
      else skipped++;
    }
    return out;
  };

  const dump: TableDump = {
    profile: clean(tables.profile, profile).slice(0, 1),
    weightLog: clean(tables.weightLog, weight),
    inventory: clean(tables.inventory, (r) => inventoryItem(r, now)),
    shoppingList: clean(tables.shoppingList, (r) => shoppingItem(r, now)),
    recipesOwn: clean(tables.recipesOwn, recipe),
    diary: clean(tables.diary, diaryEntry),
    settings: clean(tables.settings, settings).slice(0, 1),
    categoryHints: clean(tables.categoryHints, categoryHint),
  };
  return { dump, skipped };
}
