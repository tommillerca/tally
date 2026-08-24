/* A NAVIGATION NEVER SHOWS THE TRAY THE APP SITS ON.
 *
 * Tom, 2026-08-21: "swapping between boneyard and today briefly shows the empty
 * tray that sits behind the app. feels cheap"
 *
 * WHAT IT WAS. route() removed `screen-in` the moment a navigation started, and
 * app.css hides #screen without it (`.screen:not(.screen-in) { opacity: 0 }`).
 * revealWhenReady only puts it back once every image on the NEW screen has
 * decoded, up to a 700ms cap. So the outgoing screen was thrown away before the
 * incoming one existed and, for that whole window, the only thing painted was
 * what lives behind #screen: the body gradient, the grain and the bare tab bar.
 * Not a race that sometimes went the wrong way, the same as the boot flash was
 * not one: every real navigation opened the hole, and Boneyard -> Today is the
 * one Tom noticed because the map is the heaviest screen to leave.
 * Measured on pristine origin/main at 440x956 through a CDP screencast:
 *   CPU x1   4 bare frames, first at 70ms after the tap, content at 178ms
 *   CPU x6   6 bare frames, first at 77ms after the tap, content at 213ms
 * and on this branch, zero at both.
 * The fix is holdOutgoing() in js/app.js plus `.screen-held` in app.css: the
 * outgoing nodes are MOVED into a copy parked over #screen, the new screen
 * builds underneath it, and the copy dissolves off once the reveal lands.
 *
 * HOW IT IS GRADED, and why not a computed style. tally/CLAUDE.md: assert
 * PIXELS. `getComputedStyle(#screen).opacity` would have read 0 on a frame
 * nobody captured and told us nothing about what the player saw in front of it,
 * which is the entire question here. So this drives a REAL tap on the REAL tab
 * control with the screencast already running, and reduces every frame to the
 * same two numbers tests/boot-flash-audit.mjs uses, for the same reasons:
 *
 *   lime   pixels of the accent colour in the BOTTOM 12% of the frame. The FAB
 *          is a lime rounded square in the middle of the tab bar and nothing
 *          else down there is that colour, so this IS "the app furniture is
 *          painted", i.e. we are looking at the app and not at a blank tab.
 *   edge   percentage of sampled pixel pairs in the TOP 85% that differ. The
 *          tray is a smooth gradient, so it scores ~0 and anything actually
 *          rendered scores percent.
 *
 * A BAD frame is lime present AND the screen above it empty: the tray.
 * Measured here, every frame of every run:
 *                                   bad frames   edge on a bad frame
 *   pristine origin/main, x6                 6                 0.02 %
 *   this branch, x6                          0                     -
 * and for scale the Boneyard's own screen scores 9.3%, Today 16.5%, and the
 * middle of the dissolve, where both screens are partly visible, 20.2%. The
 * thresholds (lime >= 200, edge < 1.0%) sit in a gap with no overlap either way.
 *
 * THE BOUND IS ZERO, NOT A TREND (anti-regression rule 11). Not "fewer bare
 * frames than before": no captured frame anywhere in the swap may be one.
 *
 * THE DETECTOR PROVES ITSELF ON EVERY RUN, not once in my session. A pixel
 * grader that has drifted off the tab bar's colour, or off a viewport where the
 * FAB moved, passes everything silently, and this repo has shipped exactly that
 * before. So CONTROL runs the same graded swap with one line of CSS injected
 * (`.screen-held { display: none }`), which puts the app back to the bug and
 * nothing else, and REQUIRES bare frames. Green CONTROL plus green FLASH is the
 * only combination that means anything; a green FLASH next to a green CONTROL is
 * an audit grading nothing and fails.
 *
 * AND THE LID COMES OFF BY ITSELF (anti-regression rule 8: whatever covers the
 * app owns uncovering it). A frozen copy of the last screen parked over a live
 * one is a worse bug than the flash, so FAILSAFE serves a js/app.js whose
 * revealWhenReady never resolves, which is the one failure that can strand it,
 * and requires the copy to be gone anyway inside its own 1200ms cap. SWEEP is
 * the everyday version: mash the tabs and nothing may be left behind.
 *
 * NO SWIFTSHADER, same measurement as boot-flash-audit: the software rasteriser
 * costs longer than the whole transition, so the window closes before the
 * capture opens. Nothing graded here needs WebGL. The Boneyard is graded on its
 * intro state, which is a real, full-bleed `.screen--map` screen and the one a
 * player sees on arrival; the map itself needs a reachable vector tile host and
 * would make this audit's result depend on the network. SETUP asserts the
 * outgoing screen was genuinely painted before the tap, so a run that landed on
 * a half-loaded screen fails loudly instead of grading a hole against a hole.
 *
 * PROVE-RED (confirmed 2026-08-21, three throwaway trees under /private/tmp).
 * Each mutation reddens the row that owns it and no other, which is the part
 * worth having: a suite where every mutation reddens everything is one
 * assertion wearing a lot of names.
 *   drop `holdOutgoing(scr)` from route(), i.e. the fix reverted
 *        -> FLASH red on all three graded swaps (9, 9 and 3 bare frames, over
 *           132ms, 148ms and 24ms), CANVAS red, CONTROL still green. 35/39.
 *   `g.append(...el.childNodes)` -> `.map(n => n.cloneNode(true))`
 *        -> CANVAS red alone, held=9 inked=0: nine canvases in the copy and not
 *           one pixel in any of them. 38/39.
 *   delete the 1200ms `cap` timer in holdOutgoing
 *        -> FAILSAFE red alone, one copy still parked over the app. 38/39.
 *
 * Usage: node tests/route-flash-audit.mjs [baseUrl]   (serves this repo if omitted)
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

/* Measured on this tree; see the header table. A bare frame scores 0.02% and the
   leanest real screen 9.3%, so neither number is a knife edge. */
const LIME_MIN = 200;
const EDGE_FLOOR = 1.0;
const MIN_FRAMES = 3;
const HOLD_CAP_MS = 1200;   // js/app.js holdOutgoing: the copy removes itself by then
/* THE BUDGETS ARE MEASURED, NOT CHOSEN, AND THEY ARE PER-SWAP BECAUSE THE TWO
   SWAPS ARE NOT THE SAME PROBLEM. Every number below was taken on this tree at
   440x956, CPU x6, on a QUIET machine (load average 6), before and after the
   one-line change to revealWhenReady in js/app.js (2026-08-23, Tom's item 18 of
   docs/FEEDBACK-2026-08-22-v424.md: the old screen sits there before the swap):

     swap               before   after   decode wait before -> after
     Boneyard->Today     138ms   101ms          31ms ->   2ms
     Today->Bonehead     191ms   166ms         139ms -> 113ms

   ONLY Boneyard->Today IS GRADED, AND THE OTHER ONE IS ONLY PRINTED. That is a
   measurement result, not laziness. Repeating each state on a quiet machine:

     Boneyard->Today   fixed 96, 101ms     defect 131, 138ms   (spread ~5-7ms)
     Today->Bonehead   fixed 166ms         defect 191, 284ms   (spread ~93ms)

   Boneyard->Today has a clean 30ms gap between the two states and a spread far
   smaller than the gap, so a bound placed in the middle of it is a real guard:
   115 passes the fixed state by 14-19ms and goes red on the defect by 16-23ms.
   Proven both ways by hand on 2026-08-23 (delete the .filter in revealWhenReady,
   both runs go red; put it back, both go green).
   Today->Bonehead cannot carry a bound. It is ~54 non-lazy images freshly
   created by innerHTML on every render, so they are genuinely still LOADING
   when the reveal asks rather than merely undecoded, the filter has almost
   nothing to skip, and its own defect state ranged 191 to 284ms across two
   quiet runs. Any bound tight enough to be useful there would go red on healthy
   code, which is worse than no bound at all. So the number is printed on every
   run for a human to watch, and nothing is asserted about it.

   AMENDED 2026-08-23, same day, by the lead, when the branch was merged and the
   suite was run on the machine the GATE actually runs on rather than a quiet one.

   The 30ms gap above is real but it is a QUIET-MACHINE gap. Measured on the
   merged tree at load 12 to 16, which is normal here with other sessions working,
   the FIXED state read 160, 178 and 266ms. The quiet DEFECT state was 131 and
   138ms. So under contention the fixed state OVERLAPS the defect state, and no
   single number separates them across load conditions. A bound with a 14 to 23ms
   margin cannot survive a machine whose noise floor is larger than its margin.

   That is not a reason to widen the bound to 270, which would pass the defect. It
   is the same conclusion this comment already reached for Today->Bonehead one
   paragraph up: a bound that goes red on healthy code is worse than no bound at
   all. So Boneyard->Today now follows its sibling. The number is PRINTED every
   run for a human to watch, and nothing is asserted about it.

   The improvement itself is not in doubt and is not what was withdrawn: 138ms to
   101ms quiet, decode wait 31ms to 2ms, and the service worker half of this branch
   is separately proven by sw-upgrade-audit at 53 checks green including three
   deliberately-broken-worker modes.

   To restore a real bound, this row needs a harness that measures under a
   controlled load rather than whatever the machine happens to be doing, or a
   metric that is not wall-clock. Until someone builds that, printing is honest and
   asserting is not. */
const HOLD_BUDGET_MS = {};   // see above: no wall-clock bound survives a shared machine
const CPU = 6;              // the honest model of the phone Tom is holding: same bytes, slower CPU
const W = 440, H = 956;

const puppeteer = await loadPuppeteer();
const launch = () => puppeteer.launch({
  headless: process.env.HEADLESS_MODE || 'shell',
  executablePath: chromePath(),
  args: [...sandboxArgs(), '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding'],
});

/* Decode a screenshot into the two numbers this grades on, in a THROWAWAY page:
   the page under test is mid-navigation and is the subject of the measurement.
   Same canvas approach as boot-flash-audit.mjs, so no image dependency. */
const measurePage = async browser => {
  const p = await browser.newPage();
  await p.goto('data:text/html,<body></body>');
  return {
    close: () => p.close().catch(() => {}),
    measure: b64 => p.evaluate(async data => {
      const img = new Image();
      img.src = 'data:image/png;base64,' + data;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      const g = c.getContext('2d', { willReadFrequently: true });
      g.drawImage(img, 0, 0);
      const Wp = c.width, Hp = c.height;
      const d = g.getImageData(0, 0, Wp, Hp).data;
      const at = (x, y) => { const i = (y * Wp + x) * 4; return [d[i], d[i + 1], d[i + 2]]; };
      let lime = 0;
      for (let y = Math.floor(Hp * 0.88); y < Hp; y += 2)
        for (let x = 0; x < Wp; x += 2) {
          const [r, gg, b] = at(x, y);
          if (gg > 180 && r >= 130 && r <= 235 && b < 120) lime++;
        }
      let edges = 0, tot = 0;
      for (let y = 0; y < Math.floor(Hp * 0.85); y += 3)
        for (let x = 0; x + 2 < Wp; x += 3) {
          const a = at(x, y), c2 = at(x + 2, y);
          tot++;
          if (Math.abs(a[0] - c2[0]) + Math.abs(a[1] - c2[1]) + Math.abs(a[2] - c2[2]) > 24) edges++;
        }
      return { lime, edge: (edges / Math.max(tot, 1)) * 100 };
    }, b64),
  };
};

/* ---- a booted, settled app -------------------------------------------------- */

async function openApp(browser, { reducedMotion = false, appJs = null } = {}) {
  const page = await browser.newPage();
  await page.setViewport({ width: W, height: H, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  if (reducedMotion) await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  if (appJs) {
    await page.setRequestInterception(true);
    page.on('request', r => {
      if (/\/js\/app\.js(\?|$)/.test(r.url())) r.respond({ status: 200, contentType: 'text/javascript', body: appJs }).catch(() => {});
      else r.continue().catch(() => {});
    });
  }
  await page.goto(base + '?demo', { waitUntil: 'networkidle2', timeout: 60000 });
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

/* A REAL TAP ON THE REAL CONTROL. Programmatic location.hash would skip the tab
   handler entirely, and this audit is about what a player's thumb produces. */
const tapTab = async (page, tab) => {
  const at = await page.evaluate(t => {
    const b = document.querySelector(`#tabbar .tab[data-tab="${t}"]`);
    if (!b) return null;
    const r = b.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, tab);
  if (!at) return false;
  await page.mouse.click(at.x, at.y);
  return true;
};

/* ---- one graded swap -------------------------------------------------------- */

async function gradedSwap(browser, page, { tag, from, to }) {
  if (from) { await tapTab(page, from); await sleep(5000); }

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
  if (!frames.length) { await cdp.send('Page.stopScreencast').catch(() => {}); return; }
  frames.length = 0;

  /* When #screen gets the NEW screen's content. holdOutgoing MOVES the old nodes
     out, so #screen goes empty and then fills: the first ADD after the tap is the
     new render landing. The graded window is everything up to that moment, and
     without it there is no telling "no bare frames" from "captured too late". */
  await page.evaluate(() => {
    const s = document.getElementById('screen');
    window.__swap = { content: null, held: null, swapped: null };
    window.__swapObs = new MutationObserver(muts => {
      for (const m of muts) {
        if (m.addedNodes.length && s.children.length && window.__swap.content === null) {
          window.__swap.content = Math.round(performance.now());
        }
      }
    });
    window.__swapObs.observe(s, { childList: true });
    /* THE FROZEN FRAME, WHICH IS A DIFFERENT NUMBER FROM `content`.
       Tom, item 18 of docs/FEEDBACK-2026-08-22-v424.md: the old screen sits
       there for a moment before the new one appears. `content` above is when
       the new screen entered the DOM, and at that instant it is still INVISIBLE
       underneath the held copy (app.css: .screen:not(.screen-in){opacity:0}).
       What the player watches is the held copy, and it is removed in the same
       task that applies `screen-in`, so the removal of `.screen-held` IS the
       swap. It happens on #screen's PARENT, because holdOutgoing parks the copy
       as a sibling (el.after(g)), which is why this is a second observer and
       not another branch of the one above. */
    window.__heldObs = new MutationObserver(muts => {
      for (const m of muts) {
        for (const n of m.addedNodes) {
          if (n.classList?.contains('screen-held') && window.__swap.held === null) window.__swap.held = Math.round(performance.now());
        }
        for (const n of m.removedNodes) {
          if (n.classList?.contains('screen-held') && window.__swap.swapped === null) window.__swap.swapped = Math.round(performance.now());
        }
      }
    });
    window.__heldObs.observe(s.parentNode, { childList: true });
  });

  await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });
  /* THE OUTGOING FRAME IS TAKEN DIRECTLY, NOT FISHED OUT OF THE SCREENCAST.
     Page.screencastFrame only fires when the page CHANGES, and a settled screen
     under prefers-reduced-motion changes nothing at all: that pass produced 8
     frames where an ordinary one produces 280, none of them before the tap, and
     the row below read as a broken app instead of as an idle compositor. A
     screenshot is the same paint with no change-detection in front of it. */
  const outShot = await page.screenshot({ encoding: 'base64' }).catch(() => null);
  const tap = await page.evaluate(() => Math.round(performance.now()));
  const tapped = await tapTab(page, to);
  await sleep(3000);
  await cdp.send('Page.stopScreencast').catch(() => {});
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 }).catch(() => {});
  await sleep(200);

  const marks = await page.evaluate(() => {
    window.__swapObs?.disconnect();
    window.__heldObs?.disconnect();
    return {
      origin: performance.timeOrigin, hash: location.hash,
      content: window.__swap?.content ?? null,
      held: window.__swap?.held ?? null,
      swapped: window.__swap?.swapped ?? null,
    };
  });

  ok(`${tag}: SETUP the tab was tapped and the app actually navigated`,
    tapped && new RegExp(to === 'today' ? 'today|^$' : to).test(marks.hash || ''),
    `tapped=${tapped} hash=${marks.hash || '(none)'}`);

  const shots = frames.map(f => ({ data: f.data, ms: Math.round(f.t - marks.origin) - tap }))
    .sort((a, b) => a.ms - b.ms);
  const contentAt = marks.content === null ? null : marks.content - tap;

  ok(`${tag}: SAMPLE the swap was actually captured`, shots.length >= MIN_FRAMES,
    `${shots.length} frames (need ${MIN_FRAMES})`);
  ok(`${tag}: SAMPLE the new screen rendered, so there is a "before content" to grade`,
    contentAt !== null, `#screen got the new content at ${contentAt}ms after the tap`);
  if (shots.length < MIN_FRAMES || contentAt === null) return;

  const mp = await measurePage(browser);
  const scored = [];
  for (const s of shots) scored.push({ ms: s.ms, ...(await mp.measure(s.data)) });
  const outgoing = outShot ? await mp.measure(outShot) : null;
  await mp.close();

  const before = scored.filter(s => s.ms <= contentAt);
  ok(`${tag}: SAMPLE at least one painted frame landed BEFORE the new screen had content (else this run could not contain the bug)`,
    before.length > 0, `${before.length} of ${scored.length} frames at or before ${contentAt}ms`);

  /* The outgoing screen has to have been a real picture, or "the hold held
     nothing" and "the hold worked" are the same measurement. A Boneyard whose
     tiles never arrived is the realistic way to land here. */
  ok(`${tag}: SETUP the outgoing screen was genuinely painted before the tap`,
    !!outgoing && outgoing.edge >= EDGE_FLOOR,
    outgoing ? `edge=${outgoing.edge.toFixed(2)}% lime=${outgoing.lime}` : 'the pre-tap screenshot failed');

  const withBar = scored.filter(s => s.lime >= LIME_MIN);
  const real = withBar.filter(s => s.edge >= EDGE_FLOOR);
  ok(`${tag}: DETECTOR a real screen with a real tab bar was seen (a detector that never fires would pass everything)`,
    real.length > 0,
    `${withBar.length} frames scored lime>=${LIME_MIN}, ${real.length} of them over content; best lime=${Math.max(0, ...scored.map(s => s.lime))}, best edge=${Math.max(0, ...scored.map(s => s.edge)).toFixed(1)}%`);

  const bare = scored.filter(s => s.lime >= LIME_MIN && s.edge < EDGE_FLOOR);
  const heldAt = marks.held === null ? null : marks.held - tap;
  const swapAt = marks.swapped === null ? null : marks.swapped - tap;
  return { scored, bare, contentAt, heldAt, swapAt };
}

/* HOW LONG THE PLAYER LOOKS AT THE OLD SCREEN.
   Reported for every swap and BOUNDED, because the fix for the tray flash was
   to freeze the old paint and the failure mode of a freeze is that it lasts too
   long. contentAt is the render, swapAt is the moment the player actually sees
   the new screen, and the gap between them is time spent inside
   revealWhenReady waiting on img.decode(). */
const holdRow = (tag, r) => {
  if (!r) return;
  console.log(`      ${tag}: held at ${r.heldAt}ms, new content in the DOM at ${r.contentAt}ms,`
    + ` the player sees the swap at ${r.swapAt}ms (decode wait = ${r.swapAt !== null && r.contentAt !== null ? r.swapAt - r.contentAt : '?'}ms), CPU x${CPU}`);
  ok(`${tag}: SAMPLE the swap moment was captured (the held copy was seen going on and coming off)`,
    r.heldAt !== null && r.swapAt !== null, `held=${r.heldAt} swapped=${r.swapAt}`);
  if (r.swapAt === null) return;
  const budget = HOLD_BUDGET_MS[tag];
  if (!budget) {
    /* PRINTED, NOT ASSERTED. Printing is the whole point of withdrawing the bound:
       delete the number as well and the withdrawal becomes a silent loss of the
       measurement, which is worse than a flaky row. A human watching the gate can
       still see this move. The 1200ms hard cap below is still ASSERTED, so a
       catastrophic regression is not invisible, only a 40ms one. */
    console.log(`      ${tag}: HOLD the old screen held for ${r.swapAt}ms (printed, not asserted; hard cap ${HOLD_CAP_MS}ms still enforced)`);
    return;
  }
  ok(`${tag}: HOLD the frozen old screen is gone within ${budget}ms of the tap`,
    r.swapAt <= budget, `the player looked at the old screen for ${r.swapAt}ms (budget ${budget}ms, hard cap ${HOLD_CAP_MS}ms)`);
};

const flashRow = (tag, r) => {
  if (!r) return;
  ok(`${tag}: FLASH no painted frame shows the tray behind the app`,
    r.bare.length === 0,
    r.bare.length
      ? `${r.bare.length} bare frame(s) over ${r.bare[r.bare.length - 1].ms - r.bare[0].ms}ms: ${r.bare.slice(0, 5).map(b => `${b.ms}ms lime=${b.lime} edge=${b.edge.toFixed(2)}%`).join(', ')}`
      : `${r.scored.length} frames graded, content at ${r.contentAt}ms`);
};

/* ---- the graded passes ------------------------------------------------------ */

async function mainPasses() {
  const browser = await launch();
  try {
    const page = await openApp(browser);

    /* Tom's exact complaint. The Boneyard is full-bleed `.screen--map` with no
       padding, so it is the one screen whose held copy could be laid out wrong
       and still look plausible on a padded one. */
    const rboneyard = await gradedSwap(browser, page, { tag: 'BONEYARD->TODAY', from: 'boneyard', to: 'today' });
    flashRow('BONEYARD->TODAY', rboneyard);
    holdRow('BONEYARD->TODAY', rboneyard);

    /* Not a Boneyard special case: a padded screen to a screen full of <canvas>
       art. This is also the pass that would go red if the copy were ever made
       with cloneNode, because a cloned canvas has a blank bitmap. */
    const rtoday = await gradedSwap(browser, page, { tag: 'TODAY->BONEHEAD', from: 'today', to: 'bonehead' });
    flashRow('TODAY->BONEHEAD', rtoday);
    holdRow('TODAY->BONEHEAD', rtoday);

    /* THE COPY IS MADE OF THE REAL NODES, NOT A PICTURE OF THEM. Reparenting a
       canvas keeps its bitmap and cloning it does not, and this app draws its
       cosmetics, its crew fan and its shop art into canvases. Read the pixels
       out of the held copy while it is on screen, which is the only moment the
       distinction exists. */
    await tapTab(page, 'bonehead');
    await sleep(4000);
    const canvas = await page.evaluate(() => new Promise(res => {
      const big = root => [...root.querySelectorAll('canvas')].filter(c => c.width > 8 && c.height > 8);
      const before = big(document.getElementById('screen')).length;
      document.querySelector('#tabbar .tab[data-tab="today"]').click();
      /* A tab tap sets location.hash and hashchange is a TASK, so route() has not
         run yet on the line after the click and the copy does not exist. Poll on
         rAF instead of guessing a delay: the copy only lives from the reveal
         until ~260ms later, which is too short a window to sleep at. */
      let n = 0;
      const tick = () => {
        const held = document.querySelector('.screen-held');
        if (held) {
          const cvs = big(held);
          let inked = 0;
          for (const c of cvs) {
            try {
              const d = c.getContext('2d')?.getImageData(0, 0, c.width, c.height).data;
              if (d && d.some(v => v !== 0)) inked++;
            } catch { /* tainted or webgl: not this row's business */ }
          }
          res({ before, held: cvs.length, inked });
        } else if (++n > 180) res({ before, err: 'nothing was held' });
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }));
    ok('CANVAS the held copy carries the outgoing screen\'s real canvases (a cloneNode copy would hand back blank bitmaps)',
      !canvas.err && canvas.before > 0 && canvas.held === canvas.before && canvas.inked === canvas.held,
      JSON.stringify(canvas));
    await sleep(2000);

    /* SWEEP: a copy of a screen parked over a live one is worse than the flash it
       prevents, so mash the tabs the way an impatient thumb does and require the
       app to end up with nothing left over and a real screen showing. */
    for (const t of ['boneyard', 'today', 'bonehead', 'boneyard', 'today']) {
      await tapTab(page, t);
      await sleep(120);
    }
    await sleep(HOLD_CAP_MS + 2500);
    const swept = await page.evaluate(() => ({
      held: document.querySelectorAll('.screen-held').length,
      opacity: getComputedStyle(document.getElementById('screen')).opacity,
      kids: document.getElementById('screen').children.length,
    }));
    ok('SWEEP a burst of navigations leaves no held copy behind, over a screen that is visible',
      swept.held === 0 && swept.opacity !== '0' && swept.kids > 0, JSON.stringify(swept));
  } finally {
    await browser.close().catch(() => {});
  }
}

/* ---- reduced motion: the copy still leaves ---------------------------------- */

async function reducedMotionPass() {
  const browser = await launch();
  try {
    const page = await openApp(browser, { reducedMotion: true });
    const still = await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
    ok('REDUCED-MOTION: SETUP the page really is in reduced motion',
      still === true, `matchMedia says ${still}`);
    flashRow('REDUCED-MOTION', await gradedSwap(browser, page, { tag: 'REDUCED-MOTION', from: 'boneyard', to: 'today' }));
    /* The dissolve is a transition, and reduced motion sets it to none. Nothing
       waits on transitionend for exactly that reason, so the copy must still be
       gone: a hard cut is the intended degradation, a permanent lid is not. */
    const left = await page.evaluate(() => document.querySelectorAll('.screen-held').length);
    ok('REDUCED-MOTION: the held copy is removed on a timer, not on transitionend (with no transition there is no event)',
      left === 0, `${left} copies left on screen`);
  } finally {
    await browser.close().catch(() => {});
  }
}

/* ---- CONTROL: the grader can still see this bug ----------------------------- */

async function controlPass() {
  const tag = 'CONTROL (fix neutered)';
  const browser = await launch();
  try {
    const page = await openApp(browser);
    /* One line, at the CSS layer, putting the app back to exactly the reported
       bug and changing nothing else: the copy is still built and still removed,
       it simply does not cover the gap. */
    await page.addStyleTag({ content: '.screen-held { display: none !important; }' });
    const r = await gradedSwap(browser, page, { tag, from: 'boneyard', to: 'today' });
    ok(`${tag}: the bug is still detectable by this audit's own numbers (a green FLASH beside a green CONTROL grades nothing)`,
      !!r && r.bare.length > 0,
      r ? `${r.bare.length} bare frame(s)${r.bare.length ? `, first at ${r.bare[0].ms}ms edge=${r.bare[0].edge.toFixed(2)}%` : ''}` : 'the pass did not complete');
  } finally {
    await browser.close().catch(() => {});
  }
}

/* ---- FAILSAFE: the lid comes off even if the reveal never lands -------------- */

async function failsafePass() {
  const tag = 'FAILSAFE';
  /* Served, not evaluated: revealWhenReady is a module-scope function and there
     is no way to reach it from the page. Fetched over HTTP rather than read off
     disk so this works against URL= as well as the served tree. */
  const src = await fetch(base + 'js/app.js').then(r => r.text()).catch(() => '');
  const NEEDLE = "async function revealWhenReady(root, { cls = 'ready', cap = 700 } = {}) {";
  const patched = src.replace(NEEDLE,
    "async function revealWhenReady(root, opts = {}) {\n  if (window.__stallReveal) return new Promise(() => {});\n  const { cls = 'ready', cap = 700 } = opts;");
  ok(`${tag}: SETUP the reveal really was stalled (an unpatched source would grade the healthy path and pass for the wrong reason)`,
    !!src && patched !== src, `source ${src.length} bytes, patch ${patched === src ? 'DID NOT apply' : 'applied'}`);
  if (!src || patched === src) return;

  const browser = await launch();
  try {
    const page = await openApp(browser, { appJs: patched });
    await tapTab(page, 'boneyard');
    await sleep(5000);
    await page.evaluate(() => { window.__stallReveal = true; });
    await tapTab(page, 'today');
    await sleep(400);
    const during = await page.evaluate(() => ({
      held: document.querySelectorAll('.screen-held').length,
      opacity: getComputedStyle(document.getElementById('screen')).opacity,
    }));
    ok(`${tag}: SETUP the reveal is genuinely stuck, so there is something for the cap to rescue`,
      during.opacity === '0', `#screen opacity=${during.opacity} ${during.held} held`);
    await sleep(HOLD_CAP_MS + 800 - 400);
    const after = await page.evaluate(() => document.querySelectorAll('.screen-held').length);
    ok(`${tag}: the held copy removes ITSELF inside its cap, so a reveal that never lands degrades to ugly and never to a frozen app`,
      after === 0, `${after} copies still on screen ${HOLD_CAP_MS + 800}ms after the tap`);
  } finally {
    await browser.close().catch(() => {});
  }
}

/* ---- run -------------------------------------------------------------------- */

console.log(`grading ${base}\n`);
await mainPasses();
await reducedMotionPass();
await controlPass();
await failsafePass();

srv?.close();
const failed = results.filter(r => !r.pass);
if (!results.length) { console.log('\nFAIL: no checks ran'); process.exit(1); }
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) { console.log('FAILED: ' + failed.map(f => f.name).join(' | ')); process.exit(1); }
console.log('no navigation shows the tray');
process.exit(0);
