// Validate a travel-bundle against the published JSON Schema.
// Usage:
//   bun tools/validate.ts                         → validates local/travel-bundle-v1.json
//   bun tools/validate.ts path/to/bundle.json     → validates a specific file
//   bun tools/validate.ts https://.../bundle.json → fetches + validates a remote bundle
//
// Flags:
//   --max-age=2h     Threshold for trip.last_updated freshness (default 2h).
//                     Accepts s/m/h/d suffixes, e.g. 30m, 24h, 7d.
//   --strict-age      Treat stale trip.last_updated as a hard failure (exit 2).
//                     Default behavior: print a warning, exit 0.
//   --no-age-check    Skip the age check entirely.
//   --no-xref         Skip cross-reference checks (place_id / drive_id / stay_id linkage).

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
const noXref = flags.includes('--no-xref');
const maxAgeStr = flagValue('max-age', '2h')!;

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
  console.log(`✓ ${arg} passes schema`);
  console.log(`  trip: ${bundle.trip?.title}`);
  console.log(`  ${bundle.days?.length ?? 0} days · ${bundle.drives?.length ?? 0} drives · ${bundle.stays?.length ?? 0} stays · ${bundle.places?.length ?? 0} places`);

  if (!noXref) {
    const xrefErrors = crossRefCheck(bundle);
    if (xrefErrors.length > 0) {
      console.log(`\n✗ cross-reference checks failed:\n`);
      for (const e of xrefErrors) console.log(`  ${e}`);
      process.exit(3);
    }
    console.log(`✓ cross-references consistent`);
  }

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

function crossRefCheck(b: any): string[] {
  const errs: string[] = [];
  const places: any[] = b.places ?? [];
  const drives: any[] = b.drives ?? [];
  const stays: any[] = b.stays ?? [];
  const days: any[] = b.days ?? [];

  const placeIds = new Set(places.map(p => p.id));
  const driveById = new Map(drives.map(d => [d.id, d]));
  const stayById = new Map(stays.map(s => [s.id, s]));

  const isoDate = (s: string | undefined) => (s ?? '').slice(0, 10);

  // 7. *_place_id references must exist
  for (const d of drives) {
    if (d.from_place_id && !placeIds.has(d.from_place_id))
      errs.push(`drives[${d.id}].from_place_id "${d.from_place_id}" not in places[]`);
    if (d.to_place_id && !placeIds.has(d.to_place_id))
      errs.push(`drives[${d.id}].to_place_id "${d.to_place_id}" not in places[]`);
  }
  for (const s of stays) {
    if (s.place_id && !placeIds.has(s.place_id))
      errs.push(`stays[${s.id}].place_id "${s.place_id}" not in places[]`);
  }

  // 8. day.drive_id must reference a non-cancelled drive on the same date
  // 9. day.stay_id must reference a stay covering day.date
  // 10. day.type must match drive/stay presence
  for (const day of days) {
    const date = isoDate(day.date);
    const driveId = day.drive_id;
    const stayId = day.stay_id;

    if (driveId) {
      const dr = driveById.get(driveId);
      if (!dr) {
        errs.push(`days[${date}].drive_id "${driveId}" not in drives[]`);
      } else {
        if (dr.status === 'cancelled')
          errs.push(`days[${date}].drive_id "${driveId}" references a cancelled drive`);
        if (isoDate(dr.date) !== date)
          errs.push(`days[${date}].drive_id "${driveId}" has drive.date ${dr.date} — mismatch`);
      }
    }

    if (stayId) {
      const st = stayById.get(stayId);
      if (!st) {
        errs.push(`days[${date}].stay_id "${stayId}" not in stays[]`);
      } else {
        const ci = isoDate(st.check_in);
        const co = isoDate(st.check_out);
        if (!(ci <= date && date <= co))
          errs.push(`days[${date}].stay_id "${stayId}" — date outside [${ci}, ${co}]`);
      }
    }

    // type must be consistent with refs, but allow:
    //   travel  → drive_id required, stay_id optional (arrival-day pattern)
    //   stay    → stay_id required, drive_id forbidden
    //   mixed   → both required
    if (day.type === 'travel' && !driveId)
      errs.push(`days[${date}].type "travel" but no drive_id`);
    if (day.type === 'stay' && driveId)
      errs.push(`days[${date}].type "stay" but drive_id "${driveId}" present — should be "travel" or "mixed"`);
    if (day.type === 'stay' && !stayId)
      errs.push(`days[${date}].type "stay" but no stay_id`);
    if (day.type === 'mixed' && (!driveId || !stayId))
      errs.push(`days[${date}].type "mixed" requires both drive_id and stay_id`);
  }

  return errs;
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
