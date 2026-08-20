/* A RACK THEME IS WELL-FORMED, OR THE NEXT ART DROP FINDS OUT IN PRODUCTION.
 *
 * WHY THIS EXISTS. Tom, 2026-08-20: "the art is coming in hot and we wanna sell
 * this shit." Today a new batch of art enters the shop exactly one way: somebody
 * hand-edits the 24 ids in RACK_POOLS. The surrounding comments record FIVE
 * invariants that were reasoned out carefully and are then re-checked by hand,
 * every time, forever. This file checks them instead, so a drop is a data change
 * rather than a design review.
 *
 * The one that is a real money bug, not a taste rule: buyRackItem prices by
 * `RACK_POOLS[st.ids.indexOf(artId)][0]`. If one art id ever appeared in two
 * rungs, indexOf would find the FIRST, and the player would be charged the wrong
 * rung's price for a piece from another. js/loot.js's own comment leans on this
 * ("no id appears in two RACK_POOLS rungs, so the indexOf price lookup cannot
 * collide") and nothing enforced it.
 *
 * PURE on purpose: it reads the two source files as text, the same way
 * purchase-firewall's STATIC half does. No browser, no IndexedDB, sub-second, so
 * it can run on every gate and on every art drop.
 *
 * PROVE-RED, each row against a real defect (all seven confirmed 2026-08-20):
 *   EXISTS      point a rung id at 'H99-9'
 *   COLLIDE     repeat one id in a second rung
 *   LADDER      swap two entries of RACK_DUST
 *   LENGTH      drop an entry from RACK_DUST
 *   ANCHOR      raise the cheapest rung above a 340-coin starting wallet
 *   RUNG-SLOT   put a hat id in the socks rung
 *   ADJACENT    seat two rungs of the same body part next to each other
 *
 *   node tests/rack-theme-lint.mjs
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let fails = 0;
const ok = (label, pass, detail = '') => {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}${detail ? `  | ${detail}` : ''}`);
  if (!pass) fails = 1;
};

const lootSrc = readFileSync(path.join(ROOT, 'js/loot.js'), 'utf8');
const bhSrc = readFileSync(path.join(ROOT, 'data/boneheadz.js'), 'utf8');

/* ---- the theme, read out of the source ---- */
const poolsBlock = (lootSrc.match(/export const RACK_POOLS = \[([\s\S]*?)\n\];/) || [])[1];
const dustLine = (lootSrc.match(/export const RACK_DUST = \[([^\]]+)\]/) || [])[1];
const auraLine = (lootSrc.match(/export const RACK_AURA = \{([^}]+)\}/) || [])[1];

const rungs = poolsBlock ? [...poolsBlock.matchAll(/\[\s*(\d+)\s*,\s*\[([^\]]+)\]\s*\]/g)].map(m => ({
  price: +m[1],
  ids: m[2].split(',').map(s => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean),
})) : [];
const dust = dustLine ? dustLine.split(',').map(s => +s.trim()).filter(n => !Number.isNaN(n)) : [];
const auraCarrier = auraLine ? (auraLine.match(/carrier:\s*'([^']+)'/) || [])[1] : null;

/* ---- the catalogue: id -> slot ---- */
const slotOf = new Map();
for (const b of bhSrc.split(/\}\s*,?\s*(?=\{)/)) {
  const id = (b.match(/"id":\s*"([^"]+)"/) || [])[1];
  const slot = (b.match(/"slot":\s*"([^"]+)"/) || [])[1];
  if (id && slot) slotOf.set(id, slot);
}

/* AN EMPTY SAMPLE IS A FAILURE. If either parse returned nothing, every row
   below would pass on an empty set, which is how a lint becomes decoration. */
ok('SAMPLE the theme parsed into rungs, prices and a dust ladder',
  rungs.length >= 8 && dust.length >= 8 && slotOf.size > 300,
  `${rungs.length} rungs, ${dust.length} dust prices, ${slotOf.size} catalogue items`);
ok('SAMPLE every rung parsed with its ids', rungs.every(r => r.ids.length >= 1 && r.price > 0),
  rungs.map(r => `${r.price}x${r.ids.length}`).join(' '));

/* ---- 1. every id is a real piece of art ---- */
const ghosts = rungs.flatMap(r => r.ids).filter(id => !slotOf.has(id));
ok('EXISTS every id on the rack is a real catalogue item', ghosts.length === 0,
  ghosts.length ? `not in the catalogue: ${ghosts.join(', ')} (the tile renders empty)` : `${rungs.flatMap(r => r.ids).length} ids all resolve`);

/* ---- 2. THE MONEY ROW: no id in two rungs ---- */
const seen = new Map(), dupes = [];
rungs.forEach((r, i) => r.ids.forEach(id => {
  if (seen.has(id)) dupes.push(`${id} in rung ${seen.get(id)} (${rungs[seen.get(id)].price}) and rung ${i} (${r.price})`);
  else seen.set(id, i);
}));
ok('COLLIDE no art id appears in two rungs, so indexOf cannot price the wrong one',
  dupes.length === 0, dupes.length ? dupes.join('; ') : `${seen.size} distinct ids`);

/* ---- 3. the dust ladder never reverses ---- */
ok('LENGTH the dust ladder has exactly one price per rung',
  dust.length === rungs.length, `${dust.length} dust prices for ${rungs.length} rungs`);
const rates = rungs.map((r, i) => dust[i] ? +(r.price / dust[i]).toFixed(3) : null);
const monotonic = rates.every((v, i) => i === 0 || (v !== null && rates[i - 1] !== null && v < rates[i - 1]));
ok('LADDER coins-per-dust is strictly single-directional, dearest to cheapest',
  dust.length === rungs.length && monotonic, rates.join(', '));

/* ---- 4. a starting wallet can buy something ---- */
const STARTING_WALLET = 340;
const cheapest = Math.min(...rungs.map(r => r.price));
ok('ANCHOR the rack carries one piece a 340-coin starting wallet can afford',
  cheapest <= STARTING_WALLET, `cheapest rung is ${cheapest}`);

/* ---- 5. a rung is a body part ---- */
const mixed = rungs.filter(r => new Set(r.ids.map(id => slotOf.get(id))).size > 1)
  .map(r => `${r.price}: ${r.ids.map(id => `${id}=${slotOf.get(id)}`).join(' ')}`);
ok('RUNG-SLOT every rung sells ONE body part, so a reroll cannot change what the tile is',
  mixed.length === 0, mixed.length ? mixed.join(' | ') : `${rungs.length} single-slot rungs`);

/* ---- 6. lookalikes are not seated together ---- */
const rungSlot = rungs.map(r => slotOf.get(r.ids[0]) || '?');
const adjacent = rungSlot.map((s, i) => (i > 0 && s === rungSlot[i - 1]) ? `rungs ${i - 1} and ${i} are both ${s}` : null).filter(Boolean);
ok('ADJACENT no two neighbouring tiles sell the same body part',
  adjacent.length === 0, adjacent.length ? adjacent.join('; ') : rungSlot.join(' '));

/* ---- 7. the aura's mannequin is real and is not itself stock ---- */
ok('AURA the aura carrier is a real item and is not for sale on the rack',
  !!auraCarrier && slotOf.has(auraCarrier) && !seen.has(auraCarrier),
  `carrier ${auraCarrier}, in catalogue ${slotOf.has(auraCarrier)}, on the rack ${seen.has(auraCarrier)}`);

console.log(fails ? '\nRACK THEME LINT: FAILED' : '\nRACK THEME LINT: the theme is well-formed and safe to drop art into');
process.exit(fails);
