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

  /* 3. NOTHING SITS BELOW THE TRAY'S CLIP UNANNOUNCED. */
  const cut = m.btns.filter(b => b.belowTray > 1);
  ok(`CLIP ${W}x${H}: any button past the tray's edge is announced as scrollable`,
    cut.length === 0 || (m.scrolls && m.masked),
    cut.length ? `${cut.length} past the edge (${cut.map(b => b.label).join(', ')}), scrolls=${m.scrolls} masked=${m.masked}` : 'nothing past the edge');

  /* 4. IF IT SCROLLS, IT SAYS SO. */
  ok(`AFFORDANCE ${W}x${H}: a scrolling tray is visibly a scrolling tray`,
    m.hidden <= 2 || (m.scrolls && m.masked),
    `hides ${m.hidden}px, scrolls=${m.scrolls}, masked=${m.masked}`);

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
