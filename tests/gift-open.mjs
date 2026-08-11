/* A GIFT IS OPENED BY HAND, AND IT NAMES WHO SENT IT.
 *
 * Tom, 2026-08-08: "make it so that you have to open gifts from friends in the
 * crew tab 'XXXX sent you a gift!' and then theres an open animation. its boring
 * to just have it appear with no fanfare or credit to the sender. otherwise
 * deliveries reads like a receipt you'd get at a store."
 *
 * The contract this locks down:
 *   SEALED   a gift grant does NOT pay out on arrival; it sits in the giftbox
 *   OPEN     the reward lands the moment you tap OPEN, exactly once
 *   CREDIT   the reveal names the sender
 *   BADGE    a sealed gift keeps the Crew badge up however old it is
 *
 * Fires the REAL button in the REAL tab, and checks the coin balance either side
 * of it, because "the row rendered" proves nothing about whether it paid.
 *
 * PROVE-RED (confirmed 2026-08-08): drop 'gift' from HELD_TYPES in js/social.js
 * and SEALED fails (coins arrive before you ever tap).
 *
 * Usage: node tests/gift-open.mjs
 */
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { boot, seed, sleep, serveTree} from './godmode.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
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
const results = [];
const ok = (name, pass, detail = '') => { results.push({ name, pass }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`); };

const { browser, page } = await boot(base);
await page.setViewport({ width: 393, height: 852, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await seed(page, { level: 12, coins: 100 });
await page.evaluate(async () => {
  const db = await import('./js/db.js');
  await db.kvSet('social', { playerId: 'gift-audit', handle: 'Audit Bones', friendCode: 'BONE-TEST-TEST', name: null, onlineAt: Date.now() });
});

const coins = () => page.evaluate(async () => (await import('./js/loot.js')).coins());

// a gift arrives exactly as the server delivers one
const before = await coins();
const landed = await page.evaluate(async () => {
  const social = await import('./js/social.js');
  // reach applyGrant the way pullGrants does, through the module's own path
  const box0 = await social.giftBox();
  await social.__testApplyGrant({ key: 'gift-audit-1', type: 'gift', ts: Date.now(), payload: { coins: 500, note: 'Brock sent you a gift!' } });
  const box1 = await social.giftBox();
  return { was: box0.length, now: box1.length };
});
const afterArrival = await coins();
ok('SEALED the gift lands in the box', landed && landed.now === landed.was + 1, JSON.stringify(landed));
ok('SEALED it does NOT pay out on arrival', afterArrival === before, `${before} -> ${afterArrival} coins`);

// open it with the REAL button in the REAL tab
await page.evaluate(() => { location.hash = '#/friends'; });
await sleep(2400);
const seen = await page.evaluate(() => {
  const b = document.querySelector('[data-gift]');
  return b ? { present: true, sender: b.querySelector('b')?.textContent, verb: b.querySelector('.open')?.textContent } : { present: false };
});
ok('SEALED the Crew tab shows it closed, with the sender on it',
  seen.present && /Brock/.test(seen.sender || '') && /OPEN/i.test(seen.verb || ''), JSON.stringify(seen));

if (seen.present) {
  await page.evaluate(() => document.querySelector('[data-gift]').click());
  await sleep(1800);
  const afterOpen = await coins();
  ok('OPEN the reward lands when you tap it', afterOpen === before + 500, `${afterArrival} -> ${afterOpen} coins`);
  // assert the credit is inside the REVEAL, not merely somewhere on the page: a
  // whole-body regex would pass on any stray mention and prove nothing
  const reveal = await page.evaluate(() => {
    const foot = document.querySelector('#packFoot');
    return { open: !!foot, text: foot ? foot.textContent.trim() : null };
  });
  ok('CREDIT the reveal actually opened', reveal.open, JSON.stringify(reveal));
  ok('CREDIT and its footer names who sent it', /From Brock/i.test(reveal.text || ''), String(reveal.text));

  const box = await page.evaluate(async () => (await (await import('./js/social.js')).giftBox()).length);
  ok('OPEN it cannot be opened twice', box === 0, `${box} left in the box`);
  const again = await coins();
  ok('OPEN and the balance did not move again', again === before + 500, `${again} coins`);
}

/* BADGE: a sealed gift keeps the tab marked however long it has sat there. */
const badge = await page.evaluate(async () => {
  const social = await import('./js/social.js');
  await social.__testApplyGrant({ key: 'gift-audit-old', type: 'gift', ts: Date.now() - 90 * 86400000, payload: { coins: 10, note: 'Cam sent you a gift!' } });
  return window.__unseenDeliveries ? window.__unseenDeliveries() : null;
});
ok('BADGE an old sealed gift still counts', badge >= 1, `unseen=${badge}`);

await browser.close();
if (srv) srv.kill();
const failed = results.filter(r => !r.pass).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
if (!results.length) { console.log('FAIL: no checks ran'); process.exit(1); }
process.exit(failed ? 1 : 0);
