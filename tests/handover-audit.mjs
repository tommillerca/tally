/* A SWAP HANDS OVER ON ONE FRAME. THE OLD SCREEN IS NEVER HALF THERE.
 *
 * Tom, 2026-08-21: "Overall performance wise the app is very clunky switching
 * between tabs is not smooth it's showing a staggered preview of the the
 * existing page as you swap"
 *
 * WHAT IT WAS, MEASURED BEFORE ANYTHING WAS TOUCHED. tests/route-flash-audit.mjs
 * had already established that a navigation must not show the tray, and the fix
 * for that parks a copy of the outgoing screen over #screen while the new one
 * builds underneath. That copy then DISSOLVED: `.screen-held` carried a .18s
 * opacity transition and was removed on a 260ms timer. So from the moment the
 * new screen was ready there was a quarter of a second in which BOTH screens
 * were on the glass at once, the outgoing one hanging over the incoming one.
 * Captured at 440x956, CPU x6, through a CDP screencast on a real tab tap:
 *   Boneyard -> Today   old paint whole to 144ms, two screens superimposed to 418ms
 *   Crew -> Today       old paint whole to 145ms, superimposed to 503ms
 *   Today -> Bonehead   superimposed to 389ms
 * That superimposed window IS "a staggered preview of the existing page", and it
 * is what this file grades. js/app.js now REMOVES the copy in the same task that
 * route() applies `screen-in`, and no paint happens between a microtask and the
 * rAF that follows it, so the swap is one composited frame.
 *
 * AND THE HUB CHIPS ARE GRADED TOO, because they were the worst case and they
 * reached neither route() nor openSheet(): they called renderCharacter directly,
 * which threw the old panel away and assembled the new one in front of the
 * player in four visible stages (Wardrobe -> Shop, x6: header alone over a void
 * at 77ms, chip row at 116ms, cards with empty art tiles at 151ms, art still
 * filling at 395ms). They go through openCharacter() -> route() now, which is
 * the covered path, not a new one.
 *
 * HOW IT IS GRADED, and why on ONE number rather than two. Every frame is
 * reduced to `dOld`: the mean absolute channel difference from a screenshot of
 * the settled OUTGOING screen. It behaves the way the eye does:
 *     the old screen, whole            dOld ~ 0
 *     an alpha blend of the two        dOld ~ (1 - alpha) * refDiff
 *     the new screen, alone            dOld ~ refDiff
 * where refDiff is the distance between the two settled screens. A frame that is
 * neither screen (a half-built one, a talk box mid-type, a pet mid-stride) can
 * only push dOld AWAY from zero, so noise moves a frame OUT of the ghost band
 * and never into it: this audit can under-report, never false-alarm, which is
 * the right direction for a thing that runs on a shared laptop and the reason
 * CONTROL below is not optional.
 *
 * THE BANDS ARE MEASURED, NOT PICKED, and calibrated per pair on the run:
 *   OLD    dOld < max(refDiff * 0.10, noise * 3)   the outgoing screen, whole
 *   GHOST  between the two                          neither screen, whole
 *   GONE   dOld >= refDiff * 0.90                   the outgoing paint is off
 * `noise` is that screen's own idle churn, taken from two screenshots 600ms
 * apart while it sits settled, because Today and the hub animate on their own
 * and a pure-OLD frame there is not a zero (measured 8.3 against a refDiff of
 * 52.8). SETUP refuses to grade a pair whose bands overlap.
 *
 * WHERE 0.90 CAME FROM, and it is not a round number chosen for looking safe.
 * Both sides were measured on this tree, at 440x956 and CPU x6, and they do not
 * overlap: a HEALTHY handover steps from the old screen to the new one in ONE
 * captured frame and that frame scores 0.977, 0.989, 0.992, 0.997 and 0.998 of
 * refDiff across the graded pairs and repeat runs, while the dissolve holds a
 * PLATEAU at 0.78 to 0.80 for 240 to 270ms before it steps the rest of the way.
 * 0.90 sits in the gap with 0.077 of headroom on the clean side and 0.10 on the
 * bug side. The arrival frame's actual score is printed on every run, in every
 * row, so drift toward either edge is visible before it is a red.
 * The plateau, rather than a smooth ramp, is what a headless screencast makes of
 * a CSS opacity transition, and it is why this file grades a BAND and not a
 * curve: the repo has been bitten by headless freezing an animation clock before
 * (lessons_headless_motion_and_weak_hash) and nothing here reads a keyframe.
 *
 * THE BOUND IS ZERO, NOT A TREND (anti-regression rule 11). Not "fewer ghost
 * frames than before": no captured frame between the tap and the arrival may be
 * a blend of the two screens.
 *
 * CONTROL PROVES THE DETECTOR ON EVERY RUN. A grader whose references have
 * drifted, or which never saw the swap at all, passes everything in silence, and
 * this repo has shipped exactly that before. So CONTROL serves a js/app.js with
 * the dissolve put back (and nothing else changed) and REQUIRES ghost frames.
 * Green GHOST beside a green CONTROL is an audit grading nothing, and fails.
 *
 * CAP IS A DIFFERENT FAILURE AND IT IS DELIBERATELY NOT A CLOCK.
 * revealWhenReady() waits for every <img> on the arriving screen to decode, with
 * a 700ms cap. An image that is never going to load makes that cap the NORMAL
 * cost of arriving: measured here, the Shop renders 64 images of which 10 are
 * `loading="lazy"` thumbnails laid out at zero width, so `decode()` on them
 * never settles and every arrival at the Shop, cold and warm, revealed at
 * ~810ms with its content already in the DOM at ~21ms. Every other hub tab
 * revealed in 61-72ms. The wait skips `loading="lazy"` now.
 * CAP is a DOM fact and not a millisecond budget, on purpose: this machine runs
 * three sessions and a reveal-latency threshold here would be the ninth
 * clock-dependent guard in the repo. It walks every tray destination and every
 * hub tab and requires that no image the reveal waits on is still undecoded once
 * the screen has settled. That covers the whole class in both directions: an
 * image that never settles pins the arrival to the cap, and one that resolves to
 * nothing is a hole in a screen this app has already declared arrives whole.
 * It does NOT cover the `loading="lazy"` skip itself, and does not claim to.
 * That revert is caught, red, by WARDROBE->SHOP: waiting on the ten dead
 * thumbnails pushes the Shop's reveal past holdOutgoing's 1200ms cap, the lid
 * comes off a screen that is still at opacity 0, and the run scores 33 ghost
 * frames over 360ms with the old panel whole until 862ms.
 *
 * NO SWIFTSHADER and the Boneyard is graded on its intro state, both for the
 * same reasons as tests/route-flash-audit.mjs: the software rasteriser costs
 * more than the whole transition, and the map needs a vector tile host this
 * audit must not depend on.
 *
 * PROVE-RED (2026-08-21, cp -R throwaway copies; each mutation reddens the row
 * that owns it):
 *   hub chips back to `renderCharacter(wrap, c.dataset.tab)`, the panel
 *   assembling in stages again
 *        -> GHOST red on WARDROBE->SHOP ALONE, 8 ghost frames over 77ms, old
 *           panel whole only to 36ms. Both tab swaps green, CAP green,
 *           CONTROL green. 25/26.
 *   revealWhenReady back to `querySelectorAll('img')`
 *        -> GHOST red on WARDROBE->SHOP ALONE, 33 ghost frames over 360ms, old
 *           panel whole to 862ms, arrival at 1251ms (past the 1200ms hold cap).
 *           Both tab swaps green, CONTROL green. 25/26.
 *   the dissolve restored in drop() and in app.css, i.e. v423 as it shipped
 *        -> GHOST red on BONEYARD->TODAY (24 ghost frames over 270ms) and on
 *           WARDROBE->SHOP (24 over 251ms). TODAY->BONEHEAD stayed GREEN in that
 *           run and that is worth writing down rather than rounding up: its
 *           outgoing screen is Today, whose Bonehead animates, so its idle noise
 *           is 8.3 against 1.1 for the Boneyard and its OLD band is nearly five
 *           times wider. It is the least sensitive of the three by construction.
 *           Two of three catching it is the honest coverage; the pair to trust on
 *           this bug is the one leaving a still screen.
 *           CONTROL's SETUP goes red with it, and correctly: its needle is the
 *           line the mutation deletes, so there is nothing left to patch, and an
 *           audit that cannot build its own control must say so rather than
 *           grade on. 23/26.
 *   one eager <img> pointing at an asset that does not exist, injected into
 *   every reveal
 *        -> CAP red ALONE, naming all eight stops. All three GHOST rows green,
 *           CONTROL green. 25/26.
 *
 * Usage: node tests/handover-audit.mjs [baseUrl]   (serves this repo if omitted)
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPuppeteer, serveTree, sleep, chromePath, sandboxArgs } from './godmode.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argUrl = process.argv.slice(2).find(a => !a.startsWith('--')) || process.env.URL;
const srv = argUrl ? null : await serveTree(ROOT);
const base = (argUrl || srv.url).replace(/\/?$/, '/');

const results = [];
const ok = (name, pass, detail = '') => {
  results.push({ name, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
};

const OLD_FRAC = 0.10;   // below this share of refDiff, the frame IS the old screen
const GONE_FRAC = 0.90;  // at or above it, the old paint is off the glass
const NOISE_MULT = 3;    // a settled screen's own churn, times a safety factor
const MIN_REFDIFF = 12;  // two screens that look this alike cannot be told apart
const MIN_FRAMES = 3;
const CPU = 6;           // the honest model of the phone Tom is holding
const W = 440, H = 956;

const puppeteer = await loadPuppeteer();
const launch = () => puppeteer.launch({
  headless: process.env.HEADLESS_MODE || 'shell',
  executablePath: chromePath(),
  args: [...sandboxArgs(), '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding'],
});

/* Pixels are decoded in a THROWAWAY page: the page under test is mid-navigation
   and is the subject of the measurement. */
const measurePage = async browser => {
  const p = await browser.newPage();
  await p.goto('data:text/html,<body></body>');
  return {
    close: () => p.close().catch(() => {}),
    /* The CONTENT AREA only, top 86%. The tab bar's active pill moves on the tap
       itself, so including it would make a frame showing nothing but the old
       screen score as changed and land in the ghost band on its own. */
    grab: b64 => p.evaluate(async data => {
      const img = new Image();
      img.src = 'data:image/png;base64,' + data;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      const g = c.getContext('2d', { willReadFrequently: true });
      g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, c.width, c.height).data;
      const px = [];
      for (let y = 0; y < Math.floor(c.height * 0.86); y += 4)
        for (let x = 0; x < c.width; x += 4) {
          const i = (y * c.width + x) * 4;
          px.push(d[i], d[i + 1], d[i + 2]);
        }
      return px;
    }, b64),
  };
};

const dist = (a, b) => {
  const n = Math.min(a.length, b.length);
  if (!n) return NaN;
  let s = 0;
  for (let i = 0; i < n; i++) s += Math.abs(a[i] - b[i]);
  return s / n;
};

async function openApp(browser, { appJs = null, css = null } = {}) {
  const page = await browser.newPage();
  await page.setViewport({ width: W, height: H, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  if (appJs) {
    await page.setRequestInterception(true);
    page.on('request', r => {
      if (/\/js\/app\.js(\?|$)/.test(r.url())) r.respond({ status: 200, contentType: 'text/javascript', body: appJs }).catch(() => {});
      else r.continue().catch(() => {});
    });
  }
  await page.goto(base + '?demo', { waitUntil: 'networkidle2', timeout: 60000 });
  if (css) await page.addStyleTag({ content: css });
  await sleep(3000);
  // the demo profile opens with a daily spin and first-run cards; clear them
  for (let i = 0; i < 6; i++) {
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
  return page;
}

/* A REAL TAP ON THE REAL CONTROL. A programmatic hash change or .click() on the
   hub chip would skip the thing this file is about. */
const tap = async (page, sel) => {
  const at = await page.evaluate(q => {
    const b = document.querySelector(q);
    if (!b) return null;
    const r = b.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, sel);
  if (!at) return false;
  await page.mouse.click(at.x, at.y);
  return true;
};
const tabSel = t => `#tabbar .tab[data-tab="${t}"]`;
const chipSel = t => `.ch-tab[data-tab="${t}"]`;

/* ---- one graded swap -------------------------------------------------------- */

async function gradedSwap(browser, page, { tag, park, from, to, expect }) {
  const mp = await measurePage(browser);
  try {
    // settle on the destination, then on the origin: both references are real
    // screenshots of screens this run actually rendered, never a stored image.
    for (const s of park) { await tap(page, s); await sleep(2500); }
    await tap(page, to); await sleep(4000);
    const refNew = await mp.grab(await page.screenshot({ encoding: 'base64' }));
    for (const s of park) { await tap(page, s); await sleep(2500); }
    await tap(page, from); await sleep(4000);
    const refOld = await mp.grab(await page.screenshot({ encoding: 'base64' }));
    /* the outgoing screen's own idle churn: Today breathes, the hub animates, and
       a pure-OLD frame on those is not a zero. */
    await sleep(600);
    const refOld2 = await mp.grab(await page.screenshot({ encoding: 'base64' }));
    const noise = dist(refOld, refOld2);
    const refDiff = dist(refOld, refNew);

    const oldMax = Math.max(refDiff * OLD_FRAC, noise * NOISE_MULT);
    const goneMin = refDiff * GONE_FRAC;
    ok(`${tag}: SETUP the two screens are far enough apart, and the outgoing one still enough, to tell a blend from either (an empty or identical pair grades nothing)`,
      refDiff >= MIN_REFDIFF && oldMax < goneMin,
      `refDiff=${refDiff.toFixed(1)} idle-noise=${noise.toFixed(2)} bands: OLD<${oldMax.toFixed(1)} GHOST GONE>=${goneMin.toFixed(1)}`);
    if (!(refDiff >= MIN_REFDIFF && oldMax < goneMin)) return null;

    const cdp = await page.createCDPSession();
    const frames = [];
    cdp.on('Page.screencastFrame', async ({ data, metadata, sessionId }) => {
      frames.push({ data, t: metadata.timestamp * 1000 });
      try { await cdp.send('Page.screencastFrameAck', { sessionId }); } catch { /* stopped */ }
    });
    await cdp.send('Page.startScreencast', { format: 'png', everyNthFrame: 1 });
    await sleep(600);
    ok(`${tag}: SETUP the compositor produces frames at all (an empty capture means every result below is about nothing)`,
      frames.length > 0, `${frames.length} warm-up frame(s)`);
    frames.length = 0;

    await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });
    /* THE PRE-TAP PAINT IS TAKEN DIRECTLY. Page.screencastFrame only fires when
       the page changes, so a settled screen contributes no frame at all and the
       whole hold would be invisible to a capture-only timeline. This is the frame
       the player is looking at when the thumb lands. */
    const outShot = await page.screenshot({ encoding: 'base64' }).catch(() => null);
    const t0 = await page.evaluate(() => Math.round(performance.now()));
    const tapped = await tap(page, expect.control);
    await sleep(2200);
    await cdp.send('Page.stopScreencast').catch(() => {});
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 }).catch(() => {});
    await sleep(200);
    const marks = await page.evaluate(() => ({ origin: performance.timeOrigin, hash: location.hash }));
    await cdp.detach().catch(() => {});

    ok(`${tag}: SETUP the control was tapped and the app actually went somewhere`,
      tapped && (await page.evaluate(q => !!document.querySelector(q), expect.landed)),
      `tapped=${tapped} hash=${marks.hash || '(none)'} looking for ${expect.landed}`);

    const shots = frames.map(f => ({ data: f.data, ms: Math.round(f.t - marks.origin) - t0 }))
      .sort((a, b) => a.ms - b.ms);
    ok(`${tag}: SAMPLE the swap was captured`, shots.length >= MIN_FRAMES,
      `${shots.length} frames (need ${MIN_FRAMES})`);
    if (shots.length < MIN_FRAMES) return null;

    const rows = [{ ms: 0, dOld: dist(await mp.grab(outShot), refOld), pre: true }];
    for (const s of shots) {
      if (s.ms > 1600) break;
      rows.push({ ms: s.ms, dOld: dist(await mp.grab(s.data), refOld) });
    }
    const cls = r => (r.dOld < oldMax ? 'OLD' : r.dOld >= goneMin ? 'GONE' : 'GHOST');
    const arrival = rows.find(r => cls(r) === 'GONE');
    const window = arrival ? rows.filter(r => r.ms <= arrival.ms) : rows;
    const ghosts = window.filter(r => cls(r) === 'GHOST');

    ok(`${tag}: DETECTOR the capture holds BOTH states, so there was a handover in it to grade`,
      window.some(r => cls(r) === 'OLD') && !!arrival,
      `${window.filter(r => cls(r) === 'OLD').length} OLD frame(s), arrival ${arrival ? `at ${arrival.ms}ms` : 'NEVER SEEN'}`);

    const stale = Math.max(0, ...window.filter(r => cls(r) === 'OLD').map(r => r.ms));
    const margin = arrival ? arrival.dOld / refDiff : NaN;
    console.log(`      timeline: old screen whole to ${stale}ms, arrived at ${arrival ? arrival.ms : '-'}ms, ` +
      `${window.length} frames graded, arrival scored ${margin.toFixed(3)} of refDiff (band edge ${GONE_FRAC})` +
      (ghosts.length ? `\n      ghosts: ${ghosts.slice(0, 6).map(g => `${g.ms}ms dOld/refDiff=${(g.dOld / refDiff).toFixed(2)}`).join(', ')}` : ''));
    return { tag, ghosts, window, refDiff, stale, arrival, margin };
  } finally {
    await mp.close();
  }
}

const ghostRow = r => {
  if (!r) return;
  ok(`${r.tag}: GHOST every frame from the tap to the arrival is one of the two screens WHOLE, never a mix of them and never a half-built one`,
    r.ghosts.length === 0,
    r.ghosts.length
      ? `${r.ghosts.length} ghost frame(s) over ${r.ghosts[r.ghosts.length - 1].ms - r.ghosts[0].ms}ms`
      : `${r.window.length} frames graded, old whole to ${r.stale}ms then the new screen in one step, at ${r.margin.toFixed(3)} of refDiff`);
};

/* The three swaps this grades. `park` is where to stand so the control exists:
   a hub chip only exists on the hub. */
const SWAPS = [
  { tag: 'BONEYARD->TODAY', park: [], from: tabSel('boneyard'), to: tabSel('today'),
    expect: { control: tabSel('today'), landed: '.screen--today' } },
  { tag: 'TODAY->BONEHEAD', park: [], from: tabSel('today'), to: tabSel('bonehead'),
    expect: { control: tabSel('bonehead'), landed: '#chTabs' } },
  { tag: 'WARDROBE->SHOP', park: [tabSel('bonehead')], from: chipSel('wardrobe'), to: chipSel('shop'),
    expect: { control: chipSel('shop'), landed: '.gw-hero' } },
];

async function mainPasses() {
  const browser = await launch();
  try {
    const page = await openApp(browser);
    for (const s of SWAPS) ghostRow(await gradedSwap(browser, page, s));

    /* CAP: no screen pays revealWhenReady's whole 700ms cap because it is waiting
       on an image that will never arrive. A DOM fact, not a clock (see header). */
    const stops = [
      ['Today', tabSel('today'), null], ['Boneyard', tabSel('boneyard'), null],
      ['Crew', tabSel('friends'), null], ['Wardrobe', tabSel('bonehead'), null],
      ['Backpack', null, chipSel('crates')], ['Shop', null, chipSel('shop')],
      ['Build', null, chipSel('talents')], ['Looks', null, '.ward-looks'],
    ];
    const stuck = [];
    let seen = 0;
    for (const [name, tabS, chipS] of stops) {
      if (tabS) { await tap(page, tabS); }
      else { await tap(page, tabSel('bonehead')); await sleep(2200); await tap(page, chipS); }
      await sleep(2600);
      const r = await page.evaluate(() => {
        const imgs = [...document.querySelectorAll('#screen img:not([loading="lazy"])')];
        return { n: imgs.length, bad: imgs.filter(i => !i.complete || !i.naturalWidth).map(i => (i.getAttribute('src') || '?').slice(-40)) };
      });
      seen += r.n;
      if (r.bad.length) stuck.push(`${name}: ${r.bad.length} of ${r.n} (${r.bad.slice(0, 3).join(', ')})`);
    }
    ok('CAP: SAMPLE every stop rendered images to grade (zero examined is not a pass)',
      seen > 0, `${seen} eager images across ${stops.length} stops`);
    ok('CAP no screen holds its reveal on an image that never decodes, which is what pins an arrival to revealWhenReady\'s 700ms cap',
      stuck.length === 0, stuck.length ? stuck.join(' | ') : `${seen} eager images, all decoded, across ${stops.length} stops`);
  } finally {
    await browser.close().catch(() => {});
  }
}

/* ---- CONTROL: the grader can still see this bug ----------------------------- */

async function controlPass() {
  const tag = 'CONTROL (dissolve restored)';
  /* Served, not evaluated: holdOutgoing is module scope and unreachable from the
     page. Fetched over HTTP so this works against URL= as well as a served tree. */
  const src = await fetch(base + 'js/app.js').then(r => r.text()).catch(() => '');
  /* THE DELETED BEHAVIOUR IS PUT BACK EXACTLY AS IT WAS, JS AND CSS BOTH. The
     first draft of this control set `transition` and `opacity` inline from inside
     drop(), which runs in the same task that schedules the reveal, so the
     declaration had never been through a style recalc and the change beside it
     simply jumped. It reported zero ghosts: an audit certifying its own blind
     spot. The class and the stylesheet rule are what shipped, so they are what is
     restored. */
  const DROP = `    g.remove();
    try { cl?.(); } catch { /* never block navigation on teardown */ }`;
  const patched = src.replace(DROP, `    g.classList.add('screen-held-out');
    setTimeout(() => g.remove(), 260);
    try { cl?.(); } catch { /* never block navigation on teardown */ }`);
  const CSS = '.screen-held { transition: opacity .18s ease-out; } .screen-held-out { opacity: 0; }';
  const hits = src.split(DROP).length - 1;
  ok(`${tag}: SETUP the dissolve really was put back (an unpatched source would grade the healthy path and pass for the wrong reason)`,
    !!src && hits === 1 && patched !== src,
    `source ${src.length} bytes, needle found ${hits} time(s), patch ${patched === src ? 'DID NOT apply' : 'applied'}`);
  if (!src || patched === src || hits !== 1) return;

  const browser = await launch();
  try {
    const page = await openApp(browser, { appJs: patched, css: CSS });
    const r = await gradedSwap(browser, page, { ...SWAPS[0], tag });
    ok(`${tag}: the ghost is still detectable by this audit's own numbers (a green GHOST beside a green CONTROL grades nothing)`,
      !!r && r.ghosts.length > 0,
      r ? `${r.ghosts.length} ghost frame(s)${r.ghosts.length ? `, ${r.ghosts[0].ms}ms to ${r.ghosts[r.ghosts.length - 1].ms}ms` : ''}` : 'the pass did not complete');
  } finally {
    await browser.close().catch(() => {});
  }
}

/* ---- run -------------------------------------------------------------------- */

console.log(`grading ${base}\n`);
await mainPasses();
await controlPass();

srv?.close();
const failed = results.filter(r => !r.pass);
if (!results.length) { console.log('\nFAIL: no checks ran'); process.exit(1); }
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) { console.log('FAILED: ' + failed.map(f => f.name).join(' | ')); process.exit(1); }
console.log('every swap hands over on one frame');
process.exit(0);
