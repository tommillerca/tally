import assert from 'node:assert/strict';
import { boot, sleep, setWidth } from './godmode.js';
const { browser, page } = await boot(process.argv[2] || process.env.URL, { headless: 'shell' });
try {
  await setWidth(page, 390, 844);
  let counts;
  try {
    await page.evaluate(async () => {
      const { grantCosmetic } = await import('./js/loot.js');
      const { BH_ITEMS } = await import('./data/boneheadz.js');
      for (const id of ['H10-1', 'H10-2', 'H10-3', BH_ITEMS.find(i => i.slot === 'S').id]) await grantCosmetic(id, 'audit');
      location.hash = '#/bonehead';
    });
    await page.waitForSelector('[data-pd="H"]');
    await sleep(800);
    counts = await page.evaluate(() => ({ slots: document.querySelectorAll('[data-pd]').length,
      sections: document.querySelectorAll('[data-slot-heading]').length }));
  } catch (error) {
    console.log('CONTROL UNPROVEN: fixture failed:', error.message);
    process.exitCode = 97;
  }
  console.log('CONTROL', counts ?? 'fixture unavailable');
  if (!(counts?.slots >= 4 && counts?.sections >= 2)) {
    console.log('CONTROL UNPROVEN: cannot build slots and item sections fixture');
    process.exitCode = 97;
  } else {
    await page.evaluate(() => {
      const scroller = document.querySelector('.screen');
      const original = scroller.scrollTo.bind(scroller);
      window.wardrobeScrollCalls = [];
      scroller.scrollTo = (...args) => {
        window.wardrobeScrollCalls.push(args[0]?.behavior);
        return original(...args);
      };
    });
    const rects = selector => page.evaluate(selector => {
      const r = document.querySelector(selector).getBoundingClientRect();
      const screen = document.querySelector('.screen').getBoundingClientRect();
      const headers = [...document.querySelectorAll('header, .ch-tabs')].map(n => {
        const r = n.getBoundingClientRect();
        return { top: r.top, bottom: r.bottom, position: getComputedStyle(n).position };
      });
      const top = Math.max(screen.top, ...headers.filter(r => ['sticky', 'fixed'].includes(r.position) && r.top <= screen.top + 1).map(r => r.bottom));
      return { top: r.top, bottom: r.bottom, boundary: top, viewport: Math.min(screen.bottom, innerHeight), headers };
    }, selector);
    for (const reduce of [false, true]) {
      await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: reduce ? 'reduce' : 'no-preference' }]);
      await page.evaluate(() => { window.wardrobeScrollCalls = []; });
      const before = await rects('[data-slot-heading="H"]');
      await page.click('[data-pd="H"]');
      await sleep(900);
      const heading = await rects('[data-slot-heading="H"]');
      assert.ok(heading.top >= heading.boundary && heading.bottom <= heading.viewport, `SCROLL ${JSON.stringify(heading)}`);
      assert.ok(Math.abs(before.top - heading.top) > 10, 'SCROLL moves the heading');
      console.log(reduce ? 'REDUCED heading' : 'SCROLL', heading);
      // Dispatch the second tap without Puppeteer's automatic pre-click scrolling.
      await page.evaluate(() => document.querySelector('[data-pd="H"]').click());
      await sleep(900);
      const doll = await rects('.paperdoll');
      assert.ok(doll.top >= doll.boundary && doll.bottom <= doll.viewport, `RETURN ${JSON.stringify(doll)}`);
      console.log('RETURN', doll);
      if (reduce) {
        const calls = await page.evaluate(() => window.wardrobeScrollCalls);
        assert.ok(calls.length >= 2 && calls.every(value => value === 'instant'), `REDUCED instant jumps: ${JSON.stringify(calls)}`);
        const running = await page.evaluate(() => document.querySelector('#chBody').getAnimations({ subtree: true }).filter(a => a.playState === 'running').length);
        assert.equal(running, 0, 'REDUCED no running animations');
        console.log('REDUCED no running animations');
      }
    }
  }
} finally { await browser.close(); }
