/* THE MANIFEST MUST STILL EXPORT EVERYTHING THE APP IMPORTS FROM IT.
 *
 * THE CLASS. scripts/build-cosmetics.py wrote data/boneheadz.js from a template
 * that emitted four exports. The shipped file has more than four: the item array
 * is followed by BH_ITEMS_ALL's `unreleased` filter, BH_ITEMS_WITH_UNRELEASED,
 * PET_SHOP, PET_SLOTS, PET_CROP and the PET_HERO_* tables, none of which the
 * generator knows how to produce. Every regenerating rebuild deleted all of them.
 *
 * WHY THIS IS ITS OWN AUDIT AND NOT PART OF THE ITEM CHECKS. The 2026-08-21 fix
 * mirrored 69 hand-added items into SPECIALS and copied name+rarity forward, and
 * it worked: a rebuild after it lost ZERO items. It still deleted seven exports,
 * because "no item was lost" and "the file still loads" are different claims and
 * only the first one was being checked. Measured on the rebuild output:
 *      BH_ITEMS_WITH_UNRELEASED  PET_CROP  PET_SLOTS  PET_SHOP
 *      PET_HERO_REF  PET_HERO_HOUSE  PET_HERO_REL
 * These are static named imports, so the failure is not a missing feature, it is
 * a module that will not load. PET_SHOP is what sells Bumbleseal for 50,000
 * coins, so the shop dies with it.
 *
 * THE METHOD. Read the `import { ... } from '.../boneheadz.js'` lists straight
 * off the js/ sources and require the manifest to export every name in them. The
 * expected set is DERIVED FROM DISK on every run, never listed here: a table in
 * a test is a claim that rots the day someone imports an eighth name.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const IMPORT_RE = /import\s*\{([^}]*)\}\s*from\s*['"][^'"]*boneheadz\.js['"]/g;

const wanted = new Map();               // name -> [files that import it]
for (const f of readdirSync(join(ROOT, 'js')).filter(f => f.endsWith('.js'))) {
  const src = readFileSync(join(ROOT, 'js', f), 'utf8');
  for (const m of src.matchAll(IMPORT_RE))
    for (const raw of m[1].split(',')) {
      const name = raw.trim().split(/\s+as\s+/)[0].trim();
      if (name) wanted.set(name, [...(wanted.get(name) || []), 'js/' + f]);
    }
}
if (wanted.size === 0) {
  console.log('FAIL  parsed 0 imports from js/*.js, so this audit is grading nothing');
  process.exit(1);
}

const mod = await import(join(ROOT, 'data', 'boneheadz.js'));
const missing = [...wanted].filter(([n]) => mod[n] === undefined);

for (const [n, files] of wanted)
  console.log(`${mod[n] === undefined ? 'FAIL' : 'ok  '}  ${n.padEnd(26)} ${files.join(' ')}`);

if (missing.length) {
  console.log(`\nMANIFEST EXPORTS AUDIT: data/boneheadz.js is missing ${missing.length} export(s) the app imports by name.`);
  console.log('If this went red after a cosmetics rebuild, the build regenerated the file instead of splicing into it.');
  process.exit(1);
}
console.log(`\nMANIFEST EXPORTS AUDIT: all ${wanted.size} names imported across js/ are exported by the manifest.`);
