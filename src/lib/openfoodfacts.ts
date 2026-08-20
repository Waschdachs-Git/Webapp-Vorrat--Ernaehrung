import type { Nutriments } from '@/db/types';

export interface OffProduct {
  name: string;
  brand?: string;
  quantity?: string;
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

function num(v: number | string | undefined): number | undefined {
  if (v === undefined || v === '') return undefined;
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : undefined;
}
