// Separate browser guard: lab-room2 and stable-rooms-top execute Node models,
// so neither can prove decoded art, rendered height, or clipping.
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {boot, sleep, serveTree, unproven, exitFor} from './godmode.js';
import {declareAudit, recordAuditRow, completeAudit} from './audit-lifecycle.mjs';
declareAudit({expectedRows:13});
const root = fileURLToPath(new URL('../', import.meta.url));
let failures = 0;
const completed = new Set();
function check(row, pass, detail) {
  console.log(`${pass ? 'PASS' : 'FAIL'} ${row}: ${detail}`);
  recordAuditRow(row, pass ? 'PASS' : 'FAIL');
  completed.add(row);
  if (!pass) failures++;
}
const source = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
// Verified with git log b13e7fd2..main and per-symbol git log -S:
// d29682d1 (v570): recoverInterruptedPitFight.
// 7dcd8c18 (v571): leaderboardLastOnline.
// 6041ef56 (v571): fanPaintRevision.
// Full provenance and removal inventory: docs/v578/room-headers-commit-message.txt.
for (const symbol of ['recoverInterruptedPitFight', 'leaderboardLastOnline', 'fanPaintRevision']) {
  check('NO-REVERT', new RegExp(`\\b${symbol}\\b`).test(source), symbol);
}
// 340/812 is under 42%: reserve over 58% of the viewport for room content.
const scaleHeightBound = 340;
const proveRed = process.argv.includes('--prove-red');
console.log(`SCALE budget: ${scaleHeightBound}px at root 53px, viewport 375x812; leaves over 58% for room content. Mode: ${proveRed ? 'prove-red (round-2 typography)' : 'current CSS'}`);
const arg = process.argv.slice(2).find(a => !a.startsWith('--')) || process.env.URL;
let server, browser;
try {
  server = arg ? null : await serveTree(root);
  const base = arg || server.url;
  console.log(`Serving/grading ${base}; source root ${root}`);
  const session = await boot(base);
  browser = session.browser;
  const {page} = session;
  await page.setViewport({width:375, height:812, deviceScaleFactor:2, isMobile:true, hasTouch:true});
  await page.evaluate(() => { location.hash = '#/today'; });
  await sleep(1800);
  for (const room of ['kitchen', 'lab']) {
    for (let i = 0; i < 6 && await page.$('#sheets .sheet'); i++) {
      await page.evaluate(() => history.back());
      await sleep(400);
    }
    await page.evaluate(() => { document.querySelectorAll('style[data-room-prove-red]').forEach(el => el.remove()); document.documentElement.style.fontSize = '16px'; });
    const door = room === 'kitchen' ? '#kitchenActBtn' : '#stableBtn';
    await page.waitForSelector(door, {timeout:15000});
    await page.click(door);
    if (room === 'lab') {
      await page.waitForSelector('#stableBody [data-lab-open]', {timeout:15000});
      await page.click('#stableBody [data-lab-open]');
    }
    const bodyId = room === 'lab' ? 'labBody' : 'kitchenBody';
    await page.waitForFunction(id => document.getElementById(id)?.querySelectorAll('*').length > 5, {timeout:15000}, bodyId);
    await sleep(700);
    const originalTitle = await page.$eval(`.bh-room-${room} .bh-room-title`, el => el.textContent);
    for (const [size, copy] of [[16, originalTitle], [53, originalTitle], [53, 'THE EXPERIMENTAL LABORATORY']]) {
      const extended = copy !== originalTitle;
      await page.$eval(`.bh-room-${room} .bh-room-title`, (el, text) => { el.textContent = text; }, copy);
      // Recreate the frozen round-2 defect without mutating source files.
      if (proveRed && size === 53) await page.evaluate(() => {
        const style = document.createElement('style');
        style.dataset.roomProveRed = '';
        style.textContent = '.bh-room-header .bh-room-title { --fs-room-title: 2.25rem; line-height: 1; }';
        document.head.append(style);
      });
      // No app-defined upper bound: 53px is an explicit stress case, not a
      // claim that Chromium emulates the native Dynamic Type setting.
      await page.evaluate(size => { document.documentElement.style.fontSize = `${size}px`; }, size);
      await page.evaluate(() => document.fonts.ready);
      const m = await page.evaluate(async ({room, bodyId}) => {
        const body = document.getElementById(bodyId);
        const header = body?.closest('.sheet')?.querySelector(`.bh-room-${room}`);
        const images = [...(header?.querySelectorAll('img') || [])];
        await Promise.all(images.map(img => img.decode().catch(() => {})));
        const bounds = header?.getBoundingClientRect();
        const inside = (a,b) => a.left >= b.left - 1 && a.top >= b.top - 1 && a.right <= b.right + 1 && a.bottom <= b.bottom + 1;
        const unclipped = images.length === 4 && images.every(img => {
          const rect = img.getBoundingClientRect();
          if (!bounds || rect.width <= 0 || rect.height <= 0 || !inside(rect,bounds)) return false;
          for (let p = img.parentElement; p && p !== header.parentElement; p = p.parentElement) {
            const css = getComputedStyle(p);
            if (/(hidden|clip)/.test(css.overflowX + css.overflowY) && !inside(rect,p.getBoundingClientRect())) return false;
          }
          return true;
        });
        const title = header?.querySelector('.bh-room-title');
        const range = document.createRange();
        if (title) range.selectNodeContents(title);
        const textFits = !!title && title.scrollWidth <= title.clientWidth + 1 && title.scrollHeight <= title.clientHeight + 1 && [...range.getClientRects()].every(r => inside(r, title.getBoundingClientRect()) && inside(r,bounds));
        return {count:body?.querySelectorAll('*').length || 0, rendered:!!body && body.getBoundingClientRect().width > 0 && body.getBoundingClientRect().height > 0 && getComputedStyle(body).visibility === 'visible', height:bounds?.height || 0,
          art:images.map(img => ({decoded:img.complete && img.naturalWidth > 0 && img.naturalHeight > 0 && img.getBoundingClientRect().width > 0 && img.getBoundingClientRect().height > 0 && getComputedStyle(img).visibility === 'visible', width:img.naturalWidth, height:img.naturalHeight})), unclipped,textFits,
          titleSize: title ? parseFloat(getComputedStyle(title).fontSize) : 0,
          rootSize: parseFloat(getComputedStyle(document.documentElement).fontSize)};
      }, {room, bodyId});
      if (size === 16) {
        check(`CONTROL ${room}`, m.rendered && m.count > 5, `${m.count} screen elements; rendered=${m.rendered}`);
        check(`HEADER ${room}`, Math.abs(m.height - 144) <= 2, `${m.height}px (expected 144 +/- 2)`);
        check(`ART ${room}`, m.art.length === 4 && m.art.every(i => i.decoded), JSON.stringify(m.art));
      } else check(`${extended ? 'COPY' : 'SCALE'} ${room}`,
        m.height <= scaleHeightBound && m.unclipped && m.textFits && m.titleSize >= m.rootSize,
        `root ${size}px; height ${m.height}px; bound ${scaleHeightBound}px (leaves over 58% of 812px for room content); title ${m.titleSize}px >= body ${m.rootSize}px; art unclipped=${m.unclipped}; text fits=${m.textFits}; copy=${JSON.stringify(copy)}`);
    }
  }
} catch (error) {
  if (/EPERM|EACCES|Could not find Chrome|Failed to launch/.test(String(error))) {
    for (const room of ['kitchen', 'lab']) for (const row of ['CONTROL', 'HEADER', 'ART', 'SCALE', 'COPY']) {
      const name = `${row} ${room}`;
      if (!completed.has(name)) {
        unproven(name, String(error));
        recordAuditRow(name, 'UNPROVEN');
      }
    }
  } else check('SETUP', false, error.stack || String(error));
} finally {
  await browser?.close();
  await server?.close();
}
console.log(`room headers: ${failures} failures`);
completeAudit();
process.exitCode = exitFor(failures);
