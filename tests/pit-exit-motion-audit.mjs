/* THE PIT'S EXIT ANIMATION. Tom on live v487: "Exit animation from the pit
 * feels slightly laggy."
 *
 * THE CAUSE, found by instrumenting the real close, not by reading the CSS.
 * openFight's fight sheet is opened with an onClose (js/app.js, where the
 * sheet is created) that already re-renders the Pit behind it on the way out:
 * `if (pitWrap && pitWrap.isConnected && $('#pitBody', pitWrap))
 * renderPit(pitWrap);` - added 2026-08-11 so the FIGHT button a player just
 * used doesn't sit there stale. #fightDone's own click handler carried a
 * SECOND, independent call to the same function: `setTimeout(() =>
 * renderPit(pitWrap), 250)`. Both fire on every ordinary Pit-launched win.
 *
 * MEASURED with a MutationObserver on #pitBody around a real, mouse-dispatched
 * tap on #fightDone (a rung-1 ladder win, node count above): #pitBody's
 * children were replaced TWICE - once at 16ms (onClose's own render) and again
 * at 262ms. app.css's close transition (`.sheet.closing { animation: sheetOut
 * .2s ... }`) is 200ms, so the second write landed right on its tail: a full
 * IndexedDB read (buildFighter, db.all('xp'), refreshPitEnergy) plus a full
 * #pitBody innerHTML rebuild, competing with the slide for the main thread,
 * for a re-render onClose had already done. FIXED by deleting the redundant
 * setTimeout, not deferring it: onClose's own render already covers every case
 * the deleted one did, so re-running this probe after the fix shows #pitBody
 * written exactly ONCE.
 *
 * SECTION 1 is that count, and it is the reliable half of this file: whether
 * the render fires once or twice does not depend on this machine's speed.
 *
 * SECTION 2 is real frame timing (rAF timestamps for 400ms after the tap,
 * gaps over 20ms counted as dropped), bounded against a CONTROL measured in
 * the SAME run (closing the Stable, whose onClose does a single `refresh()`
 * and nothing else) rather than a fixed number, because an idle Mac's frame
 * budget is not a phone's. RECORDED HONESTLY: on the dev machine this was
 * written on, restoring the deleted setTimeout did NOT drop a frame here -
 * this Mac is fast enough that a second #pitBody rewrite lands and finishes
 * inside a single frame budget it has to spare. Section 2 is real
 * measurement, not a fake pass, but section 1 is the one this bug actually
 * turns red: it counts the redundant work directly instead of hoping this
 * machine is slow enough to feel it, which is also why a phone can feel it
 * and this Mac's CI run may not.
 *
 * Run: node tests/pit-exit-motion-audit.mjs http://127.0.0.1:PORT/
 */
import { boot, seed, sleep, fightRung, finishFight, serveTree } from './godmode.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const fails = [];
const ok = (n, p, d = '') => { console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${d ? '  ' + d : ''}`); if (!p) fails.push(n); };

const argv = process.argv[2] || process.env.URL;
const srvHandle = argv ? null : await serveTree(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));
const base = argv || srvHandle?.url;

const { browser, page } = await boot(base);
await seed(page, { level: 30, coins: 500, dust: 500 });

/* Arm a rAF + MutationObserver collector on the NEXT real click matching
 * `sel`. Started from inside a capture-phase click listener so it begins in
 * the SAME task as the app's own click handler, not a tick later. */
async function armCollector(page, sel, watchSelector) {
  await page.evaluate((s, watchSel) => {
    window.__pitMotion = null;
    const handler = (e) => {
      if (!e.target.closest(s)) return;
      document.removeEventListener('click', handler, true);
      const rec = { raf: [], writes: [] };
      window.__pitMotion = rec;
      const t0 = performance.now();
      if (watchSel) {
        const target = document.querySelector(watchSel);
        if (target) {
          const mo = new MutationObserver(muts => {
            for (const m of muts) if (m.type === 'childList' && m.addedNodes.length) rec.writes.push(+(performance.now() - t0).toFixed(1));
          });
          mo.observe(target, { childList: true });
        }
      }
      const start = performance.now();
      function loop(ts) {
        rec.raf.push(+ts.toFixed(2));
        if (ts - start < 450) requestAnimationFrame(loop);
        else rec.done = true;
      }
      requestAnimationFrame(loop);
    };
    document.addEventListener('click', handler, true);
  }, sel, watchSelector);
}
async function readCollector(page) {
  await page.waitForFunction(() => window.__pitMotion && window.__pitMotion.done, { timeout: 5000 }).catch(() => {});
  return page.evaluate(() => window.__pitMotion);
}
function droppedFrames(rec) {
  const gaps = [];
  for (let i = 1; i < rec.raf.length; i++) gaps.push(rec.raf[i] - rec.raf[i - 1]);
  return gaps.filter(g => g > 20).length;
}

/* ---- CONTROL: close the Stable. Its onClose is `refresh()` and nothing
   else - one re-render, not two, and no fight-arena background loops behind
   it. Whatever it drops here is the noise floor for this machine, this run. */
await page.evaluate(() => { location.hash = '#/'; });
await sleep(1400);
const stableOpened = await page.evaluate(() => { document.getElementById('stableBtn')?.click(); return !!document.getElementById('stableBtn'); });
await sleep(1600);
const stableIsOpen = await page.evaluate(() => !!document.getElementById('stableBody'));
ok('SETUP: the Stable opened, for the control close', stableOpened && stableIsOpen);
await armCollector(page, '#sheets .sheet-close', null);
const stableClose = await page.evaluate(() => {
  const b = document.querySelector('#sheets .sheet-close');
  if (!b) return null;
  const r = b.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
});
if (stableClose) await page.mouse.click(stableClose.x, stableClose.y);
const stableRec = await readCollector(page);
const controlDropped = stableRec ? droppedFrames(stableRec) : 0;
console.log(`control (Stable close) dropped frames this run: ${controlDropped}`);

/* ---- THE PIT: win a real ladder fight through the real engine, tap the
   real #fightDone button, and watch #pitBody + the frame clock. ---- */
await sleep(500);
await page.evaluate(() => { location.hash = '#/'; });
await sleep(1400);
const started = await fightRung(page, 1).catch(() => false);
ok('SETUP: a rung-1 ladder fight opened, to close for real', started);
if (started) {
  await finishFight(page, 'p');
  await sleep(1600);
  const hasDone = await page.evaluate(() => !!document.getElementById('fightDone'));
  ok('SETUP: the win produced a real #fightDone button to tap', hasDone);
  if (hasDone) {
    await armCollector(page, '#fightDone', '#pitBody');
    const doneBtn = await page.evaluate(() => {
      const b = document.getElementById('fightDone');
      const r = b.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    await page.mouse.click(doneBtn.x, doneBtn.y);
    const pitRec = await readCollector(page);

    /* SECTION 1: the deterministic half. #pitBody is written by exactly ONE
       renderPit() call per close - onClose's. A second write is the
       redundant setTimeout back again. */
    ok('#pitBody is re-rendered ONCE on the way out of a won fight, not twice',
      pitRec && pitRec.writes.length === 1,
      pitRec ? `writes at ${JSON.stringify(pitRec.writes)}ms after the tap` : 'no data');

    /* SECTION 2: real frame timing, bounded by the control measured above in
       this same run rather than a fixed constant this machine cannot promise. */
    const pitDropped = pitRec ? droppedFrames(pitRec) : 99;
    ok('the Pit close drops no more frames than the Stable close did, same run',
      pitDropped <= controlDropped + 1,
      `Pit dropped ${pitDropped}, Stable(control) dropped ${controlDropped}`);
  }
}

await browser.close();
if (srvHandle) srvHandle.close();
console.log(fails.length ? `\n${fails.length} FAILED: ${fails.join(', ')}` : '\nall green');
process.exit(fails.length ? 1 : 0);
