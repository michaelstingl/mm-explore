const STORAGE_KEY = {
  GIST_URL: 'mm_gist_url',
  BUNDLE: 'mm_bundle_cache',
  BUNDLE_TIMESTAMP: 'mm_bundle_timestamp',
  MODE_OVERRIDE: 'mm_mode_override',
  LAST_PLACE: 'mm_last_place',
  LOCALE_OVERRIDE: 'mm_locale_override'
};

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

// Register Service Worker (prod only — skip on localhost dev to avoid caching pain)
if ('serviceWorker' in navigator && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then(reg => console.log('[SW] registered:', reg.scope))
      .catch(err => console.warn('[SW] registration failed:', err));
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
      console.log('M+M Explore: init');
      this.parseFragment();
      this.parseDateQuery();
      this.gistUrl = localStorage.getItem(STORAGE_KEY.GIST_URL) || '';
      const storedLocale = localStorage.getItem(STORAGE_KEY.LOCALE_OVERRIDE);
      this.localeOverride = (storedLocale && (storedLocale === 'auto' || isValidLocale(storedLocale))) ? storedLocale : 'auto';
      if (storedLocale && this.localeOverride === 'auto') {
        localStorage.removeItem(STORAGE_KEY.LOCALE_OVERRIDE);
      }
      this.loadCachedBundle();
      await this.fetchBundle();
      this.applyTheme();
      this.pickDefaultMode();
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
        console.log('Simulating date from ?date=', d);
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
      const gistUrl = localStorage.getItem(STORAGE_KEY.GIST_URL);
      if (!gistUrl) {
        alert('Keine Gist-URL konfiguriert.');
        return;
      }
      const shareUrl = `${location.origin}${location.pathname}#gist=${encodeURIComponent(gistUrl)}`;
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
      const hash = window.location.hash;
      const match = hash.match(/#gist=(.+)/);
      if (match) {
        const decoded = decodeURIComponent(match[1]);
        localStorage.setItem(STORAGE_KEY.GIST_URL, decoded);
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
      if (override === 'transit' || override === 'explore') {
        this.mode = override;
        this.manualOverride = true;
        return;
      }
      const day = this.todayDay;
      if (day?.type === 'travel') this.mode = 'transit';
      else this.mode = 'explore';
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
