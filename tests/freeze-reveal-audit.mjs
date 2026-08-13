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
await browser.close(); srv.close?.();
console.log(fails.length ? `\n${fails.length} FAILED: ${fails.join(', ')}` : '\nthe app survives being backgrounded');
process.exit(fails.length ? 1 : 0);
