// Rendered geometry only. A failed boot is NOT a proven RED regression.
// HEADLESS_MODE=shell node tests/boneyard-scroll-audit.mjs
// --control restores the original clipping rules in the browser, without edits.
// --label=before captures the unmodified checkout with the same assertions.
// Screenshots go outside the checkout. Copy reviewed evidence into docs/.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { boot, serveTree, shotDir } from './godmode.js';
import { auditOutputPath } from './lib/audit-output.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const control = process.argv.includes('--control');
const label = process.argv.find(a => a.startsWith('--label='))?.slice(8) || (control ? 'control' : 'after');
assert.match(label, /^[a-z0-9-]+$/, 'safe evidence label');
const out = shotDir('boneyard-scroll');
let server, browser;
const results = [];
try {
  server = await serveTree(root);
  const session = await boot(server.url);
  browser = session.browser;
  const { page, errors } = session;
  // Expose the real module functions in this disposable test page only.
  // Re-render assertions must drive refresh(), not a DOM reconstruction.
  const app = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
  await page.setRequestInterception(true);
  page.on('request', req => {
    if (new URL(req.url()).pathname === '/js/app.js') {
      req.respond({ status: 200, contentType: 'text/javascript', body: app +
        '\nif (navigator.webdriver) window.__boneyardScrollProof = { refresh, route };\n' });
    } else req.continue();
  });
  await page.reload({ waitUntil: 'networkidle2' });
  await page.waitForFunction(() => window.__boneyardScrollProof);
  if (control) await page.addStyleTag({ content: `
    .screen.screen--map { overflow: hidden; }
    .sheet-body.map-sheet { flex: 1; overflow: hidden; }
  ` });
  await page.click('#tabbar [data-tab="boneyard"]');
  await page.waitForSelector('#mapStart');

  for (const [width, height] of [[393, 852], [430, 932]]) {
    await page.setViewport({ width, height, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    for (const scale of [1, 1.5]) {
      await page.evaluate(async scale => {
        document.documentElement.style.fontSize = `${16 * scale}px`;
        await window.__boneyardScrollProof.route();
        await document.fonts.ready;
      }, scale);
      await page.waitForSelector('#mapStart');
      await page.waitForFunction(() => document.querySelector('#screen').classList.contains('screen-in') && !document.querySelector('.screen-held'));
      await page.evaluate(async () => {
        await Promise.all([...document.querySelectorAll('#mapIntro img')].map(img => img.decode().catch(() => {})));
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      });
      const stem = `${label}-${width}x${height}-${scale * 100}`;
      await page.screenshot({ path: auditOutputPath(path.join(out, `${stem}-top.png`)) });
      const measured = await page.evaluate(async () => {
        const sc = document.querySelector('#screen'), intro = document.querySelector('#mapIntro');
        const dock = document.querySelector('#tabbar'), fab = document.querySelector('.fab');
        const rect = el => {
          const r = el.getBoundingClientRect();
          return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, height: r.height, width: r.width };
        };
        const scrollable = /^(auto|scroll)$/.test(getComputedStyle(sc).overflowY);
        const controls = [...intro.querySelectorAll('button, a[href], input, select, textarea')];
        const initial = controls.map(el => ({ id: el.id, name: el.textContent.trim(), rect: rect(el) }));
        const best = controls.map(() => 0), tapped = controls.map(() => false), spans = [];
        const max = sc.scrollHeight - sc.clientHeight;
        const positions = [0];
        if (scrollable) {
          for (let y = sc.clientHeight * .75; y < max; y += sc.clientHeight * .75) positions.push(y);
          positions.push(max);
        }
        let initialClip;
        for (const y of positions) {
          sc.scrollTop = y;
          await new Promise(resolve => requestAnimationFrame(resolve));
          const clip = { top: 0, bottom: Math.min(innerHeight, rect(dock).top), left: 0, right: innerWidth };
          // Every clipping ancestor matters, even if #screen itself can scroll.
          for (let el = intro.parentElement; el; el = el.parentElement) {
            const style = getComputedStyle(el), box = rect(el);
            if (/^(auto|scroll|hidden|clip)$/.test(style.overflowY)) {
              clip.top = Math.max(clip.top, box.top + el.clientTop);
              clip.bottom = Math.min(clip.bottom, box.top + el.clientTop + el.clientHeight);
            }
            if (/^(auto|scroll|hidden|clip)$/.test(style.overflowX)) {
              clip.left = Math.max(clip.left, box.left + el.clientLeft);
              clip.right = Math.min(clip.right, box.left + el.clientLeft + el.clientWidth);
            }
          }
          if (y === 0) initialClip = { ...clip };
          const r = rect(intro);
          const start = Math.max(0, clip.top - r.top), end = Math.min(r.height, clip.bottom - r.top);
          if (end > start) spans.push([start, end]);
          controls.forEach((el, i) => {
            const b = rect(el);
            const visible = Math.max(0, Math.min(b.bottom, clip.bottom) - Math.max(b.top, clip.top)) *
              Math.max(0, Math.min(b.right, clip.right) - Math.max(b.left, clip.left));
            const fraction = visible / (b.width * b.height || 1);
            best[i] = Math.max(best[i], fraction);
            if (fraction >= .999) {
              const hit = document.elementFromPoint((b.left + b.right) / 2, (b.top + b.bottom) / 2);
              tapped[i] ||= !!hit && (hit === el || el.contains(hit));
            }
          });
        }
        spans.sort((a, b) => a[0] - b[0]);
        let covered = 0, edge = 0;
        for (const [start, end] of spans) { covered += Math.max(0, end - Math.max(edge, start)); edge = Math.max(edge, end); }
        return {
          viewport: { width: innerWidth, height: innerHeight }, rootFont: getComputedStyle(document.documentElement).fontSize,
          contentHeight: rect(intro).height, scrollportHeight: sc.clientHeight,
          screenScrollHeight: sc.scrollHeight, scrollable, maxScroll: max, achievedScroll: sc.scrollTop,
          unreachableFraction: Math.max(0, 1 - covered / rect(intro).height), initialClip,
          controls: initial.map((item, i) => ({ ...item, bestVisibleFraction: best[i], hitTest: tapped[i],
            initiallyOffscreen: item.rect.top < initialClip.top || item.rect.bottom > initialClip.bottom })),
          dockTop: rect(dock).top, screenBottom: rect(sc).bottom, fabRingTop: rect(fab).top - 4,
        };
      });
      await page.screenshot({ path: auditOutputPath(path.join(out, `${stem}-bottom.png`)) });
      const scrollContract = await page.evaluate(async () => {
        const sc = document.querySelector('#screen');
        sc.scrollTop = Math.min(120, sc.scrollHeight - sc.clientHeight);
        const before = sc.scrollTop;
        await window.__boneyardScrollProof.refresh();
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const afterRefresh = sc.scrollTop;
        await window.__boneyardScrollProof.route();
        return { before, afterRefresh, afterRoute: sc.scrollTop };
      });
      const row = { label, width, height, scale, ...measured, scrollContract };
      results.push(row);
      console.log(`MEASURE ${JSON.stringify(row)}`);
    }
  }
  writeFileSync(auditOutputPath(path.join(out, `${label}.json`)), JSON.stringify(results, null, 2) + '\n');
  // Grade after collecting every size, so a RED default does not prevent 150% evidence.
  for (const row of results) {
    const name = `${row.width}x${row.height} ${row.scale * 100}%`;
    assert.equal(row.rootFont, `${16 * row.scale}px`, `${name}: actual text scale`);
    assert.ok(row.contentHeight > 0 && row.controls.some(c => c.id === 'mapStart' && c.name === 'Open the map'), 'SETUP real intro and main button');
    assert.ok(row.unreachableFraction <= .001, `${name}: ${(100 * row.unreachableFraction).toFixed(2)}% unreachable`);
    assert.ok(row.controls.every(c => c.bestVisibleFraction >= .999 && c.hitTest), `${name}: every control is fully visible and hittable after scrolling`);
    assert.ok(row.screenBottom <= row.dockTop + 1 && row.fabRingTop >= row.screenBottom - 1, `${name}: dock/FAB exclusion`);
    assert.ok(Math.abs(row.scrollContract.before - row.scrollContract.afterRefresh) <= 1, `${name}: refresh preserves scroll`);
    assert.equal(row.scrollContract.afterRoute, 0, `${name}: route starts at top`);
    if (row.scale === 1.5) assert.ok(row.scrollContract.before > 0, `${name}: nonvacuous scroll preservation`);
    console.log(`PASS REACH ${name}: whole intro, main button, refresh, route and dock`);
  }
  assert.equal(errors.length, 0, `page errors: ${errors.join('; ')}`);
} finally {
  await browser?.close();
  server?.close();
}
