import { describe, expect, it } from 'vitest';
import type { FoodCategory } from './categories';
import { isSameFood, namesMatch, sharesFoodWord } from './match';

type Case = [stock: string, ingredient: string];

/** Stock name (as it comes from a barcode or was typed) vs. ingredient. */
const SAME: Case[] = [
  // Real product names from the app against the starter recipes.
  ['Blüten Honig', 'Honig'],
  ['Farfalle Rigate Nr 66 (Nudeln)', 'Farfalle'],
  ['Weizen Tortillas Mit Leinsamen', 'Tortillas'],
  ['Weizen Tortillas Mit Leinsamen', 'Weizen Tortillas'],
  ['Fisch Thunfisch Filets in eigenem Saft', 'Thunfisch'],
  ['Backofen Wellenschnitt Pommes', 'Pommes'],
  ['Backofen Wellenschnitt Pommes', 'Wellenschnitt Pommes'],
  ['Gemüse - Mais Super-Sweet Gemüsemais', 'Mais (Dose)'],
  ['Bio Haferflocken zart', 'Haferflocken'],
  ['Reis Langkorn Parboiled', 'Reis'],
  ['kurze Rigatoni', 'Rigatoni'],
  ['linguine 6', 'Linguine'],
  ['Geriebener Emmentaler', 'Emmentaler'],
  ['Hartkäse', 'Hartkäse (Parmesan)'],
  ['Parmesan', 'Hartkäse (Parmesan)'],
  ['Knuspermüsli', 'Knuspermüsli'],
  ['Alpenjodsalz Jod, Flourid, Folsäure', 'Salz'],
  ['Grober Pfeffer,bunt', 'Pfeffer'],
  ['Gewürz Curry (gemahlen)', 'Curry'],
  ['Mini Wiener Würstchen', 'Würstchen'],
  ['Quark 40%', 'Quark'],
  ['Quark 40%', 'Magerquark'],
  // Plural, spelling, word order.
  ['Eier', 'Eier'],
  ['Eier', 'Ei'],
  ['Ei', 'Eier'],
  ['Banane', 'Bananen'],
  ['Bananen', 'Banane'],
  ['Zwiebeln', 'Zwiebel'],
  ['Rote Zwiebeln', 'Zwiebel'],
  ['Tomaten', 'Tomate'],
  ['Kartoffeln festkochend', 'Kartoffeln'],
  ['Linsen rot', 'Rote Linsen'],
  ['Tomaten gehackt', 'Gehackte Tomaten'],
  ['Tomaten passiert', 'Passierte Tomaten'],
  ['Kidney Bohnen', 'Kidneybohnen'],
  ['Kidney-Bohnen', 'Kidneybohnen'],
  ['Soja Sauce', 'Sojasauce'],
  ['Sojasoße', 'Sojasauce'],
  ['Möhren', 'Karotten'],
  ['Paprika rot', 'Paprikaschote'],
  ['Paprika', 'Paprikaschote'],
  ['Skyr natur', 'Skyr'],
  ['Skyr', 'Skyr natur'],
  // Compounds: the head decides.
  ['Vollmilch 3,5 %', 'Milch'],
  ['Fettarme H-Milch 1,5 %', 'Milch'],
  ['Weidevollmilch', 'Milch'],
  ['Hafermilch', 'Milch'],
  ['Rapsöl', 'Öl'],
  ['Olivenöl nativ extra', 'Olivenöl'],
  ['Olivenöl nativ extra', 'Öl'],
  ['Basmatireis', 'Reis'],
  ['Reis', 'Basmatireis'],
  ['Magerquark', 'Quark'],
  ['Deutsche Markenbutter', 'Butter'],
  ['Cherrytomaten', 'Tomate'],
  ['Frühlingszwiebeln', 'Zwiebel'],
  ['Salatgurke', 'Gurke'],
  ['Schlagsahne', 'Sahne'],
  ['Sahne', 'Kochsahne'],
  ['Brot', 'Vollkornbrot'],
  ['Spinat', 'Blattspinat (TK)'],
  ['TK Blattspinat', 'Blattspinat (TK)'],
  ['Erbsen fein', 'Erbsen (TK)'],
  ['Kakao', 'Backkakao'],
  ['Zucker', 'Puderzucker'],
  // Meat and fish: cut and form.
  ['Hähnchenbrustfilet', 'Hähnchenbrustfilet'],
  ['Hähnchenbrust', 'Hähnchenbrustfilet'],
  ['Hähnchen Brustfilet', 'Hähnchenbrustfilet'],
  ['Hähnchen', 'Hähnchenbrustfilet'],
  ['Putenbrust', 'Putenbrustfilet'],
  ['Lachs', 'Lachsfilet'],
  ['Lachsfilet', 'Lachs'],
  ['TK Garnelen geschält', 'Garnelen'],
  ['Rinderhack', 'Rinderhackfleisch'],
  ['Rinderhackfleisch', 'Hackfleisch'],
  ['Hackfleisch gemischt', 'Hackfleisch'],
  ['Hackfleisch', 'Rinderhackfleisch'],
];

const DIFFERENT: Case[] = [
  // The ingredient is only the first part of a compound.
  ['fix Tomatensoße', 'Tomate'],
  ['Tomaten-Ketchup', 'Tomate'],
  ['Tomatenmark', 'Tomaten'],
  ['Milchreis', 'Milch'],
  ['Reiswaffeln', 'Reis'],
  ['Eiernudeln', 'Eier'],
  ['Senseo Mild Kaffeepads XXL-Pack', 'Kaffee'],
  ['Zucker', 'Zuckerschoten'],
  // Too short to be told apart by an ending.
  ['Eis', 'Ei'],
  ['Eis', 'Eier'],
  ['Speiseeis', 'Eier'],
  ['Vanilleeis', 'Ei'],
  ['Kartoffelbrei', 'Ei'],
  // Same head, different product.
  ['Kokosmilch', 'Milch'],
  ['Milch', 'Kokosmilch'],
  ['Milchreis', 'Reis'],
  ['Erdnussbutter', 'Butter'],
  ['Butter', 'Erdnussbutter'],
  ['Süßkartoffeln', 'Kartoffeln'],
  ['Kartoffeln', 'Süßkartoffeln'],
  ['Kichererbsen', 'Erbsen (TK)'],
  ['Erbsen', 'Kichererbsen'],
  ['Knoblauch - granuliert', 'Lauch'],
  ['Vanillezucker', 'Zucker'],
  ['Paniermehl', 'Mehl'],
  // An extra word makes it another product.
  ['Paprika Geriffelte Chips', 'Paprika'],
  ['Paprika Geriffelte Chips', 'Paprikaschote'],
  ['Erdnuss Flips', 'Erdnüsse'],
  ['Beer Style Erdnuss Mix', 'Erdnüsse'],
  ['Rote Bete Saft', 'Rote Bete'],
  ['Snuggles - Knuspriger Maissnack', 'Mais (Dose)'],
  ['Mozzarella-Sticks', 'Mozzarella'],
  ['Süß-Sauer-Sauce - Extra Gemüse', 'Gemüse'],
  ['Air Fryer Paprika Knoblauch Knusper Hähnchen', 'Paprikaschote'],
  ['Air Fryer Paprika Knoblauch Knusper Hähnchen', 'Knoblauch'],
  ['Air Fryer Paprika Knoblauch Knusper Hähnchen', 'Hähnchenbrustfilet'],
  ['Air Fryer Paprika Knoblauch Knusper Hähnchen', 'Hähnchen'],
  // Fresh produce is not its processed form.
  ['Tomaten passiert', 'Tomate'],
  ['Tomaten passiert', 'Gehackte Tomaten'],
  ['Tomaten', 'Gehackte Tomaten'],
  ['Paprika Rosenscharf', 'Paprika'],
  ['Paprika Rosenscharf', 'Paprikaschote'],
  ['Knoblauch - granuliert', 'Knoblauch'],
  // Simply something else.
  ['Kerrygold extra gesalzen', 'Butter'],
  ['Latte Macchiato XXL', 'Milch'],
  ['Weizen Tortillas Mit Leinsamen', 'Leinsamen'],
  ['Vollkorntoast', 'Vollkornbrot'],
  ['Quark 40%', 'Skyr'],
  ['Choco Chips', 'Schokolade'],
  ['Fruit Rings', 'Obst'],
];

describe('namesMatch', () => {
  it.each(SAME)('%s  =  %s', (stock, ingredient) => {
    expect(namesMatch(stock, ingredient)).toBe(true);
  });

  it.each(DIFFERENT)('%s  ≠  %s', (stock, ingredient) => {
    expect(namesMatch(stock, ingredient)).toBe(false);
  });

  it('is symmetric', () => {
    for (const [a, b] of [...SAME, ...DIFFERENT]) {
      expect(namesMatch(b, a)).toBe(namesMatch(a, b));
    }
  });

  it('never matches an empty name', () => {
    expect(namesMatch('', 'Milch')).toBe(false);
    expect(namesMatch('Milch', '   ')).toBe(false);
    expect(namesMatch('123', '456')).toBe(false);
  });
});

describe('isSameFood', () => {
  const item = (name: string, category?: FoodCategory) => ({ name, category });

  it('uses the category against look-alikes', () => {
    // A soda and a yoghurt drink named after a fruit.
    expect(isSameFood(item('Pink Grapefruit', 'drinks'), 'Grapefruit')).toBe(false);
    expect(isSameFood(item('Danone Actimel® ERDBEERE 8X100G', 'dairy'), 'Erdbeeren')).toBe(false);
    expect(isSameFood(item('Bananen Chips', 'snacks'), 'Banane')).toBe(false);
  });

  it('does not let a category stand in the way of a real match', () => {
    expect(isSameFood(item('Banane', 'fruit'), 'Banane')).toBe(true);
    expect(isSameFood(item('Gemüse - Mais Super-Sweet Gemüsemais', 'canned'), 'Mais (Dose)')).toBe(true);
    expect(isSameFood(item('Erbsen', 'canned'), 'Erbsen (TK)')).toBe(true);
    // Sorted under snacks by the user – still the fries the recipe wants.
    expect(isSameFood(item('Backofen Wellenschnitt Pommes', 'snacks'), 'Pommes')).toBe(true);
    // Same name: the category is not consulted.
    expect(isSameFood(item('Knuspermüsli', 'snacks'), 'Knuspermüsli')).toBe(true);
    expect(isSameFood(item('Orangensaft', 'drinks'), 'Orangensaft')).toBe(true);
    // Unknown or "other" category: names decide.
    expect(isSameFood(item('Zwiebeln'), 'Zwiebel')).toBe(true);
    expect(isSameFood(item('Zwiebeln', 'other'), 'Zwiebel')).toBe(true);
  });

  it('keeps the name rules', () => {
    expect(isSameFood(item('Tomaten-Ketchup', 'condiments'), 'Tomate')).toBe(false);
    expect(isSameFood(item('Kokosmilch', 'canned'), 'Milch')).toBe(false);
  });
});

describe('sharesFoodWord', () => {
  it('finds a common food word', () => {
    expect(sharesFoodWord('Haferflocken kernig', 'Bio Haferflocken zart')).toBe(true);
    expect(sharesFoodWord('Fettarme H-Milch 1,5 %', 'Milch 1,5 %')).toBe(true);
    expect(sharesFoodWord('Rinderhackfleisch', 'Hackfleisch')).toBe(true);
  });

  it('ignores words that say nothing about the food', () => {
    expect(sharesFoodWord('Bio Haferflocken', 'Bio Vollmilch')).toBe(false);
    expect(sharesFoodWord('Paprika Chips', 'Kartoffel Chips')).toBe(false);
    expect(sharesFoodWord('Zwiebeln', 'Tomaten')).toBe(false);
  });
});
