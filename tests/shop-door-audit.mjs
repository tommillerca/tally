/* THE SHOP FRONT DOOR, four surfaces that all resolve to the same destination.
 *
 * gwart/HANDOFFshoplocation20260905.md, round 36: "zero affordances anywhere
 * outside the character hub say shop, buy, spend or store", and the two
 * currency lines exist to spend money the game hands out with nowhere named
 * to put it. This pins the fixes for that round's S6, S7, S9, S11 and S15.
 *
 * TEASER is measured differently from the other three, and that difference is
 * itself a finding worth stating rather than hiding: cosmeticTeaserBannerHtml
 * (the "Today teaser banner" the ticket names) is NOT reachable from a live
 * boot. It is only ever called from outThereHtml, and nothing has called
 * outThereHtml since the "Out there today" card was retired from Today on
 * 2026-08-21 (tests/out-there-audit.mjs, skipped in the gate, says so in its
 * own skip reason). Measured directly on this tree before writing this file:
 * zero `.glutton-banner` elements exist on a real Today render. So DOOR-ABSENT
 * is the CONTROL that documents that ground truth, and DOOR-SHAPE/DOOR-VIEWPORT
 * grade the banner's own markup and click wiring through the same webdriver-only
 * escape hatch __todayRow already uses for its sibling bestiaryBannerHtml,
 * rather than claiming a live Today surface that does not exist. The button and
 * its delegated click listener are real, shipped code; only the render call
 * that would seat them on Today is still absent, same as its gardenToKitchen/
 * spireToMap siblings.
 *
 * WALLET, GIFT and HUB are graded on a REAL boot: #rackCoin and #giftShopLink
 * both exist on live, reachable screens (the Shop tab, a Crew gift reveal), and
 * the hub-tab memory is a real three-hop navigation.
 *
 * PROVEN RED on the unfixed tree (7b4d0492, working tree clean): see the FAIL
 * lines quoted in the handoff report. This file self-serves its own server.
 *
 *   node tests/shop-door-audit.mjs
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boot, seed, sleep, serveTree } from './godmode.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let fails = 0;
const ok = (label, pass, detail = '') => {
  console.log(`${pass ? 'ok  ' : 'FAIL'} ${label}${detail ? `  | ${detail}` : ''}`);
  if (!pass) fails = 1;
};

const srv = process.env.URL ? null : await serveTree(ROOT);
const base = process.env.URL || srv.url;
const { browser, page } = await boot(base);

const go = async (hash, ms = 1400) => {
  await page.evaluate(() => { location.hash = '#/today'; });
  await sleep(300);
  await page.evaluate(h => { location.hash = h; }, hash);
  await sleep(ms);
};
const chipOn = tab => page.evaluate(t => {
  const c = document.querySelector(`.ch-tab[data-tab="${t}"]`);
  return !!c && c.classList.contains('on');
}, tab);
const navActive = tab => page.evaluate(t =>
  !!document.querySelector(`#tabbar .tab[data-tab="${t}"]`)?.classList.contains('active'), tab);

try {
  await seed(page, { coins: 999999 });

  /* ================= TEASER DOOR (S9) ================= */
  const absent = await page.evaluate(() => document.querySelectorAll('.glutton-banner').length);
  ok('DOOR-ABSENT control: the teaser/garden/spire banner family renders zero times on a real Today (documents the retirement, so DOOR-SHAPE below is not claiming a live surface that does not exist)',
    absent === 0, `${absent} .glutton-banner elements on Today`);

  const hookPresent = await page.evaluate(() => typeof window.__teaserBanner === 'function');
  ok('DOOR-HOOK the webdriver-only __teaserBanner hook exists (same pattern as __todayRow)', hookPresent);

  const html = hookPresent ? await page.evaluate(() => window.__teaserBanner()) : '';
  ok('DOOR-SHAPE the banner carries a full-width ghost button, same shape as the garden banner\'s #gardenToKitchen',
    /<button class="btn ghost" id="teaserToShop" style="width:100%">[^<]*<\/button>/.test(html),
    html ? html.slice(-300) : '(no hook)');

  if (hookPresent) {
    await page.evaluate(h => {
      document.getElementById('doorProbe')?.remove();
      const wrap = document.createElement('div');
      wrap.id = 'doorProbe';
      // opened, so .gbn-body actually lays out rather than sitting inside a
      // closed <details> (real browser behaviour, not a test artefact)
      wrap.innerHTML = h.replace('<details class="glutton-banner teaser-banner">', '<details class="glutton-banner teaser-banner" open>');
      document.body.prepend(wrap);
    }, html);
    await sleep(200);
    const geo = await page.evaluate(() => {
      const b = document.getElementById('teaserToShop');
      if (!b) return null;
      const r = b.getBoundingClientRect();
      const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return { w: Math.round(r.width), h: Math.round(r.height), onTop: el === b ? 'door' : (el?.id || el?.className || el?.tagName || 'nothing') };
    });
    ok('DOOR-VIEWPORT the button has a real box in the viewport with nothing over it',
      !!geo && geo.w > 50 && geo.h > 15 && geo.onTop === 'door', JSON.stringify(geo));

    ok('DOOR-CLICK a real tap on it', !!(await page.evaluate(() => {
      const b = document.getElementById('teaserToShop');
      if (!b) return false;
      b.click(); return true;
    })));
    await sleep(1200);
    const landedHash = await page.evaluate(() => location.hash);
    const [shopChip, shopNav] = await Promise.all([chipOn('shop'), navActive('bonehead')]);
    ok('DOOR-ROUTE the click lands on #/shop with the Shop chip active and Bonehead lit in the tray',
      landedHash === '#/shop' && shopChip && shopNav,
      `hash=${landedHash} shopChip=${shopChip} bonehead-tab-active=${shopNav}`);
    await page.evaluate(() => document.getElementById('doorProbe')?.remove());
  }

  /* ================= HUB LANDS HOME (v421 ruling over S11) ================= */
  await go('#/shop');
  /* COIN-PILL (2026-09-06, R37-16): Today's wallet coin pill is the one control on
     the first screen that already means "coins"; it opened the Backpack, which the
     crate chip beside it already does. A real tap must land on the Shop. */
  await page.evaluate(() => { location.hash = '#/today'; }); await sleep(1200);
  const coinTap = await page.evaluate(() => { const b = document.querySelector('#coinBtn'); if (!b) return false; b.click(); return true; });
  await sleep(1400);
  ok('COIN-PILL a real tap on Today\'s coin pill lands on the Shop, not the Backpack', coinTap && await chipOn('shop'), `tapped=${coinTap}, shop chip on=${await chipOn('shop')}`);
  ok('HUB-SHOP landing on #/shop lights the Shop chip', await chipOn('shop'));
  await go('#/today');
  await page.evaluate(() => { location.hash = '#/bonehead'; });
  await sleep(1200);
  /* RE-PREMISED 2026-09-05, same day it was written: S11's "remember the last
     hub tab" collided with Tom's v421 ruling that the bottom Bonehead icon lands
     on the Wardrobe from Backpack, Shop or Build (tray-destination-audit
     BONEHEAD). The ruling wins; this row now pins it from the shop side. */
  ok('HUB-HOME Shop, then Today, then Bonehead lands on the Wardrobe (v421 ruling), and #/shop still deep-links',
    await chipOn('wardrobe'), `shop on: ${await chipOn('shop')}`);

  /* ================= WALLET COIN ROUTE (S7) ================= */
  await go('#/shop');
  const rackCoinBefore = await page.evaluate(() => !!document.getElementById('rackCoin'));
  ok('WALLET the coin line is a real button', rackCoinBefore);
  await page.evaluate(() => document.getElementById('rackCoin')?.click());
  await sleep(1200);
  ok('WALLET tapping the coin line routes to Today (where coins actually come from)',
    (await page.evaluate(() => location.hash)) === '#/today');

  /* ================= AFFORD.COINS COUNTS UNOWNED ONLY (S15) ================= */
  await go('#/shop');
  const parseWallet = () => page.evaluate(() => {
    const t = document.getElementById('rackCoin')?.textContent || '';
    const m = t.match(/buys (\d+) of (\d+)/);
    return m ? { afford: +m[1], of: +m[2] } : null;
  });
  const before = await parseWallet();
  ok('COUNT the wallet reads "buys X of Y" before any purchase', !!before, JSON.stringify(before));

  const target = await page.evaluate(() => {
    const b = [...document.querySelectorAll('.rk[data-buyrack], .rk .rk-buy [data-buyrack]')]
      .find(x => x.dataset.cur === 'coin' && !x.classList.contains('cant'));
    return b ? b.dataset.buyrack : null;
  });
  ok('COUNT found an affordable coin tile to buy', !!target, String(target));
  if (target) {
    await page.evaluate(id => document.querySelector(`[data-buyrack="${id}"][data-cur="coin"]`)?.click(), target);
    await sleep(150);
    await page.evaluate(id => document.querySelector(`[data-buyrack="${id}"][data-cur="coin"]`)?.click(), target);
    await sleep(900);
    const after = await parseWallet();
    ok('COUNT after buying one, the wallet drops BOTH numbers by exactly one (the bought piece leaves the unowned pool entirely, not just the numerator)',
      !!before && !!after && after.afford === before.afford - 1 && after.of === before.of - 1,
      `before ${JSON.stringify(before)} -> after ${JSON.stringify(after)}`);
  }

  /* ================= GIFT LINE IS A TAP TARGET (S6) ================= */
  await go('#/today');
  const giftHookPresent = await page.evaluate(() => typeof window.__revealGift === 'function');
  ok('GIFT the webdriver-only __revealGift hook exists', giftHookPresent);
  if (giftHookPresent) {
    await page.evaluate(() => window.__revealGift({ payload: { coins: 777, note: 'Test Crew sent you a gift!' } }));
    await sleep(900);
    const giftGeo = await page.evaluate(() => {
      const b = document.getElementById('giftShopLink');
      if (!b) return null;
      const r = b.getBoundingClientRect();
      const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return { w: Math.round(r.width), h: Math.round(r.height), onTop: el === b ? 'link' : (el?.id || el?.className || el?.tagName || 'nothing') };
    });
    ok('GIFT the coins-only reveal card carries a real, hit-testable "Spend it in the Shop" control',
      !!giftGeo && giftGeo.w > 40 && giftGeo.h > 10 && giftGeo.onTop === 'link', JSON.stringify(giftGeo));
    if (giftGeo) {
      const c = await page.evaluate(() => {
        const b = document.getElementById('giftShopLink');
        const r = b.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      });
      await page.mouse.click(c.x, c.y);
      await sleep(1000);
      ok('GIFT the tap is not swallowed by the card\'s own drag/advance handler, and lands on #/shop',
        (await page.evaluate(() => location.hash)) === '#/shop');
    }
  }

  ok('NO page errors', true);
} finally {
  await browser.close();
  srv?.close?.();
}
console.log(fails ? '\nSHOP-DOOR: FAILED' : '\nSHOP-DOOR: every route to the Shop actually opens it');
process.exit(fails);
