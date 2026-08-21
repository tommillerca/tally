/* THE MIMIC: the roll, the money, and the blink.
 *
 * Tom, 2026-08-20: "1/3 chests can trigger a fight with this mimic... also make
 * the mimic blink with these frames alternating eyes." And 2026-08-21, on the
 * beat before that fight: "do something similar for the mimic but not quite as
 * intense."
 *
 * FOUR THINGS CAN GO WRONG HERE AND EACH HAS ITS OWN WAY OF LOOKING FINE.
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
 * 4. THE REVEAL, AND HOW SMALL IT IS. Tom, 2026-08-21: "do something similar
 *    for the mimic but not quite as intense." Both halves of that are gradeable
 *    and neither is gradeable off a stylesheet, so the REVEAL section drives the
 *    real overlay over the real, lit app and measures the frames it puts on
 *    screen through a CDP screencast (page.screenshot costs about 340ms here,
 *    which sampled a 2.06s beat six times and could not have seen a 60ms flash
 *    sitting between two samples).
 *    "Not as intense" is pinned as four measurements against the encounter it is
 *    meant to be smaller than: no choice at all, a scrim bounded on BOTH sides, a
 *    sequence that only ever darkens, and a length under 60% of the Wanderer's,
 *    derived from js/wanderer.js's own exported constants rather than from a
 *    number typed in here.
 *
 * PROVEN RED, 2026-08-21, each mutation in its own `cp -R` throwaway copy and
 * never in the worktree. Every row in the REVEAL section was shown to fail on a
 * real defect and to come back green without it:
 *   CONTROL   showMimicReveal never appends its overlay
 *             -> FAIL, 204 frames of the untouched app, dom.error, 7 more rows red
 *   REVEAL    the two centred labels it replaced, and no talk box
 *             -> FAIL, "0 talk box(es), typed <empty>"
 *   REVEAL    the loop's filename typo'd to mimic-loop-MISSING.gif
 *             -> FAIL, "decoded=false covers=true"
 *   SMALLER   Fight/Flee buttons added to the overlay
 *             -> FAIL, "2 button(s)"
 *   SMALLER   the scrim replaced with the Wanderer's opaque #05040a
 *             -> FAIL, "mean 4.98 std 0 ... 0.0% of the ground's contrast survives".
 *             THIS ONE FOUND A HOLE IN THE ROW ITSELF: the first version asserted
 *             only the dark side, so a full blackout PASSED a row titled "not a
 *             blackout". Anti-regression rule 11, which is about knowing WHICH
 *             direction is failure. It is bounded both ways now, and the floor
 *             sits between two measured numbers: scrim 1.73, blackout 0.00.
 *   SMALLER   the Wanderer's bright/black flash borrowed onto the cover
 *             -> FAIL, "biggest brightening between consecutive frames 230.2 luma"
 *   SMALLER   MIMIC_REVEAL_MS padded to 3400
 *             -> FAIL, "3663ms to the handover against his 5128ms"
 *             and the hold cut under the GIF's own cycle, to 900ms
 *             -> FAIL, "1163ms to the handover ... (floor 1800ms)"
 *   COVER     the old behaviour restored: el.remove() before resolving
 *             -> FAIL, "overlay=false ... cover frame 41.16 mean, 66.63 std behind",
 *             which is the map, measured, back on screen at the handover
 *   HANDOVER  app.js dismisses before it builds the arena
 *             -> FAIL, "the reveal is never dismissed, so the cover never lifts"
 *   SKIP      the tap wired straight to finish(), eating the sentence
 *             -> FAIL, 'after tap 1: "The chest was ne..." snapped=true'
 *   REDUCED   the BOTH fill mode dropped from the cover's animation
 *             -> FAIL, "screen 16.74 mean luma behind a 49.88 lit one": under
 *             reduce the collapsed animation lands back on opacity 0 and the
 *             handover uncovers the map
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
import { boot, seed, openPit, sleep, settle, serveTree, dismissOverlays } from './godmode.js';

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

  /* ------------------------------------ 4. THE REVEAL, AND HOW SMALL IT IS */
  /* Tom, 2026-08-21: "do something similar for the mimic but not quite as
     intense." Both halves of that are gradeable and neither is gradeable from a
     stylesheet, so this section drives the REAL overlay over the REAL app and
     measures the frames it puts on screen.
     The ground underneath matters: this runs before the Gauntlet is opened, so
     what the scrim is covering is the app's own Today screen, which is the
     surface the complaint was about. */
  /* CLEAR THE GROUND FIRST, LITERALLY. The money section above awards XP against
     the real database, which puts a full-screen LEVEL UP card on Today: that card
     is dark and nearly empty, so measuring the scrim against IT would grade a
     scrim over a black screen and every ratio below would be meaningless. */
  await dismissOverlays(page);
  await settle(page, 600);
  const meter = await browser.newPage();
  await meter.goto('data:text/html,<body></body>');
  /* Reduce a screenshot to mean and standard deviation over a fractional band of
     the frame. std is the term that matters for a scrim: a mean can be dragged
     anywhere by a tint, while std is how much of the screen underneath is still
     legible as SHAPES. Decoded in a throwaway page, because the page under test
     is the subject of the measurement and must not be asked to do arithmetic
     mid-animation. */
  const lum = (b64, band = [0, 1]) => meter.evaluate(async (data, lo, hi) => {
    const img = new Image();
    // jpeg: every frame graded here comes off the screencast, ground included
    img.src = 'data:image/jpeg;base64,' + data;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0);
    const stat = (lo2, hi2) => {
      const y0 = Math.floor(img.height * lo2), y1 = Math.ceil(img.height * hi2);
      const d = g.getImageData(0, y0, c.width, y1 - y0).data;
      let s = 0, s2 = 0, n = 0;
      for (let i = 0; i < d.length; i += 4) {
        const v = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        s += v; s2 += v * v; n++;
      }
      const m = s / n;
      return { mean: +m.toFixed(2), std: +Math.sqrt(Math.max(0, s2 / n - m * m)).toFixed(2), n };
    };
    // both in ONE decode: the sampler runs against a live animation and a second
    // round trip per frame costs it a third of its frames.
    return { ...stat(lo, hi), full: stat(0, 1).mean };
  }, b64, band[0], band[1]);

  /* The bottom eighth: the tab bar. Away from the chest and away from the talk
     box, so what it measures is the SCREEN BEHIND and nothing the reveal draws. */
  const GROUND = [0.88, 1];

  /* CDP SCREENCAST, NOT page.screenshot, AND THE REASON IS THE STROBE ROW.
     A screenshot on this machine costs about 340ms, which sampled a 2.06s beat
     six times: a 60ms flash could sit between two of those samples and the row
     would report "only ever darkens" about a strobe. The screencast is the
     compositor's own output at frame rate, with each frame's own timestamp, so
     the trace below is what the player saw rather than a subsample of it. */
  const cdp = await page.createCDPSession();
  const frames = [];
  cdp.on('Page.screencastFrame', async ({ data, metadata, sessionId }) => {
    frames.push({ t: metadata.timestamp, data });
    try { await cdp.send('Page.screencastFrameAck', { sessionId }); } catch { /* stopped */ }
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, everyNthFrame: 1 });

  const startReveal = () => page.evaluate(async () => {
    document.querySelectorAll('.mimic-reveal').forEach(n => n.remove());
    const m = await import('./js/mimic.js');
    window.__mimicAt = null; window.__mimicRet = null;
    const t0 = performance.now();
    /* NOT awaited: it does not settle until the beat is over, and the sampling
       below is what has to happen while it runs. */
    Promise.resolve(m.showMimicReveal({ reduced: false })).then(r => {
      window.__mimicAt = performance.now() - t0;
      window.__mimicRet = r;
    });
    return { line: m.MIMIC_LINE, floor: m.MIMIC_REVEAL_MS };
  });

  /* The lit screen, captured through the SAME encoder as the trace so the two
     sides of every ratio below are comparable. */
  await sleep(700);
  const groundFrame = frames[frames.length - 1];

  const rev = await startReveal();
  const tRev = Date.now() / 1000;
  /* SAMPLE IN REAL TIME. Every other pixel row in this file drives the clock
     with WAAPI because it is grading one looping animation at a known phase.
     This one is grading PACING, so the clock has to be the real one. */
  let dom = null;
  const t0 = Date.now();
  while (Date.now() - t0 < 6000) {
    if (!dom && Date.now() - t0 > 700) {
      dom = await page.evaluate(() => {
        const el = document.querySelector('.mimic-reveal');
        if (!el) return { error: 'no overlay' };
        return {
          boxes: el.querySelectorAll('.talkbox').length,
          cls: el.querySelector('.talkbox')?.className || '',
          txt: el.querySelector('.tb-txt')?.textContent || '',
          label: el.querySelector('.talkbox')?.getAttribute('aria-label') || '',
          buttons: el.querySelectorAll('button, .btn').length,
          gif: el.querySelector('img')?.getAttribute('src') || '',
          gifDecoded: !!(el.querySelector('img')?.naturalWidth > 0),
          covers: (() => { const b = el.getBoundingClientRect();
            return b.width >= innerWidth - 1 && b.height >= innerHeight - 1; })(),
        };
      });
    }
    if (await page.evaluate(() => window.__mimicAt != null)) break;
    await sleep(60);
  }
  const atResolve = await page.evaluate(() => ({
    ms: window.__mimicAt,
    dismissable: typeof (window.__mimicRet || {}).dismiss === 'function',
    overlay: !!document.querySelector('.mimic-reveal'),
    opacity: (() => { const el = document.querySelector('.mimic-reveal');
      return el ? Number(getComputedStyle(el).opacity) : 0; })(),
  }));
  await sleep(220);   // a few frames of the handover's hold frame
  await cdp.send('Page.stopScreencast').catch(() => {});
  await page.evaluate(() => window.__mimicRet && window.__mimicRet.dismiss());
  await sleep(400);

  /* Decoded AFTER the fact: the sampler must not be doing arithmetic while the
     thing it is sampling is on screen. */
  const ground = await lum(groundFrame.data, GROUND);
  const trace = [];
  for (const f of frames) {
    if (f.t < tRev) continue;
    trace.push({ ms: Math.round((f.t - tRev) * 1000), ...(await lum(f.data, GROUND)) });
  }
  const coverShot = trace[trace.length - 1];
  console.log(`      reveal luminance trace (${trace.length} frames, whole frame / the screen behind):`);
  for (const s of trace) console.log(`        ${String(s.ms).padStart(5)}ms  full ${String(s.full).padStart(6)}   behind ${String(s.mean).padStart(6)} (std ${s.std})`);

  ok('CONTROL the reveal was graded against a real, lit screen (an empty trace or a black ground would make every row below vacuous)',
    trace.length >= 20 && ground.mean > 20 && ground.std > 12 && !dom?.error,
    `${trace.length} frames sampled over ${trace.length ? trace[trace.length - 1].ms : 0}ms, ground mean ${ground.mean} std ${ground.std}`);

  ok('REVEAL one line, through the app\'s one typing path, and no second typer',
    dom && dom.boxes === 1 && /mimic-enc-box/.test(dom.cls) && rev.line.length > 10
      && rev.line.startsWith(dom.txt) && dom.label === rev.line,
    dom ? `${dom.boxes} talk box(es), typed "${dom.txt}"` : '-');

  ok('REVEAL it is the chest, full screen, and Cam\'s loop really decoded',
    dom && dom.covers && /mimic-loop\.gif$/.test(dom.gif) && dom.gifDecoded,
    dom ? `${dom.gif} decoded=${dom.gifDecoded} covers=${dom.covers}` : '-');

  /* THE AMBUSH OFFERS NO WAY OUT. The Wanderer's Flee is free because nobody
     asked for him; you DID ask for this crate. A button here would hand the trap
     an escape hatch and flatten the difference between the two encounters. */
  ok('SMALLER no choice: the trap has already sprung, so there is nothing to press',
    dom && dom.buttons === 0, dom ? `${dom.buttons} button(s)` : '-');

  /* THE WINDOW IS TIME, NOT AN INDEX. The scrim fades up over 220ms and the
     cover closes over the last 260ms; grading either of those ramps would grade
     a transition rather than the state. Both ends are excluded by the clock, so
     a slower machine cannot slide a fade frame into the sample. */
  const scrim = trace.filter(s => s.ms > 400 && s.ms < atResolve.ms - 320);
  const worst = scrim.reduce((a, s) => (s.std > a.std ? s : a), scrim[0] || { std: 1e9, mean: 1e9, full: 0 });
  /* BOUNDED ON BOTH SIDES, and the first version of this row was not, which the
     prove-red caught: it read "a scrim, not a blackout" while asserting only the
     dark side, so painting the Wanderer's opaque #05040a over the map passed it
     with 0.0% of the ground surviving. Anti-regression rule 11 is exactly this.
     A blackout measures std 0.00 in this band (measured, on that mutation) and
     the scrim measures 1.73, so the floor sits between two real numbers. */
  ok('SMALLER a scrim, not a blackout: the screen behind is suppressed but not deleted',
    scrim.length >= 5 && worst.std / ground.std < 0.15 && worst.mean < ground.mean * 0.35
      && worst.std > 0.5,
    `behind the scrim: mean ${worst.mean} std ${worst.std} against ${ground.mean}/${ground.std} lit (${(worst.std / ground.std * 100).toFixed(1)}% of the ground's contrast survives; 0% would be a blackout)`);

  /* NO STROBE. The Wanderer alternates a near-white wash with near-black on 60ms
     beats; this may not. The measurable difference is DIRECTION: a strobe has to
     brighten. So after the scrim has landed, no frame may be meaningfully
     brighter than the one before it, all the way through the handover. */
  let jump = { d: 0, i: -1 };
  for (let i = 1; i < trace.length; i++) {
    const d = trace[i].full - trace[i - 1].full;
    if (d > jump.d) jump = { d, i };
  }
  ok('SMALLER no strobe: once the scrim lands the sequence only ever darkens',
    jump.d < 12,
    `biggest brightening between consecutive frames ${jump.d.toFixed(1)} luma (frame ${jump.i} of ${trace.length})`);

  /* THE LENGTH, both sides derived rather than typed in: his from the constants
     js/wanderer.js exports, this one MEASURED off the real clock. */
  const wnd = await page.evaluate(async () => {
    const w = await import('./js/wanderer.js');
    const { TALK_MS } = await import('./js/talkbox.js');
    return w.ENCOUNTER_LINES.reduce((a, l) => a + l.length * TALK_MS, 0)
      + w.LINE_HOLD_MS * w.ENCOUNTER_LINES.length + w.ZOOM_MS;
  });
  ok('SMALLER noticeably shorter than the Wanderer, and never shorter than one cycle of Cam\'s loop',
    atResolve.ms >= rev.floor && atResolve.ms < wnd * 0.6,
    `${Math.round(atResolve.ms)}ms to the handover against his ${wnd}ms (floor ${rev.floor}ms)`);

  /* THE HANDOVER, the row the Wanderer's COVER row exists for. The overlay must
     still be up and the screen must still be covered at the moment the caller
     gets control, because that is when it builds the arena underneath. */
  ok('COVER the reveal is still up and the screen still hidden when it hands over',
    atResolve.overlay && atResolve.dismissable && atResolve.opacity > 0.9
      && coverShot.full < 12 && coverShot.std < ground.std * 0.1,
    `overlay=${atResolve.overlay} dismiss=${atResolve.dismissable} cover frame ${coverShot.full} mean, ${coverShot.std} std behind`);

  /* AND THE CALLER MUST USE IT. The rows above prove the overlay hands over
     covered; only app.js can throw that away, by dismissing before it builds the
     fight. An ORDER of three calls, like the ORDER row above: a shape, not a
     class name or a copy string, so reformatting cannot drift it red. */
  const mim = src.slice(src.indexOf('isMimicSpawn(rec.spawn)'));
  const iReveal = mim.indexOf('showMimicReveal(');
  const iFight = mim.indexOf('openFight(');
  const iDismiss = mim.indexOf('dismiss();', iFight);
  ok('HANDOVER app.js builds the arena BEFORE it tears the reveal down',
    iReveal > 0 && iFight > iReveal && iDismiss > iFight,
    iReveal < 0 ? 'the collect handler does not show the reveal' :
    iFight < 0 ? 'no openFight in the Mimic branch' :
    iDismiss < 0 ? 'the reveal is never dismissed, so the cover never lifts'
      : `reveal at +${iReveal}, fight at +${iFight}, dismiss at +${iDismiss}`);

  /* TAP TO SKIP, IN TWO STAGES, fired as a real click at real coordinates. The
     first tap must finish the LINE and leave the beat running; only the second
     ends it. A tap that eats the sentence is the thing this pins. */
  await startReveal();
  await sleep(300);
  await page.mouse.click(195, 120);
  await sleep(120);
  const tap1 = await page.evaluate(() => ({
    txt: document.querySelector('.mimic-reveal .tb-txt')?.textContent || '',
    snapped: !!document.querySelector('.mimic-reveal.snap'),
    resolved: window.__mimicAt != null,
  }));
  await page.mouse.click(195, 120);
  await sleep(120);
  const tap2 = await page.evaluate(() => !!document.querySelector('.mimic-reveal.snap'));
  ok('SKIP the first tap finishes the line, the second ends the beat',
    tap1.txt === rev.line && !tap1.snapped && !tap1.resolved && tap2,
    `after tap 1: "${tap1.txt.slice(0, 28)}..." snapped=${tap1.snapped}; after tap 2: snapped=${tap2}`);
  await sleep(500);
  await page.evaluate(() => { window.__mimicRet && window.__mimicRet.dismiss();
    document.querySelectorAll('.mimic-reveal').forEach(n => n.remove()); });
  await cdp.detach().catch(() => {});
  await sleep(300);

  /* THE HANDOVER COVER UNDER REDUCE, graded HERE rather than with the other
     reduced-motion rows at the bottom of this file, because down there the
     screen behind is the arena and this row is about whether the app's own lit
     screen is hidden. Same lit ground as every other row in this section.
     The cover is a ONE-SHOT with fill: both, so app.css's global reduce rule
     collapses it to an instant that holds its end state, which is the behaviour
     that block documents. What must not happen is the trap the same block warns
     about: a fast duration on something that repeats. Both are graded, and the
     covering itself is graded in pixels rather than off a computed opacity,
     which reads 0 for a tick after the class lands. */
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await sleep(200);
  const rmCover = await page.evaluate(async () => {
    const m = await import('./js/mimic.js');
    document.querySelectorAll('.mimic-reveal').forEach(n => n.remove());
    await m.showMimicReveal({ reduced: true });
    const el = document.querySelector('.mimic-reveal');
    if (!el) return { error: 'the reveal tore itself down instead of holding the cover' };
    const cs = getComputedStyle(el, '::after');
    const dur = String(cs.animationDuration).trim();
    const secs = dur.endsWith('ms') ? parseFloat(dur) / 1000 : parseFloat(dur);
    return { dur, iter: String(cs.animationIterationCount).trim(), secs };
  });
  await sleep(150);
  const rmShot = rmCover.error ? { full: 999 }
    : await lum(await page.screenshot({ encoding: 'base64', type: 'jpeg', quality: 92 }));
  await page.evaluate(() => document.querySelectorAll('.mimic-reveal').forEach(n => n.remove()));
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }]);
  await settle(page, 400);
  ok('REDUCED the handover still covers under reduced motion, and never as a fast repeat',
    !rmCover.error && rmShot.full < 12 && !(rmCover.iter === 'infinite' && rmCover.secs < 0.1),
    rmCover.error || `screen ${rmShot.full} mean luma behind a ${ground.mean} lit one, cover animation ${rmCover.dur} x ${rmCover.iter}`);
  await meter.close().catch(() => {});

  /* --------------------------------------- 5. THE ARENA, reached by playing */
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

  /* ------------------------------------------------- 6. THE BLINK, IN PIXELS */
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

  /* -------------------------------------------------- 7. REDUCED MOTION */
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
