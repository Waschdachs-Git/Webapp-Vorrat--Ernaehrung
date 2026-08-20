/**
 * Food categories and the classifier that assigns them.
 *
 * Three stages, none of which need a network call or an API key:
 *   1. Open Food Facts tags   – exact, available for every scanned product
 *   2. German keyword rules   – for fresh produce and hand-typed names
 *   3. Learned corrections    – see `classifyWithHints` in db/categories
 *
 * Anything unmatched becomes 'other' and stays editable by hand.
 */

export type FoodCategory =
  | 'fruit'
  | 'vegetables'
  | 'bread'
  | 'dairy'
  | 'meat'
  | 'grains'
  | 'canned'
  | 'condiments'
  | 'snacks'
  | 'drinks'
  | 'other';

/** Order follows a typical German supermarket layout — it drives the
 *  shopping list so the route through the shop is a single pass. */
export const CATEGORY_ORDER: FoodCategory[] = [
  'fruit',
  'vegetables',
  'bread',
  'dairy',
  'meat',
  'grains',
  'canned',
  'condiments',
  'snacks',
  'drinks',
  'other',
];

export const CATEGORY_LABELS: Record<FoodCategory, string> = {
  fruit: 'Obst',
  vegetables: 'Gemüse',
  bread: 'Brot & Backwaren',
  dairy: 'Milchprodukte & Eier',
  meat: 'Fleisch & Fisch',
  grains: 'Getreide, Nudeln & Reis',
  canned: 'Konserven & Hülsenfrüchte',
  condiments: 'Öl, Gewürze & Saucen',
  snacks: 'Snacks & Süßes',
  drinks: 'Getränke',
  other: 'Sonstiges',
};

// ---------------------------------------------------------------- OFF tags

/**
 * Open Food Facts category tags -> our categories. The API returns the
 * hierarchy from broad to specific, so we scan it back to front and the most
 * specific match wins.
 */
const OFF_TAG_MAP: Record<string, FoodCategory> = {
  'en:fruits': 'fruit',
  'en:fresh-fruits': 'fruit',
  'en:apples': 'fruit',
  'en:bananas': 'fruit',
  'en:citrus': 'fruit',
  'en:berries': 'fruit',
  'en:dried-fruits': 'fruit',

  'en:vegetables': 'vegetables',
  'en:fresh-vegetables': 'vegetables',
  'en:tomatoes': 'vegetables',
  'en:potatoes': 'vegetables',
  'en:salads': 'vegetables',
  'en:mushrooms': 'vegetables',

  'en:breads': 'bread',
  'en:bread': 'bread',
  'en:baguettes': 'bread',
  'en:viennoiseries': 'bread',
  'en:pastries': 'bread',
  'en:rusks': 'bread',

  'en:dairies': 'dairy',
  'en:milks': 'dairy',
  'en:yogurts': 'dairy',
  'en:cheeses': 'dairy',
  'en:creams': 'dairy',
  'en:butters': 'dairy',
  'en:eggs': 'dairy',
  'en:fermented-milk-products': 'dairy',
  'en:plant-based-milk-alternatives': 'dairy',

  'en:meats': 'meat',
  'en:fresh-meats': 'meat',
  'en:poultry': 'meat',
  'en:beef': 'meat',
  'en:pork': 'meat',
  'en:sausages': 'meat',
  'en:hams': 'meat',
  'en:fishes': 'meat',
  'en:seafood': 'meat',
  'en:canned-fishes': 'meat',

  'en:cereals-and-potatoes': 'grains',
  'en:pastas': 'grains',
  'en:rice': 'grains',
  'en:breakfast-cereals': 'grains',
  'en:flours': 'grains',
  'en:oat-flakes': 'grains',
  'en:cereal-flakes': 'grains',
  'en:couscous': 'grains',

  'en:canned-foods': 'canned',
  'en:legumes': 'canned',
  'en:pulses': 'canned',
  'en:canned-vegetables': 'canned',
  'en:canned-legumes': 'canned',
  'en:tomato-preserves': 'canned',

  'en:condiments': 'condiments',
  'en:sauces': 'condiments',
  'en:olive-oils': 'condiments',
  'en:vegetable-oils': 'condiments',
  'en:fats': 'condiments',
  'en:spices': 'condiments',
  'en:salts': 'condiments',
  'en:vinegars': 'condiments',
  'en:mustards': 'condiments',
  'en:honeys': 'condiments',
  'en:spreads': 'condiments',

  'en:snacks': 'snacks',
  'en:sweet-snacks': 'snacks',
  'en:salty-snacks': 'snacks',
  'en:chocolates': 'snacks',
  'en:biscuits': 'snacks',
  'en:biscuits-and-cakes': 'snacks',
  'en:candies': 'snacks',
  'en:crisps': 'snacks',
  'en:chips-and-fries': 'snacks',
  'en:nuts': 'snacks',

  'en:beverages': 'drinks',
  'en:waters': 'drinks',
  'en:fruit-juices': 'drinks',
  'en:juices': 'drinks',
  'en:sodas': 'drinks',
  'en:coffees': 'drinks',
  'en:teas': 'drinks',
  'en:alcoholic-beverages': 'drinks',
};

export function classifyByOffTags(tags: string[]): FoodCategory | null {
  for (let i = tags.length - 1; i >= 0; i--) {
    const hit = OFF_TAG_MAP[tags[i]!.trim().toLowerCase()];
    if (hit) return hit;
  }
  return null;
}

// ------------------------------------------------------------ name matching

/**
 * German keyword matching.
 *
 * German compounds are head-final: a "Weintraube" is a grape, not a wine, and
 * "Kartoffelchips" are a snack, not a vegetable. So the term matching *latest*
 * in the word wins — that is the head noun. Ties go to the longer term.
 *
 * Short or ambiguous terms carry \b anchors on purpose: without them "ei"
 * would match inside "Fleisch".
 */
const TERMS: { re: RegExp; category: FoodCategory }[] = [
  ...terms('fruit',
    'apfel', 'äpfel', 'banane', 'birne', 'traube', 'orange', 'mandarine',
    'clementine', 'zitrone', 'limette', 'pfirsich', 'nektarine', 'aprikose',
    'pflaume', 'zwetschge', 'kirsche', 'melone', 'ananas', 'mango', 'kiwi',
    'avocado', 'feige', 'dattel', 'rosine', 'beere', 'obst',
    'grapefruit', 'pampelmuse', 'quitte', 'rhabarber', 'frucht', 'früchte'),

  ...terms('vegetables',
    'tomate', 'gurke', 'paprika', 'zwiebel', 'knoblauch', 'karotte', 'möhre',
    'kartoffel', 'salat', 'spinat', 'brokkoli', 'blumenkohl', 'kohl', 'lauch',
    'sellerie', 'zucchini', 'aubergine', 'kürbis', 'rettich', 'radieschen',
    'rote bete', 'spargel', 'pilz', 'champignon', 'ingwer', 'gemüse',
    'wirsing', 'fenchel', 'artischocke', 'mangold', 'pastinake', 'rucola',
    'schote', 'sprossen', 'kresse',
    'bohne', 'erbse'),

  ...terms('bread',
    'brot', 'brötchen', 'semmel', 'baguette', 'toast', 'croissant', 'brezel',
    'knäckebrot', 'zwieback', 'kuchen', 'torte', 'waffel', 'zopf', 'stuten'),

  ...terms('dairy',
    'milch', 'joghurt', 'jogurt', 'quark', 'skyr', 'käse', 'gouda', 'butter',
    'sahne', 'schmand', 'creme fraiche', 'crème fraîche', 'mozzarella',
    'feta', 'parmesan', 'kefir', 'pudding', 'rahm', 'ricotta', 'mascarpone'),
  ...anchored('dairy', 'ei', 'eier'),

  ...terms('meat',
    'fleisch', 'hähnchen', 'hühnchen', 'pute', 'truthahn', 'rind', 'schwein',
    'lamm', 'steak', 'schnitzel', 'filet', 'wurst', 'salami', 'schinken',
    'speck', 'bacon', 'fisch', 'lachs', 'forelle', 'garnele', 'shrimp',
    'meeresfrüchte', 'kasseler', 'leberkäse', 'gulasch', 'kabeljau',
    'hering', 'makrele', 'sardine'),
  ...anchored('meat', 'hack'),

  ...terms('grains',
    'nudel', 'pasta', 'spaghetti', 'penne', 'fusilli', 'makkaroni', 'lasagne',
    'reis', 'couscous', 'bulgur', 'quinoa', 'hafer', 'müsli', 'cornflakes',
    'mehl', 'grieß', 'polenta', 'getreide', 'porridge', 'knödel',
    'semmelbrösel', 'gnocchi'),

  ...terms('canned',
    'dose', 'konserve', 'linse', 'kichererbse', 'eingelegt', 'sauerkraut',
    'oliven', 'passata', 'rotkohl im glas', 'antipasti'),
  ...anchored('canned', 'mais'),

  ...terms('condiments',
    'essig', 'senf', 'ketchup', 'mayonnaise', 'sauce', 'soße', 'gewürz',
    'pfeffer', 'curry', 'zimt', 'honig', 'sirup', 'marmelade', 'konfitüre',
    'aufstrich', 'hefe', 'backpulver', 'zucker', 'vanille', 'kräuter',
    'brühe', 'bouillon', 'paste', 'dressing', 'pesto'),
  ...suffix('condiments', 'öl'),
  ...anchored('condiments', 'salz'),

  ...terms('snacks',
    'schokolade', 'keks', 'riegel', 'bonbon', 'gummibär', 'chips', 'cracker',
    'nuss', 'nüsse', 'mandel', 'cashew', 'popcorn', 'snack', 'süßigkeit',
    'praline', 'salzstange', 'gummi', 'lakritz', 'waffeln', 'müsliriegel'),
  ...anchored('snacks', 'eis'),

  ...terms('drinks',
    'saft', 'schorle', 'limonade', 'cola', 'wasser', 'sprudel', 'kaffee',
    'espresso', 'bier', 'wein', 'sekt', 'smoothie'),
  ...suffix('drinks', 'tee'),
];

function terms(
  category: FoodCategory,
  ...list: string[]
): { re: RegExp; category: FoodCategory }[] {
  return list.map((t) => ({ re: new RegExp(escape(t), 'g'), category }));
}

/**
 * Trailing-boundary variant: matches at the end of a compound ("Kräutertee",
 * "Traubenkernöl") but not when the term is buried inside a longer word.
 */
function suffix(
  category: FoodCategory,
  ...list: string[]
): { re: RegExp; category: FoodCategory }[] {
  return list.map((t) => ({
    re: new RegExp(`${escape(t)}\\b`, 'g'),
    category,
  }));
}

/** Fully word-anchored, for terms that would otherwise wreck other words
 *  ("eis" inside "Reis", "ei" inside "Fleisch"). */
function anchored(
  category: FoodCategory,
  ...list: string[]
): { re: RegExp; category: FoodCategory }[] {
  return list.map((t) => ({
    re: new RegExp(`\\b${escape(t)}\\b`, 'g'),
    category,
  }));
}

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Compounds whose head noun points at the wrong shelf. "Erdnussbutter" is a
 * spread, not a dairy product; "Tomatenmark" belongs to preserves. These are
 * checked before the general matching.
 */
const PRIORITY_TERMS: { term: string; category: FoodCategory }[] = [
  // Non-food first: "Zahnpasta" otherwise matches "pasta" and lands in the
  // noodle aisle.
  { term: 'zahnpasta', category: 'other' },
  { term: 'zahncreme', category: 'other' },
  { term: 'zahnbürste', category: 'other' },
  { term: 'shampoo', category: 'other' },
  { term: 'duschgel', category: 'other' },
  { term: 'seife', category: 'other' },
  { term: 'waschmittel', category: 'other' },
  { term: 'spülmittel', category: 'other' },
  { term: 'putzmittel', category: 'other' },
  { term: 'toilettenpapier', category: 'other' },
  { term: 'klopapier', category: 'other' },
  { term: 'küchenrolle', category: 'other' },
  { term: 'taschentücher', category: 'other' },
  { term: 'müllbeutel', category: 'other' },
  { term: 'alufolie', category: 'other' },
  { term: 'frischhaltefolie', category: 'other' },
  { term: 'katzenfutter', category: 'other' },
  { term: 'hundefutter', category: 'other' },
  { term: 'batterie', category: 'other' },
  { term: 'windel', category: 'other' },
  { term: 'erdnussbutter', category: 'condiments' },
  { term: 'nussmus', category: 'condiments' },
  { term: 'mandelmus', category: 'condiments' },
  { term: 'tomatenmark', category: 'canned' },
  { term: 'passierte tomaten', category: 'canned' },
  { term: 'gehackte tomaten', category: 'canned' },
  { term: 'kidneybohne', category: 'canned' },
  { term: 'kichererbse', category: 'canned' },
  { term: 'olivenöl', category: 'condiments' },
  { term: 'rapsöl', category: 'condiments' },
  { term: 'sonnenblumenöl', category: 'condiments' },
  { term: 'kokosmilch', category: 'canned' },
  { term: 'studentenfutter', category: 'snacks' },
  { term: 'erdnussflip', category: 'snacks' },
  { term: 'kokosöl', category: 'condiments' },
  { term: 'buttermilch', category: 'dairy' },
  { term: 'apfelessig', category: 'condiments' },
  { term: 'apfelmus', category: 'canned' },
  { term: 'essiggurke', category: 'canned' },
  { term: 'gewürzgurke', category: 'canned' },
  { term: 'reiswaffel', category: 'snacks' },
  { term: 'maiswaffel', category: 'snacks' },
  { term: 'eistee', category: 'drinks' },
  { term: 'milchreis', category: 'dairy' },
];

export function classifyByName(name: string): FoodCategory | null {
  const n = name.trim().toLowerCase();
  if (!n) return null;

  for (const { term, category } of PRIORITY_TERMS) {
    if (n.includes(term)) return category;
  }

  // Head-final rule: the match closest to the end of the word decides.
  let best: { index: number; length: number; category: FoodCategory } | null =
    null;
  for (const { re, category } of TERMS) {
    re.lastIndex = 0;
    for (const m of n.matchAll(re)) {
      const index = m.index ?? 0;
      const length = m[0].length;
      if (
        !best ||
        index > best.index ||
        (index === best.index && length > best.length)
      ) {
        best = { index, length, category };
      }
    }
  }
  return best?.category ?? null;
}

/** Combined classification. Tags win over the name; 'other' is the fallback. */
export function classify(name: string, offTags?: string[]): FoodCategory {
  if (offTags?.length) {
    const byTag = classifyByOffTags(offTags);
    if (byTag) return byTag;
  }
  return classifyByName(name) ?? 'other';
}
