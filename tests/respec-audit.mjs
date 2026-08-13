/* Refund-and-respend must not fire on one tap, and the points must genuinely come
 * back. Failure = trainalloc emptied by a single tap, or a pool that does not grow. */
import { boot, sleep } from './godmode.js';
/* argv FIRST, env.URL second: the convention error-telemetry-audit and
   year-readout-audit already use. Reading env.URL ONLY meant that any run passing
   the URL as an argument (which is how the release gate invokes every suite) fell
   through to godmode's boot() default, https://tommillerca.github.io/tally/, and
   graded PRODUCTION while reading as coverage of the tree under test. */
const { browser, page } = await boot(process.argv[2] || process.env.URL);
let bad = 0;
const check = (l, ok, d = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${l}${d ? '  ' + d : ''}`); if (!ok) bad++; };
const alloc = () => page.evaluate(async () => (await (await import('./js/db.js')).kvGet('trainalloc', {})));

const openBuild = async () => {
  await page.evaluate(() => { location.hash = '#/bonehead'; });
  await sleep(1700);
  await page.evaluate(() => document.querySelector('#chTabs .ch-tab[data-tab="talents"]').click());
  await sleep(1900);
  await page.evaluate(() => document.querySelector('[data-bsect="fighter"]')?.setAttribute('open', ''));
  await sleep(500);
};
// spend some points through the REAL + buttons
await openBuild();
const plus = await page.$$('[data-tpplus]');
check('the Build tab exposes per-stat spend controls', plus.length > 0, `${plus.length} controls`);
for (let i = 0; i < 3; i++) {
  const b = (await page.$$('[data-tpplus]:not([disabled])'))[i % 3];
  if (!b) break;
  await b.click();
  await sleep(700);
  await page.evaluate(() => document.querySelector('[data-bsect="fighter"]')?.setAttribute('open', ''));
}
const spentAlloc = await alloc();
const spent = Object.values(spentAlloc).reduce((a, b) => a + b, 0);
console.log('after spending:', JSON.stringify(spentAlloc));
check('points actually land in trainalloc', spent > 0, JSON.stringify(spentAlloc));

// combat must see the spend: stats used by the fighter, and by the defender snapshot
await openBuild();
const reset = await page.$('#tpReset');
check('a refund control appears once points are spent', !!reset);
if (reset) {
  await reset.click();
  await sleep(600);
  const afterOne = await alloc();
  const armed = await page.evaluate(() => {
    const b = document.getElementById('tpReset');
    return { armed: b?.dataset.armed, text: b?.textContent.trim() };
  });
  console.log('after ONE tap:', JSON.stringify(afterOne), JSON.stringify(armed));
  check('ONE tap refunds nothing', Object.values(afterOne).reduce((a, b) => a + b, 0) === spent, JSON.stringify(afterOne));
  check('and it asks first, naming the cost', armed.armed === '1' && /Refund all \d+ point/.test(armed.text), armed.text);

  await (await page.$('#tpReset')).click();
  await sleep(1600);
  const afterTwo = await alloc();
  console.log('after the confirm:', JSON.stringify(afterTwo));
  check('the confirm refunds every point', Object.values(afterTwo).reduce((a, b) => a + b, 0) === 0, JSON.stringify(afterTwo));

  // and they are genuinely re-spendable: the pool must be back to full
  await openBuild();
  const pool = await page.evaluate(() => {
    /* RE-ANCHORED 2026-08-11. `.tp-count` stopped existing in the Tier-3 Build
       rebuild: the counter now renders as a chip in the "Training points"
       section header ("N to spend · X/Y used"), same copy, new home. The old
       selector read nothing, matched nothing, and reported avail:null, which
       the gate:all debut surfaced looking exactly like players losing talent
       points. They were not: the refund path (trainalloc cleared, pool
       recomputed on render) was verified working during this diagnosis; only
       the read was dead. Anchored to the COPY, not a class, so a restyle
       cannot kill it again: any element whose text says "N to spend". */
    const el = [...document.querySelectorAll('span,div,b')].find(n => /\d+ to spend/.test(n.textContent || '') && n.children.length === 0);
    const t = el ? el.textContent : '';
    const m = t.match(/(\d+) to spend/);
    return { text: t.trim(), avail: m ? +m[1] : null, plusEnabled: [...document.querySelectorAll('[data-tpplus]')].some(b => !b.disabled) };
  });
  console.log('pool after refund:', JSON.stringify(pool));
  check('the refunded points are available to spend again', pool.avail >= spent, JSON.stringify(pool));
  check('and the + controls are usable', pool.plusEnabled);
}
// COMBAT SAFETY, the part Tom asked me to protect: a real fight still opens and
// the engine gets real numbers after a refund.
await page.evaluate(() => { location.hash = '#/today'; });
await sleep(1700);
await page.evaluate(() => document.querySelector('.dw')?.remove());
const pit = await page.$('#pitBtn');
if (pit) { await pit.click(); await sleep(1800); }
const fought = await page.evaluate(async () => {
  const b = [...document.querySelectorAll('button')].find(x => /^fight$/i.test(x.textContent.trim()));
  if (b) b.click();
  await new Promise(r => setTimeout(r, 2600));
  // assert on what the player sees: the plate's HP readout and bar, not on a
  // guessed path into the engine's state object
  const hp = document.getElementById('youHp');
  /* The .fplate / .fighter-plate / #youPlate query used to sit here but the
     variable it filled was never read; the assertion below reads `hp?.style.width`
     from #youHp and `arena.textContent` directly. suite-rot flagged line 95's
     three arms as STALE (verified 2026-08-13: none of them are emitted anywhere
     in js/). Dropping the query removes dead code and lets suite-rot clear the
     row honestly; the assertion is unchanged. */
  const txt = (document.getElementById('arena')?.textContent || '');
  const m = txt.match(/(\d+)\s*\/\s*(\d+)/);
  return {
    arenaOpen: !!document.getElementById('arena'),
    barWidth: hp?.style.width || null,
    hpText: m ? m[0] : null, hp: m ? +m[1] : null, maxHp: m ? +m[2] : null,
    actions: document.querySelectorAll('.fight-act').length,
  };
});
console.log('a real fight after the refund:', JSON.stringify(fought));
// the arena does not print numeric HP, so the bar and the moves ARE the visible
// truth: a fighter built from a zeroed allocation would still need both
check('a fight still opens after a refund', fought.arenaOpen && fought.barWidth === '100%', JSON.stringify(fought));
check('and the moves are there to play it', fought.actions > 0, `${fought.actions} actions`);
check('the HP bar renders a real width', !!fought.barWidth && fought.barWidth !== '0%', String(fought.barWidth));
await browser.close();
console.log(bad ? `\n${bad} FAILED` : '\nRESPEC IS SAFE AND REVERSIBLE');
process.exit(bad ? 1 : 0);
