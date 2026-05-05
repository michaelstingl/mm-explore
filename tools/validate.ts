// Validate a travel-bundle against the published JSON Schema.
// Usage:
//   bun tools/validate.ts                         → validates local/travel-bundle-v1.json
//   bun tools/validate.ts path/to/bundle.json     → validates a specific file
//   bun tools/validate.ts https://.../bundle.json → fetches + validates a remote bundle
//
// Flags:
//   --max-age=48h     Threshold for trip.last_updated freshness (default 48h).
//                     Accepts s/m/h/d suffixes, e.g. 30m, 24h, 7d.
//   --strict-age      Treat stale trip.last_updated as a hard failure (exit 2).
//                     Default behavior: print a warning, exit 0.
//   --no-age-check    Skip the age check entirely.

import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const SCHEMA_PATH = new URL('../schema/travel-bundle.schema.json', import.meta.url).pathname;

const argv = process.argv.slice(2);
const flags = argv.filter(a => a.startsWith('--'));
const positional = argv.filter(a => !a.startsWith('--'));
const arg = positional[0] ?? 'local/travel-bundle-v1.json';

const flagValue = (name: string, fallback?: string): string | undefined => {
  const f = flags.find(x => x === `--${name}` || x.startsWith(`--${name}=`));
  if (!f) return fallback;
  const eq = f.indexOf('=');
  return eq === -1 ? '' : f.slice(eq + 1);
};

const noAgeCheck = flags.includes('--no-age-check');
const strictAge = flags.includes('--strict-age');
const maxAgeStr = flagValue('max-age', '48h')!;

function parseDuration(s: string): number {
  const m = /^(\d+)\s*(s|m|h|d)$/.exec(s.trim());
  if (!m) throw new Error(`Invalid duration "${s}" — use e.g. 30m, 24h, 7d`);
  const n = Number(m[1]);
  const unit = m[2];
  const mult = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[unit]!;
  return n * mult;
}

async function loadJson(src: string) {
  if (/^https?:\/\//.test(src)) {
    const res = await fetch(src);
    if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${src}`);
    return await res.json();
  }
  return await Bun.file(src).json();
}

const schema = await Bun.file(SCHEMA_PATH).json();
const bundle = await loadJson(arg);

// @ts-expect-error — .default shim for ESM<->CJS interop
const ajv = new (Ajv2020.default ?? Ajv2020)({ allErrors: true, strict: false });
// @ts-expect-error — same shim
(addFormats.default ?? addFormats)(ajv);

const validate = ajv.compile(schema);

if (validate(bundle)) {
  console.log(`✓ ${arg} is valid`);
  console.log(`  trip: ${bundle.trip?.title}`);
  console.log(`  ${bundle.days?.length ?? 0} days · ${bundle.drives?.length ?? 0} drives · ${bundle.stays?.length ?? 0} stays · ${bundle.places?.length ?? 0} places`);

  if (!noAgeCheck) {
    const lu = bundle.trip?.last_updated;
    if (!lu) {
      console.log(`⚠ trip.last_updated is missing — agents should stamp it on every patch`);
      if (strictAge) process.exit(2);
    } else {
      const ageMs = Date.now() - new Date(lu).getTime();
      const maxMs = parseDuration(maxAgeStr);
      const ageStr = formatAge(ageMs);
      if (ageMs > maxMs) {
        console.log(`⚠ trip.last_updated ${lu} — ${ageStr} old (threshold ${maxAgeStr})`);
        if (strictAge) process.exit(2);
      } else {
        console.log(`  last_updated: ${lu} (${ageStr} old, within ${maxAgeStr})`);
      }
    }
  }

  process.exit(0);
}

function formatAge(ms: number): string {
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  if (h < 48) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

console.log(`✗ ${arg} failed validation:\n`);
for (const err of validate.errors ?? []) {
  console.log(`  ${err.instancePath || '/'}  ${err.message}  ${JSON.stringify(err.params)}`);
}
process.exit(1);
