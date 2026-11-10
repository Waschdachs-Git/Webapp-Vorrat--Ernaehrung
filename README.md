# Vorrat & Ernährung

Eine lokale, installierbare **PWA** für iPad zur Verwaltung von
Lebensmittel-Vorrat und Ernährung. Local-first: alle Daten liegen auf dem Gerät
(IndexedDB); wer will, meldet sich per E-Mail-Code an und gleicht iPhone und
iPad über Dexie Cloud ab. Oberfläche auf Deutsch, offline-fähig https://webapp-vorrat-ernaehrung.vercel.app/heute.

> Vorrat, Einkauf, Rezepte und Ernährungs-Tracking hängen zusammen: Ein
> „gegessen/gekocht"-Vorgang bucht ins Tagebuch **und** zieht den Vorrat ab.

Details zu Produkt und Design: [`PRODUCT.md`](./PRODUCT.md) ·
[`DESIGN.md`](./DESIGN.md).

## Features

- **Heute** – übrige Kalorien, Makro-Balken, Mahlzeiten (der Tag wechselt um
  Mitternacht auch bei offener App),
  Empfehlungen (Tagesziel füllen / Ablaufendes verwerten / Abwechslung).
- **Vorrat** – Barcode-Scan (Open Food Facts, kein Key) oder manuell, Lagerorte,
  MHD-/„wenig"-Badges, Grundnahrungsmittel mit Mindestbestand.
- **Einkauf** – manuell + Auto-Nachkauf, Abhaken per Swipe. Nach dem Einkauf
  „Zum Vorrat hinzufügen“: Produkte nacheinander scannen, Menge (aus der
  Packungsgröße vorausgefüllt) und MHD prüfen; der Listeneintrag wird
  zugeordnet und abgeräumt, gleiche Produkte werden zum Bestand addiert.
- **Rezepte** – „Was kann ich kochen?", Spoonacular-Suche (Profil-Filter),
  eigene deutsche Rezepte, „Gekocht"-Buchung, fehlende Zutaten mit einem Tipp
  auf die Einkaufsliste. Startet mit einer Sammlung von 27 proteinreichen
  Alltagsrezepten (`src/db/recipePack.ts`, einmalig pro Konto angelegt,
  danach frei bearbeit- und löschbar).
- **Profil** – Onboarding, Gesundheits-Berechnung (Mifflin-St Jeor), Tagesziele
  (überschreibbar), Gewichtsverlauf, Backup (JSON-Export/-Import).

## Tech-Stack

React 18 · TypeScript (strict) · Vite · Tailwind CSS · React Router · Dexie.js
(IndexedDB) · Framer Motion · Recharts · @zxing/browser (Barcode) ·
vite-plugin-pwa · lucide-react.

## Setup (lokal)

Voraussetzung: Node.js ≥ 18.

```bash
npm install
npm run icons   # erzeugt die PWA-Icons in public/ (einmalig)
npm run dev     # Dev-Server, http://localhost:5173
```

Weitere Skripte:

```bash
npm run build     # Typecheck + Produktions-Build nach dist/
npm run preview   # gebauten Build lokal ansehen
npm run typecheck # nur TypeScript prüfen
npm test          # Unit-Tests (Vitest): Zutaten-Abgleich, Import-Prüfung, Packungsgrößen
```

> **Kamera/Barcode** braucht HTTPS. Lokal reicht `localhost`; auf dem iPad muss
> die App über **HTTPS** ausgeliefert werden (siehe Deploy).

## Spoonacular-Key (optional)

Die Rezeptsuche nutzt Spoonacular. Hol dir einen **kostenlosen** API-Key auf
<https://spoonacular.com/food-api> und trage ihn in der App unter
**Profil → Einstellungen → Spoonacular API-Key** ein. Ohne Key bleibt die App
voll nutzbar; nur die Spoonacular-Funktionen sind ausgegraut. Der Key liegt in
den Einstellungen der App (keine Secrets im Code) und wird bei aktiver
Synchronisierung mit dem eigenen Konto abgeglichen. In Backup-Dateien steht er
nicht; ein Import lässt den gespeicherten Key unangetastet.

## Deploy (HTTPS automatisch)

Einfachster Weg — kostenlos auf **Vercel** oder **Netlify** deployen; beide
liefern automatisch HTTPS.

### Vercel

1. Repo zu GitHub pushen.
2. Auf <https://vercel.com> → „New Project" → Repo importieren.
3. Framework: **Vite** (wird erkannt). Build-Command `npm run build`,
   Output-Verzeichnis `dist`.
4. Deployen.

### Netlify

1. Repo zu GitHub pushen.
2. Auf <https://netlify.com> → „Add new site" → „Import an existing project".
3. Build-Command `npm run build`, Publish-Verzeichnis `dist`.
4. Deployen.

(Optional: `netlify.toml` mit SPA-Fallback ist bereits im Repo enthalten.)

## Aufs iPad holen

1. Die deployte HTTPS-URL in **Safari** auf dem iPad öffnen.
2. Onboarding durchlaufen (Name, Größe, Gewicht, Ziel …).
3. **Teilen-Symbol → „Zum Home-Bildschirm"** tippen.
4. Die App startet ab jetzt im Vollbild (standalone), wie eine native App, und
   funktioniert offline für alle lokalen Daten.

## Synchronisierung (Dexie Cloud)

Die App nutzt [Dexie Cloud](https://dexie.org/cloud/) zum Abgleich zwischen
Geräten. Die Datenbank-URL steht in `src/db/cloudConfig.ts` (überschreibbar
per `VITE_DEXIE_CLOUD_URL`, leer = rein lokal). Sie ist kein Geheimnis:
Zugriff gibt es nur mit Login, und nur freigegebene Origins dürfen verbinden.

- **Anmelden:** Profil → Einstellungen → Synchronisierung → Anmelden (E-Mail +
  Code). Die Daten des Geräts wandern dabei ins Konto.
- **Zweites Gerät:** im Onboarding „Anmelden" – oder in den Einstellungen
  „Daten von dort laden", wenn das Gerät schon eigene Daten hat (die werden
  dann ersetzt). Die Gerätedaten werden dafür zwischengespeichert und kommen
  zurück, falls die Anmeldung abgebrochen wird (`src/db/loginStash.ts`).
  Solange nach einer Anmeldung die Kontodaten noch laden, zeigt das Onboarding
  kein Profilformular – ein neu angelegtes Profil würde das im Konto ersetzen.
- **Neue Domain freigeben:** `npx dexie-cloud whitelist https://…` (braucht die
  `dexie-cloud.key` des Datenbank-Owners – nie committen).
- **Nutzer dauerhaft freischalten:** Im Free-Plan synchronisieren neue Nutzer
  30 Tage als „Evaluation"; im [Dexie Cloud Manager](https://manager.dexie.cloud)
  auf „Production" stellen (3 Production-Nutzer sind kostenlos).

Beim ersten Start nach dem Update zieht die App die Daten aus der alten lokalen
Datenbank automatisch in die neue (String-IDs, Verweise werden umgeschrieben).

## Updates

Der Service Worker aktiviert eine neue Version sofort (`skipWaiting` +
`clientsClaim`) und räumt die Dateien der alten weg. Damit eine noch laufende
Seite nicht auf fehlende Dateien stößt, lädt die App sich selbst auf die neue
Version – aber nur, wenn das nichts kostet: direkt nach dem Start oder während
sie im Hintergrund liegt. Ist ein Dialog offen oder steht Text in einem Feld,
wartet sie und zeigt stattdessen „Neue Version bereit" (`src/lib/appUpdate.ts`).
Die laufende Version steht unten in den Einstellungen, dort lässt sich auch
nach einem Update suchen.

Stürzt eine Seite trotzdem ab, zeigt eine Fehlergrenze (`ErrorBoundary`) eine
Meldung mit „App neu laden" statt eines weißen Bildschirms; die Navigation
bleibt benutzbar.

## Datensicherung

Ohne Anmeldung liegen alle Daten ausschließlich im Browser des Geräts. **Regelmäßig
exportieren** (Profil → Einstellungen → Backup → Export). Das schützt vor
Datenverlust, falls die Safari-Daten gelöscht werden. Wiederherstellen über
Import.

Ein Import ersetzt alle Daten. Die Datei wird vorher vollständig geprüft
(`src/db/sanitize.ts`): unbrauchbare Zeilen werden übersprungen und gezählt,
eine Datei, die kein Backup dieser App ist, wird abgelehnt, bevor etwas
gelöscht wird.
