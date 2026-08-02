/* Dark Spires: territory you claim by walking to it, and keep by coming back.
 *
 * PHASE 1, "The Lone Warden": entirely local, no server. Every spire is either
 * unclaimed (an NPC Wraith Warden holds it) or yours. Rival ownership and sieges
 * are later phases and deliberately absent here.
 *
 * The design constraint this bends around, stated plainly because it drove every
 * choice: Pokemon Go gyms run on player density we do not have (~92 accounts,
 * few sharing a neighbourhood). So a spire has to be worth walking to with ZERO
 * rivals in your town. That is what tribute, tending and the Keeper's Boon are:
 * four reasons to leave the house that do not need anyone else to show up.
 *
 * Shape borrowed wholesale from boss dens (js/poi.js): positions are seeded by
 * geographic cell so a spire is a PERMANENT landmark that never moves, and all
 * state is keyed by spire id in one kv record. Sparser cells than dens (2.2 km
 * vs 1.1 km) so each one reads as a monument rather than litter.
 */
import { kvGet, kvSet } from './db.js';
import { dateKey } from './nutrition.js';

export const SPIRE_CELL_DEG = 0.02;      // ~2.2 km cells: a couple within a good walk
export const SPIRE_RADIUS_M = 60;        // enter range, same reach as a den
export const SPIRE_CAP = 3;              // hold at most three: forces a real choice
export const TRIBUTE_PER_DAY = 60;       // coins accrued per held spire per day
export const TRIBUTE_DUST_PER_DAY = 8;
export const TRIBUTE_CAP_DAYS = 3;       // stops idle hoarding; collect in person
export const RESOLVE_DAYS = 7;           // untended for this long -> dormant
export const BOON_QUEST_BONUS = 0.10;    // Keeper's Boon while you hold any spire

const KV = 'spires';                     // { [id]: {claimedAt, tendedAt, collectedAt, level} }

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
const cellOf = (lat, lng) => ({ cx: Math.round(lat / SPIRE_CELL_DEG), cy: Math.round(lng / SPIRE_CELL_DEG) });

/* Names are seeded by cell too, so "The Crooked Fang" is that tower forever and
   players can talk about it by name. */
const ADJ = ['Crooked', 'Hollow', 'Black', 'Weeping', 'Iron', 'Rotten', 'Silent', 'Broken', 'Grim', 'Ashen'];
const NOUN = ['Fang', 'Belfry', 'Spire', 'Arch', 'Gate', 'Rise', 'Watch', 'Perch', 'Keep', 'Steeple'];
const WARDENS = ['The Wraith Warden', 'The Pale Sentinel', 'The Rattling Keeper', 'The Hollow Watchman', 'The Grey Vigil'];

export function spireForCell(cx, cy) {
  const rng = mulberry32(hashStr(`spire:${cx}:${cy}`));
  const lat = (cx + (rng() - 0.5) * 0.8) * SPIRE_CELL_DEG;
  const lng = (cy + (rng() - 0.5) * 0.8) * SPIRE_CELL_DEG;
  const name = `The ${ADJ[Math.floor(rng() * ADJ.length)]} ${NOUN[Math.floor(rng() * NOUN.length)]}`;
  const warden = WARDENS[Math.floor(rng() * WARDENS.length)];
  return { id: `sp-${cx}-${cy}`, cx, cy, lat, lng, name, warden };
}

/** Spires in the 3x3 cells around a position, nearest first. */
export function spiresNear(lat, lng) {
  const { cx, cy } = cellOf(lat, lng);
  const out = [];
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      const s = spireForCell(cx + dx, cy + dy);
      s.dist = distM(lat, lng, s.lat, s.lng);
      out.push(s);
    }
  }
  return out.sort((a, b) => a.dist - b.dist);
}

function distM(aLat, aLng, bLat, bLng) {
  const R = 6371000, toRad = d => d * Math.PI / 180;
  const dLat = toRad(bLat - aLat), dLng = toRad(bLng - aLng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export async function spireState() { return (await kvGet(KV, {})) || {}; }

const DAY = 86400000;
const daysBetween = (from, to = Date.now()) => Math.max(0, (to - from) / DAY);

/** Everything the UI needs about one spire, with decay already applied. */
export function readSpire(state, s, now = Date.now()) {
  const rec = state[s.id];
  if (!rec) return { ...s, held: false, dormant: false };
  const sinceTend = daysBetween(rec.tendedAt, now);
  // DORMANT, never destroyed: decay pauses your income, it does not punish you
  // for a holiday. Shame-free is a hard rule in this app.
  const dormant = sinceTend >= RESOLVE_DAYS;
  const days = Math.min(TRIBUTE_CAP_DAYS, Math.floor(daysBetween(rec.collectedAt, now)));
  const cappedFor = daysBetween(rec.collectedAt, now) >= TRIBUTE_CAP_DAYS;
  return {
    ...s,
    held: !dormant,
    dormant,
    level: rec.level || 1,
    heldDays: Math.floor(daysBetween(rec.claimedAt, now)),
    resolvePct: Math.max(0, Math.min(1, 1 - sinceTend / RESOLVE_DAYS)),
    tribute: dormant ? { coins: 0, dust: 0, days: 0, capped: false }
      : { coins: days * TRIBUTE_PER_DAY, dust: days * TRIBUTE_DUST_PER_DAY, days, capped: cappedFor },
  };
}

export async function heldSpires(now = Date.now()) {
  const state = await spireState();
  return Object.keys(state)
    .map(id => readSpire(state, { id, ...state[id].meta }, now))
    .filter(s => s.held);
}

/** Keeper's Boon: a small always-on perk for holding ANY spire. */
export async function keepersBoon(now = Date.now()) {
  const held = await heldSpires(now);
  return held.length ? { questCoinBonus: BOON_QUEST_BONUS, spires: held.length } : null;
}

/** Claim after beating the warden. Refuses past the cap so choice stays real. */
export async function claimSpire(s, now = Date.now()) {
  const state = await spireState();
  const held = Object.keys(state).filter(id => !readSpire(state, { id }, now).dormant);
  if (!state[s.id] && held.length >= SPIRE_CAP) return { ok: false, reason: 'cap', cap: SPIRE_CAP };
  state[s.id] = {
    claimedAt: state[s.id]?.claimedAt || now,
    tendedAt: now,
    collectedAt: now,
    level: (state[s.id]?.level || 0) + 1,
    // keep the identity with the record so heldSpires can name a spire the
    // player is nowhere near (Today card, future leaderboard)
    meta: { name: s.name, lat: s.lat, lng: s.lng, cx: s.cx, cy: s.cy, warden: s.warden },
  };
  await kvSet(KV, state);
  return { ok: true, level: state[s.id].level };
}

/** Visiting restores resolve. Free, and the reason a weekly circuit exists. */
export async function tendSpire(id, now = Date.now()) {
  const state = await spireState();
  if (!state[id]) return { ok: false };
  state[id].tendedAt = now;
  await kvSet(KV, state);
  return { ok: true };
}

/** Collect accrued tribute. In person only: that is the walk trigger. */
export async function collectTribute(id, now = Date.now()) {
  const state = await spireState();
  const rec = state[id];
  if (!rec) return { ok: false, reason: 'not-held' };
  const view = readSpire(state, { id, ...rec.meta }, now);
  if (view.dormant) return { ok: false, reason: 'dormant' };
  if (!view.tribute.days) return { ok: false, reason: 'empty' };
  rec.collectedAt = now;
  rec.tendedAt = now;                    // collecting IS a visit
  await kvSet(KV, state);
  return { ok: true, coins: view.tribute.coins, dust: view.tribute.dust, days: view.tribute.days };
}

/** The NPC that holds an unclaimed spire, scaled to the player. */
export function wardenFor(s, level) {
  const rng = mulberry32(hashStr(`warden:${s.id}`));
  return {
    name: s.warden,
    mult: 0.9 + rng() * 0.35,            // 0.90x - 1.25x of your stats
    aiLevel: level >= 12 ? 3 : 2,
    venue: s.name,
  };
}

export const spireKey = (id, day = dateKey()) => `spire-${day}-${id}`;
