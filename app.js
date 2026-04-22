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
    },

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
      return d.toLocaleString('de-DE', {
        weekday: 'short',
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
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

    // Dev-helper: testen der App für einen spezifischen Tag
    // In Console: Alpine.$data(document.querySelector('main')).simulateDate('2026-04-24')
    simulateDate(iso) {
      this._simulatedDate = iso;
      console.log('Simulating date:', iso);
      this.pickDefaultMode();
    }
  }));
});
