/* THE CREW FAN acceptance audit (v323). Ported from the approved mockup's
 * verify-crew-fan.mjs (market-quality-mockups/): every check operates a REAL
 * control on the real screen and exits non-zero on failure.
 *
 * The fan needs friends, and the demo account has none (an empty sample is a
 * failure, not a pass), so this seeds the webdriver-gated __testMe/__testFriends
 * fixtures in renderFriends: same pattern as __openFriendProfile.
 *
 *   node tests/crew-fan-audit.mjs            (self-serves this checkout on :8177)
 *   URL=https://... node tests/crew-fan-audit.mjs
 */
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { boot, sleep } from './godmode.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let fails = 0;
const ok = (label, pass, detail = '') => {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}${detail ? `  | ${detail}` : ''}`);
  if (!pass) fails = 1;
};

let srv = null;
let base = process.env.URL;
if (!base) {
  srv = spawn('python3', ['-m', 'http.server', '8177', '--bind', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
  await sleep(900);
  base = 'http://127.0.0.1:8177/';
}

const FRIENDS = [
  ['DUSTY LULU', 12, { B: 'B0-2', SK: 'SK0-2', T: 'T3' }, 'BG1', null],
  ['MARROW MAX', 19, { B: 'B10', SK: 'SK10', T: 'T2', H: 'H4', IR: 'IR2' }, 'BG3-1', { id: 'C3', level: 4, shiny: false }],
  ['BONE JOVI', 31, { B: 'B11-1', SK: 'SK11-1', T: 'T10-3', H: 'H12-1', IR: 'IR7-2' }, 'BG4-1', { id: 'C1', level: 7, shiny: false }],
  ['GRAVE MINT', 42, { B: 'B0-4', SK: 'SK0-4', T: 'T9-7', H: 'H13-4', IR: 'IR8-2' }, 'BG5-3', { id: 'C2', level: 9, shiny: true }],
  ['SWOLE PHANTOM', 28, { B: 'B1', SK: 'SK1', T: 'T4-1', H: 'H2-1', IR: 'IR5-1' }, 'BG2-1', { id: 'C5', level: 3, shiny: false }],
  ['RIB TICKLER', 22, { B: 'B12', SK: 'SK12', T: 'T5-1', H: 'H7-1', IR: 'IR3-1' }, 'BG2-2', null],
  ['GRIM WICH', 15, { B: 'B13', SK: 'SK13', T: 'T6-1', H: 'H9' }, 'BG10', { id: 'C4', level: 2, shiny: false }],
].map(([name, level, outfit, bg, pet], i) => ({
  playerId: `fan-fixture-${i}`, name, alias: null, lastSeen: Date.now() - (i % 2 ? 86400000 : 0),
  profile: { level, levelName: 'Bonehead', badges: i + 1, gearCount: 3 * i, outfit: { ...outfit, BG: bg }, pet },
}));

const { browser, page } = await boot(base);
await page.setViewport({ width: 393, height: 852, deviceScaleFactor: 2, isMobile: true, hasTouch: true });

const seedCrew = async friends => {
  await page.evaluate(fx => {
    window.__testMe = { name: 'Fan Audit', handle: 'fan', friendCode: 'BONE-0000' };
    window.__testFriends = { friends: fx, incoming: [], outgoing: [] };
    location.hash = '#/today'; // bounce so re-entering #/crew re-renders
  }, friends);
  await sleep(400);
  await page.evaluate(() => { location.hash = '#/friends'; });
  await sleep(2000);
};
await seedCrew(FRIENDS);

const name = () => page.$eval('#cfanSel .cfan-sel-nm', el => el.textContent.trim().split('\n')[0]);
const deckX = () => page.$eval('#cfanDeck', el => new DOMMatrixReadOnly(getComputedStyle(el).transform).m41);

/* -------- render + decode: an empty or blank fan is a FAILURE ------------- */
const art = await page.evaluate(() => {
  const cards = [...document.querySelectorAll('.cfan-card')];
  const imgs = cards.flatMap(c => [...c.querySelectorAll('img')]);
  return { cards: cards.length, imgs: imgs.length, blank: imgs.filter(i => !i.naturalWidth).length,
    feat: !!document.querySelector('.cfan-card.feat'), dots: document.querySelectorAll('.cfan-dots i').length };
});
ok('fan renders one card per friend', art.cards === 7, `${art.cards} cards`);
ok('every layer on every card is decoded (empty sample = failure)', art.imgs > 20 && art.blank === 0, `${art.imgs} imgs, ${art.blank} blank`);
ok('a featured card and one dot per friend', art.feat && art.dots === 7, `feat=${art.feat} dots=${art.dots}`);

/* -------- arrows walk the deck -------------------------------------------- */
const a0 = await name();
await page.$eval('#cfanNext', el => el.click());
await sleep(150);
ok('next arrow advances the fan', (await name()) !== a0, `${a0} -> ${await name()}`);
await page.$eval('#cfanPrev', el => el.click());
await sleep(150);
ok('prev arrow walks back', (await name()) === a0);

/* -------- two ways to advance: TAP ---------------------------------------- */
const sideId = await page.evaluate(() => {
  const feat = document.querySelector('.cfan-card.feat');
  const side = [...document.querySelectorAll('.cfan-card')].find(c => c !== feat);
  side.click(); return side.dataset.fan;
});
await sleep(150);
const centered = await page.evaluate(() => document.querySelector('.cfan-card.feat')?.dataset.fan);
ok('tap a side card: it takes the centre', centered === sideId, `${sideId} vs ${centered}`);
const beforeProfile = await name();
await page.evaluate(() => document.querySelector('.cfan-card.feat').click());
await sleep(900);
const sheetName = await page.evaluate(() => document.querySelector('.sheet')?.textContent.slice(0, 400) || '');
ok('tap the centre card: their profile opens', sheetName.includes(beforeProfile.split(' ')[0]), beforeProfile);
await page.evaluate(() => { if (document.querySelector('.sheet')) history.back(); });
await sleep(800);

/* -------- two ways to advance: DRAG ---------------------------------------- */
const wrapBox = await page.$eval('#cfanWrap', el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
const midY = wrapBox.y + wrapBox.h / 2;
const dragFrom = await name();
await page.mouse.move(wrapBox.x + wrapBox.w * 0.7, midY);
await page.mouse.down();
let midDeckX = 0;
for (const f of [0.6, 0.5, 0.42, 0.35]) {
  await page.mouse.move(wrapBox.x + wrapBox.w * f, midY, { steps: 3 });
  if (f === 0.5) midDeckX = await deckX();
}
await page.mouse.up();
await sleep(80);
const dragTo = await name();
await sleep(500);
ok('drag: the deck follows the finger mid-gesture', Math.abs(midDeckX) > 5, `x=${midDeckX}`);
ok('drag: release advances to the next friend', dragTo !== dragFrom, `${dragFrom} -> ${dragTo}`);
ok('drag: the deck settles exactly home', Math.abs(await deckX()) < 0.5, `x=${await deckX()}`);
const gearDrag = await page.evaluate(() => {
  const img = document.querySelector('.cfan-card img');
  const ev = new Event('dragstart', { bubbles: true, cancelable: true });
  img.dispatchEvent(ev);
  return { prevented: ev.defaultPrevented, hits: getComputedStyle(img).pointerEvents };
});
ok('gear layers cannot be lifted off a Bonehead by a drag', gearDrag.prevented && gearDrag.hits === 'none', JSON.stringify(gearDrag));
const tapAfterDrag = await page.evaluate(() => {
  const feat = document.querySelector('.cfan-card.feat');
  const side = [...document.querySelectorAll('.cfan-card')].find(c => c !== feat);
  side.click(); return side.dataset.fan;
});
await sleep(150);
ok('a tap right after a drag still lands (the suppressor is one-shot)',
  (await page.evaluate(() => document.querySelector('.cfan-card.feat')?.dataset.fan)) === tapAfterDrag);

/* -------- star = sort, and the re-sort GLIDES ------------------------------ */
const starred = await page.evaluate(async () => {
  const featId = document.querySelector('.cfan-card.feat').dataset.fan;
  const other = [...document.querySelectorAll('.cfan-card')].find(c => c.dataset.fan !== featId);
  const t0 = getComputedStyle(other).transform;
  document.querySelector('#cfanStar').click();
  const samples = [t0];
  for (const ms of [120, 140, 340]) { await new Promise(r => setTimeout(r, ms)); samples.push(getComputedStyle(other).transform); }
  return { featId, distinct: new Set(samples).size,
    firstInDeck: [...document.querySelectorAll('.cfan-card')].map(c => c.dataset.fan),
    star: !document.querySelector('.cfan-card.feat .cfan-fstar').hidden,
    chips: [...document.querySelectorAll('.cfan-fv')].map(b => b.title) };
});
ok('star: the card gets its gold star', starred.star);
ok('star: a FAVES chip appears', starred.chips.length === 1, starred.chips.join(','));
ok('star: the deck re-sort GLIDES (>=3 distinct transforms; 2 = it snapped)', starred.distinct >= 3, `${starred.distinct} distinct`);
const favKv = await page.evaluate(async () => {
  const { kvGet } = await import('./js/db.js');
  return await kvGet('crewFaves', []);
});
ok('star: persists to kv (survives a reload)', Array.isArray(favKv) && favKv.includes(starred.featId), JSON.stringify(favKv));
const sorted = await page.evaluate(() => {
  const dots = [...document.querySelectorAll('.cfan-dots i')];
  return { activeDot: dots.findIndex(d => d.classList.contains('on')) };
});
ok('star: starred friend now leads the deck order (dot 0 active)', sorted.activeDot === 0, `dot ${sorted.activeDot}`);

/* -------- faves chip jumps, strip actions open their sheets ---------------- */
await page.$eval('#cfanNext', el => el.click());
await sleep(150);
await page.$eval('.cfan-fv', el => el.click());
await sleep(150);
ok('faves chip jumps the fan back to the starred friend',
  (await page.evaluate(() => document.querySelector('.cfan-card.feat')?.dataset.fan)) === starred.featId);
await page.$eval('#cfanCheer', el => el.click());
await sleep(800);
ok('CHEER opens the cheer sheet', await page.evaluate(() => /send a cheer/i.test(document.querySelector('.sheet')?.textContent || '')));
await page.evaluate(() => history.back());
await sleep(800);
await page.$eval('#cfanGift', el => el.click());
await sleep(800);
ok('GIFT opens the gift sheet', await page.evaluate(() => /send a gift/i.test(document.querySelector('.sheet')?.textContent || '')));
await page.evaluate(() => history.back());
await sleep(800);

/* -------- small crews and the empty state ---------------------------------- */
await seedCrew(FRIENDS.slice(0, 3));
const small = await page.evaluate(() => {
  const cards = [...document.querySelectorAll('.cfan-card')];
  return { n: cards.length, feat: !!document.querySelector('.cfan-card.feat'),
    spread: new Set(cards.map(c => c.style.transform)).size };
});
ok('a 3-friend crew still fans (small-crew math)', small.n === 3 && small.feat && small.spread === 3, JSON.stringify(small));
await seedCrew([]);
const empty = await page.evaluate(() => ({
  emptyShown: !document.querySelector('#cfanEmpty').hidden,
  deckHidden: document.querySelector('#cfanWrap').hidden,
  addField: !!document.querySelector('#friendCode'),
}));
ok('an empty crew shows the empty state, not a blank fan', empty.emptyShown && empty.deckHidden && empty.addField, JSON.stringify(empty));


/* ---- ONLINE BIAS + SEARCH (added 2026-08-08) ------------------------------
   Tom asked for both: "it should bias players that are currently online or filter
   for it like the favourite feature" and "you should be able to search for your
   friends name in the crew tab or by nickname".
   What these guard is the distinction between a BIAS and a FILTER. Sorting
   online-first keeps everyone reachable; filtering would open the tab on an empty
   fan whenever nobody happened to be around, which is the worst greeting the
   screen can give.
   Named, not indexed: an earlier version hard-coded fixture positions and failed
   while the feature was working correctly, which is the worst kind of guard.
   PROVE-RED: drop the online tier from fanRank and ONLINE fails; make fanMatches
   test only f.name and NICKNAME fails. */
const ONLINE_NAME = 'RIB TICKLER', NICK_NAME = 'GRIM WICH', NICK = 'Rocket';

// the star test above left a favourite in kv and in memory, and starred correctly
// outranks online, so clear it or this measures the wrong tier
await page.evaluate(async () => { const db = await import('/js/db.js?cf=1'); await db.kvSet('crewFaves', []); });
await page.evaluate(() => { location.hash = '#/today'; });
await sleep(400);
await seedCrew(FRIENDS.map(f => ({
  ...f,
  alias: f.name === NICK_NAME ? NICK : null,
  lastSeen: f.name === ONLINE_NAME ? Date.now() : Date.now() - 86400000,
})));
await sleep(900);

/* Assert the TIER, not the top card. A star may still be set from the star test
   above, and starred outranking online is correct, so "is it card zero" would be
   testing the wrong thing. What matters is that among the UNSTARRED friends, the
   online one comes first. */
const online = await page.evaluate(() => {
  const cards = [...document.querySelectorAll('.cfan-card')];
  const rows = cards.map(c => ({
    text: (c.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 30),
    starred: !!c.querySelector('.cfan-fstar:not([hidden])'),
    live: !!c.querySelector('.cfan-live'),
  }));
  const unstarred = rows.filter(r => !r.starred);
  return { n: cards.length, firstUnstarred: unstarred[0]?.text || '',
    liveCount: rows.filter(r => r.live).length, hasSearch: !!document.querySelector('#cfanSearch') };
});
ok('ONLINE the online friend leads the unstarred pack (bias, not filter)',
  new RegExp(ONLINE_NAME, 'i').test(online.firstUnstarred) && online.n === FRIENDS.length,
  JSON.stringify(online));
ok('ONLINE nobody is hidden by the bias (a filter would drop the rest)',
  online.n === FRIENDS.length, `${online.n} of ${FRIENDS.length} still in the deck`);

const search = async q => page.evaluate(async term => {
  const f = document.querySelector('#cfanSearch');
  if (!f) return { err: 'no search box' };
  f.value = term; f.dispatchEvent(new Event('input', { bubbles: true }));
  await new Promise(r => setTimeout(r, 520));
  return { cards: document.querySelectorAll('.cfan-card').length,
    first: (document.querySelector('.cfan-card')?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 30) };
}, q);

const byName = await search('phantom');
ok('SEARCH matches the Boneheadz name', byName.cards === 1 && /PHANTOM/i.test(byName.first), JSON.stringify(byName));

const byNick = await search('rocke');
ok('SEARCH matches a NICKNAME you gave them, not just their name',
  byNick.cards === 1 && new RegExp(`${NICK_NAME}|${NICK}`, 'i').test(byNick.first), JSON.stringify(byNick));

const noHit = await page.evaluate(async () => {
  const f = document.querySelector('#cfanSearch');
  f.value = 'zzzznobody'; f.dispatchEvent(new Event('input', { bubbles: true }));
  await new Promise(r => setTimeout(r, 520));
  const n = document.querySelector('#cfanNoHit');
  return { said: !!(n && !n.hidden && n.getBoundingClientRect().height > 0),
    deckHidden: !!document.querySelector('#cfanWrap')?.hidden };
});
ok('SEARCH a search matching nobody SAYS so (a blank fan reads as a lost crew)',
  noHit.said && noHit.deckHidden, JSON.stringify(noHit));

const cleared = await page.evaluate(async () => {
  document.querySelector('#cfanClear').click();
  await new Promise(r => setTimeout(r, 520));
  return document.querySelectorAll('.cfan-card').length;
});
ok('SEARCH clearing restores the whole crew', cleared === FRIENDS.length, `${cleared} cards back`);

await browser.close();
if (srv) srv.kill();
console.log(fails ? '\nCREW FAN AUDIT FAILED' : '\nCREW FAN VERIFIED');
process.exit(fails);
