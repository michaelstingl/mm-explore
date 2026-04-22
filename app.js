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
    mode: 'transit',         // 'transit' | 'explore'
    manualOverride: false,
    selectedPlaceId: null,
    gistUrl: '',
    lastUpdated: null,
    showDayPicker: false,

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
      this.loadCachedBundle();
      await this.fetchBundle();
      this.applyTheme();
      this.pickDefaultMode();
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

    get isSimulating() {
      if (!this._simulatedDate) return false;
      return this._simulatedDate !== this.realToday;
    },

    dayLabel(iso) {
      if (!iso) return '';
      const d = new Date(iso);
      return d.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' });
    },

    formatDow(iso) {
      return new Date(iso).toLocaleDateString('de-DE', { weekday: 'short' });
    },

    formatDom(iso) {
      return new Date(iso).getDate().toString().padStart(2, '0');
    },

    formatMon(iso) {
      return new Date(iso).toLocaleDateString('de-DE', { month: 'short' });
    },

    get calendarMonths() {
      if (!this.bundle?.trip) return [];
      const from = this.bundle.trip.from_date;
      const to = this.bundle.trip.to_date;
      const daysByDate = Object.fromEntries((this.bundle.days || []).map(d => [d.date, d]));

      const months = [];
      let cursor = new Date(from.slice(0, 7) + '-01');
      const end = new Date(to.slice(0, 7) + '-01');

      while (cursor <= end) {
        const y = cursor.getFullYear();
        const m = cursor.getMonth();
        const firstOfMonth = new Date(y, m, 1);
        const firstDow = (firstOfMonth.getDay() + 6) % 7; // Mon=0, Sun=6
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
          label: cursor.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' }),
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
      this.pickDefaultMode();
    },

    resetDate() {
      this._simulatedDate = null;
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
