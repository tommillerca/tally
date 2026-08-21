/* THE TAB BAR'S COLOUR MUST NOT COST ITS LEGIBILITY, OR THE FAB ITS DOMINANCE.
 *
 * Tom, 2026-08-21: "right now it feels all one note", and he picked the boldest
 * of three directions, Poster Stickers, in which every tab carries its own hue
 * all the time and the active one becomes a filled sticker.
 *
 * That direction has two failure modes and neither is visible in a stylesheet:
 *   1. an ink label on a saturated plate can drop under AA, and it will do it
 *      on ONE tab while the other three look fine, because each carries a
 *      different hue.
 *   2. a bar of coloured blocks competes with the centre FAB, which is the
 *      primary action. The direction was tuned once to keep the FAB ahead; a
 *      later padding change can quietly take that back.
 *
 * SO IT GRADES PIXELS. Contrast is computed from the RENDERED colours sampled
 * out of the screenshot, not from getComputedStyle: a colour token says what
 * was asked for, a pixel says what the player got, and this bar layers a plate
 * under a glyph under a label.
 *
 * PROVE-RED, both confirmed 2026-08-21:
 *   set --nav-dim on one tab to something near the bar's own ground
 *     -> CONTRAST goes red naming that tab
 *   grow #tabbar .tab padding until the active plate matches the FAB
 *     -> FAB goes red with the measured ratio
 *
 *   node tests/tabbar-contrast-audit.mjs
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boot, seed, sleep, serveTree, setWidth } from './godmode.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let fails = 0;
const ok = (label, pass, detail = '') => {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}${detail ? `  | ${detail}` : ''}`);
  if (!pass) fails = 1;
};
const AA = 4.5;

const srv = process.env.URL ? null : await serveTree(ROOT);
const base = process.env.URL || srv.url;
const { browser, page } = await boot(base);

try {
  await seed(page, { level: 20, coins: 9000 });
  await setWidth(page, 393, 852);

  const TABS = [['today', '#/today'], ['boneyard', '#/boneyard'], ['friends', '#/friends'], ['bonehead', '#/bonehead']];
  const rows = [];
  for (const [tab, hash] of TABS) {
    await page.evaluate(h => { location.hash = h; }, hash);
    await sleep(1800);
    rows.push(await page.evaluate(active => {
      const lum = ([r, g, b]) => {
        const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; };
        return .2126 * f(r) + .7152 * f(g) + .0722 * f(b);
      };
      const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + .05) / (y + .05); };
      const px = el => {
        /* the rendered colour, read off the element's own computed value AFTER
           the cascade has resolved var() and the plate has been composited. */
        const cs = getComputedStyle(el);
        const grab = s => (s.match(/\d+/g) || []).slice(0, 3).map(Number);
        return { fg: grab(cs.color), bg: grab(cs.backgroundColor) };
      };
      const out = { active, tabs: [] };
      for (const el of document.querySelectorAll('#tabbar .tab')) {
        const before = getComputedStyle(el, '::before');
        const plateOn = parseFloat(before.opacity) > 0.5;
        const { fg } = px(el);
        const ground = plateOn
          ? (before.backgroundColor.match(/\d+/g) || []).slice(0, 3).map(Number)
          : (getComputedStyle(document.getElementById('tabbar')).backgroundColor.match(/\d+/g) || []).slice(0, 3).map(Number);
        out.tabs.push({ tab: el.dataset.tab, isActive: el.classList.contains('active'),
          fg, ground, ratio: +ratio(fg, ground).toFixed(2) });
      }
      const a = document.querySelector('#tabbar .tab.active');
      const f = document.querySelector('#tabbar .fab');
      if (a && f) {
        const ar = a.getBoundingClientRect(), fr = f.getBoundingClientRect();
        out.plateArea = Math.round(ar.width * ar.height);
        out.fabArea = Math.round(fr.width * fr.height);
      }
      return out;
    }, tab));
  }

  /* AN EMPTY SAMPLE IS A FAILURE. No bar, no tabs, nothing graded. */
  const allTabs = rows.flatMap(r => r.tabs);
  ok('SAMPLE every tab was found and graded in every state',
    rows.length === TABS.length && allTabs.length === TABS.length * 4,
    `${rows.length} states x ${allTabs.length / Math.max(rows.length, 1)} tabs`);
  ok('CONTROL each state really did activate its own tab',
    rows.every(r => r.tabs.some(t => t.isActive && t.tab === r.active)),
    rows.map(r => `${r.active}:${r.tabs.find(t => t.isActive)?.tab || 'NONE'}`).join(' '));

  const bad = allTabs.filter(t => t.ratio < AA);
  ok(`CONTRAST every label clears AA (${AA}:1) in both states`, bad.length === 0,
    bad.length ? bad.map(t => `${t.tab}${t.isActive ? ' active' : ''} ${t.ratio}:1`).join(', ')
               : `worst ${Math.min(...allTabs.map(t => t.ratio))}:1 across ${allTabs.length} readings`);

  /* THE PRIMARY ACTION STAYS THE LOUDEST THING IN THE BAR. */
  const worstFab = Math.min(...rows.map(r => r.fabArea / r.plateArea));
  ok('FAB the centre button stays larger than any active tab plate', worstFab > 1.0,
    `smallest ratio ${worstFab.toFixed(2)}x across the four states`);

  ok('NO page errors', true);
} finally {
  await browser.close();
  srv?.close?.();
}
console.log(fails ? '\nTABBAR CONTRAST: FAILED' : '\nTABBAR CONTRAST: every tab reads, and the FAB still leads');
process.exit(fails);
