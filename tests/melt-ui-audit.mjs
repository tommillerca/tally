/* The melt confirm bar overlapping list rows. A screenshot alone would not prove
 * it: the test is whether the bar is OPAQUE and whether a tap at a row's label
 * still reaches that row. */
import { boot, sleep } from './godmode.js';
const DIR = '/private/tmp/claude-502/-Users-tommiller-Documents-Hyperframes-Editor/a40abded-9d02-469c-8111-2200136500f1/scratchpad/shots';
const { browser, page } = await boot(process.env.URL);
let bad = 0;
const check = (l, ok, d = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${l}${d ? '  ' + d : ''}`); if (!ok) bad++; };

// a long list, so the bar really does sit over rows
await page.evaluate(async () => {
  const loot = await import('./js/loot.js');
  const { GEAR_ITEMS } = await import('./js/gear.js');
  const { totalXp, levelFor } = await import('./js/game.js');
  const lvl = levelFor(await totalXp()).level;
  for (const g of GEAR_ITEMS.filter(g => (g.minLevel || 1) <= lvl).slice(0, 14)) await loot.grantGear(g.id, 'test');
});
await page.evaluate(() => { location.hash = '#/bonehead'; });
await sleep(1800);
await page.evaluate(() => document.querySelector('#chTabs .ch-tab[data-tab="crates"]').click());
await sleep(1800);
await page.evaluate(() => {
  const sum = document.querySelector('.melt-fold > summary');
  sum.scrollIntoView({ block: 'start' });
  sum.click();
});
await sleep(800);
// tick one so the bar appears
await page.evaluate(() => { const c = [...document.querySelectorAll('.melt-pick')].find(x => !x.disabled); c.click(); });
await sleep(700);

const probe = await page.evaluate(() => {
  const go = document.getElementById('meltGo');
  if (!go) return null;
  const cs = getComputedStyle(go);
  const r = go.getBoundingClientRect();
  // what is actually painted at the bar's centre, and is anything showing through?
  const atBar = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  // every row label that the bar's box overlaps: a tap there must NOT hit the bar
  const rows = [...document.querySelectorAll('.melt-row')];
  const overlapped = rows.filter(row => {
    const rr = row.getBoundingClientRect();
    return rr.bottom > r.top && rr.top < r.bottom;
  }).map(row => {
    const rr = row.getBoundingClientRect();
    const hit = document.elementFromPoint(rr.left + 90, rr.top + rr.height / 2);
    return { name: row.textContent.trim().split('\n')[0].slice(0, 24), hitIsBar: !!(hit && hit.closest('#meltGo')) };
  });
  return {
    bg: cs.backgroundColor, opaque: !/rgba\(0, 0, 0, 0\)|transparent/.test(cs.backgroundColor),
    zIndex: cs.zIndex, position: cs.position,
    atBarIsBar: !!(atBar && atBar.closest('#meltGo')),
    whatIsAtTheBar: atBar ? `${atBar.tagName}.${(atBar.className || '').toString().split(' ')[0]}#${atBar.id || ''}` : 'nothing',
    barRect: { top: Math.round(r.top), bottom: Math.round(r.bottom), h: Math.round(r.height) },
    viewportH: innerHeight,
    overlapped,
  };
});
console.log('bar:', JSON.stringify(probe));
check('the confirm bar exists', !!probe);
if (probe) {
  check('it is OPAQUE, so rows cannot bleed through', probe.opaque, probe.bg);
  check('a tap on the bar hits the bar', probe.atBarIsBar, `${probe.whatIsAtTheBar} at ${JSON.stringify(probe.barRect)}`);
  // the defect Tom photographed: the bar drawn across a gear row
  check('the bar overlaps NO gear row at all', probe.overlapped.length === 0, JSON.stringify(probe.overlapped));
  check('it is on screen when the fold opens', probe.barRect.top >= 0 && probe.barRect.bottom <= probe.viewportH, JSON.stringify(probe.barRect));
  // the important one: a row the bar covers must be reachable by scrolling, i.e.
  // the fold reserves space so the LAST row clears the bar
  const last = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('.melt-row')];
    const lastRow = rows[rows.length - 1];
    lastRow.scrollIntoView({ block: 'center' });
    const go = document.getElementById('meltGo');
    const rr = lastRow.getBoundingClientRect(), gr = go.getBoundingClientRect();
    const hit = document.elementFromPoint(rr.left + 90, rr.top + rr.height / 2);
    return { rowTop: Math.round(rr.top), barTop: Math.round(gr.top), covered: !!(hit && hit.closest('#meltGo')), label: lastRow.textContent.trim().split('\n')[0].slice(0, 26) };
  });
  console.log('last row after scrolling to it:', JSON.stringify(last));
  check('the last row is reachable, not stuck under the bar', !last.covered, JSON.stringify(last));
}
const el = await page.$('.melt-fold');
await el.screenshot({ path: `${DIR}/melt-bar.png` });
console.log('shot melt-bar');
await browser.close();
console.log(bad ? `\n${bad} FAILED` : '\nMELT BAR OK');
process.exit(bad ? 1 : 0);
