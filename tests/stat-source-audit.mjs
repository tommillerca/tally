/* THE ONLY THING THAT MOVES A FIGHTER'S STATS IS THE POINTS THE PLAYER SPENT.
   R21-P1, Tom's call: "players earn training points and choose where to spend
   them." Before this audit, js/app.js buildFighter() started from
   deriveStats(behavior), which read protein days, streak, closes, lifetime
   steps, spawns, eggs, quests and food variety. Every fighter, every friend
   battle snapshot and every spire defender snapshot therefore carried a stat
   spread nobody picked, and two accounts that had spent identical points still
   fought with different numbers.

   WHAT THIS PINS
   1. Two profiles with the same allocation and DIFFERENT histories are the same
      fighter. A fresh account and a 60-day account, both with nothing allocated,
      must produce byte-identical stats.
   2. Allocation still differentiates (the control: a check that cannot fail is
      not a check, see feedback_checks_that_cannot_fail).
   3. The one-time migration hands back at least as much power as the habit base
      was worth, and it fits inside TRAIN_CAP.
   4. The one-shot is shaped so it cannot pay twice, and `habitStats` is gone.

   PROVEN RED, NO BROWSER. This file imports the pit module as a namespace and
   falls back to `deriveStats` when `legacyHabitStats` is absent, so it RUNS on
   the pre-fix tree instead of dying on a missing import: on that tree row IDENT
   reports fresh {power:20,...} against 60-day {power:100,marrow:100,...} and
   fails for exactly the reason this audit exists. Everything here is a pure
   function over pure data, so `node tests/stat-source-audit.mjs` is the whole
   harness. */
import { readFileSync } from 'node:fs';
import * as PIT from '../js/pit.js';

const { deriveStats, allocatedStats, TRAIN_STEP, TRAIN_CAP, BASE_STAT = 20 } = PIT;
/* On the fixed tree this is the archived habit formula; on the pre-fix tree
   deriveStats IS that formula, which is precisely what makes row IDENT red
   there rather than absent. */
const legacyHabitStats = PIT.legacyHabitStats || PIT.deriveStats;
const habitGrantPoints = PIT.habitGrantPoints;

const fails = [];
const ok = (n, p, d = '') => { console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${d ? '  ' + d : ''}`); if (!p) fails.push(n); };

/* The five stats, spelled out rather than read off STAT_META on purpose: this
   audit must still fail if a stat is quietly dropped from that table. The
   roster comes from js/pit.js STAT_META and js/pit.js allocatedStats, unchanged
   since the hybrid landed 2026-07-04 and still the roster in the R21-P1 ticket
   (2026-09-03). */
const KEYS = ['power', 'marrow', 'wind', 'reflex', 'hype'];
const show = s => KEYS.map(k => `${k}:${s[k]}`).join(' ');

/* The two players. FRESH is a real day-one account (every counter zero, the
   same body tests/first-fight-audit.mjs uses). SIXTY is a committed two-month
   player: 55 protein days, a 60-day streak, 58 days closed on budget, 480k
   lifetime steps, 90 Boneyard spawns, 30 egg days, 44 quests, 60 distinct
   foods. Under the old base that account sat at or near 100 in every stat. */
const FRESH = {};
const SIXTY = {
  proteinDays: 55, streak: 60, closes: 58, lifetimeSteps: 480000,
  spawns: 90, eggDays: 30, questsDone: 44, variety: 60,
};
/* A third history that differs from SIXTY in every field, so row IDENT cannot
   pass by accident on one clamped stat. */
const OTHER = {
  proteinDays: 9, streak: 3, closes: 21, lifetimeSteps: 96000,
  spawns: 4, eggDays: 1, questsDone: 30, variety: 12,
};

/* buildFighter's own composition, minus gear (a fighter with nothing equipped
   adds 0 to every stat, so the base and the allocation are the whole chain). */
const fighterStats = (behavior, alloc = {}) => allocatedStats(deriveStats(behavior), alloc);

const fresh = fighterStats(FRESH);
const sixty = fighterStats(SIXTY);
const other = fighterStats(OTHER);
ok('IDENT   fresh vs 60-day, zero allocation', KEYS.every(k => fresh[k] === sixty[k]),
  `fresh[${show(fresh)}] 60d[${show(sixty)}]`);
ok('IDENT   60-day vs a different history, zero allocation', KEYS.every(k => other[k] === sixty[k]),
  `other[${show(other)}] 60d[${show(sixty)}]`);
ok('FLAT    every stat starts on the same number', new Set(KEYS.map(k => fresh[k])).size === 1,
  show(fresh));

/* THE CONTROL. If allocation stopped mattering, every row above would go green
   for the wrong reason (a fighter whose stats never move is also a fighter
   whose stats never differ). */
const spent = fighterStats(SIXTY, { power: 5 });
ok('CONTROL allocation still moves a stat', spent.power === sixty.power + 5 * TRAIN_STEP,
  `${sixty.power} -> ${spent.power} for 5 points at ${TRAIN_STEP}/pt`);
ok('CONTROL allocation moves ONLY the stat it was spent on',
  KEYS.filter(k => k !== 'power').every(k => spent[k] === sixty[k]), show(spent));

/* THE MIGRATION. Nobody may be weaker after the update than before it: the
   points handed back must be able to rebuild the whole habit base. */
if (typeof habitGrantPoints !== 'function') {
  ok('GRANT   habitGrantPoints exists', false, 'js/pit.js exports no migration helper');
} else {
  for (const [name, b] of [['60-day', SIXTY], ['mid', OTHER], ['fresh', FRESH]]) {
    const habit = legacyHabitStats(b);
    const tp = habitGrantPoints(habit);
    const lost = KEYS.reduce((a, k) => a + Math.max(0, habit[k] - BASE_STAT), 0);
    ok(`GRANT   ${name}: points cover the base that was removed`, tp * TRAIN_STEP >= lost,
      `${tp}pt x ${TRAIN_STEP} = ${tp * TRAIN_STEP} vs ${lost} stat points removed`);
    // and every stat is individually rebuildable: re-spending the points the way
    // the old base spread them must not run into TRAIN_CAP.
    const perStat = KEYS.map(k => Math.ceil(Math.max(0, habit[k] - BASE_STAT) / TRAIN_STEP));
    ok(`GRANT   ${name}: rebuild fits under TRAIN_CAP`, perStat.every(p => p * TRAIN_STEP <= TRAIN_CAP),
      `worst stat needs +${Math.max(...perStat) * TRAIN_STEP} of ${TRAIN_CAP}`);
    const rebuilt = allocatedStats(deriveStats(b), Object.fromEntries(KEYS.map((k, i) => [k, perStat[i]])));
    ok(`GRANT   ${name}: rebuilt fighter is no weaker than the old one`,
      KEYS.every(k => rebuilt[k] >= habit[k]), `was[${show(habit)}] now[${show(rebuilt)}]`);
  }
  ok('GRANT   the same snapshot always yields the same points',
    habitGrantPoints(legacyHabitStats(SIXTY)) === habitGrantPoints(legacyHabitStats(SIXTY)));
  ok('GRANT   a fresh account is granted nothing', habitGrantPoints(legacyHabitStats(FRESH)) === 0);
}

/* THE ONE-SHOT'S SHAPE, read off the source. The kv layer is IndexedDB and this
   audit is deliberately browser-free, so what is checked here is the property
   that makes double-paying impossible: the grant is READ before it is written,
   the stored value is itself the flag (no separate boolean that could be
   written while the grant was not), it is written in exactly one place, and
   nothing ever adds to it. */
const app = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const key = (app.match(/const HABIT_GRANT_KEY = '([^']+)'/) || [])[1];
ok('ONCE    the grant has a versioned kv key', !!key, key || 'no HABIT_GRANT_KEY');
if (key) {
  const sets = app.match(/kvSet\(HABIT_GRANT_KEY/g) || [];
  const gets = app.match(/kvGet\(HABIT_GRANT_KEY/g) || [];
  ok('ONCE    written in exactly one place', sets.length === 1, `${sets.length} kvSet calls`);
  /* THE READ THAT GUARDS THE WRITE sits in the grant site itself, so it is the
     LAST kvGet before the one kvSet, within the same function. Round 28 B1 added a
     second, display-only read (the Today card that explains the rebalance), which
     is not a second grant; counting reads file-wide turned it into a red (2026-09-04). */
  const setAt = app.indexOf('kvSet(HABIT_GRANT_KEY');
  const getAt = app.lastIndexOf('kvGet(HABIT_GRANT_KEY', setAt);
  ok('ONCE    read before it is written', getAt > -1 && setAt - getAt < 600, `read ${setAt - getAt} chars before the write`);
  ok('ONCE    the stored value is never accumulated',
    !/HABIT_GRANT_KEY[\s\S]{0,400}?\.tp\s*\+[^+]/.test(app));
  ok('ONCE    an existing value returns unchanged',
    /if \(prev && typeof prev\.tp === 'number'\) return prev\.tp;/.test(app));
}

ok('DROPPED habitStats is gone from the fighter', !/habitStats:/.test(app));
ok('DROPPED nothing reads habitStats', !/\.habitStats/.test(app));

console.log(fails.length ? `\nFAILED: ${fails.join(', ')}` : '\nALL PASS');
process.exit(fails.length ? 1 : 0);
