// UNRUN in the R47 implementation sandbox. Requires an externally served checkout.
// This drives real controls and DOM. It simulates poll delivery and a cold splash;
// a real cold launch, map fight and two-page IndexedDB proof remain review tasks.
import assert from 'node:assert/strict';
import { boot, sleep, dismissOverlays } from '../tests/godmode.js';
const base = process.argv[2];
if (!base || !['localhost', '127.0.0.1', '[::1]'].includes(new URL(base).hostname)) {
  throw new Error('Pass the locally served checkout URL; this audit never targets production.');
}
const { browser, page } = await boot(base);
async function hitClick(selector) {
  await page.waitForSelector(selector, { visible: true, timeout: 10000 });
  assert.ok(await page.$eval(selector, el => {
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return r.width > 0 && r.height > 0 && (hit === el || el.contains(hit));
  }), `Covered control: ${selector}`);
  await page.click(selector);
}
try {
  await page.evaluate(async () => {
    const d = await import('./js/db.js');
    const s = await import('./js/social.js');
    history.replaceState({}, '', '?demo&api=' + encodeURIComponent(location.origin + '/r47-api'));
    await s.initFromQuery();
    const keys = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    await d.kvSet('identity', { privJwk: await crypto.subtle.exportKey('jwk', keys.privateKey), pubJwk: await crypto.subtle.exportKey('jwk', keys.publicKey) });
    await d.kvSet('social', { playerId: 'r47-browser', onlineAt: Date.now() });
    const now = Date.now();
    window.__r47Rows = [{ id: 'sp-1-1', name: 'Audit Tower', level: 6, claimedAt: now - 2 * 86400000, tendedAt: now, siegeUntil: now + 48 * 3600000, siegeName: 'Audit Siege' }];
    const fetchReal = window.fetch.bind(window);
    window.fetch = (url, opts) => {
      if (!String(url).includes('/r47-api/')) return fetchReal(url, opts);
      const body = String(url).includes('/spires/mine') ? { spires: window.__r47Rows, serverNow: Date.now() } : { grants: [], cursor: 0 };
      return Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    };
    window.__siegeForce = true;
    await window.__checkSieges();
  });
  for (const tab of ['today', 'bonehead', 'friends', 'boneyard']) {
    await dismissOverlays(page);
    await hitClick(`#tabbar [data-tab="${tab}"]`);
    await page.waitForFunction(() => /siege/i.test(document.querySelector('#activeSiegeBanner')?.innerText || ''));
    await hitClick('#activeSiegeBanner summary');
    assert.ok(await page.$eval('#activeSiegeBanner details', el => el.open));
    await hitClick('#activeSiegeBanner summary');
    console.log(`PASS siege visible and expandable on ${tab}`);
  }
  await hitClick('#activeSiegeBanner summary');
  await hitClick('#activeSiegeBanner #spireToMap');
  assert.ok((await page.url()).includes('#/boneyard'));
  console.log('PASS siege CTA opens Boneyard');
  await dismissOverlays(page);
  await page.evaluate(async () => {
    const s = await import('./js/social.js');
    await s.__testApplyGrant({ key: 'r47-cold-notice', type: 'spire', payload: { note: 'The rival took Audit Tower.' }, ts: Date.now() });
    const splash = document.createElement('div'); splash.id = 'splash'; document.body.append(splash);
    void window.__presentGrantDelivery(null);
  });
  await sleep(500);
  assert.equal(await page.$('.reveal-take'), null, 'delivery opened under splash');
  await page.evaluate(() => document.querySelector('#splash').remove());
  await page.waitForSelector('.reveal-take', { visible: true, timeout: 10000 });
  assert.ok(await page.$eval('.reveal-take', el => /Spire Lost|rival took/i.test(el.innerText)));
  await hitClick('#packFoot');
  await page.waitForFunction(async () => (await (await import('./js/social.js')).pendingGrantDelivery()).applied === 0);
  console.log('PASS retained cold notice presents and acknowledges after close');
  console.log('6 passed, 0 failed');
} finally { await browser.close(); }
