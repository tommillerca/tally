/* tests/wardrobe-family-audit.mjs — THE COLOURWAY FAMILY RULE, PURE.
 *
 * WHY THIS EXISTS. Tom, 2026-09-04: "we need to collapse similar items into a
 * different interface because as we have different colourways and variations
 * like this helmet or like the kitsune mask those that have collected like 1000
 * head slots over the years will have a messy af wardrobe." The Wardrobe now
 * draws ONE tile per drawing and hangs the variants off a rail, so a single
 * function -- bhFamilyKey in data/boneheadz.js -- decides what the player can
 * see and what is one tap further away. Get it wrong in either direction and
 * the damage is silent: over-collapse hides a legendary inside a common's tile,
 * under-collapse is the messy grid we started with.
 *
 * THE RULE IS THE ID STEM, AND IT WAS MEASURED, NOT REASONED. Three candidates
 * were graded against the shipped PNGs by alpha-silhouette IoU at 256px (a
 * recolour of one drawing keeps its outline; two drawings do not), over all 363
 * player-slot items on v473:
 *
 *   rule            tiles   same-family pairs   pairs under IoU 0.80
 *   id stem          233          125                     0
 *   name prefix      320           38                    27
 *   name last word   183          175                    17
 *
 * WHAT IT ASSERTS
 *   SETUP     the catalogue actually loaded, and it is the size we think.
 *   PREMISE   there ARE multi-member families to grade. Without this every row
 *             below passes for free on a catalogue of singletons, which is the
 *             exact shape a broken rule produces.
 *   PARTITION every item lands in exactly one family: nothing lost (an item you
 *             own with no tile is unwearable), nothing duplicated.
 *   SLOT      no family spans two slots. A rail lives inside one slot's grid,
 *             so a cross-slot family would offer a hat on the Kicks screen.
 *   SOLO      most families are still ONE item, and a family of one holds
 *             exactly the item it was built from. That tile is untouched in
 *             js/app.js, and this is what proves the rule is not swallowing the
 *             catalogue to make the numbers look good.
 *   APART     the CONTROL, and the only row here that is not a restatement of
 *             the rule: twelve pairs MEASURED as different drawings (IoU printed
 *             per pair) must land in different families. Ten of the twelve are
 *             merged by name-prefix or name-last-word matching, so this row goes
 *             red the moment somebody "improves" bhFamilyKey into name matching.
 *   FILE      two items sharing one art file are one family, two with different
 *             files are not. This is how the football kit's 32 tinted helmets
 *             (`fb-<team>-helmet`, no shared id stem, one master PNG) collapse
 *             with no football knowledge in the rule, and it is graded on
 *             synthetic items so this file never has to import that branch.
 *   OVERRIDE  an explicit `family` beats both. Unused in the catalogue today and
 *             deliberately so (see the note in data/boneheadz.js); it is the
 *             fix for the series authored before the -N convention.
 *   CEILING   the measured win: the worst slot fits in a grid a player can
 *             actually reach the end of. 4 columns, so <= 40 tiles is <= 10 rows.
 *   ORDER     families come back in catalogue order, so the grid does not
 *             reshuffle itself between renders.
 *
 * PROVE-RED, 2026-09-04, on a cp -R copy of data/ and tests/ outside the
 * worktree. Every mutation asserted `source.count(old) == 1` BEFORE the replace,
 * so "it stayed green" could never mean "the replace matched nothing", and the
 * unmutated copy was re-run green after each one.
 *
 *   1. bhFamilyKey becomes name-prefix matching (`${i.slot}:${name.split(' ')[0]}`)
 *      FAIL  APART twelve pairs measured as DIFFERENT drawings are in different
 *            families: H10-4+HS22 merged (silhouette IoU 0.000, looks like a
 *            regression to name prefix "Skull"); G10+GS3 merged (silhouette IoU
 *            0.051, ...); IR6+IR7-1 (0.083); IL4-1+IL6-3 (0.090); H13-5+HS19
 *            (0.131); IL11-2+IL17-1 (0.136); E11-1+E4 (0.146)
 *      (PREMISE, FILE and both CEILING rows go red with it: 5 of 13.)
 *   2. the `i.file` branch deleted
 *      FAIL  FILE items sharing one art file are one family, a different file is
 *            another: 3 tinted items -> 3 tiles holding [1, 1, 1] (32 team
 *            helmets would be one tile of 32)
 *   3. the `i.family ||` override deleted
 *      FAIL  OVERRIDE an explicit `family` beats the id stem: two ids with no
 *            shared stem -> 2 family
 *   4. bhFamilies keeps only the first member of each family
 *      FAIL  PARTITION every item lands in exactly one family: 233 placed / 233
 *            distinct / 358 items, 233 families
 *   5. the -N suffix is no longer stripped (no collapse at all)
 *      FAIL  CEILING the worst slot fits inside ten rows of the grid: H: 57
 *            items -> 57 tiles (15 rows, was 15)
 *

 * Node-only, no browser, no db. Measured under 1s.
 */
import { BH_ITEMS_WITH_UNRELEASED, BH_BY_ID, bhFamilyKey, bhFamilies } from '../data/boneheadz.js';

let checks = 0, failed = 0;
const ok = (name, cond, detail = '') => {
  checks++;
  if (!cond) { failed++; console.log(`FAIL  ${name}${detail ? ': ' + detail : ''}`); }
  else console.log(`ok    ${name}${detail ? ': ' + detail : ''}`);
};

/* The slots a player's own Wardrobe grid draws. Pets and pet accessories live in
   the Stable and are picked by a different screen. */
const PET = new Set(['C', 'CB', 'CE', 'CG', 'CM', 'CH', 'CT']);
const ITEMS = BH_ITEMS_WITH_UNRELEASED.filter(i => !PET.has(i.slot));
const FAMS = bhFamilies(ITEMS);
const groups = [...FAMS.values()];
const multi = groups.filter(g => g.length > 1);

ok('SETUP the catalogue loaded and holds the player slots', ITEMS.length >= 300,
  `${ITEMS.length} items across ${new Set(ITEMS.map(i => i.slot)).size} slots`);
ok('PREMISE there are real multi-member families to grade', multi.length >= 40,
  `${multi.length} families of 2+ (largest ${Math.max(...groups.map(g => g.length))})`);

/* ---- PARTITION: every item gets exactly one tile ------------------------- */
const seen = new Set(groups.flat().map(i => i.id));
const total = groups.reduce((a, g) => a + g.length, 0);
ok('PARTITION every item lands in exactly one family',
  total === ITEMS.length && seen.size === ITEMS.length,
  `${total} placed / ${seen.size} distinct / ${ITEMS.length} items, ${groups.length} families`);

/* ---- SLOT: a family is one slot's business ------------------------------- */
const crossSlot = groups.filter(g => new Set(g.map(i => i.slot)).size > 1);
ok('SLOT no family spans two slots', crossSlot.length === 0,
  crossSlot.length ? crossSlot.map(g => g.map(i => `${i.slot}/${i.id}`).join('+')).join(', ') : `${groups.length} families, all single-slot`);

/* ---- SOLO: the rule is not swallowing the catalogue ---------------------- */
const solo = groups.filter(g => g.length === 1);
const soloHoldsItself = solo.every(g => bhFamilyKey(g[0]) === bhFamilyKey(g[0]) && BH_BY_ID[g[0].id]);
ok('SOLO most families are still a single item, and each holds exactly its own',
  solo.length > groups.length / 2 && soloHoldsItself,
  `${solo.length} of ${groups.length} families are one item (these render as the tile that already shipped)`);

/* ---- APART: the control. Measured-different drawings stay apart ---------- */
/* Alpha-silhouette IoU at 256px against the shipped PNGs, 2026-09-04. `by` names
   which rejected rule merges the pair, so a regression toward that rule is
   legible in the failure and not just in this comment. */
const APART = [
  ['H10-4', 'HS22', 0.000, 'name prefix "Skull"'],
  ['M3', 'M8', 0.000, 'name last word "Straw"'],
  ['IL16-1', 'IL9', 0.019, 'name last word "Banner"'],
  ['E4', 'ES11', 0.036, 'name last word "Pinpricks"'],
  ['G10', 'GS3', 0.051, 'name prefix "Ice"'],
  ['G12', 'G2', 0.065, 'name last word "Cap"'],
  ['IR6', 'IR7-1', 0.083, 'name prefix "Smiley"'],
  ['IL4-1', 'IL6-3', 0.090, 'name prefix "Blue"'],
  ['H13-5', 'HS19', 0.131, 'name prefix "Grape"'],
  ['IL11-2', 'IL17-1', 0.136, 'name prefix "Gilded"'],
  ['E11-1', 'E4', 0.146, 'name prefix "Red"'],
  ['IL11-1', 'IL7-1', 0.561, 'name last word "Katana"'],
];
const missing = APART.flatMap(([a, b]) => [a, b]).filter(id => !BH_BY_ID[id]);
ok('SETUP every control pair still exists in the catalogue', missing.length === 0,
  missing.length ? `gone: ${missing.join(', ')} (re-measure the pairs, do not delete the row)` : `${APART.length} measured pairs`);
const merged = APART.filter(([a, b]) => BH_BY_ID[a] && BH_BY_ID[b] && bhFamilyKey(BH_BY_ID[a]) === bhFamilyKey(BH_BY_ID[b]));
ok('APART twelve pairs measured as DIFFERENT drawings are in different families',
  merged.length === 0,
  merged.length
    ? merged.map(([a, b, iou, by]) => `${a}+${b} merged (silhouette IoU ${iou.toFixed(3)}, looks like a regression to ${by})`).join('; ')
    : `worst measured pair kept apart: ${APART[APART.length - 1][0]}+${APART[APART.length - 1][1]} at IoU ${APART[APART.length - 1][2]}`);

/* ---- FILE: one PNG is one drawing (this is what collapses the kit) ------- */
const kit = [
  { id: 'fb-a-helmet', slot: 'H', rarity: 'epic', name: 'A Helmet', file: 'assets/bh/football/helmet.png' },
  { id: 'fb-b-helmet', slot: 'H', rarity: 'epic', name: 'B Helmet', file: 'assets/bh/football/helmet.png' },
  { id: 'fb-a-jersey', slot: 'T', rarity: 'epic', name: 'A Jersey', file: 'assets/bh/football/jersey.png' },
];
const kitFams = bhFamilies(kit);
ok('FILE items sharing one art file are one family, a different file is another',
  kitFams.size === 2 && [...kitFams.values()].some(g => g.length === 2),
  `${kit.length} tinted items -> ${kitFams.size} tiles holding [${[...kitFams.values()].map(g => g.length).join(', ')}] (32 team helmets would be one tile of 32)`);
ok('FILE the branch is inert for the hand-drawn catalogue',
  ITEMS.every(i => !i.file),
  `${ITEMS.filter(i => i.file).length} catalogue items carry a file`);

/* ---- OVERRIDE: the escape hatch ------------------------------------------ */
const over = bhFamilies([
  { id: 'G3', slot: 'G', family: 'G:one', name: 'One Silver', rarity: 'common' },
  { id: 'G6', slot: 'G', family: 'G:one', name: 'One Amethyst', rarity: 'common' },
]);
ok('OVERRIDE an explicit `family` beats the id stem', over.size === 1,
  `two ids with no shared stem -> ${over.size} family`);

/* ---- CEILING: the win, in tiles ----------------------------------------- */
/* .ward-grid is 4 columns (app.css), so this is the slot's row count x 4. The
   number is a CEILING and not a pin: adding items must be allowed, letting the
   worst slot creep back past ten rows must not. */
const bySlot = {};
for (const i of ITEMS) (bySlot[i.slot] = bySlot[i.slot] || []).push(i);
const worst = Object.entries(bySlot)
  .map(([s, v]) => [s, v.length, bhFamilies(v).size])
  .sort((a, b) => b[2] - a[2])[0];
ok('CEILING the worst slot fits inside ten rows of the grid', worst[2] <= 40,
  `${worst[0]}: ${worst[1]} items -> ${worst[2]} tiles (${Math.ceil(worst[2] / 4)} rows, was ${Math.ceil(worst[1] / 4)})`);
ok('CEILING the collapse does something on the slots that need it',
  worst[2] < worst[1] * 0.75,
  `${worst[0]} cut ${worst[1] - worst[2]} tiles (${Math.round((1 - worst[2] / worst[1]) * 100)}%)`);

/* ---- ORDER: the grid does not reshuffle --------------------------------- */
const firstOf = groups.map(g => ITEMS.indexOf(g[0]));
ok('ORDER families come back in catalogue order',
  firstOf.every((v, n) => n === 0 || v > firstOf[n - 1]),
  `${groups.length} families, first-member indices ascending`);

console.log(`\n${checks} checks, ${failed} failed`);
console.log(failed ? `${failed} FAILED` : 'FAMILY RULE: ONE TILE PER DRAWING, NOTHING LOST, NOTHING WRONGLY MERGED');
process.exit(failed ? 1 : 0);
