// The Paddock: data interface (Lane R lands this first; Lane W consumes it).
// Scene + card slider render from what THIS file derives. Design source:
// ~/Downloads/design_handoff_the_paddock/README.md (2026-08-10).
//
// Flavor is DERIVED, not stored: the handoff specs none, so every copy gets a
// stable, deterministic line from its instance id. Deriving beats persisting
// here: no migration, no writes, and the same iid always reads the same line on
// every device that syncs the instance list.
//
// NAMES are derived the same way, but they are now a FALLBACK rather than the
// answer. There IS a per-pet naming UI as of v403 (the Stable's NICKNAME
// control), and Tom's call was that the player's name replaces the derived one
// rather than sitting beside it, so assignNames() supplies a name only for the
// copies the player has not named. That nickname is PRIVATE: it lives in kv
// 'petNick', it is never uploaded, and tests/nickname-private-audit.mjs pins
// that against the real wire, this render site included.

import { petInstances, petBonds, petLevelBank, petNicks, petWear, BOND_MAX, eggProgress, lifetimeStepsSum, inventory } from './loot.js';
import { isKnownPet } from './pets.js';

/* Nicknames, Bangers-register. Order matters: hashes index into it, so
   APPEND-ONLY once shipped (an insert re-names every pet in the world). */
export const PADDOCK_NAMES = [
  'TANK', 'MEATBALL', 'GILDA', 'DOOM', 'CRICKET', 'SUNSPOT', 'GRAVY', 'LOAF',
  'BISCUIT', 'GRAVEL', 'MOTH', 'PICKLE', 'RUCKUS', 'SLUDGE', 'TURNIP', 'WIDOW',
  'BOGART', 'CLEM', 'DIRGE', 'FENNEL', 'HEX', 'JUNIPER', 'MARROW', 'NOODLE',
  'OMEN', 'PLUM', 'QUIVER', 'RHUBARB', 'SOOT', 'TALLOW', 'UMBRA', 'VESPER',
];
/* One-liners per copy, same append-only rule. */
export const PADDOCK_FLAVOR = [
  'Chews fence posts. Zero regrets.',
  'Has seen things in those bushes.',
  'Naps at maximum intensity.',
  'Guards the hay. From everyone.',
  'Screams at the moon, politely.',
  'Best friends with a tombstone.',
  'Runs laps nobody asked for.',
  'Buried something. Forgot where.',
  'Rates every meal five stars.',
  'Afraid of exactly one leaf.',
  'Local cryptid. Verified.',
  'Fetches only spooky sticks.',
  'Sheds glitter. Unexplained.',
  'Howls in cursive.',
  'Believes in the eggs.',
  'Employee of the moonth.',
];

// FNV-1a, same shape the rest of the app hashes with
function hashStr(s) { let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

/* PURE: deterministic, collision-free name assignment. iids are sorted first
   so the outcome is independent of instance-list order, then each takes its
   hash slot with linear probing, so two copies can never share a nickname
   until the roster outgrows the pool (then numbered suffixes, never dupes). */
export function assignNames(iids, pool = PADDOCK_NAMES) {
  const taken = new Set();
  const out = {};
  for (const iid of [...iids].sort()) {
    let idx = hashStr(iid) % pool.length, name = null;
    for (let probe = 0; probe < pool.length; probe++) {
      const cand = pool[(idx + probe) % pool.length];
      if (!taken.has(cand)) { name = cand; break; }
    }
    if (!name) { // roster larger than the pool: suffix, still deterministic
      let n = 2;
      while (taken.has(`${pool[idx % pool.length]} ${n}`)) n++;
      name = `${pool[idx % pool.length]} ${n}`;
    }
    taken.add(name);
    out[iid] = name;
  }
  return out;
}
export function flavorFor(iid, pool = PADDOCK_FLAVOR) { return pool[hashStr('fl:' + iid) % pool.length]; }

/* Motion class per species, from the design (fly lanes / hover drift / flop /
   walk). Species facts, not preferences: C2 flies (HOVER_PETS agrees), C1 is
   the hovering cloud, C3 is the flopping catfish, everything else trots. */
export function motionFor(sp) {
  return sp === 'C2' ? 'fly' : sp === 'C1' ? 'hover' : sp === 'C3' ? 'flop' : 'walk';
}

/* THE ROSTER. One row per owned COPY (instances, not species: figure-contract
   rule 1: shiny/level live on the copy). Sorted by iid for stable render order. */
/* WEAR RIDES THE ROSTER. Tom, 2026-08-22: "you should also be able to have pets
   unequipped but keep their custom swag on like the bumbleseal outfit and then
   she can wear it while idle in the paddock."
   The SCENE already dressed her benched (measured 2026-08-23: five decoded
   layers on a Bumbleseal with a Mallard equipped), because it draws through the
   app's own pet renderer. The CARDS and the species TILES did not: they are
   plain single-image tags built here, from a model that had no idea a pet could be
   wearing anything, so the collection panel showed her bare two inches under a
   scene that showed her dressed. Carrying it on the row is what closes that,
   and it is one read: the wardrobe is one kv record for the account, not one
   per copy (see petWear in js/loot.js), so every copy of the dressable species
   is wearing the same thing and the species check in petWornLayers is what
   decides whether that means anything. */
export async function paddockRoster() {
  const [insts, bonds, bank, nicks, wear] = await Promise.all([petInstances(), petBonds(), petLevelBank(), petNicks(), petWear()]);
  const names = assignNames(insts.map(x => x.iid));
  return insts.filter(x => isKnownPet(x.sp)).map(x => ({
    iid: x.iid,
    sp: x.sp,
    shiny: !!x.shiny,
    morph: x.morph,   // R39-14 (2026-09-06): the Kennel morph rides beside shiny; app.js petHtml reads r.morph
    lineage: x.lineage | 0,
    bond: bonds[x.iid] | 0,
    maxed: (bonds[x.iid] | 0) >= BOND_MAX,
    levelSteps: bank[x.iid] | 0,
    name: nicks[x.iid] || names[x.iid],   // the player's private nickname WINS over the derived one
    flavor: flavorFor(x.iid),
    motion: motionFor(x.sp),
    wear,
  })).sort((a, b) => a.iid < b.iid ? -1 : 1);
}

/* Eggs for the nest + the egg tile: count and nearest hatch, from the real
   inventory rows (kind 'egg' in the inv table, the same rows the Backpack
   reads and eggProgress already understands: goal ?? semantics, stalled). */
export async function paddockEggs() {
  const rows = (await inventory()).filter(r => r.kind === 'egg');
  if (!rows.length) return { count: 0, nearest: null };
  const lifetime = await lifetimeStepsSum();
  let nearest = null;
  for (const row of rows) {
    const p = eggProgress(row, lifetime);
    const togo = Math.max(0, (p.goal | 0) - (p.walked | 0));
    /* A READY EGG IS 100%, WHATEVER ITS GOAL. `goal: 0` is how a ready egg is handed
       out (loot.js grantEgg), so `goal ? walked/goal : 0` printed an empty bar over the
       one egg the player can crack right now. Ready is the answer, not the divisor. */
    if (!nearest || togo < nearest.togo) nearest = { togo, pct: p.ready ? 1 : (p.goal ? Math.min(1, p.walked / p.goal) : 0), ready: !!p.ready };
  }
  return { count: rows.length, nearest };
}

/* ================= scene placement (Lane R part 2) =========================
 * ONE PACKER FOR EVERY FIGURE, because three packers that cannot see each
 * other pack into each other.
 *
 * v1 gave WALKERS an exclusive-x-band rule, put FLOPPERS on three hand-picked
 * spots and HOVERERS on three more, and wrapped the fourth of anything back
 * onto the first spot with a small nudge. The walkers' own rule held; nothing
 * BETWEEN the systems did. Measured in the live DOM on a 21-pet roster at
 * 430x932 (2026-08-31): eight pairs of sprites overlapped by more than 20px in
 * BOTH axes, worst 66x96px (two Drizzles wrapped onto one hover spot), 59x46px
 * (a Bulldog standing inside a Catfish) and 52x30px (two Catfish on one flop
 * spot). Both playtesters reported it as a clump on the mid-left with the
 * right half left to the props.
 *
 * All motion stays inside allocated space. Ground rows reserve room for the
 * flop and trot; hover drift uses only the row's slack. Four flyers share one
 * crossing clock, spaced around its 610px cycle, so none can catch another.
 * The sky stays above the cloud row even at the bottom of the wing bob.
 * A figure that fits nowhere is left UNPLACED rather than stacked on somebody,
 * and the collection panel says how many are resting (paddock-cards.js
 * panelHtml) instead of the field quietly lying about the roster.
 */

/* px two neighbours on one row may share. The paid-for rule tolerates 20; this
   allocates at 12 so the guard has margin rather than luck. */
export const OVERLAP = 12;
const SPRITE = 76;              // walkers and floppers: one ground sprite size
const CLOUD = 96;               // hoverers

export const PDK_SCENE = {
  W: 390, PANEL_Y: 498,                 // feet must stay above the panel edge
  FLY_LANES: [{ y: 112, w: 122, dur: 15 }, { y: 132, w: 102, dur: 15 }],
  HOVER_ROW: { y: 260, xmin: 8, xmax: 382 },
  GROUND_ROWS: [
    // The first row stops before the hay and nest. Lower rows pass in front.
    // 77px pitch reserves the sprite plus its small flop/trot movement.
    { y: 338, xmin: 86, xmax: 296 },
    { y: 415, xmin: 152, xmax: 382 },
    { y: 492, xmin: 152, xmax: 382 },
  ],
  /* the keeper is the PLAYER's bonehead, standing low in the bottom-left grass
     (Tom, 2026-08-11). It is a figure, not a control, and it swallows taps
     rather than letting them fall through to a pet nobody can see behind it
     (app.css .pdk-keeper). */
  KEEPER: { x: 96, y: 402, px: 172 },
};

/* the x a row needs to hold figures of these widths, laid left to right */
function rowNeed(widths) {
  return widths.reduce((s, w, i) => s + (i === widths.length - 1 ? w : w - OVERLAP), 0);
}

/* PURE: deal figures round-robin onto rows, skipping any row that cannot take
 * one more, then carve each row left to right. Deterministic from the input
 * order (iid-sorted upstream), no randomness, so the same herd always grazes
 * the same way. Returns [{ ...figure, y, x0, x1 }]; x1 - x0 is the figure's
 * width PLUS its share of the row's slack, which is what a walker wanders
 * across, so x0..x1 is the whole space that figure can ever occupy.
 * A figure that fits in no row is DROPPED from the result, never stacked. */
export function assignRows(figures, rows) {
  const slots = rows.map(r => ({ ...r, items: [] }));
  let next = 0;
  for (const f of figures) {
    for (let t = 0; t < slots.length; t++) {
      const s = slots[(next + t) % slots.length];
      if (rowNeed([...s.items.map(i => i.w), f.w]) <= s.xmax - s.xmin) {
        s.items.push(f);
        next = (next + t + 1) % slots.length;
        break;
      }
    }
  }
  const out = [];
  for (const s of slots) {
    if (!s.items.length) continue;
    const extra = Math.floor(Math.max(0, (s.xmax - s.xmin) - rowNeed(s.items.map(i => i.w))) / s.items.length);
    let x = s.xmin;
    for (const f of s.items) {
      out.push({ ...f, y: s.y, x0: x, x1: x + f.w + extra });
      x += f.w - OVERLAP + extra;
    }
  }
  return out;
}

/* THE WALK CAP. Unchanged at 8: the rows hold more than that, but a field of
 * eight walkers plus the floppers, the clouds and the ducks is already a busy
 * 390px scene. Copies beyond the cap are not dropped, they ROTATE: a
 * day-seeded hash picks today's herd, so every copy in a big collection takes
 * its turn. The renderer skips placeless rows and the panel counts them. */
export const WALK_CAP = 8;

/* Rotation seed. Raw FNV has NO avalanche on trailing characters: sorting by
   hashStr(iid + day) picked the same herd every day, and hashStr(day + iid)
   just sorted by the iid's last characters (both caught by the unit pin at
   build). The murmur fmix32 finalizer diffuses every input bit. */
export function rotHash(s) {
  let h = hashStr(s);
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35) >>> 0;
  return (h ^ h >>> 16) >>> 0;
}

/* Every motion class rotates daily when it exceeds its available space.
 * Chosen instances go first so an equipped or breeding-armed copy is visible.
 * Four flyers fit around the existing 610px crossing, even at maximum width. */
export const FLY_CAP = 4;
export function placePaddock(roster, scene = PDK_SCENE, day = new Date().toISOString().slice(0, 10)) {
  const priority = r => r.equipped || r.breeding ? 1 : 0;
  const rank = (a, b) => priority(b) - priority(a) || rotHash(day + ':' + a.iid) - rotHash(day + ':' + b.iid);
  const by = m => roster.filter(r => r.motion === m).sort(rank);
  const out = {};
  const flyers = by('fly').slice(0, FLY_CAP);
  flyers.forEach((r, i) => {
    const lane = scene.FLY_LANES[i % scene.FLY_LANES.length];
    const dur = scene.FLY_LANES[0].dur;
    out[r.iid] = { kind: 'fly', y: lane.y, w: lane.w, dur, phase: -i * dur / flyers.length };
  });
  for (const h of assignRows(by('hover').map(r => ({ iid: r.iid, w: CLOUD })), [scene.HOVER_ROW])) {
    out[h.iid] = { kind: 'hover', x: h.x0, y: h.y, w: h.w, range: h.x1 - h.x0 - h.w };
  }
  let walkers = by('walk');
  if (walkers.length > WALK_CAP) {
    walkers = [...walkers]
      .sort(rank)
      .slice(0, WALK_CAP);
  }
  /* floppers are dealt FIRST so the catfish are spread across the rows rather
     than filling whatever the walkers left over on one row */
  const ground = assignRows([
    ...by('flop').map(r => ({ ...r, w: SPRITE, kind: 'flop' })),
    ...walkers.map(r => ({ ...r, w: SPRITE, kind: 'walk' })),
  ].sort((a, b) => priority(b) - priority(a)), scene.GROUND_ROWS);
  for (const g of ground) {
    out[g.iid] = g.kind === 'walk'
      ? { kind: 'walk', y: g.y, x0: g.x0, x1: g.x1, w: g.w }
      : { kind: 'flop', x: g.x0, y: g.y, w: g.w };
  }
  return out;
}
