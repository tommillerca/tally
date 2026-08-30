/* THE BETA THANK-YOU CARD: thank the testers, hand them a link worth passing
   on, and tell Android players where to go, because that track is enrolled by
   hand and a wrong answer there strands somebody outside the game entirely.
   Every check operates the real control. The failure modes this file exists
   for are the ones already paid for elsewhere in this repo: a card that
   renders as a zero-size box (twice now), a link that is present but wrong,
   and a one-shot whose flag is burned without anyone seeing anything.
   PROVE-RED (run): a wrong TestFlight URL fails LINK-TF; DISCORD_URL swapped
   for a literal fails LINK-DC; the Android bullet removed fails ANDROID; the
   hero replaced with an empty span fails PIXELS; kvSet dropped from the boot
   path fails ONCE; the crewThanks listener removed fails BANNER-OPENS. */
import { boot, sleep, serveTree, setWidth } from './godmode.js';
const fails = [];
const ok = (n, p, d = '') => { console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${d ? '  ' + d : ''}`); if (!p) fails.push(n); };
const TESTFLIGHT_URL = 'https://testflight.apple.com/join/rtZ6Uyxc';
const DISCORD_URL = 'https://discord.gg/HrMReZe9D';

const srv = process.argv[2] ? null : await serveTree(process.cwd());
const { browser, page } = await boot(process.argv[2] || srv.url);
const base = (process.argv[2] || srv.url).replace(/\/?$/, '/');
const errs = []; page.on('pageerror', e => errs.push(String(e)));

/* THE WHOLE RUN HAPPENS AT THE SMALLEST PHONE IN THE BETA. 375x667 is an
   iPhone SE, and every layout failure this card has actually had showed up
   there and nowhere else. Set once, up front: a resize mid-run re-renders the
   route and takes any open veil with it, which cost one confusing red. */
/* setWidth, not a bare setViewport. puppeteer reads a missing isMobile/hasTouch
   as false, so `{width, height, deviceScaleFactor}` flips both off boot's true
   and SILENTLY RELOADS the page: a fresh 10-13s seeded boot mid-suite whose
   route() closes every open sheet, surfacing as an unrelated flake somewhere
   else. unit.test.js pins this and caught it here. */
await setWidth(page, 375, 667);
await sleep(400);

/* ---- the card itself, via the real test hook ---- */
await page.evaluate(() => window.__betaThanks());
await sleep(600);
const card = await page.evaluate(() => {
  const veil = document.querySelector('.bt-veil');
  if (!veil) return null;
  const tf = veil.querySelector('#thanksLink');
  const dc = [...veil.querySelectorAll('a')].find(a => /discord\.gg/.test(a.getAttribute('href') || ''));
  const hero = veil.querySelector('.bt-hero .dc-bh');
  const hr = hero && hero.getBoundingClientRect();
  const imgs = hero ? [...hero.querySelectorAll('img')] : [];
  /* VISIBILITY, not presence: this app shipped an onboarding screen at
     opacity 0 that a presence check called fine. Multiply the whole chain. */
  let o = 1, n = hero; while (n && n.nodeType === 1) { o *= parseFloat(getComputedStyle(n).opacity); n = n.parentElement; }
  return {
    text: veil.innerText.replace(/\s+/g, ' '),
    tfHref: tf ? tf.getAttribute('href') : null,
    tfBlank: tf ? tf.getAttribute('target') === '_blank' && /noopener/.test(tf.getAttribute('rel') || '') : false,
    dcHref: dc ? dc.getAttribute('href') : null,
    shareTag: veil.querySelector('#thanksShare')?.tagName || null,
    heroW: hr ? Math.round(hr.width) : 0, heroH: hr ? Math.round(hr.height) : 0,
    heroOpacity: +o.toFixed(2),
    layers: imgs.length, painted: imgs.filter(i => i.naturalWidth > 0).length,
  };
});
ok('SETUP the thank-you card renders at all', !!card, card ? '' : 'no .bt-veil');
if (card) {
  /* REAL PIXELS, not a box. A zero-size span reads fine to a selector and
     shows the player nothing; that trap has bitten this repo twice. */
  ok('PIXELS the hero is a real drawn Bonehead, not an empty box',
    card.heroW > 60 && card.heroH > 60 && card.heroOpacity > 0.9 && card.layers > 0 && card.painted === card.layers,
    JSON.stringify({ w: card.heroW, h: card.heroH, o: card.heroOpacity, layers: card.layers, painted: card.painted }));
  ok('LINK-TF the TestFlight link is present and exactly right',
    card.tfHref === TESTFLIGHT_URL && card.tfBlank, String(card.tfHref));
  ok('LINK-DC the Discord link is the one constant, unchanged',
    card.dcHref === DISCORD_URL, String(card.dcHref));
  ok('ANDROID it tells Android players to message in the Discord',
    /android/i.test(card.text) && /discord/i.test(card.text) && /iphone only/i.test(card.text), '');
  ok('COPY it actually thanks them for playing', /thank/i.test(card.text), '');
  ok('SHARE the primary control is a real button', card.shareTag === 'BUTTON', String(card.shareTag));
}

/* ---- EVERY CONTROL REACHABLE ON THE SMALLEST PHONE IN THE BETA ----
   .drop-veil centres its card and does NOT scroll, so a card taller than the
   screen is not "a bit cramped": it is clipped at BOTH ends, unscrollable,
   with its own Close button hanging off the bottom. The first draft of this
   card measured 715px against an iPhone SE's 667 and did exactly that.
   The assertion is reachability, not height, because height is the wrong
   thing to freeze: a longer copy rewrite is allowed, a card the player cannot
   close is not. Both ends are scrolled to and hit-tested, so this stays red
   for a genuinely trapped card and green for a merely tall one. */
const reach = await page.evaluate(async () => {
  const veil = document.querySelector('.bt-veil');
  if (!veil) return { card: false };
  const seen = async (sel) => {
    const el = veil.querySelector(sel);
    el.scrollIntoView({ block: 'center' });
    await new Promise(r => setTimeout(r, 250));
    const b = el.getBoundingClientRect();
    const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
    return b.top >= 0 && b.bottom <= innerHeight && !!hit && (hit === el || el.contains(hit) || hit.contains(el));
  };
  const closeOk = await seen('#thanksClose');
  const shareOk = await seen('#thanksShare');
  const ebOk = await seen('.dc-eyebrow');
  return { card: true, closeOk, shareOk, ebOk, h: Math.round(veil.querySelector('.drop-card').getBoundingClientRect().height), vh: innerHeight };
});
ok('REACHABLE at 375x667 the eyebrow, the CTA and Close are all scrollable into view and hit-testable',
  reach.card && reach.closeOk && reach.shareOk && reach.ebOk, JSON.stringify(reach));

/* ---- the share control hands over the RIGHT url ----
   Present-and-correct on the visible link is not the same as correct in the
   string the OS share sheet receives; they are two separate copies of the
   same fact and either can rot alone. Stub navigator.share and read it. */
const shared = await page.evaluate(async () => {
  window.__shared = null;
  Object.defineProperty(navigator, 'share', {
    configurable: true, value: d => { window.__shared = d; return Promise.resolve(); },
  });
  document.getElementById('thanksShare')?.click();
  await new Promise(r => setTimeout(r, 300));
  return window.__shared;
});
ok('SHARE the share sheet carries the TestFlight link',
  !!shared && shared.text.includes(TESTFLIGHT_URL), JSON.stringify(shared));

/* ---- dismissal leaves the app usable ---- */
await page.evaluate(() => document.getElementById('thanksClose')?.click());
await sleep(400);
const after = await page.evaluate(() => {
  const gone = !document.querySelector('.bt-veil');
  const today = [...document.querySelectorAll('.tab')].find(t => /today/i.test(t.textContent));
  const r = today && today.getBoundingClientRect();
  const hit = r && document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
  return { gone, tabReachable: !!(hit && (hit === today || today.contains(hit))) };
});
ok('CLOSE closes the card', after.gone, JSON.stringify(after));
ok('and the tab bar is tappable again (hit-tested)', after.tabReachable, JSON.stringify(after));

/* ---- NEVER FROM BOOT, through the REAL boot path ----
   This used to be ONCE: the card opened itself on the first launch after
   install. On 2026-08-25 it stopped, with the rest of the launch takeovers
   (Tom, counting six interruptions on a simulator launch: "i see in the
   simulator you have popups showing i told you to remove all those from the
   game?"). The card itself is untouched and every row above and below still
   grades it; only the unasked-for showing is gone.
   MASKED matters here for the same reason it does in first-session-audit:
   every launch gate suppresses itself under navigator.webdriver, so an
   unmasked page would report a quiet boot on a tree that still interrupts.
   The mask makes the app behave the way it does on Tom's phone. */
await page.evaluate(async () => {
  const db = await import('./js/db.js');
  await db.kvSet('betaThanksSeen', false);   // the state that USED to make it fire
});
/* IN ITS OWN PAGE, IN ITS OWN CONTEXT. The mask must be installed before any
   app script, so it is evaluateOnNewDocument on a page of its own (doing it to
   the shared page emptied the Crew tab). The first version shared the main
   page's IndexedDB and called that harmless; it was the opposite: this page's
   demo boots hit the same db the main page holds open, the main page's wipe
   watcher / db freeze machinery reacts, and every LATER kv await on the main
   page wedges, so renderFriends dies at its first read and the three BANNER
   rows below go red with hash '#/friends' over a Today screen and not one page
   error (route() swallows the rejection by design). Which rows lost the race
   varied by machine load, which is how this masqueraded as the #250 contention
   signature for a whole evening. An isolated browser context is also the more
   faithful fixture: a real first launch is a fresh profile, not a tab sharing
   a veteran's database. */
const coldCtx = await browser.createBrowserContext();
const coldPage = await coldCtx.newPage();
await coldPage.evaluateOnNewDocument(() => {
  Object.defineProperty(navigator, 'webdriver', { get: () => false, configurable: true });
});
const bootShow = async () => {
  await coldPage.goto(base + '?demo', { waitUntil: 'networkidle2' });
  await sleep(9500);   // past the 4.6s the old gate used, plus its retries
  const up = await coldPage.evaluate(() => !!document.querySelector('.bt-veil #thanksShare'));
  if (up) await coldPage.evaluate(() => document.getElementById('thanksClose')?.click());
  return up;
};
const opens = [await bootShow(), await bootShow()];
const maskHeld = await coldPage.evaluate(() => navigator.webdriver === false);
ok('MASKED navigator.webdriver reads false, so a quiet boot means something',
  maskHeld, `navigator.webdriver = ${await coldPage.evaluate(() => navigator.webdriver)}`);
ok('NEVER-FROM-BOOT the card does not open itself on a launch, with the seen flag cleared',
  !opens[0] && !opens[1], JSON.stringify(opens));
await coldPage.close();
await coldCtx.close();

/* ---- the permanent strip on Crew, for everyone who tapped past it ---- */
await page.evaluate(() => {
  window.__testMe = { playerId: 'me', name: 'Me', friendCode: 'BONE-ME', handle: 'me' };
  window.__testFriends = { friends: [], incoming: [], outgoing: [] };
  window.__testLb = [];
  location.hash = '#/friends';
});
await sleep(2600);
/* WAIT FOR THE CONDITION, DO NOT SAMPLE ONCE: a single timed sample cannot
   tell "still arriving" from "never arrives". A genuinely invisible Crew tab
   still goes red here, it just takes six seconds to say so. */
await page.waitForFunction(() => {
  const b = document.getElementById('crewThanks');
  if (!b) return false;
  let o = 1, n = b; while (n && n.nodeType === 1) { o *= parseFloat(getComputedStyle(n).opacity); n = n.parentElement; }
  return o > 0.9;
}, { timeout: 6000 }).catch(() => {});
const strip = await page.evaluate(() => {
  const b = document.getElementById('crewThanks');
  if (!b) return { found: false };
  const rb = b.getBoundingClientRect();
  let o = 1, n = b; while (n && n.nodeType === 1) { o *= parseFloat(getComputedStyle(n).opacity); n = n.parentElement; }
  const hit = document.elementFromPoint(rb.left + rb.width / 2, rb.top + rb.height / 2);
  return { found: true, effOpacity: +o.toFixed(2), h: Math.round(rb.height),
    hits: hit === b || b.contains(hit), mark: !!b.querySelector('svg') };
});
ok('BANNER the Crew tab carries the strip, VISIBLE and tappable, not merely present',
  strip.found && strip.effOpacity > 0.9 && strip.h > 30 && strip.hits, JSON.stringify(strip));
ok('BANNER it carries its mark', !!strip.mark, '');
await page.evaluate(() => document.getElementById('crewThanks')?.click());
await sleep(1400);
const fromStrip = await page.evaluate(() => ({
  opened: !!document.querySelector('.bt-veil'),
  href: document.getElementById('thanksLink')?.getAttribute('href'),
}));
ok('BANNER-OPENS tapping it opens the same card, with the real link',
  fromStrip.opened && fromStrip.href === TESTFLIGHT_URL, JSON.stringify(fromStrip));
await page.evaluate(() => document.getElementById('thanksClose')?.click());
await sleep(600);

/* ---- the permanent home: News ---- */
await page.evaluate(() => document.getElementById('crewWhatsNew')?.click());
await sleep(1300);
const news = await page.evaluate(async () => {
  document.querySelector('[data-wntab="news"]')?.click();
  await new Promise(r => setTimeout(r, 300));
  const row = document.querySelector('[data-news="thanks"]');
  if (!row) return { row: false };
  row.click();
  await new Promise(r => setTimeout(r, 500));
  return { row: true, reopens: !!document.querySelector('.bt-veil'),
    href: document.getElementById('thanksLink')?.getAttribute('href') };
});
ok('NEWS carries the story, and it reopens the real card with the real link',
  news.row && news.reopens && news.href === TESTFLIGHT_URL, JSON.stringify(news));

ok('no page errors while operating any of it', errs.length === 0, errs.slice(0, 2).join(' | '));

const failed = fails.length;
console.log(`\n${failed ? `${failed} FAILED` : 'ALL PASS'}`);
await browser.close(); srv?.close?.();
process.exit(failed ? 1 : 0);
