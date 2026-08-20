// Domain types for the local-first data model (Dexie tables).

import type { FoodCategory } from '@/lib/categories';

export type Sex = 'm' | 'w' | 'd';
export type ActivityLevel =
  | 'sedentary'
  | 'light'
  | 'moderate'
  | 'very'
  | 'extra';
export type Goal = 'lose' | 'maintain' | 'gain';
export type StorageLocation = 'fridge' | 'freezer' | 'pantry';
export type Unit = 'g' | 'ml' | 'pcs';
export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';
export type ThemeMode = 'system' | 'light' | 'dark';
export type ShoppingSource = 'manual' | 'auto-restock' | 'recipe';
export type DiarySourceType = 'inventory' | 'recipe' | 'custom' | 'barcode';

export interface Nutriments {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

/** Daily nutrition targets, derived (and optionally overridden) from profile. */
export interface Targets {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

/** Exactly one profile entry. */
export interface Profile {
  id: number;
  name: string;
  sex: Sex;
  birthdate: string; // ISO date (YYYY-MM-DD)
  heightCm: number;
  weightKg: number;
  activityLevel: ActivityLevel;
  goal: Goal;
  targetRateKgPerWeek: number;
  allergies: string[];
  dietPrefs: string[];
  /** Manual overrides for the calculated targets (optional). */
  customTargets?: Partial<Targets>;
}

export interface WeightLog {
  id?: number;
  date: string; // ISO date
  weightKg: number;
}

export interface InventoryItem {
  id?: number;
  name: string;
  brand?: string;
  barcode?: string;
  category?: FoodCategory;
  location: StorageLocation;
  amount: number;
  unit: Unit;
  /**
   * Weight of one piece in grams — only meaningful for unit 'pcs'. Nutriments
   * are stored per 100 g, so logging by the piece needs this to convert.
   */
  gramsPerPiece?: number;
  nutrimentsPer100?: Nutriments; // per 100 g/ml, from Open Food Facts or manual
  bestBefore?: string; // ISO date (MHD)
  isStaple: boolean;
  minStock?: number;
  addedAt: string; // ISO datetime
}

export interface ShoppingItem {
  id?: number;
  name: string;
  category?: FoodCategory;
  amount?: number;
  unit?: Unit;
  checked: boolean;
  source: ShoppingSource;
  linkedInventoryId?: number;
  addedAt: string;
}

export interface RecipeIngredient {
  name: string;
  amount: number;
  unit: Unit;
}

export interface OwnRecipe {
  id?: number;
  title: string;
  servings: number;
  ingredients: RecipeIngredient[];
  steps: string[];
  nutritionPerServing?: Nutriments;
  tags: string[];
  imageUrl?: string;
}

export interface DiaryItem {
  name: string;
  amount: number;
  unit: Unit;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  sourceType: DiarySourceType;
  refId?: number;
}

export interface DiaryEntry {
  id?: number;
  datetime: string; // ISO datetime
  mealType: MealType;
  items: DiaryItem[];
  totals: Nutriments;
}

/** Small standard DB for fresh/unpackaged foods, values per 100 g. */
export interface LocalFood {
  id?: number;
  name: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  defaultUnit: Unit;
}

/** Remembered manual corrections: lowercased name -> category. */
export interface CategoryHint {
  name: string;
  category: FoodCategory;
}

/** Exactly one settings entry. */
export interface Settings {
  id: number;
  spoonacularApiKey?: string;
  accentColor: string; // hex, e.g. '#3b6e4f'
  theme: ThemeMode;
}
