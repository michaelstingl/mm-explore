# M+M Explore MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Statische PWA „M+M Explore" mit Reisen/Erleben-Modus, lauffähig auf Martinas iPhone am 2026-04-24, Daten aus privatem Gist.

**Architecture:** Vanilla HTML + Alpine.js (CDN) + Open Props (CDN) + Hand-rolled Service Worker. Single `index.html`, `app.js`, `styles.css`, `sw.js`, `manifest.json`. Deploy via GitHub Pages aus `main` Branch. Daten lebt im privaten Gist, PWA fetcht JSON per `fetch()`, cached in `localStorage`.

**Tech Stack:** HTML5, ES Modules, Alpine.js 3, Open Props, Service Worker API, `navigator.share()`.

**Review-Checkpoints:** Nach jeder Phase stoppe ich und zeige dir den aktuellen Stand. Du bestätigst oder wünschst Änderungen.

- **Checkpoint A:** Scaffold & Theme (App-Shell läuft, sieht aus)
- **Checkpoint B:** Reisen-Modus (mit echten Italien-Daten)
- **Checkpoint C:** Erleben-Modus + Modus-Switch
- **Checkpoint D:** Settings + Share-Trip
- **Checkpoint E:** PWA installierbar + offline-fähig
- **Final:** Deploy auf GitHub Pages + Smoke-Test auf iPhone

---

## Phase 1 — Scaffold & Theme (Checkpoint A)

### Task 1: Repo-Grundstruktur

**Files:**
- Create: `index.html`, `app.js`, `styles.css`, `manifest.json`, `sw.js`, `.gitignore`, `README.md`

- [ ] **Step 1.1: .gitignore**

Create `.gitignore`:
```
.DS_Store
node_modules/
.vscode/
*.log
.env
local/
```

- [ ] **Step 1.2: Minimales index.html**

Create `index.html`:
```html
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="default">
  <meta name="apple-mobile-web-app-title" content="M+M Explore">
  <title>M+M Explore</title>
  <link rel="manifest" href="./manifest.json">
  <link rel="apple-touch-icon" href="./icons/icon-192.png">
  <link rel="stylesheet" href="https://unpkg.com/open-props/open-props.min.css">
  <link rel="stylesheet" href="./styles.css">
  <script defer src="https://unpkg.com/alpinejs@3.x.x/dist/cdn.min.js"></script>
  <script type="module" src="./app.js"></script>
</head>
<body>
  <main x-data="app" x-cloak>
    <header>
      <h1 x-text="bundle?.trip?.title || 'M+M Explore'"></h1>
      <button @click="view = 'settings'" aria-label="Einstellungen">⚙</button>
    </header>
    <p>Hello world — scaffold läuft.</p>
  </main>
</body>
</html>
```

- [ ] **Step 1.3: Minimales app.js**

Create `app.js`:
```javascript
document.addEventListener('alpine:init', () => {
  Alpine.data('app', () => ({
    bundle: null,
    view: 'main',
    mode: 'reisen',
    init() {
      console.log('M+M Explore: app initialized');
    }
  }));
});
```

- [ ] **Step 1.4: Minimales styles.css**

Create `styles.css`:
```css
[x-cloak] { display: none !important; }

body {
  margin: 0;
  padding: 0;
  font-family: var(--font-sans);
  background: var(--color-bg, #FAF4E8);
  color: var(--color-text, #1A1A1A);
  padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);
}

main {
  max-width: 640px;
  margin: 0 auto;
  padding: var(--size-4);
}

header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--size-5);
}

header h1 {
  font-size: var(--font-size-5);
  margin: 0;
}

header button {
  background: none;
  border: none;
  font-size: var(--font-size-4);
  cursor: pointer;
  padding: var(--size-2);
}
```

- [ ] **Step 1.5: Manifest**

Create `manifest.json`:
```json
{
  "name": "M+M Explore",
  "short_name": "MM Explore",
  "start_url": "./",
  "display": "standalone",
  "background_color": "#FAF4E8",
  "theme_color": "#E8743B",
  "orientation": "portrait",
  "icons": [
    { "src": "./icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "./icons/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

- [ ] **Step 1.6: SW-Platzhalter**

Create `sw.js`:
```javascript
// Service Worker placeholder — implementation in Phase 5
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
```

- [ ] **Step 1.7: README**

Create `README.md`:
```markdown
# M+M Explore

Generische Travel-Companion PWA. Read-only-Client für Reisedaten aus einem privaten Gist.

Siehe [Design-Spec](docs/superpowers/specs/2026-04-22-mm-explore-design.md).

## Lokaler Dev-Server

```bash
python3 -m http.server 8000
```

Dann Safari auf http://localhost:8000
```

- [ ] **Step 1.8: Dev-Server starten & verifizieren**

Run: `cd /Users/michaelstingl/Developer/github.com/michaelstingl/mm-explore && python3 -m http.server 8000`
Browser: http://localhost:8000
Expected: Seite mit "M+M Explore" Header und "Hello world — scaffold läuft." Kein Fehler in Console.

- [ ] **Step 1.9: Commit**

```bash
git add .
git commit -m "feat: scaffold PWA shell with Alpine.js and Open Props"
```

---

### Task 2: App-State-Struktur + Bundle-Laden

**Files:**
- Modify: `app.js`

- [ ] **Step 2.1: State erweitern**

Replace `app.js` content:
```javascript
const STORAGE_KEY = {
  GIST_URL: 'mm_gist_url',
  BUNDLE: 'mm_bundle_cache',
  BUNDLE_TIMESTAMP: 'mm_bundle_timestamp',
  MODE_OVERRIDE: 'mm_mode_override',
  LAST_PLACE: 'mm_last_place'
};

document.addEventListener('alpine:init', () => {
  Alpine.data('app', () => ({
    // State
    bundle: null,
    loading: true,
    error: null,
    offline: false,
    view: 'main',           // 'main' | 'settings'
    mode: 'reisen',         // 'reisen' | 'erleben'
    manualOverride: false,
    selectedPlaceId: null,
    gistUrl: '',
    lastUpdated: null,

    // Computed
    get today() {
      return new Date().toISOString().slice(0, 10); // 'YYYY-MM-DD'
    },
    get todayDay() {
      if (!this.bundle?.days) return null;
      return this.bundle.days.find(d => d.date === this.today) || null;
    },
    get tripState() {
      if (!this.bundle?.trip) return 'unknown';
      if (this.today < this.bundle.trip.from_date) return 'before';
      if (this.today > this.bundle.trip.to_date) return 'after';
      return 'during';
    },

    // Lifecycle
    async init() {
      console.log('M+M Explore: init');
      this.parseFragment();
      this.gistUrl = localStorage.getItem(STORAGE_KEY.GIST_URL) || '';
      this.loadCachedBundle();
      await this.fetchBundle();
      this.applyTheme();
      this.pickDefaultMode();
    },

    parseFragment() {
      const hash = window.location.hash;
      const match = hash.match(/#gist=(.+)/);
      if (match) {
        const decoded = decodeURIComponent(match[1]);
        localStorage.setItem(STORAGE_KEY.GIST_URL, decoded);
        // Clean URL
        history.replaceState(null, '', window.location.pathname + window.location.search);
      }
    },

    loadCachedBundle() {
      const cached = localStorage.getItem(STORAGE_KEY.BUNDLE);
      if (cached) {
        try {
          this.bundle = JSON.parse(cached);
          this.lastUpdated = localStorage.getItem(STORAGE_KEY.BUNDLE_TIMESTAMP);
        } catch (e) {
          console.warn('Cached bundle malformed, ignoring', e);
        }
      }
    },

    async fetchBundle() {
      const url = localStorage.getItem(STORAGE_KEY.GIST_URL);
      if (!url) {
        this.loading = false;
        this.view = 'settings';
        return;
      }
      try {
        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        this.bundle = data;
        localStorage.setItem(STORAGE_KEY.BUNDLE, JSON.stringify(data));
        const ts = new Date().toISOString();
        localStorage.setItem(STORAGE_KEY.BUNDLE_TIMESTAMP, ts);
        this.lastUpdated = ts;
        this.offline = false;
      } catch (e) {
        console.warn('Fetch failed, using cache', e);
        this.offline = true;
        if (!this.bundle) this.error = 'offline-no-cache';
      } finally {
        this.loading = false;
      }
    },

    applyTheme() {
      const theme = this.bundle?.trip?.theme;
      if (!theme) return;
      const root = document.documentElement.style;
      if (theme.primary) root.setProperty('--color-primary', theme.primary);
      if (theme.accent) root.setProperty('--color-accent', theme.accent);
      if (theme.background) root.setProperty('--color-bg', theme.background);
      if (theme.text) root.setProperty('--color-text', theme.text);
    },

    pickDefaultMode() {
      const override = localStorage.getItem(STORAGE_KEY.MODE_OVERRIDE);
      if (override === 'reisen' || override === 'erleben') {
        this.mode = override;
        this.manualOverride = true;
        return;
      }
      const day = this.todayDay;
      if (day?.type === 'travel') this.mode = 'reisen';
      else this.mode = 'erleben';
    },

    setMode(m) {
      this.mode = m;
      this.manualOverride = true;
      localStorage.setItem(STORAGE_KEY.MODE_OVERRIDE, m);
    },

    clearModeOverride() {
      this.manualOverride = false;
      localStorage.removeItem(STORAGE_KEY.MODE_OVERRIDE);
      this.pickDefaultMode();
    }
  }));
});
```

- [ ] **Step 2.2: Verifizieren in Browser**

Browser: http://localhost:8000
Expected: Keine JS-Fehler. Console zeigt "M+M Explore: init". `app.view === 'settings'` weil keine Gist-URL.

- [ ] **Step 2.3: Commit**

```bash
git add app.js
git commit -m "feat: app state, fragment parsing, bundle fetch with cache fallback"
```

---

### Task 3: Bundle-Extraktion aus Drive-Files

**Files:**
- Create: `local/travel-bundle-v1.json` (nicht committet, nur lokal)

Dies ist eine **einmalige manuelle Aufgabe** — ich (Claude) scanne die Drive-Files und baue das JSON. Kein Script nötig für MVP.

- [ ] **Step 3.1: Drive-Ordner scannen**

Lese:
```
/Users/michaelstingl/Library/CloudStorage/GoogleDrive-herr.stingl@gmail.com/My Drive/Italien 2026/
  - 2026-04-24-route-hinfahrt.md
  - 2026-04-24-fahrt-erlangen-rovereto.md
  - 2026-04-24-unterkunft-rovereto.md
  - 2026-04-25-fahrt-rovereto-ceprano.md
  - 2026-04-25-unterkunft-ceprano.md
  - 2026-04-26-fahrt-ceprano-tropea.md
  - 2026-04-26-unterkunft-tropea.md
  - 2026-05-03-fahrt-tropea-kalabrien2.md
  - 2026-05-03-rueckweg.md
  - 2026-05-06-fahrt-kalabrien2-vieste.md
  - 2026-05-11-fahrt-vieste-sirolo.md
  - 2026-05-14-fahrt-sirolo-como.md
  - 2026-05-16-fahrt-como-ravensburg.md
  - 2026-05-17-fahrt-ravensburg-erlangen.md
  - poi-tropea-umgebung.md
  - poi-katalog.md
```

Parse YAML-Frontmatter, extrahiere strukturierte Felder.

- [ ] **Step 3.2: travel.json generieren**

Schreibe nach `/Users/michaelstingl/Developer/github.com/michaelstingl/mm-explore/local/travel-bundle-v1.json` (lokal, nicht committet — `local/` ist in .gitignore).

Format: gemäß Spec (trip, days, drives, stays, places).

Default-Theme für Italien 2026:
```json
{
  "primary": "#E8743B",
  "accent": "#2E5266",
  "background": "#FAF4E8",
  "text": "#1A1A1A"
}
```

- [ ] **Step 3.3: JSON lokal auf Validität prüfen**

Run: `python3 -c "import json; json.load(open('local/travel-bundle-v1.json'))" && echo OK`
Expected: `OK`

- [ ] **Step 3.4: Michael-Review**

Ich zeige dir das generierte JSON, du prüfst: stimmen Fakten? Fehlt was Wichtiges? Dann committen wir Änderungen im JSON (nicht im Repo).

**KEIN Commit in dieser Task — das JSON lebt später im Gist, nicht im Repo.**

---

### Task 4: Gist erstellen

- [ ] **Step 4.1: Michael erstellt Gist**

Michael:
1. Öffnet https://gist.github.com
2. Filename: `travel.json`
3. Content: Inhalt von `local/travel-bundle-v1.json`
4. Sichtbarkeit: **secret** (nicht public!)
5. Klickt „Create secret gist"
6. Kopiert die **Raw-URL** (Button „Raw" oben rechts) — Format: `https://gist.githubusercontent.com/michaelstingl/HASH/raw/HASH/travel.json`

- [ ] **Step 4.2: URL für Test merken**

Die Raw-URL brauchen wir gleich für den Settings-Flow und den Smoke-Test.

- [ ] **Step 4.3: Smoke-Test Fetch**

Run: `curl -sSL '<RAW-URL>' | python3 -c "import json, sys; json.load(sys.stdin); print('OK')"`
Expected: `OK`

---

### Task 5: Settings-View (minimal, für Dev)

**Files:**
- Modify: `index.html`

- [ ] **Step 5.1: Settings-View im Template**

Ersetze den `<main>`-Block in `index.html` mit:
```html
<main x-data="app" x-cloak>
  <header>
    <h1 x-text="bundle?.trip?.title || 'M+M Explore'"></h1>
    <button @click="view = (view === 'settings' ? 'main' : 'settings')" aria-label="Einstellungen">⚙</button>
  </header>

  <!-- Loading -->
  <template x-if="loading">
    <p>Lade…</p>
  </template>

  <!-- Error: No gist configured -->
  <template x-if="!loading && !bundle && view !== 'settings'">
    <div class="empty">
      <p>Noch keine Reise eingerichtet.</p>
      <button @click="view = 'settings'">Einrichten</button>
    </div>
  </template>

  <!-- Settings -->
  <template x-if="view === 'settings'">
    <section class="settings">
      <h2>Einstellungen</h2>
      <label>
        Gist-URL
        <input type="url" x-model="gistUrl" placeholder="https://gist.githubusercontent.com/...">
      </label>
      <button @click="saveGistUrl()">Speichern & laden</button>

      <hr>

      <button @click="fetchBundle()" :disabled="!gistUrl">Jetzt neu laden</button>
      <p x-show="lastUpdated" class="muted">
        Zuletzt aktualisiert: <span x-text="new Date(lastUpdated).toLocaleString('de-DE')"></span>
      </p>

      <hr>

      <button @click="resetApp()" class="danger">Reset (alles löschen)</button>
    </section>
  </template>

  <!-- Main view -->
  <template x-if="view === 'main' && bundle">
    <section>
      <p x-show="offline" class="banner-offline">Offline — Daten vom letzten Laden</p>

      <nav class="mode-toggle">
        <button :class="mode === 'reisen' ? 'active' : ''" @click="setMode('reisen')">Reisen 🚗</button>
        <button :class="mode === 'erleben' ? 'active' : ''" @click="setMode('erleben')">Erleben 🏖️</button>
      </nav>

      <!-- Placeholder until Reisen/Erleben views implemented -->
      <p>Modus: <strong x-text="mode"></strong></p>
      <p>Heute: <span x-text="today"></span>, Trip-Status: <span x-text="tripState"></span></p>
    </section>
  </template>
</main>
```

- [ ] **Step 5.2: Settings-Actions in app.js**

Füge im `Alpine.data('app')`-Return am Ende der Methoden (vor der schließenden Klammer) hinzu:
```javascript
saveGistUrl() {
  if (!this.gistUrl.trim()) return;
  localStorage.setItem(STORAGE_KEY.GIST_URL, this.gistUrl.trim());
  this.view = 'main';
  this.loading = true;
  this.fetchBundle().then(() => {
    this.applyTheme();
    this.pickDefaultMode();
  });
},

resetApp() {
  if (!confirm('Wirklich alle Daten löschen?')) return;
  Object.values(STORAGE_KEY).forEach(k => localStorage.removeItem(k));
  location.reload();
}
```

- [ ] **Step 5.3: Styles für Settings + Toggle**

Append to `styles.css`:
```css
.settings {
  display: flex;
  flex-direction: column;
  gap: var(--size-3);
}

.settings label {
  display: flex;
  flex-direction: column;
  gap: var(--size-1);
}

.settings input[type="url"] {
  padding: var(--size-2);
  font-size: var(--font-size-2);
  border: 1px solid var(--color-accent, #888);
  border-radius: var(--radius-2);
}

.settings button {
  padding: var(--size-2) var(--size-3);
  background: var(--color-primary, #333);
  color: white;
  border: none;
  border-radius: var(--radius-2);
  cursor: pointer;
  font-size: var(--font-size-2);
}

.settings button.danger {
  background: var(--red-7);
}

.settings hr {
  border: none;
  border-top: 1px solid var(--stone-3);
  margin: var(--size-3) 0;
}

.muted {
  color: var(--stone-7);
  font-size: var(--font-size-1);
}

.banner-offline {
  background: var(--yellow-3);
  color: var(--stone-12);
  padding: var(--size-2);
  border-radius: var(--radius-2);
  font-size: var(--font-size-1);
  margin-bottom: var(--size-3);
}

.mode-toggle {
  display: flex;
  gap: var(--size-1);
  background: var(--stone-2);
  padding: var(--size-1);
  border-radius: var(--radius-3);
  margin-bottom: var(--size-4);
}

.mode-toggle button {
  flex: 1;
  background: transparent;
  border: none;
  padding: var(--size-2);
  border-radius: var(--radius-2);
  cursor: pointer;
  font-size: var(--font-size-2);
}

.mode-toggle button.active {
  background: var(--color-primary, #333);
  color: white;
}
```

- [ ] **Step 5.4: Manuell testen**

Browser: http://localhost:8000
1. Settings-View erscheint (keine Gist-URL da)
2. Gist-URL aus Task 4 einfügen, Speichern klicken
3. Main-View erscheint, Title ist „Italien 2026", Modus-Toggle funktioniert
4. ⚙ klicken → Settings zurück, „Zuletzt aktualisiert" zeigt Datum
5. „Jetzt neu laden" klickt → ok
6. Reload Browser → Main-View lädt direkt (localStorage)

- [ ] **Step 5.5: Commit**

```bash
git add index.html app.js styles.css
git commit -m "feat: settings view, mode toggle, gist URL management"
```

---

### ✋ CHECKPOINT A — Review mit Michael

**Ich stoppe hier.** Wir öffnen http://localhost:8000, du klickst durch, sagst „passt" oder „ändere X". Danach Phase 2.

---

## Phase 2 — Reisen-Modus (Checkpoint B)

### Task 6: Reisen-View Rendering

**Files:**
- Modify: `index.html`, `app.js`

- [ ] **Step 6.1: Helper-Methoden in app.js**

Append in `Alpine.data('app')`:
```javascript
findDrive(driveId) {
  return this.bundle?.drives?.find(d => d.id === driveId) || null;
},

findStay(stayId) {
  return this.bundle?.stays?.find(s => s.id === stayId) || null;
},

findPlace(placeId) {
  return this.bundle?.places?.find(p => p.id === placeId) || null;
},

formatDuration(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}:${m.toString().padStart(2, '0')}`;
},

formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleString('de-DE', { weekday: 'short', hour: '2-digit', minute: '2-digit' });
}
```

- [ ] **Step 6.2: Reisen-View Template**

Ersetze im `index.html` den Placeholder `<p>Modus: ...</p>`-Block unter `<!-- Main view -->` mit:

```html
<!-- Reisen-Modus -->
<template x-if="mode === 'reisen' && bundle">
  <section class="reisen">
    <!-- Trip not started -->
    <template x-if="tripState === 'before'">
      <div class="card">
        <h2>Noch nicht losgefahren</h2>
        <p>Die Reise beginnt am <strong x-text="bundle.trip.from_date"></strong>.</p>
      </div>
    </template>

    <!-- Trip finished -->
    <template x-if="tripState === 'after'">
      <div class="card">
        <h2>Reise vorbei</h2>
        <p>Hoffe es war schön 💛</p>
      </div>
    </template>

    <!-- During trip, today is travel day -->
    <template x-if="tripState === 'during' && todayDay?.drive_id">
      <div>
        <!-- Drive card -->
        <article class="card drive-card" x-data="{ drive: findDrive(todayDay.drive_id) }">
          <h2 x-text="drive.from + ' → ' + drive.to"></h2>
          <p class="drive-meta">
            <span x-text="drive.km + ' km'"></span>
            <span>·</span>
            <span x-text="'~' + formatDuration(drive.duration_min) + ' h'"></span>
          </p>
          <a :href="drive.maps_url" target="_blank" class="btn-primary">In Maps öffnen</a>

          <template x-if="drive.stops?.length">
            <div class="stops">
              <h3>Ladestopps</h3>
              <ul>
                <template x-for="stop in drive.stops" :key="stop.name">
                  <li class="stop">
                    <div class="stop-main">
                      <strong x-text="stop.name"></strong>
                      <span class="muted" x-text="stop.km_ab_start + ' km · ' + stop.kw + ' kW · ' + stop.stop_min + ' min'"></span>
                    </div>
                    <a :href="stop.maps_url" target="_blank" x-show="stop.maps_url">→</a>
                  </li>
                </template>
              </ul>
            </div>
          </template>
        </article>

        <!-- Stay card -->
        <template x-if="todayDay.stay_id">
          <article class="card stay-card" x-data="{ stay: findStay(todayDay.stay_id), showDetails: false }">
            <h2>Heute Abend</h2>
            <p class="stay-name" x-text="stay.name"></p>
            <p class="muted" x-text="stay.address"></p>
            <p x-show="stay.check_in">
              Check-in ab <span x-text="formatDate(stay.check_in)"></span>
            </p>
            <div class="stay-actions">
              <a :href="stay.maps_url" target="_blank" class="btn-primary">Route</a>
              <a :href="'tel:' + stay.phone" x-show="stay.phone" class="btn-secondary">Anrufen</a>
              <button @click="showDetails = true" class="btn-secondary">Details</button>
            </div>

            <!-- Modal -->
            <div x-show="showDetails" class="modal-backdrop" @click="showDetails = false">
              <div class="modal" @click.stop>
                <h3 x-text="stay.name"></h3>
                <dl>
                  <dt>Adresse</dt><dd x-text="stay.address"></dd>
                  <dt x-show="stay.phone">Telefon</dt><dd x-show="stay.phone" x-text="stay.phone"></dd>
                  <dt x-show="stay.check_in">Check-in</dt><dd x-show="stay.check_in" x-text="formatDate(stay.check_in)"></dd>
                  <dt x-show="stay.check_out">Check-out</dt><dd x-show="stay.check_out" x-text="formatDate(stay.check_out)"></dd>
                  <template x-if="stay.booking">
                    <template>
                      <dt>Provider</dt><dd x-text="stay.booking.provider"></dd>
                      <dt x-show="stay.booking.id">Booking-ID</dt><dd x-show="stay.booking.id" x-text="stay.booking.id"></dd>
                      <dt x-show="stay.booking.pin">PIN</dt><dd x-show="stay.booking.pin" x-text="stay.booking.pin"></dd>
                    </template>
                  </template>
                </dl>
                <button @click="showDetails = false" class="btn-primary">Schließen</button>
              </div>
            </div>
          </article>
        </template>
      </div>
    </template>

    <!-- During trip, today is NOT travel day -->
    <template x-if="tripState === 'during' && !todayDay?.drive_id">
      <div class="card">
        <p>Heute kein Reisetag.</p>
        <button @click="setMode('erleben')" class="btn-primary">Zu Erleben wechseln</button>
      </div>
    </template>
  </section>
</template>
```

- [ ] **Step 6.3: Styles für Cards**

Append to `styles.css`:
```css
.card {
  background: white;
  border-radius: var(--radius-3);
  padding: var(--size-4);
  margin-bottom: var(--size-3);
  box-shadow: var(--shadow-2);
}

.card h2 {
  margin-top: 0;
  font-size: var(--font-size-4);
}

.card h3 {
  font-size: var(--font-size-3);
  margin-bottom: var(--size-2);
}

.drive-meta {
  display: flex;
  gap: var(--size-2);
  color: var(--stone-7);
  font-size: var(--font-size-2);
  margin-bottom: var(--size-3);
}

.btn-primary, .btn-secondary {
  display: inline-block;
  padding: var(--size-2) var(--size-3);
  border-radius: var(--radius-2);
  text-decoration: none;
  font-size: var(--font-size-2);
  cursor: pointer;
  border: none;
  text-align: center;
}

.btn-primary {
  background: var(--color-primary, #333);
  color: white;
}

.btn-secondary {
  background: var(--stone-2);
  color: var(--color-text, #1A1A1A);
}

.stops ul {
  list-style: none;
  padding: 0;
  margin: 0;
}

.stop {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--size-2) 0;
  border-bottom: 1px solid var(--stone-2);
}

.stop:last-child { border: none; }

.stop-main {
  display: flex;
  flex-direction: column;
}

.stay-card .stay-name {
  font-size: var(--font-size-3);
  font-weight: bold;
  margin: var(--size-2) 0 var(--size-1);
}

.stay-actions {
  display: flex;
  gap: var(--size-2);
  margin-top: var(--size-3);
  flex-wrap: wrap;
}

.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--size-4);
  z-index: 100;
}

.modal {
  background: white;
  border-radius: var(--radius-3);
  padding: var(--size-4);
  max-width: 500px;
  width: 100%;
  max-height: 80vh;
  overflow-y: auto;
}

.modal dl {
  display: grid;
  grid-template-columns: 1fr 2fr;
  gap: var(--size-2);
  margin-bottom: var(--size-3);
}

.modal dt {
  font-weight: bold;
  color: var(--stone-7);
}

.modal dd {
  margin: 0;
}
```

- [ ] **Step 6.4: Manuell testen**

Browser: http://localhost:8000
1. Reisen-View zeigt „Noch nicht losgefahren" (heute ist 2026-04-22, Reise startet 24.4.)
2. Um zu testen wie's am 24.4. aussieht: öffne DevTools → Console → `Alpine.data('app')` — kannst du `today` Computed temporär overriden? Einfacher: Ändere in `app.js` die `today`-Getter temporär zu `return '2026-04-24';`, Reload.
3. Expected: Drive-Karte „Erlangen → Rovereto", km, Stunden, Maps-Button, Ladestopps-Liste. Stay-Karte darunter. Details-Button öffnet Modal mit PIN.
4. Zurück setzen: `today`-Getter wieder auf `new Date().toISOString().slice(0, 10)`.

- [ ] **Step 6.5: Commit**

```bash
git add index.html app.js styles.css
git commit -m "feat: reisen mode with drive card, stops, and stay detail modal"
```

---

### ✋ CHECKPOINT B — Review mit Michael

**Ich zeige dir die Reisen-View mit echten Daten (Tage mocken wir per `today`-Override für den Test).** Du sagst „passt" / „Feld X fehlt" / „Layout Y ändern". Dann Phase 3.

---

## Phase 3 — Erleben-Modus (Checkpoint C)

### Task 7: Erleben-View Rendering

**Files:**
- Modify: `index.html`, `app.js`

- [ ] **Step 7.1: Place-Picker Logic**

Append in `Alpine.data('app')`:
```javascript
get defaultPlace() {
  const stay = this.todayDay ? this.findStay(this.todayDay.stay_id) : null;
  if (stay?.place_id) return this.findPlace(stay.place_id);
  const last = localStorage.getItem(STORAGE_KEY.LAST_PLACE);
  if (last) {
    const p = this.findPlace(last);
    if (p) return p;
  }
  return this.bundle?.places?.[0] || null;
},

get selectedPlace() {
  if (this.selectedPlaceId) return this.findPlace(this.selectedPlaceId);
  return this.defaultPlace;
},

selectPlace(id) {
  this.selectedPlaceId = id;
  localStorage.setItem(STORAGE_KEY.LAST_PLACE, id);
}
```

- [ ] **Step 7.2: Erleben-View Template**

Füge nach dem Reisen-`template`-Block in `index.html` ein:

```html
<!-- Erleben-Modus -->
<template x-if="mode === 'erleben' && bundle">
  <section class="erleben">
    <template x-if="!bundle.places?.length">
      <div class="card">
        <p>Keine Orte im Bundle.</p>
      </div>
    </template>

    <template x-if="bundle.places?.length">
      <div>
        <label class="place-picker">
          Wo seid ihr gerade?
          <select :value="selectedPlace?.id" @change="selectPlace($event.target.value)">
            <template x-for="place in bundle.places" :key="place.id">
              <option :value="place.id" :selected="place.id === selectedPlace?.id" x-text="place.name"></option>
            </template>
          </select>
        </label>

        <template x-if="selectedPlace">
          <div>
            <!-- Stay at this place (if any) -->
            <template x-for="stay in (bundle.stays || []).filter(s => s.place_id === selectedPlace.id)" :key="stay.id">
              <article class="card stay-card" x-data="{ showDetails: false }">
                <h3 x-text="stay.name"></h3>
                <p class="muted" x-text="stay.address"></p>
                <div class="stay-actions">
                  <a :href="stay.maps_url" target="_blank" x-show="stay.maps_url" class="btn-primary">Route</a>
                  <a :href="'tel:' + stay.phone" x-show="stay.phone" class="btn-secondary">Anrufen</a>
                  <button @click="showDetails = true" class="btn-secondary">Details</button>
                </div>
                <div x-show="showDetails" class="modal-backdrop" @click="showDetails = false">
                  <div class="modal" @click.stop>
                    <h3 x-text="stay.name"></h3>
                    <dl>
                      <dt>Adresse</dt><dd x-text="stay.address"></dd>
                      <dt x-show="stay.phone">Telefon</dt><dd x-show="stay.phone" x-text="stay.phone"></dd>
                      <dt x-show="stay.booking?.id">Booking-ID</dt><dd x-show="stay.booking?.id" x-text="stay.booking?.id"></dd>
                      <dt x-show="stay.booking?.pin">PIN</dt><dd x-show="stay.booking?.pin" x-text="stay.booking?.pin"></dd>
                    </dl>
                    <button @click="showDetails = false" class="btn-primary">Schließen</button>
                  </div>
                </div>
              </article>
            </template>

            <!-- POIs -->
            <template x-if="selectedPlace.pois?.length">
              <article class="card">
                <h3 x-text="'Orte in ' + selectedPlace.name"></h3>
                <ul class="poi-list">
                  <template x-for="poi in selectedPlace.pois" :key="poi.name">
                    <li class="poi">
                      <div class="poi-main">
                        <strong x-text="poi.name"></strong>
                        <span class="poi-type" x-text="poiIcon(poi.type)"></span>
                        <p class="muted" x-show="poi.note" x-text="poi.note"></p>
                      </div>
                      <a :href="poi.maps_url" x-show="poi.maps_url" target="_blank">→</a>
                    </li>
                  </template>
                </ul>
              </article>
            </template>

            <template x-if="!selectedPlace.pois?.length && !(bundle.stays || []).some(s => s.place_id === selectedPlace.id)">
              <div class="card">
                <p>Nichts für <strong x-text="selectedPlace.name"></strong> hinterlegt.</p>
              </div>
            </template>
          </div>
        </template>
      </div>
    </template>
  </section>
</template>
```

- [ ] **Step 7.3: poiIcon Helper in app.js**

Append:
```javascript
poiIcon(type) {
  const map = {
    sight: '🏛️',
    food: '🍽️',
    beach: '🏖️',
    charge: '⚡',
    other: '📍'
  };
  return map[type] || '📍';
}
```

- [ ] **Step 7.4: Styles für Erleben**

Append to `styles.css`:
```css
.place-picker {
  display: flex;
  flex-direction: column;
  gap: var(--size-1);
  margin-bottom: var(--size-3);
}

.place-picker select {
  padding: var(--size-2);
  font-size: var(--font-size-2);
  border: 1px solid var(--stone-3);
  border-radius: var(--radius-2);
  background: white;
}

.poi-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.poi {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: var(--size-3) 0;
  border-bottom: 1px solid var(--stone-2);
}

.poi:last-child { border: none; }

.poi-main {
  display: flex;
  flex-direction: column;
  gap: var(--size-1);
  flex: 1;
}

.poi-type {
  font-size: var(--font-size-1);
  color: var(--stone-7);
}

.poi a {
  font-size: var(--font-size-4);
  padding: var(--size-2);
  color: var(--color-primary, #333);
  text-decoration: none;
}
```

- [ ] **Step 7.5: Manuell testen**

Browser: http://localhost:8000
1. Toggle „Erleben" klicken
2. Dropdown zeigt Orte aus dem Bundle (Tropea, Vieste, …)
3. Default ausgewählt sein (heute bringt nichts → erster Ort)
4. Auswählen eines Orts → Unterkunft (falls vorhanden) + POI-Liste rendert
5. POI-Link öffnet Maps

- [ ] **Step 7.6: Commit**

```bash
git add index.html app.js styles.css
git commit -m "feat: erleben mode with place picker, stay and POI cards"
```

---

### ✋ CHECKPOINT C — Review mit Michael

**Du sagst: passt / ändere X.** Dann Phase 4.

---

## Phase 4 — Settings + Share (Checkpoint D)

### Task 8: Share-Trip-Button

**Files:**
- Modify: `index.html`, `app.js`

- [ ] **Step 8.1: Share-Methode in app.js**

Append in `Alpine.data('app')`:
```javascript
async shareTrip() {
  const gistUrl = localStorage.getItem(STORAGE_KEY.GIST_URL);
  if (!gistUrl) {
    alert('Keine Gist-URL konfiguriert.');
    return;
  }
  const shareUrl = `${location.origin}${location.pathname}#gist=${encodeURIComponent(gistUrl)}`;
  const shareData = {
    title: this.bundle?.trip?.title || 'M+M Explore',
    text: 'Unser Reise-Begleiter',
    url: shareUrl
  };
  if (navigator.share) {
    try {
      await navigator.share(shareData);
    } catch (e) {
      if (e.name !== 'AbortError') console.warn('Share failed', e);
    }
  } else {
    try {
      await navigator.clipboard.writeText(shareUrl);
      alert('Link kopiert!');
    } catch (e) {
      prompt('Link kopieren:', shareUrl);
    }
  }
}
```

- [ ] **Step 8.2: Button in Settings-View**

Im `index.html`, im Settings-Block zwischen „Jetzt neu laden" und dem `<hr>` vor Reset, füge ein:

```html
<hr>
<button @click="shareTrip()" :disabled="!gistUrl">Trip teilen 📤</button>
```

- [ ] **Step 8.3: Manuell testen**

Desktop Safari (keine `navigator.share`!) → klick „Trip teilen" → erwartet „Link kopiert!" Alert. URL im Clipboard sollte `.../#gist=<encoded>` enthalten.

- [ ] **Step 8.4: Commit**

```bash
git add index.html app.js
git commit -m "feat: share trip button with navigator.share fallback"
```

---

### ✋ CHECKPOINT D — Review mit Michael

Kurz: Settings klicken, Share-Flow testen. Weiter zu Phase 5.

---

## Phase 5 — PWA + Service Worker (Checkpoint E)

### Task 9: Icons generieren

- [ ] **Step 9.1: Icons-Ordner**

```bash
mkdir -p icons
```

- [ ] **Step 9.2: Placeholder-Icons**

Für MVP erstmal einfache Icons — können später mit `canvas-design` Skill ersetzt werden.

Erstelle `icons/icon-192.png` und `icons/icon-512.png` mit einem einfachen „M+M"-Monogramm auf Terracotta-Hintergrund. Kann ich via Script bauen:

Run: 
```bash
python3 <<'PY'
from PIL import Image, ImageDraw, ImageFont
for size, name in [(192, 'icons/icon-192.png'), (512, 'icons/icon-512.png')]:
    img = Image.new('RGB', (size, size), '#E8743B')
    draw = ImageDraw.Draw(img)
    try:
        font = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial Bold.ttf', size // 3)
    except:
        font = ImageFont.load_default()
    text = 'M+M'
    bbox = draw.textbbox((0, 0), text, font=font)
    w = bbox[2] - bbox[0]
    h = bbox[3] - bbox[1]
    draw.text(((size - w) / 2, (size - h) / 2 - bbox[1]), text, fill='#FAF4E8', font=font)
    img.save(name)
    print('wrote', name)
PY
```

Expected: zwei PNG-Dateien, Terracotta mit weißem „M+M".

- [ ] **Step 9.3: Commit**

```bash
git add icons/
git commit -m "chore: add placeholder icons"
```

---

### Task 10: Service Worker

**Files:**
- Modify: `sw.js`, `app.js`

- [ ] **Step 10.1: SW schreiben**

Replace `sw.js`:
```javascript
const VERSION = 'mm-explore-v1-2026-04-22';
const SHELL_CACHE = `shell-${VERSION}`;

const SHELL_FILES = [
  './',
  './index.html',
  './app.js',
  './styles.css',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  'https://unpkg.com/open-props/open-props.min.css',
  'https://unpkg.com/alpinejs@3.x.x/dist/cdn.min.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then(cache => cache.addAll(SHELL_FILES))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== SHELL_CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Gist: network-first
  if (url.hostname === 'gist.githubusercontent.com') {
    event.respondWith(
      fetch(event.request)
        .then(res => {
          const clone = res.clone();
          caches.open(SHELL_CACHE).then(cache => cache.put(event.request, clone));
          return res;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Shell: cache-first
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request))
  );
});
```

- [ ] **Step 10.2: SW registrieren in app.js**

Am Ende von `app.js` (außerhalb `Alpine.data`) hinzufügen:
```javascript
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then(reg => console.log('SW registered:', reg.scope))
      .catch(err => console.warn('SW registration failed:', err));
  });
}
```

- [ ] **Step 10.3: Manuell testen**

Browser: http://localhost:8000
1. Reload Seite
2. DevTools → Application → Service Workers → prüfen dass SW aktiv ist
3. DevTools → Application → Cache Storage → `shell-mm-explore-v1-...` existiert, enthält die Shell-Files
4. Network-Tab: „Offline" aktivieren → Reload → App lädt weiter (aus SW Cache)
5. „Offline" aus

- [ ] **Step 10.4: Commit**

```bash
git add sw.js app.js
git commit -m "feat: service worker with cache-first shell and network-first gist"
```

---

### Task 11: iOS Install-Hinweis

**Files:**
- Modify: `index.html`, `app.js`, `styles.css`

- [ ] **Step 11.1: Detection-Logic**

In `Alpine.data('app')`:
```javascript
get isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
},

get isStandalone() {
  return window.navigator.standalone === true ||
         window.matchMedia('(display-mode: standalone)').matches;
},

get showIOSInstallHint() {
  const dismissed = localStorage.getItem('mm_ios_hint_dismissed');
  return this.isIOS && !this.isStandalone && !dismissed;
},

dismissIOSHint() {
  localStorage.setItem('mm_ios_hint_dismissed', '1');
}
```

- [ ] **Step 11.2: Banner im Template**

Nach dem `<header>` in `index.html` einfügen:
```html
<div class="ios-hint" x-show="showIOSInstallHint" x-cloak>
  <p>📱 Tippe auf <strong>Teilen</strong> → <strong>Zum Home-Bildschirm</strong>, um M+M Explore als App zu installieren.</p>
  <button @click="dismissIOSHint()">Verstanden</button>
</div>
```

- [ ] **Step 11.3: Styles**

Append to `styles.css`:
```css
.ios-hint {
  background: var(--color-accent, #2E5266);
  color: white;
  padding: var(--size-3);
  border-radius: var(--radius-3);
  margin-bottom: var(--size-3);
  display: flex;
  flex-direction: column;
  gap: var(--size-2);
}

.ios-hint p {
  margin: 0;
  font-size: var(--font-size-1);
}

.ios-hint button {
  align-self: flex-end;
  background: rgba(255,255,255,0.2);
  color: white;
  border: none;
  padding: var(--size-1) var(--size-2);
  border-radius: var(--radius-2);
  font-size: var(--font-size-1);
  cursor: pointer;
}
```

- [ ] **Step 11.4: Verifizieren**

Desktop Safari: Banner NICHT sichtbar (nicht iOS)
iOS Simulator: Banner sichtbar, „Verstanden" dismisses

- [ ] **Step 11.5: Commit**

```bash
git add index.html app.js styles.css
git commit -m "feat: iOS install hint banner for Safari users"
```

---

### Task 12: iOS Simulator Smoke-Test

- [ ] **Step 12.1: Simulator booten**

Run:
```bash
xcrun simctl list devices | grep -i "iphone 15"
```

Dann:
```bash
xcrun simctl boot "iPhone 15 Pro" 2>/dev/null || true
open -a Simulator
```

- [ ] **Step 12.2: Dev-Server weiter laufen lassen**

Check: `curl -s http://localhost:8000 | head -5` muss HTML zurückgeben.

- [ ] **Step 12.3: Safari im Simulator**

Im Simulator: Safari öffnen, `http://localhost:8000` eingeben.

- [ ] **Step 12.4: Checks**

- [ ] Layout responsive (keine horizontale Scrollbar)
- [ ] Modus-Toggle funktioniert
- [ ] Settings erreichbar
- [ ] iOS-Install-Banner sichtbar
- [ ] Share-Button → iOS Share Sheet öffnet
- [ ] Share-Button erneut → Share-Sheet kommt

- [ ] **Step 12.5: „Zum Home-Bildschirm" testen**

Share-Button in Safari Adressleiste → „Zum Home-Bildschirm" → Home-Screen prüfen: Icon „MM Explore" da? Tap → App im Standalone-Mode (keine Safari-Chrome)?

---

### ✋ CHECKPOINT E — Review mit Michael

Gemeinsamer Blick in den Simulator. Danach Deploy.

---

## Phase 6 — Deploy & Real-Device-Test (Final)

### Task 13: GitHub Repo + Pages

- [ ] **Step 13.1: Remote-Repo erstellen**

Michael:
```bash
gh repo create michaelstingl/mm-explore --public --description "Generic travel companion PWA" --source=. --remote=origin
```

Oder manuell auf github.com erstellen, dann:
```bash
git remote add origin git@github.com:michaelstingl/mm-explore.git
```

- [ ] **Step 13.2: Push**

```bash
git push -u origin main
```

- [ ] **Step 13.3: Pages aktivieren**

```bash
gh api -X POST repos/michaelstingl/mm-explore/pages -f source[branch]=main -f source[path]=/
```

Oder manuell: GitHub → Repo → Settings → Pages → Source: `main` branch, `/` root → Save.

- [ ] **Step 13.4: URL verifizieren**

Nach ~1-2 Minuten:
```bash
curl -sI https://michaelstingl.github.io/mm-explore/ | head -3
```
Expected: `HTTP/2 200`

Browser: https://michaelstingl.github.io/mm-explore/
Expected: App lädt. Settings-View (keine Gist-URL). Eingabe der Gist-URL → lädt Bundle.

---

### Task 14: Michaels iPhone Real-Device-Test

- [ ] **Step 14.1: Onboarding-URL bauen**

Im Terminal:
```bash
GIST_RAW_URL="<deine-gist-raw-url>"
ENCODED=$(python3 -c "import urllib.parse, sys; print(urllib.parse.quote(sys.argv[1], safe=''))" "$GIST_RAW_URL")
echo "https://michaelstingl.github.io/mm-explore/#gist=$ENCODED"
```

- [ ] **Step 14.2: An dich selbst schicken**

iMessage an eigene Nummer, oder AirDrop aufs iPhone.

- [ ] **Step 14.3: Auf iPhone öffnen**

Safari → Link tappen. PWA öffnet, fetcht Bundle, rendert Reisen-Modus.

- [ ] **Step 14.4: Checks auf Device**

- [ ] Trip-Titel korrekt
- [ ] Alle Stays/Drives vorhanden
- [ ] Maps-Links öffnen Apple Maps
- [ ] „Zum Home-Bildschirm" → Icon erscheint, App im Standalone
- [ ] Flugmodus an → App funktioniert weiter (aus Cache)
- [ ] Flugmodus aus → Reload zieht frische Daten

- [ ] **Step 14.5: Bugfixes**

Falls was blinkt: Issue notieren, fixen, neuen Commit, push, ~1 Min warten, auf iPhone Hard-Reload.

---

### Task 15: Martinas Onboarding

- [ ] **Step 15.1: Share-Link senden**

Auf Michaels iPhone: M+M Explore öffnen → Settings → „Trip teilen 📤" → iMessage an Martina.

- [ ] **Step 15.2: Martina installiert**

Auf Martinas iPhone: iMessage-Link tappen. App öffnet. „Zum Home-Bildschirm".

- [ ] **Step 15.3: 5 Min Walkthrough**

Martina zeigen:
- Reisen-Modus (heute nichts drin, aber am 24.4. Fahrt + Hotel)
- Erleben-Modus (Orts-Picker → Tropea, POIs gucken)
- Settings-Icon (nur falls was nicht stimmt)

---

## Self-Review

**Spec Coverage Check:**

| Spec-Section | Tasks |
|---|---|
| Architektur (Drive → Gist → PWA) | Tasks 3, 4 |
| Datenmodell | Task 3 |
| View A Reisen | Task 6 |
| View B Erleben | Task 7 |
| View C Settings | Task 5 |
| Tech-Stack (Alpine, Open Props, SW) | Tasks 1, 10 |
| Theming | Task 2 (applyTheme), Task 3 (theme im Bundle) |
| Datenfluss | Task 2 |
| Fehlerbehandlung | Task 2 (error states), Task 5 (empty-states) |
| Onboarding via Fragment | Task 2 (parseFragment) |
| Share-Trip | Task 8 |
| PWA (Manifest, SW, Icons) | Tasks 1, 9, 10 |
| iOS Install-Banner | Task 11 |
| Testing | Task 12 (Simulator), Task 14 (iPhone) |
| Zeitplan 22./23./24.4. | Phase 1-4 heute, Phase 5-6 morgen |

Keine Gaps identifiziert.

**Type-Consistency Check:** Alle Schema-IDs konsistent (`drive_id`, `stay_id`, `place_id`, `pois[]`, `stops[]`). Helper-Funktionen (`findDrive`, `findStay`, `findPlace`) ebenfalls konsistent benannt.

**Placeholder-Scan:** Keine „TODO/TBD/später"-Stubs im Plan. Offene Punkte (Icon-Design mit canvas-design) sind explizit als spätere Option deklariert, nicht als Plan-Gap.

---

## Zeitschätzung

| Phase | Tasks | Dauer |
|---|---|---|
| Phase 1 (Scaffold) | 1-5 | ~2h (Claude implementiert, Michael reviewed) |
| Phase 2 (Reisen) | 6 | ~1.5h |
| Phase 3 (Erleben) | 7 | ~1h |
| Phase 4 (Share) | 8 | ~30min |
| Phase 5 (PWA) | 9-12 | ~1.5h |
| Phase 6 (Deploy + Test) | 13-15 | ~1h |
| **Total** | | **~7.5h** |

Realistisch über 2 Tage verteilt: Tag 1 (heute) Phase 1-4, Tag 2 (23.4.) Phase 5-6. Puffer für unerwartetes am Donnerstag Abend.
