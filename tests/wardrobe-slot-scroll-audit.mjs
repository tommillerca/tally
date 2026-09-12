import assert from 'node:assert/strict';
import { boot, sleep, setWidth, serveTree } from './godmode.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
/* SERVE THIS TREE WHEN NO URL IS GIVEN. boot(undefined) defaults to the LIVE
   site, so a bare `node tests/<this>.mjs` would grade production and report
   green while proving nothing about the code under it. Flagged twice in one
   day by submission-preflight-audit's COVERAGE row. */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const base = process.argv[2] || process.env.URL || null;
const srv = base ? null : await serveTree(ROOT);
const { browser, page } = await boot(base || srv.url, { headless: 'shell' });
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
  /* ONE section, not two. This required two item sections, which only ever
     existed because the wardrobe listed every OTHER slot underneath the open
     one. Tom removed that overview in v586 ("youre trying to do too much"), so
     the picker now renders exactly one section: the slot you tapped. Requiring
     two made this guard demand the layout he rejected and report UNPROVEN on
     the corrected one. What it grades is unchanged: tapping a slot scrolls its
     heading into view and tapping again returns to the paperdoll. */
  if (!(counts?.slots >= 4 && counts?.sections >= 1)) {
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
} finally { await browser.close(); if (srv) srv.close(); }
