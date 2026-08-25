/* THE COMMUNITY CARD: the Discord invite has to be obvious, honest about what
   Discord even is (Tom, 2026-08-11: "there's a lot of non-real-gamers playing
   and this may seem intimidating to them"), fire once from boot, and live on in
   News and Settings for anyone who dismissed it. Every check here operates the
   real control; a card that renders but links nowhere is the failure mode.
   PROVE-RED (run): wrong invite URL fails LINK; the "free chat app" line
   removed fails COPY; the kvSet dropped from the boot path fails ONCE. */
import { boot, sleep, serveTree } from './godmode.js';
const fails = [];
const ok = (n, p, d = '') => { console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${d ? '  ' + d : ''}`); if (!p) fails.push(n); };
const DISCORD_URL = 'https://discord.gg/HrMReZe9D';

/* SERVE THE REPO RATHER THAN HOPING. This defaulted to localhost:8765, so with
   nothing listening it booted a dead URL, the app never loaded, and the run
   died on `window.__community is not a function`: a setup failure wearing the
   costume of a missing feature. Same trap the gate fixed for itself. */
const srv = process.argv[2] ? null : await serveTree(process.cwd());
const { browser, page } = await boot(process.argv[2] || srv.url);
const base = (process.argv[2] || srv.url).replace(/\/?$/, '/');
const errs = []; page.on('pageerror', e => errs.push(String(e)));

/* ---- the card itself, via the real test hook ---- */
await page.evaluate(() => window.__community());
await sleep(400);
const card = await page.evaluate(() => {
  const veil = document.querySelector('.drop-veil');
  const cta = veil && veil.querySelector('#communityGo');
  return veil ? {
    text: veil.innerText.replace(/\s+/g, ' '),
    ctaTag: cta ? cta.tagName : null,
    ctaHref: cta ? cta.getAttribute('href') : null,
    ctaBlank: cta ? cta.getAttribute('target') === '_blank' && /noopener/.test(cta.getAttribute('rel') || '') : false,
  } : null;
});
ok('SETUP the community card renders at all', !!card, card ? '' : 'no .drop-veil');
if (card) {
  ok('LINK the CTA is a real link to the real invite', card.ctaTag === 'A' && card.ctaHref === DISCORD_URL && card.ctaBlank, `${card.ctaTag} ${card.ctaHref}`);
  ok('COPY it says what Discord is, in plain words', /free chat app/i.test(card.text) && /group text/i.test(card.text), '');
  ok('COPY it says why: features get decided there', /future feature/i.test(card.text), '');
  ok('COPY it names the server', /Bone Boiz/.test(card.text), '');
}

/* ---- dismissal leaves the app usable ---- */
await page.evaluate(() => document.getElementById('communityLater')?.click());
await sleep(400);
const after = await page.evaluate(() => {
  const gone = !document.querySelector('.drop-veil');
  const today = [...document.querySelectorAll('.tab')].find(t => /today/i.test(t.textContent));
  const r = today && today.getBoundingClientRect();
  const hit = r && document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
  return { gone, tabReachable: !!(hit && (hit === today || today.contains(hit))) };
});
ok('Maybe later closes the card', after.gone, JSON.stringify(after));
ok('and the tab bar is tappable again (hit-tested)', after.tabReachable, JSON.stringify(after));

/* ---- THREE OPENS, THEN STOP, through the REAL boot path ----
   Tom, 2026-08-13: "make the popup happen on the first three opens to
   encourage joining". So ONCE became a counter, and the assertion has to
   follow: it is not enough that it stops, it has to show three times FIRST.
   A check that only proved "eventually stops" would pass on the old boolean. */
/* SUPERSEDED 2026-08-25. Tom, watching a simulator launch: "i see in the
   simulator you have popups showing i told you to remove all those from the
   game? the only news things staying are ... the ones on crew that link the
   discord." The Discord ROUTES are the ones he named as keepers, and all three
   are still graded below (the Crew strip, the News row, the Settings row). The
   unasked-for showing on the first three opens is what left, so the assertion
   inverts: this card must NEVER open itself.
   MASKED matters for the same reason it does in first-session-audit: every
   launch gate suppresses itself under navigator.webdriver, so without the mask
   a quiet boot is what a broken tree reports too. */
/* IN ITS OWN PAGE, and that is not tidiness. The mask has to be installed
   before any app script, which means evaluateOnNewDocument, which means it
   survives every later reload on that page. It also takes away every
   window.__test* hook the rows BELOW depend on (they are all webdriver-gated),
   so masking the shared page silently emptied the Crew tab and reddened four
   BANNER rows that have nothing to do with this. A second page shares the same
   origin and the same IndexedDB and is thrown away after. */
const coldPage = await browser.newPage();
await coldPage.evaluateOnNewDocument(() => {
  Object.defineProperty(navigator, 'webdriver', { get: () => false, configurable: true });
});
const bootShow = async () => {
  await coldPage.goto(base + '?demo', { waitUntil: 'networkidle2' });
  await sleep(9000);   // past the 4s the old gate used, plus its retries
  const up = await coldPage.evaluate(() => !!document.querySelector('.drop-veil #communityGo'));
  if (up) await coldPage.evaluate(() => document.getElementById('communityLater')?.click());
  return up;
};
const opens = [await bootShow(), await bootShow()];
const maskHeld = await coldPage.evaluate(() => navigator.webdriver === false);
ok('MASKED navigator.webdriver reads false, so a quiet boot means something', maskHeld,
  `navigator.webdriver = ${await coldPage.evaluate(() => navigator.webdriver)}`);
ok('NEVER-FROM-BOOT the Discord card does not open itself on a launch', !opens[0] && !opens[1], JSON.stringify(opens));
await coldPage.close();

/* ---- the thin strip on Crew, for everyone who tapped past the popup ---- */
await page.evaluate(() => {
  window.__testMe = { playerId: 'me', name: 'Me', friendCode: 'BONE-ME', handle: 'me' };
  window.__testFriends = { friends: [], incoming: [], outgoing: [] };
  window.__testLb = [];
  location.hash = '#/friends';
});
await sleep(2600);
/* WAIT FOR THE CONDITION, DO NOT SAMPLE ONCE. The first version of this row
   read the banner's effective opacity at a fixed 2600ms and reported 0 while an
   isolated run of the same markup reported 1. A single timed sample cannot
   tell "still arriving" from "never arrives", which is the same fixed-sleep
   trap that has bitten this harness twice today. Poll instead, and FAIL if the
   screen never reveals: a genuinely invisible Crew tab still goes red, it just
   takes six seconds to say so. */
await page.waitForFunction(() => {
  const b = document.getElementById('crewDiscord');
  if (!b) return false;
  let o = 1, n = b; while (n && n.nodeType === 1) { o *= parseFloat(getComputedStyle(n).opacity); n = n.parentElement; }
  return o > 0.9;
}, { timeout: 6000 }).catch(() => {});
const strip = await page.evaluate(() => {
  const b = document.getElementById('crewDiscord');
  if (!b) return { found: false };
  const rb = b.getBoundingClientRect();
  const tile = document.getElementById('crewLeaderboard');
  /* VISIBILITY, not presence. This app shipped an onboarding screen at
     opacity 0 on 2026-08-12 that a presence check called fine, so the whole
     ancestor chain is multiplied. */
  let o = 1, n = b; while (n && n.nodeType === 1) { o *= parseFloat(getComputedStyle(n).opacity); n = n.parentElement; }
  const hit = document.elementFromPoint(rb.left + rb.width / 2, rb.top + rb.height / 2);
  return { found: true, effOpacity: +o.toFixed(2), h: Math.round(rb.height),
    aboveTile: tile ? rb.top < tile.getBoundingClientRect().top : false,
    hits: hit === b || b.contains(hit), mark: !!b.querySelector('svg') };
});
ok('BANNER the Crew tab carries the strip, above the leaderboard tile',
  strip.found && strip.aboveTile, JSON.stringify(strip));
ok('BANNER it is VISIBLE and tappable, not merely present',
  strip.found && strip.effOpacity > 0.9 && strip.h > 30 && strip.hits, JSON.stringify(strip));
ok('BANNER it carries the Discord mark', !!strip.mark, '');
await page.evaluate(() => document.getElementById('crewDiscord')?.click());
await sleep(1400);
const fromStrip = await page.evaluate(() => {
  const go = document.getElementById('communityGo');
  return { opened: !!document.querySelector('.dc-veil'), href: go?.getAttribute('href') };
});
ok('BANNER tapping it opens the same card, with the real invite',
  fromStrip.opened && fromStrip.href === DISCORD_URL, JSON.stringify(fromStrip));
await page.evaluate(() => document.getElementById('communityLater')?.click());
await sleep(600);

/* MEASURED BEFORE THE JOIN TEST, ON PURPOSE. The JOIN link is target=_blank,
   so clicking it opens a tab and backgrounds this one, and revealWhenReady
   applies `screen-in` inside a requestAnimationFrame, which a background tab
   does not run. Measuring the strip after that step reported the Crew screen at
   opacity 0 for six seconds. I could NOT reproduce that outside this file
   (direct visits, re-render races, boot-time races and a faithful replay of the
   JOIN click all revealed normally), so the rAF-in-a-background-tab reading is
   a hypothesis, not a proven cause. What is certain is that the ordering is the
   variable, and a visibility assertion has no business depending on how many
   tabs a previous check opened. Ordered so it does not. */
/* ---- JOIN burns it permanently, and immediately ----
   GONE 2026-08-25 with the showings it protected: JOIN-BURN existed so that
   somebody who had already joined would not be shown the card again on their
   next two opens. Nothing shows the card on any open now, so the counters it
   burned (discordIntroShown, discordJoined) were write-only and left with the
   gate. NEVER-FROM-BOOT above is the stronger version of the same promise.
   The LINK row at the top still proves the JOIN button carries the real
   invite, which is the half of this that was ever about the player. */

/* ---- the permanent homes: News and Settings ---- */
await page.evaluate(() => {
  window.__testMe = { playerId: 'me', name: 'Hollow Shovel', friendCode: 'BONE-4K7Q', handle: 'hollow' };
  window.__testFriends = { friends: [], incoming: [], outgoing: [] };
  location.hash = '#/friends';
});
await sleep(2400);
await page.evaluate(() => document.getElementById('crewWhatsNew')?.click());
await sleep(1300);
const news = await page.evaluate(async () => {
  document.querySelector('[data-wntab="news"]')?.click();
  await new Promise(r => setTimeout(r, 300));
  const row = document.querySelector('[data-news="discord"]');
  if (!row) return { row: false };
  row.click();
  await new Promise(r => setTimeout(r, 400));
  const cta = document.querySelector('.drop-veil #communityGo');
  return { row: true, reopens: !!cta, href: cta && cta.getAttribute('href') };
});
ok('NEWS carries the story', news.row, JSON.stringify(news));
ok('and the story reopens the real card with the real link', news.reopens && news.href === DISCORD_URL, JSON.stringify(news));

await page.evaluate(() => { document.querySelector('.drop-veil')?.remove(); location.hash = '#/settings'; });
await sleep(1500);
const settings = await page.evaluate(() => {
  const a = document.getElementById('communityBtn');
  return { present: !!a, tag: a && a.tagName, href: a && a.getAttribute('href') };
});
ok('SETTINGS carries the join link', settings.present && settings.tag === 'A' && settings.href === DISCORD_URL, JSON.stringify(settings));

ok('no page errors while operating any of it', errs.length === 0, errs.slice(0, 2).join(' | '));

const failed = fails.length;
console.log(`\n${failed ? `${failed} FAILED` : 'ALL PASS'}`);
await browser.close(); srv?.close?.();
process.exit(failed ? 1 : 0);
