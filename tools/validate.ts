// Validate a travel-bundle against the published JSON Schema.
// Usage:
//   bun tools/validate.ts                         → validates local/travel-bundle-v1.json
//   bun tools/validate.ts path/to/bundle.json     → validates a specific file
//   bun tools/validate.ts https://.../bundle.json → fetches + validates a remote bundle

import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const SCHEMA_PATH = new URL('../schema/travel-bundle.schema.json', import.meta.url).pathname;

const arg = process.argv[2] ?? 'local/travel-bundle-v1.json';

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
  process.exit(0);
}

console.log(`✗ ${arg} failed validation:\n`);
for (const err of validate.errors ?? []) {
  console.log(`  ${err.instancePath || '/'}  ${err.message}  ${JSON.stringify(err.params)}`);
}
process.exit(1);
