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
 *
 * AND THE SCAN IS GRADED BEFORE THE EXPORTS ARE. Deriving the expected set from
 * disk buys rot-resistance and costs a failure mode: a glob or a regex that stops
 * reaching finds nothing to check, reports zero missing exports, and passes green
 * forever. Bounding it at "not zero" is not enough either, since a scan that
 * degrades from eleven names to one still reads green. So REACH runs first and
 * fails if the scan is not plausibly seeing the tree: no js/ sources reached, no
 * file mentioning the manifest at all, or any file that DOES mention it yielding
 * no parsed names, which is what a broken import regex looks like from here.
 * Every bound is re-derived per run, so none of it is a number to maintain.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const IMPORT_RE = /import\s*\{([^}]*)\}\s*from\s*['"][^'"]*boneheadz\.js['"]/g;

/* The set that MUST be graded comes from its own walk of js/ and a dumb substring,
   deliberately not from `sources` below. Sharing one list would let a truncated
   scan agree with itself: grade one file, find one file to grade, report green.
   These two disagree the moment the precise path stops reaching what the blunt
   one can still see, which is what every degradation of this audit looks like. */
const mentions = readdirSync(join(ROOT, 'js'))
  .filter(f => f.endsWith('.js'))
  .filter(f => readFileSync(join(ROOT, 'js', f), 'utf8').includes('boneheadz.js'));

const sources = readdirSync(join(ROOT, 'js')).filter(f => f.endsWith('.js'));
const wanted = new Map();               // name -> [files that import it]
const parsed = new Set();               // files an import list was actually read from
for (const f of sources) {
  const src = readFileSync(join(ROOT, 'js', f), 'utf8');
  for (const m of src.matchAll(IMPORT_RE)) {
    parsed.add(f);
    for (const raw of m[1].split(',')) {
      const name = raw.trim().split(/\s+as\s+/)[0].trim();
      if (name) wanted.set(name, [...(wanted.get(name) || []), 'js/' + f]);
    }
  }
}

/* REACH: is this audit looking at anything? Each bound comes off the tree itself. */
const blind = mentions.filter(f => !parsed.has(f));
const reach = [
  [sources.length > 0, `read ${sources.length} source(s) from js/`],
  [mentions.length > 0, `${mentions.length} file(s) name data/boneheadz.js`],
  [blind.length === 0, blind.length
    ? `${blind.length} file(s) name the manifest but yielded no parsed import: ${blind.join(' ')}`
    : `every one of those ${mentions.length} yielded a parsed import list`],
  [wanted.size > 0, `${wanted.size} imported name(s) to grade`],
];
for (const [ok, note] of reach) console.log(`${ok ? 'ok  ' : 'FAIL'}  REACH  ${note}`);
if (reach.some(([ok]) => !ok)) {
  console.log('\nMANIFEST EXPORTS AUDIT: the scan is not reaching the tree, so it is grading nothing.');
  console.log('A broken glob or import regex reports zero missing exports and passes green. Fix the scan, not the bound.');
  process.exit(1);
}
console.log('');

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
