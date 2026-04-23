const STORAGE_KEY = {
  GIST_URL: 'mm_gist_url',
  BUNDLE: 'mm_bundle_cache',
  BUNDLE_TIMESTAMP: 'mm_bundle_timestamp',
  MODE_OVERRIDE: 'mm_mode_override',
  LAST_PLACE: 'mm_last_place',
  LOCALE_OVERRIDE: 'mm_locale_override',
  MAPS_APP: 'mm_maps_app'
};

const MAPS_APPS = [
  { value: 'auto', label: 'Auto (System-Default)' },
  { value: 'apple', label: 'Apple Maps' },
  { value: 'google', label: 'Google Maps' },
  { value: 'waze', label: 'Waze' }
];

/**
 * Build a navigation URL for the given location.
 * location: { coords?: [lat, lon], name?: string, address?: string, maps_url?: string }
 * app: 'apple' | 'google' | 'waze' | 'auto'
 * mode: 'view' (show pin) | 'nav' (start navigation to)
 */
function buildMapsUrl(location, app = 'auto', mode = 'view') {
  if (!location) return null;
  const resolved = app === 'auto'
    ? (/iPad|iPhone|iPod|Mac/.test(navigator.userAgent) ? 'apple' : 'google')
    : app;

  const [lat, lon] = location.coords || [];
  const hasCoords = typeof lat === 'number' && typeof lon === 'number';
  // For drives: 'to' is the destination, 'from' is the origin
  const destName = location.name || location.to;
  const query = destName
    ? (location.address ? `${destName}, ${location.address}` : destName)
    : location.address;
  const origin = location.from;

  switch (resolved) {
    case 'apple': {
      if (mode === 'nav') {
        if (hasCoords) {
          const p = new URLSearchParams({ daddr: `${lat},${lon}`, dirflg: 'd' });
          if (origin) p.set('saddr', origin);
          return `https://maps.apple.com/?${p}`;
        }
        if (query) {
          const p = new URLSearchParams({ daddr: query, dirflg: 'd' });
          if (origin) p.set('saddr', origin);
          return `https://maps.apple.com/?${p}`;
        }
      }
      if (hasCoords) return `https://maps.apple.com/?ll=${lat},${lon}&q=${encodeURIComponent(destName || '')}`;
      if (query) return `https://maps.apple.com/?q=${encodeURIComponent(query)}`;
      return location.maps_url || null;
    }
    case 'google': {
      if (mode === 'nav') {
        const p = new URLSearchParams({ api: '1' });
        if (hasCoords) p.set('destination', `${lat},${lon}`);
        else if (query) p.set('destination', query);
        else break;
        if (origin) p.set('origin', origin);
        return `https://www.google.com/maps/dir/?${p}`;
      }
      if (hasCoords) return `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`;
      if (query) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
      return null;
    }
    case 'waze': {
      // Waze only makes sense for navigation
      if (hasCoords) return `https://waze.com/ul?ll=${lat},${lon}&navigate=yes`;
      if (query) return `https://waze.com/ul?q=${encodeURIComponent(query)}&navigate=yes`;
      return null;
    }
  }
  return location.maps_url || null;
}

const LOCALE_OPTIONS = [
  { value: 'auto', label: 'Auto' },
  { value: 'de-DE', label: 'Deutsch (DE)' },
  { value: 'de-AT', label: 'Deutsch (AT)' },
  { value: 'de-CH', label: 'Deutsch (CH)' },
  { value: 'en-US', label: 'English (US)' },
  { value: 'en-GB', label: 'English (UK)' },
  { value: 'it-IT', label: 'Italiano' },
  { value: 'fr-FR', label: 'Français' }
];

function isValidLocale(tag) {
  if (!tag) return false;
  try { new Intl.Locale(tag); return true; } catch { return false; }
}

/**
 * Normalize a GitHub Gist URL to the latest-tracking raw URL.
 * Handles:
 *  - https://gist.github.com/user/ID                          → raw of first file, latest
 *  - https://gist.github.com/user/ID#file-foo-json            → raw of foo.json, latest
 *  - https://gist.githubusercontent.com/user/ID/raw/SHA/file  → strip SHA to track latest
 *  - https://gist.githubusercontent.com/user/ID/raw/file      → passthrough (already latest)
 */
function normalizeGistUrl(raw) {
  try {
    const url = new URL(raw);
    if (url.hostname === 'gist.github.com') {
      const [, user, id] = url.pathname.match(/^\/([^/]+)\/([a-f0-9]+)/) || [];
      if (!user || !id) return raw;
      let file = '';
      const m = url.hash.match(/^#file-(.+)$/);
      if (m) {
        // #file-travel-bundle-v1-json → travel-bundle-v1.json
        file = m[1].replace(/-([^-]+)$/, '.$1');
      }
      return `https://gist.githubusercontent.com/${user}/${id}/raw${file ? '/' + file : ''}`;
    }
    if (url.hostname === 'gist.githubusercontent.com') {
      // Strip revision SHA from /user/id/raw/SHA/filename
      const parts = url.pathname.split('/').filter(Boolean);
      // parts: [user, id, 'raw', (SHA), (filename?)]
      if (parts[2] === 'raw' && parts[3] && /^[a-f0-9]{7,}$/.test(parts[3])) {
        const tail = parts.slice(4).join('/');
        return `https://gist.githubusercontent.com/${parts[0]}/${parts[1]}/raw${tail ? '/' + tail : ''}`;
      }
    }
  } catch { /* fall through */ }
  return raw;
}

// Debug logging — toggle via:  mmDebug(true) / mmDebug(false)   in Safari console
const DEBUG_KEY = 'mm_debug';
const LOG_KEY = 'mm_debug_log';
const LOG_MAX = 200;

function isDebug() { return localStorage.getItem(DEBUG_KEY) === '1'; }

// Ring buffer log — persisted to localStorage, survives reloads
function pushLog(category, message, data) {
  if (!isDebug()) return;
  try {
    const log = JSON.parse(localStorage.getItem(LOG_KEY) || '[]');
    log.push({
      ts: new Date().toISOString(),
      cat: category, // 'init' | 'user' | 'net' | 'warn' | 'err'
      msg: message,
      data: data === undefined ? null : data
    });
    if (log.length > LOG_MAX) log.splice(0, log.length - LOG_MAX);
    localStorage.setItem(LOG_KEY, JSON.stringify(log));
  } catch (e) { console.warn('[mm] log write failed', e); }
}

function dbg(...args) {
  if (!isDebug()) return;
  console.log('[mm]', ...args);
  // Also persist a short summary
  const [first, ...rest] = args;
  pushLog('log', String(first), rest.length ? rest : undefined);
}
window.mmDebug = (on) => {
  if (on === undefined) {
    console.log('debug:', isDebug() ? 'ON' : 'OFF');
    console.log('usage: mmDebug(true)   mmDebug(false)');
    return isDebug();
  }
  if (on) { localStorage.setItem(DEBUG_KEY, '1'); console.log('debug ON — reload for SW logs'); }
  else { localStorage.removeItem(DEBUG_KEY); console.log('debug OFF — reload for SW logs'); }
  return on;
};

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// Register Service Worker (prod only — skip on localhost dev to avoid caching pain)
if ('serviceWorker' in navigator && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then(reg => dbg('[sw] registered:', reg.scope))
      .catch(err => console.warn('[sw] registration failed:', err));
  });
}

document.addEventListener('alpine:init', () => {
  Alpine.data('app', () => ({
    // State
    bundle: null,
    loading: true,
    error: null,
    offline: false,
    view: 'main',           // 'main' | 'settings'
    mode: 'transit',         // 'transit' | 'explore' | 'discover'
    _map: null,
    _mapInited: false,
    iosHintDismissed: !!localStorage.getItem('mm_ios_hint_dismissed'),
    manualOverride: false,
    selectedPlaceId: null,
    gistUrl: '',
    lastUpdated: null,
    showDayPicker: false,
    stayDetails: null,
    localeOverride: '',
    localeOptions: LOCALE_OPTIONS,
    mapsApp: 'auto',
    mapsApps: MAPS_APPS,
    build: null,          // { version, commit_short, commit_message, deployed_at }
    updateAvailable: false,
    debugEnabled: false,
    showDebug: false,

    // Computed
    _simulatedDate: null,
    get today() {
      if (this._simulatedDate) return this._simulatedDate;
      return new Date().toISOString().slice(0, 10);
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
      pushLog('init', 'app init', {
        ua: navigator.userAgent,
        standalone: window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches,
        locale: navigator.language,
        url: location.href
      });
      dbg('init · debug is ON (mmDebug(false) to silence)');
      this.parseFragment();
      this.parseDateQuery();
      this.gistUrl = localStorage.getItem(STORAGE_KEY.GIST_URL) || '';
      const storedLocale = localStorage.getItem(STORAGE_KEY.LOCALE_OVERRIDE);
      this.localeOverride = (storedLocale && (storedLocale === 'auto' || isValidLocale(storedLocale))) ? storedLocale : 'auto';
      if (storedLocale && this.localeOverride === 'auto') {
        localStorage.removeItem(STORAGE_KEY.LOCALE_OVERRIDE);
      }
      const storedMaps = localStorage.getItem(STORAGE_KEY.MAPS_APP);
      this.mapsApp = MAPS_APPS.some(a => a.value === storedMaps) ? storedMaps : 'auto';
      this.debugEnabled = isDebug();
      this.loadCachedBundle();
      await this.fetchBundle();
      await this.loadBuildInfo();
      this.applyTheme();
      this.pickDefaultMode();
      // Poll for new deploys every 5 min while app is open
      setInterval(() => this.checkForUpdate(), 5 * 60 * 1000);
    },

    async loadBuildInfo() {
      // build.json is only produced by the deploy action; skip on localhost to avoid 404 noise
      const host = location.hostname;
      if (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0') {
        dbg('skip build.json (dev host)');
        return;
      }
      try {
        const res = await fetch('./build.json', { cache: 'no-store' });
        if (res.ok) {
          this.build = await res.json();
          dbg('build info', this.build);
        }
      } catch (e) {
        dbg('build.json not available', e.message);
      }
    },

    async checkForUpdate() {
      if (!this.build?.version) return;
      try {
        const res = await fetch('./build.json?t=' + Date.now(), { cache: 'no-store' });
        if (!res.ok) return;
        const latest = await res.json();
        if (latest.version && latest.version !== this.build.version) {
          dbg('update available:', this.build.version, '→', latest.version);
          pushLog('net', 'update available', { from: this.build.version, to: latest.version });
          this.updateAvailable = true;
        }
      } catch (e) { dbg('update check failed', e.message); }
    },

    applyUpdate() {
      location.reload();
    },

    toggleDebug(on) {
      this.debugEnabled = !!on;
      window.mmDebug(this.debugEnabled);
    },

    get debugSnapshot() {
      return {
        build: this.build,
        bundle: this.bundle ? {
          trip: this.bundle.trip?.title,
          days: this.bundle.days?.length,
          drives: this.bundle.drives?.length,
          stays: this.bundle.stays?.length,
          places: this.bundle.places?.length,
          last_updated: this.bundle.trip?.last_updated
        } : null,
        locale: this.locale,
        localeOverride: this.localeOverride,
        mapsApp: this.mapsApp,
        mode: this.mode,
        today: this.today,
        realToday: this.realToday,
        isSimulating: this.isSimulating,
        tripState: this.tripState,
        gistUrl: this.gistUrl,
        lastUpdated: this.lastUpdated,
        bundleAge: this.bundleAgeLabel,
        offline: this.offline,
        ua: navigator.userAgent,
        isIOS: this.isIOS,
        isStandalone: this.isStandalone,
        serviceWorker: 'serviceWorker' in navigator ? 'available' : 'n/a'
      };
    },

    async copyDebugSnapshot() {
      const text = JSON.stringify(this.debugSnapshot, null, 2);
      try { await navigator.clipboard.writeText(text); this.showToast('Debug-State kopiert'); }
      catch { prompt('Debug-State:', text); }
    },

    get debugLog() {
      try { return JSON.parse(localStorage.getItem(LOG_KEY) || '[]').slice().reverse(); }
      catch { return []; }
    },

    clearDebugLog() {
      localStorage.removeItem(LOG_KEY);
      pushLog('init', 'log cleared');
      this.showToast('Log gelöscht');
    },

    async copyDebugLog() {
      const entries = this.debugLog.slice().reverse(); // chronological
      const text = entries.map(e =>
        `${e.ts.slice(11, 19)}  ${e.cat.padEnd(5)} ${e.msg}${e.data ? ' ' + JSON.stringify(e.data) : ''}`
      ).join('\n');
      try { await navigator.clipboard.writeText(text); this.showToast('Log kopiert'); }
      catch { prompt('Log:', text); }
    },

    logTs(iso) {
      return new Date(iso).toLocaleTimeString(this.locale, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    },

    get bundleAgeLabel() {
      if (!this.lastUpdated) return '';
      const ageMs = Date.now() - new Date(this.lastUpdated).getTime();
      const sec = Math.floor(ageMs / 1000);
      if (sec < 60) return 'gerade eben';
      const min = Math.floor(sec / 60);
      if (min < 60) return `vor ${min} min`;
      const h = Math.floor(min / 60);
      if (h < 24) return `vor ${h} h`;
      const d = Math.floor(h / 24);
      return `vor ${d} Tag${d > 1 ? 'en' : ''}`;
    },

    get bundleIsStale() {
      if (!this.lastUpdated) return true;
      return (Date.now() - new Date(this.lastUpdated).getTime()) > 60 * 60 * 1000; // > 1h
    },

    get locale() {
      if (this.localeOverride && this.localeOverride !== 'auto' && isValidLocale(this.localeOverride)) {
        return this.localeOverride;
      }
      return navigator.language || 'de-DE';
    },

    setLocaleOverride(value) {
      const safe = (value === 'auto' || isValidLocale(value)) ? value : 'auto';
      this.localeOverride = safe;
      if (safe && safe !== 'auto') {
        localStorage.setItem(STORAGE_KEY.LOCALE_OVERRIDE, safe);
      } else {
        localStorage.removeItem(STORAGE_KEY.LOCALE_OVERRIDE);
      }
    },

    setMapsApp(value) {
      const safe = MAPS_APPS.some(a => a.value === value) ? value : 'auto';
      this.mapsApp = safe;
      if (safe === 'auto') localStorage.removeItem(STORAGE_KEY.MAPS_APP);
      else localStorage.setItem(STORAGE_KEY.MAPS_APP, safe);
    },

    mapsUrl(location, mode = 'view') {
      return buildMapsUrl(location, this.mapsApp, mode);
    },

    toast: { message: '', visible: false, _t: null },
    showToast(message, ms = 2000) {
      this.toast.message = message;
      this.toast.visible = true;
      if (this.toast._t) clearTimeout(this.toast._t);
      this.toast._t = setTimeout(() => { this.toast.visible = false; }, ms);
    },

    async copyLocation(location) {
      pushLog('user', 'copy location', { name: location?.name || location?.to });
      const parts = [];
      if (location?.name) parts.push(location.name);
      else if (location?.to) parts.push(location.to);
      if (location?.address) parts.push(location.address);
      const [lat, lon] = location?.coords || [];
      if (typeof lat === 'number' && typeof lon === 'number') {
        parts.push(`${lat.toFixed(6)}, ${lon.toFixed(6)}`);
      }
      const text = parts.filter(Boolean).join(' · ');
      if (!text) {
        this.showToast('Keine Location-Daten');
        return;
      }
      try {
        await navigator.clipboard.writeText(text);
        this.showToast('Kopiert: ' + (parts[0] || 'Location'));
      } catch (e) {
        console.warn('Clipboard write failed', e);
        prompt('Kopieren:', text);
      }
    },

    logMapsClick(location, mode) {
      const appUsed = this.mapsApp === 'auto'
        ? (/iPad|iPhone|iPod|Mac/.test(navigator.userAgent) ? 'apple' : 'google')
        : this.mapsApp;
      const url = buildMapsUrl(location, this.mapsApp, mode);
      pushLog('user', `maps → ${appUsed} (${mode})`, {
        name: location?.name || location?.to,
        coords: location?.coords
      });
      if (!isDebug()) return;
      console.log('[mm maps]', {
        setting: this.mapsApp,
        resolved: appUsed,
        mode,
        location: {
          id: location?.id,
          name: location?.name,
          from: location?.from,
          to: location?.to,
          coords: location?.coords,
          address: location?.address,
          maps_url: location?.maps_url
        },
        url,
        platform: navigator.userAgent.includes('Mac') ? 'Mac' : navigator.userAgent.includes('iPhone') ? 'iPhone' : 'other'
      });
    },

    get firstDayOfWeek() {
      try {
        const info = new Intl.Locale(this.locale).getWeekInfo?.() ?? new Intl.Locale(this.locale).weekInfo;
        return info?.firstDay ?? 1;
      } catch {
        return 1;
      }
    },

    parseDateQuery() {
      const params = new URLSearchParams(window.location.search);
      const d = params.get('date');
      if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
        this._simulatedDate = d;
        dbg('simulate date from ?date=', d);
      }
    },

    get realToday() {
      return new Date().toISOString().slice(0, 10);
    },

    get isIOS() {
      return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    },

    get isStandalone() {
      return window.navigator.standalone === true
        || window.matchMedia('(display-mode: standalone)').matches;
    },

    get showIOSInstallHint() {
      return this.isIOS && !this.isStandalone && !this.iosHintDismissed && !!this.bundle;
    },

    dismissIOSHint() {
      this.iosHintDismissed = true;
      localStorage.setItem('mm_ios_hint_dismissed', '1');
    },

    async shareTrip() {
      pushLog('user', 'share trip');
      const gistUrl = localStorage.getItem(STORAGE_KEY.GIST_URL);
      if (!gistUrl) {
        alert('Keine Gist-URL konfiguriert.');
        return;
      }
      // Use query param (?gist=) instead of fragment (#gist=) — fragments are stripped
      // when recipient adds the PWA to iOS home screen, query params are preserved in start_url.
      const shareUrl = `${location.origin}${location.pathname}?gist=${encodeURIComponent(gistUrl)}`;
      if (navigator.share) {
        try {
          // Share only the URL — no title, no text. Most share targets append
          // title/text as their own lines which adds noise.
          await navigator.share({ url: shareUrl });
        } catch (e) {
          if (e.name !== 'AbortError') console.warn('Share failed', e);
        }
        return;
      }
      try {
        await navigator.clipboard.writeText(shareUrl);
        alert('Link in die Zwischenablage kopiert!');
      } catch {
        prompt('Link kopieren:', shareUrl);
      }
    },

    get isSimulating() {
      if (!this._simulatedDate) return false;
      return this._simulatedDate !== this.realToday;
    },

    dayLabel(iso) {
      if (!iso) return '';
      const d = new Date(iso);
      return d.toLocaleDateString(this.locale, { weekday: 'short', day: '2-digit', month: '2-digit' });
    },

    formatFullDate(iso) {
      if (!iso) return '';
      const d = new Date(iso);
      return d.toLocaleDateString(this.locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    },

    formatDow(iso) {
      return new Date(iso).toLocaleDateString(this.locale, { weekday: 'short' });
    },

    formatDom(iso) {
      return new Date(iso).getDate().toString().padStart(2, '0');
    },

    formatMon(iso) {
      return new Date(iso).toLocaleDateString(this.locale, { month: 'short' });
    },

    get weekdayHeaders() {
      const firstDay = this.firstDayOfWeek;
      const fmt = new Intl.DateTimeFormat(this.locale, { weekday: 'short' });
      const names = [];
      for (let i = 0; i < 7; i++) {
        const dayIndex = ((firstDay - 1) + i) % 7;
        const d = new Date(2024, 0, 1 + dayIndex);
        names.push(fmt.format(d));
      }
      return names;
    },

    get calendarMonths() {
      if (!this.bundle?.trip) return [];
      const from = this.bundle.trip.from_date;
      const to = this.bundle.trip.to_date;
      const daysByDate = Object.fromEntries((this.bundle.days || []).map(d => [d.date, d]));

      const months = [];
      let cursor = new Date(from.slice(0, 7) + '-01');
      const end = new Date(to.slice(0, 7) + '-01');

      const firstDayOfWeek = this.firstDayOfWeek; // 1=Mon, 7=Sun

      while (cursor <= end) {
        const y = cursor.getFullYear();
        const m = cursor.getMonth();
        const firstOfMonth = new Date(y, m, 1);
        // getDay(): 0=Sun, 1=Mon ... 6=Sat
        // We want offset from firstDayOfWeek
        const domDay = firstOfMonth.getDay() === 0 ? 7 : firstOfMonth.getDay();
        const firstDow = (domDay - firstDayOfWeek + 7) % 7;
        const daysInMonth = new Date(y, m + 1, 0).getDate();

        const allCells = [];
        for (let i = 0; i < firstDow; i++) allCells.push(null);
        for (let d = 1; d <= daysInMonth; d++) {
          const iso = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
          const inTrip = iso >= from && iso <= to;
          const day = daysByDate[iso];
          const symbols = [];
          if (day?.type === 'travel') symbols.push('🚗');
          if (day?.type === 'stay') symbols.push('🏖️');
          allCells.push({ date: iso, dom: d, inTrip, day, symbols });
        }
        // pad to full weeks
        while (allCells.length % 7 !== 0) allCells.push(null);

        // keep only weeks that contain at least one in-trip cell
        const cells = [];
        for (let w = 0; w < allCells.length; w += 7) {
          const week = allCells.slice(w, w + 7);
          if (week.some(c => c && c.inTrip)) cells.push(...week);
        }

        if (cells.length === 0) {
          cursor = new Date(y, m + 1, 1);
          continue;
        }

        months.push({
          key: `${y}-${m}`,
          label: cursor.toLocaleDateString(this.locale, { month: 'long', year: 'numeric' }),
          cells
        });

        cursor = new Date(y, m + 1, 1);
      }
      return months;
    },

    pickDate(iso) {
      if (!iso) return;
      const realToday = new Date().toISOString().slice(0, 10);
      this._simulatedDate = iso === realToday ? null : iso;
      pushLog('user', `date → ${iso}`, { simulating: this._simulatedDate !== null });
      this._syncDateQuery();
      this.pickDefaultMode();
    },

    resetDate() {
      this._simulatedDate = null;
      this._syncDateQuery();
      this.pickDefaultMode();
    },

    _syncDateQuery() {
      const url = new URL(window.location.href);
      if (this._simulatedDate) {
        url.searchParams.set('date', this._simulatedDate);
      } else {
        url.searchParams.delete('date');
      }
      history.replaceState(null, '', url.toString());
    },

    parseFragment() {
      // Accept gist URL from either ?gist= (query, iOS-install-safe) or #gist= (fragment, legacy)
      let gistParam = null;
      const params = new URLSearchParams(window.location.search);
      if (params.has('gist')) {
        gistParam = params.get('gist');
        params.delete('gist');
      }
      if (!gistParam) {
        const m = window.location.hash.match(/#gist=(.+)/);
        if (m) gistParam = decodeURIComponent(m[1]);
      }
      if (gistParam) {
        localStorage.setItem(STORAGE_KEY.GIST_URL, gistParam);
        const cleanSearch = params.toString() ? '?' + params.toString() : '';
        history.replaceState(null, '', window.location.pathname + cleanSearch);
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
        dbg('fetchBundle: no gist URL, showing settings');
        this.loading = false;
        this.view = 'settings';
        return;
      }
      dbg('fetchBundle: fetching', url);
      try {
        const t0 = performance.now();
        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const ms = (performance.now() - t0).toFixed(0);
        dbg(`fetchBundle: ok in ${ms}ms —`, data.trip?.title, `(${data.days?.length} days)`);
        pushLog('net', `fetch bundle ok ${ms}ms`, { trip: data.trip?.title, days: data.days?.length });
        this.bundle = data;
        localStorage.setItem(STORAGE_KEY.BUNDLE, JSON.stringify(data));
        const ts = new Date().toISOString();
        localStorage.setItem(STORAGE_KEY.BUNDLE_TIMESTAMP, ts);
        this.lastUpdated = ts;
        this.offline = false;
      } catch (e) {
        console.warn('[mm] fetch failed, using cache', e);
        pushLog('warn', 'fetch failed', { error: e.message });
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
      if (override === 'transit' || override === 'explore' || override === 'discover') {
        this.mode = override;
        this.manualOverride = true;
        this._ensureMapReady();
        return;
      }
      const day = this.todayDay;
      if (day?.type === 'travel') this.mode = 'transit';
      else if (day?.type === 'stay' || day?.type === 'mixed') this.mode = 'explore';
      else {
        // Before or after the trip: transit shows the pre/post-trip empty states.
        this.mode = 'transit';
      }
    },

    setMode(m) {
      dbg('mode →', m);
      pushLog('user', `mode → ${m}`);
      this.mode = m;
      this.manualOverride = true;
      localStorage.setItem(STORAGE_KEY.MODE_OVERRIDE, m);
      this._ensureMapReady();
    },

    // Lazy-init the Leaflet instance (or invalidateSize if already inited)
    // whenever the user lands in discover mode — triggered both from an
    // explicit setMode click and from pickDefaultMode restoring the tab
    // across page reloads.
    _ensureMapReady() {
      if (this.mode !== 'discover') return;
      this.$nextTick(() => {
        const el = document.getElementById('map');
        if (!el) return;
        if (!this._mapInited) this.initMap(el);
        else setTimeout(() => this._map?.invalidateSize(), 50);
      });
    },

    initMap(el) {
      if (this._mapInited || !window.L || !this.bundle) return;
      this._mapInited = true;
      const L = window.L;

      const map = L.map(el, { zoomControl: true, attributionControl: true }).setView([42.5, 12.5], 6);
      this._map = map;

      L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        maxZoom: 19,
        subdomains: 'abcd',
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
      }).addTo(map);

      const places = this.bundle.places || [];
      const stays = this.bundle.stays || [];
      const placesById = Object.fromEntries(places.map(p => [p.id, p]));

      const earliestStayDate = (placeId) => {
        const ds = stays.filter(s => s.place_id === placeId && s.check_in).map(s => s.check_in).sort();
        return ds[0] || null;
      };

      const pinsLatLngs = [];

      // Route rendering: one polyline per Drive. Confirmed drives get a
      // solid adria-blue segment, candidates get dashed terracotta. Consecutive
      // segments that share endpoints naturally appear as a continuous line;
      // forks (multiple candidate drives leaving the same place) render as
      // parallel branches without any chain-building logic here.
      //
      // Endpoint resolution: prefer explicit Drive.*_place_id (schema-clean).
      // Fall back to name matching — normalized display name, slug of
      // display name, or id — so legacy bundles keep rendering.
      const normName = (s) => (s || '').toLowerCase().replace(/\s*\(.*?\)\s*/g, '').trim();
      const slugify = (s) => (s || '').toLowerCase().replace(/\s*\(.*?\)\s*/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
      const placeLookup = new Map();
      for (const p of places.filter(q => q.coords)) {
        placeLookup.set(p.id, p);
        placeLookup.set(normName(p.name), p);
        placeLookup.set(slugify(p.name), p);
      }
      const findPlaceByRef = (ref) => placeLookup.get(normName(ref)) || placeLookup.get(slugify(ref)) || null;
      const resolveEndpoint = (placeId, displayName) => {
        if (placeId && placesById[placeId]?.coords) return placesById[placeId];
        return findPlaceByRef(displayName);
      };

      for (const d of (this.bundle.drives || [])) {
        const from = resolveEndpoint(d.from_place_id, d.from);
        const to = resolveEndpoint(d.to_place_id, d.to);
        if (!from?.coords || !to?.coords) continue;
        const isCandidate = d.status === 'candidate';
        L.polyline([from.coords, to.coords], {
          className: isCandidate ? 'mm-route-candidate' : 'mm-route',
          color: isCandidate ? '#E8743B' : '#2E5266',
          weight: isCandidate ? 2.5 : 3,
          opacity: 0.75,
          dashArray: isCandidate ? '4 6' : undefined,
          interactive: false,
        }).addTo(map);
      }

      // Layer group for per-place POI cluster — refilled on each place click.
      this._placePoiLayer = L.layerGroup().addTo(map);

      // Stay-Pins (Adria-Blau, kräftig)
      stays.forEach(stay => {
        const c = stay.coords || placesById[stay.place_id]?.coords;
        if (!c) return;
        const icon = L.divIcon({
          className: 'mm-pin mm-pin-stay',
          html: `<span class="mm-pin-dot"></span>`,
          iconSize: [22, 22],
          iconAnchor: [11, 11],
        });
        const place = placesById[stay.place_id];
        const m = L.marker(c, { icon }).addTo(map);
        m.bindPopup(this._popupHtml(place?.name || stay.name, earliestStayDate(stay.place_id), stay.place_id, true));
        m.on('click', () => this._showPlacePois(stay.place_id));
        pinsLatLngs.push(c);
      });

      // Place-Pins (Terracotta, Kreis mit Punkt)
      places.forEach(place => {
        if (!place.coords) return;
        const hasStay = stays.some(s => s.place_id === place.id);
        if (hasStay) return; // already rendered as stay pin
        const muted = place.status === 'candidate';
        const icon = L.divIcon({
          className: `mm-pin mm-pin-place${muted ? ' mm-pin-muted' : ''}`,
          html: `<span class="mm-pin-dot"></span>`,
          iconSize: [18, 18],
          iconAnchor: [9, 9],
        });
        const m = L.marker(place.coords, { icon }).addTo(map);
        m.bindPopup(this._popupHtml(place.name, null, place.id, false));
        m.on('click', () => this._showPlacePois(place.id));
        pinsLatLngs.push(place.coords);
      });

      // fitBounds is deferred below — at synchronous init the container
      // size may still be 0×0, which makes Leaflet compute an absurd zoom
      // centered on the pins' geometric midpoint (Rimini-ish, for this
      // trip). Do the fit after invalidateSize measured the real size.

      // Delegated click handler for popup buttons
      el.addEventListener('click', (e) => {
        const openPlaceBtn = e.target.closest('[data-open-place]');
        if (openPlaceBtn) {
          const id = openPlaceBtn.getAttribute('data-open-place');
          this.selectPlace(id);
          this.setMode('explore');
          map.closePopup();
          return;
        }
        const poiActionBtn = e.target.closest('[data-poi-idx]');
        if (poiActionBtn) {
          const idx = parseInt(poiActionBtn.getAttribute('data-poi-idx'), 10);
          const action = poiActionBtn.getAttribute('data-action');
          const poi = this._clusterPois?.[idx];
          if (!poi) return;
          if (action === 'copy') {
            e.preventDefault();
            this.copyLocation(poi);
          }
        }
      });

      setTimeout(() => {
        map.invalidateSize();
        if (this._pendingPoiFocus) {
          this._applyPoiFocus();
        } else if (this._pendingPlaceFocus) {
          this._applyPlaceFocus();
        } else if (pinsLatLngs.length) {
          map.fitBounds(pinsLatLngs, { padding: [40, 40], maxZoom: 10 });
        }
      }, 100);
    },

    // Jump to the Entdecken tab and expand the whole cluster of a place
    // (all POIs + the place center) without any single-POI highlight.
    showPlaceOnMap(place) {
      if (!place?.id) return;
      pushLog('user', `place → map: ${place.name}`);
      this._pendingPlaceFocus = place.id;
      this.setMode('discover');
      if (this._mapInited) {
        this.$nextTick(() => setTimeout(() => this._applyPlaceFocus(), 50));
      }
    },

    _applyPlaceFocus() {
      const placeId = this._pendingPlaceFocus;
      if (!placeId || !this._map) return;
      this._pendingPlaceFocus = null;
      this._map.invalidateSize();
      if (this._poiHighlight) {
        this._map.removeLayer(this._poiHighlight);
        this._poiHighlight = null;
      }
      this._showPlacePois(placeId);
    },

    // Jump to the Entdecken tab and highlight a specific POI on the map.
    // Drops a temporary pulse marker and centers at zoom ~15. When the map
    // isn't inited yet, we stash the focus request — initMap consumes it
    // after fitBounds so the POI wins.
    showPoiOnMap(poi) {
      if (!poi?.coords) return;
      pushLog('user', `poi → map: ${poi.name}`);
      this._pendingPoiFocus = poi;
      this.setMode('discover');
      if (this._mapInited) {
        this.$nextTick(() => setTimeout(() => this._applyPoiFocus(), 50));
      }
    },

    // Expand a place's POIs around it on the map. Shows a small emoji pin
    // per POI (type-based glyph: 🏛️ sight, 🍽️ food, 🏖️ beach…). Tap on a
    // POI marker = popup with name + note. Clicking a different place
    // replaces the cluster.
    _showPlacePois(placeId) {
      if (!this._map || !this._placePoiLayer || !window.L) return;
      const L = window.L;
      const place = this.findPlace(placeId);
      this._placePoiLayer.clearLayers();
      if (!place?.pois?.length) return;
      const coords = [place.coords];
      // Stash POIs so the delegated popup-button handler can look them
      // up by index — Leaflet's popups are plain HTML, no Alpine scope.
      this._clusterPois = place.pois;
      place.pois.forEach((poi, idx) => {
        if (!poi.coords) return;
        const icon = L.divIcon({
          className: 'mm-pin mm-pin-cluster',
          html: `<span class="mm-cluster-emoji">${this.poiIcon(poi.type)}</span>`,
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        });
        const marker = L.marker(poi.coords, { icon }).addTo(this._placePoiLayer);
        const note = poi.note ? `<div class="mm-pop-date">${escapeHtml(poi.note)}</div>` : '';
        const mapsHref = this.mapsUrl(poi, 'nav') || poi.maps_url || '#';
        marker.bindPopup(`
          <div class="mm-pop">
            <div class="mm-pop-title">${this.poiIcon(poi.type)} ${escapeHtml(poi.name || '')}</div>
            ${note}
            <div class="mm-pop-actions">
              <button class="action-btn" aria-label="Kopieren" data-poi-idx="${idx}" data-action="copy">📋</button>
              <a class="action-btn action-btn-primary" aria-label="In Maps-App öffnen" href="${escapeHtml(mapsHref)}" target="_blank">🚙</a>
            </div>
          </div>
        `);
        coords.push(poi.coords);
      });
      // Fit the map to the cluster so all POIs become visible.
      if (coords.length > 1) {
        this._map.fitBounds(coords, { padding: [60, 60], maxZoom: 15, animate: true });
      }
    },

    _applyPoiFocus() {
      const poi = this._pendingPoiFocus;
      if (!poi || !this._map || !window.L) return;
      this._pendingPoiFocus = null;
      const L = window.L;
      const map = this._map;
      map.invalidateSize();

      // Expand the surrounding cluster so siblings show up too.
      // _showPlacePois also fitBounds to the whole cluster — preserves
      // context instead of zooming blindly to a single POI.
      const placeId = this.selectedPlace?.id;
      if (placeId) this._showPlacePois(placeId);

      if (this._poiHighlight) map.removeLayer(this._poiHighlight);
      const icon = L.divIcon({
        className: 'mm-pin mm-pin-poi',
        html: `<span class="mm-pin-dot"></span>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });
      this._poiHighlight = L.marker(poi.coords, { icon, zIndexOffset: 1000 })
        .addTo(map)
        .bindPopup(`<div class="mm-pop"><div class="mm-pop-title">${escapeHtml(poi.name || '')}</div>${poi.note ? `<div class="mm-pop-date">${escapeHtml(poi.note)}</div>` : ''}</div>`)
        .openPopup();

      // If we didn't have a selectedPlace context, fall back to a single-POI
      // zoom so the user still lands near the tapped marker.
      if (!placeId) map.setView(poi.coords, 15, { animate: false });
    },

    _popupHtml(name, isoDate, placeId, isStay) {
      const dateLine = isoDate
        ? `<div class="mm-pop-date">${new Date(isoDate).toLocaleDateString(this.locale, { day: 'numeric', month: 'short' })}</div>`
        : '';
      const badge = isStay ? '<span class="mm-pop-badge">Übernachtung</span>' : '';
      return `
        <div class="mm-pop">
          <div class="mm-pop-title">${escapeHtml(name || '')}</div>
          ${dateLine}
          ${badge}
          <button class="btn-primary mm-pop-btn" data-open-place="${escapeHtml(placeId || '')}">In Erleben öffnen</button>
        </div>
      `;
    },

    clearModeOverride() {
      this.manualOverride = false;
      localStorage.removeItem(STORAGE_KEY.MODE_OVERRIDE);
      this.pickDefaultMode();
    },

    saveGistUrl() {
      if (!this.gistUrl.trim()) return;
      const normalized = normalizeGistUrl(this.gistUrl.trim());
      this.gistUrl = normalized;
      localStorage.setItem(STORAGE_KEY.GIST_URL, normalized);
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
    },

    // Clear every mm_* localStorage entry (preferences, mode, cached
    // bundle snapshot, debug log, …). Leaves the Service-Worker tile
    // cache untouched so you don't have to re-download map imagery.
    purgeLocalStorage() {
      if (!confirm('localStorage leeren? (Map-Tiles bleiben erhalten)')) return;
      const keys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith('mm_')) keys.push(k);
      }
      keys.forEach(k => localStorage.removeItem(k));
      pushLog('init', `purged ${keys.length} localStorage keys`);
      this.showToast(`${keys.length} Einträge gelöscht`);
      setTimeout(() => location.reload(), 600);
    },

    // Lookups
    findDrive(driveId) {
      return this.bundle?.drives?.find(d => d.id === driveId) || null;
    },

    findStay(stayId) {
      return this.bundle?.stays?.find(s => s.id === stayId) || null;
    },

    // Drives that share (date, from_place_id) with the given candidate drive.
    // Used on travel days where the Kal-2 fork leaves the agent pointing at a
    // single default candidate; the UI offers a tab row to flip between siblings.
    driveSiblings(driveId) {
      const d = this.findDrive(driveId);
      if (!d || d.status !== 'candidate') return [];
      const siblings = (this.bundle?.drives || []).filter(x =>
        x.status === 'candidate' &&
        x.date === d.date &&
        x.from_place_id &&
        x.from_place_id === d.from_place_id
      );
      return siblings.length > 1 ? siblings : [];
    },

    findPlace(placeId) {
      return this.bundle?.places?.find(p => p.id === placeId) || null;
    },

    // Formatters
    formatDuration(minutes) {
      if (minutes == null) return '?';
      const h = Math.floor(minutes / 60);
      const m = minutes % 60;
      return `${h}:${m.toString().padStart(2, '0')}`;
    },

    formatCheckin(iso) {
      if (!iso) return '';
      const d = new Date(iso);
      return d.toLocaleString(this.locale, {
        weekday: 'short',
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23'
      });
    },

    poiIcon(type) {
      const map = {
        sight: '🏛️',
        food: '🍽️',
        gelato: '🍦',
        beach: '🏖️',
        nature: '🏞️',
        charge: '⚡',
        other: '📍'
      };
      return map[type] || '📍';
    },

    // Place picker logic
    get defaultPlace() {
      const stay = this.todayDay ? this.findStay(this.todayDay.stay_id) : null;
      if (stay?.place_id) {
        const p = this.findPlace(stay.place_id);
        if (p) return p;
      }
      const last = localStorage.getItem(STORAGE_KEY.LAST_PLACE);
      if (last) {
        const p = this.findPlace(last);
        if (p) return p;
      }
      return this.bundle?.places?.[0] || null;
    },

    get selectedPlace() {
      if (this.selectedPlaceId) {
        return this.findPlace(this.selectedPlaceId) || this.defaultPlace;
      }
      return this.defaultPlace;
    },

    staysAtPlace(placeId) {
      return (this.bundle?.stays || []).filter(s => s.place_id === placeId);
    },

    selectPlace(id) {
      this.selectedPlaceId = id;
      if (id) localStorage.setItem(STORAGE_KEY.LAST_PLACE, id);
      pushLog('user', `place → ${id}`);
    },

    // Dev-helper: testen der App für einen spezifischen Tag
    // In Console: Alpine.$data(document.querySelector('main')).simulateDate('2026-04-24')
    simulateDate(iso) {
      this._simulatedDate = iso;
      console.log('Simulating date:', iso);
      this.pickDefaultMode();
    }
  }));
});
