# PRODUCT.md — Vorrat & Ernährung

## Kontext

Eine installierbare Progressive Web App (PWA) für ein **iPad**, mit der eine
**alleinlebende Person** ihren Lebensmittel-Vorrat und ihre Ernährung verwaltet.

**Kernidee:** Vorrat, Einkauf, Rezepte und Ernährungs-Tracking hängen zusammen.
Ein „gegessen/gekocht"-Vorgang **bucht ins Ernährungstagebuch UND zieht den
Vorrat ab**.

- **Single-User**, kein eigenes Backend. Optionaler Login (E-Mail-Code) nur für den Abgleich zwischen iPhone und iPad über Dexie Cloud.
- Alle Daten lokal in **IndexedDB** (über Dexie.js).
- Oberfläche **Deutsch**.
- Funktioniert **offline** — nur die externen API-Aufrufe (Open Food Facts,
  Spoonacular) brauchen Netz.

## Nutzer

Eine Person, nutzt die App täglich in der Küche, oft schnell, manchmal bei
schlechtem Licht. Gerät: iPad, Touch.

**Ton:** ruhig, klar, sachlich. Kein Marketing, keine Motivationssprüche.

## Module

| Tab | Zweck |
| --- | --- |
| **Heute** | Startseite: Kalorien-Ring (gegessen vs. Ziel), Makro-Balken, „verbleibend heute", heutige Mahlzeiten, Empfehlungen. |
| **Vorrat** | Artikel per Barcode-Scan (Open Food Facts) oder manuell anlegen; gruppiert nach Lagerort; Badges „läuft bald ab" / „wenig"; Grundnahrungsmittel mit Mindestbestand. |
| **Einkauf** | Manuell + Auto-Nachkauf für Grundnahrungsmittel unter Mindestbestand; Abhaken (Swipe); „in den Vorrat übernehmen". |
| **Rezepte** | „Was kann ich kochen?" aus Vorrat (eigene Rezepte + Spoonacular), Spoonacular-Suche mit Profil-Filtern, eigene deutsche Rezepte, „Gekocht"-Buchung. |
| **Profil** | Onboarding, Gesundheits-Berechnung, Tagesziele (überschreibbar), Gewichtsverlauf; Zugang zu Einstellungen (API-Key, Theme, Akzentfarbe, Backup). |

## Zentraler Vorgang: „gegessen/gekocht"

1. **Gegessen:** Lebensmittel wählen (Vorrat / Standard-DB / Barcode / frei) →
   Portion in Gramm → App rechnet kcal/Makros aus Nährwerten pro 100 g ×
   Menge → bucht in `diary` **und** zieht die Menge aus `inventory` ab.
2. **Rezept gekocht:** im Vorrat gematchte Zutaten abziehen + Rezept-Nährwerte
   (Portionen) ins Tagebuch buchen.

Nach jedem Vorgang läuft **Auto-Nachkauf**: Grundnahrungsmittel unter
Mindestbestand landen automatisch (ohne Duplikate) auf der Einkaufsliste und
verschwinden wieder, sobald aufgefüllt.

## Gesundheits-Berechnung (Orientierung, keine medizinische Beratung)

- **BMR** (Mifflin-St Jeor): `10·kg + 6.25·cm − 5·Alter + (m:+5 / w:−161 / d:−78)`
- **TDEE** = BMR × Aktivitätsfaktor (1.2 … 1.9)
- **Zielanpassung:** 1 kg ≈ 7700 kcal → tägl. Defizit/Überschuss =
  `Zielrate(kg/Woche) · 7700 / 7`
- **Makros (editierbar):** Protein ~1.8 g/kg, Fett ~28 % der kcal, Rest Carbs.

Alle Werte sind Vorschläge und vom Nutzer überschreibbar.

## Qualitätsziele

- TypeScript strict, saubere Komponenten, sinnvolle Ordnerstruktur.
- Offline-first für lokale Daten; keine Abstürze ohne Netz/ohne API-Key.
- Zugänglich: Fokus, Kontraste, Touch-Größen ≥ 44 px, `prefers-reduced-motion`.
- Keine Secrets im Code — der API-Key wird in der Settings-UI eingegeben und
  lokal gespeichert.
