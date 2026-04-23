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
    mode: 'transit',         // 'transit' | 'explore'
    manualOverride: false,
    selectedPlaceId: null,
    gistUrl: '',
    lastUpdated: null,
    showDayPicker: false,
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
      const dismissed = localStorage.getItem('mm_ios_hint_dismissed');
      return this.isIOS && !this.isStandalone && !dismissed && !!this.bundle;
    },

    dismissIOSHint() {
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
      const shareData = {
        title: this.bundle?.trip?.title || 'M+M Explore',
        text: this.bundle?.trip?.subtitle || 'Unser Reise-Begleiter',
        url: shareUrl
      };
      if (navigator.share) {
        try {
          await navigator.share(shareData);
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
      if (override === 'transit' || override === 'explore') {
        this.mode = override;
        this.manualOverride = true;
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

    // Lookups
    findDrive(driveId) {
      return this.bundle?.drives?.find(d => d.id === driveId) || null;
    },

    findStay(stayId) {
      return this.bundle?.stays?.find(s => s.id === stayId) || null;
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
        beach: '🏖️',
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
