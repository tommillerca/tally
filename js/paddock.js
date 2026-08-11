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
