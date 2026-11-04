import type { Nutriments, Unit } from '@/db/types';

export interface PackageSize {
  amount: number;
  unit: Unit;
}

export interface OffProduct {
  name: string;
  brand?: string;
  quantity?: string;
  /** Package content in the app's units ("1 l" -> 1000 ml), if readable. */
  packageSize?: PackageSize;
  nutrimentsPer100?: Nutriments;
  /** Raw category hierarchy, broad to specific ("en:fruits", "en:apples"). */
  categoryTags?: string[];
}

export type OffResult =
  | { status: 'found'; product: OffProduct }
  | { status: 'not-found' }
  | { status: 'error'; message: string };

/**
 * Look up a product by EAN/barcode via Open Food Facts (no API key).
 * On status 0 we return 'not-found' so the UI can offer manual entry.
 */
export async function lookupBarcode(barcode: string): Promise<OffResult> {
  const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(
    barcode,
  )}.json`;
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) {
      return { status: 'error', message: `HTTP ${res.status}` };
    }
    const data = (await res.json()) as OffApiResponse;
    if (data.status === 0 || !data.product) {
      return { status: 'not-found' };
    }
    return { status: 'found', product: parseProduct(data.product) };
  } catch (err) {
    return {
      status: 'error',
      message: err instanceof Error ? err.message : 'Netzwerkfehler',
    };
  }
}

interface OffApiResponse {
  status: 0 | 1;
  product?: OffRawProduct;
}

interface OffRawProduct {
  product_name?: string;
  product_name_de?: string;
  brands?: string;
  quantity?: string;
  product_quantity?: number | string;
  product_quantity_unit?: string;
  categories_tags?: string[];
  nutriments?: Record<string, number | string | undefined>;
}

function parseProduct(p: OffRawProduct): OffProduct {
  const name = p.product_name_de || p.product_name || 'Unbenanntes Produkt';
  const n = p.nutriments ?? {};
  const kcal = num(n['energy-kcal_100g']);
  const protein = num(n['proteins_100g']);
  const carbs = num(n['carbohydrates_100g']);
  const fat = num(n['fat_100g']);

  const hasNutrition =
    kcal !== undefined ||
    protein !== undefined ||
    carbs !== undefined ||
    fat !== undefined;

  return {
    name,
    brand: p.brands ? p.brands.split(',')[0]?.trim() : undefined,
    quantity: p.quantity,
    packageSize: parsePackageSize(
      p.quantity,
      p.product_quantity,
      p.product_quantity_unit,
    ),
    categoryTags: p.categories_tags,
    nutrimentsPer100: hasNutrition
      ? {
          kcal: kcal ?? 0,
          protein: protein ?? 0,
          carbs: carbs ?? 0,
          fat: fat ?? 0,
        }
      : undefined,
  };
}

/**
 * Package size from the label text ("500 g", "1,5 l", "6 x 125 g",
 * "10 Stück"), falling back to OFF's normalised product_quantity.
 */
export function parsePackageSize(
  quantity?: string,
  productQuantity?: number | string,
  productQuantityUnit?: string,
): PackageSize | undefined {
  const text = (quantity ?? '').trim().toLowerCase().replace(/,/g, '.');
  const pieces = text.match(/^(\d+)\s*(stück|stk\.?|st\.?|eier|pcs)$/);
  if (pieces) return { amount: Number(pieces[1]), unit: 'pcs' };
  const multi = text.match(/^(\d+)\s*[x×]\s*(\d+(?:\.\d+)?)\s*(kg|g|l|ml|cl)\b/);
  if (multi) return toBase(Number(multi[1]) * Number(multi[2]), multi[3]!);
  const single = text.match(/^(\d+(?:\.\d+)?)\s*(kg|g|l|ml|cl)\b/);
  if (single) return toBase(Number(single[1]), single[2]!);

  const n = num(productQuantity);
  const unit = productQuantityUnit?.trim().toLowerCase();
  if (n && n > 0 && unit && ['kg', 'g', 'l', 'ml', 'cl'].includes(unit)) {
    return toBase(n, unit);
  }
  return undefined;
}

function toBase(value: number, unit: string): PackageSize | undefined {
  if (!Number.isFinite(value) || value <= 0) return undefined;
  const round = (v: number) => Math.round(v * 10) / 10;
  switch (unit) {
    case 'kg':
      return { amount: round(value * 1000), unit: 'g' };
    case 'l':
      return { amount: round(value * 1000), unit: 'ml' };
    case 'cl':
      return { amount: round(value * 10), unit: 'ml' };
    case 'ml':
      return { amount: round(value), unit: 'ml' };
    default:
      return { amount: round(value), unit: 'g' };
  }
}

function num(v: number | string | undefined): number | undefined {
  if (v === undefined || v === '') return undefined;
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : undefined;
}
