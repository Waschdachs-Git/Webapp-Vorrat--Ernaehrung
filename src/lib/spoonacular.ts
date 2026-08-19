import type { Nutriments, RecipeIngredient, Unit } from '@/db/types';

/**
 * Minimal Spoonacular client. The free-tier API key comes from Settings and is
 * passed as a query param. Responses are cached in-memory for the session (the
 * service worker additionally caches them across reloads). Errors and the daily
 * limit are surfaced cleanly so the UI can degrade instead of crashing.
 */

const BASE = 'https://api.spoonacular.com';

export interface RecipeHit {
  id: number;
  title: string;
  image?: string;
  usedIngredientCount?: number;
  missedIngredientCount?: number;
  missedIngredients?: string[];
}

export interface RecipeDetail {
  id: number;
  title: string;
  image?: string;
  servings: number;
  readyInMinutes?: number;
  sourceUrl?: string;
  instructions?: string;
  /** Human-readable lines as returned by the API ("2 tbsp olive oil"). */
  ingredients: string[];
  /** Structured metric amounts, usable for stock matching. */
  structuredIngredients: RecipeIngredient[];
  nutritionPerServing?: Nutriments;
}

export type ApiOutcome<T> =
  | { ok: true; data: T }
  | { ok: false; reason: 'no-key' | 'limit' | 'network' | 'http'; message: string };

const memCache = new Map<string, unknown>();

export class SpoonacularClient {
  constructor(private apiKey: string | undefined) {}

  get hasKey(): boolean {
    return !!this.apiKey && this.apiKey.trim().length > 0;
  }

  async findByIngredients(
    ingredients: string[],
    number = 10,
  ): Promise<ApiOutcome<RecipeHit[]>> {
    const params = new URLSearchParams({
      ingredients: ingredients.join(','),
      number: String(number),
      ranking: '2', // minimise missing ingredients
      ignorePantry: 'true',
    });
    return this.request<SpoonByIngredient[]>(
      `/recipes/findByIngredients?${params}`,
    ).then((r) =>
      r.ok
        ? {
            ok: true,
            data: r.data.map((x) => ({
              id: x.id,
              title: x.title,
              image: x.image,
              usedIngredientCount: x.usedIngredientCount,
              missedIngredientCount: x.missedIngredientCount,
              missedIngredients: (x.missedIngredients ?? []).map((m) => m.name),
            })),
          }
        : r,
    );
  }

  async complexSearch(
    query: string,
    diet?: string,
    intolerances?: string,
    number = 12,
  ): Promise<ApiOutcome<RecipeHit[]>> {
    const params = new URLSearchParams({ number: String(number) });
    if (query) params.set('query', query);
    if (diet) params.set('diet', diet);
    if (intolerances) params.set('intolerances', intolerances);
    return this.request<{ results: SpoonSearchResult[] }>(
      `/recipes/complexSearch?${params}`,
    ).then((r) =>
      r.ok
        ? {
            ok: true,
            data: r.data.results.map((x) => ({
              id: x.id,
              title: x.title,
              image: x.image,
            })),
          }
        : r,
    );
  }

  async recipeInformation(id: number): Promise<ApiOutcome<RecipeDetail>> {
    const params = new URLSearchParams({ includeNutrition: 'true' });
    return this.request<SpoonInformation>(
      `/recipes/${id}/information?${params}`,
    ).then((r) =>
      r.ok ? { ok: true, data: parseInformation(r.data) } : r,
    );
  }

  private async request<T>(path: string): Promise<ApiOutcome<T>> {
    if (!this.hasKey) {
      return { ok: false, reason: 'no-key', message: 'Kein Spoonacular API-Key hinterlegt.' };
    }
    const sep = path.includes('?') ? '&' : '?';
    const url = `${BASE}${path}${sep}apiKey=${encodeURIComponent(this.apiKey!)}`;
    const cacheKey = path; // exclude the key from the cache identity

    if (memCache.has(cacheKey)) {
      return { ok: true, data: memCache.get(cacheKey) as T };
    }

    try {
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (res.status === 402 || res.status === 429) {
        return { ok: false, reason: 'limit', message: 'Tageslimit erreicht. Bitte später erneut versuchen.' };
      }
      if (!res.ok) {
        return { ok: false, reason: 'http', message: `Fehler ${res.status}` };
      }
      const data = (await res.json()) as T;
      memCache.set(cacheKey, data);
      return { ok: true, data };
    } catch (err) {
      return {
        ok: false,
        reason: 'network',
        message: err instanceof Error ? err.message : 'Netzwerkfehler',
      };
    }
  }
}

// ---- raw response shapes (only the fields we use) ----

interface SpoonByIngredient {
  id: number;
  title: string;
  image?: string;
  usedIngredientCount?: number;
  missedIngredientCount?: number;
  missedIngredients?: { name: string }[];
}

interface SpoonSearchResult {
  id: number;
  title: string;
  image?: string;
}

interface SpoonInformation {
  id: number;
  title: string;
  image?: string;
  servings: number;
  readyInMinutes?: number;
  sourceUrl?: string;
  instructions?: string;
  extendedIngredients?: {
    original: string;
    name?: string;
    nameClean?: string;
    amount?: number;
    unit?: string;
    measures?: {
      metric?: { amount?: number; unitShort?: string };
    };
  }[];
  nutrition?: {
    nutrients?: { name: string; amount: number }[];
  };
}

function parseInformation(d: SpoonInformation): RecipeDetail {
  const nutrients = d.nutrition?.nutrients ?? [];
  const find = (name: string) =>
    nutrients.find((n) => n.name.toLowerCase() === name.toLowerCase())?.amount;
  const kcal = find('Calories');
  const hasNutrition = kcal !== undefined;
  return {
    id: d.id,
    title: d.title,
    image: d.image,
    servings: d.servings,
    readyInMinutes: d.readyInMinutes,
    sourceUrl: d.sourceUrl,
    instructions: d.instructions,
    ingredients: (d.extendedIngredients ?? []).map((i) => i.original),
    structuredIngredients: (d.extendedIngredients ?? [])
      .map(toIngredient)
      .filter((i): i is RecipeIngredient => i !== null),
    nutritionPerServing: hasNutrition
      ? {
          kcal: kcal ?? 0,
          protein: find('Protein') ?? 0,
          carbs: find('Carbohydrates') ?? 0,
          fat: find('Fat') ?? 0,
        }
      : undefined,
  };
}

/**
 * Convert one Spoonacular ingredient into our {name, amount, unit} shape.
 * Spoonacular ships a metric measure alongside the imperial one; we prefer it
 * and translate the common unit abbreviations. Anything not expressible in
 * g/ml (cloves, slices, "1 onion") is kept as a piece count so the ingredient
 * can still be matched against stock.
 */
function toIngredient(raw: {
  original: string;
  name?: string;
  nameClean?: string;
  amount?: number;
  unit?: string;
  measures?: { metric?: { amount?: number; unitShort?: string } };
}): RecipeIngredient | null {
  const name = (raw.nameClean || raw.name || '').trim();
  if (!name) return null;

  const metric = raw.measures?.metric;
  const amount = metric?.amount ?? raw.amount ?? 0;
  const rawUnit = (metric?.unitShort ?? raw.unit ?? '').trim().toLowerCase();

  const conv = UNIT_CONVERSIONS[rawUnit];
  if (conv) {
    return {
      name,
      amount: Math.round(amount * conv.factor * 10) / 10,
      unit: conv.unit,
    };
  }

  // Not expressible in g/ml (cloves, slices, "1 onion") -> keep as pieces.
  return { name, amount: amount || 1, unit: 'pcs' };
}

/** Unit abbreviation -> our unit plus the factor to reach g / ml. */
const UNIT_CONVERSIONS: Record<string, { unit: Unit; factor: number }> = {
  g: { unit: 'g', factor: 1 },
  gr: { unit: 'g', factor: 1 },
  gram: { unit: 'g', factor: 1 },
  grams: { unit: 'g', factor: 1 },
  kg: { unit: 'g', factor: 1000 },
  oz: { unit: 'g', factor: 28.35 },
  lb: { unit: 'g', factor: 453.6 },
  ml: { unit: 'ml', factor: 1 },
  milliliter: { unit: 'ml', factor: 1 },
  milliliters: { unit: 'ml', factor: 1 },
  l: { unit: 'ml', factor: 1000 },
  tbsp: { unit: 'ml', factor: 15 },
  tbsps: { unit: 'ml', factor: 15 },
  tablespoon: { unit: 'ml', factor: 15 },
  tablespoons: { unit: 'ml', factor: 15 },
  tsp: { unit: 'ml', factor: 5 },
  tsps: { unit: 'ml', factor: 5 },
  teaspoon: { unit: 'ml', factor: 5 },
  teaspoons: { unit: 'ml', factor: 5 },
  cup: { unit: 'ml', factor: 240 },
  cups: { unit: 'ml', factor: 240 },
};
