/* THE MIMIC: the roll, the money, and the blink.
 *
 * Tom, 2026-08-20: "1/3 chests can trigger a fight with this mimic... also make
 * the mimic blink with these frames alternating eyes."
 *
 * THREE THINGS CAN GO WRONG HERE AND EACH HAS ITS OWN WAY OF LOOKING FINE.
 *
 * 1. THE ROLL. "One in three" is easy; one in three that is STABLE is the
 *    requirement. A Math.random() at tap time gives a perfect 33% share and a
 *    chest that is a Mimic, then loot, then a Mimic again on three consecutive
 *    renders. A share check alone passes that build. So the roll is graded on
 *    IDEMPOTENCE first and share second.
 *
 * 2. THE MONEY. A Mimic must not also pay its crate, and a fight you fled must
 *    not become a payout. Both reduce to one property: the Mimic and the loot he
 *    replaced compete for ONE ledger key, and that key can only be claimed once.
 *    This audit proves it in both orders and under concurrency, against the real
 *    IndexedDB, because a kvGet/kvSet version of this exact claim was measured
 *    paying 16,500 coins to three simultaneous callers.
 *
 * 3. THE BLINK. This is the one that lies. A CSS box with the right class and
 *    the right animation-name reads perfectly over three images that never
 *    changed, over a plate that 404ed, and over an animation the headless
 *    compositor never advanced. So the blink is graded ON PIXELS SAMPLED FROM
 *    THE EYE BAND, and the clock is driven with WAAPI currentTime (Chromium
 *    honours a seek on a CSS animation; headless does not advance one on its
 *    own) so "no motion" can never be an artefact of the harness. The sampler
 *    proves it CAN see motion before it grades anything.
 *
 * The arena is reached by playing the game: seeded to the Champion plus five
 * Gauntlet wins so the next rank is 6, which is a Mimic rung, then the real
 * #endlessBtn is clicked. Nothing here calls mimicPlateHtml() directly, because
 * the hop that has broken before is endlessFightCfg dropping a field on the way
 * past, and a harness that calls the drawer itself can never see that.
 *
 *   node tests/mimic-audit.mjs          (self-serves this checkout)
 *   URL=https://... node tests/mimic-audit.mjs
 */
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { boot, seed, openPit, sleep, settle, serveTree } from './godmode.js';

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
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });

  /* ---------------------------------------------------------- 1. THE ROLL */
  const roll = await page.evaluate(async () => {
    const hunt = await import('./js/hunt.js');
    const { isMimicSpawn, MIMIC_SHARE } = await import('./js/mimic.js');
    const date = '2026-08-20';
    // a wide real sample: the generator's own ids, across many cells and every
    // 45-minute instance of a day. An empty or tiny sample is a failure.
    const crates = [], all = [];
    for (let cx = -60; cx <= 60; cx += 3) {
      for (let cy = -60; cy <= 60; cy += 3) {
        for (let mins = 5; mins < 1440; mins += 180) {
          for (const s of hunt.spawnsForCell(date, cx, cy, mins)) {
            all.push(s);
            if (s.type === 'crate') crates.push(s);
          }
        }
      }
    }
    const mimics = crates.filter(isMimicSpawn);
    // never a Mimic on anything that is not a buried crate
    const wrongType = all.filter(s => s.type !== 'crate' && isMimicSpawn(s)).length;

    /* IDEMPOTENCE, the property a random roll cannot have. Re-DERIVE the same
       chest from the generator (which is what a re-render does) and ask again,
       several times. Comparing a cached object to itself would pass on
       Math.random too, so the spawn is rebuilt from (date, cell, mins) each
       round exactly as refreshSpawns rebuilds it. */
    let flips = 0, checked = 0;
    for (let cx = 0; cx < 24; cx++) {
      for (const mins of [5, 185, 365]) {
        const first = hunt.spawnsForCell(date, cx, 7, mins).map(isMimicSpawn);
        for (let round = 0; round < 4; round++) {
          const again = hunt.spawnsForCell(date, cx, 7, mins).map(isMimicSpawn);
          checked += again.length;
          for (let i = 0; i < again.length; i++) if (again[i] !== first[i]) flips++;
        }
      }
    }
    return {
      crates: crates.length, mimics: mimics.length,
      share: crates.length ? +(mimics.length / crates.length).toFixed(4) : 0,
      target: 1 / MIMIC_SHARE, wrongType, flips, checked,
    };
  });
  ok('CONTROL the roll was graded on a real sample of generated chests',
    roll.crates >= 500 && roll.checked >= 500,
    `${roll.crates} buried crates, ${roll.checked} idempotence reads`);
  ok('IDEMPOTENT a chest re-derived from the generator never changes its answer',
    roll.flips === 0, `${roll.flips} flips across ${roll.checked} reads`);
  ok('SHARE about one buried crate in three is a Mimic',
    Math.abs(roll.share - roll.target) < 0.05,
    `${(roll.share * 100).toFixed(1)}% of ${roll.crates} (target ${(roll.target * 100).toFixed(1)}%)`);
  ok('SCOPE nothing but a buried crate is ever a Mimic',
    roll.wrongType === 0, `${roll.wrongType} non-crate spawns rolled Mimic`);

  /* --------------------------------------------------------- 2. THE MONEY */
  const money = await page.evaluate(async () => {
    const hunt = await import('./js/hunt.js');
    const game = await import('./js/game.js');
    const { isMimicSpawn } = await import('./js/mimic.js');
    const date = '2026-08-20';
    // find real Mimic chests out of the real generator
    const found = [];
    for (let cx = 0; cx < 400 && found.length < 3; cx++) {
      for (const s of hunt.spawnsForCell(date, cx, 11, 400)) if (isMimicSpawn(s)) found.push(s);
    }
    if (found.length < 3) return { error: `only found ${found.length} mimic chests to test` };

    // A: the fight wins first. The chest must then pay NOTHING.
    const a = found[0], aKey = hunt.spawnKey(date, a);
    const aWin = await game.award(aKey, 'spawn', 70, 'Boneyard: the Mimic', date);
    const aLoot = await hunt.collectSpawn(a, date);

    // B: the other order. Loot first, the fight must then pay NOTHING.
    const b = found[1], bKey = hunt.spawnKey(date, b);
    const bLoot = await hunt.collectSpawn(b, date);
    const bWin = await game.award(bKey, 'spawn', 70, 'Boneyard: the Mimic', date);

    // C: three simultaneous wins on one chest. Exactly one may pay.
    const c = found[2], cKey = hunt.spawnKey(date, c);
    const cAll = await Promise.all([0, 1, 2].map(() =>
      game.award(cKey, 'spawn', 70, 'Boneyard: the Mimic', date)));

    const rows = await (await import('./js/db.js')).db.all('xp');
    return {
      aWin, aLootPaid: !!aLoot, bLootPaid: !!bLoot, bWin,
      cPaid: cAll.filter(x => x > 0).length,
      aRows: rows.filter(r => r.key === aKey).length,
      cRows: rows.filter(r => r.key === cKey).length,
    };
  });
  ok('CONTROL the money path was graded against real Mimic chests', !money.error, money.error || 'three chests');
  ok('ONE-SHOT a Mimic you beat does not then pay its loot as well',
    money.aWin > 0 && money.aLootPaid === false,
    `fight paid ${money.aWin} xp, chest then paid ${money.aLootPaid ? 'AGAIN' : 'nothing'}`);
  ok('ONE-SHOT and the reverse order is refused too',
    money.bLootPaid === true && money.bWin === 0,
    `chest paid, fight then paid ${money.bWin}`);
  ok('ATOMIC three simultaneous claims on one chest pay exactly once',
    money.cPaid === 1 && money.cRows === 1, `${money.cPaid} of 3 paid, ${money.cRows} ledger row(s)`);

  /* ORDERING, and this one is a lint on purpose. The checks above prove the
     ledger key can only be claimed once; they cannot prove app.js asks the
     question before it pays, and that is the half that would double-pay. Driving
     it for real needs a Mimic chest to survive the walkable-ground snap under a
     faked GPS fix, which is a flaky thing to hang a money guard on.
     So: the collect handler must decide it is a Mimic BEFORE it calls
     collectSpawn. An ORDER of two calls is the assertion, not a class name or a
     copy string, so reformatting cannot drift it red. */
  const src = readFileSync(path.join(ROOT, 'js/app.js'), 'utf8');
  const iAsk = src.indexOf('isMimicSpawn(rec.spawn)');
  const iPay = src.indexOf('await collectSpawn(rec.spawn)');
  ok('ORDER the collect handler asks "is this a Mimic" before it pays anything out',
    iAsk > 0 && iPay > 0 && iAsk < iPay,
    iAsk < 0 ? 'no isMimicSpawn check in the collect handler' :
    iPay < 0 ? 'no collectSpawn call found' : `check at ${iAsk}, payout at ${iPay}`);

  /* ------------------------------------------- 3. THE MAPPER (the drop trap) */
  const cfg = await page.evaluate(async () => {
    const pit = await import('./js/pit.js');
    const out = { mismatch: [], both: [], sample: {} };
    for (let r = 1; r <= 300; r++) {
      const f = pit.endlessFoe(r);
      const drawn = [f.glutton, f.mage, f.mimic, f.wanderer].filter(Boolean).length;
      if (drawn > 1) out.both.push(r);
      // the LAST hop before makeFighter: what openFight actually receives
      const c = window.__endlessCfg ? window.__endlessCfg(r) : null;
      if (!c) { out.mismatch.push(`${r}: no __endlessCfg seam`); continue; }
      for (const k of ['glutton', 'mage', 'mimic', 'wanderer']) {
        if (!!c[k] !== !!f[k]) out.mismatch.push(`${r}.${k}: pit says ${!!f[k]}, the fight gets ${!!c[k]}`);
      }
    }
    out.sample = { r6: pit.endlessFoe(6).name, r13: pit.endlessFoe(13).name,
                   mimicRungs: [6, 12, 18, 24].filter(r => pit.endlessFoe(r).mimic).length,
                   wandererRungs: [13, 26, 39, 52].filter(r => pit.endlessFoe(r).wanderer).length };
    return out;
  });
  ok('CONTROL the Gauntlet actually contains all four bosses',
    cfg.sample.mimicRungs === 4 && cfg.sample.wandererRungs === 4,
    `rank 6 = ${cfg.sample.r6}, rank 13 = ${cfg.sample.r13}`);
  ok('MAPPER every boss flag survives endlessFightCfg into the fight',
    cfg.mismatch.length === 0, cfg.mismatch.slice(0, 4).join('; ') || '300 ranks, no field dropped');
  ok('EXCLUSIVE no rung is ever two bosses at once',
    cfg.both.length === 0, cfg.both.slice(0, 6).join(', ') || '300 ranks checked');

  /* --------------------------------------- 4. THE ARENA, reached by playing */
  await seed(page, {
    level: 30, coins: 5000, champ: true,
    beatRungs: [1, 2, 3, 4, 5],
    // five Gauntlet wins, so the NEXT rank is 6, which is a Mimic rung
    xp: [1, 2, 3, 4, 5].map(r => ({ key: `endless-${r}`, type: 'endless', xp: 50, label: `Gauntlet rank ${r}` })),
  });
  await settle(page, 600);
  await openPit(page);
  const opened = await page.evaluate(() => {
    const b = document.getElementById('endlessBtn');
    if (!b || b.disabled) return { error: b ? 'endlessBtn disabled' : 'no endlessBtn' };
    b.click();
    return { clicked: true };
  });
  await sleep(2600);
  const arena = await page.evaluate(() => {
    const stage = document.getElementById('foeStage');
    if (!stage) return { error: 'no arena' };
    const plate = stage.querySelector('.mimic-plate');
    const base = stage.querySelector('.mimic-base');
    const eyes = [...stage.querySelectorAll('.mimic-eye')];
    const name = document.querySelector('.hud-side.foe .fname')?.textContent.trim();
    return {
      name, hasPlate: !!plate,
      // a broken <img> measures perfectly as a box, so read the DECODE
      baseDecoded: !!(base && base.naturalWidth > 0),
      baseNat: base ? `${base.naturalWidth}x${base.naturalHeight}` : null,
      eyeCount: eyes.length,
      eyesDecoded: eyes.filter(e => e.naturalWidth > 0).length,
      // and the eye band must be positioned over the LID, not the whole plate
      eyeBox: eyes[0] ? (() => {
        const p = plate.querySelector('.mimic-fit').getBoundingClientRect();
        const e = eyes[0].getBoundingClientRect();
        return { l: +((e.left - p.left) / p.width * 100).toFixed(1),
                 t: +((e.top - p.top) / p.height * 100).toFixed(1),
                 w: +(e.width / p.width * 100).toFixed(1) };
      })() : null,
      mirrored: !!stage.querySelector('.mirror-wrap'),
    };
  });
  ok('CONTROL the Gauntlet opened a Mimic fight by clicking its real button',
    !opened.error && !arena.error && /Mimic/.test(arena.name || ''),
    opened.error || arena.error || `foe: ${arena.name}`);
  ok('ARENA the Mimic is drawn from his own plates, and they decode',
    arena.hasPlate && arena.baseDecoded && arena.eyeCount === 2 && arena.eyesDecoded === 2,
    `plate ${arena.baseNat}, ${arena.eyesDecoded}/${arena.eyeCount} eye plates decoded`);
  ok('ARENA the eye band sits on the lid, not over the whole drawing',
    !!arena.eyeBox && arena.eyeBox.w > 30 && arena.eyeBox.w < 46 &&
    arena.eyeBox.l > 14 && arena.eyeBox.l < 23 && arena.eyeBox.t > 8 && arena.eyeBox.t < 16,
    arena.eyeBox ? `left ${arena.eyeBox.l}% top ${arena.eyeBox.t}% width ${arena.eyeBox.w}%` : 'no eye plate');
  ok('ARENA hand-inked art is never mirrored', arena.mirrored === false);

  /* THE ART ITSELF MUST DIFFER, and this is separate from the motion check on
     purpose. Compositing an RGBA overlay onto the plate changes the pixels at
     its antialiased edges EVEN WHEN THE TWO IMAGES ARE IDENTICAL, because the
     alpha coverage doubles. Measured: eye crops regenerated from plate 1 (the
     exact "the eyes never change" defect) still produced 4 distinct renderings
     across a cycle and the motion checks all passed. So the sampler proves the
     animation RUNS and is TIMED like a blink; this proves there is something to
     see. Both are needed; neither is sufficient. */
  const art = await page.evaluate(async () => {
    const load = src => new Promise((res, rej) => {
      const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error(src)); i.src = src;
    });
    const { MIMIC_ART } = await import('./js/mimic.js');
    const [plate, e2, e3] = await Promise.all(
      [MIMIC_ART.plate, MIMIC_ART.eyes2, MIMIC_ART.eyes3].map(load));
    // the band's rect inside the 640x518 plate, the same numbers the CSS uses
    const BOX = { x: 117, y: 61, w: 244, h: 78 };
    const px = img => {
      const c = document.createElement('canvas');
      c.width = BOX.w; c.height = BOX.h;
      const g = c.getContext('2d', { willReadFrequently: true });
      if (img.naturalWidth === BOX.w) g.drawImage(img, 0, 0);
      else g.drawImage(img, BOX.x, BOX.y, BOX.w, BOX.h, 0, 0, BOX.w, BOX.h);
      return g.getImageData(0, 0, BOX.w, BOX.h).data;
    };
    const diff = (a, b) => { let n = 0; for (let i = 0; i < a.length; i += 4)
      if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 16) n++;
      return n; };
    const P = px(plate), A = px(e2), B = px(e3);
    return { total: BOX.w * BOX.h, openVsShut: diff(P, A), openVsHalf: diff(P, B), shutVsHalf: diff(A, B),
             sizes: [e2.naturalWidth + 'x' + e2.naturalHeight, e3.naturalWidth + 'x' + e3.naturalHeight] };
  });
  ok('ART the two eye plates each really differ from the open-eyed plate',
    art.openVsShut > 200 && art.openVsHalf > 200,
    `${art.openVsShut} and ${art.openVsHalf} differing px of ${art.total}`);
  ok('ART and they differ from EACH OTHER, so the eyes alternate rather than toggle',
    art.shutVsHalf > 200, `${art.shutVsHalf} differing px, crops ${art.sizes.join(' / ')}`);

  /* ------------------------------------------------- 5. THE BLINK, IN PIXELS */
  /* The clock is DRIVEN, not waited on. Headless Chrome does not advance a CSS
     animation for a screenshot, so a real-time sampler reports "no motion" on a
     perfectly good blink. Seeking currentTime on the CSS animation is honoured
     in Chromium and is the only way to sample a known phase. */
  const clip = await page.evaluate(() => {
    const e = document.querySelector('#foeStage .mimic-eye');
    if (!e) return null;
    const r = e.getBoundingClientRect();
    return { x: Math.max(0, Math.floor(r.left)), y: Math.max(0, Math.floor(r.top)),
             width: Math.ceil(r.width), height: Math.ceil(r.height) };
  });
  const anims = await page.evaluate(() => {
    const els = [...document.querySelectorAll('#foeStage .mimic-eye')];
    const a = els.flatMap(el => el.getAnimations());
    return { count: a.length, names: a.map(x => x.animationName || (x.effect && x.effect.getComputedTiming && 'css')),
             dur: a.map(x => x.effect.getComputedTiming().duration) };
  });
  const PERIOD = anims.dur[0] || 5200;
  const STEP = 50;
  /* FREEZE THE WHOLE PAGE FIRST. The first run of this sampler reported 2050ms
     of "blink" in a 5200ms cycle and the timeline showed the eye band changing
     from 100ms to 1850ms, which the keyframes cannot do. It was not the blink:
     the ARENA was still playing its entrance under a fixed screen clip while
     each screenshot burned ~80ms of wall clock, so the early samples caught the
     foe still moving. Pausing only the animation under test measures every OTHER
     animation in real time and attributes it to the one you are grading. */
  await page.evaluate(() => { for (const a of document.getAnimations()) a.pause(); });
  await sleep(400);
  const shots = [];
  for (let t = 0; t < PERIOD; t += STEP) {
    await page.evaluate(ms => {
      for (const a of document.getAnimations()) a.pause();
      for (const el of document.querySelectorAll('#foeStage .mimic-eye'))
        for (const a of el.getAnimations()) { a.pause(); a.currentTime = ms; }
    }, t);
    const buf = await page.screenshot({ clip, encoding: 'binary' });
    shots.push({ t, hash: Buffer.from(buf).toString('base64').slice(0, 64), len: buf.length });
  }
  const distinct = [...new Set(shots.map(s => s.hash))];
  // group the timeline into runs, so the report says WHEN each plate is showing
  const runs = [];
  for (const s of shots) {
    const id = distinct.indexOf(s.hash);
    if (runs.length && runs[runs.length - 1].id === id) runs[runs.length - 1].end = s.t + STEP;
    else runs.push({ id, start: s.t, end: s.t + STEP });
  }
  const openRun = runs.reduce((a, r) => (r.end - r.start) > (a.end - a.start) ? r : a, runs[0]);
  const blinkMs = runs.filter(r => r.id !== openRun.id).reduce((a, r) => a + (r.end - r.start), 0);
  console.log(`      blink timeline (period ${PERIOD}ms, sampled every ${STEP}ms):`);
  for (const r of runs) console.log(`        ${String(r.start).padStart(5)}-${String(r.end).padStart(5)}ms  plate#${r.id}${r.id === openRun.id ? '  (eyes open)' : ''}`);

  ok('CONTROL the sampler can see motion at all (an all-identical sample is a broken capture, not a still image)',
    distinct.length > 1, `${distinct.length} distinct renderings across ${shots.length} samples`);
  ok('BLINK three distinct plates across one cycle, so the eyes alternate',
    distinct.length >= 3, `${distinct.length} distinct renderings`);
  ok('BLINK it is a blink, not a strobe: the eyes are open for most of the cycle',
    blinkMs > 150 && blinkMs < PERIOD * 0.15,
    `${blinkMs}ms of blink in a ${PERIOD}ms cycle (${(blinkMs / PERIOD * 100).toFixed(1)}%)`);
  ok('BLINK the cycle is slow enough to read as a character, not a flicker',
    PERIOD >= 2000, `${PERIOD}ms`);

  /* -------------------------------------------------- 6. REDUCED MOTION */
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await sleep(400);
  /* READ THE COMPUTED STYLE, NOT THE STYLESHEET TEXT. A regex over the CSS goes
     red the day somebody reformats a rule and green the day a selector stops
     matching, which is the wrong failure in both directions. What matters is
     what the element ends up with. */
  const rm = await page.evaluate(() => {
    const el = document.querySelector('#foeStage .mimic-eye');
    if (!el) return { error: 'no eye plate' };
    const cs = getComputedStyle(el);
    const secs = String(cs.animationDuration).split(',')
      .map(v => v.trim().endsWith('ms') ? parseFloat(v) / 1000 : parseFloat(v));
    return {
      name: cs.animationName,
      durations: secs,
      running: el.getAnimations().length,
      /* THE HAZARD IS A SHORT DURATION *AND* AN INFINITE COUNT, not a short
         duration. app.css:662 deliberately collapses every duration to 0.001s
         under reduce AND caps animation-iteration-count at 1, which is what
         actually stops a loop; its own comment says so, and it was measured.
         Grading the duration alone would go red on that healthy, intentional
         rule while a genuine 1ms infinite loop somewhere else passed. */
      iters: String(cs.animationIterationCount).split(',').map(v => v.trim()),
      collapsed: String(cs.animationIterationCount).split(',').map(v => v.trim())
        .some((c, i) => c === 'infinite' && secs[i] > 0 && secs[i] < 0.1),
    };
  });
  const rmShots = [];
  for (const t of [0, PERIOD * 0.5, PERIOD * 0.95, PERIOD * 0.97]) {
    await page.evaluate(ms => {
      for (const el of document.querySelectorAll('#foeStage .mimic-eye'))
        for (const a of el.getAnimations()) { a.pause(); a.currentTime = ms; }
    }, t);
    const buf = await page.screenshot({ clip, encoding: 'binary' });
    rmShots.push(Buffer.from(buf).toString('base64').slice(0, 64));
  }
  ok('REDUCED reduced motion disables the blink outright',
    !rm.error && rm.name === 'none' && rm.running === 0,
    rm.error || `animation-name: ${rm.name}, ${rm.running} running animation(s)`);
  ok('REDUCED and never by collapsing the duration, which runs the loop 1000x a second',
    rm.collapsed === false,
    `durations: ${(rm.durations || []).join(', ')}s, iterations: ${(rm.iters || []).join(', ')}`);
  ok('REDUCED measured: the eye band does not change under reduce',
    new Set(rmShots).size === 1, `${new Set(rmShots).size} distinct renderings`);
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }]);

  ok('NO PAGE ERRORS', errs.length === 0, errs.slice(0, 2).join(' | '));
} finally {
  await browser.close();
  if (srv) await srv.close();
}
console.log(fails ? '\nMIMIC AUDIT FAILED' : '\nMIMIC AUDIT VERIFIED');
process.exit(fails);
