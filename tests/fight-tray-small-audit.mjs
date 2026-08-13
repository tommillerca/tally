/* EVERY FIGHT CONTROL MUST BE TAPPABLE ON THE SMALLEST PHONE WE SUPPORT.
 *
 * Found by the 375x667 sweep, 2026-08-13. On an iPhone SE the action tray hid
 * 28px of its own contents: #factions scrollHeight 202 against clientHeight 174.
 * The Vital Tonic button's box ran to 660, past the tray's clip line, and
 * document.elementFromPoint at its centre returned DIV.sheet-body.fight-body
 * rather than the button. A potion could not be tapped at all.
 *
 * The tray does scroll, but that is not a defence: at scrollTop 0 the potions are
 * unreachable and at scrollTop 28 the attack moves are, so THERE IS NO SCROLL
 * POSITION THAT SHOWS EVERY CONTROL. This audit therefore asserts reachability
 * across the tray's whole scroll range, not at one offset.
 *
 * Cause was ours: .fight-body > .arena min-height was raised 258 -> 292 to give
 * the Live Wire room after Tom's "players barely see the boss" report. That is
 * right on a big phone and takes the tray's space on a short one.
 *
 * Anti-regression rule 6: anything positioned over content gets hit-tested, and
 * rule 4: verify where the failure can exist, which is the small viewport, not
 * the 430x932 everything else is checked at. 430 is kept here as a CONTROL so a
 * regression that breaks BOTH sizes cannot read as "well, small phones are hard".
 *
 * PROVE-RED: drop the max-height media query in app.css and REACHABLE fails on
 * the potions at 375.
 *
 * Usage: node tests/fight-tray-small-audit.mjs
 */
import { boot, seed, sleep, settle, serveTree } from './godmode.js';

const srv = await serveTree(process.cwd());
const { browser, page } = await boot(srv.url, { headless: process.env.HEADLESS_MODE || 'shell' });
const errs = []; page.on('pageerror', e => errs.push(String(e).split('\n')[0]));
const fails = [];
const ok = (n, p, d = '') => { console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${d ? '  ' + d : ''}`); if (!p) fails.push(n); };

/* Walk the tray's whole scroll range and ask, for each control, whether there is
   ANY offset at which its own centre belongs to it. A control that is reachable
   at no offset is broken; the player cannot get to it however they scroll. */
const sweepTray = () => page.evaluate(async () => {
  const tray = document.getElementById('factions');
  if (!tray) return { none: true };
  const btns = [...tray.querySelectorAll('button.fight-act')];
  if (!btns.length) return { empty: true };
  const max = Math.max(0, tray.scrollHeight - tray.clientHeight);
  const reach = new Map(btns.map(b => [b, false]));
  for (let top = 0; top <= max + 1; top += 8) {
    tray.scrollTop = Math.min(top, max);
    await new Promise(r => requestAnimationFrame(r));
    for (const b of btns) {
      if (reach.get(b)) continue;
      const r = b.getBoundingClientRect();
      const hit = document.elementFromPoint(Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2));
      if (hit && (hit === b || b.contains(hit))) reach.set(b, true);
    }
  }
  tray.scrollTop = 0;
  const label = b => (b.textContent || '').trim().split('\n')[0].slice(0, 22);
  return {
    total: btns.length,
    potions: btns.filter(b => /potion|tonic|flask/i.test((b.className||'') + ' ' + (b.textContent||''))).length,
    hidden: tray.scrollHeight - tray.clientHeight,
    unreachable: btns.filter(b => !reach.get(b)).map(label),
    /* the sharper property: is there ONE offset showing everything at once? */
    everyoneAtOnce: (() => {
      for (let top = 0; top <= max + 1; top += 8) {
        tray.scrollTop = Math.min(top, max);
        const all = btns.every(b => {
          const r = b.getBoundingClientRect();
          return r.top >= tray.getBoundingClientRect().top - 1 && r.bottom <= tray.getBoundingClientRect().bottom + 1;
        });
        if (all) { tray.scrollTop = 0; return true; }
      }
      tray.scrollTop = 0; return false;
    })(),
  };
});

const openFightWithPotions = async () => {
  await page.evaluate(async () => {
    window.__testItems = { 'vital-tonic': 2, 'fury-flask': 1 };
    await window.__denFight?.(1.0, 0, {});
  });
  await sleep(600); await settle(page); await sleep(900);
  // open the ITEMS door so the potions are actually mounted
  await page.evaluate(() => document.getElementById('itemsOpen')?.click());
  await sleep(500);
};

const run = async (w, h, tag) => {
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await seed(page, { level: 12 });
  await sleep(1200);
  await openFightWithPotions();
  const r = await sweepTray();
  if (r.none || r.empty) {
    ok(`SAMPLE ${tag} the fight tray exists and has buttons (an empty tray is a FAILURE, not a pass)`, false, JSON.stringify(r));
    return r;
  }
  ok(`SAMPLE ${tag} the tray has buttons to test`, r.total > 0, `${r.total} controls`);
  /* THE GUARD THAT STOPS THIS FILE LYING, and it is currently RED on purpose.
     The bug lives on the POTION buttons behind the ITEMS door. My first version
     of this audit mounted only the attack moves (4 controls, hidden=0px) and so
     it PASSED against the shipped broken CSS as well as the fix: a check that
     could not fail, measuring a tray that was never overloaded.
     Until the seam below actually mounts potions, this file proves nothing, and
     it must say so rather than print green. An empty sample is a failure. */
  ok(`SAMPLE ${tag} the sample includes POTIONS, which is where the bug lives`,
    r.potions > 0,
    `${r.potions} potion buttons mounted. If 0, __testItems/__denFight is not the seam a real Pit fight uses and this audit is measuring the wrong tray.`);
  ok(`REACHABLE ${tag} every fight control is tappable at some scroll offset`,
    r.unreachable.length === 0, r.unreachable.length ? `unreachable: ${r.unreachable.join(', ')}` : `all ${r.total} reachable`);
  ok(`WHOLE ${tag} one scroll offset shows the entire tray at once`,
    r.everyoneAtOnce, `hidden=${r.hidden}px`);
  return r;
};

const small = await run(375, 667, '375x667');
const big = await run(430, 932, '430x932 CONTROL');

ok('CONTROL the big phone is still clean (a break on BOTH sizes is not a small-phone problem)',
  !big.none && !big.empty && big.unreachable?.length === 0 && big.everyoneAtOnce,
  JSON.stringify({ unreachable: big.unreachable, hidden: big.hidden }));
ok('NO page errors', errs.length === 0, errs.slice(0, 2).join(' ; '));

await browser.close(); srv.close?.();
console.log(`\n${fails.length ? `FAILED: ${fails.join(', ')}` : 'fight tray reachable on the smallest phone'}`);
process.exit(fails.length ? 1 : 0);
