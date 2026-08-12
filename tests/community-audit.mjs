/* THE COMMUNITY CARD: the Discord invite has to be obvious, honest about what
   Discord even is (Tom, 2026-08-11: "there's a lot of non-real-gamers playing
   and this may seem intimidating to them"), fire once from boot, and live on in
   News and Settings for anyone who dismissed it. Every check here operates the
   real control; a card that renders but links nowhere is the failure mode.
   PROVE-RED (run): wrong invite URL fails LINK; the "free chat app" line
   removed fails COPY; the kvSet dropped from the boot path fails ONCE. */
import { boot, sleep } from './godmode.js';
const fails = [];
const ok = (n, p, d = '') => { console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${d ? '  ' + d : ''}`); if (!p) fails.push(n); };
const DISCORD_URL = 'https://discord.gg/HrMReZe9D';

const { browser, page } = await boot(process.argv[2] || 'http://localhost:8765/');
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

/* ---- once, and only once, through the REAL boot path ---- */
await page.evaluateOnNewDocument(() => { window.__communityForce = true; });
await page.reload({ waitUntil: 'networkidle2' });
await sleep(9000);   // boot etiquette: 4s delay plus overlay retries
const boot1 = await page.evaluate(() => !!document.querySelector('.drop-veil #communityGo'));
ok('ONCE the boot path shows it to a player who has never seen it', boot1, '');
await page.evaluate(() => document.getElementById('communityLater')?.click());
await page.reload({ waitUntil: 'networkidle2' });
await sleep(9000);
const boot2 = await page.evaluate(() => !!document.querySelector('.drop-veil #communityGo'));
ok('ONCE and never again after that (kv flag burned)', !boot2, '');

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
await browser.close();
process.exit(failed ? 1 : 0);
