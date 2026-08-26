/* tests/hero-edge-audit.mjs: THE WALLPAPER RUNS OFF THE TOP, FOR EVERY BACKDROP.
 *
 * WHY THIS FILE EXISTS, and it is a story about the guard and not the feature.
 * Tom reported a black band above his Bonehead on v453 and again on v454. The
 * overscroll audit was 53 rows green through both. It could not have caught
 * either: every one of its rows ran on the seeded default save, which has ONE
 * backdrop equipped, so the entire feature was only ever tested in a single
 * configuration. "Nothing equipped" was invisible to it until it was added by
 * hand, and even then only that one extra state was covered.
 *
 * So this file's premise is coverage, not a single assertion: drive EVERY
 * backdrop in the catalogue plus the empty slot, and grade the strip each one
 * produces. A guard that samples one fixture is how five releases went out.
 *
 * WHAT THE FEATURE IS NOW. iOS paints exactly one thing in the rubber-band
 * region: the scroller's own background-color. Measured on device across v434,
 * v435 and v436, a rectangle parked above the scroll origin paints NOTHING
 * there, so .screen--today's background-color is the whole mechanism and
 * --hero-edge is the colour it carries.
 *
 * WHY THE COLOUR IS A TABLE. It used to be sampled at runtime through a 1x1
 * canvas. That works in every browser here and failed twice on Tom's phone, and
 * all five of its failure modes are silent and end in the same place: unset
 * variable, fall back to var(--bg), black band. data/hero-edge.js is computed
 * from the art instead, so the value exists before the app runs.
 *
 * ROWS
 *   SETUP    the catalogue has backdrops and Today rendered, so nothing below
 *            can pass by grading an empty sweep
 *   TABLE    every backdrop has an entry, and each entry equals its PNG's
 *            top-centre pixel through saturate(0.92), RECOMPUTED here off the
 *            real file. The generator uses a colour matrix in python and this
 *            row uses the browser's own canvas filter, so agreement means the
 *            two independent methods match rather than one method agreeing
 *            with itself. Art and table cannot part company silently.
 *   SWEEP    equip EVERY backdrop in turn and assert the scroller's resolved
 *            background-color IS that backdrop's colour. This is the row that
 *            would have caught a sampler failing for one particular image.
 *   VARIED   the sweep produced more than one distinct colour, so SWEEP cannot
 *            be passing on a build that hands everybody one constant
 *   NOBG     with the slot EMPTY the strip is the scene's own colour and NOT
 *            the page background. This is Tom's exact bug, and the BG slot has
 *            no default, so it is a state real players are in.
 *   GONE     no overscroll wordmark remains: no element paints in that strip
 *            and nothing writes --wm-pull or --wm-fade. Tom, 2026-08-26:
 *            "no seam, no wordmark."
 *
 * Self-serves THIS checkout when given no URL: boot() defaults to the live site,
 * so a bare run would grade production and read as coverage of the tree.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { boot, serveTree, sleep } from './godmode.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argUrl = process.argv[2] || process.env.URL;
const own = argUrl ? null : await serveTree(ROOT);
const url = argUrl || own.url;
const { browser, page } = await boot(url);
let bad = 0;
const ok = (l, pass, d = '') => { console.log(`${pass ? 'ok  ' : 'FAIL'} ${l}${d ? '  ' + d : ''}`); if (!pass) bad++; };
const done = async c => { await browser.close(); if (own) own.close(); process.exit(c); };
/* rgb() comes back two ways: the table writes 'rgb(62 62 155)' (space form,
   what CSS Color 4 serialises) and getComputedStyle returns 'rgb(62, 62, 155)'.
   Pull the numbers out rather than string-munging: the first version stripped
   whitespace BEFORE splitting on commas and turned the space form into the
   single token 6262155, which failed all 22 rows on a build that was correct. */
const norm = s => ((s || '').match(/-?\d+(\.\d+)?/g) || []).join(' ');

await page.setViewport({ width: 402, height: 874, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await page.evaluate(() => { location.hash = '#/today'; });
await page.waitForFunction(() => !!document.getElementById('bhStage'), { timeout: 20000, polling: 100 });
await sleep(1200);

const cat = await page.evaluate(async () => {
  const m = await import('./data/boneheadz.js');
  const e = await import('./data/hero-edge.js');
  const list = (m.BH_ITEMS_WITH_UNRELEASED || m.BH_ITEMS).filter(i => i.slot === 'BG');
  return { ids: list.map(i => i.id), srcs: list.map(i => m.bhAsset(i)), table: e.HERO_EDGE,
           bgHasDefault: !!(m.BH_SLOTS.find(s => s.code === 'BG') || {}).default };
});
ok('SETUP    the catalogue has backdrops and Today rendered, so the sweep below grades something',
  cat.ids.length > 0 && Object.keys(cat.table).length > 0, `${cat.ids.length} backdrops, ${Object.keys(cat.table).length} table rows`);
if (bad) { console.log('\nFAIL (setup): nothing below would grade against a real catalogue.'); await done(2); }

/* TABLE, recomputed off the real PNG through the BROWSER's own canvas filter. */
const drift = await page.evaluate(async ({ ids, srcs, table }) => {
  const out = [];
  for (let i = 0; i < ids.length; i++) {
    const img = new Image();
    img.src = srcs[i];
    await img.decode().catch(() => {});
    if (!img.naturalWidth) { out.push({ id: ids[i], why: 'art did not decode' }); continue; }
    const c = document.createElement('canvas'); c.width = c.height = 1;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.filter = 'saturate(0.92)';
    g.drawImage(img, Math.floor(img.naturalWidth / 2), 0, 1, 1, 0, 0, 1, 1);
    const [r, gg, b] = g.getImageData(0, 0, 1, 1).data;
    const want = `rgb(${r} ${gg} ${b})`;
    if (!table[ids[i]]) out.push({ id: ids[i], why: 'no table entry' });
    else if (table[ids[i]] !== want) out.push({ id: ids[i], why: `table ${table[ids[i]]} but art is ${want}` });
  }
  return out;
}, cat);
ok('TABLE    every backdrop has an entry and it matches the art, recomputed here through the browser canvas rather than the generator that wrote it',
  drift.length === 0,
  drift.length ? `${drift.length} adrift: ${drift.slice(0, 4).map(d => d.id + ' ' + d.why).join('; ')}` : `${cat.ids.length} backdrops, 0 adrift`);

/* SWEEP: equip each one for real and read the strip back. */
const seen = [];
for (const id of cat.ids) {
  const got = await page.evaluate(async bg => {
    const db = await import('./js/db.js');
    const eq = (await db.kvGet('equipped', {})) || {};
    eq.BG = bg; await db.kvSet('equipped', eq);
    location.hash = '#/foods'; await new Promise(r => setTimeout(r, 260));
    location.hash = '#/today'; await new Promise(r => setTimeout(r, 900));
    const el = document.getElementById('screen');
    return { bg: getComputedStyle(el).backgroundColor, isToday: el.classList.contains('screen--today') };
  }, id);
  seen.push({ id, got: norm(got.bg), want: norm(cat.table[id]), isToday: got.isToday });
}
const wrong = seen.filter(s => !s.isToday || s.got !== s.want);
ok('SWEEP    EVERY backdrop in the catalogue puts its OWN colour on the scroller, which is the strip a bounce reveals',
  wrong.length === 0,
  wrong.length ? `${wrong.length} of ${seen.length} wrong: ${wrong.slice(0, 3).map(w => `${w.id} got ${w.got} want ${w.want}`).join('; ')}`
               : `${seen.length} backdrops, all matching`);
const distinct = new Set(seen.map(s => s.got));
ok('VARIED   the sweep produced more than one colour, so the row above cannot be passing on a build that hands everybody one constant',
  distinct.size > 3, `${distinct.size} distinct strip colours across ${seen.length} backdrops`);

/* NOBG: the state Tom was actually in. */
const pageBg = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--bg').trim());
const hex = pageBg.replace('#', '');
const bgRgb = `${parseInt(hex.slice(0, 2), 16)} ${parseInt(hex.slice(2, 4), 16)} ${parseInt(hex.slice(4, 6), 16)}`;
const nobg = await page.evaluate(async () => {
  const db = await import('./js/db.js');
  const eq = (await db.kvGet('equipped', {})) || {};
  delete eq.BG; await db.kvSet('equipped', eq);
  document.documentElement.style.removeProperty('--hero-edge');
  location.hash = '#/foods'; await new Promise(r => setTimeout(r, 300));
  location.hash = '#/today'; await new Promise(r => setTimeout(r, 1200));
  const el = document.getElementById('screen');
  return { strip: getComputedStyle(el).backgroundColor,
           scene: getComputedStyle(document.getElementById('bhStage')).backgroundColor,
           hasImg: !!document.querySelector('#bhStage .hero-backdrop') };
});
ok(`NOBG     with the slot EMPTY the strip is the scene's own colour and NOT the page background. The BG slot has no default${cat.bgHasDefault ? ' (IT NOW HAS ONE, so this row is grading a state players cannot reach)' : ''}, so this is a state real players are in`,
  !nobg.hasImg && norm(nobg.strip) === norm(nobg.scene) && norm(nobg.strip) !== bgRgb && !cat.bgHasDefault,
  `strip ${norm(nobg.strip)}, scene ${norm(nobg.scene)}, page --bg ${bgRgb}. This shipped as 110px of the page background sitting on top of the art.`);

/* GONE: the wordmark is out, not merely invisible. */
const gone = await page.evaluate(() => {
  const cs = getComputedStyle(document.getElementById('app'), '::before');
  const root = document.documentElement.style;
  return { content: cs.content, bgImage: cs.backgroundImage, w: cs.width, h: cs.height,
           pull: root.getPropertyValue('--wm-pull'), fade: root.getPropertyValue('--wm-fade') };
});
const src = readFileSync(path.join(ROOT, 'js/app.js'), 'utf8');
ok('GONE     the overscroll wordmark is removed, not hidden: nothing paints in that strip and no code writes its variables. Tom: "no seam, no wordmark"',
  !/wordmark\.png/.test(gone.bgImage || '') && !gone.pull && !gone.fade
    && !/setProperty\('--wm-(pull|fade)'/.test(src) && !/function bindWordmarkPull/.test(src),
  `#app::before background-image ${gone.bgImage}, --wm-pull "${gone.pull}", --wm-fade "${gone.fade}", listener in source: ${/function bindWordmarkPull/.test(src)}`);

console.log(`\nhero-edge: ${bad ? bad + ' FAILED' : 'clean'}`);
await done(bad ? 1 : 0);
