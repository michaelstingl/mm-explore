# CLAUDE.md — mm-explore

Session-Bootstrap für Claude beim Arbeiten am App-Code. Kurz halten — Details stehen im README.

## Required reading

In dieser Reihenfolge, bevor du auf technische Fragen antwortest:

1. Diese Datei
2. [`README.md`](README.md) — Architektur, Setup, Deploy, Schema
3. [`docs/superpowers/specs/2026-04-22-mm-explore-design.md`](docs/superpowers/specs/2026-04-22-mm-explore-design.md) — Original-Design-Spec mit Scope-Cuts

## Was ist das hier

Statische Travel-Companion-PWA. Vanilla HTML + Alpine.js + Open Props + Leaflet (CartoDB Voyager Tiles). Kein Build, kein Framework, kein Backend. Liest ein `travel.json` aus einem privaten Gist, cached offline via Service Worker. Installierbar aus Safari auf Home-Bildschirm.

Drei Modi via Bottom-Tab-Bar: **Unterwegs** (Drive-Card inkl. Candidate-Drive-Alternatives-Tabs), **Erleben** (Place-Picker + POI-Liste mit 📋/🗺️/🚙-Actions), **Entdecken** (Leaflet-Karte mit Route-Polyline, Candidate-Drives dashed, Place-POI-Cluster beim Tap).

Live: https://michaelstingl.github.io/mm-explore/

Das Bundle (Content) lebt im Gist und wird aus einem Google-Drive-Ordner kuratiert — siehe `_app.md` in `~/Library/CloudStorage/GoogleDrive-.../My Drive/Italien 2026/_app.md` für Inhalte-Workflow.

## Harte Regeln

- **Keine npm-Laufzeit-Deps.** Alles von unpkg/Google Fonts CDN plus Vanilla. Bun nur dev-time (`dev.ts`, `tools/validate.ts`) und in der GH Action.
- **Keine Runtime-Framework-Swaps** (kein React, kein Vue) — Alpine bleibt. Styles via Open Props + Custom CSS.
- **Service Worker `VERSION` wird automatisch gestempelt** — nicht manuell anfassen. Die Action in `.github/workflows/deploy.yml` macht das.
- **PWA-Code ist reise-agnostisch.** Keine Italien-spezifischen Strings, Farben, POIs hartcodieren. Alles kommt aus dem Bundle.
- **Read-only Client.** Keine Writes zurück zum Gist aus der PWA. Niemals.
- **Sensible Daten** (PINs, Booking-IDs) sind NUR im Gist, NIE im Repo. `local/` ist gitignored und bleibt es.

## Sprache

- **UI-Text:** Deutsch (aus dem Bundle oder statisch im HTML)
- **Keys, Code, Kommentare:** Englisch
- **Commit-Messages:** Englisch, im Imperativ, erste Zeile < 72 Zeichen

## Deploy

Push auf `main` → GH Action → ~30-60s bis live. Die Action:
1. stempelt `VERSION = vYYYYMMDD-HHMMSS-<sha7>` in `sw.js`
2. schreibt `build.json` mit Commit-Metadaten
3. deployt auf Pages (Source: GitHub Actions, nicht Branch)

Die PWA pollt `build.json` alle 5 min und zeigt Update-Banner.

## Standard-Dev-Loop

```bash
bun dev                # oder: bun --hot dev.ts
# → http://localhost:8000 mit WS-Live-Reload
```

SW ist auf localhost deaktiviert. Erst auf Pages ist er aktiv.

Vor dem Commit:
```bash
bun run validate       # validiert local/travel-bundle-v1.json gegen schema/
```

## Bundle-Struktur

Vollständig in `schema/travel-bundle.schema.json`. Pflichtfelder:
- `schema_version: 1`
- `trip` mit `id`, `title`, `from_date`, `to_date`
- `days[]` mit `date` und `type` (`travel|stay|mixed`)

Optional: `drives[]`, `stays[]`, `places[]`.

IDs sind kebab-case, Daten ISO (`YYYY-MM-DD` oder `YYYY-MM-DDTHH:MM`). Coords als `[lat, lon]` Tupel (WGS84).

## Häufige Stolpersteine (gelöst, nicht wiederholen)

- **`<template>` als Alpine-x-for-Wrapper darf nur ein Root-Element enthalten.** Text-Children zwischen Kind-Elementen werden von Alpine gedroppt.
- **`<option :value="">` wird von Safari geflippt** zum Label-Text. Für „Auto"-Werte `'auto'` als expliziten String nehmen, nicht Empty-String.
- **iOS schneidet URL-Fragments beim „Zum Home-Bildschirm" ab.** Query-Parameter (`?gist=...`) statt Fragments (`#gist=...`) für Onboarding-URLs. Plus Service Worker rewritet `manifest.json` im Install-Moment, damit `start_url` den Query-Parameter mitnimmt.
- **`defer`-geladene Module (`type="module"`) laufen nach Alpine.** `alpine:init`-Listener verpassen das Event. `app.js` muss als klassisches `<script defer>` VOR dem Alpine-Script geladen werden.
- **Gist Raw hat 5 Min CDN-TTL.** Updates im Gist brauchen bis zu 5 Minuten bis der PWA-Fetch sie sieht. Kein Bug.
- **Safari SSE ist unzuverlässig.** Dev-Server nutzt WebSocket, nicht EventSource.
- **`<main>` darf keinen `transform` in Animationen haben.** Ein Transform auf `<main>` macht es zum Containing Block für alle `position: fixed`-Nachfahren — Tab-Bar, Toast, Day-Picker-Sheet, Modals landen dann relativ zu `<main>` statt zum Viewport und wirken „verschwunden" bei Scroll. `@keyframes page-in` nur mit `opacity`, nie `translateY`.
- **Alpine `x-data`-Scope evaluiert Init-Expressions nur einmal.** Wenn eine lokale Variable von reaktiven Root-State abhängt (z.B. `drive: findDrive(todayDay.drive_id)`), brauchst du `x-init="$watch('todayDay', d => { drive = findDrive(d?.drive_id); })"` — sonst bleibt der Wert bei Tageswechsel stale.
- **Leaflet `fitBounds` auf 0×0-Container verrechnet sich** und zoomt eng auf den geometrischen Mittelpunkt aller Pins (für diese Reise: Adria vor Rimini). Erst `invalidateSize` dann `fitBounds`, beide in einem `setTimeout(…, 100)`.
- **Leaflet-Map darf nicht per `x-if` auf-/abgebaut werden** — Leaflet hält intern eine Referenz auf den DOM-Container; nach Remount ist die Map leer. Stattdessen `x-show` + Lazy-Init beim ersten `setMode('discover')`.
- **`button.btn-secondary` überstimmt `.btn-secondary`** per Spezifität. Wenn du einen Border willst, Selektoren paaren: `.btn-secondary, button.btn-secondary { … }`. Gilt analog für Link-Varianten.

## Debug

`mmDebug(true)` in der Browser-Console oder Settings → Debug-Modus. Dann:
- `[mm]`-prefixed console logs
- Ring-Buffer-Log in `localStorage` (letzte 200 Events)
- Snapshot-Panel in Settings mit Build-Version, Runtime-State, Bundle-Stats

## Wenn etwas gebaut werden soll

- **Features:** zuerst im Design-Spec prüfen ob Scope-Cut — wenn ja, erst klären, nicht einfach bauen
- **UI-Änderungen:** Open-Props-Tokens + Fraunces/Newsreader beibehalten, keine neuen Webfont-Familien
- **Schema-Änderungen:** `schema/travel-bundle.schema.json` updaten + `schema_version` bumpen + Migration dokumentieren
- **Vor Deploy:** `bun run validate` gegen das lokale Bundle

## Quirks

- **Fahrzeug ER-MM25E, VW ID.7** — aber das ist Reise-spezifisch, nicht App-Code. Nichts davon im Code hartcodieren.
- **VW We Connect hat kein öffentliches URL-Schema** — „An Fahrzeug senden" via App haben wir recherchiert, geht nicht für VW. Apple Maps als Default-Picker, Copy-Location-Button als Workaround.
- **Build-Timestamp nutzt UTC.** In der Anzeige wird per `toLocaleString(this.locale)` umgerechnet.
