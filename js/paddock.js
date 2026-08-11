// The Paddock: data interface (Lane R lands this first; Lane W consumes it).
// Scene + card slider render from what THIS file derives. Design source:
// ~/Downloads/design_handoff_the_paddock/README.md (2026-08-10).
//
// Names and flavor are DERIVED, not stored: the app has no per-pet naming UI
// and the handoff specs none, so every copy gets a stable, deterministic
// nickname from its instance id. Deriving beats persisting here: no migration,
// no writes, renames impossible to lose, and the same iid always reads the
// same name on every device that syncs the instance list.

import { petInstances, petBonds, petLevelBank, BOND_MAX, eggProgress, lifetimeStepsSum, inventory } from './loot.js';

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
export async function paddockRoster() {
  const [insts, bonds, bank] = await Promise.all([petInstances(), petBonds(), petLevelBank()]);
  const names = assignNames(insts.map(x => x.iid));
  return insts.map(x => ({
    iid: x.iid,
    sp: x.sp,
    shiny: !!x.shiny,
    lineage: x.lineage | 0,
    bond: bonds[x.iid] | 0,
    maxed: (bonds[x.iid] | 0) >= BOND_MAX,
    levelSteps: bank[x.iid] | 0,
    name: names[x.iid],
    flavor: flavorFor(x.iid),
    motion: motionFor(x.sp),
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
    if (!nearest || togo < nearest.togo) nearest = { togo, pct: p.goal ? Math.min(1, p.walked / p.goal) : 0, ready: !!p.ready };
  }
  return { count: rows.length, nearest };
}

/* ================= scene placement (Lane R part 2) =========================
 * The layout rule from the handoff, made an algorithm because the demo's
 * hand-placed bands cannot survive a real roster: each WALKER owns an
 * exclusive x-band, and two pets whose foot rows sit within 40px vertically
 * must never share more than ~20px of x-range. The README marks this as a
 * review defect the design already paid for once; here it is enforced by
 * construction and pinned by unit test, not by eyeballing. */
export const PDK_SCENE = {
  W: 390, PANEL_Y: 498,                 // feet must stay above the panel edge
  FLY_LANES: [{ y: 112, w: 122, dur: 15 }, { y: 152, w: 102, dur: 19, phase: -12 }],
  /* measured on the first live render: clouds at y176-210 sat on the keeper's
     hat and inside the duck lanes; they drift LOW over the fence line now */
  HOVER_SPOTS: [{ x: 64, y: 244 }, { x: 306, y: 252 }, { x: 196, y: 232 }],
  /* third flop spot moved off the bottom-left corner: the keeper (your own
     bonehead) stands there now (Tom, 2026-08-11) */
  FLOP_SPOTS: [{ x: 304, y: 420, w: 88 }, { x: 232, y: 434, w: 82 }, { x: 140, y: 458, w: 58 }],
  WALK_ROWS: [322, 318, 356, 350, 396, 398, 428, 460],
  /* the props own the right flank above y~370 (hay 306,316; nest 300,352):
     walker bands on those rows stop short of them. Measured, not assumed: the
     first render parked a beardie on the hay bale. */
  ROW_XMAX: y => (y <= 370 ? 288 : 382),
  /* and the graveyard corner owns the LEFT flank on the top rows: the
     tombstone (x16-42, base y330) and cross (x62-78) sit at ground y330, so a
     walker whose feet land ABOVE that base (rows 318/322) is BEHIND them in
     world space, yet the herd layer draws over the backdrop SVG and hides
     them. Rows below the base pass in FRONT, which is correct perspective and
     stays allowed. Measured on the first live render, same class as the hay. */
  ROW_XMIN: y => (y <= 340 ? 86 : y >= 420 ? 152 : 8),
  /* the keeper is the PLAYER's bonehead now, standing low in the bottom-left
     grass (Tom, 2026-08-11); rows at y>=420 keep out of that corner for the
     same world-depth reason as the tombstone: their feet land above his */
  KEEPER: { x: 96, y: 402, px: 172 },
};

/* PURE: partition walkers into exclusive x-bands.
 * Walkers are dealt round-robin onto foot rows; rows within 40px of each other
 * form a vertical CLUSTER; each cluster's occupants split the scene width into
 * disjoint bands with a 24px gutter (> the 20px the rule tolerates, so the
 * guard has margin, not luck). Deterministic from roster order (iid-sorted
 * upstream), no randomness, so the same herd always grazes the same way. */
export function assignBands(walkers, scene = PDK_SCENE) {
  const rows = scene.WALK_ROWS;
  const placed = walkers.map((w, i) => ({ iid: w.iid, y: rows[i % rows.length] }));
  // cluster rows vertically (<40px apart share x-space budget)
  const clusters = [];
  for (const p of placed) {
    let c = clusters.find(c => c.some(q => Math.abs(q.y - p.y) < 40));
    if (!c) { c = []; clusters.push(c); }
    c.push(p);
  }
  const PAD = 8, GUTTER = 24;
  for (const c of clusters) {
    // the row group's usable width starts past the graveyard and ends where
    // the props begin (both bounds conservative across the cluster)
    const xmax = Math.min(...c.map(p => (scene.ROW_XMAX ? scene.ROW_XMAX(p.y) : scene.W - PAD)));
    const xmin = Math.max(...c.map(p => (scene.ROW_XMIN ? scene.ROW_XMIN(p.y) : PAD)));
    const span = xmax - xmin;
    const bandW = Math.floor((span - GUTTER * (c.length - 1)) / c.length);
    c.forEach((p, i) => {
      p.x0 = xmin + i * (bandW + GUTTER);
      p.x1 = p.x0 + bandW;
    });
  }
  return placed;   // [{iid, y, x0, x1}]
}

/* THE WALK CAP. The paid-for layout rule is measured on SPRITES (76px wide),
 * not bands: two same-cluster walkers may share at most 20px, so their band
 * spacing (bandW + GUTTER) must stay >= 56px. The top cluster's span is 202
 * after the graveyard exclusion, which holds floor((202+24)/56) = 4 walkers,
 * and round-robin dealing splits walkers evenly across the two row clusters,
 * so the scene renders at most 8. Copies beyond that are not dropped, they
 * ROTATE: a day-seeded hash picks today's herd, so every copy in a big
 * collection takes its turn in the scene. The renderer skips placeless rows. */
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

/* PURE: the whole scene cast from a roster. Walkers through assignBands;
 * flyers/hoverers/floppers onto their fixed lanes and spots, extras wrapping
 * with a small offset so a fourth catfish still lands somewhere sane.
 * `day` only seeds the rotation; any stable per-day string works. */
export function placePaddock(roster, scene = PDK_SCENE, day = new Date().toISOString().slice(0, 10)) {
  const by = m => roster.filter(r => r.motion === m);
  const out = {};
  by('fly').forEach((r, i) => {
    const lane = scene.FLY_LANES[i % scene.FLY_LANES.length];
    /* Tom, 2026-08-11: "most of my ducks are flying in a clump they should
       stagger more." They clumped by construction: every duck on a lane got
       the lane's dur and phase VERBATIM, so they held the same x forever, a
       vertical stack sliding across the sky. Each duck now gets its own
       phase offset (spreads them along the crossing) and a small iid-seeded
       speed variance (so they drift apart over time instead of holding a
       fixed formation). Deterministic: same herd, same sky. */
    const drift = rotHash('fly:' + r.iid);
    out[r.iid] = {
      kind: 'fly',
      y: lane.y + Math.floor(i / scene.FLY_LANES.length) * 26,
      w: lane.w,
      dur: lane.dur + (drift % 5),                                   // 0-4s slower
      phase: (lane.phase || 0) - i * 5.5 - (drift % 100) / 25,       // spread along the lane
    };
  });
  by('hover').forEach((r, i) => {
    const s = scene.HOVER_SPOTS[i % scene.HOVER_SPOTS.length];
    out[r.iid] = { kind: 'hover', x: s.x + Math.floor(i / scene.HOVER_SPOTS.length) * 30, y: s.y, w: 96 };
  });
  by('flop').forEach((r, i) => {
    const s = scene.FLOP_SPOTS[i % scene.FLOP_SPOTS.length];
    out[r.iid] = { kind: 'flop', x: s.x, y: s.y - Math.floor(i / scene.FLOP_SPOTS.length) * 22, w: s.w };
  });
  let walkers = by('walk');
  if (walkers.length > WALK_CAP) {
    walkers = [...walkers]
      .sort((a, b) => rotHash(day + ':' + a.iid) - rotHash(day + ':' + b.iid))
      .slice(0, WALK_CAP);
  }
  const bands = assignBands(walkers, scene);
  for (const b of bands) out[b.iid] = { kind: 'walk', y: b.y, x0: b.x0, x1: b.x1, w: 76 };
  return out;
}
