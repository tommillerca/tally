/* THE PADDOCK CARDS: what only a browser can answer.
 *
 * The models are unit-tested in node (unit.test.js, "paddock:" tests) because they
 * are pure. This file owns the rest, and its crown jewel is the ROUND TRIP: a bond
 * banked by pressing the real button must still be there after a reload. Rendering
 * a filled heart proves nothing about persistence, and this project has shipped a
 * derived-at-read-time value that looked right and was never stored (v222 paidLooks).
 *
 * It drives the REAL builders and the REAL handlers through window.__pdkMountCards,
 * a webdriver-only seam. Nothing here hand-calls bondUp or paints a heart itself:
 * the act is performed by the code that ships.
 *
 * Run: node tests/paddock-card-audit.mjs <baseUrl>
 */
import { boot, seed, sleep, settle, setWidth } from './godmode.js';

const fails = [];
const ok = (n, p, d = '') => { console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${d ? '  ' + d : ''}`); if (!p) fails.push(n); };
const base = process.argv[2] || process.env.URL;
if (!base) {
  console.log('FAIL  paddock-card-audit needs a base URL, and there is no safe default.');
  console.log('        Use `npm run gate`, or: node tests/paddock-card-audit.mjs http://127.0.0.1:PORT/');
  process.exit(1);
}

const { browser, page, errors: errs } = await boot(base);

/* A roster to work with. Pets are instances, so seed real instance rows the way the
   game writes them rather than inventing a shape the app would never produce. */
const seeded = await page.evaluate(async () => {
  if (!new URLSearchParams(location.search).has('demo')) return { error: 'refusing to seed: not in ?demo' };
  const db = await new Promise((res, rej) => { const r = indexedDB.open('tally-demo'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const put = (store, rows) => new Promise((res, rej) => {
    const tx = db.transaction(store, 'readwrite'); rows.forEach(r => tx.objectStore(store).put(r));
    tx.oncomplete = res; tx.onerror = () => rej(tx.error);
  });
  const pets = [
    { id: 'pet-w1', kind: 'pet', sp: 'C5', iid: 'w1', shiny: false, ts: 1 },
    { id: 'pet-w2', kind: 'pet', sp: 'C5', iid: 'w2', shiny: false, ts: 2 },
    { id: 'pet-w3', kind: 'pet', sp: 'C5', iid: 'w3', shiny: true, ts: 3 },
  ];
  await put('inv', pets);
  /* THE PRE-FIELD SAVE, on purpose: no petBonds key at all, which is every existing
     player's save. The round trip has to work on THAT, not only on a profile the
     feature already touched. */
  await new Promise((res, rej) => {
    const tx = db.transaction('kv', 'readwrite'); tx.objectStore('kv').delete('petBonds');
    tx.oncomplete = res; tx.onerror = () => rej(tx.error);
  });
  return { pets: pets.length };
});
if (seeded.error) { console.log(`FAIL  ${seeded.error}`); await browser.close(); process.exit(1); }
await page.reload({ waitUntil: 'networkidle2' });
await page.waitForFunction(() => typeof window.__pdkMountCards === 'function', { timeout: 30000, polling: 100 })
  .then(() => {}).catch(() => {});
await setWidth(page, 390, 900);

const mounted = await page.evaluate(async () => window.__pdkMountCards ? await window.__pdkMountCards('C5') : null);
ok('the seam mounts real cards for a real roster', !!mounted && mounted.opened && mounted.copies === 3,
  JSON.stringify(mounted));
await settle(page, 250);

const shape = await page.evaluate(() => {
  const cards = [...document.querySelectorAll('#pdkCards .pdk-card')];
  const dots = [...document.querySelectorAll('#pdkCards .pdk-dot')];
  return { cards: cards.length, dots: dots.length, iids: cards.map(c => c.dataset.iid),
           visible: cards.filter(c => c.getBoundingClientRect().width > 8).length,
           pdClasses: [...document.querySelectorAll('#pdkCards *')]
             .flatMap(n => [...n.classList]).filter(c => /^pd-/.test(c)) };
});
ok('one card per owned copy, all of them drawn', shape.cards === 3 && shape.visible === 3, JSON.stringify(shape));
ok('and dots match the copies', shape.dots === 3, `${shape.dots} dots`);
/* the namespace collision, checked in the RENDERED dom and not only in the builder */
ok('nothing rendered lands in the paperdoll namespace', shape.pdClasses.length === 0,
  shape.pdClasses.join(', ') || 'no .pd- classes present');

/* ---- THE ROUND TRIP ------------------------------------------------------ */
const before = await page.evaluate(() => document.querySelectorAll('#pdkCards .pdk-card[data-iid="w1"] .pdk-heart.on').length);
const clicked = await page.evaluate(() => {
  const b = document.querySelector('#pdkCards .pdk-card[data-iid="w1"] .pdk-btn-pet');
  if (!b) return false;
  b.scrollIntoView({ block: 'center' });
  const r = b.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
});
ok('the Pet button is there to press', !!clicked, clicked ? '' : 'no Pet button on the first card');
if (clicked) await page.mouse.click(clicked.x, clicked.y);
await page.waitForFunction(() => document.querySelectorAll('#pdkCards .pdk-card[data-iid="w1"] .pdk-heart.on').length > 0,
  { timeout: 8000, polling: 60 }).catch(() => {});
const afterPress = await page.evaluate(() => document.querySelectorAll('#pdkCards .pdk-card[data-iid="w1"] .pdk-heart.on').length);
ok('pressing Pet fills a heart', afterPress === before + 1, `${before} -> ${afterPress}`);

/* RELOAD. This is the assertion the whole file exists for: not that a heart was
   painted, but that the bond survived leaving the page. */
await page.reload({ waitUntil: 'networkidle2' });
await page.waitForFunction(() => typeof window.__pdkMountCards === 'function', { timeout: 30000, polling: 100 }).catch(() => {});
await setWidth(page, 390, 900);
await page.evaluate(async () => await window.__pdkMountCards('C5'));
await settle(page, 250);
const survived = await page.evaluate(() => ({
  hearts: document.querySelectorAll('#pdkCards .pdk-card[data-iid="w1"] .pdk-heart.on').length,
  kv: null,
}));
ok('THE ROUND TRIP: the bond is still there after a reload', survived.hearts === afterPress,
  `${afterPress} before the reload, ${survived.hearts} after (on a save that had no petBonds key at all)`);

/* ---- the cap, and an animation that must not lie ------------------------- */
const capped = await page.evaluate(async () => {
  const btn = () => document.querySelector('#pdkCards .pdk-card[data-iid="w2"] .pdk-btn-pet');
  const hearts = () => document.querySelectorAll('#pdkCards .pdk-card[data-iid="w2"] .pdk-heart.on').length;
  for (let i = 0; i < 7; i++) { btn()?.click(); await new Promise(r => setTimeout(r, 260)); }
  const atCap = hearts();
  const bffs = document.querySelectorAll('#pdkCards .pdk-card[data-iid="w2"] .pdk-bff').length;
  /* press once more AT the cap and watch for a burst: bondUp returns changed:false,
     so celebrating would be an animation over a write that never happened */
  btn()?.click();
  await new Promise(r => setTimeout(r, 220));
  const burstAtCap = document.querySelectorAll('#pdkCards .pdk-card[data-iid="w2"] .pdk-burst').length;
  return { atCap, bffs, burstAtCap, overfilled: hearts() };
});
ok('the bond caps at 5 however many times you press', capped.atCap === 5 && capped.overfilled === 5, JSON.stringify(capped));
ok('BEST FRIEND appears once at the cap, not once per press', capped.bffs === 1, `${capped.bffs} badges`);
ok('and a refused press at the cap fires NO burst', capped.burstAtCap === 0,
  `${capped.burstAtCap} bursts after pressing a maxed pet`);

/* the burst on a press that DID bank: visible pixels while it runs, not just a node */
const burst = await page.evaluate(async () => {
  const b = document.querySelector('#pdkCards .pdk-card[data-iid="w3"] .pdk-btn-feed');
  if (!b) return { why: 'no Feed button' };
  b.click();
  await new Promise(r => setTimeout(r, 180));
  const glyphs = [...document.querySelectorAll('#pdkCards .pdk-card[data-iid="w3"] .pdk-glyph')];
  const shown = glyphs.filter(g => {
    const r = g.getBoundingClientRect(), cs = getComputedStyle(g);
    return r.width > 2 && r.height > 2 && +cs.opacity > 0.05;
  });
  return { glyphs: glyphs.length, shown: shown.length };
});
ok('Feed fires a 3-glyph burst that is actually on screen', !burst.why && burst.glyphs === 3 && burst.shown > 0,
  burst.why || `${burst.shown} of ${burst.glyphs} glyphs visible mid-animation`);

/* ---- dots follow the real scroll, and re-tap dismisses ------------------- */
const dots = await page.evaluate(async () => {
  const rail = document.querySelector('#pdkCards .pdk-rail');
  if (!rail) return { why: 'no rail' };
  const first = [...document.querySelectorAll('#pdkCards .pdk-dot')].findIndex(d => d.classList.contains('on'));
  rail.scrollTo({ left: rail.scrollWidth, behavior: 'instant' });
  rail.dispatchEvent(new Event('scroll'));
  await new Promise(r => setTimeout(r, 160));
  const last = [...document.querySelectorAll('#pdkCards .pdk-dot')].findIndex(d => d.classList.contains('on'));
  return { first, last };
});
ok('the dots track the REAL scroll position', !dots.why && dots.first === 0 && dots.last === 2,
  dots.why || `active dot ${dots.first} -> ${dots.last}`);

const retap = await page.evaluate(async () => {
  const openAgain = await window.__pdkMountCards('C5');   // same species = dismiss
  return { stillOpen: openAgain.open, cards: document.querySelectorAll('#pdkCards .pdk-card').length };
});
ok('re-tapping the same species dismisses the slider', retap.stillOpen === false && retap.cards === 0,
  JSON.stringify(retap));

ok('no page errors', errs.length === 0, errs.slice(0, 2).join(' ; '));
await browser.close();
console.log(fails.length ? `\n${fails.length} FAILED: ${fails.join(', ')}` : '\npaddock cards clean');
process.exit(fails.length ? 1 : 0);
