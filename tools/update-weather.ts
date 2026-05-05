// Fetch the active travel bundle from a private Gist, refresh per-stay weather
// forecasts via Open-Meteo, and PATCH the updated bundle back into the Gist.
//
// Required env:
//   GIST_TOKEN       — GitHub PAT with `gist` scope
//   GIST_ID          — Gist id holding the bundle
//   BUNDLE_FILENAME  — File inside the gist, e.g. "travel.json"
//
// Optional env:
//   FORECAST_DAYS    — How many days ahead to fetch (default: 7, Open-Meteo cap: 16)
//   DRY_RUN          — Set to "1" to skip the Gist PATCH (prints diff summary only)

const GIST_TOKEN = mustEnv('GIST_TOKEN');
const GIST_ID = mustEnv('GIST_ID');
const BUNDLE_FILENAME = mustEnv('BUNDLE_FILENAME');
const FORECAST_DAYS = Number(process.env.FORECAST_DAYS ?? '7');
const DRY_RUN = process.env.DRY_RUN === '1';

function mustEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`✗ Missing required env: ${name}`);
    process.exit(1);
  }
  return v;
}

type Coords = [number, number];

interface Stay {
  id: string;
  name: string;
  coords?: Coords;
  check_in?: string;
  check_out?: string;
}

interface WeatherDay {
  tmin?: number;
  tmax?: number;
  precip_mm?: number;
  code?: number;
  wind_kmh_max?: number;
  sunrise?: string;
  sunset?: string;
}

interface StayWeather {
  updated_at: string;
  source: string;
  coords: Coords;
  days: Record<string, WeatherDay>;
}

interface Bundle {
  stays?: Stay[];
  weather?: Record<string, StayWeather>;
  [k: string]: unknown;
}

const GIST_API = `https://api.github.com/gists/${GIST_ID}`;

async function fetchBundle(): Promise<Bundle> {
  const res = await fetch(GIST_API, {
    headers: {
      Authorization: `Bearer ${GIST_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  if (!res.ok) throw new Error(`Gist GET failed: HTTP ${res.status}`);
  const gist = await res.json() as { files: Record<string, { content: string }> };
  const file = gist.files[BUNDLE_FILENAME];
  if (!file) throw new Error(`Gist has no file named ${BUNDLE_FILENAME}`);
  return JSON.parse(file.content);
}

async function patchBundle(bundle: Bundle): Promise<void> {
  const body = {
    files: {
      [BUNDLE_FILENAME]: { content: JSON.stringify(bundle, null, 2) + '\n' },
    },
  };
  const res = await fetch(GIST_API, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${GIST_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Gist PATCH failed: HTTP ${res.status} ${await res.text()}`);
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function dateRange(fromIso: string, toIso: string): string[] {
  const out: string[] = [];
  const from = new Date(fromIso + 'T00:00:00Z');
  const to = new Date(toIso + 'T00:00:00Z');
  for (let d = new Date(from); d <= to; d.setUTCDate(d.getUTCDate() + 1)) {
    out.push(isoDate(d));
  }
  return out;
}

async function fetchOpenMeteo(coords: Coords, dates: string[]): Promise<Record<string, WeatherDay>> {
  if (dates.length === 0) return {};
  const start = dates[0];
  const end = dates[dates.length - 1];
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', String(coords[0]));
  url.searchParams.set('longitude', String(coords[1]));
  url.searchParams.set('daily', [
    'temperature_2m_min',
    'temperature_2m_max',
    'precipitation_sum',
    'weather_code',
    'wind_speed_10m_max',
    'sunrise',
    'sunset',
  ].join(','));
  url.searchParams.set('timezone', 'auto');
  url.searchParams.set('start_date', start);
  url.searchParams.set('end_date', end);

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status} for ${coords}`);
  const j = await res.json() as {
    daily: {
      time: string[];
      temperature_2m_min: number[];
      temperature_2m_max: number[];
      precipitation_sum: number[];
      weather_code: number[];
      wind_speed_10m_max: number[];
      sunrise: string[];
      sunset: string[];
    };
  };
  const out: Record<string, WeatherDay> = {};
  const wantedSet = new Set(dates);
  for (let i = 0; i < j.daily.time.length; i++) {
    const date = j.daily.time[i];
    if (!wantedSet.has(date)) continue;
    out[date] = {
      tmin: round1(j.daily.temperature_2m_min[i]),
      tmax: round1(j.daily.temperature_2m_max[i]),
      precip_mm: round1(j.daily.precipitation_sum[i]),
      code: j.daily.weather_code[i],
      wind_kmh_max: round1(j.daily.wind_speed_10m_max[i]),
      sunrise: j.daily.sunrise[i],
      sunset: j.daily.sunset[i],
    };
  }
  return out;
}

function round1(n: number | null | undefined): number | undefined {
  if (n == null || Number.isNaN(n)) return undefined;
  return Math.round(n * 10) / 10;
}

function stayDateOnly(d?: string): string | null {
  if (!d) return null;
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(d);
  return m ? m[1] : null;
}

function relevantDates(stay: Stay, todayIso: string, horizonDays: number): string[] {
  const ci = stayDateOnly(stay.check_in);
  const co = stayDateOnly(stay.check_out);
  if (!ci || !co) return [];
  const horizon = new Date(todayIso + 'T00:00:00Z');
  horizon.setUTCDate(horizon.getUTCDate() + horizonDays);
  const horizonIso = isoDate(horizon);
  const start = ci < todayIso ? todayIso : ci;
  const end = co > horizonIso ? horizonIso : co;
  if (start > end) return [];
  return dateRange(start, end);
}

// ---- main ----

const today = isoDate(new Date());
console.log(`Weather update — today ${today}, horizon ${FORECAST_DAYS}d${DRY_RUN ? ' (DRY RUN)' : ''}`);

const bundle = await fetchBundle();
const stays = bundle.stays ?? [];
console.log(`Bundle has ${stays.length} stays`);

const weather: Record<string, StayWeather> = bundle.weather ?? {};
const updatedAt = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

let touched = 0;
let skipped = 0;

for (const stay of stays) {
  if (!stay.coords) {
    console.log(`  · ${stay.id}: no coords, skip`);
    skipped++;
    continue;
  }
  const dates = relevantDates(stay, today, FORECAST_DAYS);
  if (dates.length === 0) {
    console.log(`  · ${stay.id}: no future dates in window`);
    continue;
  }
  console.log(`  → ${stay.id} (${stay.name}): ${dates[0]} … ${dates[dates.length - 1]} (${dates.length}d)`);
  try {
    const days = await fetchOpenMeteo(stay.coords, dates);
    weather[stay.id] = {
      updated_at: updatedAt,
      source: 'open-meteo',
      coords: stay.coords,
      days,
    };
    touched++;
  } catch (e) {
    console.error(`    ✗ ${(e as Error).message}`);
  }
}

bundle.weather = weather;

console.log(`\n${touched} stays refreshed, ${skipped} skipped.`);

if (DRY_RUN) {
  console.log('DRY_RUN — not patching gist.');
  process.exit(0);
}

await patchBundle(bundle);
console.log('✓ Gist patched.');
