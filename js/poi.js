// Boss dens: the Bone Road, reimagined as real-world destinations.
// Dens are PERMANENT landmarks (position seeded by geographic cell only, so
// they never move); their boss and reward REFRESH WEEKLY (theme/tier seeded by
// cell + ISO week). Everything is deterministic and idempotent: the ledger key
// `boss-<week>-<denId>` makes each den claimable once per week, server-verifiable
// later, exactly like hunt spawns.
import { award, levelFor, totalXp } from './game.js';
import { coinsAdd, grantCrate, grantGear, ownedGearIds } from './loot.js';
import { kvGet, kvSet, db } from './db.js';
import { GEAR_ITEMS } from './gear.js';
import { TALENT_TREES } from './pit.js';
import { distanceM, bearingDeg } from './hunt.js';

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
    den.add = { name: `${theme.boss}'s Second`, mult: bm * 0.6, talents: [] };
  }
  return den;
}

// The dens around a position (3x3 den-cells: up to ~5-6 km out).
export function densNear(week, lat, lng) {
  const { cx, cy } = denCellOf(lat, lng);
  const out = [];
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
    out.push(denForCell(week, cx + dx, cy + dy));
  }
  for (const d of out) {
    d.dist = distanceM(lat, lng, d.lat, d.lng);
    d.bearing = bearingDeg(lat, lng, d.lat, d.lng);
  }
  return out.sort((a, b) => a.dist - b.dist);
}

export function denKey(week, den) { return `boss-${week}-${den.id}`; }

// How many world-boss dens you have ever beaten (drives the endless-Pit gate).
export async function denWinsCount() {
  const xp = await db.all('xp');
  return xp.filter(r => r.type === 'boss').length;
}

export function denRewardLabel(r) {
  const bits = [];
  if (r.crate) bits.push(r.crate === 'golden' ? 'Golden Crate' : r.crate === 'egg' ? 'Step Egg' : 'Daily Crate');
  if (r.coins) bits.push(`${r.coins} coins`);
  if (r.xp) bits.push(`${r.xp} XP`);
  return bits.join(' + ');
}

// Open-world bosses drop LOOT CHOICES: two random pieces, keep one.
// No class-locking: the gamble is the fun. Rarity floor rises with den tier.
const DEN_GEAR_FLOOR = ['uncommon', 'uncommon', 'rare', 'rare', 'rare', 'legendary', 'legendary'];
const TIER_IDX = { common: 0, uncommon: 1, rare: 2, legendary: 3 };

// maxLevel caps how far ahead a drop can be gated (current level + 3): loot you
// can't equip for many levels kills momentum. We'd rather drop a LOWER tier you
// can use soon than a prestige piece you can't touch, so the level cap wins over
// the tier floor when they conflict.
// preferArch: bias the FIRST choice toward the player's spec so a boss drop
// always offers "one for your build" + a different alternative — a real spec pick.
export function rollDenLoot(den, week, ownedSet, maxLevel = 999, preferArch = null) {
  const floor = TIER_IDX[DEN_GEAR_FLOOR[den.tier] || 'uncommon'];
  const within = g => (g.minLevel || 1) <= maxLevel;
  const fresh = GEAR_ITEMS.filter(g => TIER_IDX[g.rarity] >= floor && !ownedSet.has(g.id) && within(g));
  let pool = fresh.length >= 2 ? fresh : GEAR_ITEMS.filter(g => TIER_IDX[g.rarity] >= floor && within(g));
  if (pool.length < 2) pool = GEAR_ITEMS.filter(g => !ownedSet.has(g.id) && within(g)); // drop the tier floor
  if (pool.length < 2) pool = GEAR_ITEMS.filter(within);
  if (pool.length < 2) return null;
  const rng = mulberry32(hashStr(`dengear:${week}:${den.id}`));
  // first choice: prefer the player's specced archetype when the pool has one
  const specPool = preferArch ? pool.filter(g => g.arch === preferArch) : [];
  const firstPool = specPool.length ? specPool : pool;
  const first = firstPool[Math.floor(rng() * firstPool.length)];
  // second choice: a DIFFERENT archetype so the pick is a real decision
  const alts = pool.filter(g => g.id !== first.id && g.arch !== first.arch);
  const second = (alts.length ? alts : pool.filter(g => g.id !== first.id))[Math.floor(rng() * (alts.length ? alts.length : pool.length - 1))];
  return second ? [first, second] : null;
}

// Called after a boss-den victory. Idempotent per den per week.
export async function claimDenWin(den, week = isoWeekKey()) {
  const r = den.reward;
  const xp = await award(denKey(week, den), 'boss', r.xp || 50, `Boss den: ${den.name}`);
  if (xp === 0) return null;
  // coins are added by the caller (settle) so the Battle Charm + food coin boost
  // apply uniformly; adding them here too was a double-pay bug.
  if (r.crate) await grantCrate(r.crate, 'boss-den');
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
