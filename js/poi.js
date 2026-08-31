// Boss dens: the Bone Road, reimagined as real-world destinations.
// Dens are PERMANENT landmarks (position seeded by geographic cell only, so
// they never move); their boss and reward REFRESH WEEKLY (theme/tier seeded by
// cell + ISO week). Everything is deterministic and idempotent: the ledger key
// `boss-<week>-<denId>` makes each den claimable once per week, server-verifiable
// later, exactly like hunt spawns.
import { award, levelFor, totalXp } from './game.js';
import { coinsAdd, grantCrate, grantGear, ownedGearIds, boneDustAdd } from './loot.js';
import { kvGet, kvSet, kvUpdate, db, claimDay } from './db.js';
import { GEAR_ITEMS } from './gear.js';
import { TALENT_TREES } from './pit.js';
import { distanceM, bearingDeg } from './hunt.js';
import { dateKey } from './nutrition.js';

// the player's leaning archetype = the talent tree they've invested most in
// (tree ids match gear archetypes). Used to bias one boss-drop choice to their spec.
async function dominantArch() {
  const taken = new Set((await kvGet('talents', [])) || []);
  if (!taken.size) return null;
  let best = null, bestN = 0;
  for (const t of TALENT_TREES) {
    const n = t.nodes.filter(nd => taken.has(nd.id)).length;
    if (n > bestN) { bestN = n; best = t.id; }
  }
  return best;
}

export const DEN_CELL_DEG = 0.01;        // ~1.1 km cells: a few dens within any walk
/* A DESTINATION SHOULD NOT BE HARDER TO REACH THAN A PICKUP.
   This said "a touch roomier than spawns" and it was, when spawns were 45. They
   went 45 -> 55 -> 75 and these never moved, so a boss den you make a special
   trip for ended up 15m TIGHTER than something you brush past on the pavement.
   Tom noticed from feel alone, 2026-08-08: "does the new 75m radius include boss
   dens because it feels like it doesn't". It did not.
   Destinations sit above the spawn radius now, and tests/unit.test.js pins the
   ORDERING rather than the numbers, so the next spawn bump cannot invert it
   again. */
export const DEN_RADIUS_M = 80;          // enter range (roomier than spawns, as intended)

// Reward ladder carried over from the old ROAD_STOPS table (same economy),
// low tiers common, top tiers rare: ~2-4 reachable dens/week matches old pacing.
export const DEN_TIERS = [
  { mult: 0.75, aiLevel: 1, reward: { crate: 'daily', xp: 40 } },
  { mult: 0.85, aiLevel: 1, reward: { coins: 120, xp: 40 } },
  { mult: 0.95, aiLevel: 2, reward: { crate: 'golden', xp: 60 } },
  { mult: 1.05, aiLevel: 2, reward: { crate: 'egg', coins: 150, xp: 60 } },
  { mult: 1.12, aiLevel: 2, reward: { crate: 'golden', xp: 60 }, talents: ['heavyhands'] },
  { mult: 1.2, aiLevel: 3, reward: { coins: 250, crate: 'daily', xp: 60 }, talents: ['heavyhands', 'marrowlust'] },
  { mult: 1.32, aiLevel: 3, reward: { crate: 'golden', coins: 200, xp: 100 }, talents: ['heavyhands', 'marrowlust', 'bonebreaker'] },
];
const TIER_WEIGHTS = [3, 3, 2, 2, 1.2, 0.8, 0.4]; // mostly approachable, sometimes a monster

// The 2nd body a boss brings is its BEAST, not a random skeleton — named per den
// theme so it reads as "the boss's creature" (Tom's exact instinct). Falls back to
// a generic hound. Kept in poi.js so denForCell + escalateDen name it identically.
const DEN_BEASTS = {
  slab: 'Bonehound', greyhound: 'Pit Cur', gravewarden: 'Grave Wretch',
  ringmaster: 'Circus Beast', gravecaller: 'Risen Hound', boneshaman: 'Marsh Leech',
  stormcaller: 'Arc Hound',
};
export function denBeastName(theme) {
  const b = DEN_BEASTS[theme && theme.arch];
  return b ? `${theme.boss}'s ${b}` : `${(theme && theme.boss) || 'The Boss'}'s Beast`;
}

// Themes reuse the Bone Road / Pit art language.
/* THE MAGE. Tom, 2026-08-09: "we need a popup for the new boss art. i want some
   dens to always be the new mage." He is drawn, not assembled from cosmetics, so
   he is a theme with `art` set and the fight draws the illustration instead of a
   Bonehead stack, the same way The Glutton works. Deliberately NOT in the random
   pool below: he is pinned to fixed cells so a mage den is a landmark you can go
   back to, not a weekly coin flip. */
export const MAGE_THEME = { key: 'mage', name: 'The Storm Vault', boss: 'The Live Wire', arch: 'stormcaller', art: 'mage' };
/* HALF, FOR NOW. Tom, 2026-08-10: "Let's make 50% of dens live wire right now
   because he's new eventually we can move to 1/4." A new boss should be the thing
   you keep running into while he is the news; this drops back to 0.25 once he is
   not. Nothing on the map marks his dens either way (see buildDenPin), so a
   higher share is more encounters, not more spoilers. */
export const MAGE_CELL_SHARE = 0.5;   // half while he is the new thing; 0.25 later

export const DEN_THEMES = [
  { key: 'gate', name: 'The Boneyard Gate', boss: 'The Gatekeeper', arch: 'slab' },
  { key: 'catacomb', name: 'The Catacomb Club', boss: 'The Bouncer Below', arch: 'greyhound' },
  { key: 'chapel', name: 'The Chapel Undercroft', boss: 'The Grave Sexton', arch: 'gravewarden' },
  { key: 'colosseum', name: 'The Sunken Colosseum', boss: 'The Pit Lion', arch: 'ringmaster' },
  { key: 'crypt', name: 'The Old Crypt', boss: 'The Crypt Keeper', arch: 'gravecaller' },
  { key: 'marsh', name: 'The Sour Marsh', boss: 'The Bog Body', arch: 'boneshaman' },
];

function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
/* FNV alone is badly non-uniform on short, near-identical keys, and mulberry32's
   FIRST output inherits that: `% 6` put the Mage on 6.5% of dens instead of 17%,
   and seeding mulberry32 with it gave 33%. Both left a third of players with no
   mage den anywhere near them. This is the standard finaliser avalanche, measured
   at 24.9% share and 7.4% of neighbourhoods empty against a 25% target. */
function mixHash(h) {
  h ^= h >>> 16; h = Math.imul(h, 2246822507);
  h ^= h >>> 13; h = Math.imul(h, 3266489909);
  return (h ^ (h >>> 16)) >>> 0;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* A stable per-install random, folded into every loot seed so two players who
   beat the same boss on the same day do not get the same drop. Created once and
   kept in kv, so it survives across sessions and a cloud restore: a salt that
   changed on every open would reroll a pending boss chooser under the player,
   which is worse than sharing a drop. Never leaves the device. */
export async function lootSalt() {
  let s = await kvGet('lootSalt', null);
  if (!s) {
    s = [...crypto.getRandomValues(new Uint8Array(8))].map(b => b.toString(16).padStart(2, '0')).join('');
    await kvSet('lootSalt', s);
  }
  return s;
}

// ISO week key, e.g. "2026-W27": the weekly refresh clock for every den.
export function isoWeekKey(d = new Date()) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function denCellOf(lat, lng) {
  return { cx: Math.round(lat / DEN_CELL_DEG), cy: Math.round(lng / DEN_CELL_DEG) };
}

/* One den per den-cell. Its POSITION is week-seeded, so a landmark den moves
   within its cell every Monday alongside its theme and tier.
   Tom, 2026-08-08: "let's make it so boss dens change their location every week."
   Previously the position was seeded by cell ALONE (permanent) while only the
   theme and tier rerolled, so the same three pins sat on the same three corners
   forever and the weekly refresh was invisible unless you read the boss name.
   Adding `week` to the position seed is also what moves them TODAY: this week's
   seed differs from the old cell-only one, so the first load after this ships
   relocates every den, then they move again at each ISO week boundary.
   The claim key is `boss-<week>-<id>` and the id stays cell-based, so a move
   cannot resurrect a den you already beat this week. */
function denForCell(week, cx, cy) {
  const posRng = mulberry32(hashStr(`den:${week}:pos:${cx}:${cy}`));
  const lat = (cx + (posRng() - 0.5) * 0.86) * DEN_CELL_DEG;
  const lng = (cy + (posRng() - 0.5) * 0.86) * DEN_CELL_DEG;
  // weekly identity: theme, boss tier
  const wkRng = mulberry32(hashStr(`den:${week}:${cx}:${cy}`));
  const rolled = DEN_THEMES[Math.floor(wkRng() * DEN_THEMES.length)];
  /* Seeded on the CELL, never the week: his dens do not rotate away. Run through
     mulberry32 rather than a raw hash modulo, which is badly non-uniform on short
     keys: `% 6` put him on 6.5% of dens instead of 17%, and left four players in
     five with no mage den anywhere near them. Measured, not assumed. */
  const theme = mixHash(hashStr(`mage:${cx}:${cy}`)) / 4294967296 < MAGE_CELL_SHARE ? MAGE_THEME : rolled;
  let roll = wkRng() * TIER_WEIGHTS.reduce((a, b) => a + b, 0), tier = 0;
  for (let i = 0; i < TIER_WEIGHTS.length; i++) { roll -= TIER_WEIGHTS[i]; if (roll <= 0) { tier = i; break; } }
  const den = {
    id: `${cx}_${cy}`,
    lat, lng, theme, tier,
    name: theme.name,
    boss: theme.boss,
    ...DEN_TIERS[tier],
  };
  // The toughest dens are a 2-on-1: the boss brings a minion. Two bodies is the
  // real "outnumbered" threat. The boss itself is EASED (bossMult below its solo
  // tier) precisely because it fights alongside an add, so the pair is a genuine
  // but beatable threat rather than an impossible wall. These are the endless keys.
  if (tier >= 5) {
    const bm = tier >= 6 ? 0.9 : 0.8;
    den.bossMult = bm;
    den.add = { name: denBeastName(theme), beast: true, mult: bm * 0.6, talents: [] };
  }
  return den;
}

// ROAMING dens (v159): boss-grade dens that appear + relocate DAILY, alongside
// the permanent weekly landmark dens, so the map stays fresh day to day. Only a
// fraction of cells host one on a given day, position + boss are day-seeded (so
// they truly move), and rewards are LIGHTER than a landmark den (mostly coins/XP,
// occasional crate) to keep the loot faucet in check. Beatable once per day.
export const ROAM_CHANCE = 0.4;          // ~40% of nearby cells host a roamer each day
const ROAM_TIERS = [
  { mult: 0.90, aiLevel: 1, reward: { coins: 45, xp: 45 } },
  { mult: 1.08, aiLevel: 2, reward: { crate: 'daily', coins: 40, xp: 60 } },
  { mult: 1.28, aiLevel: 3, reward: { crate: 'golden', coins: 70, xp: 90 }, talents: ['heavyhands'] },
];
const ROAM_TIER_WEIGHTS = [5, 3, 1.2];   // mostly light; a golden roamer is a rare event
function roamDenForCell(date, cx, cy) {
  const rng = mulberry32(hashStr(`roam:${date}:${cx}:${cy}`));
  if (rng() > ROAM_CHANCE) return null;  // no roamer in this cell today
  const lat = (cx + (rng() - 0.5) * 0.86) * DEN_CELL_DEG;
  const lng = (cy + (rng() - 0.5) * 0.86) * DEN_CELL_DEG;
  const theme = DEN_THEMES[Math.floor(rng() * DEN_THEMES.length)];
  let roll = rng() * ROAM_TIER_WEIGHTS.reduce((a, b) => a + b, 0), tier = 0;
  for (let i = 0; i < ROAM_TIER_WEIGHTS.length; i++) { roll -= ROAM_TIER_WEIGHTS[i]; if (roll <= 0) { tier = i; break; } }
  return { id: `roam-${date}-${cx}-${cy}`, roaming: true, day: date, lat, lng, theme, tier, name: theme.name, boss: theme.boss, ...ROAM_TIERS[tier] };
}

// The dens around a position (3x3 den-cells: up to ~5-6 km out). Pass `date` to
// also include the day's roaming dens; omit it for landmark dens only.
export function densNear(week, lat, lng, date = null) {
  const { cx, cy } = denCellOf(lat, lng);
  const out = [];
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
    out.push(denForCell(week, cx + dx, cy + dy));
    if (date) { const rd = roamDenForCell(date, cx + dx, cy + dy); if (rd) out.push(rd); }
  }
  for (const d of out) {
    d.dist = distanceM(lat, lng, d.lat, d.lng);
    d.bearing = bearingDeg(lat, lng, d.lat, d.lng);
  }
  return out.sort((a, b) => a.dist - b.dist);
}

export function denKey(week, den) {
  if (den.remote) return `remoteboss-${den.day}`;
  return den.roaming ? `roamboss-${den.day}-${den.id}` : `boss-${week}-${den.id}`;
}

/* THE REMOTE DEN (2026-08-08).
 *
 * Tom, 2026-08-06: "People that can't get out for walks feel like there's no
 * point to log on. Should we do a remote pass boss fight free daily or
 * something?"
 *
 * The Pit's energy was never the blocker (three free fights a day, plus Vigor
 * you earn by LOGGING, plus unlimited sparring). The real walls were the map:
 * boss dens need GPS, and the Gauntlet's ceiling only rises when you beat one.
 * So a housebound player was permanently capped at endless rank 5 no matter how
 * well they ate.
 *
 * This is one boss a day that needs no location at all. It is deliberately
 * MODEST: tier is capped below the nastiest landmark dens, there is no gear
 * chooser, and it is once per day, so walking out to a real den is still the
 * better deal. What it does do is count as a den win, which unblocks the
 * Gauntlet for people who cannot walk to one.
 *
 * Deterministic from the date, so everyone in the Crew faces the same boss
 * today and can talk about it.
 */
const REMOTE_MAX_TIER = 4;   // below the 2-on-1 monsters that gate on tier >= 5
export function remoteDen(day = dateKey()) {
  const rng = mulberry32(hashStr(`remote:${day}`));
  /* he is in this pool too, so the daily remote den (and the Today row that
     names it) is him roughly one day in seven. */
  const pool = [...DEN_THEMES, MAGE_THEME];
  const theme = pool[Math.floor(rng() * pool.length)];
  const tier = Math.floor(rng() * (REMOTE_MAX_TIER + 1));
  const t = DEN_TIERS[tier];
  return {
    id: `remote-${day}`, day, remote: true, tier, theme,
    name: theme.name, boss: theme.boss,
    ...t,
    // lighter than a landmark den: no gear chooser, and the crate drops a tier
    reward: { xp: t.reward.xp, coins: Math.round((t.reward.coins || 80) * 0.6), crate: t.reward.crate === 'golden' ? 'daily' : t.reward.crate },
  };
}

// How many world-boss dens you have ever beaten (drives the endless-Pit gate).
export async function denWinsCount() {
  const xp = await db.all('xp');
  // DISTINCT dens ever beaten (drives the endless-Pit gate + difficulty ramp).
  // Daily re-clears log as 'bossday' and are NOT counted, so grinding a den daily
  // never inflates progression. New clears mark 'bossfirst-<denId>'; legacy weekly
  // 'boss' rows are deduped by their key so veterans keep roughly their old count.
  const ids = new Set();
  for (const r of xp) {
    if (r.type === 'bossfirst') ids.add(r.key.slice('bossfirst-'.length));
    else if (r.type === 'boss') ids.add(r.key);
  }
  return ids.size;
}

// v123: world bosses RAMP with your progression so they never go stale. The base
// den tier sets the floor; every den you've ever beaten pushes difficulty up:
// higher stat multiplier (past the old 1.32 cap), smarter AI, and a minion that
// joins from the 5th win on (the pair, not one dummy, is the real threat). Early
// game is unchanged (wins 0 = the original tier). Returns a foeCfg-ready shape.
export function escalateDen(den, wins) {
  const w = Math.max(0, Math.floor(wins || 0));
  // The escalation leans on a SMARTER boss and a SECOND body, not a runaway
  // multiplier. The stat ramp is deliberately gentle and capped near Champion
  // territory so an engaged player keeps a real shot while a coaster hits a wall.
  const ramp = Math.min(0.55, w * 0.035);                   // +3.5% per den beaten, capped +0.55
  const aiLevel = Math.min(6, (den.aiLevel || 1) + Math.floor(w / 4));
  const soloMult = +((den.mult || 1) + ramp).toFixed(3);
  const hasAdd = !!den.add || w >= 5;
  if (!hasAdd) return { mult: soloMult, bossMult: null, aiLevel, add: null };
  // paired: you carry a pet ally now, so the fight is 2v2, not the pet-less 2v1
  // the old den tiers assumed. Only lightly ease the captain (the add is the extra
  // threat, but a full-strength captain PLUS an add turns brutal against a pet that
  // is weaker than a real fighter). Keep the captain near its solo strength.
  const bossMult = +(soloMult * 0.9).toFixed(3);
  const addBase = den.add && den.add.mult != null ? den.add.mult : (den.mult || 1) * 0.5;
  const add = {
    name: (den.add && den.add.name) || denBeastName(den),
    beast: true,
    mult: +(addBase + ramp * 0.3).toFixed(3),
    talents: (den.add && den.add.talents) || (w >= 12 ? ['heavyhands'] : []),
  };
  return { mult: soloMult, bossMult, aiLevel, add };
}

/* The gear-drop odds for a den, read off the SAME weights the roll uses, so the
   sheet can never advertise a chance the game does not honour. Percentages are
   rounded for display and the largest slice absorbs the rounding, so they always
   read as exactly 100. */
export function denGearOdds(tier = 0) {
  const w = RARITY_WEIGHTS[Math.min(Math.max(0, tier | 0), RARITY_WEIGHTS.length - 1)];
  const total = w[0] + w[1] + w[2];
  const pcts = w.map(x => Math.round((x / total) * 100));
  const drift = 100 - (pcts[0] + pcts[1] + pcts[2]);
  const biggest = pcts.indexOf(Math.max(...pcts));
  pcts[biggest] += drift;
  return RARITY_TIERS.map((rarity, i) => ({ rarity, pct: pcts[i] }));
}

export function denRewardLabel(r) {
  const bits = [];
  if (r.crate) bits.push(r.crate === 'golden' ? 'Bone Crate' : r.crate === 'egg' ? 'Step Egg' : 'Common Crate');
  if (r.coins) bits.push(`${r.coins} coins`);
  if (r.xp) bits.push(`${r.xp} XP`);
  return bits.join(' + ');
}

// Open-world bosses drop LOOT CHOICES: two random pieces, keep one. Rarity is a
// tier-scaled CHANCE, not a guaranteed floor: even the toughest den only has a
// ~30% legendary shot, so awesome gear stays a lucky event and players don't get
// over-geared from nonstop drops. (Gear rarities are uncommon/rare/legendary.)
const RARITY_TIERS = ['uncommon', 'rare', 'legendary'];
// weights per den tier 0..6 → [uncommon, rare, legendary]
// v211: dens are now farmable DAILY, so top-end gear is deliberately rarer —
// legendary chances roughly halved so an awesome piece stays a lucky event, not
// a daily payout. (weights per den tier 0..6 → [uncommon, rare, legendary])
const RARITY_WEIGHTS = [
  [92, 8, 0], [85, 15, 0], [68, 31, 1], [56, 42, 2], [45, 51, 4], [32, 60, 8], [22, 64, 14],
];
function rollRarityIdx(rng, tier) {
  const w = RARITY_WEIGHTS[Math.min(tier, RARITY_WEIGHTS.length - 1)];
  let roll = rng() * (w[0] + w[1] + w[2]);
  for (let i = 0; i < 3; i++) { roll -= w[i]; if (roll <= 0) return i; }
  return 0;
}
// Pick a gear item AT the rolled rarity, stepping DOWN if none fits the filters
// (level cap wins over rarity: a piece you can equip soon beats a locked prize).
// preferArch biases toward the player's spec; avoidArch keeps the 2nd choice a
// genuinely different pick; unowned pieces come first.
function pickDenGear(rng, rIdx, { preferArch = null, avoidArch = null, exclude, maxLevel, ownedSet }) {
  for (let r = rIdx; r >= 0; r--) {
    let pool = GEAR_ITEMS.filter(g => g.rarity === RARITY_TIERS[r] && (g.minLevel || 1) <= maxLevel && !exclude.has(g.id) && (!avoidArch || g.arch !== avoidArch));
    if (!pool.length) continue;
    if (preferArch) { const a = pool.filter(g => g.arch === preferArch); if (a.length) pool = a; }
    const fresh = pool.filter(g => !ownedSet.has(g.id));
    const use = fresh.length ? fresh : pool;
    return use[Math.floor(rng() * use.length)];
  }
  return null;
}
/* YOUR DROP, NOT EVERYONE'S. Tom, 2026-08-08: "players are all getting the same
   loot from boss dens and the glutton this should be random."
   The seed was `dengear:<day>:<den>` with no player in it, so the roll was a
   property of the DEN, not of the kill: two people who beat the same den on the
   same day were offered the identical two pieces. It looked player-specific only
   because owned gear and level cap filter the pool afterwards, which hides it
   until two players have similar collections, which is exactly Tom and Cam.
   `salt` is a per-install random (see lootSalt) folded into the seed. Still
   deterministic per player + den + day, so re-opening a pending chooser shows
   the same two pieces rather than rerolling until you like them. */
export function rollDenLoot(den, week, ownedSet, maxLevel = 999, preferArch = null, salt = '') {
  const rng = mulberry32(hashStr(`dengear:${salt}:${week}:${den.id}`));
  const exclude = new Set();
  const first = pickDenGear(rng, rollRarityIdx(rng, den.tier), { preferArch, exclude, maxLevel, ownedSet });
  if (!first) return null;
  exclude.add(first.id);
  // second: independent rarity roll, a DIFFERENT archetype so the pick matters
  let second = pickDenGear(rng, rollRarityIdx(rng, den.tier), { avoidArch: first.arch, exclude, maxLevel, ownedSet });
  if (!second) second = pickDenGear(rng, rollRarityIdx(rng, den.tier), { exclude, maxLevel, ownedSet });
  return second ? [first, second] : null;
}

// Called after a boss-den victory. Landmark dens are claimable ONCE PER DAY
// (day-keyed) so you can walk out and fight them daily; roaming dens likewise.
// Daily wins log as a NON-gating type ('bossday' / 'roamboss') so grinding them
// never fast-forwards the endless-Pit gate — only the FIRST-ever clear of each
// den identity advances the gate (a permanent 'boss' marker, counted once).
export async function claimDenWin(den, day = dateKey(), week = isoWeekKey()) {
  const r = den.reward;
  if (den.roaming) {
    const xp = await award(denKey(day, den), 'roamboss', r.xp || 50, `Roaming boss: ${den.name}`);
    if (xp === 0) return null;
    /* ROAMING BOSSES NOW RAISE THE CEILING TOO. Tom, 2026-08-13, and not for
       the first time: "fighting some of the new boss dens in the open world do
       not increase the ceiling on pit fights. some do some dont".
       He was exactly right, and this was the some-dont. denWinsCount() counts
       'bossfirst' rows. The landmark branch mints one, the remote branch mints
       one and says in its comment that it must, and this branch minted only
       'roamboss', so every roaming boss a player beat did nothing for the
       Gauntlet. Same claimDenWin, same kind of fight, silently different
       progression.
       Minted AFTER the xp===0 check, per the rewarded-actions SOP: the state
       transition is "a roaming boss goes from never-beaten to beaten", and a
       re-clear must not mint a second marker. The id is
       roam-<date>-<cell>, so award()'s own dedupe keys this to one per distinct
       boss, which is what "distinct dens ever beaten" already means. */
    await award(`bossfirst-${den.id}`, 'bossfirst', 0, `Roaming clear: ${den.name}`);
    if (r.crate) await grantCrate(r.crate, 'roam-boss');
    return { xp, ...r, gearChoices: null };
  }
  // remote: one a day, no gear chooser, but it DOES count as a den win so the
  // Gauntlet ceiling can rise for someone who cannot walk to a real den
  if (den.remote) {
    const xp = await award(denKey(day, den), 'bossday', r.xp || 50, `Remote den: ${den.name}`);
    if (xp === 0) return null;
    await award(`bossfirst-${den.id}`, 'bossfirst', 0, `Remote clear: ${den.name}`);
    if (r.crate) await grantCrate(r.crate, 'remote-den');
    /* COINS ARE PAID BY THE FIGHT SETTLE, NOT HERE. This branch used to pay
       coinsAdd(r.coins) itself, and the settle read r.coins out of the return
       and paid it AGAIN: every remote den win banked double its banner (the
       playtest measured +48 announced, +96 banked, on every win). The landmark
       branch below never paid internally, which is why only remote dens
       doubled. The settle is the right single payer because the Battle Charm
       and Feast multipliers live there and apply to what the banner shows.
       den-ceiling-audit's REMOTE-PAYS-NOTHING row pins this function to a zero
       wallet delta. */
    return { xp, ...r, gearChoices: null };
  }
  // landmark: once per day for loot/coins/xp, logged non-gating
  const xp = await award(denKey(day, den), 'bossday', r.xp || 50, `Boss den: ${den.name}`);
  if (xp === 0) return null; // already cleared today
  /* GATE MARKER, SCOPED TO THE WEEK. Tom, 2026-08-16, after saying this had
     been "fixed" five times: "I've killed a boss den and it still didn't raise
     my pit cap."
     He was right again, and this was the last one. A landmark den's `id` is its
     GRID CELL (`${cx}_${cy}`, poi.js denForCell), but denForCell seeds its tier
     and boss from `den:${week}:${cx}:${cy}`, so the cell holds a DIFFERENT boss
     every week. The marker was `bossfirst-<cell>`, so the first clear of a cell
     banked it forever and every later week's boss in that cell minted nothing.
     A player who fights the dens near home hits this permanently: real kills,
     no ceiling movement, no explanation on screen.
     Reproduced before changing anything: three real kills at the Gastown anchor
     across W30/W31/W32 wrote only TWO markers and left the ceiling at 13 where
     it should have been 16.
     This is also the other half of his 2026-08-13 "some do some dont". That fix
     gave the ROAMING branch a marker; roaming ids are `roam-<date>-<cell>` and
     remote is `remote-<day>`, both already time-scoped, so only this landmark
     branch still carried the coarse identity.
     Week, not day, on purpose: the boss rotates weekly, so a new week is a new
     boss and counts once, while re-clearing it daily inside that week hits
     award()'s own dedupe and pays no ceiling. Old `bossfirst-<cell>` rows keep
     counting as their own distinct id, so nobody's existing total is clawed
     back and no migration is needed. */
  await award(`bossfirst-${week}-${den.id}`, 'bossfirst', 0, `First clear: ${den.name}`);
  if (r.crate) await grantCrate(r.crate, 'boss-den');
  // every boss drops two pieces: keep ONE (chooser persists in kv until picked)
  const owned = await ownedGearIds();
  const lvl = levelFor(await totalXp()).level;
  const choices = rollDenLoot(den, day, owned, lvl + 3, await dominantArch(), await lootSalt());
  if (choices) {
    const pending = (await kvGet('denloot', [])) || [];
    if (!pending.some(p => p.key === denKey(day, den))) {
      pending.push({ key: denKey(day, den), den: den.name, choices: choices.map(g => g.id), ts: Date.now() });
      await kvSet('denloot', pending.slice(-6));
    }
  } else {
    await coinsAdd(60); // full collection consolation
  }
  return { xp, ...r, gearChoices: choices };
}

// Player picked a piece from a pending boss drop. Grants + clears the entry.
/* TAKING THE PENDING ENTRY IS THE CLAIM. Reading it and then rewriting the list
   without it was two transactions, so two overlapping picks both found the same
   open choice and both reported a claim (only grantGear's own owned-check kept
   a second copy out of the inventory). One transaction, so exactly one caller
   can take a drop. */
export async function claimDenLoot(key, gearId) {
  let entry = null;
  await kvUpdate('denloot', (list) => {
    const pending = list || [];
    entry = pending.find(p => p.key === key && p.choices.includes(gearId)) || null;
    return entry ? pending.filter(p => p.key !== key) : undefined;
  }, []);
  if (!entry) return null;
  const g = await grantGear(gearId, 'boss-den');
  return g || GEAR_ITEMS.find(x => x.id === gearId) || null;
}

/* ================= Boneyard mini-bosses (v75) =================
   Lesser Boneyard creatures that ROAM daily: tougher than sparring, far below a
   weekly world-boss den. They fill the map with real-world combat variety and
   feed coins / XP / Bone Dust. Position + identity are seeded by DATE + cell, so
   a fresh sparse set appears every day. Free to fight (you walked there); the
   ledger key `mini-<date>-<id>` (type 'mini') makes each beatable once a day. */
export const MINI_CELL_DEG = 0.008;   // ~0.9 km cells: minis a bit denser than dens
export const MINI_RADIUS_M = 75;   // a roaming mini is still a fight you walk to: match spawns

export const MINI_TIERS = [
  { mult: 0.6, aiLevel: 1, reward: { coins: 30, xp: 20, crate: 'daily' } },
  { mult: 0.75, aiLevel: 1, reward: { coins: 45, xp: 30, dust: 6, crate: 'daily' } },
  { mult: 0.9, aiLevel: 2, reward: { coins: 65, xp: 40, dust: 12, crate: 'golden' } },
];
const MINI_TIER_WEIGHTS = [4, 3, 1.5];  // mostly the weakest, occasionally a nastier one
export const MINI_THEMES = [
  { key: 'hound', name: 'Bonehound' },
  { key: 'wretch', name: 'Rattling Wretch' },
  { key: 'ghoul', name: 'Marsh Ghoul' },
  { key: 'shade', name: 'Cinder Shade' },
  { key: 'acolyte', name: 'Lost Acolyte' },
  { key: 'jester', name: 'Boneyard Jester' },
];

function miniCellOf(lat, lng) { return { cx: Math.round(lat / MINI_CELL_DEG), cy: Math.round(lng / MINI_CELL_DEG) }; }

// A mini for one cell on one day, or null (sparse — not every cell has one).
function miniForCell(date, cx, cy) {
  const rng = mulberry32(hashStr(`mini:${date}:${cx}:${cy}`));
  if (rng() > 0.8) return null;   // ~80% of cells hold a mini (more combat than piles)
  const lat = (cx + (rng() - 0.5) * 0.86) * MINI_CELL_DEG;
  const lng = (cy + (rng() - 0.5) * 0.86) * MINI_CELL_DEG;
  const theme = MINI_THEMES[Math.floor(rng() * MINI_THEMES.length)];
  let roll = rng() * MINI_TIER_WEIGHTS.reduce((a, b) => a + b, 0), tier = 0;
  for (let i = 0; i < MINI_TIER_WEIGHTS.length; i++) { roll -= MINI_TIER_WEIGHTS[i]; if (roll <= 0) { tier = i; break; } }
  const t = MINI_TIERS[tier];
  return { id: `${cx}_${cy}`, lat, lng, theme, tier, name: theme.name, mult: t.mult, aiLevel: t.aiLevel, reward: t.reward };
}

// The mini-bosses roaming around a position today (3x3 cells).
export function minisNear(date, lat, lng) {
  const { cx, cy } = miniCellOf(lat, lng);
  const out = [];
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
    const m = miniForCell(date, cx + dx, cy + dy);
    if (m) out.push(m);
  }
  for (const m of out) { m.dist = distanceM(lat, lng, m.lat, m.lng); m.bearing = bearingDeg(lat, lng, m.lat, m.lng); }
  return out.sort((a, b) => a.dist - b.dist);
}

export function miniKey(date, mini) { return `mini-${date}-${mini.id}`; }

// Beat a roaming mini-boss. Idempotent per mini per day. Coins are added by the
// caller (settle) so the Battle Charm + food coin boost apply uniformly.
export async function claimMiniWin(mini, date = dateKey()) {
  const r = mini.reward;
  const xp = await award(miniKey(date, mini), 'mini', r.xp || 20, `Boneyard: ${mini.name}`);
  if (xp === 0) return null; // already beaten today
  if (r.crate) await grantCrate(r.crate, 'mini');
  if (r.dust) await boneDustAdd(r.dust);
  return { xp, ...r };
}

/* ================= easter-egg secret dens (v178) ================= */
// Hidden bosses buried at hand-picked real-world landmarks. NOTHING renders
// until a player is nearly on top of one: within SECRET_WHISPER_M the map
// whispers a cryptic cue, within SECRET_REVEAL_M the den materializes, within
// SECRET_RADIUS_M you can enter. First win (across ANY spot of that boss) pays
// the full prize + a hidden badge; repeats pay pocket change. Pure data — the
// fight itself reuses the boss path. Spread by rumor, never by UI.
export const SECRET_WHISPER_M = 400;
export const SECRET_REVEAL_M = 75;
export const SECRET_RADIUS_M = 45;

export const SECRET_DENS = [
  {
    id: 'tumtum', boss: 'Tum Tum Wabaloo',
    whisper: 'You hear a distant TUM... TUM... 🥁',
    mult: 1.15, aiLevel: 3,
    talents: ['heavyhands', 'rage', 'concussive'],
    spots: [
      { id: 'gastown', lat: 49.28434, lng: -123.10884 },   // Gastown Steam Clock, Vancouver
      { id: 'science', lat: 49.27341, lng: -123.10390 },   // Science World plaza, Vancouver
      { id: 'lonsdale', lat: 49.30945, lng: -123.08270 },  // Lonsdale Quay, North Vancouver
      { id: 'walton', lat: 43.95110, lng: -78.29280 },     // Walton St downtown, Port Hope ON (Cam + Brock)
      { id: 'phbeach', lat: 43.94330, lng: -78.28730 },    // Port Hope waterfront, ON (Cam + Brock)
      { id: 'jacques', lat: 45.50770, lng: -73.55330 },    // Place Jacques-Cartier, Montréal
      { id: 'phoenix', lat: 33.44840, lng: -112.07400 },   // downtown Phoenix, AZ
    ],
  },
];

// Secret spots near the player (within 1.2 km), closest first.
export function secretsNear(lat, lng) {
  const out = [];
  for (const s of SECRET_DENS) {
    for (const sp of s.spots) {
      const dist = distanceM(lat, lng, sp.lat, sp.lng);
      if (dist <= 1200) out.push({
        key: `${s.id}-${sp.id}`, bossId: s.id, name: s.boss, whisper: s.whisper,
        mult: s.mult, aiLevel: s.aiLevel, talents: s.talents,
        lat: sp.lat, lng: sp.lng, dist,
      });
    }
  }
  out.sort((a, b) => a.dist - b.dist);
  return out;
}

// The Glutton: a single world-boss "world event", not part of the weekly den
// rotation (kept fully separate so it never perturbs existing dens' seeded
// identity). Placed at a fixed bearing/distance from wherever the player is
// when the map loads — always nearby, always reachable, recomputed fresh each
// time (no persisted position; a one-time encounter doesn't need one).
export const GLUTTON_RADIUS_M = 80;  // a world boss is the destination of the day
// The dead-ground radius. Spawns sit on a ~550 m grid at 2 per cell, so 400 m
// (~50 ha) strangles roughly 3 loot spawns: a swath you can actually feel. The
// old 140 m ate ~0.4 spawns, i.e. usually nothing at all.
export const GLUTTON_BLIGHT_M = 400;
// TWICE DAILY: [startHour, endHour) local, morning + evening so either routine
// can catch him. Between windows he is simply not on the map. Retune freely.
export const GLUTTON_WINDOWS = [[8, 12], [17, 21]];

// Which appearance (if any) is open right now.
export function gluttonWindow(now = new Date()) {
  const h = now.getHours() + now.getMinutes() / 60;
  for (let i = 0; i < GLUTTON_WINDOWS.length; i++) {
    const [a, b] = GLUTTON_WINDOWS[i];
    if (h >= a && h < b) return { active: true, slot: i, endHour: b };
  }
  const next = GLUTTON_WINDOWS.find(([a]) => h < a);
  return { active: false, slot: -1, nextHour: next ? next[0] : GLUTTON_WINDOWS[0][0], tomorrow: !next };
}
// One clear per appearance: repeatable across windows, never farmable inside one.
export function gluttonKey(day, slot) { return `glutton-${day}-${slot}`; }

// Where he squats for THIS appearance. Anchored to the centre of your den-cell
// (seeded by day + slot + cell), NOT to your live position — he is a place you
// walk to, not a boss that follows you around the map.
export function gluttonSpot(lat, lng, day = dateKey(), slot = 0) {
  const { cx, cy } = denCellOf(lat, lng);
  const rng = mulberry32(hashStr(`glutton:${day}:${slot}:${cx}:${cy}`));
  const glat = (cx + (rng() - 0.5) * 0.86) * DEN_CELL_DEG;
  const glng = (cy + (rng() - 0.5) * 0.86) * DEN_CELL_DEG;
  return { lat: glat, lng: glng, dist: distanceM(lat, lng, glat, glng) };
}

// Beat him: pays once per appearance and drops a gear piece, which has a chance
// to come out SLIMED — a rare green-glowing variant, flagged on the inv row.
export const GLUTTON_SLIME_CHANCE = 0.25;
export async function claimGluttonWin(day = dateKey(), slot = 0) {
  /* MONOTONIC DAY GUARD (js/db.js claimDay). gluttonKey is day+slot, so the
     two windows are already one clear each per date; a clock nudge past local
     midnight mints a fresh pair. Gated on the DEVICE's today rather than the
     `day` argument, which is an appearance key callers may pass explicitly. */
  if (!(await claimDay(dateKey())).fresh) return null;
  const xp = await award(gluttonKey(day, slot), 'glutton', 70, 'Cleansed the Glutton');
  if (xp === 0) return null;                       // already cleared this window
  /* THE GLUTTON RAISES THE GAUNTLET CEILING (Tom, 2026-08-15: "the glutton can
     not spires"). He is a real boss fight that reads as a den on the map, and
     until now only claimDenWin minted the marker denWinsCount looks for, so
     beating him did nothing for the Pit.
     ONE MARKER, EVER, not one per appearance. The key is deliberately NOT
     keyed by day or slot: he is repeatable across windows by design, and the
     rule written above denWinsCount is that daily re-clears must never inflate
     progression. A `bossfirst-glutton-<day>` would have made the Gauntlet
     ceiling farmable at +3 a day, which is the opposite of what the ledger's
     own doctrine says.
     Minted AFTER the xp===0 check, per the rewarded-actions SOP: the state
     transition is "the Glutton goes from never-beaten to beaten", and a
     re-clear must not mint a second one. award()'s dedupe on the fixed key
     makes that true whichever caller gets here.
     Spires and Boneyard minis deliberately still do NOT mint one. Spires are
     Tom's call above; minis are documented as "far below a weekly world-boss
     den" and were never meant to gate progression. That exclusion is asserted
     by name in tests/pit-cap-paths-audit.mjs so it stays a decision rather
     than an oversight. */
  await award('bossfirst-glutton', 'bossfirst', 0, 'First cleansing of the Glutton');
  await coinsAdd(140);
  const owned = await ownedGearIds();
  const lvl = levelFor(await totalXp()).level;
  // per-player, same reason as rollDenLoot: this seed had no player in it, so the
  // piece AND the slimed roll below were identical for everyone that window.
  const rng = mulberry32(hashStr(`glutgear:${await lootSalt()}:${day}:${slot}`));
  const pick = pickDenGear(rng, rollRarityIdx(rng, 4), { exclude: new Set(), maxLevel: lvl + 3, ownedSet: owned });
  let gear = null;
  if (pick) {
    const slimed = rng() < GLUTTON_SLIME_CHANCE;
    const got = await grantGear(pick.id, 'glutton', { slimed });
    if (got) gear = { id: pick.id, name: pick.name, rarity: pick.rarity, slimed };
  }
  if (!gear) await boneDustAdd(40);                // already own it all: consolation
  return { xp, coins: 140, gear };
}

/* RESTORE THE CEILING THAT THE CELL-SCOPED MARKER SWALLOWED.
 *
 * The fix above makes future kills count. It does nothing for the weeks a
 * player already lost, and those are the players who are annoyed: somebody who
 * beat a boss in the same cell for six straight weeks banked ONE marker and is
 * owed five more. Telling them it is fixed while leaving their ceiling where
 * the bug left it would be a half-truth.
 *
 * Nothing needs to be guessed to give it back. Every landmark kill ever made
 * wrote a reward row keyed `boss-<YYYY-MM-DD>-<cell>` (claimDenWin ->
 * denKey(dateKey(), den)), so the exact set of (week, cell) pairs the player
 * actually beat is already on the device. Fold those dates to ISO weeks, dedupe,
 * and mint the marker each one should have had.
 *
 * Deliberately narrow: only keys starting `boss-`. Remote rows are
 * `remoteboss-<day>` and roaming rows are `roamboss-<day>-<cell>`, and both
 * branches already minted their own correct markers at claim time, so touching
 * them would double-count.
 *
 * The kv flag is written BEFORE any award, matching backfillStarterSeedsIfNeeded:
 * a crash midway must leave a player short rather than run the whole thing twice.
 * award() is idempotent per key anyway, so a re-run could not duplicate, but the
 * ordering is the house rule and it costs nothing to keep.
 */
export async function backfillDenCeilingIfNeeded() {
  if (await kvGet('denceil-backfill')) return null;
  await kvSet('denceil-backfill', true);
  const rows = await db.all('xp');
  const owed = new Set();
  for (const r of rows) {
    if (r.type !== 'bossday' || !r.key.startsWith('boss-')) continue;
    const m = r.key.slice('boss-'.length).match(/^(\d{4}-\d{2}-\d{2})-(.+)$/);
    if (!m) continue;
    // midday UTC so a date string cannot land on the previous ISO week
    owed.add(`${isoWeekKey(new Date(`${m[1]}T12:00:00Z`))}-${m[2]}`);
  }
  let added = 0;
  for (const id of owed) {
    if (await db.get('xp', `bossfirst-${id}`)) continue;
    await award(`bossfirst-${id}`, 'bossfirst', 0, 'Past boss den clear (restored)');
    added++;
  }
  return added ? { added, ranks: added * 3 } : null;
}
