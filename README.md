# M+M Explore

Reiseplan-App ohne Backend. Liest einen privaten Gist, funktioniert offline, lässt sich aus Safari zum Home-Bildschirm hinzufügen.

**Live:** https://michaelstingl.github.io/mm-explore/
**Design-Spec:** [`docs/superpowers/specs/2026-04-22-mm-explore-design.md`](docs/superpowers/specs/2026-04-22-mm-explore-design.md)
**Schema:** [`schema/travel-bundle.schema.json`](schema/travel-bundle.schema.json) · [Live-URL](https://michaelstingl.github.io/mm-explore/schema/travel-bundle.schema.json)

---

## Wie es funktioniert

```
Reiseinhalte als Markdown mit YAML-Frontmatter (Drive / Obsidian / wo auch immer)
       │
       │  manuell oder per Skript extrahiert
       ▼
Privater Gist (unlisted URL, enthält travel.json)
       │
       │  fetch beim App-Start, Cache via Service Worker
       ▼
Statische PWA auf GitHub Pages (Alpine.js + Open Props, kein Build)
       │
       ▼
iPhone, Home-Bildschirm, offline-tauglich
```

Kein Backend, keine Accounts, kein Login. Wer die Gist-URL kennt, sieht die Daten — das ist der ganze Security-Layer. Entsprechend keine Passwörter oder sensiblen Tokens ins Bundle packen.

## Features

- **Zwei Modi** — Unterwegs (Fahrt + Abend-Unterkunft) und Erleben (Orts-Picker + POIs)
- **Kalender-Sheet** mit Icons pro Tag, zeigt nur Reise-Wochen
- **Navigation-App wählbar** — Apple Maps, Google Maps, Waze (system-default sonst)
- **Koordinaten-Copy-Button** neben jedem Ort → in myVW oder Notes einfügen
- **Offline-fähig** — Service Worker cached Shell + Bundle, letzte Daten bleiben verfügbar
- **Share-Trip** — generiert Onboarding-Link mit Gist-URL als Query-Parameter, einmal tappen und die Empfängerin hat die komplette Reise
- **Update-Banner** wenn neuer Build deployt wurde
- **Locale-Switcher** — Auto / DE / AT / CH / EN-US / EN-GB / IT / FR
- **Debug-Mode** mit persistiertem Event-Log für User-Journey-Forensik
- **JSON Schema** für das Bundle — VS Code bietet Autocomplete beim Editieren des Gists

## Repository-Struktur

```
index.html                           UI, Alpine-Templates
app.js                               Alpine-State, Logik, Helper
styles.css                           Tokens + Komponenten (Fraunces + Newsreader)
sw.js                                Service Worker (Shell-Cache + Gist-Network-First + Manifest-Rewrite)
manifest.json                        PWA-Metadaten
dev.ts                               Bun-Dev-Server mit WebSocket-Live-Reload
icons/                               192, 512, apple-touch, Source-SVG
schema/
  └── travel-bundle.schema.json      JSON Schema 2020-12 für das Bundle
tools/
  └── validate.ts                    Bundle-Validator (lokal oder Remote-URL)
.github/workflows/
  └── deploy.yml                     Auto-Version + Pages-Deploy
docs/superpowers/
  ├── specs/…-design.md              Ursprünglicher Design-Spec
  └── plans/…-mvp.md                 Implementation-Plan
local/                               gitignored — lokale Arbeitskopie des Bundles mit PINs
```

---

## Bundle-Schema

Jedes Bundle ist eine einzige `travel.json`-Datei. Formale Spezifikation als JSON Schema 2020-12:

- **Repo-Pfad:** [`schema/travel-bundle.schema.json`](schema/travel-bundle.schema.json)
- **Live-URL:** https://michaelstingl.github.io/mm-explore/schema/travel-bundle.schema.json

Um in VS Code (oder jedem IDE mit JSON-Schema-Support) Autocomplete + Inline-Validation zu bekommen, lege den `$schema`-Pointer als erstes Feld ins Bundle:

```json
{
  "$schema": "https://michaelstingl.github.io/mm-explore/schema/travel-bundle.schema.json",
  "schema_version": 1,
  "trip": { ... },
  "days":   [ ... ],
  "drives": [ ... ],
  "stays":  [ ... ],
  "places": [ ... ]
}
```

### Ebenen auf einen Blick

| Feld | Was | Required |
|---|---|---|
| `trip` | Metadaten der Reise (Titel, Datumsbereich, Fahrzeug, Theme-Farben) | ja |
| `days[]` | Chronologische Liste aller Reisetage mit `type` (`travel` / `stay` / `mixed`) und Verweisen auf `drive_id` / `stay_id` | ja |
| `drives[]` | Fahrten mit `from` / `to` / `km` / `duration_min` / `route` / `stops[]` | optional |
| `stays[]` | Unterkünfte mit `coords` / `phone` / `check_in` / `booking.pin` | optional |
| `places[]` | Gruppierte POIs — für Erleben-Modus. Jeder Place hat `pois[]` mit `type` (`sight` / `food` / `beach` / `charge` / `other`) | optional |

Referenzielle Integrität (z.B. `day.drive_id` muss in `drives[]` existieren) wird vom Schema dokumentiert aber nicht erzwungen — der App-Code behandelt dangling refs als "not found" ohne Crash.

### Theme

Farben im Bundle überschreiben CSS-Custom-Properties beim Load. Alle vier optional, fehlende Werte fallen auf App-Defaults zurück.

```json
"theme": {
  "primary":    "#E8743B",
  "accent":     "#2E5266",
  "background": "#F7EFDC",
  "text":       "#2A1F1A"
}
```

---

## Lokale Entwicklung

### Voraussetzungen

- [Bun](https://bun.sh) (für Dev-Server und Validator)
- macOS Safari oder Chrome für lokale Tests
- (optional) Xcode Simulator für iOS-Safari-Tests vor Deploy

### Setup

```bash
git clone git@github.com:michaelstingl/mm-explore.git
cd mm-explore
bun install        # zieht ajv + ajv-formats (nur devDependencies, keine Runtime-Deps)
```

### Dev-Server starten

```bash
bun dev
# oder direkt: bun --hot dev.ts
```

Öffnet http://localhost:8000 mit WebSocket-Live-Reload. Jede Datei-Änderung triggert einen Browser-Reload, mit Zeitstempeln und Datei-Liste in der Dev-Console:

```
  M+M Explore · dev server
  → http://localhost:8000
  → live-reload via WebSocket

13:15:42 🔌 client connected (1 total)
13:15:45 200 GET /                      18.4 kB
13:15:45 200 GET /styles.css            12.6 kB
13:16:12 🔄 reload → 1 client · styles.css
```

Der Service Worker ist auf `localhost` deaktiviert, damit Dev-Loops nicht gegen Cache kämpfen.

### Bundle validieren

```bash
bun run validate                           # local/travel-bundle-v1.json
bun run validate path/to/other.json        # spezifische Datei
bun run validate https://gist.../raw.json  # Remote-URL
```

Gibt entweder `✓ valid` mit einer Mini-Summary (trip title, counts) oder eine Liste der Validation-Fehler.

---

## Deployment

Jeder Push auf `main` löst [`deploy.yml`](.github/workflows/deploy.yml) aus:

1. **Version stempeln** — `VERSION = vYYYYMMDD-HHMMSS-<sha7>` wird in `sw.js` per `sed` reingeschrieben. Bricht damit die alten Shell-Caches beim nächsten SW-Cycle.
2. **Build-Metadaten** — `build.json` mit Commit-Hash, Commit-Message und Deploy-Timestamp wird erzeugt und mitdeployt.
3. **Artifact** — komplettes Repo-Verzeichnis geht als Pages-Artifact raus.
4. **Deploy** — `actions/deploy-pages@v4` publisht auf `https://michaelstingl.github.io/mm-explore/`.

Deploy dauert typisch 30-60 Sekunden nach dem Push. Die App pollt alle 5 Minuten `build.json` und zeigt einen "Update verfügbar"-Banner, sobald sich die Version unterscheidet.

### Pages-Einstellungen

GitHub → Repo → Settings → Pages → Source: **GitHub Actions** (nicht "Deploy from a branch").

---

## Onboarding aufs iPhone

1. Am Desktop/Laptop: Settings (⚙) → **Reise teilen 📤** → iMessage/AirDrop an dein iPhone
2. Der Link hat die Form `https://michaelstingl.github.io/mm-explore/?gist=<encoded-gist-url>`
3. Auf iPhone Safari öffnen → PWA lädt den Gist, rendert den ersten Tag
4. Safari-Share-Sheet → **Zum Home-Bildschirm** → Name bestätigen, Add
5. Ab jetzt immer vom Home-Screen öffnen

### Warum Query-Parameter und nicht Fragment?

Fragment-URLs (`#gist=...`) werden von iOS beim "Zum Home-Bildschirm" **abgeschnitten**. Query-Parameter (`?gist=...`) bleiben Teil des `start_url` und funktionieren.

Zusätzlich schreibt unser Service Worker die `manifest.json` im Install-Moment dynamisch um und setzt `start_url` auf die aktuelle URL inklusive Gist-Parameter. Ohne diesen Trick hätte die vom Home-Screen gestartete PWA einen separaten `localStorage` ohne Gist-URL — eine bekannte iOS-Eigenheit.

### Eine Person — wenn's schiefgeht

Alten Icon löschen → Safari-Verlauf leeren (Einstellungen → Safari) → Share-URL neu öffnen → Zum Home-Bildschirm. Damit liegt ein sauberer State an.

---

## Debugging

Drei Wege, Debug einzuschalten:

| Methode | Trigger | Überlebt Reload? |
|---|---|---|
| Settings-Switch | Settings → Debug-Modus | ja |
| Console | `mmDebug(true)` / `mmDebug(false)` | ja |
| Query-Parameter | `?date=2026-04-24` zum Simulieren eines anderen Tages | nein |

Mit Debug aktiv:

- **Console-Logs** mit `[mm]`-Prefix für init, Fetch-Timing, Mode-/Date-/Maps-Klicks
- **Ring-Buffer-Log** der letzten 200 Events, persistiert in `localStorage`
- **Snapshot-Panel** in Settings zeigt Build-Version, Runtime-State, Bundle-Stats
- **Kopierbar** über 📋-Buttons — für Bug-Reports oder zum Vergleich zweier Sessions

Log-Kategorien: `init` · `user` (Klicks) · `net` (Fetches) · `warn` · `err` · `log`.

---

## Daten aktualisieren

Aktuell manuell: Gist auf https://gist.github.com editieren. GitHub Raw hat einen 5-Minuten-Cache, dann zieht "Jetzt neu laden" in den Settings die neue Version. Bei Schema-Änderung validieren:

```bash
bun run validate https://gist.githubusercontent.com/USER/ID/raw/travel-bundle-v1.json
```

Geplant (post-MVP):

- `tools/build-bundle.ts` scannt Markdown-Dateien mit YAML-Frontmatter und PATCHt den Gist automatisch
- Krusty (persönlicher Signal-Bot) bekommt einen Gist-Skill und kann per DM editieren
- Optionaler Karten-View mit Leaflet + GPX-Overlay

---

## Tech-Stack

- **HTML** — eine Datei, Alpine.js-Templates via `x-data` / `x-for` / `x-if`
- **JS** — Alpine.js 3.x via CDN (`<script defer>`), eigener Code in `app.js`
- **CSS** — Open Props als Token-Basis, Fraunces + Newsreader als Display-Paar, hand-getunete Komponenten in `styles.css`
- **Service Worker** — vanilla, cache-first für Shell, network-first für Gist-Raw, dynamisches Manifest-Rewrite
- **Persistence** — `localStorage` (Gist-URL, Bundle-Cache, Settings, Debug-Log)
- **Dev-Server** — Bun mit `--hot`, File-Watcher und WebSocket-Live-Reload in ~80 Zeilen
- **Deploy** — GitHub Actions → Pages (Source: Actions)
- **Validation** — Ajv 2020 mit dem JSON Schema aus diesem Repo

Keine npm-Laufzeit-Deps, kein Build-Step, kein Bundler. Die einzigen externen Ressourcen sind Alpine.js und Open Props von unpkg plus Fraunces/Newsreader von Google Fonts, alle im Service-Worker-Cache.

---

## Nicht-Ziele

- **Kein Write-Pfad aus der App** — read-only, strukturell
- **Kein Multi-Trip-Support in v1** — ein Gist = eine Reise. Trip-Wechsel bedeutet neue Gist-URL
- **Kein Mapping/GPX** in v1 — kommt später optional mit Leaflet
- **Keine native Navigation-Integration** für VW We Connect — es gibt kein öffentliches URL-Schema, Apple Maps' "An Fahrzeug senden" unterstützt VW nicht

---

## Lizenz

Persönliches Projekt, keine formelle Lizenz. Der Code ist als Vorlage für andere Reisen gedacht — fork und adapt.
