/* tests/gwart-guide-audit.mjs: EVERY GUIDE ANSWER IS REACHABLE, AND THE GUIDE
 * SAYS TO ASK HIM.
 *
 * WHY THIS EXISTS. The guide became three named groups on 2026-08-26 (Tom: "it
 * is super bland with no real hierarchy or anything to it"). Grouping introduced
 * a failure mode flat lists do not have: an entry added to GUIDE_ENTRIES and not
 * named in GUIDE_GROUPS renders NOWHERE. It would still exist in source, still
 * be reachable by its "What is this?" deep link, and be invisible in the guide
 * itself, which is exactly the v395 LOOKS bug one surface over: a screen with no
 * door does not look like a bug from the inside.
 *
 * WHAT IT ASSERTS, by opening the real sheet through the real control:
 *   SETUP    the sheet opened and drew entries, because every row below would
 *            pass on an empty guide
 *   COVERED  every GUIDE_ENTRIES id is rendered exactly once. Failure names the
 *            missing id, so the fix is obvious without reading this file
 *   GROUPS   the group headings are on screen and each holds at least one entry,
 *            so an empty group cannot sit there as a title with nothing under it
 *   ASK      the hero card is present and names the way back to him. This is the
 *            half of Tom's brief that is not decoration: before it, the only
 *            thing saying the wizard on Today was a button was an aria-label
 *   DEEPLINK a topic deep link still opens that entry, which is what the inline
 *            "What is this?" buttons across the app depend on
 *
 * DIRECTION OF FAILURE. Drop an id from GUIDE_GROUPS and COVERED goes red naming
 * it. Delete the hero card and ASK goes red. Both were run that way before this
 * file was committed.
 *
 * Self-serves THIS checkout when given no URL: boot() defaults to the live site,
 * so a bare run would grade production and read as coverage of the tree.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boot, serveTree, sleep } from './godmode.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argUrl = process.argv[2] || process.env.URL;
const own = argUrl ? null : await serveTree(ROOT);
const url = argUrl || own.url;
const { browser, page } = await boot(url);
let bad = 0;
const ok = (l, pass, d = '') => { console.log(`${pass ? 'ok  ' : 'FAIL'} ${l}${d ? '  ' + d : ''}`); if (!pass) bad++; };
const done = async c => { await browser.close(); if (own) own.close(); process.exit(c); };

await page.evaluate(() => { location.hash = '#/today'; });
await page.waitForFunction(() => !!document.getElementById('gwartBtn'), { timeout: 20000, polling: 100 });
await page.evaluate(() => document.getElementById('gwartBtn').click());
await page.waitForFunction(() => !!document.querySelector('.sheet-body .gd-e'), { timeout: 20000, polling: 80 });
await sleep(500);

const seen = await page.evaluate(() => ({
  ids: [...document.querySelectorAll('.sheet-body .gd-e')].map(e => e.dataset.gd),
  groups: [...document.querySelectorAll('.sheet-body .gd-grp')].map(g => ({
    title: (g.querySelector('h4') || {}).textContent || '',
    n: g.querySelectorAll('.gd-e').length,
  })),
  hero: (() => {
    const h = document.querySelector('.sheet-body .gd-hero');
    if (!h) return null;
    const img = h.querySelector('img');
    return { text: h.textContent.replace(/\s+/g, ' ').trim(), img: !!img && img.naturalWidth > 0 };
  })(),
}));

ok('SETUP    the guide sheet opened through the real control and drew entries', seen.ids.length > 0, `${seen.ids.length} entries`);
if (bad) { console.log('\nFAIL (setup): nothing below would grade against a real guide.'); await done(2); }

const declared = await page.evaluate(async () => {
  const m = await import('./js/app.js').catch(() => null);
  return m && m.GUIDE_ENTRIES ? m.GUIDE_ENTRIES.map(e => e.id) : null;
});
const src = (await (await fetch(url + '/js/app.js')).text());
const ids = declared || [...src.matchAll(/\{ id: '([a-z]+)', title: '/g)].map(m => m[1]);
const missing = ids.filter(id => !seen.ids.includes(id));
const dupes = seen.ids.filter((v, i) => seen.ids.indexOf(v) !== i);
/* COVERED grades the BOOKKEEPING, not merely the rendering, and the difference
   is the whole value of the row. openGwartGuide falls back to a "More" bucket for
   any entry no group names, which is right for players (nobody loses an answer to
   a slip) and fatal for a check: with that fallback in place "is it rendered" is
   TRUE BY CONSTRUCTION and can never go red. Measured, dropping transmute from
   every group left this row green at 10 declared / 10 rendered. So the assertion
   is that the fallback DID NOT HAVE TO FIRE. */
const orphanGroup = seen.groups.find(g => /^more$/i.test(g.title.trim()));
ok('COVERED  every declared entry is rendered once AND is named in a real group, so the orphan fallback never had to catch one',
  ids.length > 0 && missing.length === 0 && dupes.length === 0 && !orphanGroup,
  `${ids.length} declared, ${seen.ids.length} rendered`
  + `${missing.length ? `, MISSING: ${missing.join(', ')}` : ''}`
  + `${dupes.length ? `, DUPLICATED: ${dupes.join(', ')}` : ''}`
  + `${orphanGroup ? `, ${orphanGroup.n} entry(s) fell into "More": add them to GUIDE_GROUPS` : ''}`);

ok('GROUPS   the guide is grouped and no group is an empty heading',
  seen.groups.length >= 2 && seen.groups.every(g => g.n > 0),
  seen.groups.map(g => `${g.title}:${g.n}`).join(' '));

ok('ASK      the hero card is there, draws him, and names the way back to him',
  !!seen.hero && seen.hero.img && /tap me on today/i.test(seen.hero.text),
  seen.hero ? `img decoded ${seen.hero.img}, "${seen.hero.text.slice(0, 72)}"` : 'no .gd-hero at all');

/* DEEPLINK is driven from a surface that actually CARRIES one of these links.
   Today does not. MEASURED across six routes: only #/bonehead carries one on
   load (transmog, on the look panel); the Kitchen and Transmute links sit behind
   sub-screens. Clicking a selector that is not on screen is how the first two
   versions of this row failed against healthy code, which is worth leaving
   written down rather than rediscovering. */
await page.evaluate(() => { document.querySelector('.sheet-close')?.click(); });
await sleep(400);
await page.evaluate(() => { location.hash = '#/bonehead'; });
await sleep(1600);
const link = await page.evaluate(() => {
  const b = document.querySelector('[data-guide]');
  if (!b) return null;
  const topic = b.dataset.guide;
  b.click();
  return topic;
});
await sleep(1000);
const deep = link === null ? null : await page.evaluate(t => {
  const e = document.querySelector(`.sheet-body .gd-e[data-gd="${t}"]`);
  return e ? e.hasAttribute('open') : false;
}, link);
ok('DEEPLINK a real "What is this?" control still opens its own entry inside a group',
  deep === true,
  link === null ? 'SETUP GAP: no [data-guide] control was on screen to click' : `clicked data-guide="${link}", open=${deep}`);

console.log(`\ngwart-guide: ${bad ? bad + ' FAILED' : 'clean'}`);
await done(bad ? 1 : 0);
