/* THE DRESSING ROOM'S COMMIT IS UNDER THE THUMB, NOT 1810px DOWN THE PAGE.
 *
 * QA round 23 F3. 23 commits in the app spend a currency; 21 arm the control the
 * thumb is already on (armToConfirm) and one, the cheapest of them at 6 dust, sat
 * on a bar below the look grid at document offset 1810, needing 78% of the
 * screen's scroll range at 375x667. The fix is the construction the pet breed
 * button already ships (.breed-dock + .breed-bar.sticky): the Wear it bar is a
 * direct child of `.mog-dock`, which opens at the paper doll, and is
 * `position: sticky; bottom: 0`, so it rides the bottom of the viewport from
 * scrollTop 0 and settles into place under the panel when you get there. The
 * figures and the You keep / You get / You pay lines are unchanged: only the
 * TRAVEL was the problem.
 *
 * Companion to tests/sheet-action-reachable-audit.mjs, which grades sheets. The
 * Wardrobe is a screen, its scroller is `.screen`, and the measure is the same:
 * the player's thumb (elementFromPoint at the control's centre), not a rectangle.
 *
 * ROWS, per viewport (375x667 and 390x844):
 *   REACH    at scrollTop 0 the Wear it control's rect is inside the viewport AND a
 *            tap at its centre resolves to it.
 *   FLOATING while it is reachable at scrollTop 0 the panel it belongs to is still
 *            BELOW the fold. Without this, a short enough page would pass REACH with
 *            no dock at all; this is the row that says the bar came to the thumb.
 *   SETTLED  scrolled to the bottom, the bar sits under the panel and covers none
 *            of the look tiles: every [data-look] tile centre hit-tests to itself.
 *            A sticky bar that never un-sticks would hide the tiles it commits.
 *   PARENT   the bar is a direct child of .mog-dock (static). Sticky is clamped by
 *            its containing block; inside .mog-panel it can only float while the
 *            panel is already on screen, which is the bug this replaces.
 *
 * PROVE-RED: delete the `.mog-dock > .look-bar.mog-bar` rule in app.css (or the
 * wrapper in renderCharacter): REACH goes red at both sizes with the button at
 * ~1810, FLOATING with it. Not run in the session that wrote it (the machine was
 * under a gate; STATIC ONLY), so the first run is the proof.
 *
 * Usage: node tests/wardrobe-commit-reach-audit.mjs
 */
import { boot, sleep, settle, setWidth, serveTree, seed, exitFor } from './godmode.js';

const fails = [];
const ok = (n, p, d = '') => { console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${d ? '  ' + d : ''}`); if (!p) fails.push(n); };

/* One worn hat and one collected, so the slot the Wardrobe opens on ('H') has a
   look panel with a real Wear it control. */
const WORN = 'H10-1', TRY = 'H10-3', SLOT = 'H';

const srv = await serveTree(process.cwd());
const { browser, page } = await boot(srv.url, { headless: process.env.HEADLESS_MODE || 'shell' });
await seed(page, { dust: 500, reload: false });
const granted = await page.evaluate(async ({ WORN, TRY, SLOT }) => {
  if (!navigator.webdriver) return { error: 'not webdriver' };
  const loot = await import(new URL('js/loot.js', location.href).href);
  await loot.grantCosmetic(WORN, 'wardrobe-commit-reach-audit');
  await loot.grantCosmetic(TRY, 'wardrobe-commit-reach-audit');
  await loot.equip(SLOT, WORN);
  return { ok: true };
}, { WORN, TRY, SLOT });
if (granted.error) { console.log('FAIL  SETUP ' + granted.error); process.exit(1); }
await page.reload({ waitUntil: 'networkidle2' });
await sleep(2400);

for (const [w, h] of [[375, 667], [390, 844]]) {
  await setWidth(page, w, h);
  await page.evaluate(() => { location.hash = '#/today'; }); await sleep(1200);
  await page.evaluate(() => { location.hash = '#/bonehead'; }); await sleep(2000);
  await page.evaluate(() => document.querySelector('[data-tab="wardrobe"]')?.click()); await sleep(1800);
  await page.evaluate(s => document.querySelector(`.pd-slot[data-pd="${s}"]`)?.click(), SLOT); await sleep(1800);
  await settle(page);

  const top = await page.evaluate(() => {
    const sc = document.getElementById('chBody')?.closest('.screen');
    if (sc) sc.scrollTop = 0;
    const btn = document.querySelector('.mog-go'), panel = document.querySelector('.mog-panel'), bar = document.querySelector('.mog-bar');
    if (!btn || !panel || !bar) return { missing: { btn: !!btn, panel: !!panel, bar: !!bar } };
    const r = btn.getBoundingClientRect(), p = panel.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return {
      scrollTop: sc ? sc.scrollTop : null, scrollMax: sc ? sc.scrollHeight - sc.clientHeight : null,
      inView: r.top >= 0 && r.bottom <= innerHeight && r.width > 0,
      hit: !!hit && (hit === btn || btn.contains(hit)), hitTag: hit ? `${hit.tagName.toLowerCase()}.${hit.className}` : null,
      btnTop: Math.round(r.top), btnBottom: Math.round(r.bottom), panelTop: Math.round(p.top), vh: innerHeight,
      parentIsDock: bar.parentElement?.classList.contains('mog-dock') === true,
    };
  });
  if (top.missing) { ok(`${w}x${h} SETUP the look panel, bar and Wear it control are on screen`, false, JSON.stringify(top.missing)); continue; }
  ok(`${w}x${h} REACH at scrollTop 0 the Wear it control is inside the viewport and a tap at its centre lands on it`,
    top.scrollTop === 0 && top.inView && top.hit, `button ${top.btnTop}..${top.btnBottom} of ${top.vh}, hit ${top.hitTag}, scroll range ${top.scrollMax}`);
  ok(`${w}x${h} FLOATING the bar is reachable while its own panel is still below the fold (the bar came to the thumb)`,
    top.panelTop > top.vh, `panel top ${top.panelTop}, viewport ${top.vh}`);
  ok(`${w}x${h} PARENT the bar is a direct child of .mog-dock, not of .mog-panel`, top.parentIsDock);

  const bottom = await page.evaluate(() => {
    const sc = document.getElementById('chBody')?.closest('.screen');
    if (sc) sc.scrollTop = sc.scrollHeight;
    const bar = document.querySelector('.mog-bar'), grid = document.querySelector('.look-grid');
    if (!bar || !grid) return { missing: true };
    const br = bar.getBoundingClientRect(), gr = grid.getBoundingClientRect();
    const tiles = [...document.querySelectorAll('[data-look]')].map(t => {
      const r = t.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return !!hit && (hit === t || t.contains(hit));
    });
    const btn = document.querySelector('.mog-go');
    const r = btn.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return { tiles: tiles.length, covered: tiles.filter(x => !x).length, barTop: Math.round(br.top), gridBottom: Math.round(gr.bottom),
      btnHit: !!hit && (hit === btn || btn.contains(hit)), scrollTop: sc ? Math.round(sc.scrollTop) : null };
  });
  ok(`${w}x${h} SETTLED at full scroll the bar sits under the grid and covers no look tile; Wear it still tappable`,
    !bottom.missing && bottom.tiles > 0 && bottom.covered === 0 && bottom.barTop >= bottom.gridBottom && bottom.btnHit,
    JSON.stringify(bottom));
}

await browser.close(); srv.close?.();
console.log(fails.length ? `\n${fails.length} FAILED: ${fails.join(' | ')}` : '\nthe Dressing Room commit is under the thumb at scrollTop 0');
process.exit(exitFor(fails.length));
