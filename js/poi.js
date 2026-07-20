// Boss dens: the Bone Road, reimagined as real-world destinations.
// Dens are PERMANENT landmarks (position seeded by geographic cell only, so
// they never move); their boss and reward REFRESH WEEKLY (theme/tier seeded by
// cell + ISO week). Everything is deterministic and idempotent: the ledger key
// `boss-<week>-<denId>` makes each den claimable once per week, server-verifiable
// later, exactly like hunt spawns.
import { award, levelFor, totalXp } from './game.js';
import { coinsAdd, grantCrate, grantGear, ownedGearIds, boneDustAdd } from './loot.js';
import { kvGet, kvSet, db } from './db.js';
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
export const DEN_RADIUS_M = 60;          // enter range (a touch roomier than spawns)

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
};
export function denBeastName(theme) {
  const b = DEN_BEASTS[theme && theme.arch];
  return b ? `${theme.boss}'s ${b}` : `${(theme && theme.boss) || 'The Boss'}'s Beast`;
}

// Themes reuse the Bone Road / Pit art language.
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
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
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

// One den per den-cell, at a PERMANENT position (seeded by cell alone).
function denForCell(week, cx, cy) {
  const posRng = mulberry32(hashStr(`den:${cx}:${cy}`));
  const lat = (cx + (posRng() - 0.5) * 0.86) * DEN_CELL_DEG;
  const lng = (cy + (posRng() - 0.5) * 0.86) * DEN_CELL_DEG;
  // weekly identity: theme, boss tier
  const wkRng = mulberry32(hashStr(`den:${week}:${cx}:${cy}`));
  const theme = DEN_THEMES[Math.floor(wkRng() * DEN_THEMES.length)];
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

export function denKey(week, den) { return den.roaming ? `roamboss-${den.day}-${den.id}` : `boss-${week}-${den.id}`; }

// How many world-boss dens you have ever beaten (drives the endless-Pit gate).
export async function denWinsCount() {
  const xp = await db.all('xp');
  return xp.filter(r => r.type === 'boss').length;
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

export function denRewardLabel(r) {
  const bits = [];
  if (r.crate) bits.push(r.crate === 'golden' ? 'Golden Crate' : r.crate === 'egg' ? 'Step Egg' : 'Common Crate');
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
const RARITY_WEIGHTS = [
  [90, 10, 0], [80, 20, 0], [60, 38, 2], [45, 50, 5], [30, 60, 10], [18, 62, 20], [8, 62, 30],
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
export function rollDenLoot(den, week, ownedSet, maxLevel = 999, preferArch = null) {
  const rng = mulberry32(hashStr(`dengear:${week}:${den.id}`));
  const exclude = new Set();
  const first = pickDenGear(rng, rollRarityIdx(rng, den.tier), { preferArch, exclude, maxLevel, ownedSet });
  if (!first) return null;
  exclude.add(first.id);
  // second: independent rarity roll, a DIFFERENT archetype so the pick matters
  let second = pickDenGear(rng, rollRarityIdx(rng, den.tier), { avoidArch: first.arch, exclude, maxLevel, ownedSet });
  if (!second) second = pickDenGear(rng, rollRarityIdx(rng, den.tier), { exclude, maxLevel, ownedSet });
  return second ? [first, second] : null;
}

// Called after a boss-den victory. Idempotent per den per week.
export async function claimDenWin(den, week = isoWeekKey()) {
  const r = den.reward;
  // roaming dens (daily) log as 'roamboss' so they don't inflate the landmark
  // boss count that gates the endless Pit; the day-based key caps them to once/day.
  const type = den.roaming ? 'roamboss' : 'boss';
  const xp = await award(denKey(week, den), type, r.xp || 50, `${den.roaming ? 'Roaming boss' : 'Boss den'}: ${den.name}`);
  if (xp === 0) return null;
  // coins are added by the caller (settle) so the Battle Charm + food coin boost
  // apply uniformly; adding them here too was a double-pay bug.
  if (r.crate) await grantCrate(r.crate, den.roaming ? 'roam-boss' : 'boss-den');
  // roaming dens keep it light: crate/coins/xp only, no gear-choice drop.
  if (den.roaming) return { xp, ...r, gearChoices: null };
  // every boss drops two pieces: the player keeps ONE (chooser persists in kv
  // until picked, so closing the victory screen never eats the loot)
  const owned = await ownedGearIds();
  const lvl = levelFor(await totalXp()).level;
  const choices = rollDenLoot(den, week, owned, lvl + 3, await dominantArch());
  if (choices) {
    const pending = (await kvGet('denloot', [])) || [];
    if (!pending.some(p => p.key === denKey(week, den))) {
      pending.push({ key: denKey(week, den), den: den.name, choices: choices.map(g => g.id), ts: Date.now() });
      await kvSet('denloot', pending.slice(-6));
    }
  } else {
    await coinsAdd(60); // full collection consolation
  }
  return { xp, ...r, gearChoices: choices };
}

// Player picked a piece from a pending boss drop. Grants + clears the entry.
export async function claimDenLoot(key, gearId) {
  const pending = (await kvGet('denloot', [])) || [];
  const entry = pending.find(p => p.key === key);
  if (!entry || !entry.choices.includes(gearId)) return null;
  await kvSet('denloot', pending.filter(p => p.key !== key));
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
export const MINI_RADIUS_M = 55;

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
