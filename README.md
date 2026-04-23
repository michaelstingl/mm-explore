# M+M Explore

Reiseplan-App ohne Backend. Liest einen privaten Gist, funktioniert offline, lässt sich aus Safari zum Home-Bildschirm hinzufügen.

Live: https://michaelstingl.github.io/mm-explore/

## Wie es funktioniert

```
Reisedaten als YAML-Markdown (Google Drive)
       │
       │  manuell zu JSON extrahiert
       ▼
Privater Gist (unlisted URL, enthält travel.json)
       │
       │  fetch beim App-Start, Cache via Service Worker
       ▼
Statische PWA auf GitHub Pages
       │
       ▼
iPhone, Home-Bildschirm, offline-tauglich
```

Keine Accounts, kein Login, kein Backend. Wer die Gist-URL kennt, sieht die Daten. Das ist der ganze Security-Layer.

## Features

- **Zwei Modi:** Unterwegs (Fahrt + Abend-Unterkunft), Erleben (Orts-Picker + POIs)
- **Kalender-Sheet** mit Icons pro Tag, nur Reise-Wochen sichtbar
- **Navigation-App wählbar:** Apple Maps, Google Maps, Waze (system-default sonst)
- **Koords-Copy-Button** neben jedem Ort → in myVW oder Notes einfügen
- **Offline:** Service Worker cached Shell + Bundle, letzte Daten bleiben verfügbar
- **Share-Trip:** generiert Onboarding-Link mit Gist-URL als Query-Parameter
- **Update-Banner** wenn neuer Build deployed
- **Locale-Switcher** (Auto / DE / AT / CH / EN / IT / FR)
- **Debug-Mode** mit persistiertem Event-Log für User-Journey-Forensik

## Lokale Entwicklung

```bash
bun --hot dev.ts
```

Öffnet http://localhost:8000 mit WebSocket-Live-Reload (jede Datei-Änderung triggert Browser-Reload).

Console-Output zeigt HTTP-Requests, Client-Connects, Reload-Trigger mit Datei-Namen.

Service Worker ist auf localhost deaktiviert, damit Dev-Loops nicht gegen Cache kämpfen.

## Deployment

Jeder Push auf `main` löst `.github/workflows/deploy.yml` aus:

1. `sw.js` bekommt `VERSION = vYYYYMMDD-HHMMSS-<sha7>` eingestempelt
2. `build.json` wird mit Commit-Hash, Message und Deploy-Timestamp geschrieben
3. Deploy auf GitHub Pages (Source: Actions, nicht Branch)

Die App pollt alle 5 Minuten die `build.json` und zeigt ein "Update verfügbar"-Banner wenn sich die Version geändert hat.

## Onboarding auf iPhone

Share-Trip im Web-Settings → iMessage / AirDrop → Link enthält `?gist=<encoded-url>`.

Wichtig: Query-Parameter, nicht Fragment. iOS schneidet Fragments beim "Zum Home-Bildschirm" ab, Query-Parameter bleiben im `start_url`. Der Service Worker schreibt beim Install-Moment die `manifest.json` dynamisch um und setzt `start_url` auf die aktuelle URL inklusive Gist — sonst hätte die installierte PWA keinen Weg, den Gist zu kennen.

## Bundle-Schema (travel.json)

Alle Keys englisch, UI-Texte kommen aus Content-Feldern:

```json
{
  "schema_version": 1,
  "trip": {
    "title": "Italien 2026",
    "from_date": "2026-04-24",
    "to_date": "2026-05-17",
    "theme": { "primary": "#E8743B", "accent": "#2E5266", ... }
  },
  "days":   [{ "date": "2026-04-24", "type": "travel", "drive_id": "...", "stay_id": "..." }],
  "drives": [{ "id": "...", "from": "Erlangen", "to": "Rovereto", "km": 548, "stops": [...] }],
  "stays":  [{ "id": "...", "name": "...", "coords": [...], "booking": { "pin": "..." } }],
  "places": [{ "id": "tropea", "name": "Tropea", "pois": [{ "name": "...", "type": "food|sight|beach|charge|other" }] }]
}
```

Full-Schema siehe [Design-Spec](docs/superpowers/specs/2026-04-22-mm-explore-design.md).

## Debugging

Drei Wege, Debug einzuschalten:

- **In-App:** Settings → Debug-Modus Switch
- **Console:** `mmDebug(true)` → Reload
- **Query:** `?date=2026-04-24` simuliert ein anderes Datum

Mit Debug aktiv:
- `[mm]`-prefixed Console-Logs (init, fetch-timing, mode/date/maps-Klicks)
- Ring-Buffer-Log der letzten 200 Events, persistiert in localStorage
- Snapshot-Panel zeigt Build, Runtime-State, Bundle-Stats
- Kopierbar für Bug-Reports

## Technik

Vanilla HTML + Alpine.js (CDN) + Open Props (CDN) + hand-rolled Service Worker. Keine Node-Dependencies, kein Build-Step.

Dev-Server: Bun (`dev.ts`) mit File-Watcher und WebSocket-Live-Reload.

## Nicht-Ziele

- Keine Write-Pfade aus der App (read-only)
- Kein Multi-Trip-Support in v1 (ein Gist = eine Reise)
- Kein Mapping (kommt später optional mit Leaflet + GPX)
- Keine Custom-Navigation-Integration für VW We Connect — gibt kein öffentliches URL-Schema

## Wie Daten aktualisiert werden

Aktuell manuell: Gist auf gist.github.com editieren. GitHub Raw hat 5-Minuten-Cache, dann zieht "Jetzt neu laden" in Settings die neue Version.

Geplant:
- `tools/build-bundle.ts` scannt Drive-Markdown und PATCHt den Gist
- Krusty (Signal-Bot) bekommt einen Gist-Skill und kann per DM editieren

## Struktur

```
index.html       — UI, Alpine x-data/x-for/x-if
app.js           — State, Logik, Helper
styles.css       — Tokens + Komponenten
sw.js            — Shell-Cache + Gist-Network-first + Manifest-Rewrite
manifest.json    — PWA-Metadaten
icons/           — 192, 512, apple-touch, Source-SVG
dev.ts           — Bun-Dev-Server mit Hot-Reload
.github/workflows/deploy.yml — Auto-Version + Pages-Deploy
docs/superpowers/specs/  — Design-Spec
docs/superpowers/plans/  — Implementation-Plan
```

## Lizenz

Persönliches Projekt, keine formelle Lizenz. Der Code ist als Vorlage für andere Reisen gedacht — fork und adapt.
