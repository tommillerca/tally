import { buildBattlePet } from '/Users/tommiller/Documents/Hyperframes Editor/tally/js/pets.js';
import { escalateDen } from '../js/poi.js';
// Balance audit: hunt for no-strategy exploit builds across the ladder.
import {
  makeFighter, createFight, actionsFor, applyAction, endTurn,
  aiTakeTurn, scaleStats, LADDER, CHAMPION, RUNG_TALENTS,
} from '../js/pit.js';

const MID = { marrow: 50, power: 50, wind: 50, reflex: 50, hype: 50 };
const TOM = { marrow: 54, power: 20, wind: 44, reflex: 20, hype: 26 };

const BUILDS = {
  none:          [],
  slab:          ['heavyhands', 'marrowlust', 'bonebreaker', 'concussive', 'thickskull', 'rage', 'titan'],
  greyhound:     ['lightfeet', 'counterstep', 'kite', 'bleedout', 'deeplungs', 'flurry'],
  ringmaster:    ['crowdwork', 'bigentrance', 'heckle', 'ovation', 'secondwind', 'showstopper'],
  gravecaller:   ['bonebolt', 'soulsiphon', 'gravechill', 'mend', 'hex', 'raisedead', 'bonestorm'],
  gravewarden:   ['smite', 'radiance', 'ward', 'judgement', 'hallowed', 'lastlight'],
  boneshaman:    ['frostbolt', 'firebolt', 'totemic', 'frostbite', 'wildfire', 'totem', 'tempest'],
  alchemist:     ['fireflask', 'potency', 'acidvial', 'swallow', 'concoction', 'catalyst', 'corrode', 'overdose', 'deathbomb'],
  crowlord:      ['callcrows', 'sharpbeaks', 'peckeyes', 'carrion', 'flock', 'scavenge', 'omen', 'frenzy', 'murder'],
  // 12-point cross-tree menaces
  kitecaster:    ['bonebolt', 'soulsiphon', 'gravechill', 'mend', 'hex', 'bonestorm', 'lightfeet', 'counterstep', 'kite', 'bleedout', 'deeplungs', 'flurry'],
  immortal:      ['smite', 'radiance', 'ward', 'judgement', 'hallowed', 'lastlight', 'crowdwork', 'bigentrance', 'heckle', 'ovation', 'secondwind', 'showstopper'],
  windlock:      ['frostbolt', 'firebolt', 'totemic', 'frostbite', 'wildfire', 'tempest', 'bonebolt', 'soulsiphon', 'gravechill', 'mend', 'hex', 'bonestorm'],
  holyshaman:    ['frostbolt', 'firebolt', 'totemic', 'frostbite', 'wildfire', 'tempest', 'smite', 'radiance', 'ward', 'judgement', 'hallowed', 'lastlight'],
};

// ---- player policies: from "smart" down to brainless ----
// each returns an action id from `legal` (enabled only) or null to end turn
const POLICIES = {
  // reasonable player: guards on reads, spends casts, manages wind
  smart(fight, legal, pick) {
    const p = fight.p;
    if ((p.ward || 0) <= 0 && p.hp < p.d.maxHp * 0.6 && pick('guard') && fight.rng() < 0.45) return 'guard';
    if (pick('signature')) return 'signature';
    // v70 class actives: raise/plant a summon while it's down, rage early
    if (pick('raisedead') && !p.minion) return 'raisedead';
    if (pick('totem') && !p.totem) return 'totem';
    if (pick('rage') && !p.rage && p.hp > p.d.maxHp * 0.55) return 'rage';
    if (p.hp < p.d.maxHp * 0.4 && pick('mend')) return 'mend';
    if (pick('ward') && p.ward <= 0 && fight.rng() < 0.5) return 'ward';
    if (pick('titan')) return 'titan';
    if (pick('tempest')) return 'tempest';
    if (pick('bonestorm')) return 'bonestorm';
    if (pick('deathbomb') && p.toxicity >= 40) return 'deathbomb'; // dump the bomb at high Toxicity
    if (pick('acidvial') && !fight.f.sunder) return 'acidvial';
    if (pick('fireflask') && !fight.f.burn) return 'fireflask';
    if (pick('murder') && (p.flock || 0) >= 5) return 'murder';       // unleash a big flock
    if (pick('peckeyes') && !fight.f.blind) return 'peckeyes';
    if (pick('callcrows') && (p.flock || 0) < (4 + 3)) return 'callcrows'; // grow the flock
    if (p.wind < 18 && pick('brace')) return 'brace';
    if (pick('firebolt') && !fight.f.burn) return 'firebolt';
    if (pick('frostbolt') && fight.f.wind < 30) return 'frostbolt';
    if (pick('smite') && (fight.f.sunder || fight.f.stagger)) return 'smite';
    if (pick('swing')) return 'swing';
    if (pick('bonebolt')) return 'bonebolt';
    if (pick('jab')) return 'jab';
    return legal[0]?.id ?? null;
  },
  // one-button caster: best bolt every AP, never defends
  spamBolt(fight, legal, pick) {
    for (const id of ['firebolt', 'bonebolt', 'smite', 'frostbolt']) if (pick(id)) return id;
    if (pick('brace')) return 'brace';
    if (pick('jab')) return 'jab';
    return null;
  },
  // one-button melee: biggest swing available, never defends
  spamMelee(fight, legal, pick) {
    for (const id of ['signature', 'titan', 'haymaker', 'swing', 'jab']) if (pick(id)) return id;
    if (pick('brace')) return 'brace';
    return null;
  },
  // jab-kite: stamina-denial probe — only jab (kite talent saps 8/hit) + guard
  kite(fight, legal, pick) {
    if ((fight.p.ward || 0) <= 0 && fight.p.hp < fight.p.d.maxHp * 0.6 && pick('guard')) return 'guard';
    if (pick('signature')) return 'signature';
    if (pick('jab')) return 'jab';
    if (pick('guard')) return 'guard';
    return null;
  },
  // turtle: ward + mend + Bone Guard forever, jab with spare AP
  turtle(fight, legal, pick) {
    const p = fight.p;
    if (pick('ward') && p.ward <= 0) return 'ward';
    if (p.hp < p.d.maxHp * 0.7 && pick('mend')) return 'mend';
    if (pick('guard') && (p.ward || 0) <= 0) return 'guard';
    if (pick('jab')) return 'jab';
    return null;
  },
  // windlock: chill them to zero wind, execute with frostbite
  windlock(fight, legal, pick) {
    if (fight.f.wind >= 12 && pick('frostbolt')) return 'frostbolt';
    for (const id of ['frostbolt', 'firebolt', 'bonebolt', 'tempest']) if (pick(id)) return id;
    if (pick('brace')) return 'brace';
    if (pick('jab')) return 'jab';
    return null;
  },
  // spike-lock: keep the enemy blinded, then swing on the misses
  spikelock(fight, legal, pick) {
    if (!fight.f.blind && pick('bonespike')) return 'bonespike';
    for (const id of ['signature', 'haymaker', 'swing', 'bonespike', 'jab']) if (pick(id)) return id;
    if (pick('brace')) return 'brace';
    return null;
  },
  // hype battery: cheapest hype-builder -> signature loop
  sigcycle(fight, legal, pick) {
    if (pick('signature')) return 'signature';
    if (pick('jab')) return 'jab';
    if (pick('brace')) return 'brace';
    return null;
  },
};

function runFight({ stats, talents, foeCfg, seed, policy, pet, weaponId }) {
  const player = makeFighter({ name: 'P', stats, talents, weaponId: weaponId || 'starter', pet: pet ? buildBattlePet(pet.id, pet.level, pet.picks || []) : null });
  const foe = makeFighter({
    name: 'F',
    stats: scaleStats(stats, foeCfg.mult),
    weaponId: foeCfg.weaponId || 'starter',
    talents: foeCfg.talents || [],
  });
  const add = foeCfg.add ? makeFighter({
    name: 'A',
    stats: scaleStats(stats, foeCfg.add.mult),
    talents: foeCfg.add.talents || [],
  }) : null;
  const fight = createFight({ player, foe, add, seed, aiLevel: foeCfg.rung || 5 });
  let guard = 0;
  const m = { foeActions: 0, foeAttacks: 0, foeBraces: 0, playerActions: 0, foeWindSum: 0, foeWindSamples: 0 };
  while (!fight.over && guard++ < 400) {
    if (fight.active === 'p') {
      let inner = 0;
      while (!fight.over && fight.active === 'p' && fight.ap > 0 && inner++ < 8) {
        const legal = actionsFor(fight).filter(x => x.enabled);
        if (!legal.length) break;
        const pick = id => legal.find(x => x.id === id);
        const c = policy(fight, legal, pick);
        if (!c) break;
        const before = fight.ap;
        applyAction(fight, c);
        if (fight.ap === before) break; // illegal/no-op guard
        m.playerActions++;
      }
      if (!fight.over) endTurn(fight);
    } else {
      m.foeWindSum += fight.f.wind; m.foeWindSamples++;
      const evs = aiTakeTurn(fight);
      for (const e of evs) {
        if (e.t === 'foeAction') {
          m.foeActions++;
          if (['jab', 'swing', 'haymaker', 'signature', 'titan'].includes(e.id)) m.foeAttacks++;
          if (e.id === 'brace') m.foeBraces++;
        }
      }
      if (!fight.over) endTurn(fight);
    }
  }
  return {
    winner: fight.over ? fight.over.winner : 'draw',
    turns: fight.turn,
    hpLeft: fight.p.hp / fight.p.d.maxHp,
    ...m,
  };
}

const N = 200;
function cell({ stats, talents, foeCfg, policy, weaponId }) {
  let w = 0, d = 0, turns = 0, hp = 0, atk = 0, act = 0, brace = 0, fw = 0;
  for (let i = 0; i < N; i++) {
    const r = runFight({ stats, talents, foeCfg, seed: 9000 + i * 7, policy, weaponId });
    if (r.winner === 'p') { w++; hp += r.hpLeft; }
    else if (r.winner === 'draw') d++;
    turns += r.turns;
    atk += r.foeAttacks; act += r.foeActions; brace += r.foeBraces;
    fw += r.foeWindSum / Math.max(1, r.foeWindSamples);
  }
  return {
    win: Math.round(100 * w / N), draw: Math.round(100 * d / N),
    turns: +(turns / N).toFixed(1),
    hpLeft: w ? Math.round(100 * hp / w) : 0,
    foeAtkShare: act ? Math.round(100 * atk / act) : 0,
    foeBraceShare: act ? Math.round(100 * brace / act) : 0,
    foeAvgWind: Math.round(fw / N),
  };
}

const FOES = [
  { key: 'mirror', mult: 1.0, rung: 3 },
  ...LADDER.map(l => ({ key: 'rung' + l.rung, mult: l.mult, rung: l.rung, talents: RUNG_TALENTS[l.rung] || [] })),
  { key: 'CHAMP', mult: CHAMPION.mult, rung: 5, talents: CHAMPION.talents, weaponId: CHAMPION.weaponId, champ: true },
];

const statsName = process.argv[2] === 'tom' ? 'TOM' : 'MID';
const stats = statsName === 'TOM' ? TOM : MID;
const only = process.argv[3]; // optional policy filter

console.log(`=== stats: ${statsName} ${JSON.stringify(stats)} · ${N} fights/cell ===`);
for (const [pname, policy] of Object.entries(POLICIES)) {
  if (only && pname !== only) continue;
  console.log(`\n--- policy: ${pname} ---`);
  const header = ['build'.padEnd(12), ...FOES.map(f => f.key.padStart(6))].join(' ') + '   (win% | draw% flagged)';
  console.log(header);
  for (const [bname, talents] of Object.entries(BUILDS)) {
    // skip pointless pairs: caster policies on no-cast builds still "work" via fallbacks
    const row = [bname.padEnd(12)];
    for (const foeCfg of FOES) {
      const r = cell({ stats, talents, foeCfg, policy });
      let s = String(r.win).padStart(6);
      if (r.draw >= 15) s += `*d${r.draw}`;
      row.push(s);
    }
    console.log(row.join(' '));
  }
}

// ---- v71: the Bone Merchant's endgame weapons must not break the exploit bar ----
// The strongest realistic weapon+build vs the Champion under the smart policy must
// still stay under 90% (weapons multiply effort, they don't trivialise the ladder).
const champFoe = FOES.find(f => f.champ);
const WEAPONIZED = [
  { name: 'maul+slab', weaponId: 'maul', talents: BUILDS.slab },
  { name: 'lich+necro', weaponId: 'lichfocus', talents: BUILDS.gravecaller },
  { name: 'censer+warden', weaponId: 'censer', talents: BUILDS.gravewarden },
  { name: 'lich+shaman', weaponId: 'lichfocus', talents: BUILDS.boneshaman },
];
console.log('\n--- v71 weapon exploit check (smart policy vs Champion) ---');
let weaponBarOk = true;
for (const b of WEAPONIZED) {
  const r = cell({ stats, talents: b.talents, foeCfg: champFoe, policy: POLICIES.smart, weaponId: b.weaponId });
  const flag = r.win >= 90 ? '  <<< OVER 90% BAR' : '';
  if (r.win >= 90) weaponBarOk = false;
  console.log(`  ${b.name.padEnd(16)} vs Champion: ${String(r.win).padStart(3)}% win${flag}`);
}
console.log(weaponBarOk ? '  PASS: all weaponized builds stay under the 90% exploit bar' : '  FAIL: a weaponized build exceeds 90% vs the Champion');
if (!weaponBarOk) process.exitCode = 1;

// v123 boss scaling: a world boss must RAMP with dens beaten so it never runs dry.
// Model a player carrying a maxed pet (the ally body that makes 2v1 survivable) and
// a representative mid-tier den, escalated at increasing win counts. The ramp should
// (a) stay beatable for an engaged player under smart play, (b) NOT stay a steamroll
// under naive play as wins climb (the point: coasting stops working). The add IS
// modeled here (createFight gets it), so this reflects the real 2v1 the player faces.
const ESC_DEN = { mult: 1.05, aiLevel: 2, boss: 'Gnash', talents: ['heavyhands'] };
// use a COMMON pet (C3) as the conservative floor: its stat line ~= the pre-v124
// generic pet the escalateDen ramp was tuned against, so rarer pets only make the
// ramp easier (the incentive to collect). C3 is a common hound.
const escPet = { id: 'C3', level: 6, picks: [] };
console.log('\n--- v123 boss scaling ramp (player + maxed pet, add modeled) ---');
console.log('  wins  effMult  ai  add   smart-win%  spam-win%  smart-turns');
for (const wins of [0, 3, 6, 9, 12, 18, 30]) {
  const e = escalateDen(ESC_DEN, wins);
  const foeCfg = { key: 'boss', mult: e.bossMult != null ? e.bossMult : e.mult, rung: e.aiLevel, talents: ESC_DEN.talents, add: e.add };
  const smart = cellPet({ stats, foeCfg, policy: POLICIES.smart, pet: escPet });
  const spam = cellPet({ stats, foeCfg, policy: POLICIES.spamMelee, pet: escPet });
  const addTag = e.add ? 'yes' : ' no';
  console.log(`  ${String(wins).padStart(4)}  ${String(foeCfg.mult).padStart(6)}  ${e.aiLevel}   ${addTag}   ${String(smart.win).padStart(8)}%   ${String(spam.win).padStart(7)}%   ${String(smart.turns).padStart(10)}`);
}
// helper: cell() with a pet attached to the player
function cellPet({ stats, foeCfg, policy, pet }) {
  let w = 0, turns = 0, hp = 0;
  for (let i = 0; i < N; i++) {
    const r = runFight({ stats, talents: [], foeCfg, seed: 4000 + i * 11, policy, pet });
    if (r.winner === 'p') { w++; hp += r.hpLeft; }
    turns += r.turns;
  }
  return { win: Math.round(100 * w / N), turns: +(turns / N).toFixed(1), hpLeft: w ? Math.round(100 * hp / w) : 0 };
}
