import { db, cloudEnabled } from './database';
import { caughtUpWithAccount } from './cloudState';
import type { OwnRecipe } from './types';

/**
 * Starter collection of protein-rich everyday recipes with ingredients from
 * the supermarket. Added once, see ensureRecipePack(); from then on they are
 * ordinary own recipes the user can edit or delete.
 *
 * Nutrition per serving is computed from the listed amounts with typical
 * per-100 g values (salt, pepper and dried spices are left out). Ingredient
 * names are chosen for the loose stock matching: "Paprikaschote" instead of
 * "Paprika" so paprika powder or crisps don't count as the vegetable.
 *
 * Ids are private ("#…"): Dexie Cloud scopes them to the logged-in user, so
 * two devices adding the pack end up with the same records, not duplicates.
 */
const PACK_FLAG = 'recipePack:v1';

export const RECIPE_PACK: OwnRecipe[] = [
  {
    id: '#rcp-ruehrei-wrap',
    title: 'Rührei-Wrap mit Käse',
    servings: 1,
    minutes: 10,
    tags: ['Frühstück', 'schnell'],
    nutritionPerServing: { kcal: 570, protein: 34, carbs: 32, fat: 33 },
    ingredients: [
      { name: 'Eier', amount: 3, unit: 'pcs' },
      { name: 'Tortillas', amount: 60, unit: 'g' },
      { name: 'Gouda', amount: 30, unit: 'g' },
      { name: 'Butter', amount: 5, unit: 'g' },
    ],
    steps: [
      'Eier mit Salz und Pfeffer verquirlen.',
      'Butter in einer Pfanne schmelzen, die Eier bei mittlerer Hitze unter Rühren stocken lassen.',
      '1 Tortilla kurz ohne Fett in der Pfanne erwärmen, Rührei und Gouda darauf verteilen und einrollen.',
    ],
  },
  {
    id: '#rcp-overnight-oats',
    title: 'Overnight Oats mit Skyr und Erdnussbutter',
    servings: 1,
    minutes: 5,
    tags: ['Frühstück', 'Meal Prep', 'vegetarisch'],
    nutritionPerServing: { kcal: 690, protein: 37, carbs: 90, fat: 18 },
    ingredients: [
      { name: 'Haferflocken', amount: 70, unit: 'g' },
      { name: 'Milch', amount: 150, unit: 'ml' },
      { name: 'Skyr', amount: 150, unit: 'g' },
      { name: 'Erdnussbutter', amount: 20, unit: 'g' },
      { name: 'Banane', amount: 1, unit: 'pcs' },
      { name: 'Honig', amount: 10, unit: 'g' },
    ],
    steps: [
      'Haferflocken, Milch und Skyr in einem Glas verrühren.',
      'Abgedeckt über Nacht (mindestens 4 Stunden) in den Kühlschrank stellen.',
      'Morgens die Banane in Scheiben schneiden und mit Erdnussbutter und Honig darauf geben.',
    ],
  },
  {
    id: '#rcp-quark-pancakes',
    title: 'Quark-Haferflocken-Pancakes',
    servings: 1,
    minutes: 20,
    tags: ['Frühstück', 'vegetarisch'],
    nutritionPerServing: { kcal: 775, protein: 54, carbs: 86, fat: 21 },
    ingredients: [
      { name: 'Haferflocken', amount: 60, unit: 'g' },
      { name: 'Magerquark', amount: 250, unit: 'g' },
      { name: 'Eier', amount: 2, unit: 'pcs' },
      { name: 'Banane', amount: 1, unit: 'pcs' },
      { name: 'Rapsöl', amount: 5, unit: 'ml' },
      { name: 'Beerenmischung (TK)', amount: 100, unit: 'g' },
      { name: 'Honig', amount: 10, unit: 'g' },
    ],
    steps: [
      'Haferflocken, Quark, Eier und eine halbe Banane mit Gabel oder Pürierstab zu einem dicken Teig verarbeiten und 5 Min. quellen lassen.',
      'Eine Pfanne mit wenig Öl erhitzen, pro Pancake 2 EL Teig hineingeben und bei mittlerer Hitze je Seite 2–3 Min. backen.',
      'Beeren in der Mikrowelle oder einem kleinen Topf antauen.',
      'Pancakes mit Beeren, der restlichen Banane und Honig servieren.',
    ],
  },
  {
    id: '#rcp-skyr-bowl-muesli',
    title: 'Skyr-Bowl mit Knuspermüsli und Beeren',
    servings: 1,
    minutes: 5,
    tags: ['Frühstück', 'schnell', 'vegetarisch'],
    nutritionPerServing: { kcal: 490, protein: 35, carbs: 64, fat: 9 },
    ingredients: [
      { name: 'Skyr', amount: 250, unit: 'g' },
      { name: 'Knuspermüsli', amount: 60, unit: 'g' },
      { name: 'Beerenmischung (TK)', amount: 100, unit: 'g' },
      { name: 'Honig', amount: 10, unit: 'g' },
    ],
    steps: [
      'Beeren am Vorabend in den Kühlschrank stellen oder kurz in der Mikrowelle antauen.',
      'Skyr mit Honig glatt rühren.',
      'Beeren und Müsli darauf geben – das Müsli erst kurz vor dem Essen, dann bleibt es knusprig.',
    ],
  },
  {
    id: '#rcp-omelett-schinken',
    title: 'Omelett mit Schinken, Käse und Paprika',
    servings: 1,
    minutes: 15,
    tags: ['Frühstück'],
    nutritionPerServing: { kcal: 680, protein: 46, carbs: 44, fat: 32 },
    ingredients: [
      { name: 'Eier', amount: 3, unit: 'pcs' },
      { name: 'Kochschinken', amount: 50, unit: 'g' },
      { name: 'Gouda', amount: 30, unit: 'g' },
      { name: 'Paprikaschote', amount: 0.5, unit: 'pcs' },
      { name: 'Butter', amount: 5, unit: 'g' },
      { name: 'Vollkornbrot', amount: 100, unit: 'g' },
    ],
    steps: [
      'Paprika und Schinken klein würfeln, Eier mit Salz und Pfeffer verquirlen.',
      'Paprika in der Butter 2 Min. anbraten, Schinken dazugeben und die Eier darüber gießen.',
      'Bei mittlerer Hitze stocken lassen, Gouda darüber streuen und das Omelett zusammenklappen.',
      'Mit 2 Scheiben Vollkornbrot servieren.',
    ],
  },
  {
    id: '#rcp-chili-con-carne',
    title: 'Chili con Carne mit Reis',
    servings: 4,
    minutes: 40,
    tags: ['Meal Prep', 'günstig'],
    nutritionPerServing: { kcal: 650, protein: 35, carbs: 70, fat: 24 },
    ingredients: [
      { name: 'Rinderhackfleisch', amount: 500, unit: 'g' },
      { name: 'Kidneybohnen', amount: 400, unit: 'g' },
      { name: 'Mais (Dose)', amount: 1, unit: 'pcs' },
      { name: 'Gehackte Tomaten', amount: 400, unit: 'g' },
      { name: 'Paprikaschote', amount: 1, unit: 'pcs' },
      { name: 'Zwiebel', amount: 1, unit: 'pcs' },
      { name: 'Rapsöl', amount: 10, unit: 'ml' },
      { name: 'Reis', amount: 250, unit: 'g' },
    ],
    steps: [
      'Zwiebel und Paprika würfeln. Reis nach Packungsanweisung kochen.',
      'Hackfleisch im Öl krümelig braten, Zwiebel und Paprika 3 Min. mitbraten.',
      'Mit 1 TL Paprikapulver, ½ TL Knoblauch, Salz, Pfeffer und nach Geschmack Chili würzen.',
      'Tomaten, abgetropfte Bohnen und Mais dazugeben und 20 Min. offen köcheln lassen.',
      'Mit Reis servieren. Hält sich im Kühlschrank 3 Tage.',
    ],
  },
  {
    id: '#rcp-haehnchen-curry',
    title: 'Hähnchen-Curry mit Erbsen und Reis',
    servings: 2,
    minutes: 30,
    tags: [],
    nutritionPerServing: { kcal: 760, protein: 58, carbs: 71, fat: 26 },
    ingredients: [
      { name: 'Hähnchenbrustfilet', amount: 400, unit: 'g' },
      { name: 'Kokosmilch', amount: 200, unit: 'ml' },
      { name: 'Erbsen (TK)', amount: 150, unit: 'g' },
      { name: 'Zwiebel', amount: 1, unit: 'pcs' },
      { name: 'Rapsöl', amount: 10, unit: 'ml' },
      { name: 'Reis', amount: 150, unit: 'g' },
    ],
    steps: [
      'Reis nach Packungsanweisung kochen.',
      'Hähnchen in Würfel, Zwiebel in Streifen schneiden.',
      'Hähnchen im Öl rundum anbraten, Zwiebel dazugeben und 2 TL Currypulver kurz mitrösten.',
      'Kokosmilch und Erbsen einrühren, 10 Min. köcheln lassen und mit Salz abschmecken.',
      'Mit Reis servieren.',
    ],
  },
  {
    id: '#rcp-lachs-spinat-pasta',
    title: 'Lachs-Spinat-Pasta',
    servings: 2,
    minutes: 25,
    tags: ['Fisch'],
    nutritionPerServing: { kcal: 830, protein: 47, carbs: 76, fat: 36 },
    ingredients: [
      { name: 'Linguine', amount: 200, unit: 'g' },
      { name: 'Lachsfilet', amount: 250, unit: 'g' },
      { name: 'Blattspinat (TK)', amount: 200, unit: 'g' },
      { name: 'Kochsahne', amount: 200, unit: 'ml' },
      { name: 'Hartkäse (Parmesan)', amount: 20, unit: 'g' },
    ],
    steps: [
      'Lachs auftauen lassen (am besten über Nacht im Kühlschrank) und in Würfel schneiden.',
      'Linguine in Salzwasser bissfest kochen.',
      'Spinat in einer Pfanne auftauen, Sahne dazugeben und mit Salz, Pfeffer und ½ TL Knoblauch würzen.',
      'Lachswürfel in die Soße geben und 5 Min. gar ziehen lassen.',
      'Nudeln untermischen und mit geriebenem Käse servieren.',
    ],
  },
  {
    id: '#rcp-thunfisch-tomaten-pasta',
    title: 'Thunfisch-Tomaten-Pasta',
    servings: 2,
    minutes: 20,
    tags: ['schnell', 'günstig', 'Fisch'],
    nutritionPerServing: { kcal: 670, protein: 43, carbs: 97, fat: 11 },
    ingredients: [
      { name: 'Farfalle', amount: 250, unit: 'g' },
      { name: 'Thunfisch', amount: 195, unit: 'g' },
      { name: 'Gehackte Tomaten', amount: 400, unit: 'g' },
      { name: 'Zwiebel', amount: 1, unit: 'pcs' },
      { name: 'Olivenöl', amount: 10, unit: 'ml' },
      { name: 'Hartkäse (Parmesan)', amount: 20, unit: 'g' },
    ],
    steps: [
      'Farfalle in Salzwasser bissfest kochen.',
      'Zwiebel würfeln und im Öl glasig dünsten.',
      'Tomaten dazugeben, mit Oregano, Basilikum, Salz und Pfeffer würzen und 10 Min. köcheln lassen.',
      'Thunfisch abtropfen lassen, zerpflücken und nur kurz in der Soße erwärmen.',
      'Mit den Nudeln mischen und mit Käse bestreuen.',
    ],
  },
  {
    id: '#rcp-gyros-tzatziki',
    title: 'Hähnchen-Gyros mit Tzatziki und Reis',
    servings: 2,
    minutes: 30,
    tags: [],
    nutritionPerServing: { kcal: 645, protein: 68, carbs: 68, fat: 10 },
    ingredients: [
      { name: 'Hähnchenbrustfilet', amount: 400, unit: 'g' },
      { name: 'Zwiebel', amount: 1, unit: 'pcs' },
      { name: 'Rapsöl', amount: 15, unit: 'ml' },
      { name: 'Reis', amount: 150, unit: 'g' },
      { name: 'Magerquark', amount: 250, unit: 'g' },
      { name: 'Gurke', amount: 0.5, unit: 'pcs' },
    ],
    steps: [
      'Reis nach Packungsanweisung kochen.',
      'Hähnchen in dünne Streifen schneiden und mit Öl, 2 TL Paprikapulver, 1 TL Oregano, ½ TL Knoblauch, Salz und Pfeffer mischen.',
      'Für das Tzatziki die Gurke grob raspeln, gut ausdrücken und mit Quark, etwas Knoblauch und Salz verrühren.',
      'Zwiebel in Ringe schneiden. Fleisch in einer heißen Pfanne 6–8 Min. scharf anbraten, die Zwiebel die letzten 2 Min. mitbraten.',
      'Mit Reis und Tzatziki servieren.',
    ],
  },
  {
    id: '#rcp-puten-geschnetzeltes',
    title: 'Putengeschnetzeltes mit Champignons und Rigatoni',
    servings: 2,
    minutes: 25,
    tags: [],
    nutritionPerServing: { kcal: 810, protein: 68, carbs: 77, fat: 23 },
    ingredients: [
      { name: 'Putenbrustfilet', amount: 400, unit: 'g' },
      { name: 'Champignons', amount: 250, unit: 'g' },
      { name: 'Zwiebel', amount: 1, unit: 'pcs' },
      { name: 'Kochsahne', amount: 200, unit: 'ml' },
      { name: 'Rigatoni', amount: 200, unit: 'g' },
      { name: 'Rapsöl', amount: 10, unit: 'ml' },
    ],
    steps: [
      'Rigatoni in Salzwasser bissfest kochen.',
      'Pute in Streifen, Champignons in Scheiben, Zwiebel in Würfel schneiden.',
      'Fleisch im Öl portionsweise scharf anbraten und herausnehmen.',
      'Champignons und Zwiebel im Bratfett 5 Min. braten, mit Sahne ablöschen und 3 Min. köcheln lassen.',
      'Fleisch zurück in die Pfanne geben, mit Salz, Pfeffer und Paprikapulver abschmecken und mit den Nudeln servieren.',
    ],
  },
  {
    id: '#rcp-gefuellte-paprika',
    title: 'Gefüllte Paprika mit Hackfleisch und Reis',
    servings: 2,
    minutes: 55,
    tags: ['Ofen'],
    nutritionPerServing: { kcal: 715, protein: 44, carbs: 60, fat: 33 },
    ingredients: [
      { name: 'Paprikaschote', amount: 4, unit: 'pcs' },
      { name: 'Rinderhackfleisch', amount: 300, unit: 'g' },
      { name: 'Reis', amount: 80, unit: 'g' },
      { name: 'Gehackte Tomaten', amount: 400, unit: 'g' },
      { name: 'Zwiebel', amount: 1, unit: 'pcs' },
      { name: 'Gouda', amount: 50, unit: 'g' },
    ],
    steps: [
      'Reis 10 Min. vorkochen – er gart im Ofen fertig. Ofen auf 200 °C (Umluft 180 °C) vorheizen.',
      'Zwiebel würfeln und mit Hackfleisch, Reis, Salz, Pfeffer und Paprikapulver vermengen.',
      'Von den Paprika einen Deckel abschneiden, die Kerne entfernen und die Schoten mit der Masse füllen.',
      'Tomaten in eine Auflaufform geben, würzen, die Paprika hineinsetzen und die Deckel auflegen.',
      '35 Min. backen, Deckel abnehmen, Gouda darüber streuen und weitere 10 Min. überbacken.',
    ],
  },
  {
    id: '#rcp-lachs-suesskartoffel-blech',
    title: 'Ofenlachs mit Süßkartoffeln, Brokkoli und Kräuterquark',
    servings: 2,
    minutes: 40,
    tags: ['Ofen', 'Air Fryer', 'Fisch'],
    nutritionPerServing: { kcal: 670, protein: 50, carbs: 63, fat: 24 },
    ingredients: [
      { name: 'Lachsfilet', amount: 250, unit: 'g' },
      { name: 'Süßkartoffeln', amount: 500, unit: 'g' },
      { name: 'Brokkoli', amount: 400, unit: 'g' },
      { name: 'Olivenöl', amount: 15, unit: 'ml' },
      { name: 'Magerquark', amount: 250, unit: 'g' },
    ],
    steps: [
      'Ofen auf 200 °C (Umluft 180 °C) vorheizen. Süßkartoffeln in Spalten schneiden, mit der Hälfte des Öls, Salz und Paprikapulver mischen und 15 Min. backen.',
      'Brokkoli in Röschen teilen und mit dem restlichen Öl und etwas Salz mischen.',
      'Brokkoli und Lachs mit aufs Blech legen und alles weitere 15 Min. backen.',
      'Quark mit Kräutern (z. B. Basilikum), Salz, Pfeffer und etwas Wasser glatt rühren und dazu servieren.',
      'Im Air Fryer: Süßkartoffeln 12 Min. bei 200 °C, dann Lachs und Brokkoli dazugeben und weitere 10 Min. garen.',
    ],
  },
  {
    id: '#rcp-haehnchen-quesadillas',
    title: 'Hähnchen-Quesadillas mit Mais und Paprika',
    servings: 2,
    minutes: 25,
    tags: [],
    nutritionPerServing: { kcal: 845, protein: 62, carbs: 79, fat: 30 },
    ingredients: [
      { name: 'Tortillas', amount: 250, unit: 'g' },
      { name: 'Hähnchenbrustfilet', amount: 300, unit: 'g' },
      { name: 'Mais (Dose)', amount: 1, unit: 'pcs' },
      { name: 'Paprikaschote', amount: 1, unit: 'pcs' },
      { name: 'Gouda', amount: 100, unit: 'g' },
      { name: 'Rapsöl', amount: 10, unit: 'ml' },
    ],
    steps: [
      'Hähnchen in kleine Würfel schneiden, im Öl 6–8 Min. braten und mit Paprikapulver, Salz und Pfeffer würzen.',
      'Paprika fein würfeln, Mais abtropfen lassen und beides mit dem Hähnchen mischen.',
      'Auf je eine Hälfte von 4 Tortillas Käse und Füllung geben und zuklappen.',
      'In einer Pfanne ohne Fett je Seite 2–3 Min. knusprig braten, bis der Käse geschmolzen ist.',
    ],
  },
  {
    id: '#rcp-linsen-dal',
    title: 'Rote-Linsen-Dal mit Reis und Skyr',
    servings: 2,
    minutes: 30,
    tags: ['vegetarisch', 'günstig'],
    nutritionPerServing: { kcal: 870, protein: 42, carbs: 110, fat: 25 },
    ingredients: [
      { name: 'Rote Linsen', amount: 200, unit: 'g' },
      { name: 'Gehackte Tomaten', amount: 400, unit: 'g' },
      { name: 'Kokosmilch', amount: 200, unit: 'ml' },
      { name: 'Zwiebel', amount: 1, unit: 'pcs' },
      { name: 'Rapsöl', amount: 10, unit: 'ml' },
      { name: 'Reis', amount: 120, unit: 'g' },
      { name: 'Skyr', amount: 150, unit: 'g' },
    ],
    steps: [
      'Reis nach Packungsanweisung kochen.',
      'Zwiebel würfeln, im Öl glasig dünsten und 2 TL Currypulver kurz mitrösten.',
      'Linsen abspülen und mit Tomaten, Kokosmilch und 300 ml Wasser dazugeben.',
      '15–20 Min. sanft köcheln lassen, bis die Linsen zerfallen, dabei gelegentlich umrühren. Mit Salz abschmecken.',
      'Mit Reis und einem Klecks Skyr servieren.',
    ],
  },
  {
    id: '#rcp-halloumi-ofengemuese',
    title: 'Halloumi-Ofengemüse mit Kichererbsen und Couscous',
    servings: 2,
    minutes: 35,
    tags: ['vegetarisch', 'Ofen'],
    nutritionPerServing: { kcal: 925, protein: 47, carbs: 78, fat: 45 },
    ingredients: [
      { name: 'Halloumi', amount: 250, unit: 'g' },
      { name: 'Kichererbsen', amount: 400, unit: 'g' },
      { name: 'Zucchini', amount: 1, unit: 'pcs' },
      { name: 'Paprikaschote', amount: 2, unit: 'pcs' },
      { name: 'Zwiebel', amount: 1, unit: 'pcs' },
      { name: 'Olivenöl', amount: 20, unit: 'ml' },
      { name: 'Couscous', amount: 120, unit: 'g' },
    ],
    steps: [
      'Ofen auf 220 °C (Umluft 200 °C) vorheizen.',
      'Zucchini, Paprika und Zwiebel in mundgerechte Stücke schneiden, Kichererbsen abspülen und abtropfen lassen.',
      'Alles mit Öl, Salz, Paprikapulver und Oregano mischen und auf einem Blech 20 Min. rösten.',
      'Halloumi in Scheiben schneiden, aufs Blech legen und weitere 10 Min. backen.',
      'Couscous mit 150 ml kochendem Salzwasser übergießen, 5 Min. quellen lassen, auflockern und dazu servieren. Wer mag, gibt etwas Balsamico-Creme darüber.',
    ],
  },
  {
    id: '#rcp-eierreis-haehnchen',
    title: 'Gebratener Eierreis mit Hähnchen und Erbsen',
    servings: 2,
    minutes: 25,
    tags: ['Resteessen'],
    nutritionPerServing: { kcal: 670, protein: 56, carbs: 67, fat: 18 },
    ingredients: [
      { name: 'Reis', amount: 150, unit: 'g' },
      { name: 'Hähnchenbrustfilet', amount: 300, unit: 'g' },
      { name: 'Eier', amount: 3, unit: 'pcs' },
      { name: 'Erbsen (TK)', amount: 150, unit: 'g' },
      { name: 'Sojasauce', amount: 30, unit: 'ml' },
      { name: 'Rapsöl', amount: 15, unit: 'ml' },
    ],
    steps: [
      'Reis kochen und abkühlen lassen – am besten schon am Vortag, dann wird er beim Braten nicht matschig.',
      'Hähnchen in kleine Würfel schneiden, in der Hälfte des Öls 5 Min. scharf anbraten und herausnehmen.',
      'Restliches Öl erhitzen, Reis und Erbsen darin 5 Min. braten.',
      'Reis zur Seite schieben, die Eier in die Pfanne schlagen, verrühren und stocken lassen, dann alles vermischen.',
      'Hähnchen und Sojasauce dazugeben und kurz durchschwenken. Nach Geschmack mit Frühlingszwiebeln bestreuen.',
    ],
  },
  {
    id: '#rcp-garnelen-linguine',
    title: 'Knoblauch-Garnelen-Linguine mit Cherrytomaten',
    servings: 2,
    minutes: 20,
    tags: ['schnell', 'Fisch'],
    nutritionPerServing: { kcal: 615, protein: 43, carbs: 74, fat: 15 },
    ingredients: [
      { name: 'Linguine', amount: 200, unit: 'g' },
      { name: 'Garnelen', amount: 300, unit: 'g' },
      { name: 'Cherrytomaten', amount: 250, unit: 'g' },
      { name: 'Olivenöl', amount: 20, unit: 'ml' },
      { name: 'Hartkäse (Parmesan)', amount: 20, unit: 'g' },
    ],
    steps: [
      'Garnelen auftauen lassen und trocken tupfen. Linguine in Salzwasser bissfest kochen und eine Tasse Nudelwasser aufheben.',
      'Öl erhitzen und 1 TL Knoblauch (oder 2 gehackte Zehen) und nach Geschmack Chiliflocken kurz anschwitzen.',
      'Garnelen 2–3 Min. braten, bis sie rosa sind. Halbierte Cherrytomaten dazugeben und 2 Min. mitbraten.',
      'Nudeln mit etwas Nudelwasser untermischen, salzen, pfeffern und mit Käse servieren.',
    ],
  },
  {
    id: '#rcp-hack-kartoffel-pfanne',
    title: 'Hackfleisch-Kartoffel-Pfanne mit Spiegelei',
    servings: 2,
    minutes: 35,
    tags: ['günstig'],
    nutritionPerServing: { kcal: 725, protein: 43, carbs: 54, fat: 37 },
    ingredients: [
      { name: 'Kartoffeln', amount: 600, unit: 'g' },
      { name: 'Rinderhackfleisch', amount: 300, unit: 'g' },
      { name: 'Zwiebel', amount: 1, unit: 'pcs' },
      { name: 'Paprikaschote', amount: 1, unit: 'pcs' },
      { name: 'Eier', amount: 2, unit: 'pcs' },
      { name: 'Rapsöl', amount: 15, unit: 'ml' },
    ],
    steps: [
      'Kartoffeln schälen, in 1 cm große Würfel schneiden, 8 Min. in Salzwasser vorkochen und abgießen.',
      'Kartoffeln in der Hälfte des Öls 10 Min. goldbraun braten.',
      'Hackfleisch, gewürfelte Zwiebel und Paprika dazugeben, 8 Min. mitbraten und mit Salz, Pfeffer und Paprikapulver würzen.',
      'In einer zweiten Pfanne im restlichen Öl zwei Spiegeleier braten und obenauf servieren.',
    ],
  },
  {
    id: '#rcp-cheeseburger-pommes',
    title: 'Cheeseburger mit Ofen-Pommes',
    servings: 2,
    minutes: 30,
    tags: ['Air Fryer'],
    nutritionPerServing: { kcal: 825, protein: 44, carbs: 74, fat: 38 },
    ingredients: [
      { name: 'Burgerbrötchen', amount: 2, unit: 'pcs' },
      { name: 'Rinderhackfleisch', amount: 300, unit: 'g' },
      { name: 'Gouda', amount: 40, unit: 'g' },
      { name: 'Tomate', amount: 1, unit: 'pcs' },
      { name: 'Pommes', amount: 300, unit: 'g' },
    ],
    steps: [
      'Pommes im Ofen oder Air Fryer nach Packungsanweisung backen.',
      'Hackfleisch mit Salz und Pfeffer würzen und zu 2 flachen Patties formen, etwas größer als die Brötchen.',
      'Patties in einer heißen Pfanne je Seite 3–4 Min. braten und in der letzten Minute den Gouda darauf schmelzen lassen.',
      'Brötchen aufschneiden und kurz anrösten. Mit Patty, Tomatenscheiben und nach Wunsch Salat, Ketchup oder Senf belegen.',
    ],
  },
  {
    id: '#rcp-feta-pasta-haehnchen',
    title: 'Ofen-Feta-Pasta mit Hähnchen',
    servings: 2,
    minutes: 35,
    tags: ['Ofen'],
    nutritionPerServing: { kcal: 875, protein: 61, carbs: 77, fat: 34 },
    ingredients: [
      { name: 'Feta', amount: 200, unit: 'g' },
      { name: 'Cherrytomaten', amount: 400, unit: 'g' },
      { name: 'Olivenöl', amount: 20, unit: 'ml' },
      { name: 'Farfalle', amount: 200, unit: 'g' },
      { name: 'Hähnchenbrustfilet', amount: 250, unit: 'g' },
    ],
    steps: [
      'Ofen auf 200 °C (Umluft 180 °C) vorheizen.',
      'Cherrytomaten in eine Auflaufform geben, Feta in die Mitte legen, mit Öl beträufeln und mit Oregano, Basilikum, ½ TL Knoblauch, Salz und Pfeffer würzen. 25 Min. backen.',
      'Inzwischen Farfalle bissfest kochen. Hähnchen in Würfel schneiden und in einer Pfanne 6–8 Min. braten.',
      'Feta und Tomaten in der Form zerdrücken und verrühren, Nudeln und Hähnchen untermischen.',
    ],
  },
  {
    id: '#rcp-erdnuss-bowl-meal-prep',
    title: 'Hähnchen-Reis-Bowl mit Erdnusssoße',
    servings: 3,
    minutes: 35,
    tags: ['Meal Prep'],
    nutritionPerServing: { kcal: 720, protein: 63, carbs: 73, fat: 18 },
    ingredients: [
      { name: 'Hähnchenbrustfilet', amount: 600, unit: 'g' },
      { name: 'Reis', amount: 225, unit: 'g' },
      { name: 'Brokkoli', amount: 500, unit: 'g' },
      { name: 'Erdnussbutter', amount: 60, unit: 'g' },
      { name: 'Sojasauce', amount: 45, unit: 'ml' },
      { name: 'Honig', amount: 15, unit: 'g' },
      { name: 'Rapsöl', amount: 15, unit: 'ml' },
    ],
    steps: [
      'Reis nach Packungsanweisung kochen. Brokkoli in Röschen teilen und die letzten 5 Min. im Dämpfeinsatz oder in wenig Wasser mitgaren.',
      'Hähnchen in Streifen schneiden, im Öl 6–8 Min. braten und salzen.',
      'Für die Soße Erdnussbutter, Sojasauce, Honig, ½ TL Knoblauch und 4–5 EL heißes Wasser glatt rühren.',
      'Alles auf 3 Dosen verteilen und die Soße darüber geben. Hält sich im Kühlschrank 3 Tage.',
    ],
  },
  {
    id: '#rcp-shakshuka-feta',
    title: 'Shakshuka mit Feta und Fladenbrot',
    servings: 2,
    minutes: 25,
    tags: ['vegetarisch'],
    nutritionPerServing: { kcal: 790, protein: 42, carbs: 71, fat: 36 },
    ingredients: [
      { name: 'Eier', amount: 6, unit: 'pcs' },
      { name: 'Gehackte Tomaten', amount: 400, unit: 'g' },
      { name: 'Paprikaschote', amount: 2, unit: 'pcs' },
      { name: 'Zwiebel', amount: 1, unit: 'pcs' },
      { name: 'Feta', amount: 100, unit: 'g' },
      { name: 'Olivenöl', amount: 15, unit: 'ml' },
      { name: 'Fladenbrot', amount: 200, unit: 'g' },
    ],
    steps: [
      'Zwiebel und Paprika würfeln und im Öl in einer großen Pfanne 5 Min. weich dünsten.',
      '2 TL Paprikapulver und ½ TL Knoblauch kurz mitrösten, Tomaten dazugeben, salzen und 10 Min. köcheln lassen.',
      'Mit einem Löffel 6 Mulden formen, die Eier hineinschlagen und zugedeckt 6–8 Min. stocken lassen.',
      'Feta darüber bröseln und mit Fladenbrot servieren.',
    ],
  },
  {
    id: '#rcp-nudelsalat-haehnchen',
    title: 'Hähnchen-Nudelsalat mit Joghurtdressing',
    servings: 3,
    minutes: 25,
    tags: ['Meal Prep', 'kalt'],
    nutritionPerServing: { kcal: 600, protein: 54, carbs: 76, fat: 7 },
    ingredients: [
      { name: 'Farfalle', amount: 250, unit: 'g' },
      { name: 'Hähnchenbrustfilet', amount: 400, unit: 'g' },
      { name: 'Paprikaschote', amount: 1, unit: 'pcs' },
      { name: 'Mais (Dose)', amount: 1, unit: 'pcs' },
      { name: 'Erbsen (TK)', amount: 150, unit: 'g' },
      { name: 'Skyr', amount: 200, unit: 'g' },
      { name: 'Rapsöl', amount: 10, unit: 'ml' },
    ],
    steps: [
      'Farfalle bissfest kochen, die Erbsen die letzten 2 Min. mitkochen, alles abgießen und kalt abspülen.',
      'Hähnchen in Würfel schneiden, im Öl 6–8 Min. braten, salzen und abkühlen lassen.',
      'Paprika würfeln und den Mais abtropfen lassen.',
      'Skyr mit 2 EL Wasser, Salz, Pfeffer, Paprikapulver und etwas Honig oder Senf zu einem Dressing verrühren.',
      'Alles mischen und auf 3 Dosen verteilen. Hält sich gekühlt 2–3 Tage.',
    ],
  },
  {
    id: '#rcp-bananen-erdnuss-shake',
    title: 'Bananen-Erdnuss-Shake ohne Proteinpulver',
    servings: 1,
    minutes: 5,
    tags: ['Snack', 'schnell', 'vegetarisch'],
    nutritionPerServing: { kcal: 610, protein: 37, carbs: 74, fat: 17 },
    ingredients: [
      { name: 'Milch', amount: 300, unit: 'ml' },
      { name: 'Skyr', amount: 150, unit: 'g' },
      { name: 'Banane', amount: 1, unit: 'pcs' },
      { name: 'Erdnussbutter', amount: 20, unit: 'g' },
      { name: 'Haferflocken', amount: 30, unit: 'g' },
      { name: 'Honig', amount: 10, unit: 'g' },
    ],
    steps: [
      'Alle Zutaten in einen Mixer geben.',
      '30 Sekunden fein pürieren. Wer es kalt mag, nimmt eine gefrorene Banane oder ein paar Eiswürfel.',
    ],
  },
  {
    id: '#rcp-huettenkaese-brot',
    title: 'Hüttenkäse-Brot mit Tomate',
    servings: 1,
    minutes: 5,
    tags: ['Snack', 'schnell', 'vegetarisch'],
    nutritionPerServing: { kcal: 430, protein: 32, carbs: 46, fat: 10 },
    ingredients: [
      { name: 'Vollkornbrot', amount: 100, unit: 'g' },
      { name: 'Hüttenkäse', amount: 200, unit: 'g' },
      { name: 'Tomate', amount: 1, unit: 'pcs' },
    ],
    steps: [
      '2 Scheiben Brot nach Wunsch toasten.',
      'Hüttenkäse darauf streichen, mit Tomatenscheiben belegen, salzen, pfeffern und mit Basilikum oder Schnittlauch bestreuen.',
    ],
  },
  {
    id: '#rcp-schoko-quark',
    title: 'Schoko-Quark mit Beeren',
    servings: 1,
    minutes: 5,
    tags: ['Snack', 'schnell', 'vegetarisch'],
    nutritionPerServing: { kcal: 305, protein: 34, carbs: 32, fat: 3 },
    ingredients: [
      { name: 'Magerquark', amount: 250, unit: 'g' },
      { name: 'Backkakao', amount: 10, unit: 'g' },
      { name: 'Honig', amount: 15, unit: 'g' },
      { name: 'Milch', amount: 30, unit: 'ml' },
      { name: 'Beerenmischung (TK)', amount: 100, unit: 'g' },
    ],
    steps: [
      'Quark mit Kakao, Honig und Milch cremig rühren.',
      'Mit angetauten Beeren servieren – schmeckt wie Pudding und hat über 30 g Eiweiß.',
    ],
  },
];

/**
 * Add the collection once. It counts as installed as soon as any of its
 * recipes exists (by id or title), so recipes the user deleted stay deleted,
 * also when a second device runs this later.
 */
export async function ensureRecipePack(): Promise<void> {
  if (readFlag()) return;
  // On a synced device, look at the account's recipes first – otherwise a
  // fresh device would add the pack before the existing recipes arrive.
  if (cloudEnabled && !(await caughtUpWithAccount())) return; // next start

  const existing = await db.recipesOwn.toArray();
  const known = new Set<string>();
  for (const r of existing) {
    if (r.id) known.add(r.id);
    known.add(normalize(r.title));
  }
  const installed = RECIPE_PACK.some(
    (r) => known.has(r.id ?? '') || known.has(normalize(r.title)),
  );
  if (!installed) await db.recipesOwn.bulkAdd(RECIPE_PACK);
  writeFlag();
}

function normalize(title: string): string {
  return title.trim().toLowerCase();
}

function readFlag(): boolean {
  try {
    return localStorage.getItem(PACK_FLAG) === '1';
  } catch {
    return false;
  }
}

function writeFlag(): void {
  try {
    localStorage.setItem(PACK_FLAG, '1');
  } catch {
    // Without storage the check simply runs again next start.
  }
}
