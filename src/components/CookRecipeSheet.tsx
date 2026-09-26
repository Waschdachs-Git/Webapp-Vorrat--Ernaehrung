import { type ReactNode, useState } from 'react';
import { BottomSheet } from './BottomSheet';
import { Button, Field, Input, SegmentedControl } from './ui';
import { cookRecipe, defaultMealType, undoCook } from '@/lib/actions';
import { useUndo } from './UndoToast';
import { formatAmount } from '@/lib/format';
import type { MealType, OwnRecipe } from '@/db/types';

const MEAL_OPTIONS: { value: MealType; label: string }[] = [
  { value: 'breakfast', label: 'Frühstück' },
  { value: 'lunch', label: 'Mittag' },
  { value: 'dinner', label: 'Abend' },
  { value: 'snack', label: 'Snack' },
];

/**
 * "Gekocht" flow for an own recipe: book the recipe nutrition into the diary
 * and subtract the matched ingredients from inventory (§4.3).
 */
export function CookRecipeSheet({
  recipe,
  onClose,
  onEdit,
}: {
  recipe: OwnRecipe | null;
  onClose: () => void;
  /** When given, the sheet doubles as the recipe's detail view. */
  onEdit?: (r: OwnRecipe) => void;
}): ReactNode {
  const [meal, setMeal] = useState<MealType>(defaultMealType());
  const [servings, setServings] = useState('1');
  const [saving, setSaving] = useState(false);
  const showUndo = useUndo();

  const cook = async () => {
    if (!recipe) return;
    setSaving(true);
    const n = parseFloat(servings) || 1;
    const result = await cookRecipe({ recipe, mealType: meal, servingsCooked: n });
    const kcal = Math.round((recipe.nutritionPerServing?.kcal ?? 0) * n);
    showUndo(`${recipe.title} gebucht · ${kcal} kcal`, () => undoCook(result));
    setSaving(false);
    onClose();
  };

  return (
    <BottomSheet
      open={!!recipe}
      onClose={onClose}
      title={recipe?.title ?? ''}
    >
      <div className="flex flex-col gap-4">
        {recipe && recipe.ingredients.length > 0 && (
          <div>
            <p className="mb-1 text-[13px] font-semibold text-muted">
              Zutaten für {recipe.servings} {recipe.servings === 1 ? 'Portion' : 'Portionen'}
            </p>
            <ul className="text-[15px] text-text">
              {recipe.ingredients.map((ing, i) => (
                <li key={i} className="flex justify-between border-b border-border py-1.5 last:border-b-0">
                  <span>{ing.name}</span>
                  <span className="tnum text-muted">{formatAmount(ing.amount, ing.unit)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <SegmentedControl value={meal} onChange={setMeal} options={MEAL_OPTIONS} />
        <Field
          label="Portionen"
          hint="Zutaten werden anteilig vom Vorrat abgezogen."
        >
          <Input
            type="number"
            inputMode="decimal"
            value={servings}
            onChange={(e) => setServings(e.target.value)}
          />
        </Field>
        {recipe?.nutritionPerServing ? (
          <p className="text-[13px] text-muted">
            {Math.round(recipe.nutritionPerServing.kcal * (parseFloat(servings) || 1))}{' '}
            kcal werden ins Tagebuch gebucht.
          </p>
        ) : (
          <p className="rounded-xl bg-warn/10 px-3 py-2 text-[13px] text-warn">
            Für dieses Rezept sind keine Nährwerte hinterlegt – es würde mit
            0 kcal gebucht. Ergänze sie über „Bearbeiten“.
          </p>
        )}
        <Button block onClick={cook} disabled={saving}>
          Gekocht &amp; buchen
        </Button>
        {recipe && onEdit && (
          <button
            type="button"
            onClick={() => onEdit(recipe)}
            className="min-h-[40px] text-[15px] font-medium text-accent active:opacity-60"
          >
            Rezept bearbeiten
          </button>
        )}
      </div>
    </BottomSheet>
  );
}
