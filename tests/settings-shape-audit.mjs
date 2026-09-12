/* Settings shape guard, baseline: checkout 439a4b14 (stamped v579).
 * Expected cards from baseline renderSettings source: THE CREW, YOUR DATA,
 * NOTIFICATIONS, REDEEM A CODE, DAILY TARGETS, PREFERENCES, APPLE HEALTH, ABOUT.
 * Baseline render verification is BLOCKED by sandbox listen EPERM, so this set
 * is provisional until independently rendered. CARDS preserves this set; it
 * cannot honestly be required to fail on an unchanged baseline with that set.
 * Separate from settings-rows: this covers mobile shape, folds and card loss,
 * while settings-rows retains its 100%/200% text and action-column contract.
 */
import { boot, serveTree } from './godmode.js';
import { fileURLToPath } from 'node:url';
/* EXPECTED: the eight cards Settings rendered on v580, read off a render of
   main at 869a32d1 on 2026-09-11 before the reorder landed. It is a SET, not a
   sequence: its job is to prove the reorder deleted nothing. The v581 change
   moves whole card blocks in js/app.js, so a card dropped in a conflict
   resolution is the realistic failure, and this row is what catches it. */
const EXPECTED = ['THE CREW', 'YOUR DATA', 'NOTIFICATIONS', 'REDEEM A CODE', 'DAILY TARGETS', 'PREFERENCES', 'APPLE HEALTH', 'ABOUT'];
/* ORDER: the sequence Tom approved on 2026-09-11 from a render of the rebased
   Settings ("seems fine"), which is the "good flow" half of his instruction the
   same day: "ruthlessly play test the settings tab to clean up the design it is
   a mess. success looks like a clean and easy to understand settings tab with a
   good flow and no fat on it." Proposed in
   REVIEW-PACK-settings-tidy-2026-09-11.md section 2 item 7. Changing this order
   is a product decision and needs Tom, not a test edit. */
const ORDER = ['THE CREW', 'DAILY TARGETS', 'PREFERENCES', 'NOTIFICATIONS', 'APPLE HEALTH', 'YOUR DATA', 'REDEEM A CODE', 'ABOUT'];
let browser, server, failed = 0;
const check = (name, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: ${detail}`);
  if (!ok) failed++;
};
try {
  const supplied = process.argv[2] || process.env.URL;
  server = supplied ? null : await serveTree(fileURLToPath(new URL('../', import.meta.url)));
  const session = await boot(supplied || server.url);
  browser = session.browser;
  const { page } = session;
  // No real account requests: seed a demo identity and stub API readbacks.
  await page.setRequestInterception(true);
  page.on('request', request => {
    if (new URL(request.url()).pathname.startsWith('/api/')) {
      request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, friends: [], incoming: [], outgoing: [], grants: [], cursor: 0 }) }).catch(() => {});
    } else request.continue().catch(() => {});
  });
  await page.evaluate(async () => {
    if (!navigator.webdriver || !location.search.includes('demo')) throw Error('demo fixture required');
    const db = await import(new URL('./js/db.js', location.href).href);
    await db.kvSet('social', { playerId: 'settings-shape', handle: 'Shape Audit', friendCode: 'BONE-SHAPE' });
    await db.kvSet('notifPrefs', { enabled: true, friends: true, reminder: true, streak: true, siege: true });
    location.hash = '#/settings';
  });
  await page.waitForFunction(() => document.querySelector('#screen .page-h1')?.textContent === 'Settings' && document.querySelector('#uLb'));
  for (const [width, height] of [[393, 852], [320, 568]]) {
    await page.setViewport({ width, height, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    await page.evaluate(() => document.fonts.ready);
    const data = await page.evaluate(async () => {
      const root = document.querySelector('#screen');
      const titles = [...root.querySelectorAll('.card-title')].map(el => [...el.childNodes].filter(n => n.nodeType === Node.TEXT_NODE).map(n => n.textContent).join('').trim().replace(/^THE CREW · (ONLINE|GO ONLINE)$/, 'THE CREW'));
      const measure = el => {
        el.scrollIntoView({ block: 'center', behavior: 'instant' });
        const r = el.getBoundingClientRect();
        const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        return { id: el.id || el.textContent.trim(), width: r.width, height: r.height,
          overflow: el.scrollWidth - el.clientWidth,
          inBounds: r.left >= -1 && r.right <= innerWidth + 1,
          hit: !!hit && (hit === el || el.contains(hit)) };
      };
      const folds = [];
      for (const fold of root.querySelectorAll('details.settings-fold')) {
        fold.open = false;
        const summary = fold.querySelector('summary');
        const before = measure(summary);
        // Activate the real summary only after establishing a reachable centre.
        if (before.hit) summary.click();
        await new Promise(resolve => requestAnimationFrame(resolve));
        const controls = [...fold.querySelectorAll('button, input, select, textarea, a[href]')].map(measure);
        folds.push({ title: summary.textContent.trim(), open: fold.open, hit: before.hit, controls });
      }
      const controls = [...root.querySelectorAll('.settings-row button, .settings-row input:not([type="hidden"]), .settings-row select, .settings-row textarea, .settings-row a[href]')].map(measure);
      const buttons = [...root.querySelectorAll('button, a.btn')].map(measure);
      return { titles, folds, controls, buttons, rendered: root.querySelector('.page-h1')?.textContent === 'Settings' };
    });
    const size = `${width}x${height}`;
    const ready = data.rendered && data.titles.length > 0 && data.controls.length > 0;
    check(`CONTROL ${size}`, ready, `${data.titles.length} cards, ${data.controls.length} row controls, ${data.buttons.length} buttons`);
    check(`CARDS ${size}`, ready && data.titles.length === EXPECTED.length && EXPECTED.every(t => data.titles.filter(x => x === t).length === 1), JSON.stringify(data.titles));
    check(`ORDER ${size}`, ready && JSON.stringify(data.titles) === JSON.stringify(ORDER), data.titles.join(' > '));
    const bad = data.controls.filter(c => !c.hit || c.width <= 0 || c.height <= 0 || c.height > 52 || c.overflow > 1 || !c.inBounds);
    check(`CONTROLS ${size}`, ready && !bad.length, `${data.controls.length - bad.length}/${data.controls.length}; failures=${JSON.stringify(bad)}`);
    check(`FOLDS ${size}`, ready && data.folds.length === 2 && data.folds.every(f => f.open && f.hit && f.controls.length && f.controls.every(c => c.width > 0 && c.height > 0)), JSON.stringify(data.folds));
    const columns = data.buttons.filter(c => c.width <= 0 || c.height <= 0 || c.height >= 52 || c.overflow > 1);
    check(`NO-COLUMN ${size}`, ready && data.buttons.length > 0 && !columns.length, `${data.buttons.length} buttons; failures=${JSON.stringify(columns)}`);
  }
} catch (error) {
  console.error(`BLOCKED settings-shape: ${error.stack}`);
  failed++;
} finally {
  await browser?.close();
  server?.close();
}
console.log(`settings-shape: ${failed} failures`);
process.exitCode = failed ? 1 : 0;
