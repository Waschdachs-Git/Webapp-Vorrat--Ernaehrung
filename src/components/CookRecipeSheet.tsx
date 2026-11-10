import { type ReactNode, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Check, ShoppingCart } from 'lucide-react';
import { db } from '@/db/database';
import { BottomSheet } from './BottomSheet';
import { Button, Field, Input, SegmentedControl, cx } from './ui';
import {
  addIngredientsToShoppingList,
  cookRecipe,
  defaultMealType,
  undoCook,
} from '@/lib/actions';
import { namesMatch } from '@/lib/match';
import { useUndo } from './UndoToast';
import { formatAmount, parseDecimal } from '@/lib/format';
import type { MealType, OwnRecipe, RecipeIngredient } from '@/db/types';

const MEAL_OPTIONS: { value: MealType; label: string }[] = [
  { value: 'breakfast', label: 'Frühstück' },
  { value: 'lunch', label: 'Mittag' },
  { value: 'dinner', label: 'Abend' },
  { value: 'snack', label: 'Snack' },
];

type IngredientStatus = 'stock' | 'list' | 'missing';

/**
 * Recipe detail: ingredients with what is at home, the steps, and the
 * "Gekocht" flow that books the nutrition into the diary and subtracts the
 * matched ingredients from inventory (§4.3).
 */
export function CookRecipeSheet({
  recipe,
  onClose,
  onEdit,
}: {
  recipe: OwnRecipe | null;
  onClose: () => void;
  onEdit?: (r: OwnRecipe) => void;
}): ReactNode {
  const [meal, setMeal] = useState<MealType>(defaultMealType());
  const [servings, setServings] = useState('1');
  const [saving, setSaving] = useState(false);
  const showUndo = useUndo();
  const inventory = useLiveQuery(() => db.inventory.toArray(), []);
  const shopping = useLiveQuery(() => db.shoppingList.toArray(), []);

  const statusOf = (ing: RecipeIngredient): IngredientStatus => {
    if ((inventory ?? []).some((i) => i.amount > 0 && namesMatch(i.name, ing.name))) {
      return 'stock';
    }
    if ((shopping ?? []).some((s) => !s.checked && namesMatch(s.name, ing.name))) {
      return 'list';
    }
    return 'missing';
  };
  const ingredients = (recipe?.ingredients ?? []).map((ing) => ({
    ing,
    status: statusOf(ing),
  }));
  const toBuy = ingredients.filter((x) => x.status === 'missing').map((x) => x.ing);
  const onList = ingredients.some((x) => x.status === 'list');

  const cook = async () => {
    if (!recipe) return;
    setSaving(true);
    const n = parseDecimal(servings) || 1;
    const result = await cookRecipe({ recipe, mealType: meal, servingsCooked: n });
    const kcal = Math.round((recipe.nutritionPerServing?.kcal ?? 0) * n);
    showUndo(`${recipe.title} gebucht · ${kcal} kcal`, () => undoCook(result));
    setSaving(false);
    onClose();
  };

  const putOnList = async () => {
    const ids = await addIngredientsToShoppingList(toBuy);
    if (ids.length === 0) return;
    showUndo(
      ids.length === 1
        ? '1 Zutat auf der Einkaufsliste'
        : `${ids.length} Zutaten auf der Einkaufsliste`,
      () => db.shoppingList.bulkDelete(ids),
    );
  };

  const n = recipe?.nutritionPerServing;
  const meta = recipe
    ? [
        recipe.minutes ? `${recipe.minutes} Min.` : null,
        `${recipe.servings} ${recipe.servings === 1 ? 'Portion' : 'Portionen'}`,
      ].filter(Boolean)
    : [];

  return (
    <BottomSheet open={!!recipe} onClose={onClose} title={recipe?.title ?? ''}>
      {recipe && (
        <div className="flex flex-col gap-6">
          <div className="tnum -mt-2 text-[14px] text-muted">
            <p>{meta.join(' · ')}</p>
            {n && (
              <p>
                Pro Portion:{' '}
                {[
                  `${Math.round(n.kcal)} kcal`,
                  `${Math.round(n.protein)} g Protein`,
                  `${Math.round(n.carbs)} g KH`,
                  `${Math.round(n.fat)} g Fett`,
                ].map((part, i) => (
                  // Values never break between number and unit.
                  <span key={part}>
                    {i > 0 && ' · '}
                    <span className="whitespace-nowrap">{part}</span>
                  </span>
                ))}
              </p>
            )}
          </div>

          {ingredients.length > 0 && (
            <div>
              <p className="mb-1 text-[13px] font-semibold text-muted">Zutaten</p>
              <ul className="text-[15px] text-text">
                {ingredients.map(({ ing, status }, i) => (
                  <li
                    key={i}
                    className="flex items-center gap-2.5 border-b border-border py-2 last:border-b-0"
                  >
                    <span className="flex w-4 shrink-0 justify-center">
                      {status === 'stock' && (
                        <Check size={15} strokeWidth={2.6} className="text-accent" aria-label="im Vorrat" />
                      )}
                      {status === 'list' && (
                        <ShoppingCart size={14} className="text-faint" aria-label="auf der Einkaufsliste" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">{ing.name}</span>
                    <span className="tnum shrink-0 text-muted">{formatAmount(ing.amount, ing.unit)}</span>
                  </li>
                ))}
              </ul>
              {toBuy.length > 0 ? (
                <Button variant="secondary" block className="mt-3" onClick={putOnList}>
                  <ShoppingCart size={16} />
                  {toBuy.length === 1
                    ? '1 fehlende Zutat auf die Einkaufsliste'
                    : `${toBuy.length} fehlende Zutaten auf die Einkaufsliste`}
                </Button>
              ) : (
                <p className={cx('mt-2 text-[13.5px]', onList ? 'text-muted' : 'text-accent')}>
                  {onList
                    ? 'Was fehlt, steht schon auf der Einkaufsliste.'
                    : 'Alles im Vorrat – du kannst loslegen.'}
                </p>
              )}
            </div>
          )}

          {recipe.steps.length > 0 && (
            <div>
              <p className="mb-2 text-[13px] font-semibold text-muted">Zubereitung</p>
              <ol className="flex flex-col gap-3">
                {recipe.steps.map((step, i) => (
                  <li key={i} className="flex gap-3 text-[15px] leading-relaxed text-text">
                    <span className="tnum w-5 shrink-0 font-serif text-[17px] font-semibold leading-[1.55] text-accent">
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1">{step}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          <div className="flex flex-col gap-4 border-t border-border pt-5">
            <p className="text-[13px] font-semibold text-muted">Gekocht? Ins Tagebuch buchen</p>
            <SegmentedControl value={meal} onChange={setMeal} options={MEAL_OPTIONS} />
            <Field label="Portionen" hint="Zutaten werden anteilig vom Vorrat abgezogen.">
              <Input
                type="number"
                inputMode="decimal"
                value={servings}
                onChange={(e) => setServings(e.target.value)}
              />
            </Field>
            {n ? (
              <p className="text-[13px] text-muted">
                {Math.round(n.kcal * (parseDecimal(servings) || 1))} kcal werden ins Tagebuch gebucht.
              </p>
            ) : (
              <p className="rounded-xl bg-warn/10 px-3 py-2 text-[13px] text-warn">
                Für dieses Rezept sind keine Nährwerte hinterlegt – es würde mit
                0 kcal gebucht. Ergänze sie über „Rezept bearbeiten“.
              </p>
            )}
            <Button block onClick={cook} disabled={saving}>
              Gekocht &amp; buchen
            </Button>
            {onEdit && (
              <button
                type="button"
                onClick={() => onEdit(recipe)}
                className="min-h-[40px] text-[15px] font-medium text-accent active:opacity-60"
              >
                Rezept bearbeiten
              </button>
            )}
          </div>
        </div>
      )}
    </BottomSheet>
  );
}
