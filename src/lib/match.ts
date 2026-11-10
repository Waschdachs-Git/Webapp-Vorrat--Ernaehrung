import { classifyByName, type FoodCategory } from './categories';

/**
 * Is a stock item (or shopping entry) the food an ingredient asks for?
 *
 * Product names from barcodes rarely equal the plain ingredient name, so
 * this has to be fuzzy – but comparing substrings, as it used to, calls
 * tomato ketchup a tomato and rice cakes rice. Names are compared word by
 * word instead, with what German makes necessary:
 *
 *  - Compounds are head-final: "Vollmilch" is a milk, "Milchreis" is not.
 *    A word matches when it is the end of the other one.
 *  - Some compounds keep the head but are another product ("Kokosmilch",
 *    "Erdnussbutter", "Süßkartoffeln") – a short list of exceptions.
 *  - An extra word can turn it into another product ("Paprika Chips",
 *    "Rote Bete Saft") or, for fresh produce, another form ("Tomaten
 *    passiert", "Knoblauch granuliert").
 *  - Plurals, a few synonyms ("Möhre"/"Karotte"), brackets ("Mais (Dose)")
 *    and trailing phrases ("in eigenem Saft", "mit Leinsamen") are ignored.
 *
 * It stays a heuristic. It errs on the side of "not in stock": a missing
 * tick costs a look into the cupboard, a wrong one a missing ingredient.
 */

// ------------------------------------------------------------ vocabulary

/** Function words and packaging noise. */
const STOP_WORDS = new Set([
  'bio', 'nr', 'ca', 'der', 'die', 'das', 'und', 'oder', 'a', 'la', 'le', 'di', 'de',
  'g', 'kg', 'ml', 'l', 'cl', 'stk', 'stuck', 'x', 'xl', 'xxl', 'pack', 'packung',
  'frisch', 'frische', 'frischer', 'frisches', 'tk', 'tiefgekuhlt', 'extra', 'mini',
  // How it is cut says nothing about what it is.
  'filet', 'filets', 'stucke', 'scheiben', 'wurfel', 'streifen',
]);

/** What follows these is a description, not the food ("… in eigenem Saft"). */
const TAIL_STARTS = new Set(['in', 'im', 'mit', 'ohne', 'aus', 'vom', 'von', 'nach', 'fur', 'zum', 'zur', 'auf']);

/** Same food, different word. Applied to whole words. */
const SYNONYMS: Record<string, string> = {
  paprikaschote: 'paprika',
  paprikaschoten: 'paprika',
  mohre: 'karotte',
  mohren: 'karotte',
  karotten: 'karotte',
  broccoli: 'brokkoli',
  porree: 'lauch',
  yoghurt: 'joghurt',
  jogurt: 'joghurt',
  eier: 'ei',
  gehacktes: 'hackfleisch',
  hack: 'hackfleisch',
  spagetti: 'spaghetti',
};

/**
 * Compounds that end in a food word without being that food. Listed in the
 * folded spelling, singular and plural.
 */
const NOT_THE_HEAD = new Set([
  'kokosmilch', 'buttermilch', 'kondensmilch', 'dickmilch', 'sauermilch', 'milchreis',
  'erdnussbutter', 'mandelbutter', 'kakaobutter', 'nussbutter',
  'susskartoffel', 'susskartoffeln', 'kichererbse', 'kichererbsen',
  'knoblauch', 'schnittlauch', 'barlauch',
  'kartoffelsalat', 'nudelsalat', 'fleischsalat', 'obstsalat', 'krautsalat', 'eiersalat',
  'wurstsalat', 'heringssalat', 'gurkensalat', 'tomatensalat',
  'gewurzgurke', 'gewurzgurken', 'essiggurke', 'essiggurken',
  'muskatnuss', 'kokosnuss', 'alkohol', 'paniermehl',
  'vanillezucker', 'vanillinzucker', 'gelierzucker', 'traubenzucker',
  'rostzwiebel', 'rostzwiebeln', 'meerrettich', 'kokoswasser',
]);

/** Heads short enough to be an accident elsewhere, but safe as a head. */
const SHORT_HEADS = new Set(['ol', 'tee']);

/**
 * An extra word of this kind makes it a different product: "Paprika Chips"
 * is not paprika. Matched as a word or as the end of a compound.
 */
const PRODUCT_WORDS = [
  'chips', 'flips', 'snack', 'sticks', 'riegel', 'bonbon', 'kuchen', 'keks', 'kekse',
  'ketchup', 'sauce', 'suppe', 'bruhe', 'saft', 'sirup', 'nektar', 'schorle', 'limonade',
  'drink', 'shake', 'likor', 'joghurt', 'pudding', 'marmelade', 'konfiture', 'aufstrich',
  'mark', 'essig', 'mehl', 'salat', 'puree', 'kompott', 'marinade', 'pesto', 'aroma',
  'extrakt', 'konzentrat', 'fryer', 'wurzmischung', 'gewurzmischung', 'pads', 'kapseln',
];
/** The same, but too short to look for inside a compound ("Reis" ≠ "Eis"). */
const SHORT_PRODUCT_WORDS = new Set(['eis', 'tee', 'mus', 'mix', 'fix', 'dip', 'ol']);

/**
 * Processed forms. Fresh produce is not its dried, ground or canned form;
 * for anything else ("Curry gemahlen") the form is the normal one.
 */
const FORM_WORDS = new Set([
  'passiert', 'passierte', 'gehackt', 'gehackte', 'geschalt', 'geschalte', 'stuckig', 'stuckige',
  'getrocknet', 'getrocknete', 'gemahlen', 'gerebelt', 'granuliert', 'pulver', 'gewurz',
  'rosenscharf', 'edelsuss', 'gerauchert', 'eingelegt', 'eingelegte', 'gerostet', 'gerostete',
]);

/** Cuts of meat: "Hähnchen" in stock covers "Hähnchenbrust". */
const MEAT_PARTS = [
  'brust', 'schenkel', 'keule', 'flugel', 'schnitzel', 'steak', 'hackfleisch', 'gulasch',
  'geschnetzeltes', 'braten',
];
const LINKERS = ['', 'n', 'en', 'er', 'e', 's'];

const PLURAL_ENDINGS = ['n', 'en', 'e', 's', 'se', 'nen'];

// ----------------------------------------------------------------- parsing

interface Word {
  /** The word without hyphens ("h-milch" -> "hmilch"). */
  full: string;
  /** Last hyphen part – the head of a hyphenated compound ("milch"). */
  head: string;
}

interface Parsed {
  /** The food itself: before any trailing phrase, without brackets. */
  core: Word[];
  /** Core plus what stood in brackets (often an alternative name). */
  all: Word[];
  /** Core words run together, so "Kidney Bohnen" equals "Kidneybohnen". */
  joined: string;
}

function fold(text: string): string {
  return text
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/sosse/g, 'sauce');
}

function canonical(word: string): string {
  let w = SYNONYMS[word] ?? word;
  // "Lachsfilet" is salmon, "Rinderhack" is "Rinderhackfleisch".
  if (w.length > 8 && w.endsWith('filets')) w = w.slice(0, -6);
  else if (w.length > 7 && w.endsWith('filet')) w = w.slice(0, -5);
  if (w.length > 4 && w.endsWith('hack')) w += 'fleisch';
  return w;
}

function toWords(text: string, cutTail: boolean): Word[] {
  const out: Word[] = [];
  const tokens = text.split(/[^a-z0-9-]+/).filter(Boolean);
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!;
    if (cutTail && out.length > 0 && TAIL_STARTS.has(token)) break;
    const parts = token.split('-').filter((p) => /[a-z]/.test(p));
    if (parts.length === 0) continue; // a number, a lone hyphen
    const full = canonical(parts.join(''));
    const head = canonical(parts[parts.length - 1]!);
    if (STOP_WORDS.has(full) || full.length === 0) continue;
    out.push({ full, head });
  }
  return out;
}

const parsedCache = new Map<string, Parsed>();

function parse(name: string): Parsed {
  const cached = parsedCache.get(name);
  if (cached) return cached;

  const bracketed: string[] = [];
  const main = fold(name).replace(/\(([^)]*)\)/g, (_, inner: string) => {
    bracketed.push(inner);
    return ' ';
  });
  let core = toWords(main, true);
  const extra = bracketed.flatMap((b) => toWords(b, false));
  if (core.length === 0) core = extra;
  const parsed: Parsed = {
    core,
    all: [...core, ...extra],
    joined: core.map((w) => w.full).join(''),
  };
  if (parsedCache.size > 5000) parsedCache.clear();
  parsedCache.set(name, parsed);
  return parsed;
}

// ---------------------------------------------------------------- matching

/** Equal, or singular and plural of each other. */
function sameWord(a: string, b: string): boolean {
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  // Too short to tell a plural from another word ("Ei"/"Eis").
  if (short.length < 3) return false;
  return long.startsWith(short) && PLURAL_ENDINGS.includes(long.slice(short.length));
}

/** `need` is the head of the compound `have` ("milch" in "vollmilch"). */
function isHeadOf(need: string, have: string): boolean {
  if (have.length <= need.length) return false;
  if (need.length < 4 && !SHORT_HEADS.has(need)) return false;
  if (NOT_THE_HEAD.has(have)) return false;
  for (let i = 2; i <= have.length - need.length + 1; i++) {
    const tail = have.slice(i);
    if (tail === need || sameWord(tail, need)) return true;
  }
  return false;
}

/** "hahnchen" and "hahnchenbrust": the animal and a cut of it. */
function isCutOf(animal: string, cut: string): boolean {
  if (animal.length < 4 || cut.length <= animal.length || !cut.startsWith(animal)) return false;
  const rest = cut.slice(animal.length);
  return LINKERS.some((l) => rest.startsWith(l) && MEAT_PARTS.includes(rest.slice(l.length)));
}

function wordMatches(need: Word, have: Word): boolean {
  return (
    sameWord(need.full, have.full) ||
    sameWord(need.full, have.head) ||
    isHeadOf(need.full, have.full) ||
    isHeadOf(need.full, have.head) ||
    isCutOf(have.full, need.full)
  );
}

function isProductWord(w: Word): boolean {
  if (SHORT_PRODUCT_WORDS.has(w.full) || SHORT_PRODUCT_WORDS.has(w.head)) return true;
  return PRODUCT_WORDS.some(
    (p) => w.full === p || w.head === p || (w.full.length > p.length + 1 && w.full.endsWith(p)),
  );
}

/** Whether the words of `need` are all found in `have`. */
function covers(need: Parsed, have: Parsed): boolean {
  if (need.core.length === 0) return false;
  if (need.core.every((n) => have.all.some((h) => wordMatches(n, h)))) return true;
  // Written as one word here, as two there.
  return need.joined.length >= 4 && sameWord(need.joined, have.joined);
}

/**
 * `have` covers `need`, but says more: does one of its extra words make it
 * a different product?
 */
function isOtherProduct(need: Parsed, have: Parsed, needIsProduce: boolean): boolean {
  return have.all.some((h) => {
    const extra = !need.core.some((n) => wordMatches(n, h) || wordMatches(h, n));
    if (!extra) return false;
    return isProductWord(h) || (needIsProduce && (FORM_WORDS.has(h.full) || FORM_WORDS.has(h.head)));
  });
}

const categoryCache = new Map<string, FoodCategory | null>();

function categoryOf(name: string): FoodCategory | null {
  let c = categoryCache.get(name);
  if (c === undefined) {
    c = classifyByName(name);
    if (categoryCache.size > 5000) categoryCache.clear();
    categoryCache.set(name, c);
  }
  return c;
}

function isProduce(name: string): boolean {
  const c = categoryOf(name);
  return c === 'fruit' || c === 'vegetables';
}

/** One name's words are all in the other, and nothing turns it into something else. */
function contained(need: Parsed, needName: string, have: Parsed): boolean {
  return covers(need, have) && !isOtherProduct(need, have, isProduce(needName));
}

/**
 * Two free-text names mean the same food: "Reis" and "Reis Langkorn
 * Parboiled", "Fettarme H-Milch 1,5 %" and "Milch". Order does not matter.
 */
export function namesMatch(a: string, b: string): boolean {
  const pa = parse(a);
  const pb = parse(b);
  if (pa.core.length === 0 || pb.core.length === 0) return false;
  if (pa.joined === pb.joined) return true;
  return contained(pa, a, pb) || contained(pb, b, pa);
}

/** Something with a name and, where known, a category. */
export interface NamedFood {
  name: string;
  category?: FoodCategory;
}

/**
 * Is this stock item or shopping entry what the ingredient asks for? Like
 * {@link namesMatch}, plus what the item's category rules out: a drink or a
 * snack carrying a fruit's name is not the fruit ("Pink Grapefruit" soda),
 * and fresh produce is not found in the dairy or meat section.
 */
export function isSameFood(item: NamedFood, ingredient: string): boolean {
  if (!namesMatch(item.name, ingredient)) return false;
  const category = item.category;
  if (!category || category === 'other') return true;
  // The very same name needs no second opinion.
  if (parse(item.name).joined === parse(ingredient).joined) return true;

  const wanted = categoryOf(ingredient);
  if (wanted === null) return true;
  if (wanted === 'fruit' || wanted === 'vegetables') {
    return category === 'fruit' || category === 'vegetables' || category === 'canned';
  }
  if (category === 'snacks' || category === 'drinks') return wanted === category;
  return true;
}

/**
 * Looser than a match: the two names have a food word in common. For
 * suggesting which shopping entry a scanned product belongs to – the user
 * confirms it, so a near miss is better than no suggestion.
 */
export function sharesFoodWord(a: string, b: string): boolean {
  const pa = parse(a);
  const pb = parse(b);
  const significant = (w: Word) => w.full.length >= 4 && !isProductWord(w) && !FORM_WORDS.has(w.full);
  return pa.core
    .filter(significant)
    .some((x) => pb.core.filter(significant).some((y) => wordMatches(x, y) || wordMatches(y, x)));
}
