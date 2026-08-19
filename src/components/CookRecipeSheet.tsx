import { type ReactNode, useState } from 'react';
import { BottomSheet } from './BottomSheet';
import { Button, Field, Input, SegmentedControl } from './ui';
import { cookRecipe, defaultMealType } from '@/lib/actions';
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
}: {
  recipe: OwnRecipe | null;
  onClose: () => void;
}): ReactNode {
  const [meal, setMeal] = useState<MealType>(defaultMealType());
  const [servings, setServings] = useState('1');
  const [saving, setSaving] = useState(false);

  const cook = async () => {
    if (!recipe) return;
    setSaving(true);
    await cookRecipe({
      recipe,
      mealType: meal,
      servingsCooked: parseFloat(servings) || 1,
    });
    setSaving(false);
    onClose();
  };

  return (
    <BottomSheet
      open={!!recipe}
      onClose={onClose}
      title={recipe ? `„${recipe.title}“ kochen` : ''}
    >
      <div className="flex flex-col gap-4">
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
      </div>
    </BottomSheet>
  );
}
