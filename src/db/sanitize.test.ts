import { describe, expect, it } from 'vitest';
import { sanitizeDump } from './sanitize';

const profile = {
  id: '#profile',
  name: 'Alex',
  sex: 'm',
  birthdate: '1990-05-15',
  heightCm: 178,
  weightKg: 75,
  activityLevel: 'moderate',
  goal: 'gain',
  targetRateKgPerWeek: 0.5,
  allergies: [],
  dietPrefs: ['vegetarisch'],
};

describe('sanitizeDump', () => {
  it('keeps a well-formed backup as it is', () => {
    const tables = {
      profile: [profile],
      weightLog: [{ id: 'wgt-1', date: '2026-09-29', weightKg: 60.8 }],
      inventory: [
        {
          id: 'inv-1',
          name: 'Eier',
          brand: 'GUT&GÜNSTIG',
          barcode: '4311501622254',
          category: 'dairy',
          location: 'fridge',
          amount: 10,
          unit: 'pcs',
          gramsPerPiece: 55,
          nutrimentsPer100: { kcal: 140, protein: 12.7, carbs: 0.27, fat: 9.83 },
          bestBefore: '2026-11-05',
          isStaple: false,
          addedAt: '2026-11-04T17:08:59.046Z',
        },
      ],
      shoppingList: [
        {
          id: 'shp-1',
          name: 'Bio Haferflocken zart',
          category: 'grains',
          amount: 500,
          unit: 'g',
          checked: false,
          source: 'auto-restock',
          linkedInventoryId: 'inv-9',
          addedAt: '2026-11-04T17:00:27.156Z',
        },
      ],
      recipesOwn: [
        {
          id: '#rcp-x',
          title: 'Porridge',
          servings: 1,
          minutes: 5,
          ingredients: [{ name: 'Haferflocken', amount: 70, unit: 'g' }],
          steps: ['Kochen.'],
          tags: ['Frühstück'],
          nutritionPerServing: { kcal: 620, protein: 35, carbs: 90, fat: 10 },
        },
      ],
      diary: [
        {
          id: 'dia-1',
          datetime: '2026-10-03T09:34:35.627Z',
          mealType: 'lunch',
          items: [
            {
              name: 'Blüten Honig',
              amount: 20,
              unit: 'g',
              kcal: 60.4,
              protein: 0.1,
              carbs: 15,
              fat: 0.1,
              sourceType: 'inventory',
              refId: 'inv-2',
              stockTaken: 20,
            },
          ],
          totals: { kcal: 60.4, protein: 0.1, carbs: 15, fat: 0.1 },
        },
      ],
      settings: [{ id: '#settings', theme: 'dark', accentColor: '#247a4e' }],
      categoryHints: [{ id: '#hint:fruit rings', name: 'fruit rings', category: 'snacks' }],
    };
    const { dump, skipped } = sanitizeDump(tables);
    expect(skipped).toBe(0);
    expect(dump).toEqual(tables);
  });

  it('drops the sync bookkeeping and unknown fields', () => {
    const { dump } = sanitizeDump({
      profile: [{ ...profile, owner: 'a@b.de', realmId: 'a@b.de', $ts: 1, hacked: true }],
    });
    expect(dump.profile).toEqual([profile]);
  });

  it('skips rows that miss something essential and counts them', () => {
    const { dump, skipped } = sanitizeDump({
      profile: [{ ...profile, sex: 'x' }],
      weightLog: [
        { date: '2026-01-01', weightKg: 70 },
        { date: '2026-02-31', weightKg: 70 }, // no such day
        { date: '2026-01-02', weightKg: 0 },
        'nonsense',
      ],
      inventory: [{ name: '  ' }, { name: 'Reis' }, null],
      shoppingList: [{ amount: 3 }],
      recipesOwn: [{ servings: 2 }],
      diary: [
        { datetime: 'gestern', mealType: 'lunch', items: [] },
        { datetime: '2026-01-01T12:00:00Z', mealType: 'lunch', items: [] },
      ],
      categoryHints: [{ name: 'x', category: 'unknown' }],
    });
    expect(dump.profile).toEqual([]);
    expect(dump.weightLog).toHaveLength(1);
    expect(dump.inventory).toHaveLength(1);
    expect(dump.shoppingList).toEqual([]);
    expect(dump.recipesOwn).toEqual([]);
    expect(dump.diary).toEqual([]);
    expect(dump.categoryHints).toEqual([]);
    expect(skipped).toBe(1 + 3 + 2 + 1 + 1 + 2 + 1);
  });

  it('fills in defaults instead of dropping usable rows', () => {
    const { dump, skipped } = sanitizeDump({
      inventory: [{ name: 'Reis', amount: '500', unit: 'kilo', location: 'garage', isStaple: 'yes' }],
      shoppingList: [{ name: 'Milch', checked: 1, source: 'whatever' }],
      recipesOwn: [{ title: 'Suppe', ingredients: [{ name: 'Wasser' }, { amount: 2 }], steps: 'kochen' }],
      settings: [{ theme: 'neon', accentColor: 'red', spoonacularApiKey: ' abc ' }],
    });
    expect(skipped).toBe(0);
    expect(dump.inventory?.[0]).toMatchObject({
      name: 'Reis',
      amount: 500,
      unit: 'g',
      location: 'pantry',
      isStaple: false,
    });
    expect(dump.shoppingList?.[0]).toMatchObject({ name: 'Milch', checked: false, source: 'manual' });
    expect(dump.recipesOwn?.[0]).toMatchObject({
      title: 'Suppe',
      servings: 1,
      ingredients: [{ name: 'Wasser', amount: 0, unit: 'g' }],
      steps: [],
      tags: [],
    });
    expect(dump.settings?.[0]).toEqual({ theme: 'system', spoonacularApiKey: 'abc' });
  });

  it('accepts a decimal comma in numbers given as text', () => {
    const { dump } = sanitizeDump({ weightLog: [{ date: '2026-01-01', weightKg: '60,8' }] });
    expect(dump.weightLog?.[0]).toMatchObject({ weightKg: 60.8 });
  });

  it('recomputes diary totals and keeps only valid items', () => {
    const { dump } = sanitizeDump({
      diary: [
        {
          datetime: '2026-01-01T12:00:00Z',
          mealType: 'brunch',
          items: [
            { name: 'A', amount: 100, unit: 'g', kcal: 100, protein: 10, carbs: 5, fat: 2, sourceType: 'custom' },
            { name: 'B', amount: 50, unit: 'g', kcal: 50.5, protein: 1, carbs: 1, fat: 1, sourceType: 'alien' },
            { name: 'ohne Menge', amount: 0, unit: 'g', kcal: 999 },
          ],
          totals: { kcal: 99999, protein: 0, carbs: 0, fat: 0 },
        },
      ],
    });
    const entry = dump.diary?.[0] as { mealType: string; items: unknown[]; totals: object };
    expect(entry.mealType).toBe('snack');
    expect(entry.items).toHaveLength(2);
    expect(entry.totals).toEqual({ kcal: 150.5, protein: 11, carbs: 6, fat: 3 });
  });

  it('keeps only sensible custom targets', () => {
    const { dump } = sanitizeDump({
      profile: [{ ...profile, customTargets: { kcal: 2500, protein: 'viel', carbs: -3 } }],
    });
    expect((dump.profile?.[0] as { customTargets?: object }).customTargets).toEqual({ kcal: 2500 });
  });

  it('takes one profile and one settings row at most', () => {
    const { dump } = sanitizeDump({ profile: [profile, { ...profile, name: 'Zwei' }] });
    expect(dump.profile).toHaveLength(1);
  });

  it('rejects something that is not a table set', () => {
    expect(() => sanitizeDump(null)).toThrow();
    expect(() => sanitizeDump([])).toThrow();
    expect(() => sanitizeDump('tables')).toThrow();
  });

  it('counts a table that is not a list as unusable', () => {
    const { dump, skipped } = sanitizeDump({ inventory: { name: 'Reis' } });
    expect(dump.inventory).toEqual([]);
    expect(skipped).toBe(1);
  });
});
