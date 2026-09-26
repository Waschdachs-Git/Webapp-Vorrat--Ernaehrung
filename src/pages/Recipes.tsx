import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate } from 'react-router-dom';
import {
  Plus,
  Search,
  CookingPot,
  ChefHat,
  ExternalLink,
  ChevronRight,
} from 'lucide-react';
import { db } from '@/db/database';
import { PageHeader } from '@/components/PageHeader';
import { RecipeEditorSheet } from '@/components/RecipeEditorSheet';
import { CookRecipeSheet } from '@/components/CookRecipeSheet';
import { BottomSheet } from '@/components/BottomSheet';
import {
  Button,
  AddButton,
  EmptyState,
  Input,
  TextTabs,
  cx,
} from '@/components/ui';
import { useSettings } from '@/hooks/useSettings';
import {
  SpoonacularClient,
  type RecipeHit,
  type RecipeDetail,
  type ApiOutcome,
} from '@/lib/spoonacular';
import { isExpiringSoon } from '@/lib/actions';
import type { OwnRecipe, Profile } from '@/db/types';

type Mode = 'cook' | 'search' | 'own';

const DIET_MAP: Record<string, string> = {
  vegetarisch: 'vegetarian',
  vegan: 'vegan',
  pescetarisch: 'pescetarian',
  glutenfrei: 'gluten free',
  ketogen: 'ketogenic',
};
const INTOLERANCE_MAP: Record<string, string> = {
  laktose: 'dairy',
  milch: 'dairy',
  gluten: 'gluten',
  nüsse: 'tree nut',
  erdnuss: 'peanut',
  ei: 'egg',
  soja: 'soy',
  fisch: 'seafood',
};

export function Recipes(): ReactNode {
  const [mode, setMode] = useState<Mode>('cook');
  const [editorOpen, setEditorOpen] = useState(false);
  const [editRecipe, setEditRecipe] = useState<OwnRecipe | undefined>();
  const [cookRecipe, setCookRecipe] = useState<OwnRecipe | null>(null);

  const own = useLiveQuery(() => db.recipesOwn.toArray(), []);

  const openNew = () => {
    setEditRecipe(undefined);
    setEditorOpen(true);
  };
  const openEdit = (r: OwnRecipe) => {
    setEditRecipe(r);
    setEditorOpen(true);
  };

  return (
    <div className="pb-24">
      <PageHeader
        title="Rezepte"
        action={
          <AddButton label="Rezept" onClick={openNew} />
        }
      />

      <div className="px-5">
        <TextTabs
          value={mode}
          onChange={setMode}
          options={[
            { value: 'cook', label: 'Was kochen?' },
            { value: 'own', label: 'Meine Rezepte' },
            { value: 'search', label: 'Online' },
          ]}
        />

        <div className="mt-6">
          {mode === 'cook' && (
            <CookMode own={own ?? []} onCook={setCookRecipe} />
          )}
          {mode === 'search' && <SearchMode />}
          {mode === 'own' && (
            <OwnMode
              own={own ?? []}
              onCook={setCookRecipe}
              onNew={openNew}
            />
          )}
        </div>
      </div>

      <RecipeEditorSheet
        // Remount per target so the form initialises from the recipe being edited.
        key={editRecipe?.id ?? 'new'}
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        editRecipe={editRecipe}
      />
      <CookRecipeSheet
        key={cookRecipe?.id ?? 'none'}
        recipe={cookRecipe}
        onClose={() => setCookRecipe(null)}
        onEdit={(r) => {
          setCookRecipe(null);
          openEdit(r);
        }}
      />
    </div>
  );
}

// ---- "Was kann ich kochen?" ----

function CookMode({
  own,
  onCook,
}: {
  own: OwnRecipe[];
  onCook: (r: OwnRecipe) => void;
}): ReactNode {
  const inventory = useLiveQuery(() => db.inventory.toArray(), []);
  const settings = useSettings();
  const [spoon, setSpoon] = useState<RecipeHit[] | null>(null);
  const [spoonState, setSpoonState] = useState<'idle' | 'loading' | string>('idle');

  const inStock = (inventory ?? []).filter((i) => i.amount > 0);
  const stockNames = inStock.map((i) => i.name);

  // Score own recipes by how many ingredients are in stock (+ expiring bonus).
  const ranked = useMemo(() => {
    return own
      .map((r) => {
        const matched = r.ingredients.filter((ing) =>
          inStock.some((inv) => nameMatch(inv.name, ing.name)),
        );
        const expiringHit = r.ingredients.some((ing) =>
          inStock.some(
            (inv) => nameMatch(inv.name, ing.name) && isExpiringSoon(inv),
          ),
        );
        return {
          recipe: r,
          matchCount: matched.length,
          total: r.ingredients.length,
          expiringHit,
        };
      })
      .filter((x) => x.matchCount > 0)
      // Most ingredients at hand first; ties go to what uses up expiring stock.
      .sort(
        (a, b) =>
          b.matchCount / Math.max(1, b.total) - a.matchCount / Math.max(1, a.total) ||
          Number(b.expiringHit) - Number(a.expiringHit),
      );
  }, [own, inStock]);

  const askSpoonacular = async () => {
    setSpoonState('loading');
    const client = new SpoonacularClient(settings.spoonacularApiKey);
    const res = await client.findByIngredients(stockNames.slice(0, 12), 8);
    if (res.ok) {
      setSpoon(res.data);
      setSpoonState('idle');
    } else {
      setSpoonState(res.message);
    }
  };

  return (
    <div className="flex flex-col gap-4">

      {ranked.length === 0 ? (
        <EmptyState
          icon={<ChefHat size={26} />}
          title="Keine passenden eigenen Rezepte"
          hint="Lege eigene Rezepte an – sie erscheinen hier, sobald Zutaten im Vorrat sind."
        />
      ) : (
        <ul className="md:columns-2 md:gap-10">
          {ranked.map(({ recipe, matchCount, total, expiringHit }) => (
            <li key={recipe.id} className="break-inside-avoid border-b border-border">
              <RecipeRow
                recipe={recipe}
                onOpen={() => onCook(recipe)}
                status={
                  matchCount === total ? (
                    <span className="text-accent">Alle Zutaten da</span>
                  ) : (
                    <span className="text-muted">
                      {total - matchCount} {total - matchCount === 1 ? 'Zutat fehlt' : 'Zutaten fehlen'}
                    </span>
                  )
                }
                note={expiringHit ? 'verwertet Ablaufendes' : undefined}
              />
            </li>
          ))}
        </ul>
      )}

      {/* Online search as a quiet link, not a boxed placeholder. */}
      <div>
        {settings.spoonacularApiKey ? (
          <>
            <button
              type="button"
              onClick={askSpoonacular}
              disabled={spoonState === 'loading' || stockNames.length === 0}
              className="flex min-h-[44px] items-center gap-2 text-[15px] font-medium text-accent active:opacity-60 disabled:opacity-40"
            >
              <Search size={16} />
              {spoonState === 'loading' ? 'Suche…' : 'Online-Rezepte zu meinem Vorrat finden'}
            </button>
            {typeof spoonState === 'string' && spoonState !== 'idle' && spoonState !== 'loading' && (
              <p className="mt-1 text-[13px] text-danger">{spoonState}</p>
            )}
            {spoon && <SpoonacularResults hits={spoon} />}
          </>
        ) : (
          <SpoonacularGate hasKey={false}>{null}</SpoonacularGate>
        )}
      </div>
    </div>
  );
}

// ---- Spoonacular search ----

function SearchMode(): ReactNode {
  const settings = useSettings();
  const profile = useLiveQuery(() => db.profile.get(1), []);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<RecipeHit[] | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | string>('idle');

  const run = async () => {
    setState('loading');
    const client = new SpoonacularClient(settings.spoonacularApiKey);
    const { diet, intolerances } = mapProfileFilters(profile);
    const res: ApiOutcome<RecipeHit[]> = await client.complexSearch(
      query,
      diet,
      intolerances,
    );
    if (res.ok) {
      setHits(res.data);
      setState('idle');
    } else {
      setState(res.message);
    }
  };

  return (
    <SpoonacularGate hasKey={!!settings.spoonacularApiKey}>
      <div className="flex flex-col gap-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search
              size={18}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint"
            />
            <Input
              placeholder="Rezept suchen…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && run()}
              className="pl-10"
            />
          </div>
          <Button onClick={run} disabled={state === 'loading'}>
            Suchen
          </Button>
        </div>
        <p className="text-[12px] text-faint">
          Filter aus Profil: {describeFilters(profile)}. Externe Rezepte sind
          meist englisch.
        </p>
        {state === 'loading' && (
          <p className="py-6 text-center text-[14px] text-muted">Suche…</p>
        )}
        {typeof state === 'string' && state !== 'idle' && state !== 'loading' && (
          <p className="text-[13px] text-danger">{state}</p>
        )}
        {hits && <SpoonacularResults hits={hits} />}
      </div>
    </SpoonacularGate>
  );
}

// ---- own recipes list ----

function OwnMode({
  own,
  onCook,
  onNew,
}: {
  own: OwnRecipe[];
  onCook: (r: OwnRecipe) => void;
  onNew: () => void;
}): ReactNode {
  if (own.length === 0) {
    return (
      <EmptyState
        icon={<CookingPot size={28} />}
        title="Noch keine eigenen Rezepte"
        hint="Lege deine deutschen Lieblingsrezepte an – mit „Gekocht“ buchst du sie direkt."
      />
    );
  }
  return (
    <div>
      <ul className="md:columns-2 md:gap-10">
        {own.map((r) => (
          <li key={r.id} className="break-inside-avoid border-b border-border">
            <RecipeRow recipe={r} onOpen={() => onCook(r)} />
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={onNew}
        className="mt-3 flex min-h-[44px] items-center gap-2 text-[15px] font-medium text-accent active:opacity-60"
      >
        <Plus size={16} /> Rezept anlegen
      </button>
    </div>
  );
}

/**
 * A recipe as a line of type: serif title, one meta line, tags as text.
 * Tapping opens the recipe, where cooking and editing live.
 */
function RecipeRow({
  recipe,
  onOpen,
  status,
  note,
}: {
  recipe: OwnRecipe;
  onOpen: () => void;
  status?: ReactNode;
  note?: string;
}): ReactNode {
  const n = recipe.nutritionPerServing;
  const meta = [
    n ? `${Math.round(n.kcal)} kcal` : null,
    n ? `${Math.round(n.protein)} g Protein` : null,
  ].filter(Boolean);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="-mx-2 flex w-[calc(100%+1rem)] items-center gap-3 rounded-[10px] px-2 py-3.5 text-left active:bg-surface-2"
    >
      <span className="min-w-0 flex-1">
        <span className="block font-serif text-[21px] font-semibold leading-tight tracking-[-0.01em] text-text">
          {recipe.title}
        </span>
        <span className="tnum mt-1 block text-[13.5px] text-muted">
          {meta.join(' · ')}
          {status && (
            <>
              {meta.length ? ' · ' : ''}
              {status}
            </>
          )}
          {note && <span className="text-warn"> · {note}</span>}
        </span>
        {recipe.tags.length > 0 && (
          <span className="mt-0.5 block text-[13px] text-faint">
            {recipe.tags.join(' · ')}
          </span>
        )}
      </span>
      <ChevronRight size={18} className="shrink-0 text-faint" />
    </button>
  );
}

function SpoonacularGate({
  hasKey,
  children,
}: {
  hasKey: boolean;
  children: ReactNode;
}): ReactNode {
  const navigate = useNavigate();
  if (hasKey) return <>{children}</>;
  return (
    <p className="text-[14px] leading-relaxed text-muted">
      Gerichte passend zu deinem Vorrat auch online finden?{' '}
      <button
        type="button"
        onClick={() => navigate('/einstellungen')}
        className="font-medium text-accent underline decoration-accent/30 underline-offset-4 active:opacity-60"
      >
        Online-Suche einrichten
      </button>
    </p>
  );
}

function SpoonacularResults({ hits }: { hits: RecipeHit[] }): ReactNode {
  const [detailId, setDetailId] = useState<number | null>(null);
  if (hits.length === 0) {
    return <p className="py-4 text-center text-[13px] text-faint">Keine Treffer.</p>;
  }
  return (
    <>
      <div className="mt-3 grid grid-cols-2 gap-3">
        {hits.map((hit) => (
          <button
            key={hit.id}
            type="button"
            onClick={() => setDetailId(hit.id)}
            className="overflow-hidden rounded-[18px] bg-surface shadow-card text-left active:bg-surface-2"
          >
            {hit.image && (
              <img
                src={hit.image}
                alt=""
                className="aspect-[4/3] w-full object-cover"
                loading="lazy"
              />
            )}
            <div className="p-3">
              <p className="line-clamp-2 text-[14px] font-medium text-text">
                {hit.title}
              </p>
              {hit.usedIngredientCount !== undefined && (
                <p className="mt-1 text-[12px] text-faint">
                  {hit.usedIngredientCount} vorhanden ·{' '}
                  {hit.missedIngredientCount} fehlen
                </p>
              )}
            </div>
          </button>
        ))}
      </div>
      <SpoonacularDetailSheet id={detailId} onClose={() => setDetailId(null)} />
    </>
  );
}

function SpoonacularDetailSheet({
  id,
  onClose,
}: {
  id: number | null;
  onClose: () => void;
}): ReactNode {
  const settings = useSettings();
  const [detail, setDetail] = useState<RecipeDetail | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | string>('idle');
  const [savedMsg, setSavedMsg] = useState(false);

  // Load the recipe detail whenever the sheet opens for a new id.
  useEffect(() => {
    if (id === null) return;
    let cancelled = false;
    setDetail(null);
    setState('loading');
    new SpoonacularClient(settings.spoonacularApiKey)
      .recipeInformation(id)
      .then((res) => {
        if (cancelled) return;
        if (res.ok) {
          setDetail(res.data);
          setState('idle');
        } else {
          setState(res.message);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [id, settings.spoonacularApiKey]);

  const saveAsOwn = async () => {
    if (!detail) return;
    const recipe: Omit<OwnRecipe, 'id'> = {
      title: detail.title,
      servings: detail.servings || 1,
      // Structured metric amounts, so "Gekocht" can deduct from stock and the
      // recipe shows up under "Was kann ich kochen?".
      ingredients: detail.structuredIngredients,
      steps: detail.instructions
        ? detail.instructions.replace(/<[^>]+>/g, '').split(/\.\s+/).filter(Boolean)
        : [],
      tags: ['spoonacular'],
      nutritionPerServing: detail.nutritionPerServing,
      imageUrl: detail.image,
    };
    await db.recipesOwn.add(recipe as OwnRecipe);
    setSavedMsg(true);
    window.setTimeout(() => setSavedMsg(false), 1500);
  };

  return (
    <BottomSheet
      open={id !== null}
      onClose={onClose}
      title={detail?.title ?? 'Rezept'}
    >
      {state === 'loading' ? (
        <p className="py-8 text-center text-[14px] text-muted">Lädt…</p>
      ) : typeof state === 'string' && state !== 'idle' ? (
        <p className="py-6 text-center text-[14px] text-danger">{state}</p>
      ) : detail ? (
        <div className="flex flex-col gap-4">
          {detail.image && (
            <img src={detail.image} alt="" className="w-full rounded-2xl object-cover" />
          )}
          <p className="text-[13px] text-muted">
            {detail.servings} Portionen
            {detail.readyInMinutes ? ` · ${detail.readyInMinutes} Min` : ''}
            {detail.nutritionPerServing
              ? ` · ${Math.round(detail.nutritionPerServing.kcal)} kcal/Portion`
              : ''}
          </p>

          {detail.ingredients.length > 0 && (
            <div>
              <h3 className="mb-1.5 text-[14px] font-semibold text-text">
                Zutaten{' '}
                <span className="font-normal text-faint">
                  ({detail.structuredIngredients.length} übernehmbar)
                </span>
              </h3>
              <ul className="flex flex-col gap-1">
                {detail.ingredients.map((ing, i) => (
                  <li key={i} className="text-[14px] text-muted">
                    · {ing}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="text-[12px] text-faint">
            Externe Rezepte sind meist englisch.
          </p>

          <div className="flex gap-2">
            {detail.sourceUrl && (
              <a
                href={detail.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className={cx(
                  'inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl bg-surface-2 px-4 text-[15px] font-medium text-text active:bg-border',
                )}
              >
                <ExternalLink size={16} /> Original
              </a>
            )}
            <Button block onClick={saveAsOwn}>
              {savedMsg ? 'Gespeichert' : 'Als Rezept speichern'}
            </Button>
          </div>
        </div>
      ) : null}
    </BottomSheet>
  );
}

// ---- helpers ----

function mapProfileFilters(profile: Profile | undefined): {
  diet?: string;
  intolerances?: string;
} {
  if (!profile) return {};
  const diets = profile.dietPrefs
    .map((p) => DIET_MAP[p.toLowerCase()])
    .filter(Boolean);
  const intol = profile.allergies
    .map((a) => INTOLERANCE_MAP[a.toLowerCase()])
    .filter(Boolean);
  return {
    diet: diets[0],
    intolerances: intol.length ? Array.from(new Set(intol)).join(',') : undefined,
  };
}

function describeFilters(profile: Profile | undefined): string {
  const { diet, intolerances } = mapProfileFilters(profile);
  const parts = [diet, intolerances].filter(Boolean);
  return parts.length ? parts.join(', ') : 'keine';
}

function nameMatch(a: string, b: string): boolean {
  const x = a.trim().toLowerCase();
  const y = b.trim().toLowerCase();
  return x === y || x.includes(y) || y.includes(x);
}
