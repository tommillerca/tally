/* A NAVIGATION DOES NOT REDO WORK IT HAS ALREADY DONE.
 *
 * Tom, 2026-08-21, on v421: "overall we need to delint things are buggy, choppy,
 * not smooth moving between pages."
 *
 * WHAT IT WAS. drawTrimmedArt() finds a sprite's alpha bounding box by reading
 * the whole source image back out of a canvas and walking every pixel in JS. The
 * box of a PNG never changes, and nothing remembered it, so every arrival at the
 * Bonehead hub scanned the same fifteen files again. Measured on this tree at
 * 440x956, CPU x6, driving the REAL tab bar:
 *
 *   today -> bonehead          before          after
 *   source pixels scanned      2,789,376       0 on every repeat visit
 *   main-thread script         101 ms          31 ms
 *   tap -> screen revealed     196 ms          196 ms (now decode-bound)
 *   dropped frames             20              13
 *   longest presented-frame gap 76 ms          50 ms
 *
 * and the same navigation was the app's worst on every one of those numbers.
 * The fix is TRIM_BOX in js/app.js: one Map, keyed on the src the scan reads.
 *
 * WHY THIS GRADES PIXELS SCANNED AND NOT MILLISECONDS. An absolute ms threshold
 * was measured and REJECTED here, and saying so is the point: the honest gap on
 * this Mac is 99-109ms (bug) against 12-31ms (fixed), which is wide, but both
 * numbers are a property of this laptop under CPU x6 and neither survives being
 * run on a slower box, in CI, or beside a video export. This repo has already
 * paid a full day for three time-dependent guards. So the hard rows grade a
 * COUNT of source pixels, which is an integer the machine cannot move, and the
 * one timing row is a RATIO of two measurements taken in the same run on the
 * same page, so the machine cancels out of it.
 *
 * THE BOUND IS ZERO, NOT A TREND (anti-regression rule 11). Not "fewer pixels
 * than before": a warm app that has already drawn a piece of art may not scan
 * one pixel of it again, on any screen. And the direction matters: a check that
 * required the count to FALL would pass on an app that scanned nothing because
 * it had stopped drawing, which is why SAMPLE and DECODED exist.
 *
 * THE DETECTOR PROVES ITSELF ON EVERY RUN. A probe hooked to the wrong function,
 * or a lap that never reaches the screen doing the work, scores zero and passes
 * everything. So SAMPLE requires the COLD pass to have scanned STRICTLY MORE
 * than the warm one before any zero below is believed, and REACH requires all
 * four tray destinations plus all four hub tabs to have actually been reached.
 * SAMPLE used to carry a pixel-and-call FLOOR instead; it was a sample of one
 * day's app, it went stale twice, and the second time it went red on healthy
 * code. The full argument is at the constant it replaced, below.
 *
 * AND THE CACHE HAS TO BE CORRECT, not just fast. IDENTICAL reads the rendered
 * canvas back on the cold pass and again on the warm pass and requires the two
 * to be byte-identical: a memo that returned a stale or wrong box would draw the
 * art at the wrong size or crop, which is invisible to every timing row here and
 * is the one regression this fix can cause. DECODED is the other half of that
 * (rule 8, and the figure contract's DECODE): a canvas that stopped being
 * painted at all would also scan zero pixels and score perfectly.
 *
 * PROVE-RED (confirmed 2026-08-21, four throwaway `cp -R` trees under
 * /private/tmp/navperf-red, each run whole):
 *   r1  the TRIM_BOX lookup bypassed, i.e. the fix reverted
 *       -> RESCAN red (8,777,728 source pixels re-scanned on the warm lap, in
 *          46 calls) and WARM red (0.94). SAMPLE, REACH, DECODED and IDENTICAL
 *          stay green, which is correct: before the fix the app was not broken,
 *          only slow, and an audit that reddened everything here would be one
 *          assertion wearing five names.
 *   r2  TRIM_BOX keyed on the canvas SIZE instead of the src, so every 200x200
 *       slot shares one box
 *       -> SAMPLE red (446,464 px: only two files ever scanned) and DECODED red
 *          (0 of 7 canvases carry ink, because six are drawn from another item's
 *          crop and land outside the canvas). WARM landed at 0.60, inside the
 *          ceiling, and that is fine: this mutation is DECODED's to catch.
 *       RE-RUN 2026-08-24, after the Wardrobe moved to the cropped sheet, and
 *          THE OWNERSHIP OF THIS MUTATION HAS CHANGED. Now: SAMPLE red (442,688
 *          px across 2 scans) and WARM red (0.78), but DECODED GREEN, 7 of 7.
 *          Pre-cropped art is why: every source is now its own alpha box, so one
 *          item's box applied to another still lands ink on the canvas instead
 *          of missing it. That is a real loss of coverage and it is written down
 *          rather than glossed: SAMPLE's SCAN-COUNT floor became the row that
 *          owned r2, which was the reason COLD_MIN_CALLS existed at all.
 *       AND THAT FLOOR IS GONE AS OF 2026-08-25 (see SAMPLE's own note below).
 *          It could not survive the app scanning less, and it went red on
 *          healthy code at v435/v436.
 *       SO NOTHING IN THIS FILE CATCHES r2 ANY MORE, and that is a real hole,
 *          stated rather than papered over. The obvious answer -- "WARM owns it
 *          now, on the 0.78 recorded above" -- was written here first and then
 *          MEASURED, and the measurement killed it. Seven healthy runs on
 *          2026-08-25, across both origin/main and this branch, machine busy
 *          (load 4.5-6.1):
 *              0.63  0.66  0.69  0.71  0.72  0.77  0.78
 *          r2's recorded score is 0.78. It sits INSIDE the healthy band, at the
 *          very top of it. WARM cannot separate r2 from a healthy app, so
 *          claiming it as r2's owner would be a check that cannot fail dressed
 *          up as coverage. r2 is UNCOVERED until somebody re-anchors WARM.
 *   WARM IS ITSELF A STALE PREMISE, and it is NOT this change's doing: those
 *       seven runs include origin/main, where WARM went 0.72 / 0.69 / 0.78 --
 *       red on two of three, on untouched healthy code. The ceiling was set at
 *       0.70 when the warm lap cost ~31ms against a ~101ms cold lap; the crop
 *       made the COLD lap cheap (409,600 px in 1 scan, where it used to be
 *       1,257,472 in 12), so the gap it was measuring has closed and the ratio
 *       now sits at a ~0.71 median. Same disease as the floor above, one row
 *       over. It needs its own re-anchoring against freshly measured bug states,
 *       which is a separate job with its own prove-reds, not a number to nudge
 *       here. Until then: main has TWO red rows in this file, not one.
 *   r3  hydratePackArt() neutered so no canvas is drawn at all
 *       -> SAMPLE red (0 px, so no zero below could have meant anything) and
 *          DECODED red (0 of 7). This is the run that shows RESCAN's green is
 *          worthless on its own, which is why SAMPLE gates it.
 *   r4  the box corrupted to half width ONLY on a cache HIT; a miss still draws
 *       correctly
 *       -> IDENTICAL red ALONE (6 of 7 canvases differ). This is the mutation
 *          the first draft of this file could not see: IDENTICAL used to read
 *          both captures at the END of a lap, where the cold lap has already
 *          been through the wardrobe once, so both were cache hits and a wrong
 *          box looked identical in the two. It reads the FIRST wardrobe render
 *          of each pass now, which on the cold lap is a genuine miss for every
 *          canvas. Anti-regression rule 1, caught by doing rule 2.
 *   r5  (2026-08-25, the mutation the RE-ANCHORED SAMPLE has to catch. RUN, on a
 *       throwaway `cp -R` tree at /private/tmp/navperf-red-r5, served on its own
 *       port, with the mutation asserted present in the SERVED js/app.js before
 *       the result was read.) drawTrimmedArt's alpha-scan block deleted, so the
 *       existing `if (!found)` fallback supplies the full-image box: every
 *       canvas is still drawn and still drawn CORRECTLY -- pre-cropped art's own
 *       box IS the whole file -- but nothing is ever alpha-scanned on any lap.
 *       -> SAMPLE red, ALONE among the rows that could see it:
 *            SAMPLE  FAIL  cold 0 px in 0 scan(s) vs warm 0 px in 0 scan(s)
 *            REACH   PASS  9/9 on both laps, so this is not a broken run
 *            DECODED PASS  7 of 7 canvases carry ink -- the art is really there
 *            RESCAN  PASS  0 px, vacuously: the exact worthless green that
 *                          SAMPLE exists to gate
 *            IDENTICAL PASS 7 byte-identical -- the art is also CORRECT
 *          The app is fine and the DETECTOR has gone blind. Without SAMPLE a
 *          dead probe scores a perfect warm lap and every zero means nothing.
 *          (WARM also went red here at 0.84, but the machine was at load 10.1
 *          and WARM is unreliable on healthy code anyway -- see r2 above -- so
 *          it is NOT claimed as part of r5's signature.)
 *       This is also the mutation that shows the relation is not vacuous. A row
 *       that cannot be made to fail is not a guard, and `cold > warm` fails here
 *       for the same reason the old floor did, without carrying a number that
 *       goes stale the next time the art gets smaller.
 *
 * Usage: node tests/nav-perf-audit.mjs [baseUrl]   (serves this repo if omitted)
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPuppeteer, serveTree, sleep, chromePath, sandboxArgs } from './godmode.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argUrl = process.argv.slice(2).find(a => !a.startsWith('--')) || process.env.URL;
const srv = argUrl ? null : await serveTree(ROOT);
const base = (argUrl || srv.url).replace(/\/?$/, '/');

const fails = [];
const ok = (name, pass, detail = '') => {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
  if (!pass) fails.push(name);
};

const W = 440, H = 956;
const CPU = 6;                 // the honest model of the phone Tom is holding
/* SAMPLE HAS NO FLOOR ANY MORE, AND THAT IS THE FIX, NOT A LOOSENING.
 *
 * It used to require the cold lap to scan >= 400,000 px in >= 6 calls. Both
 * numbers were samples of a particular day's app, and the app kept moving under
 * them:
 *     before the crop   1,257,472 px across 12 scans
 *     after the crop      587,391 px across  8 scans   (2026-08-24, floor set here)
 *     v435 / v436         409,600 px across  1 scan    (stable over five runs)
 * Nothing broke to produce that last line. The Wardrobe's cropped-art tier means
 * almost every source is now its own alpha box, so drawTrimmedArt has nothing
 * left to walk: exactly one 640x640 master still needs a real scan. The app got
 * better and the premise did not move, so the row went red on healthy code --
 * the "audit drift = false RED" failure, pinned to a sample instead of to the
 * invariant.
 *
 * LOWERING THE NUMBERS WOULD HAVE BEEN THE SAME BUG AGAIN, one release later.
 * So the premise is re-anchored on the RELATION the row actually needs:
 *
 *     the cold lap must scan STRICTLY MORE than the warm lap.
 *
 * That is the whole of what SAMPLE was ever for -- "a zero on the warm pass
 * means something" -- and it is a comparison of two measurements from the same
 * run on the same machine, so it scales with however much alpha-scanning the app
 * legitimately does. It cannot go stale, and it cannot be satisfied by an app
 * that scans nothing: cold > warm >= 0 forces cold > 0, which is r3's case.
 *
 * WHAT THIS COSTS, stated rather than glossed. SAMPLE's call-count floor was the
 * row that owned r2 (one shared trim box for every 200x200 slot) after the crop
 * changed r2's signature. A relation cannot own r2: on r2 the memo still works,
 * so warm is 0 and cold is 442,688, and cold > warm is true. r2 IS THEREFORE
 * UNCOVERED, and it does not pass to WARM: r2's 0.78 lands inside the measured
 * healthy band (0.63-0.78, seven runs, 2026-08-25), so WARM cannot tell them
 * apart. The full measurement and what it means for WARM is at r2 above. This
 * is a hole in the file, named on purpose, not a trade that came out even.
 *
 * Re-anchoring the call count on a measured property of the same run was tried
 * first and does not work either: the healthy lap now makes ONE call against
 * seven drawn canvases, so any call-per-canvas relation is red on healthy code
 * for the same reason the raw floor was.
 *
 * PROVE-RED for the re-anchored row: r5 below, RUN 2026-08-25 on a throwaway
 * `cp -R` tree at /private/tmp/navperf-red-r5, mutation asserted present in the
 * SERVED js/app.js before the result was read. It printed exactly:
 *     SAMPLE  FAIL  cold 0 px in 0 scan(s) vs warm 0 px in 0 scan(s)
 *     REACH   PASS  9/9 both laps          DECODED   PASS  7 of 7 carry ink
 *     RESCAN  PASS  0 px (vacuous)         IDENTICAL PASS  7 byte-identical
 * The app drew, drew correctly, and scored a perfect warm lap. Only SAMPLE saw
 * it. That is the row earning its place. */
/* MEASURED, NOT PICKED. Six healthy runs on this tree scored 0.32 0.33 0.34 0.35
   0.38 0.44; the same lap with the memo reverted scored 0.94 and 0.95. The
   ceiling sits at 0.70 rather than halfway, because the flaky direction is
   asymmetric: anything stealing the machine during the WARM lap only pushes this
   up, and the bug is 2.1x above the ceiling with room to spare. */
const WARM_RATIO = 0.70;

const TRAY = t => `#tabbar .tab[data-tab="${t}"]`;
const HUB = t => `#chTabs .chip[data-tab="${t}"]`;
/* A lap that touches every destination the tray and the hub can reach. The hub
   chips are in it because they are a navigation to the player even though they
   are not a route(): they are where the art actually lives. */
const LAP = [
  ['today', TRAY('today')], ['boneyard', TRAY('boneyard')], ['friends', TRAY('friends')],
  ['bonehead', TRAY('bonehead')], ['wardrobe', HUB('wardrobe')], ['crates', HUB('crates')],
  ['shop', HUB('shop')], ['talents', HUB('talents')], ['wardrobe2', HUB('wardrobe')],
];

const puppeteer = await loadPuppeteer();
const browser = await puppeteer.launch({
  headless: process.env.HEADLESS_MODE || 'shell',
  executablePath: chromePath(),
  args: [...sandboxArgs(), '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding'],
});

try {
  const page = await browser.newPage();
  await page.setViewport({ width: W, height: H, deviceScaleFactor: 1, isMobile: true, hasTouch: true });

  /* THE PROBE IS ON getImageData, WHICH IS THE SCAN'S OWN INPUT, and it is
     installed before a line of the app runs so the COLD pass is captured too.
     Hooking drawTrimmedArt by name would not survive it being renamed and would
     miss any other place that decides to walk an image; this counts the work
     itself, wherever it is done. */
  await page.evaluateOnNewDocument(() => {
    window.__scan = { px: 0, calls: 0, auditPx: 0, auditCalls: 0, mine: false };
    const P = CanvasRenderingContext2D.prototype;
    const orig = P.getImageData;
    P.getImageData = function (x, y, w, h, ...rest) {
      window.__scan.px += w * h;
      window.__scan.calls++;
      if (window.__scan.mine) { window.__scan.auditPx += w * h; window.__scan.auditCalls++; }
      return orig.call(this, x, y, w, h, ...rest);
    };
  });

  await page.goto(base + '?demo', { waitUntil: 'networkidle2', timeout: 60000 });
  await sleep(3000);
  // the demo profile opens with a daily spin and first-run cards; clear them
  for (let i = 0; i < 8; i++) {
    const hit = await page.evaluate(() => {
      const rx = /^(spin|nice|done|collect|claim|continue|ok|got it|next|skip|back to the pit)$/i;
      const b = [...document.querySelectorAll('button')]
        .find(x => rx.test((x.textContent || '').trim()) && !x.disabled && x.getBoundingClientRect().width);
      if (!b) return null;
      const r = b.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    if (!hit) break;
    await page.mouse.click(hit.x, hit.y);
    await sleep(1200);
  }

  const cdp = await page.createCDPSession();
  await cdp.send('Performance.enable');
  const scriptMs = async () => (await cdp.send('Performance.getMetrics'))
    .metrics.find(m => m.name === 'ScriptDuration').value * 1000;

  /* A REAL MOUSE CLICK ON THE REAL CONTROL. location.hash would skip the tab
     handler, and a hub chip has no hash at all. */
  const tap = async sel => {
    const at = await page.evaluate(s => {
      const b = document.querySelector(s);
      if (!b) return null;
      b.scrollIntoView({ block: 'center' });
      const r = b.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }, sel);
    if (!at) return false;
    await page.mouse.click(at.x, at.y);
    await sleep(1800);
    return true;
  };

  /* Read the wardrobe's drawn art back off the canvas. Not a screenshot: this is
     the bitmap drawTrimmedArt produced, which is the thing the memo could get
     wrong, and it is readable from the same origin. */
  const wardrobeArt = () => page.evaluate(() => {
    const out = [];
    window.__scan.mine = true;
    for (const cv of document.querySelectorAll('#screen canvas.pd-art')) {
      const g = cv.getContext('2d', { willReadFrequently: true });
      const d = g.getImageData(0, 0, cv.width, cv.height).data;
      let ink = 0, sum = 0;
      for (let i = 3; i < d.length; i += 4) if (d[i] > 8) ink++;
      for (let i = 0; i < d.length; i += 16) sum = (sum * 31 + d[i] + d[i + 1] * 3 + d[i + 3] * 7) >>> 0;
      out.push({ art: cv.getAttribute('data-art'), w: cv.width, h: cv.height, ink, sum });
    }
    window.__scan.mine = false;
    return out;
  });

  async function lap(label) {
    const reached = [];
    let art = [];
    await page.evaluate(() => { window.__scan.px = 0; window.__scan.calls = 0; window.__scan.auditPx = 0; window.__scan.auditCalls = 0; });
    const t0 = await scriptMs();
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });
    for (const [name, sel] of LAP) {
      if (!await tap(sel)) continue;
      reached.push(name);
      /* CAPTURE AT THE FIRST WARDROBE RENDER OF THE PASS, WHICH ON THE COLD LAP
         IS A GENUINE CACHE MISS FOR EVERY CANVAS. Reading at the END of the lap
         instead is what makes IDENTICAL a row that cannot fail: by then the cold
         lap has already been through the wardrobe once, so both captures are
         cache HITS and a wrong cached box shows up identically in the two. */
      if (name === 'bonehead' && !art.length) {
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
        art = await wardrobeArt();
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });
      }
    }
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    const t1 = await scriptMs();
    /* READ THE COUNTER LAST, MINUS THE AUDIT'S OWN READS. wardrobeArt() calls
       getImageData itself, which this probe counts, so its calls are subtracted
       by name rather than by hoping the ordering keeps them out. */
    const scan = await page.evaluate(() => ({ ...window.__scan, px: window.__scan.px - window.__scan.auditPx, calls: window.__scan.calls - window.__scan.auditCalls }));
    console.log(`      ${label}: reached ${reached.length}/${LAP.length}, scanned ${scan.px.toLocaleString()} px in ${scan.calls} call(s), script ${Math.round(t1 - t0)}ms, ${art.length} wardrobe canvas(es) read at the first wardrobe render`);
    return { reached, scan, script: t1 - t0, art };
  }

  const cold = await lap('COLD pass');
  const warm = await lap('WARM pass');

  /* ---- the premises, before any zero below is believed ---------------------- */

  ok('REACH every tray destination and every hub tab was really reached by a tap',
    cold.reached.length === LAP.length && warm.reached.length === LAP.length,
    `cold ${cold.reached.join(',') || '(none)'} | warm ${warm.reached.join(',') || '(none)'}`);

  ok('SAMPLE the cold pass scanned STRICTLY MORE than the warm pass, so a zero on the warm pass means something',
    cold.scan.px > warm.scan.px,
    `cold ${cold.scan.px.toLocaleString()} px in ${cold.scan.calls} scan(s) vs warm ${warm.scan.px.toLocaleString()} px in ${warm.scan.calls} scan(s)`
    + ` (a relation between two measurements of the same run, not a floor: it scales with however much scanning the app legitimately does)`);

  ok('DECODED the wardrobe really drew its art, so "scanned nothing" cannot mean "drew nothing"',
    warm.art.length > 0 && warm.art.every(a => a.ink > 0),
    `${warm.art.filter(a => a.ink > 0).length} of ${warm.art.length} canvases carry ink`);

  /* ---- the two graded rows ------------------------------------------------- */

  ok('RESCAN a warm lap of every screen re-scans ZERO source pixels',
    warm.scan.px === 0,
    warm.scan.px === 0
      ? `0 px in ${warm.scan.calls} call(s) (cold pass: ${cold.scan.px.toLocaleString()})`
      : `${warm.scan.px.toLocaleString()} source pixels re-scanned in ${warm.scan.calls} call(s), for art this session has already drawn`);

  const ratio = cold.script > 0 ? warm.script / cold.script : 1;
  ok(`WARM the warm lap costs at most ${Math.round(WARM_RATIO * 100)}% of the cold lap's main-thread script time`,
    ratio <= WARM_RATIO,
    `warm ${Math.round(warm.script)}ms / cold ${Math.round(cold.script)}ms = ${ratio.toFixed(2)} (a ratio, not a millisecond count, so this machine's speed cancels out)`);

  /* ---- the regression the fix itself could cause ---------------------------- */

  const coldMap = new Map(cold.art.map(a => [a.art, a]));
  const differing = warm.art.filter(a => coldMap.has(a.art) && coldMap.get(a.art).sum !== a.sum);
  const missing = warm.art.filter(a => !coldMap.has(a.art));
  ok('IDENTICAL a cached trim box draws the same bitmap the uncached scan drew',
    warm.art.length > 0 && missing.length === 0 && differing.length === 0,
    differing.length
      ? `${differing.length} of ${warm.art.length} canvases differ: ${differing.slice(0, 3).map(a => a.art).join(', ')}`
      : missing.length
        ? `${missing.length} canvas(es) on the warm pass were not on the cold one, so nothing was compared: ${missing.slice(0, 3).map(a => a.art).join(', ')}`
        : `${warm.art.length} canvases byte-identical between an uncached and a cached draw`);

} finally {
  await browser.close().catch(() => {});
  srv?.close?.();
}

console.log(`\n${fails.length ? `${fails.length} FAILED` : 'all green'}`);
process.exit(fails.length ? 1 : 0);
