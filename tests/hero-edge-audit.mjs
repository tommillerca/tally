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

/* SEAM: the boundary the last five attempts kept missing.
   Every earlier fix graded the fill's COLOUR and the strip stayed wrong, because
   the defect was TEXTURE. .hero-scene::after painted grain over the hero at
   opacity .07, masked transparent for 28px so the top edge met the flat fill
   flat-on-flat; that comment claimed it "removes the boundary entirely" and it
   only moved it 28px down and turned a step into a ramp. Tom, having raised it
   before and been talked past: "im 99% sure it's because youve added a grainy
   noise layer on top of the whole bonehead section" and "to me it looks like the
   grain is not fading out it covers the entire block."

   The strip a bounce reveals is a background-COLOR and can never carry texture
   (v435: an opaque background-image there stopped the compositor promoting the
   layer and the page went flat black), so a grained hero cannot be reconciled
   with it by any colour however well computed.

   This grades PIXELS across the boundary rather than a stylesheet property, so
   it fails on any future layer that reintroduces a difference, not just on the
   one that did it this time. It requires BOTH means and BOTH texture readings to
   match: a colour-only check is what let the grain through.
   MEASURED before the fix: fill 111.45 flat, art 111.92 rising to 112.27 and a
   texture delta of +0.47 sd. After: identical on both, 0.00 and 0.00. */
{
  await page.evaluate(async () => {
    const db = await import('./js/db.js');
    const eq = (await db.kvGet('equipped', {})) || {};
    eq.BG = 'BG2-1'; await db.kvSet('equipped', eq);
    location.hash = '#/foods'; await new Promise(r => setTimeout(r, 300));
    location.hash = '#/today'; await new Promise(r => setTimeout(r, 1400));
  });
  const tag = await page.addStyleTag({ content: '.screen--today > * { transform: translateY(90px); }' });
  await sleep(500);
  const shot = await page.screenshot({ clip: { x: 0, y: 0, width: 402, height: 200 } });
  await page.evaluate(el => el.remove(), tag);
  const stats = await page.evaluate(async b64 => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + b64;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0);
    const dpr = img.naturalWidth / 402;
    const row = ycss => {
      const y = Math.round(ycss * dpr);
      const d = g.getImageData(Math.round(40 * dpr), y, Math.round(322 * dpr), 1).data;
      const l = [];
      for (let i = 0; i < d.length; i += 4) l.push(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
      const m = l.reduce((a, x) => a + x, 0) / l.length;
      const sd = Math.sqrt(l.reduce((a, x) => a + (x - m) * (x - m), 0) / l.length);
      return { m, sd };
    };
    return { fill: row(86), art: row(96), deep: row(60) };
  }, shot.toString('base64'));
  const dMean = Math.abs(stats.art.m - stats.fill.m);
  const dSd = Math.abs(stats.art.sd - stats.fill.sd);
  /* CONTROL: the sampler must be reading a real surface, not a blank capture. */
  ok('SEAM     CONTROL: the strip really carries the backdrop colour, so the row below is not comparing two empty rows',
    stats.fill.m > 20 && stats.fill.m < 240 && Math.abs(stats.deep.m - stats.fill.m) < 0.5,
    `fill luma ${stats.fill.m.toFixed(2)}, and 26px higher in the same strip ${stats.deep.m.toFixed(2)}`);
  ok('SEAM     the fill and the art meet with NO step in colour AND none in texture. Five fixes graded colour alone and the defect was a grain layer over the hero; a flat strip cannot be reconciled with a textured one by any colour',
    dMean <= 0.05 && dSd <= 0.05,
    `fill ${stats.fill.m.toFixed(2)} sd ${stats.fill.sd.toFixed(2)} | art ${stats.art.m.toFixed(2)} sd ${stats.art.sd.toFixed(2)} | step ${dMean.toFixed(2)} luma, ${dSd.toFixed(2)} sd (before the grain came off: 0.47 and 0.47)`);
}

console.log(`\nhero-edge: ${bad ? bad + ' FAILED' : 'clean'}`);
await done(bad ? 1 : 0);
