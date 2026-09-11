import assert from 'node:assert/strict';
import { boot, sleep, setWidth, serveTree } from './godmode.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
/* SERVE THIS TREE, NOT PRODUCTION. boot() with no base defaults to the live
   site, so a lane's audit would have graded whatever is deployed and reported
   green while proving nothing about the code under it. Caught 2026-09-11 by
   submission-preflight-audit's COVERAGE row, not by reading the file. */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const base = process.argv[2] || process.env.URL || null;
const srv = base ? null : await serveTree(ROOT);
const { browser, page } = await boot(base || srv.url, { headless: 'shell' });
try {
  await setWidth(page, 390, 844);
  await page.evaluate(async () => {
    const { grantCosmetic } = await import('./js/loot.js');
    const { BH_ITEMS } = await import('./data/boneheadz.js');
    for (const id of ['H10-1', 'H10-2', 'H10-3', BH_ITEMS.find(i => i.slot === 'S').id]) await grantCosmetic(id, 'audit');
    location.hash = '#/bonehead';
  });
  await page.waitForSelector('[data-pd="H"]');
  await sleep(800);
  const counts = await page.evaluate(() => ({ slots: document.querySelectorAll('[data-pd]').length,
    sections: document.querySelectorAll('[data-slot-heading]').length }));
  console.log('CONTROL', counts);
  assert.ok(counts.slots >= 4 && counts.sections >= 2, 'CONTROL slots and item sections');
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
} finally { await browser.close(); if (srv) srv.close(); }
