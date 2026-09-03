/* A TAKEOVER LEAVES STRAIGHT DOWN. NOTHING SWEEPS SIDEWAYS ON THE WAY OUT.
 *
 * Tom, 2026-08-19: "leaving a common great seems kind of glitchy on the way out
 * once youve got your gear it seems to flicker a bit or something."
 *
 * WHAT IT WAS. `@keyframes sheetOut` carries the -50% that the base `.sheet`
 * centres with, and `.sheet.takeover` sets `transform: none` (deliberately, so
 * pixel art lands on whole pixels). So the shared exit interpolated from
 * translate(0,0) to translate(-50%, 105%) and yanked the takeover half its own
 * width to the LEFT while it dropped. The ENTRANCE already has its own
 * `slideupFlat` keyframes for exactly this reason; the exit never got one.
 * Measured on a real Common Crate open at 440x956: the takeover's right edge
 * marched from x=436 to x=338 in ~100ms, a hard vertical seam up to 98% of the
 * viewport height sweeping across the Backpack you are returning to.
 *
 * HOW IT IS MEASURED, and why not with a CSS box. tally/CLAUDE.md: fire the real
 * control and assert PIXELS. So this drives the Backpack's own OPEN button with
 * a real mouse click, taps every card away with real pointer events, and then
 * reads the exit out of decoded screenshots:
 *
 *   SAMPLE   frames were actually captured (an empty sample is a FAILURE)
 *   MIDSLIDE at least 3 frames caught the takeover genuinely half-gone: the TOP
 *            band has left the reveal while the BOTTOM band has not yet reached
 *            the screen behind. This is the control. If the sheet vanished
 *            instead of sliding, or the clock was frozen, or the page was blank,
 *            no frame can be in both states at once, and the run FAILS rather
 *            than passing on nothing.
 *   FLICKER  in those same mid-slide frames, no column in the right 45% of the
 *            BOTTOM BAND carries a vertical edge taller than 25% of that band.
 *            The band is the part MIDSLIDE has just proven is still takeover,
 *            and a takeover leaving straight down covers it wall to wall: it has
 *            no vertical edge to give, its boundary is horizontal. One that has
 *            drifted sideways cuts its own right edge through it, which IS that
 *            seam.
 *
 * Measured on this tree so the 25% threshold is not invented (worst mid-slide
 * frame of a run, as a fraction of the bottom band):
 *                          440x956      393x852
 *   this branch               8.2%        10.0%
 *   pristine origin/main    100.0%        99.6%
 * There is no overlap. On pristine origin/main (5bf8af1) the LOWEST mid-slide
 * frame of either viewport was 53%; on this branch the HIGHEST was 10.0%.
 *
 * THE CLOCK IS DRIVEN, NOT WAITED ON. The exit is 200ms and `closeTopSheet`
 * buries the sheet 320ms after it starts, so a screenshot loop at real speed
 * lands a handful of frames and can miss the middle entirely (measured: one
 * screencast run of the shipped bug caught only 26.7% because the frames either
 * side of the worst moment were dropped). CDP `Animation.setPlaybackRate` slows
 * the animation the real control already started; nothing here starts it.
 *
 * AND THE MOMENT CAN STILL BE MISSED, so a miss is retried rather than graded.
 * 2026-09-02: this suite came back FAIL at 440x956 with "0 of 49 frames, swing
 * top 31.7 bottom 26.5". Read it: both bands really moved, so the takeover slid,
 * and the sampler simply never landed on the half-gone instant. The window it
 * has to land in is not the animation's 200ms and cannot be widened by slowing
 * the clock further: closeTopSheet buries the sheet on a setTimeout(320) that
 * the CDP animation clock does not touch, so whatever the playback rate there
 * are ~250ms of WALL CLOCK in which any frame can be half-gone.
 * Measured on this tree at 440x956, 18 solo runs plus one under 14 cores of
 * competing load:
 *                       half-gone frames   total frames   biggest inter-frame gap
 *   solo, x18                 15 to 18       50 to 66            36 to 222ms
 *   under load, x1                   5             20                   122ms
 * The floor is 3. So the margin is real but it is the COMPOSITOR's to give, and
 * a run that is handed none of those frames has measured nothing at all. One
 * bounded retry, logged, exactly like godmode's retryOnDetach; a takeover that
 * really snaps returns an empty set every time it is asked and the second
 * attempt is GRADED (proven below).
 *
 * AND THE ROW NOW SAYS WHICH IT WAS. "0 frames were half-gone" is printed
 * identically by a snap and by a blink, so MIDSLIDE prints the two crossing
 * times and the biggest gap between frames. Healthy: the top band leaves at
 * t+462ms and the bottom band arrives at t+713ms, 251ms apart, biggest gap 39ms.
 * Snapped: both at t+725ms, the SAME frame, biggest gap 30ms.
 *
 * PROVEN RED, 2026-09-02, for the retry and the crossing times. Two `cp -R`
 * throwaways with .git removed, one mutation each, exit code read from a FILE:
 *   app.css `.sheet.takeover.closing` given `animation: none` (the takeover
 *     SNAPS) -> exit 1, MIDSLIDE red at BOTH viewports AFTER the retry, "0 of 65
 *     frames ... top band left the reveal t+724ms, bottom band reached the
 *     screen behind t+724ms ... biggest gap between frames 36ms". The retry is
 *     not a blindfold.
 *   app.css `.sheet.takeover.closing` and `@keyframes sheetOutFlat` deleted (the
 *     shipped sideways drift) -> exit 1, FLICKER red at both, 99.3% and 99.2% of
 *     the bottom band against 7.1% and 8.8% here, with MIDSLIDE still GREEN as
 *     its control.
 *
 * PROVEN RED, 2026-08-19, in a throwaway worktree at pristine origin/main
 * (5bf8af1, and again at 7b43954 before it), asserted first to carry neither
 * `sheetOutFlat` nor `.sheet.takeover.closing`: FLICKER fails at BOTH viewports,
 * on EVERY mid-slide frame. Reverting the app.css hunk alone turns it red again.
 * The throwaway trees were deleted after each run.
 *
 * Usage: node tests/crate-exit-flicker-audit.mjs        (URL=... for live)
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boot, sleep, serveTree } from './godmode.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let srvHandle = null;
let base = process.env.URL || process.argv[2];
if (!base) {
  srvHandle = await serveTree(ROOT);
  base = srvHandle.url;
}
const results = [];
const ok = (name, pass, detail = '') => { results.push({ name, pass }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`); };

/* Decode one screenshot in the page and reduce it to the two numbers this audit
   grades on. Done in the browser deliberately: it needs no image dependency, and
   hero-flash.mjs already reads pixels this way. */
const MEASURE = async (page, b64) => page.evaluate(async data => {
  const img = new Image();
  img.src = 'data:image/png;base64,' + data;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height).data;
  const W = c.width, H = c.height;
  const lum = (x, y) => { const i = (y * W + x) * 4; return (d[i] + d[i + 1] + d[i + 2]) / 3; };
  /* THE TALLEST VERTICAL EDGE IN THE RIGHT 45%, MEASURED ONLY IN THE BOTTOM
     BAND. The band is the part the MIDSLIDE control has already proven is still
     the takeover, and a takeover that leaves straight down covers it wall to
     wall: there is no vertical edge for it to give. One that has drifted
     sideways cuts its own right edge straight through it.
     Restricted to the band on purpose. Over the FULL height this same reading
     picks up the Backpack's own panel border once the sheet has passed it (26.7%
     of the viewport, measured), which is a legitimate piece of furniture and
     would sit uncomfortably close to the threshold. */
  const y0 = Math.floor(H * 0.72), bandH = H - y0;
  let vBest = 0, vX = -1;
  for (let x = Math.floor(W * 0.55); x < W - 1; x++) {
    let n = 0;
    for (let y = y0; y < H; y++) if (Math.abs(lum(x + 1, y) - lum(x, y)) > 10) n++;
    if (n > vBest) { vBest = n; vX = x; }
  }
  /* the two bands the mid-slide control reads, as flat arrays for cheap diffing */
  const band = (y0, y1) => { const a = []; for (let y = y0; y < y1; y += 2) for (let x = 0; x < W; x += 2) a.push(lum(x, y)); return a; };
  return { W, H, vSeamPct: (vBest / bandH) * 100, vSeamX: vX,
    top: band(0, Math.floor(H * 0.10)), bot: band(Math.floor(H * 0.88), H) };
}, b64);

const bandDiff = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]); return s / a.length; };

async function runViewport(W, H, attempt = 1) {
  const tag = attempt > 1 ? `${W}x${H} retry` : `${W}x${H}`;
  const { browser, page } = await boot(base, {
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
  try {
    await page.setViewport({ width: W, height: H, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }]);
    /* Every first-run takeover fires in a QUEUE and would paint over the reveal.
       changelogSeen holds a BUILD NUMBER, so kvSet(..., true) reads as 0. */
    const quiet = async () => page.evaluate(async () => {
      const db = await import('/js/db.js?q=1');
      const { DROP } = await import('/js/loot.js?q=1');
      await db.kvSet('changelogSeen', 999999);
      await db.kvSet(`dropSeen.${DROP.id}`, true);
      for (const k of ['spiresIntroSeen', 'raceIntroSeen', 'gardenIntroSeen', 'surveySeen', 'namePrompted']) await db.kvSet(k, true);
      await db.kvSet('renameRequired', null);
    });
    await sleep(900); await quiet();
    await page.evaluate(() => { location.hash = '#/today'; });
    await sleep(1400); await quiet();
    await page.evaluate(() => { window.__crateForce = 1; });   // the seam the reveal already gives automation
    await page.evaluate(async () => { const l = await import('/js/loot.js?o=' + Math.random()); await l.grantCrate('daily', 'exit-audit'); });

    // ---- REAL CONTROL 1: the Backpack's own OPEN button -----------------
    await page.evaluate(() => { location.hash = '#/bonehead'; });
    await sleep(2000);
    // the hub lands on Wardrobe by hash; the Backpack is a real chip
    await page.evaluate(() => { const c = [...document.querySelectorAll('#chTabs .chip')].find(x => x.dataset.tab === 'crates'); c && c.click(); });
    await sleep(1500);
    const btn = await page.evaluate(() => {
      const b = document.querySelector('[data-open]');
      if (!b) return null;
      b.scrollIntoView({ block: 'center' });
      return true;
    });
    ok(`${tag} SETUP the Backpack offers a Common Crate to open`, !!btn);
    if (!btn) return;
    await sleep(300);
    const box = await page.evaluate(() => { const r = document.querySelector('[data-open]').getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; });
    await page.mouse.click(box.x, box.y);

    /* ---- REAL CONTROL 2: tap every card away, the last tap being the exit.
       A crate rolls 1 to 3 cards, so the loop runs until the reveal is gone and
       the LAST iteration is the one that is sampled. */
    const cdp = await page.target().createCDPSession();
    await cdp.send('Animation.enable');
    let frames = [];
    for (let n = 0; n < 6; n++) {
      const state = await page.evaluate(async seen => {
        for (let i = 0; i < 400; i++) {
          const r = document.querySelector('.pack-reveal');
          if (!r) { if (seen && i > 10) return { gone: true }; await new Promise(x => setTimeout(x, 16)); continue; }
          if (r.dataset.landed && (document.querySelector('#packCount') || {}).textContent !== window.__lastCount) {
            window.__lastCount = (document.querySelector('#packCount') || {}).textContent;
            const b = document.querySelector('.pack-tilt').getBoundingClientRect();
            return { x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2), count: window.__lastCount || '' };
          }
          await new Promise(x => setTimeout(x, 16));
        }
        return { stuck: true };
      }, n > 0);
      if (state.gone) break;
      if (state.stuck) { ok(`${tag} SETUP the reveal reached a tappable card`, false, JSON.stringify(state)); return; }
      await sleep(400);
      frames = [];
      await cdp.send('Animation.setPlaybackRate', { playbackRate: 1 });
      /* THE COMPOSITOR PUSHES THE FRAMES, not a screenshot loop. page.screenshot
         round-trips in ~110ms here, which lands 3 frames inside the exit and
         misses the middle; the screencast delivers whatever the compositor
         paints, which with the clock at a quarter speed is 20-odd frames. */
      const t0 = Date.now();
      const onFrame = async ({ data, sessionId }) => {
        frames.push({ t: Date.now() - t0, shot: data });
        try { await cdp.send('Page.screencastFrameAck', { sessionId }); } catch { /* gone */ }
      };
      cdp.on('Page.screencastFrame', onFrame);
      await cdp.send('Page.startScreencast', { format: 'png', everyNthFrame: 1, maxWidth: W, maxHeight: H });
      await page.mouse.move(state.x, state.y);
      await page.mouse.down(); await page.mouse.up();
      /* Frame 0 is the reveal untouched, so the two band references below come
         out of this very run. The card's fling owns the first ~330ms; the
         sheet's exit starts after it, which is why the clock is only slowed
         once the fling is spent. */
      await sleep(345);
      await cdp.send('Animation.setPlaybackRate', { playbackRate: 0.25 });
      await sleep(600);
      await cdp.send('Animation.setPlaybackRate', { playbackRate: 1 });
      await cdp.send('Page.stopScreencast').catch(() => {});
      cdp.off('Page.screencastFrame', onFrame);
      await sleep(350);
    }

    /* AN EMPTY SAMPLE IS A MISSED SHOT ON THE FIRST ATTEMPT, A VERDICT ON THE
       SECOND. See the RETRY note at the foot of this file. */
    if (frames.length < 8 && attempt === 1) return 'MISS';
    ok(`${tag} SAMPLE frames were captured across the exit (an empty sample is a FAILURE)`,
      frames.length >= 8, `${frames.length} frames over ${frames.length ? frames[frames.length - 1].t : 0}ms`);
    if (frames.length < 8) return;

    const m = [];
    for (const f of frames) m.push({ t: f.t, ...await MEASURE(page, f.shot) });
    const ref = m[0];                       // the reveal, untouched
    const last = m[m.length - 1];           // the screen behind, settled
    /* MID-SLIDE, in pixels: the TOP band has already left the reveal while the
       BOTTOM band has not yet arrived at the screen behind. Both halves are
       measured against this run's own two references and scaled to its own full
       swing, so no threshold is carried over from another machine.
       Deliberately NOT "the bottom band is unchanged": the reveal's footer sits
       in that band and slides down out of it, so the bottom changes plenty while
       still being the takeover. Distance from the SETTLED screen is the honest
       reading of "the takeover is still covering this". */
    const swingTop = bandDiff(ref.top, last.top), swingBot = bandDiff(ref.bot, last.bot);
    const mid = m.filter(f => bandDiff(ref.top, f.top) > swingTop * 0.45 && bandDiff(last.bot, f.bot) > swingBot * 0.45);
    /* WHEN THE ROW GOES RED IT HAS TO SAY WHICH OF TWO THINGS HAPPENED, because
       "0 frames were half-gone" is printed identically by a takeover that SNAPPED
       and by a screencast that blinked. The two crossing times tell them apart: a
       slide leaves the top band and reaches the bottom band at two different
       moments with the biggest inter-frame gap sitting well inside that span; a
       snap does both on the SAME frame however densely it is photographed. */
    const crossed = f => { const h = m.find(f); return h ? `t+${h.t}ms` : 'never'; };
    const topLeft = crossed(f => bandDiff(ref.top, f.top) > swingTop * 0.45);
    const botHome = crossed(f => bandDiff(last.bot, f.bot) <= swingBot * 0.45);
    let gap = 0;
    for (let i = 1; i < m.length; i++) gap = Math.max(gap, m[i].t - m[i - 1].t);
    const shape = `top band left the reveal ${topLeft}, bottom band reached the screen behind ${botHome}, `
      + `${m.length} frames over ${m[0].t}..${m[m.length - 1].t}ms, biggest gap between frames ${gap}ms`;
    if (mid.length < 3 && attempt === 1) { console.log(`MISS   ${tag} MIDSLIDE caught nothing: ${shape}`); return 'MISS'; }
    ok(`${tag} MIDSLIDE the takeover was caught half-gone, in pixels (top band has left the reveal, bottom band has not reached the screen behind)`,
      mid.length >= 3 && swingTop > 4 && swingBot > 4,
      `${mid.length} of ${m.length} frames, swing top ${swingTop.toFixed(1)} bottom ${swingBot.toFixed(1)}; ${shape}`);
    if (mid.length < 3) return;

    const worst = mid.reduce((a, b) => (b.vSeamPct > a.vSeamPct ? b : a));
    ok(`${tag} FLICKER the leaving takeover never puts its own edge inside the screen`,
      worst.vSeamPct < 25,
      `tallest vertical edge in the right 45% of the bottom band: ${worst.vSeamPct.toFixed(1)}% of that band at x=${worst.vSeamX} (t+${worst.t}ms); `
      + `all mid-slide frames ${mid.map(f => f.vSeamPct.toFixed(0) + '%').join(' ')}`);
  } finally {
    await browser.close();
  }
}

/* ONE RETRY, AND ONLY WHEN THE INSTRUMENT CAME BACK EMPTY.
 *
 * MIDSLIDE is a CONTROL: it exists so FLICKER cannot be graded against a frame
 * that is not mid-slide. It is graded by PHOTOGRAPHING a moment, and the moment
 * is short: closeTopSheet buries the sheet on a 320ms setTimeout that the CDP
 * animation clock does not slow, so however slowly the slide is played there are
 * only ~250ms of wall clock in which a frame can be half-gone. Measured on this
 * tree at 440x956, 18 runs: 15 to 18 half-gone frames of 50 to 66, biggest
 * inter-frame gap 36 to 222ms. Under 14 cores of competing load: 5 of 20. So the
 * margin over the 3-frame floor is real but it is the COMPOSITOR's to give, and
 * a run that delivers none of those frames has measured nothing.
 *
 * Bounded exactly like godmode's retryOnDetach, and for the same reason: ONE
 * retry, it LOGS, and it can never become a blindfold. A takeover that really
 * snaps hands back an empty mid-slide set every time it is asked, so the second
 * attempt is graded and goes red, with the crossing times above naming the snap.
 * Proven both ways on cp -R throwaways, listed at the head of this file.
 */
const exitAt = async (W, H) => {
  if (await runViewport(W, H) !== 'MISS') return;
  console.log(`RETRY  ${W}x${H}: the screencast caught no half-gone frame; running the exit ONCE more, and grading it.`);
  await runViewport(W, H, 2);
};
// Tom is on an iPhone 17 Pro Max; 393 is the ordinary phone width.
await exitAt(440, 956);
await exitAt(393, 852);

if (srvHandle) srvHandle.close();
const failed = results.filter(r => !r.pass).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
if (!results.length) { console.log('FAIL: no checks ran'); process.exit(1); }
console.log(failed ? 'CRATE EXIT FLICKER AUDIT FAILED' : 'CRATE EXIT VERIFIED');
process.exit(failed ? 1 : 0);
