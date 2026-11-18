# DESIGN.md — Vorrat & Ernährung

Verbindliche Design-Direktive. Gilt bei jedem UI-Schritt. **Product-Mode, nicht
Brand-Mode** — die App ist ein Werkzeug, Design dient der Aufgabe.

## Haltung

Notion/Linear-mäßig **minimalistisch, editorial, ruhig**. Klare typografische
Hierarchie über Größe/Gewicht/Farbe/Abstand statt Dekoration. Großzügiger
Weißraum. Weiche, nicht harte Kontraste.

**Anti-Referenzen (verboten):** lila Verläufe, Glassmorphism, Gradient-Text,
Neon/Cyberpunk, generische Regenbogen-KI-Paletten, „Boost your …"-Texte.

## Farbe

Zurückhaltend. Eine neutrale Basis + **eine** Akzentfarbe.

- **Basis:** warmes Papier-Off-White (hell) / fast-schwarz (dunkel).
- **Akzent:** Kräutergrün (`#247a4e`) — in den Einstellungen
  konfigurierbar; im Dunkelmodus automatisch aufgehellt (≥ 4,5:1).
- **Semantisch sparsam:** Bernstein = „läuft bald ab", Rot =
  „abgelaufen / sehr wenig".
- **Makro-Palette** (aus derselben Welt wie der Grund): Protein
  (Terrakotta), Kohlenhydrate (Weizen), Fett (Oliv).

Hell- und Dunkelmodus, dem System folgend, umschaltbar. Dark Mode ordentlich
umgesetzt (Kücheneinsatz im Dunkeln).

Alle Farben laufen über **CSS-Variablen** (`--c-*` in `src/index.css`), die
Tailwind als Tokens nutzt (`tailwind.config.js`). Die Akzentfarbe wird zur
Laufzeit aus den Settings gesetzt.

## Typografie

Text in **SF** auf Apple-Geräten, sonst **Inter** (mitgeliefert). Seitentitel
und große Kennzahlen in der Serifenschrift **Newsreader** – „Kochbuch trifft
iOS". Zahlen mit `tabular-nums` (Utility-Klasse `.tnum`). Eingabefelder
mindestens 16 px, sonst zoomt iOS beim Antippen hinein.

## Icons

`lucide-react`, konsistent.

## Motion (Emil-Prinzipien)

- Spring-basiert (Framer Motion), kurz (UI-Übergänge ~150–250 ms),
  Easing eher ease-out beim Erscheinen.
- Nur `transform` und `opacity` animieren (GPU-freundlich).
- `prefers-reduced-motion` respektieren → Animationen aus/minimal
  (global via CSS in `index.css`).
- Bewegung erklärt etwas (woher/wohin). Nicht dekorativ alles animieren.
- Gezielte Mikro-Interaktionen: Tagesbalken und Makro-Balken wachsen,
  Sheets federn hoch und lassen sich an der Kopfzeile nach unten wegziehen.

## Touch / iPad-UX

- **Bottom-Tab-Bar** als Hauptnavigation: Heute · Vorrat · Einkauf · Rezepte ·
  Profil. Auf dem iPad wandert sie als Leiste an die Seite.
- Tap-Ziele mind. **44×44 px**. Primäraktionen daumengünstig (unten).
- **Swipe-Gesten**: Einkaufsliste abhaken / Vorratsartikel löschen – immer
  mit einem sichtbaren Weg daneben (Button), denn Gesten findet niemand allein.
- **Rückgängig** statt Rückfrage: Löschen und Buchen zeigen eine dunkle
  Leiste mit „Rückgängig", die auch über offenen Sheets liegt.
- Eingabe-Flows als **Bottom-Sheet** (Vaul-artig), touch-freundlich.
- Funktioniert in Hoch- und Querformat; Safe-Area-Insets berücksichtigt.

## Komponenten-Inventar

`src/components/ui.tsx` enthält die Primitives: `Button`, `AddButton`,
`Card`, `Field`, `Input`, `Textarea`, `Select`, `SegmentedControl`,
`TextTabs`, `Section`, `Badge`, `EmptyState`. Geteilte Bausteine:
`BottomSheet`, `TabBar`/`SideNav`, `SwipeRow`, `PageHeader`, `UndoToast`,
`ErrorBoundary`, `BarcodeScanner`, `InventoryForm`.
