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
import { boot, sleep, serveTree} from './godmode.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let fails = 0;
const ok = (label, pass, detail = '') => {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}${detail ? `  | ${detail}` : ''}`);
  if (!pass) fails = 1;
};

let srv = null, srvHandle = null;
let base = process.env.URL;
if (!base) {
  /* serveTree: a free port from the OS, and a HARD ERROR if python never
     bound. The hard-coded port with stdio:'ignore' meant a stranded server
     already holding it made this audit talk to whatever was listening. */
  srvHandle = await serveTree(ROOT);
  srv = { kill: () => srvHandle.close() };
  base = srvHandle.url;
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


/* ---- PERF, learned from the Stable -----------------------------------------
   Tom, 2026-08-08: "make sure you're learning your lesson from the stable because
   the crew fan is basically the same thing that could lag too."
   The fan is HEAVIER than the Stable, not lighter: seven layered Bonehead stacks
   of ~7 images each plus pets, versus six single-pet cards. Two guards, both
   measuring what actually costs frames rather than what looks right.
   PROVE-RED: delete `.cfan-card.off { visibility: hidden }` and OFFSCREEN fails;
   delete the animation-play-state pair and ONEPET fails. */
/* TEN friends, not seven. The fan seats at most 7, so with exactly 7 nothing is
   ever rotated off and the OFFSCREEN check below would pass having examined
   nothing (rule 3: an empty sample is a failure, never a pass). */
await seedCrew([...FRIENDS, ...FRIENDS.slice(0, 3)].map((f, i) => ({
  ...f, playerId: `perf-${i}`, name: `${f.name} ${i}`, alias: null, lastSeen: Date.now() - 86400000,
})));
await sleep(1000);

const perf = await page.evaluate(() => {
  const cards = [...document.querySelectorAll('.cfan-card')];
  const hiddenOff = cards.filter(c => c.classList.contains('off'))
    .every(c => getComputedStyle(c).visibility === 'hidden');
  const anyOff = cards.some(c => c.classList.contains('off'));
  const running = cards.map(c => ({
    feat: c.classList.contains('feat'),
    n: [...c.querySelectorAll('*')].filter(el => {
      const cs = getComputedStyle(el);
      return cs.animationName !== 'none' && cs.animationPlayState === 'running';
    }).length,
  }));
  return { cards: cards.length, anyOff, hiddenOff,
    runningOnFeat: running.filter(r => r.feat).reduce((a, r) => a + r.n, 0),
    runningElsewhere: running.filter(r => !r.feat).reduce((a, r) => a + r.n, 0) };
});
ok('OFFSCREEN cards rotated off the fan are skipped, not drawn at opacity 0',
  perf.anyOff && perf.hiddenOff, JSON.stringify(perf));   // anyOff required: no sample = failure
ok('ONEPET only the featured crew member animates (no lockstep, no wasted frames)',
  perf.runningElsewhere === 0, `${perf.runningOnFeat} running on the featured card, ${perf.runningElsewhere} elsewhere`);


/* ---- NO SIDEWAYS PAGE SCROLL, AND ONE GESTURE MOVES ONE THING ---------------
   Both shipped in v326 and Tom found them within minutes, which means neither had
   a guard. They do now.
   Tom: "im able to scroll the whole app left to right on that tab it's not
   constrained to the width of the phone" and "i cant easily scroll my friends
   cards with a finger drag it moves too much of the screen".
   PROVE-RED: remove `overflow-x: clip` from .cfan-wrap and WIDTH fails; remove the
   axis lock from the pointermove handler and VERTICAL fails. */
await seedCrew(FRIENDS);
await sleep(900);

/* Seed a crew big enough that cards are actually flung off the fan: with 7 or
   fewer nothing translates far enough to overflow, so a 7-friend check is a check
   that cannot fail. Also NAME the widest offender, or a red result tells you
   nothing about what to fix. */
await seedCrew([...FRIENDS, ...FRIENDS].map((f, i) => ({ ...f, playerId: `w-${i}`, name: `${f.name} ${i}` })));
await sleep(1000);
const width = await page.evaluate(() => {
  const view = window.innerWidth;
  let worst = null;
  for (const el of document.querySelectorAll('#screen *')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0) continue;
    const over = Math.max(r.right - view, -r.left);
    if (over <= 1) continue;
    /* An overhang is only a BUG if nothing clips it. getBoundingClientRect
       reports UNCLIPPED geometry, so measuring the box alone can never tell the
       fixed state from the broken one -- it reported the same 83px overhang
       before and after `overflow-x: clip` landed. What actually decides whether
       the page scrolls sideways is whether some ancestor contains the overflow. */
    let clipped = false;
    for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
      const ox = getComputedStyle(a).overflowX;
      /* Only `hidden` and `clip` CONTAIN the overflow. `auto` and `scroll` make it
         reachable by scrolling, which is precisely the reported bug ("i'm able to
         scroll the whole app left to right"), so they must not count as a fix. */
      if (ox === 'hidden' || ox === 'clip') { clipped = true; break; }
      if (ox === 'auto' || ox === 'scroll') break;   // scrollable: the overhang stands
    }
    if (clipped) continue;
    if (!worst || over > worst.over) {
      worst = { over: Math.round(over), cls: (el.className || el.tagName).toString().slice(0, 40),
        left: Math.round(r.left), right: Math.round(r.right) };
    }
  }
  return { doc: document.documentElement.scrollWidth, view, body: document.body.scrollWidth, worst };
});
/* Assert that NO ELEMENT extends past the viewport, not that scrollWidth is
   clean. Headless Chrome reported scrollWidth 393 while a card sat at right: 476,
   so the scrollWidth form was a check that could not fail -- it passed against the
   exact bug Tom was looking at on his phone. WKWebView turns that overhang into a
   real sideways scroll; the overhang itself is the device-independent fact. */
ok('WIDTH nothing on the crew tab extends past the phone (sideways scroll)',
  !width.worst, JSON.stringify(width));

/* A mostly-VERTICAL drag must leave the fan alone. It used to translate the deck
   on any movement at all, so the page scrolled and the fan slid at the same time. */
const vertical = await page.evaluate(async () => {
  const wrap = document.querySelector('#cfanWrap'), deck = document.querySelector('#cfanDeck');
  const r = wrap.getBoundingClientRect();
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  const pd = (t, x, y) => wrap.dispatchEvent(new PointerEvent(t, { pointerId: 1, clientX: x, clientY: y, bubbles: true }));
  pd('pointerdown', cx, cy);
  for (let i = 1; i <= 6; i++) pd('pointermove', cx + i * 2, cy + i * 18);   // steeply vertical
  const moved = deck.style.transform;
  pd('pointerup', cx + 12, cy + 108);
  return { transform: moved || 'none' };
});
ok('VERTICAL a vertical drag does not slide the fan (one gesture moves one thing)',
  !/translateX\(-?[1-9]/.test(vertical.transform), JSON.stringify(vertical));

/* A horizontal drag must move you THROUGH the deck, not slide it as a block.
   Tom, 2026-08-08: "dragging left to right doesnt scroll it moves the whole thing
   left to right." The old behaviour translated the whole deck and advanced by
   exactly one on release, so a long drag and a short one did the same thing.
   Asserting the DISTANCE TRAVELLED, not that a transform appeared: the deck now
   only carries the sub-step remainder, so a transform check would pass on the
   broken design and fail on the fixed one (it did). */
const travel = async px => page.evaluate(async dist => {
  const wrap = document.querySelector('#cfanWrap');
  const dots = () => [...document.querySelectorAll('.cfan-dots i')].findIndex(d => d.classList.contains('on'));
  const r = wrap.getBoundingClientRect();
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  const pd = (t, x, y) => wrap.dispatchEvent(new PointerEvent(t, { pointerId: 9, clientX: x, clientY: y, bubbles: true }));
  const from = dots();
  pd('pointerdown', cx, cy);
  const n = 12;
  for (let i = 1; i <= n; i++) { pd('pointermove', cx - (dist * i) / n, cy + 1); await new Promise(r2 => setTimeout(r2, 12)); }
  pd('pointerup', cx - dist, cy + 1);
  await new Promise(r2 => setTimeout(r2, 700));
  const to = dots(), N = document.querySelectorAll('.cfan-dots i').length;
  let d = to - from; if (d < -N / 2) d += N; if (d > N / 2) d -= N;
  return { from, to, moved: d };
}, px);

const shortDrag = await travel(70);
ok('HORIZONTAL a short drag moves you one friend along', shortDrag.moved >= 1, JSON.stringify(shortDrag));

const longDrag = await travel(230);
ok('HORIZONTAL a long drag travels FURTHER than a short one (a scroll, not a snap)',
  longDrag.moved > shortDrag.moved, `short ${shortDrag.moved}, long ${longDrag.moved}`);

/* ---- the ONLINE filter (Tom, 2026-08-08) -------------------------------------
   "I don't see the online filter with friends in the fan part of the crew, just
   favs" ... "the player could filter it themself once they get to the tab, not as
   a default open."
   So the guards are: the control EXISTS and is reachable, it is OFF on arrival,
   operating it actually removes offline friends (not just repaints a chip), and
   turning it off brings everyone back. The fixture alternates lastSeen, so half
   the crew is online and half is a day stale: a filter that did nothing would
   leave the count unchanged and fail here. */
await seedCrew(FRIENDS);
const onBtnSel = '#cfanOnline';
const fanState = () => page.evaluate(() => ({
  exists: !!document.querySelector('#cfanOnline'),
  reachable: !!document.querySelector('#cfanOnline')?.offsetParent,
  pressed: document.querySelector('#cfanOnline')?.getAttribute('aria-pressed'),
  cards: document.querySelectorAll('#cfanDeck .cfan-card').length,
  ids: [...document.querySelectorAll('#cfanDeck .cfan-card')].map(c => c.dataset.fan),
}));
const onlineIds = FRIENDS.filter(f => Date.now() - f.lastSeen < 6 * 60000).map(f => f.playerId);

const fanBefore = await fanState();
ok('ONLINE the filter control exists in the fan', fanBefore.exists);
ok('ONLINE it is reachable (not hidden behind the small-crew search rule)', fanBefore.reachable);
ok('ONLINE it is OFF when the tab opens (a filter must not be the default)',
  fanBefore.pressed === 'false', `pressed=${fanBefore.pressed}`);
ok('ONLINE the unfiltered fan is not empty (an empty sample proves nothing)',
  fanBefore.cards > 0, `${fanBefore.cards} cards`);

await page.evaluate(sel => document.querySelector(sel)?.click(), onBtnSel);
await sleep(1200);
const fanOn = await fanState();
ok('ONLINE operating it actually drops the offline friends',
  fanOn.cards < fanBefore.cards && fanOn.cards > 0,
  `${fanBefore.cards} -> ${fanOn.cards} (online fixtures: ${onlineIds.length})`);
ok('ONLINE every card left on screen is genuinely online',
  fanOn.ids.every(id => onlineIds.includes(id)), JSON.stringify(fanOn.ids));

await page.evaluate(sel => document.querySelector(sel)?.click(), onBtnSel);
await sleep(1200);
const fanOff = await fanState();
ok('ONLINE turning it off brings the whole crew back',
  fanOff.cards === fanBefore.cards, `${fanOff.cards} vs ${fanBefore.cards}`);

/* Nobody online at all: the deck must SAY why it is empty rather than just going
   blank, which reads as the crew having vanished. */
await seedCrew(FRIENDS.map(f => ({ ...f, lastSeen: Date.now() - 86400000 })));
await page.evaluate(sel => document.querySelector(sel)?.click(), onBtnSel);
await sleep(1200);
const noneMsg = await page.evaluate(() => {
  const n = document.querySelector('#cfanNoHit');
  return n && !n.hidden ? n.textContent.trim() : '';
});
ok('ONLINE an empty result explains itself and says how to undo it',
  /online right now/i.test(noneMsg) && /tap online/i.test(noneMsg), noneMsg || '(nothing shown)');

/* ------------------------------------------------- PLATE, and the pet ---------
   Tom, 2026-08-22: "the crew tab: some people's pets get cut off in the crew card
   album layout" when a title or nickname is long.

   Two things did it and only fixing both helps. The name and title were
   text-overflow: CLIP, so a long one was sliced mid-glyph; and the "LV n" pill had
   no white-space rule, so a long title squeezed the flex row until the pill broke
   across lines INSIDE ITSELF. Measured on the worst real case, "Bone Grand Master
   113" plus a long alias at 393x852: the pill rendered 36.4px tall against the
   title's 13.5px and drove the plate to 74px over three lines, and the plate is
   what covers the art.

   PROVENANCE for the 62px bound, 2026-08-23: measured, not chosen. Fixed plate on
   that same worst case is 57.8px, and the defect state is 74px. 62 clears the fix
   by 4px and catches the defect by 12px. A single-line plate on a short name is
   ~40px, so this is a ceiling and not a pin.
   PROVE-RED: drop `white-space: nowrap` from `.cfan-plate .lv`. */
await seedCrew([{ playerId: 'plate0', name: 'Bartholomew Fitzgerald-Wellington',
  alias: 'the Unbelievably Long Nickname', lastSeen: Date.now(),
  profile: { level: 113, levelName: 'Bone Grand Master 113', badges: 3, gearCount: 4,
             outfit: { B: 'B0-1', SK: 'SK0-1', BG: 'BG1' }, pet: { sp: 'bumbleseal' } } }]);
const plate = await page.evaluate(() => {
  const c = document.querySelector('.cfan-card'); if (!c) return null;
  const pl = c.querySelector('.cfan-plate'); if (!pl) return null;
  const b = pl.querySelector('b'), t = pl.querySelector('.cfan-title'), lv = pl.querySelector('.lv');
  const h = e => e ? +e.getBoundingClientRect().height.toFixed(1) : null;
  return { plate: h(pl), name: h(b), title: h(t), lv: h(lv),
           nameOver: b ? getComputedStyle(b).textOverflow : null,
           titleOver: t ? getComputedStyle(t).textOverflow : null };
});
ok('PLATE the worst real title and nickname still render a card to grade (empty is a FAILURE)',
  !!plate && plate.plate > 0, JSON.stringify(plate));
ok('PLATE a long title and nickname do not grow the plate over the art (<= 62px)',
  !!plate && plate.plate <= 62, JSON.stringify(plate));
ok('PLATE the LV pill stays on one line rather than breaking inside itself',
  !!plate && plate.lv != null && plate.lv <= 24, `lv ${plate && plate.lv}px, title ${plate && plate.title}px`);
ok('PLATE long text ends in an ellipsis rather than a cut glyph',
  !!plate && plate.nameOver === 'ellipsis' && plate.titleOver === 'ellipsis',
  `name ${plate && plate.nameOver}, title ${plate && plate.titleOver}`);

/* --------------------------------------------- THE BANNER ICON SLOT -----------
   Tom, 2026-08-22: "the icon on the crew banner 'thanks for bieng early' is up in
   the top left, it should be centred like the first step foot".

   Measured on the real banner at 393x852: the glyph sat -8.0, -9.0 px off the
   38px slot's centre, because `.gbn-ico` was `display: block` and the glyph simply
   started at its top-left corner. The fix is on the SHARED skin, so every banner
   is centred at once rather than this one being nudged.

   It is guarded HERE rather than in tests/badge-centre-audit.mjs, and that is a
   decision with a measurement behind it: that lint's ROUND_MIN_PCT is 45% and
   .gbn-ico is a 26% radius. Setting it to 24 does reach this element and BOX/INK
   both pass on it, but it also pulls the Boneyard readout disc into the sample,
   which is occluded there, reding COVERAGE for a reason unrelated to centring.
   Note left at that constant.
   PROVE-RED: put `.gbn-ico` back to `display: block`. */
const bico = await page.evaluate(() => {
  const el = [...document.querySelectorAll('.gbn-ico')].find(e => e.getBoundingClientRect().width);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const g = [...el.children].find(c => c.getBoundingClientRect().width);
  if (!g) return { cls: el.className, noGlyph: true };
  const gr = g.getBoundingClientRect();
  return { cls: el.className, size: +r.width.toFixed(1),
    dx: +((gr.left + gr.width / 2) - (r.left + r.width / 2)).toFixed(2),
    dy: +((gr.top + gr.height / 2) - (r.top + r.height / 2)).toFixed(2) };
});
ok('BANNER a banner icon slot with a glyph in it was found to grade (empty is a FAILURE)',
  !!bico && !bico.noGlyph, JSON.stringify(bico));
/* 2px of the 19px radius, ~10%. The fix measures 0.00 on both axes and the defect
   measured -8.0 and -9.0, so this catches the defect by 6px and clears the fix by
   2px. Measured 2026-08-23. */
ok('BANNER the glyph is centred in its slot, not parked in the top-left corner',
  !!bico && !bico.noGlyph && Math.abs(bico.dx) <= 2 && Math.abs(bico.dy) <= 2,
  JSON.stringify(bico));

await browser.close();
if (srv) srv.kill();
console.log(fails ? '\nCREW FAN AUDIT FAILED' : '\nCREW FAN VERIFIED');
process.exit(fails);
