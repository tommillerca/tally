/* THE WANDERER IN THE BONEYARD: the rule, the money, and the ceiling.
 *
 * He was the rarest and hardest rung in the Gauntlet and had no presence on the
 * walking map at all. Now one RARE spawn in four has him standing over it. Three
 * things can go wrong with that, and each has its own way of looking fine.
 *
 * 1. THE RULE. "One in four" is easy; one in four that is STABLE is the
 *    requirement. A Math.random() at tap time gives a perfect share and an egg
 *    that is guarded, then free, then guarded again across three of the map's
 *    5-second refreshWorld passes. So the rule is graded on IDEMPOTENCE first
 *    and share second, by RE-DERIVING each spawn from the generator the way a
 *    re-render does, never by asking a cached object about itself.
 *
 * 2. THE MONEY. He must not also pay the egg he was standing on, and a fight you
 *    fled must not become a payout. Both reduce to one property: the Wanderer
 *    and the rare he replaced compete for ONE ledger key, and that key can only
 *    be claimed once. Proven in both orders and under concurrency against the
 *    real IndexedDB, because a kvGet/kvSet version of this exact claim was once
 *    measured paying 16,500 coins to three simultaneous callers.
 *
 * 3. THE CEILING. This is the one with history. denWinsCount() counts
 *    `bossfirst-` rows and endlessCeiling = 7 + 3 x that, and Tom has reported
 *    this area broken three separate times. A Boneyard Wanderer rides a spawn
 *    slot that re-rolls every 45 minutes, so he is unlimited per day and mints
 *    NO marker: the decision is written where the claim happens (js/app.js, the
 *    mode 'wanderer' settle branch) and asserted here in two ways, behaviourally
 *    and by reading the branch. The behavioural row carries its own CONTROL,
 *    because "the ceiling did not move" also passes on a broken instrument.
 *
 * WHAT THIS DOES NOT DO, on purpose: it does not drive a tap on the real map.
 * Reaching a guarded egg for real needs a rare spawn to survive the
 * walkable-ground snap under a faked GPS fix on a machine with live vector
 * tiles, which is a flaky thing to hang a money guard on (the same call
 * tests/mimic-audit.mjs made). The two hops that a fake could hide are covered
 * as source ORDER and FACE lints instead: an order of two calls and the presence
 * of a flag, never a class name or a copy string, so reformatting cannot drift
 * them red.
 *
 *   node tests/wanderer-boneyard-audit.mjs        (self-serves this checkout)
 *   URL=https://... node tests/wanderer-boneyard-audit.mjs
 */
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { boot, seed, serveTree } from './godmode.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let fails = 0;
const ok = (label, pass, detail = '') => {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}${detail ? `  | ${detail}` : ''}`);
  if (!pass) fails = 1;
};

const srv = process.env.URL ? null : await serveTree(ROOT);
const base = process.env.URL || srv.url;
console.log(`URL UNDER TEST  ${base}`);
const { browser, page } = await boot(base, { seed: true });
const errs = [];
page.on('pageerror', e => errs.push(String(e)));

try {
  /* ---------------------------------------------------------- 1. THE RULE */
  const rule = await page.evaluate(async () => {
    const hunt = await import('./js/hunt.js');
    const { isWandererSpawn, WANDERER_SHARE } = await import('./js/wanderer.js');
    const { isMimicSpawn } = await import('./js/mimic.js');
    const date = '2026-08-21';
    // a wide real sample out of the generator's own ids: many cells, every
    // 45-minute instance of a day. An empty or tiny sample is a failure.
    const rares = [], all = [];
    let cellInstances = 0;
    for (let cx = -90; cx <= 90; cx += 3) {
      for (let cy = -90; cy <= 90; cy += 3) {
        for (let mins = 5; mins < 1440; mins += 90) {
          cellInstances++;
          for (const s of hunt.spawnsForCell(date, cx, cy, mins)) {
            all.push(s);
            if (s.type === 'rare') rares.push(s);
          }
        }
      }
    }
    const wanderers = all.filter(isWandererSpawn);
    const mimics = all.filter(isMimicSpawn);
    // never a Wanderer on anything that is not a rare spawn
    const wrongType = all.filter(s => s.type !== 'rare' && isWandererSpawn(s)).length;
    // and never both bosses on one spawn
    const both = all.filter(s => isWandererSpawn(s) && isMimicSpawn(s)).length;

    /* IDEMPOTENCE, the property a random roll cannot have. Rebuild the spawns
       from (date, cell, mins) each round, exactly as refreshSpawns rebuilds
       them, and ask again. Comparing a cached object to itself would pass on
       Math.random too. */
    let flips = 0, checked = 0;
    for (let cx = 0; cx < 60; cx++) {
      for (const mins of [5, 185, 365]) {
        const first = hunt.spawnsForCell(date, cx, 7, mins).map(isWandererSpawn);
        for (let round = 0; round < 4; round++) {
          const again = hunt.spawnsForCell(date, cx, 7, mins).map(isWandererSpawn);
          checked += again.length;
          for (let i = 0; i < again.length; i++) if (again[i] !== first[i]) flips++;
        }
      }
    }
    return {
      rares: rares.length, wanderers: wanderers.length, mimics: mimics.length, cellInstances,
      share: rares.length ? +(wanderers.length / rares.length).toFixed(4) : 0,
      target: 1 / WANDERER_SHARE, wrongType, both, flips, checked,
    };
  });
  ok('CONTROL the rule was graded on a real sample of generated spawns',
    rule.rares >= 300 && rule.checked >= 500,
    `${rule.rares} rare spawns over ${rule.cellInstances} cell-instances, ${rule.checked} idempotence reads`);
  ok('IDEMPOTENT an egg re-derived from the generator never changes its answer',
    rule.flips === 0, `${rule.flips} flips across ${rule.checked} reads`);
  ok('SHARE about one rare spawn in four is the Wanderer',
    Math.abs(rule.share - rule.target) < 0.05,
    `${(rule.share * 100).toFixed(1)}% of ${rule.rares} (target ${(rule.target * 100).toFixed(1)}%)`);
  ok('SCOPE nothing but a rare spawn is ever the Wanderer',
    rule.wrongType === 0, `${rule.wrongType} non-rare spawns rolled Wanderer`);
  ok('EXCLUSIVE no spawn is ever the Wanderer AND the Mimic',
    rule.both === 0, `${rule.both} spawns claimed by both`);
  /* THE RARITY ROW. His whole identity on the ladder is that he is the rarest
     thing on it, and a share alone cannot say whether that survived the move
     outdoors: rares are themselves scarce, so 1-in-4 of them is a very
     different frequency from 1-in-3 buried crates. Measured against the Mimic
     on the same sample, this goes red if anyone bumps his share. */
  ok('RAREST he shows up less often than the Mimic, which is his whole identity',
    rule.wanderers > 0 && rule.wanderers < rule.mimics,
    `${(rule.wanderers / rule.cellInstances).toFixed(4)} Wanderers vs ` +
    `${(rule.mimics / rule.cellInstances).toFixed(4)} Mimics per cell-instance ` +
    `(${(rule.mimics / Math.max(1, rule.wanderers)).toFixed(1)}x rarer)`);

  /* --------------------------------------------------------- 2. THE MONEY */
  const money = await page.evaluate(async () => {
    const hunt = await import('./js/hunt.js');
    const game = await import('./js/game.js');
    const { isWandererSpawn } = await import('./js/wanderer.js');
    const date = '2026-08-21';
    // find real guarded eggs out of the real generator
    const found = [];
    for (let cx = 0; cx < 4000 && found.length < 3; cx++) {
      for (const s of hunt.spawnsForCell(date, cx, 11, 400)) if (isWandererSpawn(s)) found.push(s);
    }
    if (found.length < 3) return { error: `only found ${found.length} guarded eggs to test` };

    // A: the fight wins first. The egg must then pay NOTHING.
    const a = found[0], aKey = hunt.spawnKey(date, a);
    const aWin = await game.award(aKey, 'spawn', 150, 'Boneyard: the Wanderer', date);
    const aLoot = await hunt.collectSpawn(a, date);

    // B: the other order. Loot first, the fight must then pay NOTHING.
    const b = found[1], bKey = hunt.spawnKey(date, b);
    const bLoot = await hunt.collectSpawn(b, date);
    const bWin = await game.award(bKey, 'spawn', 150, 'Boneyard: the Wanderer', date);

    // C: three simultaneous wins on one egg. Exactly one may pay.
    const c = found[2], cKey = hunt.spawnKey(date, c);
    const cAll = await Promise.all([0, 1, 2].map(() =>
      game.award(cKey, 'spawn', 150, 'Boneyard: the Wanderer', date)));

    const rows = await (await import('./js/db.js')).db.all('xp');
    return {
      aWin, aLootPaid: !!aLoot, bLootPaid: !!bLoot, bWin,
      cPaid: cAll.filter(x => x > 0).length,
      cRows: rows.filter(r => r.key === cKey).length,
    };
  });
  ok('CONTROL the money path was graded against real guarded eggs', !money.error, money.error || 'three eggs');
  ok('ONE-SHOT a Wanderer you beat does not then pay his egg as well',
    money.aWin > 0 && money.aLootPaid === false,
    `fight paid ${money.aWin} xp, the egg then paid ${money.aLootPaid ? 'AGAIN' : 'nothing'}`);
  ok('ONE-SHOT and the reverse order is refused too',
    money.bLootPaid === true && money.bWin === 0,
    `egg paid, fight then paid ${money.bWin}`);
  ok('ATOMIC three simultaneous claims on one egg pay exactly once',
    money.cPaid === 1 && money.cRows === 1, `${money.cPaid} of 3 paid, ${money.cRows} ledger row(s)`);

  /* ------------------------------------------------------- 3. THE CEILING */
  const capNow = () => page.evaluate(async () => {
    const poi = await import('./js/poi.js');
    const pit = await import('./js/pit.js');
    const wins = await poi.denWinsCount();
    return { wins, ceiling: pit.endlessCeiling(wins) };
  });
  const before = await capNow();
  ok('SAMPLE a starting ceiling was read', Number.isInteger(before.ceiling) && before.ceiling >= 7,
    `${before.wins} wins, ceiling ${before.ceiling}`);
  // beat five more Wanderers, exactly as the settle claims them
  await page.evaluate(async () => {
    const hunt = await import('./js/hunt.js');
    const game = await import('./js/game.js');
    const { isWandererSpawn } = await import('./js/wanderer.js');
    const date = '2026-08-21';
    let n = 0;
    for (let cx = 5000; cx < 12000 && n < 5; cx++) {
      for (const s of hunt.spawnsForCell(date, cx, 11, 400)) {
        if (!isWandererSpawn(s)) continue;
        await game.award(hunt.spawnKey(date, s), 'spawn', 150, 'Boneyard: the Wanderer', date);
        n++;
      }
    }
    window.__wandererWins = n;
  });
  const beaten = await page.evaluate(() => window.__wandererWins);
  const after = await capNow();
  ok('CONTROL enough Boneyard Wanderers were actually beaten to move a ceiling',
    beaten >= 5, `${beaten} wins claimed`);
  ok('CEILING beating Boneyard Wanderers does NOT raise the Gauntlet ceiling',
    after.ceiling === before.ceiling && after.wins === before.wins,
    `${before.ceiling} -> ${after.ceiling} after ${beaten} wins`);
  /* THE CONTROL FOR THE ROW ABOVE. "The ceiling did not move" is exactly what a
     broken denWinsCount, a dead endlessCeiling or a ledger that never wrote
     would also report. So move it on purpose, through the one path that IS
     supposed to move it, in the same session and with the same instrument. */
  await page.evaluate(async () => { const poi = await import('./js/poi.js'); await poi.claimGluttonWin('2026-08-21', 0); });
  const control = await capNow();
  ok('CONTROL and the instrument can move: the Glutton still raises it by 3',
    control.ceiling === after.ceiling + 3, `${after.ceiling} -> ${control.ceiling}`);

  /* --------------------------------------------- 4. THE WIRING, at source */
  const src = readFileSync(path.join(ROOT, 'js/app.js'), 'utf8');

  /* ORDER, a lint on purpose. The checks above prove the ledger key can only be
     claimed once; they cannot prove app.js asks the question BEFORE it pays, and
     that is the half that would double-pay. An ORDER of two calls is the
     assertion, not a class name or a copy string. */
  const iAsk = src.indexOf('isWandererSpawn(rec.spawn)');
  const iPay = src.indexOf('await collectSpawn(rec.spawn)');
  ok('ORDER the collect handler asks "is this the Wanderer" before it pays anything out',
    iAsk > 0 && iPay > 0 && iAsk < iPay,
    iAsk < 0 ? 'no isWandererSpawn check in the collect handler' :
    iPay < 0 ? 'no collectSpawn call found' : `check at ${iAsk}, payout at ${iPay}`);

  /* FACE. Without `wanderer: true` on the cfg, openFight falls through to the
     coin-flip generator and the rarest boss on the map arrives as a random
     skeleton. That is the drop that cost the Gauntlet its roster look, it is
     silent, and it is a field in an object literal, so it is read here. */
  const branch = iAsk > 0 ? src.slice(iAsk, src.indexOf('await collectSpawn(rec.spawn)', iAsk)) : '';
  ok('FACE the Boneyard Wanderer fight carries his own drawing into the arena',
    /mode:\s*'wanderer'/.test(branch) && /\bwanderer:\s*true\b/.test(branch),
    branch ? `${branch.length} chars of handler read` : 'the handler branch could not be located');

  /* KEY. The money rows above prove the ledger refuses a second claim on ONE
     key; they cannot prove the fight claims the EGG'S key rather than minting a
     `wandererwin-` one of its own. Mint a separate key and both the boss and the
     egg pay, with every row above still green. So the handler must derive it
     from spawnKey, and the settle must claim that same field. */
  ok('KEY the fight claims the egg\'s OWN ledger key, so the boss and the loot cannot both pay',
    /claimKey\s*=\s*spawnKey\(date, spawn\)/.test(branch) && /\bclaimKey,/.test(branch),
    branch ? 'claimKey = spawnKey(date, spawn), carried into the fight' : 'no handler branch');

  /* THE CEILING DECISION, READ OFF THE BRANCH THAT CLAIMS THE WIN. The
     behavioural row above goes red if a marker is minted; this one names WHERE,
     so the next person to add a mint has to argue with a check that points at
     their line. */
  /* The SETTLE occurrence, not the first one: `foeCfg.mode === 'wanderer'` also
     appears in the fromMap line thousands of lines earlier, and anchoring on
     that swallowed 88k characters of unrelated app and read six award calls. */
  const iSettle = src.indexOf("else if (foeCfg.mode === 'wanderer')");
  const settleEnd = src.indexOf("dispatchEvent(new CustomEvent('bh-wanderer-beaten'", iSettle);
  const settle = iSettle > 0 && settleEnd > iSettle ? src.slice(iSettle, settleEnd) : '';
  /* COMMENTS STRIPPED BEFORE THE READ, and the strip is itself checked. The
     decision is WRITTEN OUT in that branch's comment, which names bossfirst
     four times; grading the raw text would go red on the very explanation the
     next reader needs. What must contain no mint is the CODE. */
  const settleCode = settle.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '').trim();
  const awards = (settleCode.match(/await award\(/g) || []).length;
  ok('CONTROL the wanderer settle branch was located by its boundaries (an empty read is a FAILURE)',
    settle.length > 200 && settle.length < 4000 && settleCode.length > 80,
    `${settle.length} chars, ${settleCode.length} once the comment is stripped, ends at its own bh-wanderer-beaten dispatch`);
  ok('CEILING the settle branch mints no bossfirst marker: one claim, on the spawn key',
    !!settleCode && !/bossfirst/i.test(settleCode) && awards === 1 && /foeCfg\.claimKey/.test(settleCode),
    `${awards} award call(s), ${/bossfirst/i.test(settleCode) ? 'MINTS bossfirst' : 'no bossfirst mint'}`);

  ok('NO PAGE ERRORS', errs.length === 0, errs.slice(0, 2).join(' | '));
} finally {
  await browser.close();
  if (srv) await srv.close();
}
console.log(fails ? '\nWANDERER BONEYARD AUDIT FAILED' : '\nWANDERER BONEYARD AUDIT VERIFIED');
process.exit(fails);
