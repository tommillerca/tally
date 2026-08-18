/* tests/fight-tray-audit.mjs
 *
 * THE BUG (Tom, 2026-08-16, with a screenshot): "the buttons now have text
 * falling off and are hard to see and press".
 *
 * A v383 regression, mine. ext/arena-static-height made the arena a fixed height
 * and the move tray the elastic part. A grid auto row takes its BASE size from
 * min-content and only grows toward max-content if the container has room. A
 * <button> with min-height:44px contributes 44px of min-content, so once the
 * tray landed at 159.2px against 202px of content, no row grew past 44 and every
 * two-line subtitle spilled 17px, 13.8px of it painted ink OUTSIDE the button.
 *
 * WHY THIS FILE EXISTS AND fight-layout-audit DID NOT CATCH IT: every existing
 * fight check measures boxes. This one measures the relationship between a box
 * and the text inside it, which is the only thing that was wrong. A button can
 * be a perfect 44x44 tap target and still have its own label hanging out of it.
 *
 * DIRECTION AND BOUND, not a trend (anti-regression rule 11): failure is
 * scrollHeight exceeding clientHeight by more than the border+padding slack, on
 * ANY button, at ANY supported width. A healthy button measures 44/40. The
 * shipped bug measured 57/40.
 *
 * THE SECOND THING THIS FILE GUARDS, added 2026-08-16: THE TRAY'S SIZE. The two
 * checks that used to carry that job, CLIP and AFFORDANCE, could not fail. Both
 * were shaped `X === 0 || (tray.scrolls && tray.masked)`, and js/app.js
 * markScroll() sets `.scrolls` from `scrollHeight - clientHeight > 2`, the same
 * expression on the same element that the audit then measured as `hidden`. The
 * app therefore satisfied the right branch of the OR exactly whenever the left
 * branch failed. Squashing the tray to 50px, so it hid 184px and every one of
 * its 8 buttons sat past the edge, left both of them printing PASS and the
 * suite reporting 22/22 with exit 0.
 *
 * They are REST and BUDGET now, a floor and a ceiling, both proven red:
 *   REST   at least one complete row (3) of move buttons is fully inside the
 *          tray at scrollTop 0 and answers all 9 of its own hit probes there,
 *          and anything past the edge is still announced. Main: 6, 3, 6.
 *   BUDGET hidden <= clientHeight, at least half the content on screen at once.
 *          Main: ratio 0.472, 0.746, 0.390 against a bound of 1.000.
 * Per-check derivations sit with the checks. A 60px steal from the tray, which
 * the old pair graded 22/22, takes BUDGET to 1.36 and fails all three widths.
 *
 * Usage: node tests/fight-tray-audit.mjs            (self-serves this tree)
 *        node tests/fight-tray-audit.mjs <url>
 */
import { boot, serveTree, sleep, setWidth, dismissOverlays } from './godmode.js';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SIZES = [[390, 844], [375, 667], [430, 932]];

let srv = null;
let target = process.argv[2] || process.env.URL;
if (!target) {
  srv = await serveTree(ROOT);
  target = srv.url;
  console.log(`no URL given: serving this tree at ${target} rather than grading production`);
}

const results = [];
const ok = (name, pass, detail = '') => {
  results.push({ name, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
};

const { browser, page, errors } = await boot(target);

for (const [W, H] of SIZES) {
  await setWidth(page, W, H);
  await sleep(400);
  await dismissOverlays(page);

  /* A real fight against the mage, the exact foe in Tom's screenshot, through
     the seam mage-audit.mjs already uses. Talents chosen so several moves carry
     a two-line subtitle, which is the only state that can show the defect. */
  const opened = await page.evaluate(async () => {
    const db = await import('./js/db.js');
    await db.kvSet('talents', ['callcrows', 'peckeyes', 'murder', 'bonebolt']);
    if (typeof window.__denFight !== 'function') return false;
    window.__denFight(1.4, 0, { mage: true });
    return true;
  });
  ok(`SETUP ${W}x${H}: a real fight opened through __denFight`, opened,
    opened ? '' : 'no __denFight seam, so nothing below ran');
  if (!opened) continue;
  await sleep(3000);

  /* A transient toast or the floats layer sits over the tray for a beat after a
     turn renders. Hit-testing through it measures the toast, not the button, so
     clear them first and say so, rather than reporting a reachability failure
     that is really a timing artefact. */
  await page.evaluate(() => {
    document.querySelectorAll('.toast, #floats > *, .drop-veil').forEach(n => n.remove());
  });
  await sleep(250);

  const m = await page.evaluate(() => {
    const tray = document.querySelector('#factions');
    if (!tray) return { err: 'no #factions' };
    const desc = el => el ? `${el.tagName}${el.id ? '#' + el.id : ''}` : 'null';
    const btns = [...tray.querySelectorAll('button')].map(b => {
      const r = b.getBoundingClientRect();
      const tr = tray.getBoundingClientRect();
      /* nine probes: centre plus both horizontal and both vertical thirds */
      const xs = [r.left + r.width * 0.2, r.left + r.width / 2, r.right - r.width * 0.2];
      const ys = [r.top + r.height * 0.2, r.top + r.height / 2, r.bottom - r.height * 0.2];
      /* A HIT ON THE BUTTON'S OWN <b> OR <small> IS A HIT ON THE BUTTON. The
         first version of this check demanded elementFromPoint return the BUTTON
         itself and counted its own children as failures, which reported 9/9
         unreachable on buttons a thumb reaches perfectly well. Walk up from the
         hit element and ask whether this button is an ancestor, which is what
         actually decides where the tap goes. */
      const probes = [];
      for (const x of xs) for (const y of ys) {
        if (!(y >= 0 && y <= innerHeight)) { probes.push('OFFSCREEN'); continue; }
        const hit = document.elementFromPoint(x, y);
        probes.push(hit && (hit === b || b.contains(hit)) ? 'SELF' : desc(hit));
      }
      return {
        label: (b.querySelector('b')?.textContent || b.textContent || '').trim().slice(0, 22),
        w: +r.width.toFixed(1), h: +r.height.toFixed(1),
        scrollH: b.scrollHeight, clientH: b.clientHeight,
        overflow: b.scrollHeight - b.clientHeight,
        belowTray: +Math.max(0, r.bottom - tr.bottom).toFixed(1),
        hits: probes.filter(p => p !== 'OFFSCREEN' && p !== 'SELF').length,
        answered: [...new Set(probes.filter(p => p !== 'OFFSCREEN' && p !== 'SELF'))],
      };
    });
    return {
      btns,
      trayH: +tray.clientHeight.toFixed(1),
      contentH: tray.scrollHeight,
      hidden: tray.scrollHeight - tray.clientHeight,
      scrolls: tray.classList.contains('scrolls'),
      masked: getComputedStyle(tray).maskImage !== 'none' || getComputedStyle(tray).webkitMaskImage !== 'none',
    };
  });
  ok(`SETUP ${W}x${H}: the tray rendered buttons (an empty tray proves nothing)`,
    !m.err && m.btns.length >= 4, m.err || `${m.btns?.length} buttons`);
  if (m.err || !m.btns.length) continue;

  /* 1. NO BUTTON'S OWN TEXT MAY LEAVE ITS BOX. 4px is border + padding slack. */
  const spill = m.btns.filter(b => b.overflow > 4);
  ok(`TEXT ${W}x${H}: no move button's label overflows its own box`, spill.length === 0,
    spill.length ? spill.map(b => `"${b.label}" ${b.scrollH}/${b.clientH} (+${b.overflow})`).join(', ')
      : `worst ${Math.max(...m.btns.map(b => b.overflow))}px of 4px slack`);

  /* 2. EVERY BUTTON IS REACHABLE, AFTER SCROLLING TO IT. A scrolling tray is
     what Tom asked for ("the buttons below can change as needed to fit on
     screen"), so a button below the fold is not a defect; a button that cannot
     be reached even after scrolling to it IS. The first version of this check
     probed at scrollTop 0 and failed the bottom row of a tray that is designed
     to scroll, which would have pushed me to shrink the arena he asked to keep
     static. Scroll each button into view, then probe. */
  const reach = await page.evaluate(() => {
    const tray = document.querySelector('#factions');
    const desc = el => el ? `${el.tagName}${el.id ? '#' + el.id : ''}` : 'null';
    const out = [];
    for (const b of tray.querySelectorAll('button')) {
      b.scrollIntoView({ block: 'nearest' });
      const r = b.getBoundingClientRect();
      const xs = [r.left + r.width * 0.2, r.left + r.width / 2, r.right - r.width * 0.2];
      const ys = [r.top + r.height * 0.2, r.top + r.height / 2, r.bottom - r.height * 0.2];
      const bad = [];
      for (const x of xs) for (const y of ys) {
        if (!(y >= 0 && y <= innerHeight)) { bad.push('OFFSCREEN'); continue; }
        const hit = document.elementFromPoint(x, y);
        if (!(hit && (hit === b || b.contains(hit)))) bad.push(desc(hit));
      }
      const label = (b.querySelector('b')?.textContent || b.textContent || '').trim().slice(0, 22);
      if (bad.length) out.push({ label, bad: [...new Set(bad)], n: bad.length });
    }
    tray.scrollTop = 0;
    return out;
  });
  const unreachable = reach;
  ok(`REACH ${W}x${H}: every move button answers its own hit probes`, unreachable.length === 0,
    unreachable.length ? unreachable.map(b => `"${b.label}" ${b.n}/9 -> ${b.bad.join('/')}`).join(', ') : `9 probes x ${m.btns.length}, each scrolled into view first`);

  /* 3. A WHOLE ROW OF MOVES IS USABLE WITHOUT SCROLLING, AND ANYTHING PAST THE
     EDGE IS ANNOUNCED.

     THIS REPLACES A CHECK THAT COULD NOT FAIL. The old CLIP read
     `cut.length === 0 || (m.scrolls && m.masked)`, and js/app.js markScroll()
     sets `.scrolls` from `factions.scrollHeight - factions.clientHeight > 2`,
     the SAME EXPRESSION ON THE SAME ELEMENT that puts buttons past the edge in
     the first place. So the right branch of that OR was guaranteed by the app
     whenever the left branch was false. Proven, not assumed: forcing the tray
     to 50px so all 8 buttons sat past the edge and 184px hid, the old CLIP and
     AFFORDANCE both still printed PASS.

     The announcement clause is kept, because it can still fail on its own (drop
     app.css:1373 and `masked` goes false while `scrolls` stays true), but it is
     now an AND, never an escape hatch from the floor below it.

     DIRECTION AND BOUND (anti-regression rule 11): failure is the resting tray
     holding FEWER complete controls, floor of 3, one full row of the 3-column
     grid. Measured on unmodified main at 56c5058: 6 resting at 390x844, 3 at
     375x667, 6 at 430x932. The count moves in steps of 3 because a grid row's
     buttons share a row height, so it cannot drift to 2; it goes under only
     when the tray is shorter than one button row (81.8px at 390x844 and
     375x667, 68.3px at 430x932) against 134-159px of tray today.

     AND IT PROBES AT scrollTop 0, which nothing else here does. REACH calls
     scrollIntoView first, deliberately, so it says nothing about the tray as
     the player first sees it (anti-regression rule 12). These are the `hits`
     and `answered` probes measured above, which until now were computed and
     never read. Main answers SELF on all 9 probes of all 15 resting buttons. */
  const resting = m.btns.filter(b => b.belowTray <= 1);
  const blocked = resting.filter(b => b.hits > 0);
  const cut = m.btns.filter(b => b.belowTray > 1);
  const announced = cut.length === 0 || (m.scrolls && m.masked);
  ok(`REST ${W}x${H}: a full row of moves is usable at rest, and anything past the edge is announced`,
    resting.length >= 3 && blocked.length === 0 && announced,
    [resting.length >= 3 ? null : `only ${resting.length} button(s) fully inside the tray at scrollTop 0, floor is 3`,
     blocked.length ? `blocked at rest: ${blocked.map(b => `"${b.label}" ${b.hits}/9 -> ${b.answered.join('/')}`).join(', ')}` : null,
     announced ? null : `${cut.length} past the edge unannounced, scrolls=${m.scrolls} masked=${m.masked}`,
    ].filter(Boolean).join('; ')
    || `${resting.length} resting buttons, 9/9 probes each, ${cut.length} past the edge announced (scrolls=${m.scrolls} masked=${m.masked})`);

  /* 4. THE TRAY NEVER HIDES MORE THAN IT SHOWS.

     THE MISSING CEILING. The old AFFORDANCE was `m.hidden <= 2 || (m.scrolls &&
     m.masked)`, the same tautology as above, and it was the only check in this
     file that looked at `hidden` at all. Nothing anywhere bounded that number.
     A layout change that stole 60px from the tray took hidden from 75px to
     135px and this suite still reported 22/22 with exit 0.

     THE BOUND IS NOT ZERO, because this tray is DESIGNED to scroll. Tom asked
     for a static arena and an elastic tray ("the buttons below can change as
     needed to fit on screen"), so a healthy main hides 62px to 100px and
     demanding zero would push the fix back onto the arena he asked to keep.

     DIRECTION AND BOUND: failure is `hidden` RISING relative to the tray, and
     the bound is hidden <= clientHeight, that is, at least half the tray's
     content is on screen at once. Measured on unmodified main at 56c5058:

       390x844   hides  75px of 234px content in a 159px tray   ratio 0.472
       375x667   hides 100px of 234px content in a 134px tray   ratio 0.746
       430x932   hides  62px of 221px content in a 159px tray   ratio 0.390

     so the worst supported viewport sits at 75% of the budget and main keeps
     25% headroom. In pixels the guard trips once the tray falls under half its
     content: below 117px at 390x844 and 375x667, below 110.5px at 430x932.

     WHY A RATIO AND NOT A ROUND PIXEL CEILING. Healthy `hidden` already spans
     62px to 100px and the content itself differs by viewport (234px vs 221px),
     so any single px number is either loose at 430x932 or has no room at
     375x667. Tying the ceiling to the tray's own height scales with both.

     PROVEN RED: the 60px steal above lands at ratio 1.36, 1.36 and 1.23, and
     this check goes red at all three widths. */
  ok(`BUDGET ${W}x${H}: the tray never hides more than it shows`,
    m.hidden <= m.trayH,
    `hides ${m.hidden}px against ${m.trayH}px on screen, ratio ${(m.hidden / m.trayH).toFixed(3)} of the 1.000 budget` +
    `${m.hidden > m.trayH ? `, over by ${+(m.hidden - m.trayH).toFixed(1)}px` : ''} (content ${m.contentH}px)`);

  /* 5. TAP TARGETS. */
  const small = m.btns.filter(b => b.h < 44 || b.w < 44);
  ok(`TARGET ${W}x${H}: every move button clears 44x44`, small.length === 0,
    small.length ? small.map(b => `"${b.label}" ${b.w}x${b.h}`).join(', ') : `min ${Math.min(...m.btns.map(b => b.h))}px tall`);

  console.log(`  tray ${m.trayH}px, content ${m.contentH}px, hidden ${m.hidden}px`);
  /* ONE back() PER evaluate, EACH AWAITED. Batching them in a single evaluate
     tears the execution context out from under the script mid-call ("Execution
     context was destroyed"). glutton-audit.mjs carries the same note. */
  for (let i = 0; i < 6; i++) {
    const open = await page.evaluate(() => !!document.querySelector('#sheets > div')).catch(() => false);
    if (!open) break;
    await page.evaluate(() => history.back()).catch(() => {});
    await sleep(450);
  }
  await sleep(400);
}

/* ONE KNOWN ERROR IS PINNED BY MESSAGE, everything else fails. Confirmed on
   unmodified origin/main (b5dd3af) with this identical file, so it predates the
   tray fix and belongs to the crash-risk lane, which has the reproduction. It is
   pinned rather than ignored: a NEW page error still fails this audit, and when
   that lane lands its fix this pin should be deleted rather than left to rot. */
const KNOWN = [/Cannot read properties of null \(reading 'getAttribute'\)/];
const novel = errors.filter(e => !KNOWN.some(k => k.test(e)));
ok('no NEW page errors during the run', novel.length === 0, novel.slice(0, 2).join(' | '));
if (errors.length) console.log(`  (${errors.length} known pre-existing page error(s) seen, pinned, owned by the crash-risk lane)`);

await browser.close();
srv?.close?.();

const failed = results.filter(r => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (!results.length) { console.log('EMPTY SAMPLE SET: the audit did not run'); process.exit(1); }
if (failed.length) { console.log('fight-tray FAILED'); process.exit(1); }
console.log('fight-tray clean');
