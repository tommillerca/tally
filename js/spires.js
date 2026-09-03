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
import { kvGet, kvUpdate } from './db.js';
import { dateKey } from './nutrition.js';

export const SPIRE_CELL_DEG = 0.02;      // ~2.2 km cells: a couple within a good walk
export const SPIRE_RADIUS_M = 80;        // enter range, same reach as a den
export const SPIRE_CAP = 3;              // hold at most three: forces a real choice
export const TRIBUTE_PER_DAY = 60;       // coins accrued per held spire per day
export const TRIBUTE_DUST_PER_DAY = 8;
export const TRIBUTE_CAP_DAYS = 3;       // stops idle hoarding; collect in person
export const RESOLVE_DAYS = 7;           // untended for this long -> dormant
// Keeper's Boon, per held spire, HARD-CAPPED at BOON_SPIRE_CAP spires. Tom's
// call: the cap lives in this formula rather than being inherited from SPIRE_CAP,
// so raising the tower cap later can never quietly inflate quest coins.
export const BOON_PER_SPIRE = 0.05;      // +5% quest coins each
export const BOON_SPIRE_CAP = 3;         // ...counting at most three
export const BOON_QUEST_BONUS = Math.round(BOON_PER_SPIRE * BOON_SPIRE_CAP * 100) / 100;  // 0.15 ceiling
// A tower's LEVEL grows on takeovers and successful defenses (server-authoritative,
// see below). It pays a little more tribute, so an old tower is worth taking.
export const LEVEL_TRIBUTE_STEP = 0.10;  // +10% tribute per level above 1
export const LEVEL_TRIBUTE_MAX = 1.5;    // ...never more than half again
export const SIEGE_WARN_MS = 12 * 3600000; // remind me this long before the window shuts

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

/* EVERY MUTATION IS ONE TRANSACTION, because collectTribute claims tribute on
   this same row through kvUpdate. A mutator that read the whole map and wrote
   the whole map back handed an emptied tower its old collectedAt straight back,
   and the same tribute could then be collected a second time. `fn` mutates the
   state in place; return false to write nothing. Nothing in `fn` may await. */
function mutate(fn) {
  return kvUpdate(KV, (state) => {
    const st = state || {};
    return fn(st) === false ? undefined : st;
  }, {});
}

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
    wardenTier: wardenTier(Math.floor(daysBetween(rec.claimedAt, now))).tier,
    resolvePct: Math.max(0, Math.min(1, 1 - sinceTend / RESOLVE_DAYS)),
    // Under siege: an NPC is at the gate and there is a deadline. Server-owned
    // (mirrored in by syncSieges) so it survives a reinstall and a rival sees it.
    siege: (rec.siege && rec.siege.until > now)
      ? { until: rec.siege.until, name: rec.siege.name || 'The siege', msLeft: rec.siege.until - now }
      : null,
    tribute: dormant ? { coins: 0, dust: 0, days: 0, capped: false }
      : {
        coins: Math.round(days * TRIBUTE_PER_DAY * levelTributeMult(rec.level || 1)),
        dust: Math.round(days * TRIBUTE_DUST_PER_DAY * levelTributeMult(rec.level || 1)),
        days, capped: cappedFor,
      },
  };
}

/** Tribute multiplier for a tower's level. Pure, capped, unit-tested. */
export function levelTributeMult(level = 1) {
  return Math.min(LEVEL_TRIBUTE_MAX, 1 + LEVEL_TRIBUTE_STEP * (Math.max(1, level) - 1));
}
/* Days-held milestones. A tower visibly ages on the map, and rivals see it too
 * (their claimedAt arrives with the /spires poll), which is the whole point: a
 * long-held tower should look like a prize worth taking. Pure + unit-tested. */
export const WARDEN_TIERS = [
  { days: 100, tier: 3, name: 'Lord of Spires' },
  { days: 30, tier: 2, name: 'Keeper of the Gate' },
  { days: 7, tier: 1, name: 'Warden' },
];
export function wardenTier(heldDays = 0) {
  return WARDEN_TIERS.find(t => heldDays >= t.days) || { days: 0, tier: 0, name: '' };
}

/** Quest-coin bonus for holding `n` spires. Pure, capped, unit-tested.
 *  Rounded to whole percent: 0.05*3 is 0.15000000000000002 in float, and this
 *  number multiplies every quest payout, so it goes out clean. */
export function boonBonusFor(n = 0) {
  const raw = BOON_PER_SPIRE * Math.min(BOON_SPIRE_CAP, Math.max(0, n));
  return Math.round(raw * 100) / 100;
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
  return held.length ? { questCoinBonus: boonBonusFor(held.length), spires: held.length } : null;
}

/** Claim after beating the warden. Refuses past the cap so choice stays real. */
export async function claimSpire(s, now = Date.now()) {
  let out = { ok: false, reason: 'cap', cap: SPIRE_CAP };
  await mutate(state => {
    const held = Object.keys(state).filter(id => !readSpire(state, { id }, now).dormant);
    if (!state[s.id] && held.length >= SPIRE_CAP) return false;
    state[s.id] = {
      claimedAt: state[s.id]?.claimedAt || now,
      tendedAt: now,
      collectedAt: now,
      // NOT incremented here any more. A spire is a shared object, so its level has
      // to read the same on every phone: the SERVER owns it (+1 per takeover, +1 per
      // successful defense) and refreshSpires mirrors it back into this record. Local
      // increments here were double-counting against the server's and diverging.
      level: state[s.id]?.level || 1,
      // keep the identity with the record so heldSpires can name a spire the
      // player is nowhere near (Today card, future leaderboard)
      meta: { name: s.name, lat: s.lat, lng: s.lng, cx: s.cx, cy: s.cy, warden: s.warden },
    };
    out = { ok: true, level: state[s.id].level };
  });
  return out;
}

/** Mirror the SERVER's level onto a local record. The server owns this number
 *  (+1 per takeover, +1 per successful defense) because a spire is a shared
 *  object and its level has to read the same on every phone. No-ops for a spire
 *  we do not hold locally, and never lowers a level we already have unless the
 *  server says so explicitly. */
export async function setSpireLevel(id, level, now = Date.now()) {
  const lv = Math.max(1, Math.floor(Number(level) || 0));
  if (!lv) return false;
  return !!(await mutate(state => {
    if (!state[id] || state[id].level === lv) return false;
    state[id].level = lv;
  }));
}

/** Mirror the server's siege state onto local records. The server is the only
 *  thing that may start or end a siege; this just makes it readable offline and
 *  between polls. Returns the sieges that are NEW to this device, so the caller
 *  can announce them exactly once. */
export async function syncSieges(rows, now = Date.now()) {
  if (!Array.isArray(rows)) return [];
  let fresh = [];
  await mutate(state => {
    fresh = [];
    let dirty = false;
    for (const r of rows) {
      const rec = state[r.id];
      if (!rec) continue;                     // a tower this device has never claimed
      const had = rec.siege && rec.siege.until;
      if (r.siegeUntil && r.siegeUntil > now) {
        if (had !== r.siegeUntil) { rec.siege = { until: r.siegeUntil, name: r.siegeName || 'The siege' }; dirty = true; fresh.push({ id: r.id, name: rec.meta?.name || r.name, until: r.siegeUntil, siegeName: r.siegeName }); }
      } else if (rec.siege) { delete rec.siege; dirty = true; }
      // the server also owns level and the true claim date (which survives reinstall)
      if (r.level && rec.level !== r.level) { rec.level = r.level; dirty = true; }
      if (r.claimedAt && r.claimedAt < (rec.claimedAt || Infinity)) { rec.claimedAt = r.claimedAt; dirty = true; }
      if (r.tendedAt && r.tendedAt !== rec.tendedAt) { rec.tendedAt = r.tendedAt; dirty = true; }
    }
    if (!dirty) return false;   // the poll said nothing new: leave the record alone
  });
  return fresh;
}

/** Won the defense: the tower is safe and counts as visited. The server also
 *  levels it, and syncSieges mirrors that number back on the next poll. */
export async function breakSiege(id, now = Date.now()) {
  return !!(await mutate(state => {
    if (!state[id]) return false;
    delete state[id].siege;
    state[id].tendedAt = now;
  }));
}

/** Towers of mine with an open siege, soonest deadline first. */
export async function besiegedSpires(now = Date.now()) {
  const state = await spireState();
  return Object.keys(state)
    .map(id => readSpire(state, { id, ...state[id].meta }, now))
    .filter(s => s.siege)
    .sort((a, b) => a.siege.until - b.siege.until);
}

/** Visiting restores resolve. Free, and the reason a weekly circuit exists. */
export async function tendSpire(id, now = Date.now()) {
  const done = await mutate(state => {
    if (!state[id]) return false;
    state[id].tendedAt = now;
  });
  return { ok: !!done };
}

/** Collect accrued tribute. In person only: that is the walk trigger.
 *
 * THE RECEIPT AND THE PAYOUT ARE ONE TRANSACTION. This used to read the record,
 * work out the tribute, then write `collectedAt` back in a second transaction,
 * so two overlapping collects on one tower both saw the same uncollected days
 * and both returned the full amount: measured 2026-08-17 on this tree, two
 * concurrent collectTribute('sp-1-1') each returned 120 coins for one lot of
 * tribute, and the map's collect button has no re-entry guard on it. Moving
 * `collectedAt` INSIDE the same transaction that reads it means the second
 * caller reads a tower that has just been emptied and gets `empty`. */
export async function collectTribute(id, now = Date.now()) {
  let out = { ok: false, reason: 'not-held' };
  await kvUpdate(KV, (state) => {
    const st = state || {};
    const rec = st[id];
    if (!rec) { out = { ok: false, reason: 'not-held' }; return undefined; }
    const view = readSpire(st, { id, ...rec.meta }, now);
    if (view.dormant) { out = { ok: false, reason: 'dormant' }; return undefined; }
    if (!view.tribute.days) { out = { ok: false, reason: 'empty' }; return undefined; }
    rec.collectedAt = now;
    rec.tendedAt = now;                  // collecting IS a visit
    out = { ok: true, coins: view.tribute.coins, dust: view.tribute.dust, days: view.tribute.days };
    return st;
  }, {});
  return out;
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
