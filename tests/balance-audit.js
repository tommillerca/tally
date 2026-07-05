import { buildBattlePet } from '/Users/tommiller/Documents/Hyperframes Editor/tally/js/pets.js';
// Balance audit: hunt for no-strategy exploit builds across the ladder.
import {
  makeFighter, createFight, actionsFor, applyAction, endTurn,
  planTelegraph, aiTakeTurn, scaleStats, LADDER, CHAMPION, RUNG_TALENTS,
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
  // 12-point cross-tree menaces
  kitecaster:    ['bonebolt', 'soulsiphon', 'gravechill', 'mend', 'hex', 'bonestorm', 'lightfeet', 'counterstep', 'kite', 'bleedout', 'deeplungs', 'flurry'],
  immortal:      ['smite', 'radiance', 'ward', 'judgement', 'hallowed', 'lastlight', 'crowdwork', 'bigentrance', 'heckle', 'ovation', 'secondwind', 'showstopper'],
  windlock:      ['frostbolt', 'firebolt', 'totemic', 'frostbite', 'wildfire', 'tempest', 'bonebolt', 'soulsiphon', 'gravechill', 'mend', 'hex', 'bonestorm'],
  holyshaman:    ['frostbolt', 'firebolt', 'totemic', 'frostbite', 'wildfire', 'tempest', 'smite', 'radiance', 'ward', 'judgement', 'hallowed', 'lastlight'],
};

// ---- player policies: from "smart" down to brainless ----
// each returns an action id from `legal` (enabled only) or null to end turn
const POLICIES = {
  // reasonable player: defends telegraphs, spends casts, manages wind
  smart(fight, legal, pick) {
    const p = fight.p;
    if (fight.range === 'far') {
      if (pick('bonebolt')) return 'bonebolt';
      if (pick('frostbolt')) return 'frostbolt';
      if (pick('smite')) return 'smite';
      if (p.wind < 15 && pick('brace')) return 'brace';
      if (pick('advance')) return 'advance';
      return legal[0]?.id ?? null;
    }
    if (fight.telegraph === 'haymaker' && pick('guard') && (p.ward || 0) <= 0) return 'guard';
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
    if (fight.range === 'far' && pick('advance')) return 'advance';
    if (pick('jab')) return 'jab';
    return null;
  },
  // one-button melee: biggest swing available, never defends
  spamMelee(fight, legal, pick) {
    for (const id of ['signature', 'titan', 'haymaker', 'swing', 'jab']) if (pick(id)) return id;
    if (fight.range === 'far' && pick('advance')) return 'advance';
    if (pick('brace')) return 'brace';
    return null;
  },
  // shove-kite: never let them stand next to you, cast from far
  kite(fight, legal, pick) {
    if (fight.range === 'close') {
      if (pick('shove')) return 'shove';
      for (const id of ['bonebolt', 'frostbolt', 'smite', 'firebolt']) if (pick(id)) return id;
      if (pick('jab')) return 'jab';
      return null;
    }
    for (const id of ['bonebolt', 'frostbolt', 'firebolt', 'smite']) if (pick(id)) return id;
    if (pick('throwb')) return 'throwb';
    if (pick('brace')) return 'brace';
    return null;
  },
  // turtle: ward + mend + Bone Guard forever, jab with spare AP
  turtle(fight, legal, pick) {
    const p = fight.p;
    if (pick('ward') && p.ward <= 0) return 'ward';
    if (p.hp < p.d.maxHp * 0.7 && pick('mend')) return 'mend';
    if (pick('guard') && (p.ward || 0) <= 0) return 'guard';
    if (pick('rattle') && !fight.f.weaken) return 'rattle';
    if (pick('jab')) return 'jab';
    return null;
  },
  // windlock: chill them to zero wind, execute with frostbite
  windlock(fight, legal, pick) {
    if (fight.f.wind >= 12 && pick('frostbolt')) return 'frostbolt';
    for (const id of ['frostbolt', 'firebolt', 'bonebolt', 'tempest']) if (pick(id)) return id;
    if (pick('brace')) return 'brace';
    if (fight.range === 'far' && pick('advance')) return 'advance';
    if (pick('jab')) return 'jab';
    return null;
  },
  // spike-lock: keep the enemy blinded, then swing on the misses
  spikelock(fight, legal, pick) {
    if (!fight.f.blind && pick('bonespike')) return 'bonespike';
    for (const id of ['signature', 'haymaker', 'swing', 'bonespike', 'jab']) if (pick(id)) return id;
    if (pick('brace')) return 'brace';
    if (fight.range === 'far' && pick('advance')) return 'advance';
    return null;
  },
  // hype battery: taunt -> signature loop
  sigcycle(fight, legal, pick) {
    if (pick('signature')) return 'signature';
    if (fight.range === 'close' && pick('shove')) return 'shove';
    if (fight.range === 'far' && pick('taunt')) return 'taunt';
    if (pick('taunt')) return 'taunt';
    if (pick('brace')) return 'brace';
    if (pick('jab')) return 'jab';
    return null;
  },
};

function runFight({ stats, talents, foeCfg, seed, policy, pet }) {
  const player = makeFighter({ name: 'P', stats, talents, pet: pet ? buildBattlePet(pet.id, pet.level, pet.picks || []) : null });
  const foe = makeFighter({
    name: 'F',
    stats: scaleStats(stats, foeCfg.mult),
    weaponId: foeCfg.weaponId || 'starter',
    talents: foeCfg.talents || [],
  });
  const fight = createFight({ player, foe, seed, aiLevel: foeCfg.rung || 5 });
  let guard = 0;
  const m = { foeActions: 0, foeAttacks: 0, foeBraces: 0, playerActions: 0, foeWindSum: 0, foeWindSamples: 0 };
  while (!fight.over && guard++ < 400) {
    if (fight.active === 'p') {
      planTelegraph(fight);
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
          if (['jab', 'swing', 'haymaker', 'throwb', 'signature', 'titan'].includes(e.id)) m.foeAttacks++;
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
function cell({ stats, talents, foeCfg, policy }) {
  let w = 0, d = 0, turns = 0, hp = 0, atk = 0, act = 0, brace = 0, fw = 0;
  for (let i = 0; i < N; i++) {
    const r = runFight({ stats, talents, foeCfg, seed: 9000 + i * 7, policy });
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
