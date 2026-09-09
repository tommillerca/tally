// Loot: crates, cosmetics inventory, coins, consumables (Battle Charm, Vigor Draught).
// Depends only on db + the generated cosmetics manifest, so the whole economy
// stays portable (no DOM, no web-only APIs).

import { db, kvGet, kvSet, kvBumpRevisioned, kvUpdate, kvUpdateMulti, newId, takeAndPay, payAtomic, dayDecision } from './db.js';
import { BH_ITEMS, BH_BY_ID, BH_SLOTS, PET_SHOP, PET_SLOTS } from '../data/boneheadz.js';
import { FOOTBALL_KIT_PRICE_PLACEHOLDER, FOOTBALL_BUNDLE_PRICE_PLACEHOLDER, FOOTBALL_TEAMS, FOOTBALL_GARMENT_BY_KEY, FOOTBALL_SOLD, FOOTBALL_PETS, footballItemId, footballGrantIds, footballBundleIds, footballBundleQuote, footballOwnedGarmentCount, footballBundleSellable, footballPieceSellable, visorRefusesEquip } from '../data/football-teams.js';
import { GEAR_ITEMS, GEAR_BY_ID, GEAR_SLOTS } from './gear.js';
import { COMMON_INGREDIENT_IDS } from './cooking.js';
import { dateKey } from './nutrition.js';
import { LAB_RULES, LAB_PRICES, LAB_DEFAULTS, labInput, labMorph, labDistribution, labPreview, labCapacity, labDayProjection, labEqual, labRefuse, resolveLabOutcome, validateLabSave } from './laboratory.js';
import { isMorph, MORPH_LABEL, morphAsset, isKnownPet, legalPicks, petLevel, MORPHS, PET_TREES } from './pets.js';

// Use the same colour identity as the art. Shinies and CX never wear morph art.
export function petColourName(inst) {
  if (inst.shiny) return 'Shiny';
  if (inst.sp !== 'CX' && !labMorph(inst.morph)) return `Unsupported colour (${String(inst.morph)})`;
  return morphAsset(inst.sp, inst.morph) ? MORPH_LABEL[inst.morph] : 'Base';
}

export function petInstanceName(inst, steps) {
  const name = `${petColourName(inst)} ${(BH_BY_ID[inst.sp] || {}).name || inst.sp}`;
  return steps === undefined ? name : `${name} · Lv ${petLevel(steps)}`;
}

export const RARITIES = {
  common:    { label: 'Common',    color: '#9fac9f', w: 52, dupe: 10 },
  uncommon:  { label: 'Uncommon',  color: '#4ade80', w: 26, dupe: 25 },
  rare:      { label: 'Rare',      color: '#6fd0ff', w: 13, dupe: 60 },
  epic:      { label: 'Epic',      color: '#c084fc', w: 6,  dupe: 150 },
  legendary: { label: 'Legendary', color: '#ffc961', w: 3,  dupe: 400 },
};
export const RARITY_ORDER = ['common', 'uncommon', 'rare', 'epic', 'legendary'];

export const CRATES = {
  daily:  { label: 'Common Crate',  icon: '📦', rolls: 1, floor: 0, coins: [20, 40], consumableChance: 0.12 },
  golden: { label: 'Bone Crate', icon: '🧰', rolls: 3, floor: 2, coins: [10, 25], consumableChance: 0.18 },
  egg:    { label: 'Step Egg',     icon: '🥚', rolls: 1, floor: 1, coins: [20, 50], slotBias: ['FW', 'S', 'C'], consumableChance: 0.15 },
};

export const CONSUMABLES = {
  // Battle Charm reuses the old 'xp2' storage key so any owned charges convert
  // 1:1 for free. It no longer touches logging; it pays out on Pit wins.
  xp2:    { label: 'Battle Charm',  icon: '🧿', desc: 'Your next 5 Pit wins pay +25% coins' },
  // v153: a second "use it when you want it" item alongside the Charm. Refills
  // Pit energy so a good day of habits can fund a longer Pit run. Still never
  // rewards eating less (it's a spent item).
  vigor:  { label: 'Vigor Draught', icon: '⚡', desc: 'Drink to bank +3 Vigor (Pit energy) right now' },
};
export const VIGOR_DRAUGHT_AMOUNT = 3;

/* CRATES ARE NOT FOR SALE (S0, 2026-08-25). Tom, 2026-08-17: "crates are not
   buyable, only gear for transmogging." A crate rolls a statted gear variant, so
   coins -> crate -> gear was coins buying power in two hops, and once a coin pack
   ships that becomes real money buying power (docs/IAP-SCOPING.md).
   Crates as a REWARD are untouched: quests, day-close, level-ups, the Champion
   and the Bone Dust shop all still grant them. Only the coin price is gone. */
export const SHOP = [
  { id: 'vigor', label: 'Vigor Draught', icon: '⚡', cost: 90 },
  { id: 'xp2', label: 'Battle Charm', icon: '🧿', cost: 100 },
];

// Coin bonus a Battle Charm charge adds to a Pit win.
export const BATTLE_CHARM_BONUS = 0.25;

/* ---------- the drop: limited cosmetic sets sold like a release ---------- */
// One active drop at a time. Items are ordinary BH_ITEMS entries (legendary, in
// the crate pool like every legendary), PLUS direct-buy here, so the two
// acquisition paths in the copy below stay true: crack crates or pay full price.
export const DROP = {
  id: 'puffer-pack',
  title: 'The Puffer Pack',
  blurb: 'Legendary colourways. Puffer on puffer.',
  acquire: 'Every piece drops from crates like any legendary, or buy it outright below. Jackets 3,000 · fish 1,500.',
  items: [
    { id: 'T9-5', cost: 3000 }, { id: 'T9-6', cost: 3000 }, { id: 'T9-7', cost: 3000 },
    { id: 'T9-8', cost: 3000 }, { id: 'T9-9', cost: 3000 },
    { id: 'H13-2', cost: 1500 }, { id: 'H13-3', cost: 1500 }, { id: 'H13-4', cost: 1500 },
    { id: 'H13-5', cost: 1500 }, { id: 'H13-6', cost: 1500 },
  ],
};

/* Football garments include every team's colours and helmet visors.
   Live ownership determines the quote inside the transaction that debits coins
   and grants all rows. A partial legacy garment is already paid and its missing
   colours are delivered for free. One owned colour represents the whole garment. */
const ownsFootballPet = async () => (await petInstances()).some(x => FOOTBALL_PETS.includes(x.sp));
export async function buyFootballItem(itemId, stocked = footballPieceSellable()) {
  const ids = footballGrantIds(itemId);
  const cost = FOOTBALL_KIT_PRICE_PLACEHOLDER;
  const garment = FOOTBALL_GARMENT_BY_KEY[(BH_BY_ID[itemId] || {}).football?.garment];
  if (!stocked || !ids.length || !garment?.sold || !Number.isFinite(cost) || cost <= 0) return { ok: false, reason: 'not-stocked' };
  const petsPending = !!garment.pets && !await ownsFootballPet();
  return payAtomic({ snapshot: { keys: ['coins'], stores: ['inv'] }, decide: (state, rows) => {
    const owned = new Set(rows.inv.filter(r => r.kind === 'cos').map(r => r.itemId));
    const missing = ids.filter(id => !owned.has(id));
    if (!missing.length) return { result: { ok: false, reason: 'owned' } };
    const paid = ids.some(id => owned.has(id)), balance = Number(state.coins) || 0;
    if (!paid && balance < cost) return { result: { ok: false, reason: 'coins', need: cost, have: balance } };
    return {
      kv: { looks: cur => looksWith(cur, ids),
        ...(!paid ? { coins: () => balance - cost, coinsRev: cur => (Number(cur) || 0) + cost } : {}) },
      puts: missing.map(id => ({ store: 'inv', val: cosRow(id, 'football') })),
      result: paid ? { ok: false, reason: 'owned', recovered: true }
        : { ok: true, label: `${garment.label} · ${FOOTBALL_TEAMS.length} colourways`, granted: ids.length, cost, coins: balance - cost, petsPending },
    };
  } });
}

/* The bundle costs 20% less than the missing garments, rounded by the shared
   quote function. Its returned price is what this transaction actually charges,
   including when another purchase lands first. */
export async function buyFootballBundle(_teamId, stocked = footballBundleSellable()) {
  const ids = footballBundleIds();
  if (!ids.length || !stocked) return { ok: false, reason: 'not-stocked' };
  const petsPending = !await ownsFootballPet();
  return payAtomic({ snapshot: { keys: ['coins'], stores: ['inv'] }, decide: (state, rows) => {
    const owned = new Set(rows.inv.filter(r => r.kind === 'cos').map(r => r.itemId));
    const want = ids.filter(id => !owned.has(id));
    if (!want.length) return { result: { ok: false, reason: 'owned' } };
    const { cost, missing, save } = footballBundleQuote(footballOwnedGarmentCount(owned));
    if (!Number.isFinite(cost) || cost < 0) return { result: { ok: false, reason: 'not-stocked' } };
    const balance = Number(state.coins) || 0;
    if (balance < cost) return { result: { ok: false, reason: 'coins', need: cost, have: balance } };
    return {
      kv: { looks: cur => looksWith(cur, ids),
        ...(cost > 0 ? { coins: () => balance - cost, coinsRev: cur => (Number(cur) || 0) + cost } : {}) },
      puts: want.map(id => ({ store: 'inv', val: cosRow(id, 'football') })),
      result: cost === 0 ? { ok: false, reason: 'owned', recovered: true }
        : { ok: true, label: `The full kit · ${FOOTBALL_TEAMS.length} colourways`, granted: missing, cost, coins: balance - cost, save, petsPending },
    };
  } });
}

export async function buyDropItem(itemId) {
  const d = DROP.items.find(x => x.id === itemId);
  if (!d) throw new Error('not a drop item');
  const item = BH_BY_ID[itemId];
  if ((await ownedCosmeticIds()).has(itemId)) return { ok: false, reason: 'owned' };
  // Ownership, debit and delivery share one live transaction. No refund seam.
  return payAtomic({ snapshot: { keys: ['coins'], stores: ['inv'] }, decide: (state, rows) => {
    if (rows.inv.some(r => r.kind === 'cos' && r.itemId === itemId)) return { result: { ok: false, reason: 'owned' } };
    const balance = Number(state.coins) || 0;
    if (balance < d.cost) return { result: { ok: false, reason: 'coins', need: d.cost, have: balance } };
    return {
      kv: { coins: () => balance - d.cost, coinsRev: cur => (Number(cur) || 0) + d.cost,
        looks: cur => looksWith(cur, [itemId]) },
      puts: [{ store: 'inv', val: cosRow(itemId, 'drop') }],
      result: { ok: true, label: item.name, cost: d.cost, coins: balance - d.cost },
    };
  } });
}

/* ---------- the rack: the weekly cosmetic shop (v409) ----------
   Nine tiles, three wide, one theme, one rack a week. The design is
   mockup/shop-rack (approved 2026-08-18); the numbers below are the whole of
   its economy and they live here rather than in the render, because a price a
   button merely PRINTS is a price the buy path never enforced.

   ONE RARITY PER RUNG, on purpose: the dust price of a rung must not depend on
   which of its three items that week's hash lands on, or the ladder cannot be
   checked by hand. Pools are built by BODY PART rather than by price so no two
   tiles in a row sell the same kind of thing (measured alpha bounding boxes
   say the art supplies seven genuinely distinct crops, not nine, so the two
   lookalike pairs are seated non-adjacent by the order below). */
/* ============ THE 2026-09-04 DOUBLING: THE ANCHOR HOLDS, THE REST DOUBLES ===
 * Tom's ruling: "Just make everything cost more". Every coin and dust price on
 * this shelf and the rarity shelf below is exactly 2x what it was, with ONE
 * exception: the 300-coin / 35-dust common anchor, which is unchanged.
 *
 * WHY THE ANCHOR IS EXEMPT, measured rather than assumed
 * (scratchpad/r33/prices/, same instrument as the round-33 faucet sim). At a
 * flat 2x the light player's first cosmetic slips from day 22 to day 35 and
 * their year's haul falls from 21 pieces to 9, because a light player buys
 * commons and almost nothing else. Hold the anchor and the light player's whole
 * year is byte-identical to today's, while the committed player's spend per
 * piece doubles. So the doubling lands entirely on the players it was aimed at.
 * This is also the invariant the rung below already carried, and 600 would have
 * broken it: a 340-coin starting wallet must be able to buy something.
 *
 * WHAT THIS DOES NOT DO, and it must be said beside the numbers rather than in
 * a report nobody re-reads: IT DOES NOT MAKE THE CATALOGUE LAST A YEAR. Same
 * sim, committed player, day the shelf goes empty (mean of seeds 11/23/47):
 * 140 at today's prices, 149 at THIS ladder, and it was 172 at the rejected
 * flat 2x and 193 at 6x on seed 11. It asymptotes around 200 whatever the shop
 * charges, because ~255 of the 355 buyable pieces arrive FREE in crates:
 * rollCosmetic prefers UNOWNED, so a purchase and a crate drop are SUBSTITUTES
 * drawing on one pool, not additions to a total. Day to day the player is
 * income-bound, not price-bound, so raising prices does not raise spend (day 90
 * committed spend is 26,500 before and 25,433 after); it only buys fewer pieces
 * with the same coins (79 -> 75 by day 90). Price is a merchandise lever, not a
 * pacing lever. The pacing lever is the crate cosmetic drop, which is E32-3's
 * fifth-cut and is NOT shipped.
 *
 * CORROBORATION: Tom priced a single football garment at 4,200 by hand on
 * 2026-09-04. That is 2.1x the legendary this ladder replaces, and within 5% of
 * the 4,000 legendary it installs. The hand-set price and the ladder now agree.
 */
export const RACK_THEME = 'HEATWAVE';
export const RACK_POOLS = [
  [6000, ['H13-4', 'H13-2', 'H13-5']],    // legendary blowfish hats  head
  [4800, ['B0-4', 'B20', 'B2']],          // rare bodies              whole figure
  [4000, ['IL8-1', 'IL12-2', 'IL14']],    // legendary left hand      left hand
  [3000, ['T10-1', 'T10-2', 'T6-1']],     // uncommon tees            torso
  [2000, ['FW6-3', 'FW7-6', 'FW8-3']],    // rare kicks               feet
  [1800, ['P5-1', 'P5-2', 'P6-3']],       // epic swim trunks         hips
  [1400, ['S4-1', 'S5', 'S8']],           // uncommon socks           ankle
  /* THE ANCHOR, and it is the point of this rung. A starting wallet is 340
     coins; with a 500-coin floor every one of the eighteen prices rendered out
     of reach and the screen had no affordable state on it at all, which reads
     as broken rather than expensive. Every rack carries one piece a starting
     wallet can actually buy. UNCHANGED BY THE 2026-09-04 DOUBLING: 600 would
     have put this rung out of a starting wallet's reach, which is the exact
     state this rung exists to prevent. */
  [300, ['U2', 'U4', 'U7']],              // common briefs            waist
];
/* DUST IS THE CERTAINTY PREMIUM: coins buy whatever the rack happens to offer,
   dust buys the exact piece you just tried on. So the rate may be kinder on the
   pieces worth targeting, but it must never REVERSE. This is an explicit
   per-rung ladder rather than a formula, because a formula over eight rungs is
   what produced an inversion where plain white briefs cost 25% more dust than
   the aura. Implied coins-per-dust, dearest to cheapest: 15.0, 13.7, 12.5,
   11.5, 10.5, 10.0, 9.3, 8.6, strictly single-directional.
   DUST DOUBLED IN LOCKSTEP with the coins above (anchor rung excepted, as
   there), so every one of those eight ratios is UNCHANGED to the decimal. Had
   only the coins doubled, dust would silently have become half price relative
   to them and the certainty premium would have collapsed. */
export const RACK_DUST = [400, 350, 320, 260, 190, 180, 150, 35];
/* AURAS GO ON WEAPONS, and the weapon in the tile is a MANNEQUIN, not the
   product: a plain common katana nobody is selling carries it so "you are
   buying the effect, not the sword" survives. Cell 4 is the centre of the
   three-wide grid. */
export const RACK_AURA = { key: 'tide', name: 'Tidewater Aura', carrier: 'IR7-3', rarity: 'epic', coin: 2400, dust: 220 };
export const RACK_AURA_CELL = 4;
/* THE REROLL IS A PRICE CURVE, NOT A COUNT CAP. Tom, 2026-08-31: "players
   should be able to pay an increasing amount to reroll the rack thats fine".
   This is deliberately a coin sink: post-Bumbleseal players sit on ~30,000
   inert coins with the crate shop closed. So the count is unlimited within the
   week and the PRICE is the ceiling: it starts at a quarter of a legendary
   (RACK_RARITY_PRICE tops at 4,000 since the 2026-09-04 doubling), doubles per
   reroll, and holds at the cap. THE DERIVATION IS THE REASON THIS LADDER MOVED
   TOO: the opening rung is a quarter of a legendary by construction, so leaving
   it at 500 against a 4,000 legendary would have made the stated rule false and
   quietly halved the endgame sink relative to the shelf it drains.
   Five rerolls cost 31,000; the ~86,000 wallet the r33 price sim measures at
   day 365 funds about six. The free first rung is untouched. The counter (and
   with it the curve) resets weekly with the rack record (rr: 0 in rack()).
   The old count-capped weekly ladder (one free + six paid, 2,000 total,
   approved 2026-08-20) is superseded by the 2026-08-31 ruling, with ONE thing
   kept: the free first reroll. Tom's ruling adds a paid increasing tail as an
   endgame coin sink; it never asked to take away the freebie casual players
   already had, so the ladder opens at 0 and the sink starts at rung two.
   Reviewer-set from the shelf economy: five paid rerolls run 15,500 against
   the ~30,000 endgame hoard the ticket measured. */
export const RACK_REROLL_LADDER = [0, 1000, 2000, 4000, 8000, 16000];

// Same FNV-1a the dens turn over on, so the rack changes every Monday with no
// server. The salt is the reroll counter, and since 2026-08-31 it moves ONLY
// the rotating shelf below: the themed nine keep their week identity, so a
// reroll can never fish a specific themed piece out of its 3-deep rungs.
/* ============ THE SECOND HALF OF THE RACK: VARIETY ============
 * Tom, 2026-08-27: "we need to be offering for more for sale there now that we
 * have removed chests for sale from the game players are pissed and have no
 * where to spend their gold so make the rack more interesting", and then the
 * shape: "why dont we make it so part of the rack has themed stuff and then
 * there is just random rotating items below? best of both worlds".
 *
 * THE NUMBER THAT MAKES THE CASE: the catalogue holds 370 cosmetics and the
 * themed rack sells NINE a week. So 361 pieces of finished art were unreachable
 * with coins, which is the whole reason there is nowhere to spend them. The
 * themed rungs above are untouched: this is a second shelf, not a replacement.
 *
 * WHAT IS DELIBERATELY NOT IN THE POOL, each for its own reason rather than by
 * taste, because a silent allow-list is how the wrong thing ends up for sale:
 *   slot C            pets are hatched, not bought. C6 (Bumbleseal) is the one
 *                     Tom named as shop-only and she has her own 1% hatch, so
 *                     putting her on a coin shelf would undercut both.
 *   CE / CB / CG / CM Bumbleseal's own pieces, sold on her own shelf.
 *   exclusive         SK15 and the Day One Lizard. js/loot.js already records
 *                     the rule for this flag: "never appears at all (awarded by
 *                     name only)". Selling one would break a promise made to
 *                     the players who earned it.
 *   default           B0-1 and SK0-1, the body and skull every player already
 *                     starts with. Charging for those reads as a bug.
 *
 * PRICED BY RARITY, and the ladder is checked rather than asserted: dust is the
 * CERTAINTY premium, so coins-per-dust must never REVERSE as pieces get dearer
 * (the same invariant RACK_DUST carries above). Implied here, cheapest to
 * dearest: 8.6, 9.3, 10.5, 10.8, 12.5. Strictly single-directional, and every
 * value is one already on the themed ladder so the two shelves cannot disagree
 * about what a piece of a given rarity is worth.
 *
 * DOUBLED 2026-09-04 with the themed shelf above, coin and dust together and
 * the common anchor held, so all five of those ratios are unchanged and the
 * two shelves still cannot disagree. The reasoning, the measurement and what
 * this deliberately does NOT fix are all recorded at RACK_POOLS above; the
 * numbers are pinned by tests/rack-price-ladder-audit.mjs. */
export const RACK_ROTATE_N = 12;
export const RACK_RARITY_PRICE = {
  common:    [300, 35],
  uncommon:  [1400, 150],
  rare:      [2000, 190],
  epic:      [2800, 260],
  legendary: [4000, 320],
};
const RACK_PET_SLOTS = new Set(['C', 'CE', 'CB', 'CG', 'CM']);
/* Football kit, 2026-09-04: kits have their own shelf at their own price, and
   an id on two shelves is the indexOf collision rack-theme-lint exists for. */
export const RACK_ROTATE_POOL = BH_ITEMS
  .filter(i => !RACK_PET_SLOTS.has(i.slot) && !i.exclusive && !i.default && !i.football && RACK_RARITY_PRICE[i.rarity])
  .map(i => i.id)
  .sort();

const rackHash = t => { let h = 2166136261; for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
export const rackPick = (week, salt) => RACK_POOLS.map(([, ids], i) => ids[rackHash(`${week}:${salt}:rack:${i}`) % ids.length]);

/* Same hash, a different namespace in the seed string, so the two shelves cannot
   move together: a reroll changes both because the salt changes, but the themed
   rung and the rotating slot at the same index never track each other.
   `taken` keeps the shelves disjoint. That is not cosmetic: buyRackItem prices a
   themed piece by `st.ids.indexOf(artId)`, so the SAME id appearing on both
   shelves would be charged the themed rung's price wherever the player tapped
   it, which is the exact collision rack-theme-lint exists to prevent one level
   up. The loop is bounded and de-duplicated; with a pool of ~350 against 12
   draws it is nowhere near the cap, and returning short is safe (the shelf just
   renders fewer tiles) where looping forever is not. */
export const rackRotatePick = (week, salt, taken) => {
  const pool = RACK_ROTATE_POOL.filter(id => !taken.includes(id));
  const out = [];
  for (let i = 0; out.length < RACK_ROTATE_N && i < RACK_ROTATE_N * 40; i++) {
    const id = pool[rackHash(`${week}:${salt}:rot:${i}`) % pool.length];
    if (!out.includes(id)) out.push(id);
  }
  return out;
};

/* WHICH NINE, WHICH WEEK, HOW MANY REROLLS: all of it persisted, because a
   rack recomputed on every render is a rack that changes under the player's
   thumb. Owned pieces deliberately STAY on it for the rest of the week rather
   than being filtered out, which is what gives the screen its owned state. */
export async function rack() {
  // lazy import: poi.js imports this module, so a top-level import is a cycle
  const { isoWeekKey } = await import('./poi.js');
  /* lazy for the same reason as isoWeekKey: nutrition.js is not on loot.js's
     static graph and a top-level import would put it there. */
  const { dateKey } = await import('./nutrition.js');
  const week = isoWeekKey(new Date());
  const day = dateKey();
  const cur = await kvGet('rack', null);
  /* MIGRATION, IN PLACE, NO NEW WEEK. A save written before the rotating shelf
     existed has ids but no rot. Rebuilding the whole record would move the
     themed rung under a player mid-week and quietly hand back their spent
     rerolls, so the record is kept and only the missing half is filled, on the
     salt it already carries. */
  /* THE ROTATING SHELF IS WEEKLY NOW, ON THE SAME KEY THE THEMED NINE USE.
     Tom, 2026-09-05, reversing the 2026-08-27 daily ruling below: "the
     rotating twelve rotate WEEKLY". `rackRotatePick`'s own first parameter is
     named `week`, but every call site here was quietly passing `day`
     (dateKey()), so the shelf silently re-rolled at midnight every night while
     the banner and the reroll ladder both counted in weeks. Fixed by seeding
     on `week`, the same key `cur.week` already gates this whole record on.

     ADDITIVE MIGRATION: `rotDay` is no longer read as a freshness gate at all.
     A record that already holds a `rot` array - drawn under the old per-day
     code, its `rotDay` a date string rather than a week - is NOT force-redrawn
     here. Once a record has SOME `rot`, it stands for the rest of that
     `week`, which is exactly the boundary the old daily code was meant to
     respect and did not; the day-keyed shelf a player already has simply
     rides out its week unchanged. The only thing this migration branch still
     does is fill in `rot` for a record that predates the rotating shelf
     entirely (no `rot` at all): the record is kept and only the missing half
     is filled, on the salt it already carries. The next NEW week (`cur.week
     !== week`, below) rebuilds the record from scratch regardless. */
  const staleRot = cur && cur.week === week && Array.isArray(cur.ids) && cur.ids.length === RACK_POOLS.length
    && !Array.isArray(cur.rot);
  if (staleRot) {
    const rot = rackRotatePick(week, cur.salt || 0, cur.ids);
    /* Spread the record the TRANSACTION reads, not the one read above it:
       rerollRack claims `rr` on this same row, and writing `cur` whole handed a
       spent reroll back, which is a rung of the price ladder for free. It
       refuses outright once somebody else has already filled `rot` in. */
    await kvUpdate('rack', prev => (prev && !Array.isArray(prev.rot)) ? { ...prev, rot, rotDay: day } : undefined, null);
    cur.rot = rot; cur.rotDay = day;
  }
  if (cur && cur.week === week && Array.isArray(cur.ids) && cur.ids.length === RACK_POOLS.length) {
    /* THE COUNTER IS WEEKLY, and the week check three lines up is the whole
       mechanism: a record that survives to here belongs to THIS week, so its
       reroll count (and with it the price curve) stands, and a new week
       rebuilds the record from scratch with rr: 0. It used to reset on rrDay,
       which handed back the cheap end of the ladder EVERY DAY; seven cheap
       full-rack draws a week against 3-deep rungs surfaced any specific themed
       piece 94% of weeks (1 - (2/3)^7). Since 2026-08-31 a reroll cannot touch
       the themed nine at all (rerollRack keeps cur.ids), but the weekly reset
       still matters: it is what makes the rising curve a curve rather than a
       daily 500-coin flat rate. `day` is no longer read here. */
    return { ...cur, rr: cur.rr || 0 };
  }
  const ids = rackPick(week, 0);
  const st = { week, salt: 0, ids, rot: rackRotatePick(week, 0, ids), rotDay: day, rr: 0 };
  await kvSet('rack', st);
  return st;
}

/* Clamped, never null: past the last rung the price holds at the cap, because
   the count is unlimited and a null cost would brick the button mid-week. */
export function rackRerollCost(rr) { return RACK_REROLL_LADDER[Math.min(rr, RACK_REROLL_LADDER.length - 1)]; }

/* A SPEND, GUARDED THE SAME WAY A PAYOUT IS. kvUpdate does the read and the
   write in ONE IndexedDB transaction, so two taps racing cannot both take the
   same rung of the ladder: the loser sees a moved counter, returns undefined,
   and nothing is deducted. Coins are only spent AFTER the rung is won. */
export async function rerollRack() {
  const st = await rack();
  /* `day` is read HERE and not borrowed from rack(): it is a different function
     and the binding does not reach across. That exact mistake shipped in v458,
     where breedPets returned a `cost` variable a previous change had deleted and
     every breed threw ReferenceError at the last line. */
  const { dateKey } = await import('./nutrition.js');
  const day = dateKey();
  const cost = rackRerollCost(st.rr);
  /* Mirror buyRackItem's NaN-wallet guard: a curve edit that makes cost
     undefined must be a dead button, never `bal < undefined` (false) followed
     by a NaN wallet write. */
  if (!Number.isFinite(cost)) return { ok: false, reason: 'price' };
  // The paid rung and its new shelf commit with the debit. A stale quote
  // refuses without charging, and an aborted shelf write rolls back the coins.
  return payAtomic({ snapshot: { keys: ['rack', 'coins'] }, decide: state => {
    const cur = state.rack, used = (cur && cur.rr) || 0;
    if (!cur || cur.week !== st.week || used !== st.rr) return { result: { ok: false, reason: 'race' } };
    const balance = Number(state.coins) || 0;
    if (balance < cost) return { result: { ok: false, reason: 'coins', need: cost, have: balance } };
    const salt = (cur.salt || 0) + 1;
    const next = { week: cur.week, salt, ids: cur.ids, rot: rackRotatePick(cur.week, salt, cur.ids), rotDay: day, rr: used + 1 };
    return { kv: {
      coins: () => balance - cost, coinsRev: rev => (Number(rev) || 0) + Math.max(1, cost),
      rack: () => next,
    }, result: { ok: true, cost, rr: next.rr, coins: balance - cost } };
  } });
}

/* THE AURA YOU BOUGHT IS THE AURA YOU WEAR. There is exactly one aura in the
   game, so ownership and "worn" are the same fact and one kv key holds both.
   ponytail: single key, promote to an owned-list + a picker when a second aura
   ships and taking one off becomes a thing a player can want. */
export async function wornAura() { return (await kvGet('wpnaura', null)) || null; }
/* A COSMETIC YOU CANNOT TAKE OFF IS NOT A COSMETIC. Buying the aura writes
   kv `wpnaura` and, until this existed, there was no way back: a player spent
   1,200 coins and was stuck with the halo permanently, on every weapon, forever.
   That is a worse outcome than not selling it. Ownership is the grant (kv
   `rackbuy:` and `cos:`), so taking it off does NOT un-buy it and putting it
   back costs nothing. `null` is off, and wornAura already treats a falsy value
   as none. */
export async function setWornAura(key) { await kvSet('wpnaura', key || null); return (await wornAura()); }
/* OWNERSHIP IS THE PURCHASE CLAIM, NOT WHETHER IT IS CURRENTLY WORN, and the
   difference is the whole point. MEASURED before this existed: after a real
   1,200-coin buy, ownedCosmeticIds() does NOT contain the aura key, because
   grantCosmetic keys off BH item ids and an aura is not one. So kv `wpnaura`
   was the ONLY record of the purchase, and a wear/take-off toggle built on it
   would have ERASED THE PURCHASE on the first tap: the tile returns to selling
   it and the player pays 1,200 again for something they already bought.
   The durable record already exists. `rackbuy:<key>` is written inside the same
   addIfAbsent transaction that authorises the spend, it is never removed, and it
   is what makes a second buy a no-op. Read that instead. */
export async function ownsAura(key) { return (await kvGet(`rackbuy:${key}`, null)) != null; }

/* ---------- THE PURCHASE ----------
 *
 * The rewarded-actions SOP (tally/CLAUDE.md) applied to a SPEND, because the
 * failure mode is the same shape as a double payout: a second call that moves
 * money again.
 *
 *   TRANSITION  a rack piece goes from unowned to owned. Once, and forever.
 *   AUTHORITY   db.addIfAbsent on the kv row `rackbuy:<artId>`. The check and
 *               the write are ONE IndexedDB transaction, and IndexedDB
 *               serialises readwrite transactions on a store across every tab,
 *               so exactly one caller anywhere on the device is ever told yes.
 *               The naive kvGet/kvSet form is not a smaller version of this: it
 *               was MEASURED printing 16,500 coins to three concurrent callers
 *               on the garden refund, which is the same shape in the opposite
 *               direction.
 *   NO-OP       a second attempt loses the claim and returns reason 'owned',
 *               having deducted nothing. Nothing is spent before the claim is
 *               won, which is the ordering that makes that true.
 *
 * COSMETIC ONLY, and this is Tom's locked call from 2026-08-07: coins never buy
 * power. This grants a `cos` inventory row and a paid look. It calls no gear
 * grant, touches no `gearloadout` and writes no `equipped`.
 * tests/purchase-firewall.mjs is the teeth on that, in both directions: it
 * measures the stores around a real buy AND fails statically on any reference
 * from this path to a statted-item function.
 */
export async function buyRackItem(artId, currency = 'coins') {
  const st = await rack();
  const aura = artId === RACK_AURA.key;
  const i = st.ids.indexOf(artId);
  /* THE ROTATING SHELF IS PRICED BY RARITY, THE THEMED RUNGS BY POSITION, and
     the two lookups must not be able to cross. The themed shelf is checked
     FIRST and the shelves are built disjoint (rackRotatePick is handed the
     themed ids), so `indexOf` keeps meaning what buyRackItem has always meant by
     it. A piece stocked on neither shelf is still refused: this widens what the
     rack sells, never what it will take money for. */
  const r = i < 0 && Array.isArray(st.rot) ? st.rot.indexOf(artId) : -1;
  if (!aura && i < 0 && r < 0) return { ok: false, reason: 'not-stocked' };
  const art = aura ? null : BH_BY_ID[artId];
  if (!aura && !art) return { ok: false, reason: 'not-stocked' };
  const rar = !aura && i < 0 ? RACK_RARITY_PRICE[art.rarity] : null;
  if (!aura && i < 0 && !rar) return { ok: false, reason: 'not-stocked' };
  const price = aura
    ? (currency === 'dust' ? RACK_AURA.dust : RACK_AURA.coin)
    : i >= 0
      ? (currency === 'dust' ? RACK_DUST[i] : RACK_POOLS[i][0])
      : (currency === 'dust' ? rar[1] : rar[0]);
  /* A rung added to RACK_POOLS without its RACK_DUST twin makes price
     undefined here; `bal < undefined` is false, so the sale would PASS and
     write NaN into the wallet itself. Refuse before the receipt claim, so a
     mispriced shelf is a dead button and never a corrupted balance. The
     PARALLEL row in rack-rotate-audit pins the arrays; this line is for the
     day that audit is wrong. */
  if (!Number.isFinite(price)) return { ok: false, reason: 'not-stocked' };
  const already = aura ? (await wornAura()) === artId : (await ownedCosmeticIds()).has(artId);
  if (already) return { ok: false, reason: 'owned' };
  /* THE CLAIM AND THE SPEND ARE ONE TRANSACTION (fixed 2026-09-05, offline
     crash seam OFF-2a). This used to spend first (its own transaction) and
     claim the receipt second (a separate one): correct against a same-instant
     double-tap (spendCoins/spendDust refuse inside their own transaction, so
     two DIFFERENT pieces bought at once could not both clamp their debits to
     zero, the bug measured on origin/main 2faa73b6), but a crash between the
     two writes left a debited wallet and NO receipt. Nothing on disk
     remembered the spend had happened, so the retry that followed spent again:
     reproduced by making the receipt write reject once (the same trigger
     purchase-write-failure-audit.mjs uses for quota/abort/freeze), a
     6,000-coin item took 12,000. db.claimAndPay folds both into one IndexedDB
     transaction, the same primitive js/game.js:awardOnce and js/quests.js
     :claimQuest use to keep a claim and its payout atomic: the kv fn is
     synchronous and can throw to abort the WHOLE transaction, which rolls the
     receipt `add()` back too, so an insufficient wallet claims nothing and
     spends nothing, exactly like spendCoins returning null. */
  const debitOrThrow = cur => {
    const bal = Number(cur) || 0;
    if (bal < price) { const e = new Error('insufficient-funds'); e.insufficientFunds = true; throw e; }
    return bal - price;
  };
  let claimed;
  try {
    claimed = await db.claimAndPay('kv',
      { k: `rackbuy:${artId}`, v: { ts: Date.now(), price, currency } },
      /* the revision rides in the SAME transaction as the debit (2026-09-06),
         or a pre-purchase blob at the same revision refunds this on merge */
      { kv: currency === 'dust'
        ? { bonedust: debitOrThrow, dustRev: cur => (Number(cur) || 0) + price }
        : { coins: debitOrThrow, coinsRev: cur => (Number(cur) || 0) + price } });
  } catch (e) {
    if (e && e.insufficientFunds) {
      return { ok: false, reason: currency, need: price,
        have: currency === 'dust' ? await boneDust() : await coins() };
    }
    throw e;
  }
  if (!claimed) {
    /* THE RECEIPT EXISTS, WHICH IS NOT THE SAME AS OWNING THE PIECE.
       NO REFUND NEEDED: the claim and the spend are now the same transaction,
       so losing the claim (somebody else's tap holds the receipt, or it is a
       stuck one from an earlier run) means this call never touched the
       balance either; there is nothing to give back.
       The gap the old ordering left is still here and still needs this branch:
       if any write after the claim rejects (db.js rejects on abort, on quota,
       and on the wipe-protocol freeze flag), the player has paid and owns
       nothing, and every later tap lands here. This branch used to answer
       `owned`, so the UI told them "Already in your Wardrobe" about a piece that
       was not in it, and js/loot.js:194 means that receipt is never removed, so
       the piece was unbuyable FOREVER, on every future rack.
       Recovery, not refund. Finishing the grant instead is idempotent by
       construction: grantCosmetic returns null when the row is already there and
       markPaid will not push a duplicate key, so running this twice is a no-op.
       It also needs no new field and no migration, because "paid but ungranted"
       is already fully derivable from the two rows we have.
       The aura is deliberately excluded: ownsAura() reads THIS receipt as the
       ownership record, so an aura receipt cannot be stuck. An aura that reads
       as unowned while a receipt exists is the separate worn-versus-bought bug
       in the try-on sheet, and paying it out here would be wrong. */
    if (aura) return { ok: false, reason: 'owned' };
    if ((await ownedCosmeticIds()).has(artId)) return { ok: false, reason: 'owned' };
    await grantCosmetic(artId, 'rack');
    await markPaid(art.slot, artId);
    /* REPORTED AS 'owned', NOT AS A FRESH PURCHASE, and that is deliberate.
       This branch cannot tell a stuck receipt from a LOSING CALLER in a race:
       three concurrent taps all lose the claim, and at the instant they look the
       winner has not written its inv row yet, so all three see "not owned" and
       all three arrive here. Answering ok:true made one purchase report three
       successes, three toasts and three confetti bursts, which is what
       purchase-firewall's ONCE-RACE row caught.
       'owned' is the honest answer in BOTH cases, because by the time it is
       returned the grant above has run and the piece really is owned. The
       recovered flag is only so the UI can refresh the tile it is looking at. */
    return { ok: false, reason: 'owned', recovered: true };
  }
  try {
  if (aura) {
    await kvSet('wpnaura', artId);
  } else {
    await grantCosmetic(artId, 'rack');
    /* THE PAID-LOOK WRITE, and it is the difference between owning a piece and
       being allowed to wear it. Transmog is priced in Bone Dust, so without a
       row in `paidlooks` a player who just paid 3,000 coins for a look would be
       asked for dust the first time they put it on a statted slot. Invisible
       until a real buyer hits it, and then it is a refund request. */
    await markPaid(art.slot, artId);
  }
  } catch (e) {
    /* SAY SO. The money has moved and the receipt is down, so the piece is
       recoverable on the next tap by the branch above, but silence here is what
       made this look like a working purchase that ate the coins. */
    return { ok: false, reason: 'write', label: aura ? RACK_AURA.name : art.name };
  }
  return { ok: true, label: aura ? RACK_AURA.name : art.name, cost: price, currency,
    isAura: aura, coins: await coins(), dust: await boneDust() };
}

/* Menagerie payment, receipt, cosmetic and Stable copy commit together.
   A legacy paid receipt can finish delivery even with an empty wallet.
   Accessories remain gated on owning the pet they were drawn for. */
export async function buyPetItem(id) {
  const isPet = id === PET_SHOP.pet.id;
  const entry = isPet ? PET_SHOP.pet : PET_SHOP.items.find(i => i.id === id);
  const art = BH_BY_ID[id];
  if (!entry || !art) return { ok: false, reason: 'not-stocked' };

  const owned = await ownedCosmeticIds();
  if (owned.has(id)) return { ok: false, reason: 'owned' };
  if (!isPet && !owned.has(PET_SHOP.pet.id)) return { ok: false, reason: 'needs-pet', pet: PET_SHOP.pet.id };

  const price = entry.coin, key = `petbuy:${id}`;
  if (!Number.isFinite(price) || price <= 0) return { ok: false, reason: 'not-stocked' };
  const prepared = isPet ? await petInstancePay(id) : null;
  let result;
  try {
    result = await payAtomic({ snapshot: { keys: [key, 'coins'], stores: ['inv'] }, decide: (state, rows) => {
      const has = itemId => rows.inv.some(r => r.kind === 'cos' && r.itemId === itemId);
      if (has(id)) return { result: { ok: false, reason: 'owned' } };
      if (!isPet && !has(PET_SHOP.pet.id)) return { result: { ok: false, reason: 'needs-pet', pet: PET_SHOP.pet.id } };
      const paid = !!state[key], balance = Number(state.coins) || 0;
      if (!paid && balance < price) return { result: { ok: false, reason: 'coins', need: price, have: balance } };
      return {
        kv: {
          ...(prepared?.pay.kv || {}),
          looks: cur => looksWith(cur, [id]),
          [key]: () => state[key] || { ts: Date.now(), price },
          ...(!paid ? { coins: () => balance - price, coinsRev: cur => (Number(cur) || 0) + price } : {}),
        },
        puts: [{ store: 'inv', val: cosRow(id, 'petshop') }],
        result: paid ? { ok: false, reason: 'owned', recovered: true }
          : { ok: true, label: art.name, cost: price, isPet, coins: balance - price },
      };
    } });
    if (isPet && (result.ok || result.recovered)) await setEquippedPet(prepared.inst.iid);
  } catch {
    return { ok: false, reason: 'write', label: art.name };
  }
  return result;
}

/* One Mystery Egg for 60 Bone Dust per ISO week, by the 2026-08-31 ruling.
   Receipt, dust and egg commit together. Legacy receipts without `granted`
   represent paid delivery still owed and recover without another debit.
   A granted legacy receipt must stay closed even after its egg hatches. */
export const DUST_EGG = { label: 'Mystery Egg', cost: 60, desc: 'Incubate, then hatch a pet' };

const dustEggKey = async () => {
  // lazy import: poi.js imports this module, so a top-level import is a cycle
  const { isoWeekKey } = await import('./poi.js');
  return `dustegg:${isoWeekKey(new Date())}`;
};

/* Bought AND granted this week. `granted` and not mere receipt existence, so a
   paid-but-stuck purchase keeps its shop cell pressable and the next tap runs
   the recovery branch below instead of reading "yours" over a missing egg. */
export async function dustEggBought() {
  const r = await kvGet(await dustEggKey(), null);
  return !!(r && r.granted);
}

export async function dustEggPending() {
  const receipt = await kvGet(await dustEggKey(), null);
  return !!receipt && !receipt.granted;
}

export async function buyDustEgg() {
  const key = await dustEggKey();
  const price = DUST_EGG.cost;
  if (!Number.isFinite(price)) return { ok: false, reason: 'not-stocked' };
  const egg = await eggRow('dust');
  try {
    return await payAtomic({ snapshot: { keys: [key, 'bonedust'], stores: ['inv'] }, decide: state => {
      const receipt = state[key], balance = Number(state.bonedust) || 0;
      if (receipt?.granted) return { result: { ok: false, reason: 'limit' } };
      if (!receipt && balance < price) return { result: { ok: false, reason: 'dust', need: price, have: balance } };
      return {
        kv: {
          [key]: () => ({ ...(receipt || { ts: Date.now(), price }), granted: true }),
          ...(!receipt ? { bonedust: cur => balance - price, dustRev: cur => (Number(cur) || 0) + price } : {}),
        },
        puts: [{ store: 'inv', val: egg }],
        result: receipt ? { ok: false, reason: 'limit', recovered: true }
          : { ok: true, label: DUST_EGG.label, cost: price, dust: balance - price },
      };
    } });
  } catch {
    return { ok: false, reason: 'write', label: DUST_EGG.label };
  }
}

/* WHAT THE PET IS WEARING. One kv row, `petWear`, shaped { slotCode: itemId }:
 *   { CG: 'CG1', CB: 'CB2', CM: 'CM1', CE: 'CE1' }
 *
 * ONE ITEM PER SLOT IS THE SHAPE, not a rule anybody has to enforce. An object
 * keyed by slot cannot hold two bags, so "equip the other purse" is one
 * assignment and the old one is gone. A list of ids would need a filter on
 * every write and would be wrong the first time somebody forgot it.
 *
 * NOT KEYED BY SPECIES, and that is deliberate rather than lazy. Every
 * accessory is drawn pre-positioned for ONE body (measured 2026-08-21: the
 * glasses overlap Bumbleseal's ink by 94.8% and every other pet by 0.0%), so
 * there is exactly one pet these can be worn by and it is PET_SHOP.pet.id. The
 * species check lives in the RENDERER (petWearFor in js/app.js), where it
 * guards every surface at once; a second copy of it here would be a second
 * thing to keep in step. A future second dressable pet needs its own art set,
 * and that is the day this row becomes { species: { slot: id } }.
 *
 * kvUpdate, not kvGet + kvSet: two taps on two tiles in the same instant are
 * two read-modify-writes that lose one of the two garments (tally/CLAUDE.md,
 * rewarded actions rule 6). Nothing is paid for here, but the same interleave
 * silently drops an equip.
 */
export const petWear = () => kvGet('petWear', {});

export async function togglePetWear(id) {
  const it = BH_BY_ID[id];
  /* petSlots, not a fresh list of codes: the crate exclusion already derives it
     from PET_SLOTS, so a sixth accessory is equippable the day its slot lands. */
  if (!it || !petSlots.has(it.slot)) return { ok: false, reason: 'not-an-accessory' };
  if (!(await ownedCosmeticIds()).has(id)) return { ok: false, reason: 'not-owned' };
  const wear = await kvUpdate('petWear', cur => {
    const w = { ...(cur || {}) };
    if (w[it.slot] === id) delete w[it.slot];
    else w[it.slot] = id;
    return w;
  }, {});
  return { ok: true, worn: wear[it.slot] === id, slot: it.slot, wear };
}

function rng() {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0] / 0xffffffff;
}

/* ---------- coins ----------
   READ-MODIFY-WRITE IS NOT A BALANCE CHANGE, IT IS A GUESS AT ONE.
   This was `const c = Math.max(0, (await coins()) + n); await kvSet('coins', c)`,
   which is a read, an await, and a write of a number that may already be stale.
   Inside one tab the awaits interleave whenever two payouts overlap; with the
   app open in two tabs it is constant. Measured on two real pages: 50 awards of
   +10 from a balance of 1000 landed on 1280 instead of 1500, and 20 spends of
   100 racing 20 earns of 100 left the player at 2500 instead of 3000, which is
   500 coins of spending that never happened. Both directions are live: a lost
   EARN robs the player, a lost SPEND mints currency.
   kvBump does the read and the write in one IndexedDB transaction, and
   IndexedDB serialises readwrite transactions on a store across every tab, so
   the arithmetic is exact by construction rather than by luck. The clamp is
   unchanged, it just happens inside the transaction now. */
export async function coins() { return (await kvGet('coins', 0)) || 0; }
/* 'coinsRev' is a monotonic counter, bumped alongside every real coin
   change and carried in the same backup blob as 'coins' (js/db.js exportAll
   dumps every kv row). js/db.js importAll's cloud merge (replace:false) reads
   it to tell a blob OLDER than the local ledger from one that is not, the
   same "keepHigher" idiom already used there for the day ceilings, applied to
   coins instead (QA round 34 P0). ONE transaction for both rows since
   2026-09-06 (js/db.js kvBumpRevisioned): they were two kvBump calls, and
   every DEBIT in this file moved the balance alone, so a same-revision blob
   from before the spend won on "higher balance" and refunded the purchase
   while the item stayed (Codex audit of v485; tests/coins-merge-tie-audit.mjs
   COIN-DEBIT and DUST-DEBIT are the measured rows).
   R38-13 (2026-09-06): bumped by the MAGNITUDE of the change, not a flat 1.
   Two devices moving the ledger the same NUMBER of times used to tie under a
   flat counter regardless of how much money actually moved, and importAll's
   tie-break silently let the payload's balance win either way -- measured,
   a real 25 replaced by a real 10. A magnitude sum only ties when the two
   devices' changes happened to add up to the exact same total, which an
   independently divergent history essentially never does by accident. */
export async function coinsAdd(n) { return kvBumpRevisioned('coins', 'coinsRev', n); }
/* THE KV HALF OF kvBumpRevisioned, for a payout that has to ride inside the
   transaction that spends its input (takeAndPay / payAtomic, 2026-09-06): same
   clamp, same magnitude bump of the revision key, in ONE write, so a crate's
   coins or a melt's dust move their revision in the transaction that spends
   the input (js/db.js importAll ranks a merge by it). Computed keys on
   purpose: the dust-spend census in unit.test.js reads a literal `bonedust:` as
   a spend. */
const bumpPay = (k, revKey, n) => ({
  [k]: cur => Math.max(0, (Number(cur) || 0) + n),
  [revKey]: cur => (Number(cur) || 0) + Math.max(1, Math.abs(n)),
});

/* THE ATOMIC SPEND, and it is the only honest way to take money in this file.
   Every buy used to read the balance, compare it to the price, and THEN call
   coinsAdd(-price) in a second transaction. That is check-then-act: concurrent
   callers all pass the same stale read, and because kvBump clamps at min 0 the
   surplus debits cost NOTHING. Measured on origin/main 13583e42: three
   overlapping buyShopItem('vigor') calls on a 90-coin wallet returned ok three
   times, granted three 90-coin Draughts and charged 90. Past the first item the
   goods were free, and Vigor is Pit energy, so thumb speed bought power.
   Deciding affordability and taking the money inside ONE kv transaction is the
   shape that cannot do that: kvUpdate writes nothing when fn returns undefined,
   so a wallet that cannot cover the price is left byte-identical.
   Returns the REAL post-spend balance, or null for "could not afford it". The
   balance is returned rather than re-read because a re-read can already carry
   somebody else's concurrent spend, and a receipt should say what this purchase
   left behind. */
export async function spendCoins(cost) { return spendBalance('coins', cost); }
/* THE SAME THING FOR BONE DUST, because the rack takes both and a shop that is
   exact in one currency and sloppy in the other is just a slower version of the
   same bug. Measured on origin/main 2faa73b6: two different rack pieces bought
   concurrently for 160 and 130 dust, on 160 dust, delivered both and left 0. */
export async function spendDust(cost) { return spendBalance('bonedust', cost); }
async function spendBalance(k, cost) {
  if (!Number.isFinite(cost) || cost < 0) return null;
  // requireFunds: the wallet that cannot cover it is left byte-identical, and
  // the revision moves WITH the debit, so a stale blob cannot refund it
  const left = await kvBumpRevisioned(k, k === 'coins' ? 'coinsRev' : 'dustRev', -cost, { requireFunds: true });
  return left === undefined ? null : left;
}

/* ---------- inventory ---------- */
export async function inventory() { return db.all('inv'); }

export async function ownedCosmeticIds() {
  const inv = await inventory();
  const owned = new Set(inv.filter(r => r.kind === 'cos').map(r => r.itemId));
  for (const s of BH_SLOTS) if (s.default) owned.add(s.default);
  return owned;
}

/* ONE COPY OF A THING YOU CAN ONLY OWN ONE OF.
 *
 * `newId()` is a timestamp plus six random characters, so two tabs granting the
 * same cosmetic produced two rows for one item: the ownership check read empty
 * in both, and nothing downstream could tell the pair apart. Measured with
 * gear (same shape, below): one gear id granted in two tabs left TWO inv rows,
 * and disenchantGear melts one row at a time for full dust, so the duplicate is
 * a dust faucet, not just a cosmetic wart.
 *
 * The id is now derived from what the row IS, so the store's own uniqueness
 * constraint does the deduplication: `addIfAbsent` can only succeed once for
 * `cos:<itemId>`. Rows minted before this keep their random ids and are
 * untouched; the ownership check above still short-circuits for anyone who
 * already owns the item, so no existing save changes shape. */
// eggRow's sibling, same reason: the row a cosmetic grant writes, without the write.
/* `nw: 1` IS THE UNREAD MARK, AND IT LIVES ON THE ROW THAT IS ALREADY BEING
   WRITTEN. R39-25: "the cosmetic you just won is never named again: 19 taps
   across the Backpack, the Wardrobe and all 14 slot rails, nothing." The claim
   toast at the reveal (v487) says WHAT you won; this is what lets you FIND it
   afterwards. On the row rather than in a kv key of seen-timestamps because a
   timestamp needs a backfill answer for every account that already exists, and
   the honest one ("everything you own is new") is a wall of dots. An absent
   flag reads as seen, so an existing collection stays quiet and only what is
   granted from here on is marked. Cleared by clearNewInSlot() when the
   Wardrobe opens that slot's grid; see js/app.js. */
export function cosRow(itemId, source) { return { id: `cos:${itemId}`, kind: 'cos', itemId, source, ts: Date.now(), nw: 1 }; }
export async function grantCosmetic(itemId, source) {
  const owned = await ownedCosmeticIds();
  if (owned.has(itemId)) return null;
  const row = cosRow(itemId, source);
  if (!await db.addIfAbsent('inv', row)) return null;   // another tab got there first
  await collectLook(itemId);
  return row;
}

/* `inv` (QA round 28 G3): a caller holding the inv rows already (renderToday
   reads them once per draw) hands them in; a bare call scans as before. */
export async function ownedGearIds(inv) {
  inv = inv || await db.all('inv');
  return new Set(inv.filter(r => r.kind === 'gear').map(r => r.gearId));
}

export async function grantGear(gearId, source, opts = {}) {
  const g = GEAR_BY_ID[gearId];
  if (!g) throw new Error('unknown gear');
  const owned = await ownedGearIds();
  if (owned.has(gearId)) return null;
  // `slimed`: the rare green-glowing Glutton variant. Purely cosmetic + a brag,
  // stored on the inv row so the wardrobe can mark the piece forever.
  // Deterministic id, same reasoning as grantCosmetic: a gear id is ownable once.
  const row = gearRow(gearId, source, opts);
  if (!await db.addIfAbsent('inv', row)) return null;   // another tab got there first
  await collectLook(g.artId);
  return g;
}
export function gearRow(gearId, source, opts = {}) {
  return { id: `gear:${gearId}`, kind: 'gear', gearId, source, ts: Date.now(), nw: 1, ...(opts.slimed ? { slimed: true } : {}) };
}

/* THE UNREAD SET, AND HOW IT IS CLEARED. Both take the inv rows a caller
   already has where one is available, so nothing here adds a second scan.
   `newCosmeticIds` is what the Wardrobe's tiles and slot rail are marked from;
   `newSlotCodes` is the same set collapsed to the 14 slot codes, which is all
   the paper doll needs. */
const invSlotOf = row => (row.kind === 'cos' ? (BH_BY_ID[row.itemId] || {}).slot
  : row.kind === 'gear' ? (GEAR_BY_ID[row.gearId] || {}).slot : null);
export async function newCosmeticIds(inv) {
  inv = inv || await db.all('inv');
  return new Set(inv.filter(r => r.nw).map(r => r.itemId || r.gearId));
}
export async function newSlotCodes(inv) {
  inv = inv || await db.all('inv');
  return new Set(inv.filter(r => r.nw).map(invSlotOf).filter(Boolean));
}
/* Clearing is a put per NEW row in that one slot, and only ever the rows that
   still carry the flag, so an already-seen slot costs zero writes. The bound is
   how many pieces landed in one slot since the last visit, which is small; a
   whole-collection rewrite is not reachable from here. */
export async function clearNewInSlot(slot) {
  const rows = (await db.all('inv')).filter(r => r.nw && invSlotOf(r) === slot);
  for (const r of rows) { const { nw, ...rest } = r; await db.put('inv', rest); }
  return rows.length;
}

// Gear ids the player owns a SLIMED copy of (Glutton drops).
export async function slimedGearIds() {
  const inv = await db.all('inv');
  return new Set(inv.filter(r => r.kind === 'gear' && r.slimed).map(r => r.gearId));
}

/* ---------- Bone Dust: the salvage economy (v73) ----------
   Melt unwanted gear or salvage pets you don't want into Bone Dust, so a bad
   drop / dupe egg still pays off. Dust buys eggs, crates and consumables, so
   junk loops back into a shot at something good. Additive: dust lives in its
   own kv key; the XP ledger is untouched. */
export const DUST_VALUE = {
  gear: { common: 3, uncommon: 5, rare: 12, epic: 30, legendary: 80 },
  pet:  { common: 10, uncommon: 15, rare: 30, epic: 60, legendary: 120 },
};
export async function boneDust() { return (await kvGet('bonedust', 0)) || 0; }
// same read-modify-write hazard, and the same fix, as coinsAdd above; 'dustRev'
// is Bone Dust's merge ordering signal (js/db.js importAll), added 2026-09-06
export async function boneDustAdd(n) { return kvBumpRevisioned('bonedust', 'dustRev', n); }
// Dust is rarity PLUS the piece's stat points. Tom asked for statted gear to be
// worth more; measuring first showed that EVERY one of the 276 catalog pieces is
// statted, so a flat "statted" bonus would have been a 50% dust inflation with no
// differentiation at all. Stat totals do vary a lot (uncommon 2-6, rare 3-11,
// legendary 5-18), so paying per point makes a strong roll genuinely worth more
// than a weak one of the same rarity, which is the decision he was reaching for.
// Rarity still dominates: a rare's 12 base outweighs any uncommon's points.
export function gearStatPoints(g) {
  return g && g.stats ? Object.values(g.stats).reduce((a, v) => a + v, 0) : 0;
}
export function gearDustValue(g) {
  return ((g && DUST_VALUE.gear[g.rarity]) || 3) + gearStatPoints(g);
}
export function petDustValue(item) { return (item && DUST_VALUE.pet[item.rarity]) || 10; }

// Melt an owned gear piece into Bone Dust. Auto-unequips it first. Destructive
// to that ONE item by the player's explicit choice; nothing else is touched.
export async function disenchantGear(gearId) {
  const g = GEAR_BY_ID[gearId];
  if (!g) return { ok: false, reason: 'unknown' };
  const inv = await db.all('inv');
  const row = inv.find(r => r.kind === 'gear' && r.gearId === gearId);
  if (!row) return { ok: false, reason: 'not-owned' };
  // Consume, pay, preserve the appearance and remove worn stats together.
  // A failed write leaves the whole pre-melt state intact. Read the live
  // loadout in the updater so another slot's newer equipment is retained.
  const dust = gearDustValue(g);
  if (!await takeAndPay('inv', row.id, { kv: {
    ...bumpPay('bonedust', 'dustRev', dust),
    looks: cur => looksWith(cur, [g.artId]),
    gearloadout: cur => {
      if (cur?.[g.slot] !== gearId) return undefined;
      const next = { ...cur }; delete next[g.slot]; return next;
    },
  } })) return { ok: false, reason: 'not-owned' };
  return { ok: true, dust, name: g.name };
}

// Salvage an owned, EARNED pet into Bone Dust. Won't touch a default/base pet
// (no inv row) and unequips it if it's your active companion.
export async function salvagePet(petId) {
  const item=BH_BY_ID[petId];
  if(!item||item.slot!=='C')return {ok:false,reason:'not-a-pet'};
  return salvageLivePet(null,petId);
}

/* THE BONE DUST SHOP IS CLOSED (S0 second half, 2026-08-25).

   It sold three things and all three were power or economy: a 60-dust Mystery
   Egg (a pet that fights beside you), a 40-dust Common Crate (a roll of statted
   gear) and a 25-dust Battle Charm (a Pit win pays more). That is the same
   two-hop shape S0 already took off the coin shop, one currency along.

   THE REASON IS NOT TIDINESS. Dust's other and far larger sink is the
   transmog/looks system and the weekly Rack, both purely cosmetic: they change
   the picture and never a stat. With this shop gone, dust is a cosmetic
   currency, and that is the precondition for dust ever being sold for real
   money without reopening the cosmetic-only IAP decision of 2026-08-07. A
   currency that buys eggs and crates is a currency that sells power.

   ONE EXCEPTION SURVIVES AND IT IS WRITTEN DOWN, NOT GLOSSED OVER: breedPets
   below charges dust and the offspring carries a permanent stat bump. It is a
   sink on two pets you already own rather than a shop that sells one, which is
   why it was not in scope here, but "dust is cosmetic-only" is not literally
   true while it stands, and it is the first thing to look at if dust is ever
   sold for money.

   Nothing was taken away from a player's balance: dust already earned still
   spends. grantEgg / grantCrate / grantConsumable are untouched and still
   reached by quests, day-close, level-ups, milestones, the wheel, the Boneyard,
   roam bosses and the server's make-good route.

   Enforced by tests/unit.test.js "S0: dust buys looks, and every dust spend in
   the tree is declared", which fails on a dust-priced product table, on a dust
   spend that is not in its declaration list, and on a dust spend whose body
   reaches a grant. */

export const EGG_GOAL_STEPS = 8000;

/* THE INCUBATION METER.
 *
 * Tom, 2026-08-06: "Is there ways to include working out as a potential
 * experience gain" for people who cannot get out for walks.
 *
 * Eggs and pets were fuelled by STEPS ALONE, which meant an hour on a rowing
 * machine or a full gym session moved nothing: a housebound player could never
 * hatch a pet. Recorded exercise minutes now count toward incubation at
 * STEPS_PER_ACTIVE_MIN each, capped per day so a mis-recorded eight-hour
 * "workout" cannot hatch a shelf of eggs at once.
 *
 * Deliberately NOT applied to step milestones or step XP: those already pay
 * separately for workouts (onHealthSync), and paying twice for one session is
 * how a currency stops meaning anything. This meter is for eggs and pets only.
 */
export const STEPS_PER_ACTIVE_MIN = 250;
export const ACTIVE_MIN_DAILY_CAP = 60;
export async function lifetimeStepsSum() {
  return effectivePetSteps(await db.all('health'));
}
function effectivePetSteps(rows) {
  return rows.reduce((a, r) => a
    + (r.steps || 0)
    + Math.min(r.exerciseMin || 0, ACTIVE_MIN_DAILY_CAP) * STEPS_PER_ACTIVE_MIN, 0);
}

/* Eggs incubate: they hatch into PETS after you walk EGG_GOAL_STEPS.
   `goal: 0` is a READY egg, which is how the Crew channel can hand a new player
   one they can crack straight away. eggProgress compares walked >= goal, so zero
   is ready on arrival with no special case anywhere else. */
/* THE ROW grantEgg WRITES, without writing it. The Boneyard's collect pays its
   crate INSIDE the ledger claim's own transaction (js/hunt.js, QA round 28 Y5),
   so it needs the row rather than the write, and building it here is what stops
   the two shapes drifting apart. */
export async function eggRow(source, goal = EGG_GOAL_STEPS) {
  // Laboratory foundation: new eggs supply Base; species and shiny stay hatch-time.
  return { id: newId(), kind: 'egg', stepsAtStart: await lifetimeStepsSum(), goal, source,
    morph: 'base', morphPolicy: 'lab-final-v1', ts: Date.now() };
}
export async function grantEgg(source, goal = EGG_GOAL_STEPS) {
  const row = await eggRow(source, goal);
  await db.put('inv', row);
  return row;
}

export function eggProgress(row, lifetime) {
  /* `row.goal ?? EGG_GOAL_STEPS`, NOT `||`. A ready egg carries goal 0 and `0 ||
     8000` is 8000, so the one thing the goal parameter exists to express was the
     one thing it could not express: the ready egg handed to a new player still
     asked for 8,000 steps. Mine, shipped in v307. */
  const goal = row.goal ?? EGG_GOAL_STEPS;
  /* AN EGG THAT CAN NEVER MOVE. stepsAtStart is a snapshot of lifetime steps at
     the moment the egg was granted, and lifetime can go DOWN: a restore that
     brings back fewer health rows than the device had, or a wiped container (see
     lessons_native_install_wipes_container). When it does, `lifetime -
     stepsAtStart` is negative, max(0, ...) pins it at zero, and the egg is
     stalled forever with a dead progress bar and no explanation. Treat an anchor
     in the future as an anchor of now: the egg starts counting from here rather
     than never. `stalled` is reported so the UI can say so. */
  const stalled = (row.stepsAtStart || 0) > lifetime;
  const anchor = stalled ? lifetime : (row.stepsAtStart || 0);
  const walked = Math.max(0, lifetime - anchor);
  return { walked: Math.min(walked, goal), goal, ready: walked >= goal, stalled };
}
/* Repair the anchors on disk, so a stalled egg starts counting from the next step
   rather than being re-diagnosed on every render. Returns how many it fixed. */
export async function repairEggAnchors() {
  const lifetime = await lifetimeStepsSum();
  const eggs = (await inventory()).filter(r => r.kind === 'egg' && (r.stepsAtStart || 0) > lifetime);
  for (const e of eggs) await db.put('inv', { ...e, stepsAtStart: lifetime, reanchoredAt: Date.now() });
  return eggs.length;
}

// Odds a hatch comes out SHINY (an ultra-rare recolored variant). Stays
// obtainable even after you own every pet: a shiny roll on a dupe upgrades an
// owned pet to shiny instead of paying coins.
export const SHINY_CHANCE = 0.03;
/* WHICH SPECIES HAVE SHINY ART. The shiny render path builds
   assets/bh/C/shiny/<id>.png, and minting a shiny instance for a species with
   no file there hands the player a broken image on what may be the most
   premium item in the game (Bumbleseal is sold for 50,000 coins and, since
   Kennel palettes 2026-09-05, hatches at the same even share as C1-C5). A
   browser cannot read the folder, so this list
   is the folder's contents by hand, and pet-pool-audit pins the two to each
   other in both directions: an id here without art fails, and NEW SHINY ART
   SHIPPED WITHOUT EXTENDING THIS LIST FAILS TOO, which is what lets a future
   shiny C6 turn on by adding one file and one id. CX is absent on purpose:
   the amethyst art IS its look (the render guards say the same). */
export const SHINY_ART = ['C1', 'C2', 'C3', 'C4', 'C5'];

/* ONE PET POOL, TWO CALLERS, AND THAT IS THE POINT.
 *
 * hatchEgg and grantPet('random') each built this pool inline, and they drifted:
 * `!i.exclusive` was present in hatchEgg and MISSING in grantPet, so a random
 * grant could hand out the Day One Lizard, a pet that is supposed to be
 * unobtainable, permanently devaluing it for everyone who was actually given
 * one. The lesson is not "remember to copy the filter", it is that there must be
 * nothing to copy. Every rule about who can come out of a random pet roll lives
 * here, once, and both callers get it by construction.
 *
 * Two kinds of pet never take an even share:
 *   `exclusive`   never appears at all (awarded by name only).
 *   `hatchChance` appears at exactly that rate and is excluded from the even
 *                 split below.
 * Both are read off the catalogue rather than listed here, so the next pet
 * inherits the rule by declaring a field.
 *
 * KENNEL PALETTES, 2026-09-05. Tom: "roll Bumbleseal into things, her time as
 * shop-exclusive has passed." Bumbleseal (C6) used to carry `hatchChance: 0.01`
 * here -- sold for 50,000 coins, and an even share of the non-common pool
 * would have been 25%, which would have made the price meaningless. That field
 * is gone from her catalogue entry (data/boneheadz.js, scripts/build-cosmetics.py
 * SPECIALS): she is now an ordinary member of `rest` below, same even split as
 * C1-C5, still hatchable AND still separately purchasable in Gwart's Menagerie
 * (js/loot.js buyPetItem / PET_SHOP.pet, untouched -- two independent
 * acquisition paths, same as before). See tests/pet-pool-audit.mjs.
 *
 * `owned` is a Set of owned cosmetic ids: unowned species are preferred, and the
 * common pets are the consolation the pool falls back to when nothing better is
 * left. Returns the picked BH_ITEMS entry. Exported so a guard can drive it
 * directly over enough trials to measure a 1% rate; nothing else calls it. */
export function pickRandomPet(owned) {
  const pets = BH_ITEMS.filter(i => i.slot === 'C' && !i.exclusive);
  for (const shop of pets.filter(i => i.hatchChance)) if (rng() < shop.hatchChance) return shop;
  const rest = pets.filter(i => !i.hatchChance);
  const fresh = rest.filter(i => !owned.has(i.id));
  const poolAll = fresh.length ? fresh : rest;          // own them all -> a stacking dupe
  /* Kennel Phase A, section 2.1 (dupe pool fix): this used to filter to
     `i.rarity !== 'common'`, dropping C3 Catfish and C4 Beardie from every
     duplicate egg -- the comment that used to sit here admitted the rarity
     weighting it implied never existed. Uniform pick over poolAll instead. */
  return poolAll[Math.floor(rng() * poolAll.length)];
}

// Crack a ready egg: rolls a PET (slot C). A NEW species if you're missing any
// (commons drop out of the pool and the pick is UNIFORM over what survives;
// pickRandomPet's own doc is the authority, this line once claimed a rarity
// weighting that never existed), otherwise a DUPLICATE that stacks in your
// crew as breeding stock (v126: no more coins dead-end when you own them all).
export async function hatchEgg(invId) {
  const inv = await inventory();
  const row = inv.find(r => r.id === invId && r.kind === 'egg');
  if (!row) throw new Error('egg gone');
  const { ready } = eggProgress(row, await lifetimeStepsSum());
  if (!ready) return { ready: false };
  const owned = await ownedCosmeticIds();
  const priorInsts = await petInstances();
  /* The roll stays UNCONDITIONAL so the rng stream is identical to before; only
     the RESULT is gated. A species outside SHINY_ART must never mint shiny:
     the instance is persistent state, and state with no art is a broken image
     on every screen that honours it (see SHINY_ART above). */
  const shinyRoll = rng() < SHINY_CHANCE;
  const pick = pickRandomPet(owned);
  const isShiny = shinyRoll && SHINY_ART.includes(pick.id);
  /* In-flight non-Base eggs keep their stored colour, including on import from
     an old client. The Base-only grant policy never relabels existing rows.
     The morph rides the EGG, read here, never a new
     rng() call (rule 0.4: the rng stream in hatchEgg is unchanged). Shiny forces
     base (rule 0.1/1.2); a row from before this field existed, or an unknown
     value, reads as base too. */
  const morph = isShiny ? 'base' : (isMorph(row.morph) ? row.morph : 'base');
  /* THE EGG ROW IS THE RIGHT TO ONE PET, so taking it IS the claim. Reading it
     above and deleting it in a second transaction let two overlapping hatches of
     one egg both mint a pet; takeAndPay hands the row to exactly one caller.
     AND THE PET IS MINTED IN THAT SAME TRANSACTION (2026-09-06): the take used to
     come first and addPetInstance after it, so a death between them destroyed a
     fully walked egg and hatched nothing. The roll above is unconditional and
     unchanged, so the rng stream is identical to before. */
  const { pay } = await petInstancePay(pick.id, { shiny: isShiny, morph });
  if (!(await takeAndPay('inv', row.id, pay))) return { ready: false };
  // first hatch: nobody is out yet, so the heal in equippedPetIid equips her (R39-1)
  await equippedPetIid();
  /* DUPE IS ASKED OF THE (SPECIES, MORPH) PAIR, not of species alone (section
     2.5): a species can now hatch in more than one colour, so owning a base
     Bulldog already is not "another one" of a fresh Ember Bulldog. It still
     drives the same one line of copy ("ANOTHER ONE!" against the species+morph
     stamp) and the species-level "a 1% pet is not a duplicate while other
     species are still on the board" case from before is unaffected: a fresh
     species is never a (sp, morph) dupe either. */
  const dupe = priorInsts.some(x => x.sp === pick.id && (x.morph || 'base') === morph);
  return { ready: true, item: pick, shiny: isShiny, dupe, morph };
}

/* ============ v126: pet INSTANCES (duplicates stack) ============
 * Pets used to be one-per-species (binary ownership in `inv` + a per-species
 * `pets` record for shiny/hatchedAtSteps). To support duplicates + breeding
 * (v127 lineage) a pet is now an INSTANCE: { iid, sp, lineage, shiny,
 * hatchedAtSteps }. The `petInst` kv is the authoritative list once migrated.
 * `inv` 'cos' rows stay the "own >=1 of this species" flag (drives the wardrobe
 * + equip, which are species-keyed), kept in lockstep with the instance count.
 * The core transforms below are PURE so they can be unit-tested without a DB. */

// Build the initial instance list from the legacy per-species state (one lineage-0
// instance per owned species; carries its shiny + hatch anchor). Idempotent input.
export function migrateInstances(ownedPetIds, petsRec = {}) {
  return (ownedPetIds || []).map((sp, i) => ({
    iid: `m${i}-${sp}`,
    sp,
    lineage: 0,
    shiny: !!(petsRec[sp] && petsRec[sp].shiny),
    hatchedAtSteps: (petsRec[sp] && petsRec[sp].hatchedAtSteps) || 0,
  }));
}
// The instance the game FIGHTS with for a species: best lineage, then shiny.
export function bestInstance(instances, sp) {
  const of = (instances || []).filter(x => selectablePetInstance(x) && x.sp === sp);
  if (!of.length) return null;
  return of.slice().sort((a, b) => (b.lineage - a.lineage) || (Number(!!b.shiny) - Number(!!a.shiny)))[0];
}
export function speciesCount(instances, sp) { return (instances || []).filter(x => selectablePetInstance(x) && x.sp === sp).length; }
// Salvage/breed sacrifices the WORST copy first (lowest lineage, non-shiny first)
// so a player never loses their best or a shiny to a routine salvage.
export function removeWorstInstance(instances, sp) {
  const tagged = (instances || []).map((x, i) => ({ x, i })).filter(o => selectablePetInstance(o.x) && o.x.sp === sp);
  if (!tagged.length) return { instances: instances || [], removed: null };
  tagged.sort((a, b) => (a.x.lineage - b.x.lineage) || (Number(!!a.x.shiny) - Number(!!b.x.shiny)));
  const idx = tagged[0].i;
  return { instances: instances.filter((_, i) => i !== idx), removed: instances[idx] };
}
export function addInstance(instances, inst) { return [...(instances || []), inst]; }
export function removeInstance(instances, iid) {
  const idx = (instances || []).findIndex(x => selectablePetInstance(x) && x.iid === iid);
  if (idx < 0) return { instances: instances || [], removed: null };
  return { instances: instances.filter((_, i) => i !== idx), removed: instances[idx] };
}

/* ============ v128: BREEDING ============
 * Fuse two owned pets: BOTH are consumed, producing one offspring of a chosen
 * parent's species at lineage = max(parents) + 1 (a permanent stat bump + glow).
 * Costs Bone Dust (escalating with the target lineage) plus a steps cooldown so
 * it stays tied to walking. The KEEPER keeps its own look: a shiny fed in is lost
 * with it, which is what makes a shiny worth keeping. */
export const BREED_COOLDOWN_STEPS = 6000;
/* BREEDING NO LONGER COSTS DUST, and this is a DELETION rather than a rule.
   Tom, 2026-08-27, choosing option (a) of the dust plan's Q1.

   WHY IT HAD TO GO. Dust is meant to become a mainly paywalled resource, and
   dust bought breeding. Lineage is +5% per tier, permanently, so the moment dust
   is sold, breeding sells POWER and the cosmetic-only decision of 2026-08-07
   breaks. js/loot.js predicted this in writing before it was a problem.

   The alternatives were to make lineage cosmetic (guts a progression system and
   re-measures every Pit number downstream of petBattleStats) or to split earned
   dust from bought dust (two currencies that look identical and behave
   differently, which docs/IAP-SCOPING.md already warns reads as monetised in a
   way one does not). This one makes the rule true by removing code instead of
   adding a concept.

   BREED_COOLDOWN_STEPS was always the real constraint and it carries this alone
   now. If 6,000 steps turns out to be too generous, that is ONE constant, and
   tests/fight-sim.mjs can measure whether it needs raising rather than anyone
   guessing. The sink this removes was 60 to 180 dust, which the plan's 2.4
   showed was never load-bearing against a 7,593 lifetime cosmetic sink. */

/* The pet a breed consumed, for the reveal to show. Display-only: kept off the
   stored instance so nothing in the save grows a field it does not need. */
export function breedParents(fed) {
  return [{ sp: fed.sp, shiny: !!fed.shiny, lineage: fed.lineage || 0, morph: isMorph(fed.morph) ? fed.morph : 'base' }];
}

// Live status for the breeding UI (dust, cooldown, whether you have >=2 pets).
export async function breedStatus() {
  const [list, dust, lifetime, credit] = await Promise.all([
    petInstances(), boneDust(), lifetimeStepsSum(), kvGet('petBreedCredit', null),
  ]);
  const walkedSince = credit == null ? BREED_COOLDOWN_STEPS : Math.max(0, lifetime - credit);
  const cooldownLeft = Math.max(0, BREED_COOLDOWN_STEPS - walkedSince);
  return { total: list.length, dust, cooldownLeft, ready: cooldownLeft <= 0 };
}

// Breed two instances by iid. offspringSp must be one of the two parents' species.
export async function breedPets(keepIid, feedIid, quote = null) {
  if(!keepIid||!feedIid||keepIid===feedIid)return {ok:false,reason:'pick-two'};
  quote = quote && structuredClone(quote);
  await petInstances();await petLevelBank();await petTalentBank();
  return labTry(()=>payAtomic({snapshot:{keys:[...LAB_KEYS,'petBreedCredit'] ,stores:['health','inv']},decide:(s,rows)=>{
    const cur=s.petInst||[],keep0=cur.find(x=>selectablePetInstance(x)&&x.iid===keepIid),fed0=cur.find(x=>selectablePetInstance(x)&&x.iid===feedIid);
    if(!keep0||!fed0)labRefuse('gone');
    if (quote) {
      const live = petDestructionQuote(s, rows, feedIid, keepIid);
      if (!labEqual(quote, live)) return {result:{ok:false, reason:'stale-quote', quote:live}};
    }
    const lifetime=effectivePetSteps(rows.health),credit=s.petBreedCredit;
    if(credit!=null&&lifetime-credit<BREED_COOLDOWN_STEPS)return {result:{ok:false,reason:'cooldown',stepsLeft:BREED_COOLDOWN_STEPS-(lifetime-credit)}};
    const keep={...keep0,lineage:(keep0.lineage||0)+1};
    const next=cur.filter(x=>x?.iid!==feedIid).map(x=>x?.iid===keepIid?keep:x);
    const changes=petRemovalChanges(s,[feedIid],next,lifetime,keep);
    changes.petBreedCredit=lifetime;
    const extinct=speciesCount(next,fed0.sp)===0;
    if(extinct){changes.pets={...s.pets};delete changes.pets[fed0.sp];}
    return {kv:valuesPay(changes),dels:extinct?rows.inv.filter(r=>r.kind==='cos'&&r.itemId===fed0.sp).map(r=>({store:'inv',key:r.id})):[],
      result:{ok:true,offspring:{...keep,parents:breedParents(fed0),fedName:fed0.sp}}};
  }}));
}

let _iidSeq = 0;
function freshPetInstance(iid, sp, morph, hatchedAtSteps, shiny = false) {
  return {iid,sp,lineage:0,shiny,morph,hatchedAtSteps};
}
function newIid(sp) { _iidSeq += 1; return `p${Date.now().toString(36)}-${_iidSeq}-${sp}`; }

// Persist unsupported rows verbatim. Only this view may reach pet consumers.
function selectablePetInstance(row) {
  return !!row && typeof row.iid === 'string' && row.iid.trim().length > 0 && isKnownPet(row.sp);
}

// Read the instance list, migrating on first access (additive: never touches the
// legacy `pets`/`inv` state, so a rollback to a pre-v126 build still works).
/* PURE: re-id duplicate instance rows. Two rows sharing one iid make every
 * per-copy map (bond, level bank, names) silently pool onto the one key:
 * Tom's ducks all answered to NOODLE and shared one set of hearts
 * (2026-08-11). First occurrence keeps the original iid, later ones get a
 * deterministic `~k` suffix, so every device that syncs the same array heals
 * it the same way. Returns the SAME array reference when nothing needed
 * healing, so callers can cheaply tell "no write needed". */
export function healDupIids(list) {
  const seen = new Set();
  const reserved = new Set((list || []).filter(x => x && typeof x.iid === 'string').map(x => x.iid));
  let healed = false;
  const out = (list || []).map(x => {
    if (!selectablePetInstance(x)) return x;
    if (!x || !x.iid || !seen.has(x.iid)) { if (x && x.iid) seen.add(x.iid); return x; }
    healed = true;
    let k = 2, nid = `${x.iid}~${k}`;
    while (seen.has(nid) || reserved.has(nid)) nid = `${x.iid}~${++k}`;
    seen.add(nid);
    return { ...x, iid: nid, healedFrom: x.iid };
  });
  return healed ? out : list;
}

/* AN OWNED PET WITH NO COPY IN THE STABLE IS A GHOST, AND THAT IS EXACTLY WHAT
 * 50,000 COINS BOUGHT ON v421. Ownership lives in TWO places by design: an `inv`
 * row of kind 'cos' (what the wardrobe, the shop tile and the paper-doll slot
 * read) and a row in `petInst` (what the Stable, the Paddock, the battle pet and
 * every per-copy map read). `hatchEgg`, `breed` and `grantPet` write both.
 * `buyPetItem` wrote only the first, so Bumbleseal rendered perfectly on Today,
 * which reads the equipped SPECIES, and was absent from both screens that read
 * copies: the Paddock fell through to `lockedCardHtml`, which is why Tom saw a
 * silhouette carrying the Day One Lizard's copy, and the accessories he then
 * bought had no figure to hang on.
 *
 * Fixing the purchase does nothing for the account that already made it, so the
 * two states are reconciled on read as well. Rules that keep this from becoming
 * a faucet or a duplicator:
 *   - It can only ever fire on an INVALID state. `salvageInstance` deletes the
 *     cos row when the last copy of a species goes, so "owned cosmetic, zero
 *     instances" is unreachable by any legitimate path.
 *   - The iid is DERIVED (`r-<species>`), not minted from a clock and a counter,
 *     so two tabs racing this write the byte-identical array and one pet lands,
 *     not two (tally/CLAUDE.md, rewarded actions, rule 6: "twice" includes
 *     "at once").
 *   - Once per page load, so the hot path keeps its single kv read.
 *   - Anchored to NOW, like a fresh hatch. hatchedAtSteps 0 would hand a
 *     recovered pet the player's entire walking history as levels. */
let _petsReclaimed = false;
/* THE READ INSIDE THE TRANSACTION IS THE CLAIM (2026-09-04, claimed-row-audit):
   `list` is only ever a hint now, for the cheap precheck below and as the
   kvUpdate fallback while 'petInst' is still mid-migration. The actual
   "what's missing" decision is re-made against the LIVE row, so a concurrent
   salvagePet / salvageInstance kvUpdate on this same key can never be
   overwritten by a stale snapshot the way a plain kvSet here used to. */
async function reclaimOwnedPets(list) {
  if (_petsReclaimed) return list;
  _petsReclaimed = true;
  const owned = await ownedCosmeticIds();
  const wantSpecies = [...owned].filter(isKnownPet);
  if (!wantSpecies.some(id => !list.some(x => selectablePetInstance(x) && x.sp === id))) return list;   // cheap precheck; the real one is below
  const anchor = await lifetimeStepsSum();
  let added = [];
  const next = await kvUpdate('petInst', raw => {
    const cur = Array.isArray(raw) ? raw : list;
    const missing = wantSpecies.filter(id => !cur.some(x => selectablePetInstance(x) && x.sp === id));
    if (!missing.length) return undefined;
    added = missing;
    return [...cur, ...missing.map(sp => ({ iid: `r-${sp}`, sp, lineage: 0, shiny: false, hatchedAtSteps: anchor }))];
  }, list);
  if (!next) return list;
  import('./analytics.js').then(a => a.track('pet_reclaim', { sp: added.join(',') })).catch(() => {});
  return next;
}

export async function petInstances() {
  let list = await kvGet('petInst', null);
  if (Array.isArray(list)) {
    const healed = healDupIids(list);
    if (healed !== list) {
      /* THE HEAL ITSELF HAS TO BE THE CLAIM TOO (2026-09-04, claimed-row-audit):
         healDupIids is pure, so re-running it against the LIVE row inside one
         kvUpdate means a concurrent salvagePet / salvageInstance / reclaim on
         this same row can never be clobbered by this stale `list` snapshot the
         way the old unconditional kvSet was. `written` comes back undefined
         when the live row no longer carries the dup this read saw (already
         healed, or raced away some other way), and there is then nothing new
         to copy onto the side stores below. */
      const written = await payAtomic({snapshot:{keys:['petInst','petTaken','petLvlSteps','petBonds','petNick']},decide:s=>{
        const cur=Array.isArray(s.petInst)?s.petInst:list,h=healDupIids(cur);
        if(h===cur)return {result:undefined};
        const changes={petInst:h},taken=new Set(s.petTaken||[]);
        // Copy pooled investments while the roster heal still holds the lock.
        // A quote cannot observe new IIDs before their training and names exist.
        for(const key of ['petLvlSteps','petBonds','petNick'])if(s[key]){
          const map={...s[key]};
          for(const row of h){
            if(!selectablePetInstance(row)||!row.healedFrom||taken.has(row.iid))continue;
            if(map[row.healedFrom]!=null&&map[row.iid]==null)map[row.iid]=map[row.healedFrom];
          }
          changes[key]=map;
        }
        return {kv:valuesPay(changes),result:h};
      }});
      if (written) {
        const dupIids = written.filter(r => r && r.healedFrom).map(r => r.healedFrom);
        import('./analytics.js').then(a => a.track('pet_iid_heal', {
          n: dupIids.length,
          sample: dupIids.slice(0, 3),   // iid SHAPE is the diagnosis: m- rows point at the migration, p- rows at the mint
        })).catch(() => {});
        return (await reclaimOwnedPets(written)).filter(selectablePetInstance);
      }
      return (await reclaimOwnedPets(list)).filter(selectablePetInstance);
    }
    return (await reclaimOwnedPets(list)).filter(selectablePetInstance);
  }
  /* ONE-TIME MIGRATION, NOT A READ-MODIFY-WRITE (kept as a plain kvSet,
     claimed-row-audit ACCEPTED): it fires only while 'petInst' is not yet an
     array, and migrateInstances derives the array entirely from 'pets' +
     ownedCosmeticIds(), both independent of petInst's own history, so two
     callers racing this write byte-identical arrays. Every real mutator of
     'petInst' (salvagePet, salvageInstance, reclaimOwnedPets, breedPets,
     addPetInstance) calls petInstances() first, which is what runs this
     migration, so nothing can observe a still-missing row and try to kvUpdate
     it before this has run. */
  const owned = await ownedCosmeticIds();
  const ownedPets = [...owned].filter(isKnownPet);
  const petsRec = (await kvGet('pets', {})) || {};
  list = migrateInstances(ownedPets, petsRec);
  await kvSet('petInst', list);
  return list.filter(selectablePetInstance);
}

// Add one instance of a species (a fresh hatch/dupe). Keeps the `inv` ownership
// flag + legacy `pets` anchor in sync so species-keyed code keeps working.
// THE APPEND IS THE CLAIM (2026-09-04, claimed-row-audit): appending to the LIVE
// row inside one kvUpdate, rather than reading a list and writing it back whole,
// means a concurrent salvagePet / salvageInstance / breedPets kvUpdate on this
// same row can never be undone by this call's own stale read.
// ONE TRANSACTION (2026-09-06): the instance, the ownership flag, the legacy
// anchor and the level-bank seed used to be four writes, and hatchEgg needs all
// of them to ride inside the transaction that spends the egg. petInstancePay
// builds that payload once, for both callers, so the two cannot drift apart.
export async function addPetInstance(sp, opts = {}) {
  const { inst, pay } = await petInstancePay(sp, opts);
  await payAtomic(pay);
  return inst;
}
async function petInstancePay(sp, { shiny = false, morph = 'base', hatchedAtSteps = null, startLevelSteps = 0 } = {}) {
  if (!isKnownPet(sp)) throw new Error('unknown pet species');
  await petInstances();   // migrates / heals a legacy save first, same as every other writer
  await petLevelBank();   // migrates the bank to its iid-keyed shape first, so the seed below lands in it
  await petTalentBank();  // grandfather existing copies before minting a new one
  const anchor = hatchedAtSteps == null ? await lifetimeStepsSum() : hatchedAtSteps;
  // Shiny forces base (rule 0.1/1.2); an unknown morph value renders base too
  // (rule 0.6), so it is refused at the write rather than merely at render.
  const safeMorph = shiny ? 'base' : (isMorph(morph) ? morph : 'base');
  const inst = freshPetInstance(newIid(sp), sp, safeMorph, anchor, !!shiny);
  const owned = (await ownedCosmeticIds()).has(sp);
  const pay = {
    kv: {
      petInst: raw => addInstance(Array.isArray(raw) ? raw : [], inst),
      pets: rec => {
        const p = { ...(rec || {}) };
        if (!p[sp]) p[sp] = { hatchedAtSteps: anchor };
        if (shiny) p[sp] = { ...p[sp], shiny: true };
        return p;
      },
      // seed this individual's level bank (a fresh hatch starts at level 1)
      petLvlSteps: bank => ({ ...(bank || {}), [inst.iid]: Math.max(0, startLevelSteps || 0) }),
      ...(owned ? {} : { looks: cur => looksWith(cur, [sp]) }),
    },
    puts: owned ? [] : [{ store: 'inv', val: cosRow(sp, 'hatch') }],   // the ownership flag, same row grantCosmetic writes
  };
  return { inst, pay };
}

/* Laboratory service contract: quoteLaboratory([iid,iid]) returns a versioned
   quote or {ok:false,reason}. animateLaboratory(quote,{acknowledgedRisk}) returns
   {ok:true,receipt} after commit only. Risky quotes require the literal ANIMATE.
   Receipts are replayable even when their result was subsequently consumed.
   These services do not render, network, award XP, or grant an egg. */
const LAB_KEYS = [...Object.keys(LAB_DEFAULTS), 'petInst','petTaken','pets','looks','petLvlSteps','petLvlV',
  'petNick','petBonds','pettalents','petEquipped','equipped','petStepCredit','dayHighWater','dayWitnessOrd',
  'coins','coinsRev','coinsHistory'];
const labSnapshot = {keys:LAB_KEYS,stores:['health','inv']};
const valuesPay = values => Object.fromEntries(Object.entries(values).map(([k,v])=>[k,()=>v]));
const labTry = async run => {try{return await run();}catch(e){if(e?.refused)return {ok:false,reason:e.reason||e.message};throw e;}};
const labZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'local';
function labState(s) {
  validateLabSave(s);
  if(s.labV!==1)labRefuse('unsupported-laboratory');
  for(const key of ['labExperiments','labDaily','labIncubators','labIntents'])if(!s[key]||typeof s[key]!=='object'||Array.isArray(s[key]))labRefuse('invalid-laboratory');
  const daily=labDayProjection(s.labExperiments,s.labIncubators);
  if(!labEqual(daily,s.labDaily))labRefuse('invalid-daily');
  return daily;
}
export async function initLaboratory() {
  await petInstances();
  await petLevelBank();
  await petTalentBank();
  return payAtomic({snapshot:{keys:Object.keys(LAB_DEFAULTS)},decide:s=>{
    if(s.labV!==undefined&&s.labV!==1)labRefuse('unsupported-laboratory');
    return {kv:valuesPay(Object.fromEntries(Object.entries(LAB_DEFAULTS).filter(([k])=>s[k]===undefined))),result:true};
  }});
}
function labQuoteContext(s,rows,sp) {
  return {roster:s.petInst,petTaken:s.petTaken||[],pets:s.pets,looks:s.looks,
    petLvlSteps:s.petLvlSteps,petNick:s.petNick||{},petBonds:s.petBonds||{},pettalents:s.pettalents,
    petEquipped:s.petEquipped??null,equipped:s.equipped||{},petStepCredit:s.petStepCredit,
    ownership:rows.inv.filter(r=>r.kind==='cos'&&r.itemId===sp)};
}
function laboratoryQuote(s, rows, iids, opId) {
  const daily=labState(s),day=dateKey(),zone=labZone();
  const clock=dayDecision(day,s.dayHighWater,s.dayWitnessOrd,true);
  if(!clock.fresh)labRefuse(clock.reason);
  const capacity=labCapacity(s.labIncubators),occupancy=daily[day]||{slots:{},used:0};
  if(occupancy.used>=capacity)labRefuse('daily-cap');
  labPending(s, opId);
  const preview=labPreview(s.petInst,iids,s);
  if(!preview.ok)labRefuse(preview.reason);
  if(iids.some(id=>(s.petTaken||[]).includes(id)))labRefuse('invalid-pair');
  if(s.petLvlV!==2||s.pettalents?.__iidV!==2)labRefuse('needs-migration');
  const meter=effectivePetSteps(rows.health);
  if(!Number.isFinite(meter)||meter<0||s.petStepCredit!==meter)labRefuse('unsettled-training');
  const sp=preview.species;
  if(!s.pets?.[sp]||!s.looks?.includes(sp)||!rows.inv.some(r=>r.kind==='cos'&&r.itemId===sp))labRefuse('ownership-repair');
  if(s.petEquipped){const equippedInst=s.petInst.find(x=>x?.iid===s.petEquipped);if(!equippedInst||s.equipped?.C!==equippedInst.sp)labRefuse('equipment-repair');}
  // Pin investment, ownership, effective meter and species stock to the review.
  // Keeping unrelated roster rows in context also prevents a changed whole-grid
  // count from silently altering the branch consequences the player approved.
  const context=labQuoteContext(s,rows,sp);
  return {...preview,format:1,opId,rules:LAB_RULES,iids:[...iids],day,zone,meter,capacity,used:occupancy.used,occupancy,context};
}
export async function quoteLaboratory(iids) {
  return labTry(async()=>{
    await initLaboratory();
    await creditEquippedPetSteps();
    return payAtomic({snapshot:labSnapshot,decide:(s,rows)=>({result:laboratoryQuote(s,rows,iids,crypto.randomUUID())})});
  });
}
function validLabRequest(q) {
  if(!q||q.format!==1||q.rules!==LAB_RULES||typeof q.opId!=='string'||!q.opId||q.opId.length>200||!Array.isArray(q.iids)||q.iids.length!==2)labRefuse('invalid-request');
}
export async function saveLabIntent(quote, {acknowledgedRisk} = {}) {
  quote = structuredClone(quote);
  return labTry(()=>payAtomic({snapshot:labSnapshot,decide:(s,rows)=>{
    validLabRequest(quote);
    const existing=s.labExperiments?.[quote.opId];
    if(existing){labState(s);if(!labEqual(existing.request,quote))labRefuse('op-conflict');return {result:{ok:true,receipt:existing}};}
    if(!labEqual(quote,laboratoryQuote(s,rows,quote.iids,quote.opId)))labRefuse('stale-quote');
    if(quote.risk&&acknowledgedRisk!=='ANIMATE')labRefuse('acknowledgement-required');
    const prior=s.labIntents[quote.opId];
    if(prior&&!labEqual(prior.quote,quote))labRefuse('op-conflict');
    return {kv:valuesPay({labIntents:{...s.labIntents,[quote.opId]:prior||{format:1,quote,acknowledgedRisk,createdAt:Date.now()}}}),result:{ok:true}};
  }}));
}
export async function animateLaboratory(quote, {acknowledgedRisk, requireIntent = false} = {}) {
  quote = structuredClone(quote);
  return labTry(()=>payAtomic({snapshot:labSnapshot,decide:(s,rows)=>{
    validLabRequest(quote);
    const existing=s.labExperiments?.[quote.opId];
    if(existing){labState(s);if(!labEqual(existing.request,quote))labRefuse('op-conflict');return {result:{ok:true,receipt:existing}};}
    if(requireIntent&&!s.labIntents?.[quote.opId])labRefuse('stale-quote');
    if(quote.day!==dateKey()||quote.zone!==labZone())labRefuse('stale-quote');
    const live=laboratoryQuote(s,rows,quote.iids,quote.opId);
    if(!labEqual(live,quote))labRefuse('stale-quote');
    if(quote.risk&&acknowledgedRisk!=='ANIMATE')labRefuse('acknowledgement-required');
    const intent=s.labIntents[quote.opId];if(intent&&!labEqual(intent.quote,quote))labRefuse('op-conflict');
    const morph=resolveLabOutcome(live.distribution,()=>crypto.getRandomValues(new Uint32Array(1))[0]/2**32);
    const taken=new Set(s.petTaken||[]), usedIds=new Set([...s.petInst.map(x=>x?.iid),...taken]);
    let iid;do{iid=newIid(live.species);}while(usedIds.has(iid));
    const result=freshPetInstance(iid,live.species,morph,live.meter);
    const slot=Array.from({length:live.capacity},(_,i)=>i+1).find(i=>!live.occupancy.slots[i]);
    const equippedBefore=s.petEquipped??null,equippedAfter=live.iids.includes(equippedBefore)?iid:equippedBefore;
    const receipt={format:1,opId:quote.opId,rules:LAB_RULES,day:live.day,slot,committedAt:Date.now(),zone:live.zone,
      recipe:live.recipe,species:live.species,inputs:live.inputs,distribution:live.distribution,protection:live.protection,
      beforeCells:live.beforeCells,branches:live.branches,result,equippedBefore,equippedAfter,request:quote};
    const cleaned=key=>Object.fromEntries(Object.entries(s[key]||{}).filter(([id])=>!live.iids.includes(id)));
    const experiments={...s.labExperiments,[quote.opId]:receipt},intents={...s.labIntents};delete intents[quote.opId];
    const changes={petInst:[...s.petInst.filter(x=>!live.iids.includes(x?.iid)),result],petTaken:[...new Set([...taken,...live.iids])],
      petLvlSteps:{...cleaned('petLvlSteps'),[iid]:0},petNick:cleaned('petNick'),petBonds:cleaned('petBonds'),pettalents:cleaned('pettalents'),
      labExperiments:experiments,labDaily:labDayProjection(experiments,s.labIncubators),labIntents:intents,
      labUi:{...s.labUi,introRead:true,revision:s.labUi.revision+1},
      ...dayDecision(live.day,s.dayHighWater,s.dayWitnessOrd,true).writes};
    if(equippedBefore!==equippedAfter){changes.petEquipped=equippedAfter;changes.equipped={...s.equipped,C:live.species};}
    return {kv:valuesPay(changes),result:{ok:true,receipt}};
  }}));
}
export async function buyLabIncubator(request) {
  return labTry(async()=>{
    await initLaboratory();
    return payAtomic({snapshot:labSnapshot,decide:s=>{
      if(!request||request.format!==1||typeof request.opId!=='string'||!request.opId||request.opId.length>200||![2,3].includes(request.slot)||request.price!==LAB_PRICES[request.slot])labRefuse('invalid-purchase');
      labState(s);
      const {slot,opId,price}=request,prior=s.labIncubators[slot];
      if(prior){if(prior.opId!==opId)labRefuse('already-owned');return {result:{ok:true,receipt:prior}};}
      labPending(s, opId);
      if(request.snapshotToken!==undefined){
        if(!labEqual(request.snapshotToken,labPurchaseToken(s)))labRefuse('stale-quote');
        if(!s.labIntents[opId]||!labEqual(s.labIntents[opId].quote,request))labRefuse('stale-quote');
        const clock=dayDecision(dateKey(),s.dayHighWater,s.dayWitnessOrd,true);
        if(!clock.fresh)labRefuse(clock.reason);
      }
      if(Object.values(s.labIncubators).some(x=>x.opId===opId))labRefuse('op-conflict');
      if(!Object.keys(s.labExperiments).length)labRefuse('experiment-required');
      if(slot===3&&!s.labIncubators['2'])labRefuse('prerequisite');
      if(typeof s.coins!=='number'||!Number.isFinite(s.coins)||s.coins<price)labRefuse('insufficient-coins');
      if(s.coinsRev!==undefined&&(typeof s.coinsRev!=='number'||!Number.isFinite(s.coinsRev)||s.coinsRev<0))labRefuse('invalid-coins');
      const currencyReceipt=`lab-incubator:${opId}:coins`,receipt={format:1,slot,opId,price,purchasedAt:Date.now(),currencyReceipt};
      const intents={...s.labIntents};delete intents[opId];
      return {kv:valuesPay({labIntents:intents,coins:s.coins-price,coinsRev:(s.coinsRev||0)+Math.max(1,price),labIncubators:{...s.labIncubators,[slot]:receipt}}),currencyReceipts:{coins:currencyReceipt},result:{ok:true,receipt}};
    }});
  });
}
export async function laboratoryResults() {return Object.values(await kvGet('labExperiments',{}));}
export async function acknowledgeLabResult(opId) {
  return payAtomic({snapshot:{keys:['labExperiments','labSeen']},decide:s=>{
    if(!s.labExperiments?.[opId])labRefuse('unknown-experiment');
    return {kv:valuesPay({labSeen:[...new Set([...(s.labSeen||[]),opId])]}),result:true};
  }});
}

/* Versioned UI adapter. Durable engine requests stay separate from display
   annotations so exact live equality still protects the reviewed operation. */
function labPending(s, ownId) {
  if (Object.keys(s.labIntents || {}).some(id => id !== ownId)) labRefuse('unknown');
}
function labPurchaseToken(s) {
  return { format: 1, day: dateKey(), zone: labZone(), coins: s.coins ?? 0,
    coinsRev: s.coinsRev ?? 0, incubators: s.labIncubators,
    experiments: s.labExperiments, daily: s.labDaily };
}
function labUiReason(reason) {
  return ({'daily-cap':'cap-reached', backwards:'clock-backwards', unwitnessed:'unwitnessed-day',
    'invalid-pair':'ineligible', 'unsettled-training':'stale-quote',
    'laboratory-restore-conflict':'restore-conflict', 'conflicting-experiments':'restore-conflict',
    'op-conflict':'restore-conflict'})[reason] || reason;
}
const labReply = result => result?.ok === false ? {...result, reason:labUiReason(result.reason)} : result;
const labCellKey = p => /^C[1-6]$/.test(p?.sp) && labMorph(p.morph)
  ? `${p.sp}|${p.shiny ? 'base' : labMorph(p.morph)}` : null;
const labPlain = p => !p.bankedSteps && !p.nickname && !p.lineage && !p.bond && !p.talents.length && !p.equipped;
const labTalentNames = p => p.talents.map(id => Object.values(PET_TREES).flatMap(t=>t.flatMap(r=>r.opts)).find(n=>n.id===id)?.name || id);
function labNeededFor(sp, morph, roster, s) {
  const owned = new Set(roster.map(labCellKey).filter(Boolean));
  const has = m => owned.has(`${sp}|${m}`);
  const count = m => roster.filter(p=>p?.sp===sp && labMorph(p.morph)===m && labInput(p,s)).length;
  const v = !has('midnight');
  const u = !has('toxic') || !has('rose') || (v && (count('toxic')<2 || count('rose')<2));
  if (['ember','frost'].includes(morph) && u && count(morph)<2) return 'Ember + Frost';
  if (['toxic','rose'].includes(morph) && v && count(morph)<2) return 'Toxic + Rose';
  return undefined;
}
function labDisplayMetadata(row, s) {
  const id=row?.iid, steps=s.petLvlSteps?.[id]??0, lineage=row?.lineage??0, bond=s.petBonds?.[id]??0;
  const number=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0;
  const nickname=s.petNick?.[id]??'', talents=s.pettalents?.[id]??[];
  return {bankedSteps:number(steps)?steps:'unknown',level:number(steps)?petLevel(steps):'unknown',
    lineage:number(lineage)&&Number.isInteger(lineage)?lineage:'unknown',bond:number(bond)&&bond<=5?bond:'unknown',
    nickname:typeof nickname==='string'?nickname:'unknown',talents:Array.isArray(talents)&&talents.every(t=>typeof t==='string')?talents:['unknown']};
}
function labPetRows(roster, s) {
  const ids = roster.map(p=>p?.iid), unique = new Set(ids).size === ids.length;
  const counts = new Map();
  for (const p of roster) { const key=labCellKey(p); if(key) counts.set(key,(counts.get(key)||0)+1); }
  const keepers = new Set();
  for (const key of counts.keys()) {
    const candidates=roster.filter(p=>labCellKey(p)===key);
    const keeper=candidates.find(p=>{const input=labInput(p,s);return !input||!labPlain(input);}) || candidates[0];
    keepers.add(keeper);
  }
  return roster.map(row => {
    const input=labInput(row,s), key=labCellKey(row);
    const eligible=!!input && unique && !(s.petTaken||[]).includes(row?.iid);
    const reason=eligible ? '' : row?.shiny ? 'Shiny pets cannot be used here.' : row?.sp==='CX' ? 'The Day One Lizard cannot be used here.'
      : !/^C[1-6]$/.test(row?.sp) ? 'This species is not supported.' : !labMorph(row?.morph) ? 'This saved colour is not supported. Keep this pet and your backup for recovery; it cannot supply a recipe.'
      : !unique ? 'Duplicate pet identities require repair and a fresh review.' : 'This saved pet has invalid or unavailable metadata.';
    // Invalid rows stay visible but never receive eligible status or permissive values.
    const p=input || {iid:row?.iid,sp:row?.sp,morph:labMorph(row?.morph)||String(row?.morph),shiny:!!row?.shiny,
      ...labDisplayMetadata(row,s),equipped:s.petEquipped===row?.iid};
    return {...p, talents:labTalentNames(p), eligible, reason,
      safeSurplus:eligible && labPlain(p) && !keepers.has(row), lastCopy:counts.get(key)===1,
      neededFor:eligible ? labNeededFor(p.sp,p.morph,roster,s) : undefined};
  });
}
function labPresentQuote(q) {
  const roster=q.context.roster, s=q.context;
  const pets=labPetRows(roster,s);
  const survivors=roster.filter(p=>!q.iids.includes(p?.iid));
  return {...q, request:q, inputs:q.iids.map(id=>pets.find(p=>p.iid===id)),
    salvageDust:q.inputs.reduce((n,p)=>n+petDustValue(BH_BY_ID[p.sp])+p.lineage*8,0),
    branches:q.branches.map(b=>({...b,
      counts:[...new Set([...q.inputs.map(labCellKey),`${q.species}|${b.morph}`])].map(cell=>({cell,
        before:roster.filter(p=>labCellKey(p)===cell).length,
        after:survivors.filter(p=>labCellKey(p)===cell).length+Number(cell===`${q.species}|${b.morph}`)})),
      neededFor:labNeededFor(q.species,b.morph,roster,s)}))};
}
function labReceipt(r, s) {
  validLabRequest(r?.request);
  for(const key of ['opId','rules','recipe','species','inputs','distribution','protection','beforeCells','branches']) {
    if(!labEqual(r[key],r.request[key]))labRefuse('invalid-experiment');
  }
  const annotations=labPresentQuote(r.request);
  const clock=dayDecision(dateKey(),s.dayHighWater,s.dayWitnessOrd,true);
  return {...r, inputs:annotations.inputs, branches:annotations.branches,
    resultPresent:(s.petInst||[]).some(p=>p?.iid===r.result.iid),
    remaining:clock.fresh ? Math.max(0,labCapacity(s.labIncubators)-(s.labDaily[dateKey()]?.used||0)) : 0};
}
// Recovery shares the KV transaction lock with dispatch. Removing an adapter
// intent fences a delayed dispatch (requireIntent), so readback cannot race a
// subsequent spend of the same request. No recovery path draws or retries.
function labRecover(s, rows) {
  const intents={...s.labIntents}, recoveredOpIds=Object.keys(s.labExperiments);
  for(const [id,intent] of Object.entries(intents)) {
    const q=intent.quote;
    const receipt=q.kind==='purchase' ? Object.values(s.labIncubators).find(r=>r.opId===id) : s.labExperiments[id];
    let unchanged=false;
    if(!receipt) {
      if(q.kind==='purchase') {
        const token=labPurchaseToken(s);
        unchanged=labEqual(q.snapshotToken,{...token,day:q.snapshotToken?.day,zone:q.snapshotToken?.zone});
      }
      else {
        try {
          validLabRequest(q);
          // Health sync can change the meter, bank and credit without dispatch.
          // Receipts, roster and tombstones still prove whether inputs survived.
          // Clearing under this lock fences a delayed requireIntent dispatch.
          const withoutTraining = ({petLvlSteps, petStepCredit, ...context}) => context;
          unchanged=labEqual(withoutTraining(q.context),withoutTraining(labQuoteContext(s,rows,q.species)))
            && q.capacity===labCapacity(s.labIncubators) && labEqual(q.occupancy,s.labDaily[q.day]||{slots:{},used:0});
        }
        catch(e) { if(!e?.refused) throw e; }
      }
    }
    if(receipt && (q.kind==='purchase' ? receipt.slot!==q.slot||receipt.price!==q.price : !labEqual(receipt.request,q)))labRefuse('laboratory-restore-conflict');
    if(receipt || unchanged) { delete intents[id]; recoveredOpIds.push(id); }
  }
  recoveredOpIds.push(...Object.values(s.labIncubators).map(r=>r.opId));
  return {intents,recoveredOpIds:[...new Set(recoveredOpIds)]};
}
function labPresentation(s, rows, recoveredOpIds=[]) {
  const daily=labState(s), day=dateKey(), clock=dayDecision(day,s.dayHighWater,s.dayWitnessOrd,true);
  const capacity=labCapacity(s.labIncubators), used=daily[day]?.used||0;
  const roster=s.petInst||[], pets=labPetRows(roster,s);
  const ownedCells=[...new Set(roster.map(labCellKey).filter(Boolean))].sort();
  const species={}; let hasEligiblePair=false, hasSafePair=false, hasSafeUsefulPair=false;
  for(let i=1;i<=6;i++) {
    const sp=`C${i}`, local=pets.filter(p=>p.sp===sp), count=ownedCells.filter(k=>k.startsWith(`${sp}|`)).length;
    const detail={count,complete:count===MORPHS.length,hasEligiblePair:false,
      safeCounts:Object.fromEntries(MORPHS.map(m=>[m,local.filter(p=>p.morph===m&&p.safeSurplus).length])),recipes:{}};
    for(const [recipe,morphs] of [['base-base',['base','base']],['ember-frost',['ember','frost']],['toxic-rose',['toxic','rose']]]) {
      const odds=labDistribution(roster,recipe,sp,s);
      const choose=plain=>{const pool=local.filter(p=>p.eligible&&(!plain||labPlain(p)));const a=pool.find(p=>p.morph===morphs[0]);const b=pool.find(p=>p!==a&&p.morph===morphs[1]);return a&&b?[a.iid,b.iid]:null;};
      const pair=choose(false), safe=choose(true), preview=safe&&labPreview(roster,safe,s);
      if(pair) {detail.hasEligiblePair=true;hasEligiblePair=true;}
      if(preview?.ok&&!preview.risk) {
        hasSafePair=true;
        if(ownedCells.length<36 && preview.branches.some(b=>b.gained.length||labNeededFor(sp,b.morph,roster,s))) hasSafeUsefulPair=true;
      }
      detail.recipes[recipe]={...odds,explanation:recipe==='toxic-rose' ? 'Midnight is guaranteed.' : 'Always 50/50. Each coin flip can repeat a colour you already have.',
        shortage:pair ? '' : 'Hatch eggs or build the matching ingredients to supply this pair.'};
    }
    species[sp]=detail;
  }
  const meter=effectivePetSteps(rows.health);
  const prepared=s.petLvlV===2&&s.pettalents?.__iidV===2&&s.petStepCredit===meter;
  const status=Object.keys(s.labIntents).length ? 'unknown' : !clock.fresh ? labUiReason(clock.reason) : !prepared ? 'unavailable' : 'ready';
  return {status,token:labPurchaseToken(s),used,capacity,remaining:status==='ready'?capacity-used:0,
    resetTime:'00:00',zone:labZone(),coins:s.coins??0,incubators:s.labIncubators,ownedCells,
    collectionCount:ownedCells.length,hasExperiment:Object.keys(s.labExperiments).length>0,
    priorDay:rows.xp.some(r=>/^(dayclose|dayeffort)-\d{4}-\d{2}-\d{2}$/.test(r.key)&&r.key.slice(-10)<day),
    hasEligiblePair,hasSafePair,hasSafeUsefulPair,pets,species,
    eggs:rows.inv.filter(r=>r.kind==='egg').map(e=>{const p=eggProgress(e,meter);return {steps:p.walked,goal:p.goal,ready:p.ready};}),
    ui:s.labUi,unseen:Object.values(s.labExperiments).filter(r=>!s.labSeen.includes(r.opId)).sort((a,b)=>a.committedAt-b.committedAt||a.opId.localeCompare(b.opId)).map(r=>labReceipt(r,s)),recoveredOpIds};
}
async function labRead(pre={}, recover=false) {
  // Today provides these arrays. Do not rescan them or run migrations on its
  // presentation-only path. A normal room read prepares before this snapshot.
  const stores=['health','inv','log','xp'].filter(k=>!Array.isArray(pre[k]));
  return payAtomic({snapshot:{keys:LAB_KEYS,stores},decide:(raw,readRows)=>{
    const s={...raw},rows={...readRows};
    for(const k of ['health','inv','log','xp'])if(Array.isArray(pre[k]))rows[k]=pre[k];
    if(Object.keys(LAB_DEFAULTS).every(k=>s[k]===undefined))Object.assign(s,structuredClone(LAB_DEFAULTS));
    labState(s);
    if(pre.presentationOnly&&s.petLvlV===2) {
      const meter=effectivePetSteps(rows.health),delta=Math.max(0,meter-(s.petStepCredit??meter));
      if(delta>0&&s.petEquipped)s.petLvlSteps=creditSteps(s.petLvlSteps,s.petEquipped,delta);
      s.petStepCredit=meter;
    }
    const recovery=recover ? labRecover(s,rows) : {intents:s.labIntents,recoveredOpIds:Object.keys(s.labExperiments)};
    const changed=!labEqual(s.labIntents,recovery.intents);s.labIntents=recovery.intents;
    return {kv:changed?valuesPay({labIntents:s.labIntents}):{},result:labPresentation(s,rows,recovery.recoveredOpIds)};
  }});
}
async function labReleaseRefused(opId, request) {
  return payAtomic({snapshot:labSnapshot,decide:s=>{
    labState(s);
    if(!labEqual(s.labIntents[opId]?.quote,request))return {result:false};
    const intents={...s.labIntents};delete intents[opId];
    return {kv:valuesPay({labIntents:intents}),result:true};
  }});
}
async function labReadReceipt(opId) {
  return payAtomic({snapshot:labSnapshot,decide:s=>{labState(s);return {result:labReceipt(s.labExperiments[opId],s)};}});
}
export const laboratory = Object.freeze({
  version:1,
  async snapshot(pre={}) {
    if(pre.presentationOnly) return labRead(pre);
    // Establish intent outcomes before preparation can change the quoted bank.
    const recovered=Object.keys(await kvGet('labIntents',{})).length ? (await labRead({},true)).recoveredOpIds : [];
    await initLaboratory(); await creditEquippedPetSteps();
    const snapshot=await labRead(pre,true);
    snapshot.recoveredOpIds=[...new Set([...recovered,...snapshot.recoveredOpIds])];
    return snapshot;
  },
  async quote({iids}={}) {
    const q=await quoteLaboratory(iids);
    return q.ok ? {ok:true,quote:labPresentQuote(q)} : labReply(q);
  },
  async animate({quote,acknowledgedRisk}={}) {
    const q=quote?.request;
    if(!q || !labEqual(quote,labPresentQuote(q)))return {ok:false,reason:'stale-quote'};
    if(acknowledgedRisk!==(q.risk?'ANIMATE':'reviewed'))return {ok:false,reason:'ineligible'};
    const intent=await saveLabIntent(q,{acknowledgedRisk});
    if(!intent.ok)return labReply(intent);
    if(intent.receipt)return {ok:true,receipt:await labReadReceipt(q.opId)};
    try {
      const result=await animateLaboratory(q,{acknowledgedRisk,requireIntent:true});
      if(result.ok)return {ok:true,receipt:await labReadReceipt(q.opId)};
      await labReleaseRefused(q.opId,q);
      return labReply(result);
    } catch {
      try {const snapshot=await labRead({},true);
        if(snapshot.recoveredOpIds.includes(q.opId)) {
          const saved=await kvGet('labExperiments',{});
          if(saved[q.opId])return {ok:true,receipt:await labReadReceipt(q.opId)};
          return {ok:false,reason:'confirmed-abort'};
        }
      } catch { /* Unreadable state retains the durable intent. */ }
      return {ok:false,reason:'unknown'};
    }
  },
  async purchase({slot,opId,snapshotToken}={}) {
    const request={format:1,rules:LAB_RULES,kind:'purchase',slot,opId,price:LAB_PRICES[slot],snapshotToken};
    const intent=await labTry(()=>payAtomic({snapshot:labSnapshot,decide:s=>{
      labState(s);
      if(![2,3].includes(slot)||typeof opId!=='string'||!opId||opId.length>200||!snapshotToken)labRefuse('invalid-purchase');
      const prior=s.labIncubators[slot];
      if(prior?.opId===opId)return {result:{ok:true,receipt:prior}};
      labPending(s,opId);
      if(!labEqual(snapshotToken,labPurchaseToken(s)))labRefuse('stale-quote');
      if(s.labIntents[opId]&&!labEqual(s.labIntents[opId].quote,request))labRefuse('op-conflict');
      if(!Object.keys(s.labExperiments).length)labRefuse('experiment-required');
      if(slot===3&&!s.labIncubators['2'])labRefuse('prerequisite');
      if(s.coins<request.price)labRefuse('insufficient-coins');
      const clock=dayDecision(dateKey(),s.dayHighWater,s.dayWitnessOrd,true);if(!clock.fresh)labRefuse(clock.reason);
      return {kv:valuesPay({labIntents:{...s.labIntents,[opId]:{format:1,quote:request,acknowledgedRisk:'reviewed',createdAt:Date.now()}}}),result:{ok:true}};
    }}));
    if(!intent.ok||intent.receipt)return labReply(intent);
    try {const result=await buyLabIncubator(request);if(!result.ok)await labReleaseRefused(opId,request);return labReply(result);}
    catch {try {const s=await labRead({},true);if(Object.values(s.incubators).some(r=>r.opId===opId))return {ok:true};
      if(s.recoveredOpIds.includes(opId))return {ok:false,reason:'confirmed-abort'};} catch { /* Keep pending. */ }
      return {ok:false,reason:'unknown'};}
  },
  async acknowledge(opId) { return labTry(async()=>{await acknowledgeLabResult(opId);return {ok:true};}); },
  async setUi(patch) {
    await initLaboratory();
    return labTry(()=>payAtomic({snapshot:{keys:LAB_KEYS},decide:s=>{
      labState(s);
      if(!patch||typeof patch!=='object'||Array.isArray(patch)||Object.entries(patch).some(([k,v])=>!['introRead','todayHidden'].includes(k)||typeof v!=='boolean'))labRefuse('invalid-ui');
      if(!Number.isSafeInteger(s.labUi.revision+1))labRefuse('invalid-ui');
      const ui={...s.labUi,...patch,revision:s.labUi.revision+1};
      return {kv:valuesPay({labUi:ui}),result:{ok:true,ui}};
    }}));
  }
});

/* ---------- Paddock bonds (kv 'petBonds' = {iid: 0..5}) ----------
 * Per-copy affection for The Paddock. Same shape as petLvlSteps: its own kv
 * map keyed by instance id, ADDITIVE, never a new field on the instance rows,
 * so pre-Paddock builds and rollbacks read the instances untouched. Pet/Feed
 * are free and unlimited by design (no dust, no coins, no XP), so the
 * rewarded-actions SOP does not bite here; the moment any bond level PAYS
 * anything, that payout needs the full SOP treatment. */
export const BOND_MAX = 5;
// pure: the only legal transition is +1, clamped into [0, BOND_MAX]
export function bondAfter(cur) { return Math.min(BOND_MAX, Math.max(0, cur | 0) + 1); }
export async function petBonds() { return (await kvGet('petBonds', {})) || {}; }
// Serialize identity checks with the map update so a consumed IID cannot
// acquire metadata again from an edit started before Animate.
async function editLivePet(iid, keys, edit) {
  await petInstances();
  return payAtomic({snapshot:{keys:['petInst','petTaken',...keys]},decide:s=>{
    const inst=(s.petInst||[]).find(x=>selectablePetInstance(x)&&x.iid===iid&&!(s.petTaken||[]).includes(iid));
    return inst ? edit(s,inst) : {result:{ok:false,reason:'unknown'}};
  }});
}
export async function bondUp(iid) {
  return editLivePet(iid,['petBonds'],s=>{
    const before=s.petBonds?.[iid]||0,after=bondAfter(before);
    return {kv:valuesPay({petBonds:{...s.petBonds,[iid]:after}}),result:{ok:true,bond:after,maxed:after===BOND_MAX,changed:after!==before}};
  });
}
async function clearBond(iid) {
  await kvUpdate('petBonds', raw=>{if(!raw||!Object.hasOwn(raw,iid))return;const next={...raw};delete next[iid];return next;});
}

/* ---------- Private pet nicknames (kv 'petNick' = {iid: 'GRAVY'}) ----------
 * Tom, 2026-08-19: "can we add the ability to give your pet a nickname only you
 * can see?" ONLY YOU is the feature, so the storage shape is the guard.
 *
 * Its OWN kv map keyed by instance id, exactly like petBonds and petLvlSteps.
 * Never a new field on the instance rows and never a new key in kv 'equipped'.
 * That is not tidiness, it is the whole reason this cannot leak. Traced
 * 2026-08-19, the two payloads that carry pet data to other players:
 *   - socialSnapshot() in js/app.js picks `pet:` off petMeta by name (id, level,
 *     shiny, lineage), so a new field on the instance row would not leak either.
 *   - `outfit: eq` in the same snapshot is `{ ...base, ...saved }` over kv
 *     'equipped' (see equipped() below), uploaded verbatim to friends, the
 *     leaderboard, the step race and any spire rival. ANY key written into that
 *     object ships itself to strangers with no code change. A separate map is
 *     the only shape that is safe by construction rather than by review.
 * The nickname does ride the encrypted backup, because exportAll() dumps every
 * kv row. That is wanted: it is the player's own save, sealed with a key the
 * server never receives, so the nickname follows them to a new device and
 * nobody else can read it.
 *
 * Precedent for the whole idea: setFriendAlias in js/social.js, the player's
 * private name for a friend, which is also stored locally and never uploaded.
 * Guarded by tests/nickname-private-audit.mjs. */
export const NICK_MAX = 24;
/* PURE. null when `s` is a legal nickname, otherwise the sentence the player is
 * shown. It REFUSES rather than coercing: the v387 sweep found eleven numeric
 * surfaces quietly storing a coerced value, and a silently truncated name is
 * that same defect in a different type. setFriendAlias slices to 24; this does
 * not, it says so.
 * LENGTH is counted in CODE POINTS, not UTF-16 units, so an emoji costs what it
 * looks like it costs and no truncation can ever split a surrogate pair into
 * mojibake. 24 to match the friend-alias cap, the app's existing answer to
 * "how long is a private nickname".
 * EMOJI are allowed, including ZWJ sequences, so 👨‍👩‍👧 stays one picture.
 * RIGHT-TO-LEFT TEXT is allowed and rendered with dir="auto" at every call
 * site. Bidi CONTROL characters are refused: an unpaired U+202E reorders
 * everything drawn after it, so it is a spoofing tool, not a language. */
export function nickProblem(s) {
  const t = String(s ?? '').trim();
  if (!t) return null;                                    // empty = clear, always legal
  const n = [...t].length;
  if (n > NICK_MAX) return `That nickname is ${n} characters. Keep it to ${NICK_MAX} or fewer.`;
  if (/[\p{Cc}\u200E\u200F\u202A-\u202E\u2066-\u2069]/u.test(t)) {
    return 'That nickname has hidden control characters in it. Letters, numbers, spaces and emoji are fine.';
  }
  return null;
}
export function cleanNick(s) { return String(s ?? '').trim().replace(/\s+/g, ' '); }
export async function petNicks() { return (await kvGet('petNick', {})) || {}; }
export async function setPetNick(iid, nick) {
  const problem=nickProblem(nick);
  if(problem)return {ok:false,reason:'invalid',message:problem};
  return editLivePet(iid,['petNick'],s=>{
    const map={...s.petNick},clean=cleanNick(nick);
    if(clean)map[iid]=clean;else delete map[iid];
    return {kv:valuesPay({petNick:map}),result:{ok:true,nick:clean}};
  });
}
async function clearNick(iid) {
  await kvUpdate('petNick',raw=>{if(!raw||!Object.hasOwn(raw,iid))return;const next={...raw};delete next[iid];return next;});
}

// Destroy ONE specific pet instance for Bone Dust (the Stable's "Destroy"). Drops
// ownership + clears the legacy anchor when its species' last copy is gone, and
// re-points the equipped pet if you just scrapped the one you had out.
// Cleanup and equipment replacement share the consuming transaction. No late
// bank/name write can resurrect a consumed input or erase a fresh result bank.
function petRemovalChanges(s, iids, next, lifetime, replacement = null) {
  const changes={petInst:next,petTaken:[...new Set([...(s.petTaken||[]),...iids])],petStepCredit:lifetime};
  for(const key of ['petLvlSteps','petNick','petBonds','pettalents'])changes[key]=Object.fromEntries(Object.entries(s[key]||{}).filter(([id])=>!iids.includes(id)));
  const old=(s.petInst||[]).find(x=>x?.iid===s.petEquipped),delta=Math.max(0,lifetime-(s.petStepCredit??lifetime));
  if(old&&!iids.includes(old.iid)&&delta>0)changes.petLvlSteps=creditSteps(changes.petLvlSteps,old.iid,delta);
  if(iids.includes(s.petEquipped)){
    const repl=replacement||bestInstance(next,old?.sp)||next.find(selectablePetInstance)||null;
    changes.petEquipped=repl?.iid||null;changes.equipped={...s.equipped,C:repl?.sp||null};
  }
  return changes;
}
// Quote only what this removal will cost. Include health steps waiting to be
// banked: removal settles that meter too, even before the next health credit.
export function petLastColourLoss(inst, roster) {
  const cell = labCellKey(inst);
  return !!cell && roster.filter(p => labCellKey(p) === cell).length === 1;
}
function petDestructionQuote(s, rows, iid, keepIid = null) {
  const roster = s.petInst || [], inst = roster.find(p => selectablePetInstance(p) && p.iid === iid);
  if (!inst) labRefuse('gone');
  const equipped = s.petEquipped === iid;
  const meter = effectivePetSteps(rows.health);
  const bankedSteps = (s.petLvlSteps?.[iid] || 0) + (equipped ? Math.max(0, meter - (s.petStepCredit ?? meter)) : 0);
  const next = roster.filter(p => p.iid !== iid);
  const replacement = equipped ? (next.find(p => p.iid === keepIid) || bestInstance(next, inst.sp) || next.find(selectablePetInstance)) : null;
  return {iid, keepIid, inst, bankedSteps, nickname:s.petNick?.[iid] || '', bond:s.petBonds?.[iid] || 0,
    talents:s.pettalents?.[iid] || [], equipped,
    replacement:replacement ? {iid:replacement.iid, name:s.petNick?.[replacement.iid] || petInstanceName(replacement)} : null,
    lastColour:roster.filter(p => p.sp === inst.sp && petColourName(p) === petColourName(inst)).length === 1,
    lastCell:petLastColourLoss(inst, roster),
    dust:petDustValue(BH_BY_ID[inst.sp] || {}) + (inst.shiny ? 15 : 0) + (inst.lineage || 0) * 8};
}
export async function quotePetDestruction(iid, keepIid = null) {
  await petInstances(); await petLevelBank(); await petTalentBank();
  return labTry(() => payAtomic({snapshot:labSnapshot, decide:(s, rows) => ({result:{ok:true, quote:petDestructionQuote(s, rows, iid, keepIid)}})}));
}
async function salvageLivePet(iid, sp = null, quote = null) {
  quote = quote && structuredClone(quote);
  await petInstances();await petLevelBank();await petTalentBank();
  return labTry(()=>payAtomic({snapshot:{keys:[...LAB_KEYS,'bonedust','dustRev'],stores:['health','inv']},decide:(s,rows)=>{
    const cur=s.petInst||[],inst=sp?removeWorstInstance(cur,sp).removed:cur.find(x=>selectablePetInstance(x)&&x.iid===iid);
    if(!inst)labRefuse(sp?'not-owned':'gone');
    if (quote) {
      const live = petDestructionQuote(s, rows, inst.iid);
      if (!labEqual(quote, live)) return {result:{ok:false, reason:'stale-quote', quote:live}};
    }
    const item=BH_BY_ID[inst.sp]||{},dust=petDustValue(item)+(inst.shiny?15:0)+(inst.lineage||0)*8;
    const next=cur.filter(x=>x?.iid!==inst.iid),remaining=speciesCount(next,inst.sp);
    const changes=petRemovalChanges(s,[inst.iid],next,effectivePetSteps(rows.health));
    if(!remaining){changes.pets={...s.pets};delete changes.pets[inst.sp];}
    return {kv:{...valuesPay(changes),...bumpPay('bonedust','dustRev',dust)},
      dels:remaining?[]:rows.inv.filter(r=>r.kind==='cos'&&r.itemId===inst.sp).map(r=>({store:'inv',key:r.id})),
      result:{ok:true,dust,name:item.name,remaining}};
  }}));
}
export async function salvageInstance(iid, quote = null) {
  return salvageLivePet(iid, null, quote);
}

// Is an owned pet the shiny variant? (any instance of the species is shiny)
export async function isPetShiny(petId) {
  return (await petInstances()).some(x => x.sp === petId && x.shiny);
}
export async function shinyPetIds() {
  return [...new Set((await petInstances()).filter(x => x.shiny).map(x => x.sp))];
}
// The lineage of the instance the game fights with for a species (best copy).
export async function bestPetLineage(petId) {
  const b = bestInstance(await petInstances(), petId);
  return b ? (b.lineage || 0) : 0;
}
// How many copies of each species you hold (backpack shows this).
export async function petCounts() {
  const counts = {};
  for (const x of await petInstances()) counts[x.sp] = (counts[x.sp] || 0) + 1;
  return counts;
}

// The steps a pet has walked since it hatched (drives its battle level).
// Grant a pet directly (petId, or 'random' for a random unowned one), anchoring
// its battle level to now. Returns the granted item, or null if already owned /
// no fresh pets. Shared by hatching and code redemption.
export async function grantPet(petId, source = 'code') {
  const owned = await ownedCosmeticIds();
  let pick;
  // pickRandomPet is the ONE place the rules live (see its header): it is what
  // keeps the exclusives and the 1% shop pet out of a 'random' grant, and it is
  // shared with hatchEgg so the two can never drift again.
  if (petId === 'random') {
    pick = pickRandomPet(owned);
  } else {
    pick = BH_BY_ID[petId];
    if (!pick || pick.slot !== 'C') return null;   // owning it already is fine now (dupes stack)
  }
  await addPetInstance(pick.id, {});
  // Put it on the player's shoulder if that slot is empty. Granting a pet used to
  // only file it in the Stable, so claiming the Day One Lizard showed a big
  // celebration and then nothing on the home screen. Never overrides a companion
  // the player already chose.
  try {
    const eq = await equipped({ raw: true });
    if (!eq.C) await equip('C', pick.id);
  } catch { /* the pet is granted either way; equipping is a courtesy */ }
  return pick;
}

// Redeem-a-code (web stopgap so friends can get a pet before TestFlight). Each
// code works ONCE per device (kv 'redeemed'). Share the codes you want.
export const REDEEM_CODES = {
  BONEHEADZ:  { pet: 'random', coins: 50 }, // welcome: a random pet + coins
  COSMICPET:  { pet: 'C1' },
  ETERNALPET: { pet: 'C2' },
  CORNERPET:  { pet: 'C3' },
  BASICPET:   { pet: 'C4' },
  TIDYPET:    { pet: 'C5' },
};
export async function redeemCode(raw) {
  const code = String(raw || '').trim().toUpperCase().replace(/\s+/g, '');
  if (!code) return { ok: false, reason: 'empty' };
  const def = REDEEM_CODES[code];
  if (!def) return { ok: false, reason: 'invalid' };
  const done = (await kvGet('redeemed', [])) || [];
  if (done.includes(code)) return { ok: false, reason: 'used' };
  /* THE CLAIM IS A ROW, NOT A LIST. The `redeemed` array above is a
     read-modify-write appended at the END of this function, so four concurrent
     redemptions of one code all read an empty list and all paid: measured
     2026-08-17 on this tree, `BONEHEADZ` redeemed 4/4 times from one tap
     window. A per-code kv row claimed with addIfAbsent is indivisible, so
     exactly one caller can ever take the code. The list is still read (above)
     and still written (below) so devices that redeemed before this change stay
     redeemed, and it is still what a restore carries. */
  if (!(await db.addIfAbsent('kv', { k: `redeemed:${code}`, v: Date.now() }))) return { ok: false, reason: 'used' };
  let pet = null, coins = 0, stacked = false;
  if (def.pet) {
    /* DUPES STACK, and the caller has to be able to SAY SO (Tom's call,
     * 2026-08-16). There used to be an `if (!pet) { dupe = true; coinsAdd(120) }`
     * consolation here, and it had been unreachable for as long as dupes have
     * stacked: grantPet returns the species unconditionally for an explicit id,
     * so `pet` is never null on a valid pet code and that branch never once ran.
     * Its only living effect was a lie by omission in Settings, where redeeming
     * a code for a species you already own minted a second copy and then showed
     * the byte-identical "unlocked!" toast a first-time unlock shows.
     * Ownership has to be read BEFORE the grant, because the grant is what
     * changes it, and there is nothing in grantPet's return value that can tell
     * the two cases apart afterwards. */
    const ownedBefore = await ownedCosmeticIds();
    pet = await grantPet(def.pet, 'code:' + code);
    stacked = !!pet && ownedBefore.has(pet.id);
  }
  if (def.coins) { coins += def.coins; await coinsAdd(def.coins); }
  done.push(code); await kvSet('redeemed', done);
  return { ok: true, pet, coins, stacked };
}

/* ---- v130: BANKED per-INSTANCE leveling + instance equip. Each individual pet
 * (not species) levels on its own; only the equipped INSTANCE earns the steps you
 * walk, so you pick exactly which pet to invest in. `petLvlSteps` is keyed by iid
 * (petLvlV=2); `petEquipped` holds the equipped instance's iid; `petStepCredit` is
 * the lifetime-steps checkpoint. ---- */

// pure: add a step delta to one key's bank (used by the crediting flow + tests)
export function creditSteps(bank, key, delta) {
  const out = { ...(bank || {}) };
  if (key && delta > 0) out[key] = (out[key] || 0) + delta;
  return out;
}

// The per-INSTANCE banked-step map (keyed by iid). Migrates losslessly from the
// v127 per-species map (each instance inherits its species' level) or, failing
// that, from hatch anchors - so no pet loses its current level. Sets the credit
// checkpoint so past steps aren't retroactively dumped onto the equipped pet.
export async function petLevelBank() {
  const ver=await kvGet('petLvlV',0),bank=await kvGet('petLvlSteps',null);
  if (bank && ver >= 2) return bank;
  await petInstances();
  return payAtomic({snapshot:{keys:['petInst','petLvlV','petLvlSteps','petStepCredit'],stores:['health']},decide:(s,rows)=>{
    if(s.petLvlSteps&&s.petLvlV>=2)return {result:s.petLvlSteps};
    const lifetime=effectivePetSteps(rows.health),next={};
    for(const x of s.petInst||[])if(selectablePetInstance(x))next[x.iid]=s.petLvlSteps&&s.petLvlV<2?Math.max(0,s.petLvlSteps[x.sp]||0):Math.max(0,lifetime-(x.hatchedAtSteps||0));
    return {kv:valuesPay({petLvlSteps:next,petLvlV:2,...(s.petStepCredit==null?{petStepCredit:lifetime}:{})}),result:next};
  }});
}

// The equipped instance's iid (the battle pet). Migrates from the old species-slot
// equip (equipped.C) by picking the best instance of that species.
export async function equippedPetIid() {
  const iid=await kvGet('petEquipped',null),stored=await kvGet('petInst',null);
  if(iid&&Array.isArray(stored)&&stored.some(x=>x?.iid===iid&&!selectablePetInstance(x)))return null;
  const insts=await petInstances(),inst=insts.find(x=>x.iid===iid),eq=await equipped({raw:true});
  if(inst&&eq.C===inst.sp)return iid;
  await petLevelBank();
  return payAtomic({snapshot:{keys:['petInst','petTaken','petEquipped','equipped','petLvlSteps','petStepCredit'],stores:['health']},decide:(s,rows)=>{
    const saved=(s.petInst||[]).find(x=>x?.iid===s.petEquipped);
    if(saved&&!selectablePetInstance(saved))return {result:null};
    const live=(s.petInst||[]).filter(x=>selectablePetInstance(x)&&!(s.petTaken||[]).includes(x.iid));
    const chosen=live.find(x=>x.iid===s.petEquipped)||bestInstance(live,s.equipped?.C)||bestInstance(live,live[0]?.sp)||live[0]||null;
    const changes={petEquipped:chosen?.iid||null,equipped:{...s.equipped,C:chosen?.sp||null}};
    if(s.petEquipped!==chosen?.iid){
      const lifetime=effectivePetSteps(rows.health),delta=Math.max(0,lifetime-(s.petStepCredit??lifetime));
      changes.petStepCredit=lifetime;
      if(saved&&delta>0)changes.petLvlSteps=creditSteps(s.petLvlSteps,saved.iid,delta);
    }
    return {kv:valuesPay(changes),result:chosen?.iid||null};
  }});
}

export async function setEquippedPet(iid) {
  await petLevelBank();
  const result=await payAtomic({snapshot:{keys:['petInst','petTaken','petEquipped','equipped','petLvlSteps','petStepCredit'],stores:['health']},decide:(s,rows)=>{
    const inst=(s.petInst||[]).find(x=>selectablePetInstance(x)&&x.iid===iid&&!(s.petTaken||[]).includes(iid));
    if(!inst)return {result:null};
    const lifetime=effectivePetSteps(rows.health),delta=Math.max(0,lifetime-(s.petStepCredit??lifetime));
    const old=(s.petInst||[]).find(x=>x?.iid===s.petEquipped&&!(s.petTaken||[]).includes(x.iid));
    return {kv:valuesPay({petEquipped:iid,equipped:{...s.equipped,C:inst.sp},petStepCredit:lifetime,
      ...(delta>0&&old?{petLvlSteps:creditSteps(s.petLvlSteps,old.iid,delta)}:{})}),result:inst};
  }});
  return result;
}

export async function equippedPetInstance() {
  const iid = await equippedPetIid();
  return (await petInstances()).find(x => x.iid === iid) || null;
}

// Credit steps walked since the last checkpoint to the equipped INSTANCE only.
// Idempotent: advancing the checkpoint means a second call adds nothing.
export async function creditEquippedPetSteps() {
  await petLevelBank();
  return payAtomic({snapshot:{keys:['petInst','petTaken','petEquipped','equipped','petLvlSteps','petStepCredit'],stores:['health']},decide:(s,rows)=>{
    const lifetime=effectivePetSteps(rows.health),credit=s.petStepCredit??lifetime;
    const delta=Math.max(0,lifetime-credit);
    const inst=(s.petInst||[]).find(x=>selectablePetInstance(x)&&x.iid===s.petEquipped&&!(s.petTaken||[]).includes(x.iid));
    const changes={};
    if(credit!==lifetime||s.petStepCredit==null)changes.petStepCredit=lifetime;
    if(delta>0&&inst)changes.petLvlSteps=creditSteps(s.petLvlSteps,inst.iid,delta);
    return {kv:valuesPay(changes),result:{delta,credited:delta>0&&inst?inst.iid:null}};
  }});
}

// Steps banked toward THIS instance's level. Only grows while it is equipped.
export async function petStepsForIid(iid) {
  const bank = await petLevelBank();
  return Math.max(0, bank[iid] || 0);
}
// One-time grandfather: each existing copy keeps only choices its own level
// permits. The original record stays archived, including future species. The
// marker and iid choices share one kvUpdate, so retries cannot re-grant picks.
async function petTalentBank() {
  const all = (await kvGet('pettalents', {})) || {};
  if (all.__iidV === 2) return all;
  await petInstances();await petLevelBank();
  return payAtomic({snapshot:{keys:['petInst','pettalents','petLvlSteps']},decide:s=>{
    const prior=s.pettalents||{};
    if(prior.__iidV===2)return {result:prior};
    const next={__iidV:2,__legacy:prior};
    for(const x of s.petInst||[])if(selectablePetInstance(x)){
      const picks=Object.hasOwn(prior,x.iid)?prior[x.iid]:prior[x.sp];
      next[x.iid]=legalPicks(x.sp,petLevel(s.petLvlSteps?.[x.iid]||0),Array.isArray(picks)?picks:[]);
    }
    return {kv:valuesPay({pettalents:next}),result:next};
  }});
}

// Species ids are deliberately not accepted: a species cannot identify which
// duplicate the player is editing. All callers must supply the instance iid.
export async function petPicks(iid) {
  const inst = (await petInstances()).find(x => x.iid === iid);
  if (!inst) return [];
  const all = await petTalentBank();
  return legalPicks(inst.sp, petLevel(await petStepsForIid(iid)), Array.isArray(all[iid]) ? all[iid] : []);
}
export async function setPetPick(iid, nodeId, picks) {
  await petTalentBank();
  const result=await editLivePet(iid,['pettalents','petLvlSteps'],(s,inst)=>{
    const next=legalPicks(inst.sp,petLevel(s.petLvlSteps?.[iid]||0),Array.isArray(picks)?picks:[]);
    return {kv:valuesPay({pettalents:{...s.pettalents,[iid]:next}}),result:next};
  });
  return Array.isArray(result)?result:[];
}

// Legacy: unopened egg-type crates become incubating eggs (idempotent sweep).
export async function migrateLegacyEggs() {
  const inv = await inventory();
  const legacy = inv.filter(r => r.kind === 'crate' && r.crate === 'egg');
  let converted = 0;
  for (const r of legacy) {
    /* TAKE, NOT DEL: db.del succeeds whether or not the row was still there, so
       two boots running this at the same instant both read the same legacy row,
       both "deleted" it and both granted an egg. `take` reports which call
       actually found it, which is the same fix disenchantGear carries above. */
    /* AND THE EGG IS GRANTED IN THAT SAME TRANSACTION (2026-09-06): grantEgg
       used to follow the take, so a boot interrupted between them erased the
       legacy crate and left no egg. */
    const egg = await eggRow(r.source || 'legacy');
    if (isMorph(r.morph)) { egg.morph = r.morph; egg.morphPolicy = 'legacy-preserved'; }
    if (!await takeAndPay('inv', r.id, { puts: [{ store: 'inv', val: egg }] })) continue;
    converted++;
  }
  return converted;
}

// eggRow's sibling, same reason: the row a crate grant writes, without the write.
export function crateRow(kind, source) { return { id: newId(), kind: 'crate', crate: kind, source, ts: Date.now() }; }
export async function grantCrate(kind, source) {
  if (kind === 'egg') return grantEgg(source); // eggs incubate, they don't open
  const row = crateRow(kind, source);
  await db.put('inv', row);
  return row;
}

export function consumableRow(type, source) { return { id: newId(), kind: type, source, ts: Date.now() }; }
export async function grantConsumable(type, source) {
  const row = consumableRow(type, source);
  await db.put('inv', row);
  return row;
}

export async function consumableCount(type) {
  return (await inventory()).filter(r => r.kind === type).length;
}

// Spend one consumable of `type` (removes the oldest inv row). Returns true if
// one was consumed. The caller applies the effect (e.g. addVigor for a Draught).
export async function consumeConsumable(type) {
  const row = (await inventory()).filter(r => r.kind === type).sort((a, b) => a.ts - b.ts)[0];
  if (!row) return false;
  // the delete and its receipt are one transaction (js/db.js takeInv), and the
  // take decides: two tabs spending the last Draught cannot both be told yes
  return !!(await db.takeInv(row.id));
}

export async function unopenedCrates(inv) {   // `inv`: pre-read rows, QA round 28 G3 (see ownedGearIds)
  return (inv || await inventory()).filter(r => r.kind === 'crate').sort((a, b) => a.ts - b.ts);
}

/* ---------- crate rolling ---------- */
function rollRarity(floor = 0) {
  const pool = RARITY_ORDER.slice(floor);
  const total = pool.reduce((a, r) => a + RARITIES[r].w, 0);
  let x = rng() * total;
  for (const r of pool) {
    x -= RARITIES[r].w;
    if (x <= 0) return r;
  }
  return pool[pool.length - 1];
}

/* THE ODDS THE BACKPACK PRINTS, read off the SAME weight table rollRarity
   spends (RARITIES[*].w over the crate's floor), so the screen can never
   advertise a chance this file does not honour and there is no hand-typed
   percentage anywhere to drift when a weight moves. This doubles as the App
   Store loot-box odds disclosure (Review Guideline 3.1.1 expects the odds of
   randomised items to be published in-app), which is why it must stay computed
   and stay on the screen where crates are opened.
   Rounding is the denGearOdds trick from poi.js: the largest slice absorbs the
   drift, so the printed percentages always sum to exactly 100 rather than the
   99 or 103 a straight per-line Math.round can produce.
   `rareUpOneIn` is the plain-voice summary ("Rare or better: about 1 in 5"),
   computed from the raw weights rather than the rounded percentages, so the
   two can never disagree with each other by more than the rounding they each
   declare. */
export function crateOdds(kind) {
  const floor = (CRATES[kind] || CRATES.daily).floor;
  const pool = RARITY_ORDER.slice(floor);
  const total = pool.reduce((a, r) => a + RARITIES[r].w, 0);
  const pcts = pool.map(r => Math.round((RARITIES[r].w / total) * 100));
  pcts[pcts.indexOf(Math.max(...pcts))] += 100 - pcts.reduce((a, b) => a + b, 0);
  const rareUp = pool.reduce((a, r) => a + (RARITY_ORDER.indexOf(r) >= RARITY_ORDER.indexOf('rare') ? RARITIES[r].w : 0), 0);
  return { rows: pool.map((r, i) => ({ rarity: r, pct: pcts[i] })), rareUpOneIn: Math.round(total / rareUp) };
}

/* WHAT A CRATE IS ALLOWED TO CONTAIN, in ONE predicate, because there are two
   pools in this file and they have already drifted apart once.
   Pets (slot C) hatch from step eggs only, never from crates. PET ACCESSORY
   SLOTS ARE EXCLUDED TOO, and that is the load-bearing half. Tom, 2026-08-21:
   "accessories locked to bumbleseal for sale only in cash shop not in any
   chests or found elsewhere in game." Their slot codes are not 'C'
   (deliberately, so they stay out of the egg's species pool), which meant they
   PASSED a plain `slot !== 'C'` filter. The exclusion was added to candidates()
   and NOT to the terminal fallback below, so the leak survived the fix: measured
   on that tree, 0.99% of Common Crate fallback rolls and 2.94% of Golden Crate
   ones came back a pet accessory, revealed as a duplicate of an item the player
   has never owned and paid out at its rarity (400 coins for the legendary Live
   Wire Stinger). Derived from PET_SLOTS rather than listed, so a sixth accessory
   cannot arrive without inheriting the exclusion. */
const petSlots = new Set(PET_SLOTS.map(s => s.code));
// Football kit, 2026-09-04: rack-only until Tom rules on crate drops (docs/FOOTBALL-KIT.md).
export const crateEligible = i => !i.default && !i.exclusive && i.slot !== 'C' && !petSlots.has(i.slot) && !i.football;

function candidates(rarity, slotBias) {
  let pool = BH_ITEMS.filter(i => crateEligible(i) && i.rarity === rarity);
  if (slotBias && rng() < 0.5) {
    const biased = pool.filter(i => slotBias.includes(i.slot));
    if (biased.length) pool = biased;
  }
  return pool;
}

// One cosmetic roll: uniform over crateEligible items AT THE ROLLED RARITY,
// owned or not. 2026-09-05, Tom's ruling on the crate-frequency audit
// (scratchpad/r33/faucet/out/crate-frequency.md section 4c): the old code
// preferred an unowned item and walked to neighbouring rarities when the
// rolled one was fully owned, so every roll was a guaranteed new piece and
// the rack above common sold almost nothing to a committed player (0.7 of 34
// legendaries bought a year). An owned pick now returns dupe:true and pays
// the same dupe table the terminal fallback below always paid.
export function rollCosmetic(owned, floor, slotBias) {
  const rolled = RARITY_ORDER.indexOf(rollRarity(floor));
  const pool = candidates(RARITY_ORDER[rolled], slotBias);
  if (pool.length) {
    const item = pool[Math.floor(rng() * pool.length)];
    return { item, dupe: owned.has(item.id) };
  }
  // Terminal fallback: this rarity has no crateEligible items at all (a data
  // gap; "everything at this rarity is owned" is already handled above).
  // SAME predicate as candidates() above, not a second copy of it: this line
  // carrying its own `slot !== 'C'` is exactly how the pet accessories stayed
  // droppable here after they were shut out one function up.
  const pool2 = BH_ITEMS.filter(i => crateEligible(i) && i.rarity === RARITY_ORDER[rolled]);
  const item = pool2[Math.floor(rng() * pool2.length)];
  return { item, dupe: true };
}

/* R38-13 (2026-09-06): every 'inv' row this file deletes outright rather than
   through db.take (a spent consumable, a used Battle Charm, a pet's last
   cosmetic copy on salvage/extinction) goes through db.takeInv, or rides as a
   `dels` row of a takeAndPay / payAtomic; either way js/db.js atomic() deletes
   the row and records its id in kv 'invTaken' in ONE transaction, and
   importAll's merge (!replace) never re-adds a row on that list. The receipt
   used to be a separate kvUpdate after a db.del, capped at the newest 500 ids
   (the 'crateTaken' idiom): a crash between the two writes lost the receipt,
   and item 501 let a stale blob revive item 1. Bound and merge rule are
   documented on takeInv itself. */
// collectLook's pure half: the looks a payout collects ride inside its transaction
function looksWith(cur, artIds) {
  const arr = Array.isArray(cur) ? [...cur] : [];
  let changed = false;
  for (const a of artIds) if (a && !arr.includes(a)) { arr.push(a); changed = true; }
  return changed ? arr : undefined;
}

/* SPEND THE CRATE BEFORE YOU ROLL IT, AND SPEND IT ATOMICALLY.
 * The row used to be deleted at the END, after every grant, so two overlapping
 * opens of ONE crate both found the row and both paid: measured 2026-08-17
 * against a real IndexedDB on this tree, two concurrent openCrate calls on a
 * single Golden Crate row both resolved with full loot and the inventory still
 * lost only one crate. db.take is the claim: the get and the delete are one
 * transaction, so exactly one caller can ever hold this crate. The trade is
 * deliberate and it is the one openGift, hatchEgg and claimDenLoot already
 * make: a crash between the take and the rolls costs the player one crate,
 * which is recoverable, where the other order pays a crate nobody owns out of
 * the economy, which is not. */
export async function openCrate(invId) {
  /* ROLL FIRST, THEN TAKE AND PAY IN ONE TRANSACTION (2026-09-06). The take used
     to come first and every grant after it in its own transaction, and the
     comment above accepted losing the crate on a crash. That is a Golden Crate
     gone with a partial hand or none. The rolls below only READ (owned sets,
     the level cap) and stage rows; nothing is written until takeAndPay at the
     bottom, where the crate's delete, its receipt, every staged row, the looks
     and the coins commit together or not at all. Two overlapping opens still
     resolve to exactly one paid caller: the loser's get finds no row. The kind
     check happens BEFORE the take so a non-crate row is never taken. */
  const crateRow = await db.get('inv', invId);
  if (!crateRow || crateRow.kind !== 'crate') throw new Error('crate gone');
  const def = CRATES[crateRow.crate] || CRATES.daily;
  const owned = await ownedCosmeticIds();
  const results = [];
  const puts = [], looks = [], ings = {};   // the hand, staged
  const gNew = new Set();                   // gear staged this open, so a later roll sees it as owned
  let coinsWon = Math.round(def.coins[0] + rng() * (def.coins[1] - def.coins[0]));

  for (let i = 0; i < def.rolls; i++) {
    const floor = i === 0 ? def.floor : 0;
    if (rng() < def.consumableChance) {
      // v153: Streak Freeze was half of every consumable drop and nobody used them
      // all. Battle Charm + Vigor Draught (the
      // items people actually spend) fill the rest.
      const pool = ['xp2', 'vigor'];
      const type = pool[Math.floor(rng() * pool.length)];
      puts.push({ store: 'inv', val: consumableRow(type, 'crate') });
      results.push({ type: 'consumable', consumable: type });
      continue;
    }
    // a no-walk fallback for cooking: crates sometimes hold a common ingredient
    if (rng() < 0.28) {
      const ing = COMMON_INGREDIENT_IDS[Math.floor(rng() * COMMON_INGREDIENT_IDS.length)];
      ings[ing] = (ings[ing] || 0) + 1;
      results.push({ type: 'ingredient', ingredient: ing });
      continue;
    }
    const { item, dupe } = rollCosmetic(owned, floor, def.slotBias);
    // gear-slot art has a 30% chance to drop as a STATTED variant of the same look
    if (GEAR_SLOTS.includes(item.slot) && rng() < 0.30) {
      // never drop gear gated more than 3 levels ahead (dead loot kills momentum);
      // if no variant qualifies, fall through to the plain cosmetic instead
      const { totalXp: _txp, levelFor: _lf } = await import('./game.js');
      const cap = _lf(await _txp()).level + 3;
      const variants = GEAR_ITEMS.filter(g => g.artId === item.id && (g.minLevel || 1) <= cap);
      const gOwned = await ownedGearIds();
      for (const id of gNew) gOwned.add(id);
      const pick = variants.find(g => !gOwned.has(g.id)) || variants[Math.floor(rng() * variants.length)];
      if (pick && !gOwned.has(pick.id)) {
        puts.push({ store: 'inv', val: gearRow(pick.id, 'crate') });
        looks.push(pick.artId);
        gNew.add(pick.id);
        results.push({ type: 'gear', gear: pick, item });
        continue;
      } else if (pick) {
        const value = RARITIES[pick.rarity].dupe;
        coinsWon += value;
        results.push({ type: 'geardupe', gear: pick, item, coins: value });
        continue;
      }
    }
    if (dupe || owned.has(item.id)) {
      const value = RARITIES[item.rarity].dupe;
      coinsWon += value;
      results.push({ type: 'dupe', item, coins: value });
    } else {
      puts.push({ store: 'inv', val: cosRow(item.id, 'crate') });
      looks.push(item.id);
      owned.add(item.id);
      results.push({ type: 'cos', item });
    }
  }
  /* THE TAKE RECEIPT (QA round 34 P0). A cloud merge (js/db.js importAll,
     replace:false) `os.put`s every 'inv' row a blob carries, unconditionally:
     right, for a row this device has never seen, wrong for one it already
     opened, because a blob older than the local save still carries the
     unopened row. takeAndPay writes the crate's id to kv 'invTaken' inside this
     same transaction, uncapped (js/db.js atomic; it was a separate kvUpdate of a
     500-id 'crateTaken' ring, so a crash between them lost the receipt and crate
     501 let a stale blob revive crate 1). importAll still reads the legacy
     'crateTaken' list; nothing writes it any more. */
  const pay = {
    kv: {
      ...bumpPay('coins', 'coinsRev', coinsWon),
      ...(looks.length ? { looks: cur => looksWith(cur, looks) } : {}),
      ...(Object.keys(ings).length ? { ingredients: inv => {   // grantIngredient's updater, staged
        const out = { ...(inv || {}) };
        for (const [id, n] of Object.entries(ings)) out[id] = (out[id] || 0) + n;
        return out;
      } } : {}),
    },
    puts,
  };
  if (!await takeAndPay('inv', invId, pay)) throw new Error('crate gone');
  return { crate: crateRow.crate, def, results, coins: coinsWon };
}

export async function buyShopItem(shopId) {
  const s = SHOP.find(x => x.id === shopId);
  if (!s) throw new Error('unknown item');
  // A funded wallet becomes one purchased consumable. Debit, revision and
  // goods commit together; a death after the debit cannot lose 90 coins.
  let left;
  try {
    await payAtomic({
      kv: {
        coins: cur => {
          const bal = Number(cur) || 0;
          if (!Number.isFinite(s.cost) || s.cost < 0 || bal < s.cost) {
            const e = new Error('insufficient-funds'); e.insufficientFunds = true; throw e;
          }
          return (left = bal - s.cost);
        },
        coinsRev: cur => (Number(cur) || 0) + Math.max(1, s.cost),
      },
      puts: [{ store: 'inv', val: consumableRow(shopId, 'shop') }],
    });
  } catch (e) {
    if (e?.insufficientFunds) return { ok: false, reason: 'coins', need: s.cost, have: await coins() };
    throw e;
  }
  // Report WHAT was bought, what it cost, the new balance and how many you now
  // hold. The old bare {ok:true} left the UI with nothing to say beyond
  // "Purchased", which reads as a no-op when you tap twice, so people kept
  // tapping and drained their coins without ever seeing a purchase land.
  const owned = await consumableCount(shopId);
  return { ok: true, label: s.label, cost: s.cost, coins: left, owned };
}

/* ---------- the Bone Merchant's closing payout ----------

   THE MERCHANT IS CLOSED (S0, 2026-08-25, docs/PLAN-remove-weapons.md §5).
   Twelve weapons, 500 to 6,000 coins, some priced in Bone Dust too. People spent
   real progression on those and we are withdrawing the thing they bought, so
   they get the LISTED PRICE BACK, in full: not a discount, not store credit.
   Same principle as the Bone Garden's closing payout on 2026-08-18, which paid
   the whole 5,500 rather than a reduced amount.

   THE PRICE TABLE IS FROZEN HERE ON PURPOSE. It is the receipt, not a live
   catalogue. The live price table is gone from the game, so the only surviving
   record of what a Femur Rapier cost is this list. It must never be edited to "rebalance"
   anything; it exists to answer one question, "what did they pay", and the
   answer stopped changing the day the merchant shut. Bonecrusher is absent
   because it was never for sale (the Champion's prize), so nothing was paid for
   it and nothing is owed.

   THE PAYOUT IS A MONEY PATH, so it follows the rewarded-actions SOP exactly,
   in the shape retireGardenIfNeeded already proved (js/game.js):
   1. ONE state transition per save: "this device still holds bought weapons"
      becomes "settled". Nothing about play can put it back; the merchant has no
      door left and buyWeapon does not exist.
   2. ASK THE AUTHORITY FIRST, PAY SECOND. The authority is db.addIfAbsent on
      kv `merchant-retired`, IndexedDB's own uniqueness constraint: exactly one
      caller is ever told true, however many tabs, boots or restores ask in the
      same instant. A kvGet/kvSet pair here was once measured paying 16,500
      coins to three concurrent callers, and this is the largest single payout
      the app has ever made (a full rack is ~33,000 coins and 1,030 dust).
   3. A NO-OP ANSWER IS NOT A SUCCESS. `false` pays nothing at all.
   4. NOTHING IS WRITTEN when there is nothing to settle, which is most players.
      A save restored from cloud backup then either brings the receipt with it
      (already settled) or brings unrefunded weapons and its own pre-refund
      balance, and settling it then is correct.
   5. PROVEN, not asserted: tests/merchant-retire-audit.mjs drives it twice
      against a real IndexedDB and measures the balances either side. The second
      run moves them by 0.

   THE INVENTORY ROWS STAY. Additive-only data rules: nobody's `inv` is deleted,
   the rows are simply unreferenced by every screen. The receipt records what was
   paid so a revival could read it back instead of guessing. */
export const MERCHANT_REFUND = {
  rapier: { coins: 500 }, shivs: { coins: 500 }, scepter: { coins: 900 },
  wand: { coins: 700 }, cleaver: { coins: 1500 }, crook: { coins: 1600 },
  maul: { coins: 3400 }, lichfocus: { coins: 3400 }, censer: { coins: 3200 },
  warmaul: { coins: 6000, dust: 350 },
  voidstar: { coins: 6000, dust: 350 },
  reliquary: { coins: 5600, dust: 330 },
};
export const MERCHANT_RETIRE_KEY = 'merchant-retired';

export async function retireMerchantIfNeeded() {
  const inv = await db.all('inv');
  /* Dedupe by weapon id, not by row. buyWeapon refused a second copy, so a save
     holding two rows for one weapon paid once and is owed once. */
  const bought = [...new Set(inv.filter(r => r.kind === 'weapon' && MERCHANT_REFUND[r.weaponId])
    .map(r => r.weaponId))];
  if (!bought.length) return null;                       // nothing was ever bought

  const coinsBack = bought.reduce((a, id) => a + MERCHANT_REFUND[id].coins, 0);
  const dustBack = bought.reduce((a, id) => a + (MERCHANT_REFUND[id].dust || 0), 0);
  const receipt = { weapons: bought, coins: coinsBack, dust: dustBack, at: Date.now() };
  // THE CLAIM. Exactly one caller gets true; everybody else pays nothing.
  if (!(await db.addIfAbsent('kv', { k: MERCHANT_RETIRE_KEY, v: receipt }))) return null;

  if (coinsBack) await coinsAdd(coinsBack);
  if (dustBack) await boneDustAdd(dustBack);
  return receipt;
}

/* ---------- Transmog (v221): wear the stats, keep the look ----------
   Statted gear used to force its own art on you: equipGear writes the look too,
   and picking a plain cosmetic dropped the stats. So liking a piece cost you
   power. Transmog splits the two: your gear keeps its stats, the slot shows a
   look you have collected.

   Three rules keep this honest and surprise-free:
   1. COLLECTION IS FOREVER. Seeing a piece once unlocks its look permanently,
      even after you melt it. `looks` is append-only and read unions it with what
      you currently own, so pre-v221 saves are grandfathered on first read with
      no migration and nobody can lose a look they already had.
   2. THE OVERRIDE ONLY APPLIES OVER GEAR. If you deliberately equip a plain
      cosmetic in a slot, the look you picked is the look you get. No hidden
      override fighting your choice.
   3. IT IS PER SLOT, NOT PER ITEM. WoW makes you re-apply on every upgrade;
      here your look sticks as the gear underneath it changes. */
export const TRANSMOG_HIDE = '__hide';
// Priced off the LOOK's rarity, in Bone Dust (melting a piece is how you fund
// wearing it). Reverting to the gear's own look, and hiding a slot, are free.
const TRANSMOG_COST = { common: 6, uncommon: 12, rare: 25, epic: 60, legendary: 60 };
export function transmogCost(artId) {
  if (!artId || artId === TRANSMOG_HIDE) return 0;
  const art = BH_BY_ID[artId];
  return art ? (TRANSMOG_COST[art.rarity] ?? 12) : 0;
}

export async function collectedLooks() {
  const out = new Set((await kvGet('looks', [])) || []);
  for (const id of await ownedCosmeticIds()) out.add(id);
  for (const gid of await ownedGearIds()) { const g = GEAR_BY_ID[gid]; if (g) out.add(g.artId); }
  return out;
}
export async function collectLook(artId) {
  if (!artId) return;
  await kvUpdate('looks', cur => {
    if (cur?.includes(artId)) return undefined;
    return looksWith(cur, [artId]);
  }, []);
}

export async function transmogMap() { return (await kvGet('transmog', {})) || {}; }

/* You pay for a (slot, look) pair ONCE. After that, wearing it again in that
   slot is free forever. That is what makes saved fits swappable without a tax,
   and it retires the v221 trap where flip-flopping between two looks charged
   you every single time. Read seeds itself from whatever you are currently
   wearing, so anyone who paid under v221 keeps what they bought. */
const paidKey = (slot, artId) => `${slot}:${artId}`;
export async function paidLooks() {
  const stored = (await kvGet('paidlooks', [])) || [];
  const set = new Set(stored);
  // Grandfather anything worn under v221, when nothing recorded the purchase.
  // This WRITES on read, deliberately: seeding from the live transmog map alone
  // is not durable, because clearing the slot would erase the only evidence and
  // charge the player a second time for a look they already bought.
  /* ONLY A LOOK WORN OVER STATTED GEAR IS SEEDED (QA round 22 W1). Under v221
     an override only ever applied over gear, so that is the only shape a real
     v221 purchase can have. A look sitting on a slot with NO gear got there for
     0 dust under the 2026-08-11 free rule, and seeding it here was the second
     of the two paths that turned a free apply into a permanent receipt:
     unequip, apply the 60-dust look for 0, and the next paidLooks() read banked
     it before the gear even went back on. */
  const add = [];
  const lo = await gearLoadout();
  for (const [slot, artId] of Object.entries(await transmogMap())) {
    const k = paidKey(slot, artId);
    if (artId !== TRANSMOG_HIDE && lo[slot] && !set.has(k)) { set.add(k); add.push(k); }
  }
  /* kvUpdate, not kvSet: `stored` was read before the transmogMap await, and
     markPaid CLAIMS on this same row. Writing the list whole dropped a receipt
     markPaid had just banked, and a lost receipt bills the player dust a second
     time for a look they already own. */
  if (add.length) await kvUpdate('paidlooks', cur => [...new Set([...(cur || []), ...add])], []);
  return set;
}
/* THE PAID-LOOK LEDGER. Rack purchases use this idempotent helper to bank
   their included transmog credit. It returns true only to the caller that
   added the key. applyTransmog banks its own credit inside the transaction
   that debits dust and applies the appearance.
   kvUpdate rather than the old kvGet/push/kvSet, which lost one of two
   concurrent additions every time it interleaved. A dropped entry here is not
   cosmetic: paidlooks is what makes a bought look free to wear forever, so
   losing one charges the player again for something they own. */
export async function markPaid(slot, artId) {
  const k = paidKey(slot, artId);
  let claimed = false;
  await kvUpdate('paidlooks', cur => {
    const list = Array.isArray(cur) ? cur : [];
    if (list.includes(k)) return undefined;          // already banked: write nothing
    claimed = true;
    return [...list, k];
  }, []);
  return claimed;
}
// What this slot change would cost right now (0 if free or already bought).
/* A LOOK WITH NO STATS BEHIND IT IS FREE. Tom, 2026-08-11: "you can transmog
   plain gear... the player should be able to do it for simple consistency."
   The panel is offered on every gear slot now, but with no statted piece worn
   there is nothing to disguise: "make this slot look like X" ends at exactly the
   same appearance as equipping X, which costs nothing. Charging dust for that
   would be selling a no-op, so the price is 0 and the button says free.
   THE PRICE LIVES HERE, not in the UI. applyTransmog calls transmogPrice itself,
   so a button merely LABELLED free would have shown free and still charged. */
export async function transmogPrice(slot, artId) {
  if (!artId || artId === TRANSMOG_HIDE) return 0;
  const tm = await transmogMap();
  if (tm[slot] === artId) return 0;
  if (!(await gearLoadout())[slot]) return 0;        // no stats in the slot: free
  return (await paidLooks()).has(paidKey(slot, artId)) ? 0 : transmogCost(artId);
}

export async function applyTransmog(slot, artId) {
  if (!GEAR_SLOTS.includes(slot)) return { ok: false, reason: 'slot' };
  if (artId == null || artId === '') return clearTransmog(slot);
  if (artId !== TRANSMOG_HIDE) {
    const art = BH_BY_ID[artId];
    if (!art || art.slot !== slot) return { ok: false, reason: 'slot' };
  }
  // Ownership, current equipment, price, debit, receipt and appearance share
  // one transaction. A crash cannot charge without delivering, and a second
  // tap sees the first purchase even when only one purchase was affordable.
  return payAtomic({
    snapshot: { keys: ['looks', 'paidlooks', 'transmog', 'gearloadout', 'bonedust', 'dustRev'], stores: ['inv'] },
    decide: (s, { inv }) => {
      if (artId !== TRANSMOG_HIDE) {
        const collected = (s.looks || []).includes(artId)
          || BH_SLOTS.some(entry => entry.default === artId)
          || inv.some(row => (row.kind === 'cos' && row.itemId === artId)
            || (row.kind === 'gear' && GEAR_BY_ID[row.gearId]?.artId === artId));
        if (!collected) return { result: { ok: false, reason: 'not-collected' } };
      }
      const tm = s.transmog || {}, lo = s.gearloadout || {};
      if (tm[slot] === artId) return { result: { ok: true, cost: 0, already: true } };
      // Preserve paidLooks' legacy grandfathering, using this same snapshot.
      // Free wears on empty slots still do not become purchase receipts.
      const paid = new Set(s.paidlooks || []);
      for (const [wornSlot, wornArt] of Object.entries(tm)) {
        if (wornArt !== TRANSMOG_HIDE && lo[wornSlot]) paid.add(paidKey(wornSlot, wornArt));
      }
      const cost = artId === TRANSMOG_HIDE || !lo[slot] || paid.has(paidKey(slot, artId))
        ? 0 : transmogCost(artId);
      const have = Number(s.bonedust) || 0;
      if (cost > have) return { result: { ok: false, reason: 'dust', need: cost, have } };
      if (cost > 0) paid.add(paidKey(slot, artId));
      return {
        result: { ok: true, cost, already: false },
        kv: {
          ...(cost > 0 ? bumpPay('bonedust', 'dustRev', -cost) : {}),
          ...(paid.size > (s.paidlooks || []).length ? { paidlooks: () => [...paid] } : {}),
          transmog: () => ({ ...tm, [slot]: artId }),
        },
      };
    },
  });
}

/* Drop ONE slot's override, in one transaction, for the reason applyTransmog
   states above: a whole-map write puts back whatever another slot's concurrent
   apply had just set. */
const dropTransmog = slot => kvUpdate('transmog', cur => {
  const t = { ...(cur || {}) };
  if (t[slot] == null) return undefined;
  delete t[slot];
  return t;
}, {});

export async function clearTransmog(slot) {
  await dropTransmog(slot);
  return { ok: true, cost: 0 };
}

/* ---------- Saved fits (v222) ----------
   A fit is a LOOK, never stats: you re-gear constantly chasing numbers and your
   outfit should survive that. Two halves, because they mean different things:
   `tm` is the transmog overrides (a gear slot missing from tm means "show
   whatever the gear itself looks like", which is not the same as pinning that
   art), and `cos` is the plain cosmetics on non-gear slots. A third half since
   v425: `gear` records the statted loadout so a fit survives Take it all off;
   applyFit only ever fills EMPTY slots with it, so re-gearing still wins.
   Pets are excluded: the Stable owns that slot now. */
export const MAX_FITS = 6;
export const FIT_COSMETIC_SLOTS = BH_SLOTS
  .map(s => s.code)
  .filter(c => !GEAR_SLOTS.includes(c) && c !== 'C');

export async function fits() { return (await kvGet('outfits', [])) || []; }

export async function captureFit(name) {
  const list = await fits();
  if (list.length >= MAX_FITS) return { ok: false, reason: 'full', max: MAX_FITS };
  const tm = { ...(await transmogMap()) };
  const eq = await equipped({ raw: true });
  const cos = {};
  for (const s of FIT_COSMETIC_SLOTS) if (eq[s]) cos[s] = eq[s];
  /* `gear` (v425): the statted loadout, slot -> gear id. The look-not-stats
     contract above assumed gear slots always HOLD something, and v424's Take it
     all off broke that: applyFit wrote transmogs onto emptied gear slots, and
     equipped() ignores a transmog on a slot holding nothing, so a fit applied
     after a strip lost every gear-slot look. Recording the loadout lets applyFit
     put the gear back where a slot is empty, which restores both the look and
     the stats a stripped player expects. */
  const lo = await gearLoadout();
  const gear = {};
  for (const s of GEAR_SLOTS) if (lo[s]) gear[s] = lo[s];
  /* A PLAIN cosmetic on a gear slot is the other thing v222 never wrote down:
     an un-transmogged gear slot "shows whatever the slot holds", which a strip
     empties. It lives in cos (same id space as the other cosmetics); applyFit
     only puts it on a slot that is still empty after the gear pass. */
  for (const s of GEAR_SLOTS) if (!lo[s] && eq[s]) cos[s] = eq[s];
  const fit = { id: newId(), name: (name || `Fit ${list.length + 1}`).slice(0, 18), tm, cos, gear, ts: Date.now() };
  await kvSet('outfits', [...list, fit]);
  return { ok: true, fit };
}

// Total dust to wear this fit right now: only the looks you have never bought.
export async function fitPrice(fit) {
  if (!fit) return 0;
  let sum = 0;
  for (const [slot, artId] of Object.entries(fit.tm || {})) sum += await transmogPrice(slot, artId);
  return sum;
}

export async function applyFit(id) {
  const fit = (await fits()).find(f => f.id === id);
  if (!fit) return { ok: false, reason: 'missing' };
  /* gear first (v425): a recorded piece goes back into a slot that is EMPTY
     right now, through equipGear so the owned/level checks all run. Empty-only,
     because the v222 contract holds for a dressed doll: a player who re-geared
     chasing numbers keeps that gear and the transmog below still lands the look.
     A piece no longer owned (or refused by equipGear) is skipped, the same
     tolerance as cosmetics. A pre-v425 fit has no gear map and behaves as
     before. */
  if (fit.gear) {
    const lo = await gearLoadout();
    const gOwned = await ownedGearIds();
    for (const [slot, gid] of Object.entries(fit.gear)) {
      if (lo[slot] || !gOwned.has(gid)) continue;
      await equipGear(slot, gid).catch(() => {});
    }
  }
  /* PRICE AFTER THE GEAR PASS, NOT BEFORE IT (QA round 22 W11). transmogPrice is
     0 on a slot with no statted gear, so pricing the fit before its gear went
     back on read every look against the wrong loadout: a fit saved with gear
     and an unpaid look priced 0 for a stripped player and then applyTransmog
     below charged full price anyway. Unreachable until W1, because every apply
     banked a receipt so no fit could hold an unpaid look; the order is the
     latent half of that ticket. Gear restore is free and reversible, so a fit
     refused for dust here leaves the player re-geared and no poorer. */
  const cost = await fitPrice(fit);
  const bal = await boneDust();
  if (cost > bal) return { ok: false, reason: 'dust', need: cost, have: bal };
  // gear slots: the fit's tm replaces the whole map, so a slot the fit does not
  // mention goes back to its gear's own look rather than keeping a stale override
  for (const slot of GEAR_SLOTS) {
    const want = (fit.tm || {})[slot];
    if (want == null) await clearTransmog(slot);
    else await applyTransmog(slot, want);
  }
  // cosmetics: skip anything no longer owned rather than throwing. A cos entry
  // on a GEAR slot (v425: a plain look worn there when the fit was saved) only
  // lands if the slot is still empty after the gear pass: statted gear the
  // player is wearing now, or that this fit just put back, is never bumped.
  const owned = await ownedCosmeticIds();
  const loNow = await gearLoadout();
  for (const [slot, itemId] of Object.entries(fit.cos || {})) {
    if (!owned.has(itemId)) continue;
    if (GEAR_SLOTS.includes(slot) && loNow[slot]) continue;
    await equip(slot, itemId, { keepGear: true });
  }
  return { ok: true, cost, name: fit.name };
}

export async function renameFit(id, name) {
  const list = await fits();
  const f = list.find(x => x.id === id);
  if (!f) return { ok: false };
  f.name = (name || f.name).slice(0, 18);
  await kvSet('outfits', list);
  return { ok: true };
}

export async function deleteFit(id) {
  await kvSet('outfits', (await fits()).filter(f => f.id !== id));
  return { ok: true };
}

/* ---------- Take it all off (v424) ----------
   A player asked for one button that takes everything off so a new outfit starts
   from nothing. Tom approved it, and on 2026-08-22 he settled the one open
   question against my first build: "reset should strip everything but there needs
   to be a gwart reminder or something that reminds players they will be weaker in
   fights if they dont choose statted gear to wear." So it strips STATTED GEAR TOO,
   and the risk that made me hold back (a player walks into the Pit weaker with
   nothing telling them why) is answered by telling them, not by leaving gear on.
   Gwart's no-gear bucket is the other half of this feature and neither half is
   complete without the other.

   THE CONTRACT IS UNCHANGED AND IT IS THE IMPORTANT HALF: it UNEQUIPS. Nothing is
   sold, melted, salvaged, refunded or deleted. The `inv` store is never written,
   so every piece and every statted roll is still in the Backpack and goes back on
   in one tap. It writes exactly the keys a wardrobe tap writes: 'equipped' and
   'gearloadout' (both through equip(), so the owned/slot checks every other path
   runs still run) and 'transmog'.

   EQUIPPED AND GEARLOADOUT CANNOT DESYNC, because nothing here writes them
   separately. equip(slot, null) with keepGear FALSE is the existing call that
   already does all three things together for one slot: it puts the slot back to
   its default or empties it, deletes gearloadout[slot], and drops any transmog on
   it. Clearing the two maps by hand would be two writes that can disagree; this
   is one call per slot, the same one the None cell makes.

   STILL EXCLUDED, and each for its own reason:
   - THE PET. Slot C belongs to the Stable, not the Wardrobe (it is not even on
     the paper doll), and the pet wardrobe (kv petWear) is its own system.
   - SAVED FITS (kv outfits) and the weapon aura (kv wpnaura). A fit is how you
     put a look BACK, so binning fits during a reset would destroy the recovery
     path; the aura is its own toggle in the rack and its own comment warns that
     erasing the key un-buys the purchase.
   - SLOT DEFAULTS. B and SK have `default` art that is always owned, and bare
     there is an invisible Bonehead rather than a blank canvas, so those go back
     to the default. equip(slot, null) already picks default-or-empty per slot. */
export async function stripAllPlan() {
  const [lo, eq, tm] = await Promise.all([gearLoadout(), equipped({ raw: true }), transmogMap()]);
  /* A slot is in the plan if it holds ANYTHING: a statted piece, or a plain
     cosmetic that is not the slot's own default. Gear used to be excluded here
     and that one clause was the whole of the old cosmetics-only behaviour. */
  const slots = BH_SLOTS
    .filter(s => s.code !== 'C' && (lo[s.code] || (eq[s.code] && eq[s.code] !== s.default)))
    .map(s => s.code);
  return { slots, gear: Object.keys(lo).filter(c => c !== 'C'), mogs: Object.keys(tm) };
}

export async function stripAll() {
  const { slots, gear, mogs } = await stripAllPlan();
  /* BANK THE RECEIPTS FIRST, BEFORE ANYTHING TOUCHES THE TRANSMOG MAP, and this
     matters MORE now than it did when only the map was cleared at the end.
     paidLooks() writes on read and grandfathers pre-v221 purchases by seeding
     from the LIVE transmog map; its own comment says "clearing the slot would
     erase the only evidence and charge the player a second time for a look they
     already bought." Now that gear slots are in the plan, equip(slot, null)
     deletes tm[slot] itself, one slot at a time, inside the loop below. So the
     seed has to run before the FIRST equip(), not just before the final kvSet,
     or the receipts are shredded piecemeal and re-wearing a look you already own
     bills you dust for it again. */
  if (mogs.length) await paidLooks();
  for (const code of slots) await equip(code, null);
  /* The loop clears tm only for slots that HELD something. A stale entry on an
     empty gear slot would survive it, and equipped() honours a transmog on any
     slot that holds anything, so a leftover would reapply the moment the player
     puts a fresh piece in that slot. Clear the map outright. */
  if (mogs.length) await kvSet('transmog', {});
  return { ok: true, slots, gear, mogs };
}

// The piece that best identifies a fit at chip size: whatever it deliberately
// changed, most-visible slot first.
export function fitThumbArt(fit) {
  if (!fit) return null;
  for (const s of ['H', 'SK', 'T', 'IR', 'M', 'E', 'G', 'IL', 'P', 'FW', 'B']) {
    const v = (fit.tm || {})[s];
    if (v && v !== TRANSMOG_HIDE && BH_BY_ID[v]) return BH_BY_ID[v];
  }
  for (const s of ['SK', 'B', 'BG']) {
    const v = (fit.cos || {})[s];
    if (v && BH_BY_ID[v]) return BH_BY_ID[v];
  }
  return null;
}

/* ---------- equipped ----------
   Returns the LOOK by default: every render path (home hero, Pit, map marker,
   splash, level-up card, friends' Crew card) already funnels through here, so
   resolving transmog once means they all show it with no extra plumbing.
   `{ raw: true }` returns the true equipment. Anything that WRITES equipment
   back, or reasons about what you actually own, must use raw or it would bake
   a transmog into the real save. */
export async function equipped({ raw = false } = {}) {
  const base = {};
  for (const s of BH_SLOTS) if (s.default) base[s.code] = s.default;
  const saved = await kvGet('equipped', {});
  // The Dressing Room needs the true saved id to explain an unavailable look.
  // Keep the raw contract, including the existing unsupported-pet exclusion.
  if (raw) {
    const eq = { ...base, ...saved };
    if (eq.C && !isKnownPet(eq.C)) delete eq.C;
    return eq;
  }
  const eq = { ...base };
  for (const s of BH_SLOTS) {
    const id = saved?.[s.code], item = BH_BY_ID[id];
    if (item && item.slot === s.code && (s.code !== 'C' || isKnownPet(id))) eq[s.code] = id;
  }
  const tm = (await kvGet('transmog', {})) || {};
  const slots = Object.keys(tm);
  if (!slots.length) return eq;
  const lo = await gearLoadout();
  for (const slot of slots) {
    /* USED TO BE `if (!lo[slot]) continue` (only overrides gear). Relaxed
       2026-08-11 so a slot holding a plain cosmetic honours its transmog too,
       per Tom's consistency call. Still requires the slot to HOLD something:
       without this a stale tm entry would conjure a look into a genuinely empty
       slot, which is a third behaviour nobody asked for. Free in that case, see
       transmogPrice. */
    if (!lo[slot] && !eq[slot]) continue;
    if (tm[slot] === TRANSMOG_HIDE) delete eq[slot];
    else if (BH_BY_ID[tm[slot]]?.slot === slot && (slot !== 'C' || isKnownPet(tm[slot]))) eq[slot] = tm[slot];
  }
  return eq;
}

export async function equip(slot, itemId, { keepGear = false } = {}) {
  // Readers project renderable slots. Writers edit the stored map so changing
  // a hat does not erase a future companion or an unknown earned appearance.
  const eq = { ...((await kvGet('equipped', {})) || {}) };
  if (itemId == null) {
    const def = BH_SLOTS.find(s => s.code === slot)?.default || null;
    if (def) eq[slot] = def; else delete eq[slot];
  } else {
    const item = BH_BY_ID[itemId];
    if (!item || item.slot !== slot || (slot === 'C' && !isKnownPet(itemId))) throw new Error('bad item');
    const owned = await ownedCosmeticIds();
    if (!owned.has(itemId)) throw new Error('not owned');
    /* Football kit, 2026-09-04: the 'refuse' branch of VISOR_EYES_POLICY. Under
       'hide' (the default) this is inert and the renderer skips the eyes instead. */
    if (visorRefusesEquip({ ...eq, [slot]: itemId })) throw new Error('visor');
    eq[slot] = itemId;
  }
  await kvSet('equipped', eq);
  // choosing a plain look drops the statted piece from that slot
  if (!keepGear && GEAR_SLOTS.includes(slot)) {
    const lo = await gearLoadout();
    if (lo[slot]) { delete lo[slot]; await kvSet('gearloadout', lo); }
    /* AND DROPS ANY DISGUISE ON IT. Deliberately picking a plain look means "this
       is what I want to look like", so a leftover transmog must not survive it.
       This matters as of 2026-08-11: equipped() now honours a transmog on a slot
       with no statted gear, so without this a STALE entry (left behind by unequipping
       gear, which never cleared it) would suddenly reapply and silently change how an
       existing player looks the moment they updated. A look you chose should only
       change when you choose. markPaid means re-picking it later is still free. */
    await dropTransmog(slot);
  }
  return eq;
}

export async function gearLoadout() { return (await kvGet('gearloadout', {})) || {}; }

// Equip a statted piece: sets the stats slot AND the matching look.
// The art does not need to be separately owned: the gear IS the item.
export async function equipGear(slot, gearId) {
  const lo = await gearLoadout();
  if (gearId == null) { delete lo[slot]; await kvSet('gearloadout', lo); return lo; }
  const g = GEAR_BY_ID[gearId];
  if (!g || g.slot !== slot) throw new Error('bad gear');
  const owned = await ownedGearIds();
  if (!owned.has(gearId)) throw new Error('not owned');
  const { totalXp, levelFor } = await import('./game.js'); // lazy: avoids circular init
  if (levelFor(await totalXp()).level < g.minLevel) throw new Error('level ' + g.minLevel + ' required');
  /* AN UNPAID OVERRIDE DOES NOT SURVIVE STATS ENTERING THE SLOT (QA round 22
     W1). transmogPrice charges 0 when the slot holds no statted gear, because
     with nothing to disguise the look is a no-op. The moment gear goes in, that
     premise is gone: the same override is now a real disguise over real stats,
     the thing that costs dust. Unequip, apply for 0, re-equip was the exploit,
     and this is the hop that closes it. A PAID look stays put (rule 3: your look
     sticks as the gear underneath it changes). Read paidLooks() BEFORE the
     loadout write: its seed is gear-gated, so the order is what keeps a free
     look from being banked by this very call. */
  const tm = await transmogMap();
  const unpaidLook = tm[slot] && tm[slot] !== TRANSMOG_HIDE && !(await paidLooks()).has(paidKey(slot, tm[slot]));
  lo[slot] = gearId;
  await kvSet('gearloadout', lo);
  const eq = { ...((await kvGet('equipped', {})) || {}) };
  eq[slot] = g.artId;
  await kvSet('equipped', eq);
  if (unpaidLook) await dropTransmog(slot);
  return lo;
}

/* ---------- Battle Charm (formerly XP Boost) ----------
   Charges live in kv buffs.xp2 (key kept so old charges convert 1:1). A charge
   is spent on a Pit WIN and adds BATTLE_CHARM_BONUS to that win's coins. */
/* ONE AT A TIME. Tom, 2026-08-08: "You shouldn't be able to use multiple battle
   charms if one is already active."
   This was a blind `+= 5`, so tapping USE with charges still on the clock ate a
   second charm and stacked to 10 wins. Nothing about that read as a choice: the
   bonus does not get bigger, you just spend an item early for duration you were
   already going to get. Refused while any charge remains, and the item stays in
   your bag. State transition (rewarded-actions SOP rule 1): "no charm running"
   becomes "charm running". If one is already running, there is no transition, so
   there is nothing to spend an item on. */
export async function activateBattleCharm() {
  // Read eligibility, remove one item, write its take receipt and activate
  // charges inside one transaction. Concurrent activations cannot stack.
  return payAtomic({
    snapshot: { keys: ['buffs'], stores: ['inv'] },
    decide: ({ buffs = {} }, { inv }) => {
      if ((buffs.xp2 || 0) > 0) return { result: { ok: false, reason: 'active', charges: buffs.xp2 } };
      const row = inv.find(r => r.kind === 'xp2');
      if (!row) return { result: { ok: false, reason: 'none' } };
      return { result: { ok: true, charges: 5 },
        kv: { buffs: () => ({ ...buffs, xp2: 5 }) },
        dels: [{ store: 'inv', key: row.id }] };
    },
  });
}

// A Wanderer's encounter receipt owns the whole reward, including its charm
// charge. No egg or wallet write can fail after the encounter is consumed.
export async function claimWandererWin(cfg, coinMult = 1) {
  const { awardOnce } = await import('./game.js');
  let coins = cfg.coins || 0;
  const extras = [];
  const pay = { kv: {
    buffs: cur => {
      if (coins <= 0 || !(cur?.xp2 > 0)) return undefined;
      const bonus = Math.round(coins * BATTLE_CHARM_BONUS);
      coins += bonus; extras.push(`Battle Charm +${bonus} coins`);
      return { ...cur, xp2: cur.xp2 - 1 };
    },
    coins: cur => {
      if (coins > 0 && coinMult > 1) {
        const bonus = Math.round(coins * (coinMult - 1));
        coins += bonus; extras.push(`Feast +${bonus} coins`);
      }
      return Math.max(0, (Number(cur) || 0) + coins);
    },
    coinsRev: cur => (Number(cur) || 0) + Math.max(1, Math.abs(coins)),
  }, puts: [{ store: 'inv', val: await eggRow('boneyard') }] };
  const r = await awardOnce(cfg.claimKey, 'wanderer', cfg.xp,
    'Boneyard: the Wanderer', cfg.date, null, pay);
  return r.claimed ? { xp: r.xp, coins, extras } : null;
}

export async function battleCharmCharges() {
  const buffs = await kvGet('buffs', {});
  return buffs.xp2 || 0;
}

// Consume one charge on a Pit win. Returns the coin bonus fraction (0 if none).
export async function consumeBattleCharmCharge() {
  const buffs = await kvGet('buffs', {});
  if (!buffs.xp2 || buffs.xp2 <= 0) return 0;
  buffs.xp2 -= 1;
  await kvSet('buffs', buffs);
  return BATTLE_CHARM_BONUS;
}

/* Streak Freezes were retired in v253: nobody used them, and an item that
   silently forgives a missed day muddied what a streak even means. Holders were
   paid out at 100 coins each (see refundStreakFreezes). Deliberately not
   replaced: do not re-add a "protect a day" consumable without a real reason. */

/* One-time payout: 100 coins per Streak Freeze still in the backpack.

   THE CLAIM IS ASKED AND ANSWERED BEFORE A COIN MOVES. Until v441 this read a kv
   flag, paid, and set the flag afterwards, and the comment here claimed that
   deleting the paid-for rows made a double run safe. It did not: this runs on
   BOOT (js/app.js), two overlapping callers BOTH clear the read and BOTH read
   the same undeleted rows, so both pay. tests/freeze-refund-audit.mjs measured
   three concurrent callers taking 900 coins for three freezes worth 300. The
   identical kvGet/kvSet shape was measured paying 16,500 on the merchant refund.
   db.addIfAbsent is the one test-and-set that holds here (see js/db.js): exactly
   one caller can ever get true for a key, no matter how many tabs ask at once.

   THE KEY IS DELIBERATELY UNCHANGED. Every install that already settled carries
   `freeze-refunded` written by the old kvSet, so the add finds that row and
   returns false: already claimed, paid nothing. A fresh key would have read as
   unclaimed on every existing save and paid the whole player base a second time.

   A PLAYER HOLDING NOTHING STILL BURNS THE FLAG, as before, so an empty save is
   not re-checked on every boot forever. That path pays nothing, so claiming it
   costs nothing.

   The order below is at-most-once, not at-least-once: the claim lands first, so
   a coinsAdd killed by a quota abort loses the make-good rather than risking a
   second one. That is the right direction for a payout nobody is waiting on.
   Coins are still added BEFORE the rows are deleted, so a half-dead write leaves
   an unusable item rather than taking coins somebody earned. */
export async function refundStreakFreezes() {
  // THE CLAIM. Exactly one caller gets true; everybody else pays nothing.
  if (!(await db.addIfAbsent('kv', { k: 'freeze-refunded', v: true }))) return null;
  const rows = (await inventory()).filter(r => r.kind === 'freeze');
  if (!rows.length) return null;
  const coins = rows.length * 100;
  await coinsAdd(coins);
  for (const r of rows) await db.takeInv(r.id);   // R38-13, one transaction since 2026-09-06
  return { count: rows.length, coins };
}
