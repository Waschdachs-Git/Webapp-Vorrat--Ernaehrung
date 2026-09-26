import { type ReactNode, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { db } from '@/db/database';
import { BottomSheet } from './BottomSheet';
import { Button, Field, Input, Select, Textarea } from './ui';
import type { OwnRecipe, RecipeIngredient, Unit } from '@/db/types';

interface IngredientDraft {
  name: string;
  amount: string;
  unit: Unit;
}

/** Create or edit an own (German) recipe. */
export function RecipeEditorSheet({
  open,
  onClose,
  editRecipe,
}: {
  open: boolean;
  onClose: () => void;
  editRecipe?: OwnRecipe;
}): ReactNode {
  const [title, setTitle] = useState(editRecipe?.title ?? '');
  const [servings, setServings] = useState(String(editRecipe?.servings ?? 2));
  const [ingredients, setIngredients] = useState<IngredientDraft[]>(
    editRecipe?.ingredients.map((i) => ({
      name: i.name,
      amount: String(i.amount),
      unit: i.unit,
    })) ?? [{ name: '', amount: '', unit: 'g' }],
  );
  const [steps, setSteps] = useState(editRecipe?.steps.join('\n') ?? '');
  const [tags, setTags] = useState(editRecipe?.tags.join(', ') ?? '');
  const [nutrition, setNutrition] = useState({
    kcal: editRecipe?.nutritionPerServing ? String(editRecipe.nutritionPerServing.kcal) : '',
    protein: editRecipe?.nutritionPerServing ? String(editRecipe.nutritionPerServing.protein) : '',
    carbs: editRecipe?.nutritionPerServing ? String(editRecipe.nutritionPerServing.carbs) : '',
    fat: editRecipe?.nutritionPerServing ? String(editRecipe.nutritionPerServing.fat) : '',
  });
  const [saving, setSaving] = useState(false);

  const setIngredient = (idx: number, patch: Partial<IngredientDraft>) =>
    setIngredients((prev) =>
      prev.map((ing, i) => (i === idx ? { ...ing, ...patch } : ing)),
    );

  const save = async () => {
    setSaving(true);
    const parsedIngredients: RecipeIngredient[] = ingredients
      .filter((i) => i.name.trim())
      .map((i) => ({
        name: i.name.trim(),
        amount: parseFloat(i.amount) || 0,
        unit: i.unit,
      }));

    const hasNutrition = nutrition.kcal !== '';
    const payload: Omit<OwnRecipe, 'id'> = {
      title: title.trim(),
      servings: parseFloat(servings) || 1,
      ingredients: parsedIngredients,
      steps: steps
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean),
      tags: tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      nutritionPerServing: hasNutrition
        ? {
            kcal: parseFloat(nutrition.kcal) || 0,
            protein: parseFloat(nutrition.protein) || 0,
            carbs: parseFloat(nutrition.carbs) || 0,
            fat: parseFloat(nutrition.fat) || 0,
          }
        : undefined,
    };

    if (editRecipe?.id !== undefined) {
      await db.recipesOwn.update(editRecipe.id, payload);
    } else {
      await db.recipesOwn.add(payload as OwnRecipe);
    }
    setSaving(false);
    onClose();
  };

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={editRecipe ? 'Rezept bearbeiten' : 'Neues Rezept'}
    >
      <div className="flex flex-col gap-4">
        <Field label="Titel">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="z. B. Linsen-Curry" />
        </Field>

        <Field label="Portionen">
          <Input
            type="number"
            inputMode="decimal"
            value={servings}
            onChange={(e) => setServings(e.target.value)}
          />
        </Field>

        <div>
          <p className="mb-2 text-[13px] font-medium text-muted">Zutaten</p>
          <div className="flex flex-col gap-2">
            {ingredients.map((ing, idx) => (
              <div key={idx} className="flex gap-2">
                <Input
                  placeholder="Zutat"
                  value={ing.name}
                  onChange={(e) => setIngredient(idx, { name: e.target.value })}
                  className="flex-1"
                />
                <Input
                  type="number"
                  inputMode="decimal"
                  placeholder="Menge"
                  value={ing.amount}
                  onChange={(e) => setIngredient(idx, { amount: e.target.value })}
                  className="w-20"
                />
                <Select
                  value={ing.unit}
                  onChange={(e) => setIngredient(idx, { unit: e.target.value as Unit })}
                  className="w-20"
                >
                  <option value="g">g</option>
                  <option value="ml">ml</option>
                  <option value="pcs">Stk</option>
                </Select>
                <button
                  type="button"
                  onClick={() =>
                    setIngredients((prev) => prev.filter((_, i) => i !== idx))
                  }
                  aria-label="Zutat entfernen"
                  className="flex w-10 shrink-0 items-center justify-center rounded-xl text-faint active:bg-surface-2"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            ))}
          </div>
          <Button
            variant="ghost"
            className="mt-2"
            onClick={() =>
              setIngredients((prev) => [...prev, { name: '', amount: '', unit: 'g' }])
            }
          >
            <Plus size={16} /> Zutat
          </Button>
        </div>

        <Field label="Zubereitung" hint="Ein Schritt pro Zeile.">
          <Textarea value={steps} onChange={(e) => setSteps(e.target.value)} />
        </Field>

        <Field label="Tags" hint="Komma-getrennt, z. B. vegetarisch, schnell">
          <Input value={tags} onChange={(e) => setTags(e.target.value)} />
        </Field>

        <details className="rounded-xl border border-border bg-surface px-3.5 py-2.5">
          <summary className="cursor-pointer text-[14px] font-medium text-muted">
            Nährwerte pro Portion (optional)
          </summary>
          <div className="mt-3 grid grid-cols-2 gap-3">
            {(['kcal', 'protein', 'carbs', 'fat'] as const).map((k) => (
              <Field
                key={k}
                label={k === 'kcal' ? 'kcal' : k === 'protein' ? 'Protein (g)' : k === 'carbs' ? 'Kohlenhydrate (g)' : 'Fett (g)'}
              >
                <Input
                  type="number"
                  inputMode="decimal"
                  value={nutrition[k]}
                  onChange={(e) => setNutrition({ ...nutrition, [k]: e.target.value })}
                />
              </Field>
            ))}
          </div>
        </details>

        <Button block disabled={saving || !title.trim()} onClick={save} className="mt-1">
          {editRecipe ? 'Speichern' : 'Rezept anlegen'}
        </Button>
      </div>
    </BottomSheet>
  );
}
