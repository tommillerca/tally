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
    { iid: 'w1', sp: 'C5', lineage: 0, shiny: false, hatchedAtSteps: 0 },
    { iid: 'w2', sp: 'C5', lineage: 0, shiny: false, hatchedAtSteps: 0 },
    { iid: 'w3', sp: 'C5', lineage: 1, shiny: true, hatchedAtSteps: 0 },
  ];
  /* instances live in the kv 'petInst' ARRAY (loot.js petInstances), not as inv
     rows: seeding the wrong store left the Stable with no pets, so its Paddock
     button never rendered and every check below cascaded off one missing control */
  await put('kv', [{ k: 'petInst', v: pets }]);
  return { pets: pets.length };
});
if (seeded.error) { console.log(`FAIL  ${seeded.error}`); await browser.close(); process.exit(1); }
await page.reload({ waitUntil: 'networkidle2' });
await page.waitForFunction(() => typeof window.__pdkMountCards === 'function', { timeout: 30000, polling: 100 })
  .then(() => {}).catch(() => {});
await setWidth(page, 390, 900);

/* OPEN THE REAL SCREEN FIRST. The cards mount into the scene's own DOM (#pdkScene,
   #pdkPanel), so a seam that mounts into a bare body would be testing markup in a
   vacuum. Drive the real entry point: the Stable's Paddock button. */
/* Reaching the Paddock is done TWICE (once before the bond, once after the reload),
   so it is one function: a second hand-rolled copy is how the post-reload half ended
   up never opening the screen at all, which read as a persistence failure. */
async function reachPaddock() {
  /* WAIT FOR EACH CONTROL BEFORE CLICKING IT. This clicked #stableBtn optional-chained
     with no wait, so on a slow first render the click hit nothing, silently, and then
     the run sat for 30s waiting for a sheet that was never going to open. Measured
     flaky 1-in-3 that way. Every step now waits for its own precondition, which makes
     reaching the screen deterministic instead of lucky: the clock-versus-condition
     lesson, one level up from the waits inside the screen. */
  const gone = await page.waitForFunction(() => !!document.getElementById('stableBtn'),
    { timeout: 30000, polling: 100 }).then(() => false).catch(() => true);
  if (gone) return false;
  await page.evaluate(() => document.getElementById('stableBtn').click());
  await page.waitForFunction(() => !!document.getElementById('stableToPaddock'), { timeout: 30000, polling: 100 }).catch(() => {});
  /* SETTLE BEFORE MEASURING. The Stable is a sheet and it ANIMATES IN. Reading the
     button's rect mid-animation and then mouse-clicking those coordinates meant the
     click landed where the button had been, so the Paddock never opened: measured
     flaky 2-in-4. godmode's settle() finishes the animations first, which is what it
     exists for (headless Chrome leaves sheet transforms parked, per its own note). */
  await settle(page, 250);
  const at = await page.evaluate(() => {
    const b = document.getElementById('stableToPaddock');
    if (!b) return false;
    b.scrollIntoView({ block: 'center' });
    const r = b.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  if (at) await page.mouse.click(at.x, at.y);
  await page.waitForFunction(() => !!document.getElementById('pdkScene'), { timeout: 30000, polling: 100 }).catch(() => {});
  await settle(page, 400);
  return !!at;
}

const opened = await reachPaddock();
ok('the Stable offers a way into the Paddock', !!opened, opened ? '' : 'no #stableToPaddock control');
const screen = await page.evaluate(() => ({
  scene: !!document.getElementById('pdkScene'),
  panelMounted: (document.getElementById('pdkPanel')?.children.length || 0) > 0,
  tiles: document.querySelectorAll('#pdkPanel .pdk-tile').length,
  foot: document.querySelector('#pdkPanel .pdk-seg.on')?.textContent?.trim() || null,
}));
ok('the Paddock scene opened', screen.scene, JSON.stringify(screen));
/* the panel is Lane W's and is mounted as the sheet opens, not on first tap */
ok('the collection panel mounted itself with the screen', screen.panelMounted && screen.tiles > 0,
  `${screen.tiles} tiles, footer ${screen.foot}`);

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
ok('nothing rendered lands in the paperdoll namespace', shape.cards > 0 && shape.pdClasses.length === 0,
  shape.cards ? (shape.pdClasses.join(', ') || 'no .pd- classes present') : 'NO CARDS RENDERED: an empty dom has no .pd- classes either, which is not a pass');

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
/* ASSERT THE REOPEN. The sheet does not survive a reload, the bond must. When this
   was silent, a failed reopen read as "the bond did not persist", which sent me
   hunting a persistence bug in Lane R's bondUp that did not exist. */
const reopened = await reachPaddock();
const sceneBack = reopened && await page.evaluate(() => !!document.getElementById('pdkScene'));
ok('the Paddock reopens after the reload', sceneBack,
  sceneBack ? '' : (reopened ? 'scene missing after reopen' : 'could not reach the Stable or its Paddock button again'));
const remounted = await page.evaluate(async () => window.__pdkMountCards ? await window.__pdkMountCards('C5') : null);
ok('and the cards remount from the persisted roster', !!remounted && remounted.opened,
  JSON.stringify(remounted));
await settle(page, 250);
const survived = await page.evaluate(() => ({
  hearts: document.querySelectorAll('#pdkCards .pdk-card[data-iid="w1"] .pdk-heart.on').length,
  kv: null,
}));
ok('THE ROUND TRIP: the bond is still there after a reload', afterPress > 0 && survived.hearts === afterPress,
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
ok('and a refused press at the cap fires NO burst', capped.atCap === 5 && capped.burstAtCap === 0,
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
  const wasOpen = document.querySelectorAll('#pdkCards .pdk-card').length > 0;
  const openAgain = await window.__pdkMountCards('C5');   // same species = dismiss
  return { wasOpen, stillOpen: openAgain.open, cards: document.querySelectorAll('#pdkCards .pdk-card').length };
});
ok('re-tapping the same species dismisses the slider', retap.wasOpen === true && retap.stillOpen === false && retap.cards === 0,
  JSON.stringify(retap));

ok('no page errors', errs.length === 0, errs.slice(0, 2).join(' ; '));
await browser.close();
console.log(fails.length ? `\n${fails.length} FAILED: ${fails.join(', ')}` : '\npaddock cards clean');
process.exit(fails.length ? 1 : 0);
