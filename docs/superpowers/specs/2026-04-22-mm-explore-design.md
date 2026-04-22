# M+M Explore — Design Spec

**Status:** Draft v1
**Datum:** 2026-04-22
**Autor:** Michael Stingl (mit Claude)
**Launch-Deadline:** 2026-04-24 (Abreise Italien)

## Zweck

Statische PWA als Reisebegleiter für Paare. Liest strukturierte Reisedaten aus einem privaten Gist und zeigt sie in zwei Modi: **Reisen** (unterwegs) und **Erleben** (angekommen). Offline-fähig, iOS-installierbar, kein Backend.

**Primärer Use Case:** Italien-Reise 24.4.–17.5.2026 von Michael und Martina. Michael ist tech-affin (pflegt Inhalte), Martina konsumiert nur.

**Langfristig:** Die PWA ist **generisch** — wiederverwendbar für alle zukünftigen Reisen. Kein trip-spezifischer Code. Reise-Inhalte leben ausschließlich im Gist-JSON.

## Nicht-Ziele

- Kein kollaboratives Bearbeiten aus der App heraus (nur Read-only)
- Kein Backend, keine Datenbank, kein Auth
- Keine native App
- Kein Multi-Trip-Support in v1 (ein Gist = eine Reise)

## Architektur

```
Google Drive (SSoT, unverändert)
  Italien 2026/
  ~25 Markdown-Files mit YAML-Frontmatter
       │
       │  manuelle 1×-Extraktion (Claude baut JSON)
       ▼
Private Gist (unlisted, lange URL)
  travel.json
       │
       │  fetch beim App-Öffnen + manuellem Refresh
       ▼
PWA "M+M Explore" auf GitHub Pages (static)
  Alpine.js + Open Props + Service Worker
  localStorage: gist-URL + letzte JSON-Kopie
       │
       ▼
Martinas iPhone Safari
  Home-Screen-Install
```

**Kern-Prinzipien:**
- Single writer, single reader (Michael schreibt Gist, PWA liest)
- Kein Backend, kein Build-Step in der PWA
- Security by obscurity: Gist-URL = das Secret
- PWA-Code ist reise-agnostisch, alle Inhalte kommen aus dem JSON

## Datenmodell (travel.json)

Normalisierte Struktur mit IDs. Keys englisch (stabil), UI-Strings deutsch (via JSON-Inhalte).

```json
{
  "schema_version": 1,
  "trip": {
    "id": "italien-2026",
    "title": "Italien 2026",
    "subtitle": "Workation & Urlaubs-Rückweg",
    "from_date": "2026-04-24",
    "to_date": "2026-05-17",
    "travelers": ["Michael", "Martina"],
    "vehicle": { "name": "VW ID.7 Tourer Pro", "plate": "ER-MM25E" },
    "last_updated": "2026-04-22T14:00:00Z"
  },
  "days": [
    {
      "date": "2026-04-24",
      "type": "travel",
      "title": "Erlangen → Rovereto",
      "drive_id": "drive-erlangen-rovereto",
      "stay_id": "stay-rovereto"
    }
  ],
  "drives": [
    {
      "id": "drive-erlangen-rovereto",
      "date": "2026-04-24",
      "from": "Erlangen",
      "to": "Rovereto",
      "km": 548,
      "duration_min": 400,
      "maps_url": "https://maps.apple.com/?...",
      "stops": [
        {
          "name": "Rosenheim Supercharger",
          "km_ab_start": 250,
          "kw": 250,
          "stop_min": 18,
          "maps_url": "..."
        }
      ]
    }
  ],
  "stays": [
    {
      "id": "stay-rovereto",
      "name": "Mercure Nerocubo",
      "place_id": "rovereto",
      "address": "Via Per Marco 16, 38068 Rovereto",
      "coords": [45.8567, 11.0019],
      "phone": "+39 0464 022022",
      "check_in": "2026-04-24T14:00",
      "check_out": "2026-04-25T12:00",
      "maps_url": "...",
      "booking": { "provider": "booking.com", "id": "5367728988", "pin": "1790" },
      "status": "gebucht"
    }
  ],
  "places": [
    {
      "id": "tropea",
      "name": "Tropea",
      "coords": [38.68, 15.89],
      "pois": [
        { "name": "Santa Maria dell'Isola", "type": "sight", "coords": [38.68, 15.89], "note": "...", "maps_url": "..." }
      ]
    }
  ]
}
```

**Hinweise:**
- `schema_version: 1` — erlaubt zukünftige Schema-Evolution
- `days[].type`: `travel` | `stay` | `mixed`
- POI-`type`: `sight` | `food` | `beach` | `charge` | `other`
- Preise, Stornofristen, Zahlungsstatus sind in v1 **nicht** im JSON — können später additiv hinzukommen

## Views

Single-Page-App, drei Views, Toggle zwischen den Modi:

```
┌─────────────────────────────────────┐
│ Italien 2026           [⚙]          │  ← trip.title aus JSON
├─────────────────────────────────────┤
│   [ Reisen 🚗 | Erleben 🏖️ ]         │  ← Segmented Control
├─────────────────────────────────────┤
│   Content                           │
└─────────────────────────────────────┘
```

### View A — Reisen-Modus

Default wenn heute ein `type: "travel"`-Tag ist.

**Heute-Fahrt-Karte** (falls `days[today].drive_id` vorhanden):
- "Von → Nach, X km, ~Y Stunden"
- Button "In Maps öffnen" (nutzt `drive.maps_url`)
- Ladestopps-Liste: Name, km ab Start, kW, Stopp-Min
  - Jeder Stopp tap → Maps-Link

**Heute-Abend-Unterkunft-Karte** (falls `days[today].stay_id` vorhanden):
- Name, Adresse, Telefon, Check-in-Zeit
- Button "Route öffnen"
- Tap auf Karte → Detail-Modal mit PIN / Booking-ID / Provider

**Fallback:** Heute keine Fahrt → Hinweis "heute ist kein Reisetag, wechsle zu Erleben".

### View B — Erleben-Modus

Default wenn heute ein `type: "stay"`-Tag ist.

**Orts-Picker** oben:
- Dropdown/Sheet mit allen `places[]`
- Default-Reihenfolge:
  1. `places[]`-Eintrag dessen ID = `stays[days[today].stay_id].place_id` (Ort der heutigen Unterkunft)
  2. Sonst: Ort der zuletzt ausgewählten Session (aus localStorage)
  3. Sonst: erster `places[]`-Eintrag

**Inhalt des gewählten Orts:**
- Unterkunft dort (falls vorhanden) — wie in Reisen-Modus
- POI-Liste: Name, Typ-Icon, Notiz, Maps-Link

### View C — Settings (hinter ⚙)

- Gist-URL (Input + "laden"-Button)
- "Jetzt neu laden" (fetch + Cache-Update)
- Letzte Aktualisierung (Timestamp)
- Trip-Info (schema_version, last_updated, traveler_names)
- "Reset" (löscht localStorage)

### Navigation

- Kein Router, keine History-Manipulation
- Alles auf einer Page, Toggle wechselt Inhalt
- Details sind Modals (Overlay, kein State-Change in URL)
- Safari-freundlich (keine Back-Button-Verwirrung)

## Tech-Stack

Bewusst minimal, no-build, no-npm:

- **HTML:** ein `index.html` mit Alpine.js via CDN
- **JS:** Alpine.js (`@3`), ~200-400 Zeilen eigener Code inline oder in `app.js`
- **CSS:** Open Props via CDN + eigene Klassen, CSS Custom Properties
- **Service Worker:** Hand-rolled, ~40-60 Zeilen
  - **Cache-first** für App-Shell: `index.html`, `app.js`, `styles.css`, `manifest.json`, Icons, Alpine-CDN, Open-Props-CDN
  - **Network-first mit Cache-Fallback** für Gist-JSON
  - Cache-Name inkludiert Version-String → bei Deploy alte Caches automatisch invalidiert
- **Persistence:** `localStorage` (Gist-URL, JSON-Cache, Modus-Override)
- **Manifest:** `manifest.json` mit 192×192 + 512×512 Icon
- **Deploy:** GitHub Pages aus `main` Branch, `/` als root

**Keine:** npm, Build-Step, Bundler, Framework mit Compiler.

**Warum Alpine.js statt pure Vanilla:**
- ~10 kB gzip, deklarative Reaktivität (`x-data`, `x-show`, `x-bind`)
- Kein Compile, CDN-Script
- Spart ~100 Zeilen Event-Handler-Boilerplate
- Lesbar für Nicht-Entwickler (Michael)

**Warum Open Props statt Tailwind CDN:**
- Tailwind-CDN ist in Produktion offiziell unsupported
- Open Props liefert Design-Tokens als CSS-Variablen (spacing, colors, animations), keine Runtime-Magie
- Design-System-Basis für spätere `frontend-design`-Iteration

## Datenfluss

```
App-Öffnen:
  1. Safari lädt index.html (via Service Worker Cache, offline OK)
  2. JS liest gist_url aus localStorage
     - Keine URL? → Settings-View, Input-Feld
  3. fetch(gist_url)
     ├─ Erfolg → JSON parsen → in localStorage cachen → rendern
     └─ Fehler → letzte JSON-Kopie aus localStorage → "offline"-Banner
  4. Default-Modus (date → travel day? → Reisen : Erleben)
  5. View rendern

Manueller Refresh (in Settings):
  1. Button-Click → fetch(gist_url)
  2. bei Erfolg: cachen + rendern, Toast "aktualisiert"
  3. bei Fehler: Toast "kein Netz, Daten unverändert"

Modus-Toggle:
  1. User tippt [Reisen | Erleben]
  2. localStorage['mode_override'] = 'reisen' | 'erleben'
  3. Re-render mit neuem Modus
```

## Fehlerbehandlung

| Situation | Verhalten |
|---|---|
| Keine Gist-URL konfiguriert | Settings-View, Empty-State mit Erklärung |
| Gist nicht erreichbar, Cache da | Rendert Cache, "offline"-Banner sichtbar |
| Gist nicht erreichbar, kein Cache | Fehler-Screen mit Gist-URL-Input |
| JSON malformed | Fehler-Screen "Bundle kaputt, bitte Michael fragen" |
| Heute < trip.from_date | Countdown-Hinweis "Reise beginnt am {from_date}" |
| Heute > trip.to_date | "Reise vorbei, hoffe es war schön" + Rückblick |
| Schema-Version unbekannt | Warnung, aber Render-Versuch |

## MVP-Scope-Cut für 24.4.

### In Scope (Launch)

- ✅ PWA-Skeleton + Manifest + iOS-Icons (192/512)
- ✅ Service Worker (offline-fähig, Cache-Strategie)
- ✅ Gist-URL-Input + localStorage
- ✅ Reisen-Modus voll (Fahrt-Karte, Ladestopps, Unterkunft, Maps-Links, PIN-Modal)
- ✅ Erleben-Modus rudimentär (Orts-Picker, Unterkunft, POI-Liste)
- ✅ Modus-Toggle mit Auto-Default + Override
- ✅ Error-States (offline, malformed, out-of-range)
- ✅ Manuell befülltes Gist (Claude erstellt travel.json aus Drive-Daten)
- ✅ iOS-Install-Banner bei erstem Launch (da kein Auto-Prompt)

### Out of Scope (Phase 2+)

- ❌ Kartenansicht (Leaflet + GPX) — kommt später
- ❌ Build-Script `tools/build-bundle.py` — manuelle Extraktion reicht für v1
- ❌ Krusty-Integration — später
- ❌ QR-Scan-Pairing — copy-paste reicht
- ❌ Vollständiger POI-Katalog — nur wichtigste Orte im ersten Bundle
- ❌ Wetter, TODO-Aggregation, Suche
- ❌ Multi-Trip-Support
- ❌ Buchungs-Dashboard (Preise, Stornofristen)

## Testing-Plan

**Stufe 1 — Desktop Safari (Inner Loop)**
- `python3 -m http.server 8000` im mm-explore/ Ordner
- Safari → `http://localhost:8000`
- Service Worker läuft auf localhost ohne HTTPS
- Responsive Mode (Cmd+Option+R) → iPhone 15 Pro Profil
- Hier passiert 90% der Entwicklung

**Stufe 2 — Xcode iOS Simulator**
- `xcrun simctl boot "iPhone 15 Pro"` + Simulator
- Safari im Simulator → `http://localhost:8000`
- Verifiziert: iOS Safari-Rendering, "Zum Home-Bildschirm"-Flow, Standalone-Mode, Icon, Splash
- Nicht zuverlässig: echtes Netz / Roaming

**Stufe 3 — Echtes iPhone (Michael, vor Martina-Rollout)**
- Safari → deployed GitHub-Pages-URL
- Install-Flow, Offline-Test (Flight-Mode-Toggle), Gist-URL-Paste aus iMessage
- Notch / Safe-Area / Orientierung

**Nicht-Ziel:** `webapp-testing` Skill (Playwright) ist Chromium-basiert, nicht iOS Safari → nur für Smoke-Tests, nicht für iOS-Safari-Quirks.

## Zeitplan

| Tag | Was |
|---|---|
| **2026-04-22 (Mi)** | Design-Doc committen; Repo-Scaffold; Alpine + Open Props einbauen; Reisen-Modus bauen; Gist manuell befüllen |
| **2026-04-23 (Do)** | Erleben-Modus + Settings; Service Worker; iOS-Banner; GitHub Pages Deploy; Test auf Michaels iPhone |
| **2026-04-24 (Fr)** | Morgens: Martina-Install, Walkthrough, go |

## Risiken

| Risiko | Wahrscheinlichkeit | Mitigation |
|---|---|---|
| iOS Safari Service-Worker-Timing-Bug | 🟡 mittel | Plan B: App läuft auch ohne SW (nur kein Offline-First-Launch) |
| GitHub Pages Cache-Staleness nach Deploy | 🟡 mittel | SW-File mit Version-Timestamp bei jedem Deploy, Cache-Name inkludiert Version |
| Gist-URL Copy-Paste aus iMessage in Safari zickt | 🟢 niedrig | Plan B: URL-Fragment in Install-Link (`…/index.html#gist=...`) |
| Martinas iPhone iOS-Version alt | 🟢 niedrig | Feature-Test beim Onboarding, Fallbacks für fehlende APIs |
| Inhaltliche Lücken im Bundle (z.B. POIs fehlen) | 🟡 mittel | MVP zeigt leere Listen mit hilfreichem Empty-State, kein Crash |

## Ästhetik / Design-Direction

**TBD** — wird bei Implementation mit `frontend-design` Skill festgelegt.

Inputs für diese Diskussion:
- Tonalität: Reise, mediterraner Kontext, Paar-App, nicht Business
- Klarheit-vor-Komplexität-Regel (Michaels Positionierung)
- Lesbar unterwegs (im Auto, bei Sonne)
- Nicht "generic AI slop" (kein Lila-auf-Weiß, kein Space Grotesk, keine Inter-Typo)

**Platzhalter in Sektion 6 des Spec; vor dem Bauen klären.**

## Offene Entscheidungen

- [ ] Wie kommt die Gist-URL initial auf Martinas iPhone? (Vorschlag: iMessage-Link mit Fragment, z.B. `https://michaelstingl.github.io/mm-explore/#gist=https://gist.githubusercontent.com/...`)
- [ ] Ästhetik-Richtung (siehe oben)
- [ ] Sollen wir die privaten Koordinaten / Adressen der Gastgeber (Airbnb) im öffentlichen Repo-Beispielcode hartcodiert haben? (Antwort: nein, Beispiel-JSON im Repo ist fiktiv)
