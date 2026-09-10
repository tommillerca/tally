// Operator-owned BROWSER proof. No listener or browser launch.
// Usage: CREW_CAPTURE_CDP=http://127.0.0.1:9222 CREW_CAPTURE_URL='http://127.0.0.1:PORT/?demo' node tests/crew-order-browser-audit.mjs
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { runCrewGuard } from './lib/crew-browser-runner.mjs';
import { prepareCrew, settleCrew, assertDemoPage } from './lib/crew-capture.mjs';
import { auditOutputPath } from './lib/audit-output.mjs';

// Reuse the established runner's operator connection, local-demo refusal and
// rendered controls, then use its capture harness for the additional order proof.
const target = process.argv[2] || process.env.CREW_CAPTURE_URL;
if (target) process.env.CREW_CAPTURE_URL = target;
if (!process.env.CREW_CAPTURE_CDP || !target) {
  console.error('BLOCKED: rendered Crew order and screenshots require an operator browser. Set CREW_CAPTURE_CDP and CREW_CAPTURE_URL, then run node tests/crew-order-browser-audit.mjs. Sandbox listener restriction: listen EPERM.');
  process.exitCode = 97;
} else {
  await runCrewGuard('icons');
  assert.ok(!process.exitCode, 'CONTROL established Crew browser runner must pass');
  const { default: puppeteer } = await import('puppeteer');
  const endpoint = process.env.CREW_CAPTURE_CDP;
  const browser = await puppeteer.connect(endpoint.startsWith('ws') ? { browserWSEndpoint: endpoint } : { browserURL: endpoint });
  try {
    const pages = (await browser.pages()).filter(p => p.url() === target);
    assert.equal(pages.length, 1, 'CONTROL exactly one operator-selected page');
    const page = pages[0], originalViewport = page.viewport();
    const out = auditOutputPath(resolve(process.env.CREW_CAPTURE_OUTPUT || resolve(tmpdir(), 'crew-capture-browser')));
    mkdirSync(auditOutputPath(out), { recursive: true });
    try {
      for (const width of [390, 430]) {
        await page.setViewport({ width, height: 844, deviceScaleFactor: 2 });
        await prepareCrew(page);
        await page.evaluate(assertDemoPage);
        // Seed the named disposable demo database only. prepareCrew keeps API
        // requests blocked and leaves this sealed envelope intact on re-entry.
        await page.evaluate(async () => {
          const db = await new Promise((resolve, reject) => {
            const r = indexedDB.open('tally-demo'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
          });
          try {
            await new Promise((resolve, reject) => {
              const tx = db.transaction('kv', 'readwrite');
              tx.objectStore('kv').put({ k: 'giftbox', v: [{ key: 'crew-order-proof', type: 'gift', ts: Date.now(), payload: { coins: 10, note: 'Capture Friend sent you a gift!' } }] });
              tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error || new Error('Gift seed aborted'));
            });
          } finally { db.close(); }
        });
        await prepareCrew(page);
        await page.waitForSelector('#giftTopCard:not([hidden]) [data-gift="crew-order-proof"]');
        await page.evaluate(() => document.querySelector('.cfan-block').scrollIntoView({ block: 'start', behavior: 'instant' }));
        await settleCrew(page);
        const measure = () => page.evaluate(() => {
          const sample = selector => {
            const el = document.querySelector(selector);
            if (!el) return null;
            const r = el.getBoundingClientRect();
            let visible = true;
            for (let n = el; n; n = n.parentElement) {
              const s = getComputedStyle(n);
              if (s.display === 'none' || s.visibility !== 'visible' || Number(s.opacity) === 0) visible = false;
            }
            return { top: r.top, bottom: r.bottom, width: r.width, height: r.height, visible };
          };
          return { fan: sample('.cfan-block'), gift: sample('#giftTopCard'), head: sample('.cfan-card.feat'),
            notifications: ['#giftTopCard', '#cheersCard', '#deliveriesCard'].map(sample).filter(x => x?.visible && x.height > 0) };
        });
        const check = m => {
          for (const key of ['fan', 'gift', 'head']) {
            assert.ok(m[key]?.visible && m[key].width > 0 && m[key].height > 0, `CONTROL ${key} rendered`);
          }
          assert.ok(m.notifications.length > 0, 'CONTROL notification sample is nonempty');
          for (const n of m.notifications) assert.ok(m.fan.bottom <= n.top + 1, 'Fan renders before notifications without overlap');
        };
        const m = await measure(); check(m);
        writeFileSync(auditOutputPath(resolve(out, `crew-order-${width}.json`)), JSON.stringify(m, null, 2) + '\n');
        await page.screenshot({ path: auditOutputPath(resolve(out, `crew-order-${width}.png`)), fullPage: true });
        // CONTROL reproduce the old placement in the live DOM, measure again,
        // and require the geometry assertion to fail. No source-order grading.
        await page.evaluate(() => {
          const fan = document.querySelector('.cfan-block');
          fan.before(document.querySelector('#giftTopCard'));
        });
        try { const bad = await measure(); assert.throws(() => check(bad), 'CONTROL gift above fan must fail'); }
        finally { await page.evaluate(() => document.querySelector('.cfan-block').after(document.querySelector('#giftTopCard'))); }
        const gift = await page.$('#giftTopCard [data-gift="crew-order-proof"]');
        await gift.evaluate(el => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
        await settleCrew(page);
        assert.ok(await gift.evaluate(el => {
          const r = el.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
          return y >= 0 && y < innerHeight && el.contains(document.elementFromPoint(x, y)) && !el.disabled;
        }), 'CONTROL gift OPEN remains reachable by scrolling');
        await page.screenshot({ path: auditOutputPath(resolve(out, `crew-gift-${width}.png`)) });
        console.log(`PASS rendered Crew order and reachable gift at ${width}px`);
      }
    } finally { if (originalViewport) await page.setViewport(originalViewport); }
  } finally { browser.disconnect(); }
}
