/* THE COSMETIC TEASER ACTUALLY FIRES, AND ITS SESSION FLAG EXISTS.
 *
 * Found in production by the error telemetry, twelve minutes after v360 shipped:
 * two real iOS devices reported `Can't find variable: teaserFired`. The binding
 * was read at js/app.js and declared nowhere. ES modules are strict mode, so the
 * read throws; the throw happens inside a setTimeout callback, so the try/catch
 * that wraps the scheduling never saw it, and the automatic showing died
 * silently on every device. TEASER_SEEN_KEY never incremented. The News-tab
 * route kept working because it calls openCosmeticTeaser() directly, which is
 * why nobody noticed.
 *
 * The guard is the OUTCOME, not the declaration: drive the real one-shot path
 * and assert the teaser is on screen and the counter moved. A check for
 * `typeof teaserFired` would pass on any build that declares it and never shows
 * anything.
 *
 * PROVEN RED by removing the declaration: the run reports the ReferenceError and
 * no teaser.
 */
import { boot, sleep, settle } from './godmode.js';

const fails = [];
const ok = (n, p, d = '') => { console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${d ? '  ' + d : ''}`); if (!p) fails.push(n); };
const base = process.argv[2];
if (!base) { console.log('FAIL  needs a base URL (npm run gate serves one).'); process.exit(1); }

const { browser, page } = await boot(base);
const errs = [];
page.on('pageerror', e => errs.push(String(e.message || e)));
await page.evaluateOnNewDocument(() => { window.__teaserForce = 1; });
await page.reload({ waitUntil: 'networkidle2' });
await sleep(2600);

/* No manual call: maybeShowCosmeticTeaser() is invoked by BOOT (js/app.js:652),
   which is the path that was broken. Driving it by hand would test a function
   nobody calls that way and would have passed on the shipped bug. */
await page.waitForFunction(() => !!document.querySelector('.tz-pop'), { timeout: 20000, polling: 200 })
  .catch(() => {});
await settle(page, 300);

const res = await page.evaluate(async () => {
  const { kvGet } = await import('./js/db.js');
  const pop = document.querySelector('.tz-pop');
  return {
    shown: !!pop,
    title: pop ? (pop.querySelector('.tz-h')?.textContent || '').trim() : null,
    seen: (await kvGet('cosmeticTeaserSeen', 0)) || 0,
  };
});

const refErr = errs.filter(e => /teaserFired|Can't find variable|is not defined/i.test(e));
ok('no ReferenceError from the teaser path', refErr.length === 0, refErr.slice(0, 2).join(' ; ') || 'clean');
ok('the teaser actually reaches the screen', res.shown, res.title || 'no .tz-pop appeared');
/* NOT a before/after delta: boot fires the teaser, so by the time this file can
   read the counter the increment has already happened and `before` equals
   `after`. What the bug did was leave the counter at ZERO forever, because the
   throw landed before kvSet, so a non-zero count after a showing is the property
   that was actually broken. */
ok('and the showing is spent, so the 10-open budget advances', res.seen > 0,
  `cosmeticTeaserSeen = ${res.seen} (stuck at 0 on the broken build)`);

await browser.close();
console.log(fails.length ? `\n${fails.length} FAILED: ${fails.join(', ')}` : '\nteaser fires');
process.exit(fails.length ? 1 : 0);
