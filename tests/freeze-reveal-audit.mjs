/* A BACKGROUNDED APP MUST NOT COME BACK INVISIBLE.
 *
 * Reg, 2026-08-13: "can a player who taps JOIN, lands in Discord, and comes
 * back find an invisible app". Measured: YES, before this guard.
 *
 * revealWhenReady() is the ONE place that reveals every route and every sheet,
 * and it ended with `requestAnimationFrame(() => root.classList.add(cls))`
 * while app.css holds `.screen:not(.screen-in) { opacity: 0 }`. A frozen page
 * never runs that callback. Worse, `shown` latched to true BEFORE it ran, so it
 * recorded the INTENT to reveal and disarmed the cap timer's retry. Freeze the
 * page mid-route and resume and the screen sat at effective opacity 0 forever
 * with its content present: measured at 0ms, 30ms and 120ms into a route.
 *
 * This is not a Discord bug. iOS freezes the page for a target=_blank tap, an
 * incoming call, the lock screen, or any app switch, and revealWhenReady
 * reveals EVERY route, so any of those during a transition could strand the
 * whole app blank until a hard relaunch.
 *
 * The check freezes the real page through the real lifecycle (CDP
 * Page.setWebLifecycleState) rather than faking visibility, because a fake
 * cannot stop rAF and would pass on the bug.
 *
 * PROVE-RED: restore the single `requestAnimationFrame(() => root.classList
 * .add(cls))` in revealWhenReady and every RESUME row fails at eff=0 while the
 * baseline row stays green.
 *
 * Usage: node tests/freeze-reveal-audit.mjs
 */

import { boot, seed, sleep, serveTree } from './godmode.js';
const srv = await serveTree(process.cwd());
const { browser, page } = await boot(srv.url, { headless: process.env.HEADLESS_MODE || 'shell' });
const client = await page.createCDPSession();
await seed(page, { level: 12 });
await sleep(1200);
const fails = [];
const ok = (n, p, d = '') => { console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${d ? '  ' + d : ''}`); if (!p) fails.push(n); };
const look = async l => {
  const s = await page.evaluate(() => {
    const sc = document.getElementById('screen');
    let o = 1, n = sc; while (n && n.nodeType === 1) { o *= parseFloat(getComputedStyle(n).opacity); n = n.parentElement; }
    return { cls: sc ? sc.className : null, eff: +o.toFixed(2), kids: sc ? sc.children.length : -1,
      chars: (sc?.innerText || '').replace(/\s+/g, ' ').trim().length, hash: location.hash };
  });
  return s;
};
const base = await look('baseline');
ok('BASELINE the app is visible before any freeze (an invisible baseline proves nothing)',
  base.eff > 0.9 && base.kids > 0 && base.chars > 100, JSON.stringify(base));

/* CONTROL. Page.setWebLifecycleState is deliberately wrapped in a catch below,
   because a Chrome that does not support it must not crash the run. The price is
   that on such a Chrome NOTHING EVER FREEZES: every RESUME and CRATE row passes
   without the bug once being reproduced, and this file reports green having
   tested nothing at all. That is the same shape as grading a set that cannot
   contain the bug. So prove the freeze itself, once, by counting timer ticks
   across one: a live page fires about forty in two seconds, a frozen one fires
   none. */
await page.evaluate(() => { window.__fz = 0; setInterval(() => { window.__fz++; }, 50); });
await sleep(300);
const fz0 = await page.evaluate(() => window.__fz);
try {
  await client.send('Page.setWebLifecycleState', { state: 'frozen' });
  await sleep(2000);
  await client.send('Page.setWebLifecycleState', { state: 'active' });
} catch (e) { console.log('  (lifecycle unsupported:', String(e).slice(0, 60), ')'); }
/* Read it on the same turn as the resume, with no sleep in between: a resumed
   interval catches up on its backlog, and 300ms of catch-up alone takes a real
   freeze from 1-2 ticks to 7-8. Measured on this machine, three trials each:
   frozen 2,1,1 against a no-op 40,40,40. The edge sits at 10. */
const fz1 = await page.evaluate(() => window.__fz);
ok('CONTROL the freeze really stops the page (a freeze that no-ops passes every row below)',
  fz1 - fz0 < 10, `${fz1 - fz0} timer ticks across a 2s freeze: measured 1-2 frozen, 40 if it never stopped`);

for (const delayMs of [0, 30, 120]) {
  // start a route, then freeze the page delayMs later: the reveal is in flight
  await page.evaluate(() => { location.hash = '#/trends'; });
  await sleep(400);
  await page.evaluate(() => { location.hash = '#/today'; });
  await sleep(600);
  await page.evaluate(d => { location.hash = '#/friends'; return new Promise(r => setTimeout(r, d)); }, delayMs);
  try {
    await client.send('Page.setWebLifecycleState', { state: 'frozen' });
    await sleep(2500);
    await client.send('Page.setWebLifecycleState', { state: 'active' });
  } catch (e) { console.log('  (lifecycle unsupported:', String(e).slice(0, 60), ')'); }
  await sleep(2500);
  const s = await look('resumed');
  ok(`RESUME visible again after a freeze ${delayMs}ms into a route`,
    s.eff > 0.9 && s.kids > 0, `screen-in=${s.cls?.includes('screen-in')} eff=${s.eff} kids=${s.kids} chars=${s.chars}`);
  ok(`RESUME the screen still has its content after a freeze ${delayMs}ms in (empty is a FAILURE)`,
    s.chars > 100, `${s.chars} chars`);
}

/* ---- THE SAME SHAPE, FOUND BY SWEEPING FOR IT (A2) ----
   `.pc-rise` is `visibility: hidden` until `.pack-deck.go` arrives, and that
   class was added inside a DOUBLE requestAnimationFrame. A crate reveal is
   exactly when a player switches away, so it is the worst place in the app to
   depend on a frame arriving. */
for (const delayMs of [0, 40]) {
  await page.evaluate(() => { document.querySelectorAll('#sheets > div').forEach(d => d.remove()); });
  await page.evaluate(d => {
    window.__packReveal([{ iconHtml: '<b>a</b>', name: 'Card A', rarity: 'rare', kind: 'GEAR', stats: 'x' }], { coins: 5 });
    return new Promise(r => setTimeout(r, d));
  }, delayMs);
  try {
    await client.send('Page.setWebLifecycleState', { state: 'frozen' });
    await sleep(2200);
    await client.send('Page.setWebLifecycleState', { state: 'active' });
  } catch { /* lifecycle unsupported: the rows below will say so by failing */ }
  await sleep(3000);
  const c = await page.evaluate(() => {
    const deck = document.querySelector('.pack-deck');
    const cards = [...document.querySelectorAll('.pc-rise')];
    return { go: deck ? deck.classList.contains('go') : null, cards: cards.length,
      visible: cards.filter(x => getComputedStyle(x).visibility === 'visible').length };
  });
  ok(`CRATE the reveal drew cards at all after a freeze ${delayMs}ms in (zero cards proves nothing)`,
    c.cards > 0, JSON.stringify(c));
  ok(`CRATE the cards are VISIBLE after a freeze ${delayMs}ms into the reveal`,
    c.cards > 0 && c.visible === c.cards, JSON.stringify(c));
}

await browser.close(); srv.close?.();
console.log(fails.length ? `\n${fails.length} FAILED: ${fails.join(', ')}` : '\nthe app survives being backgrounded');
process.exit(fails.length ? 1 : 0);
