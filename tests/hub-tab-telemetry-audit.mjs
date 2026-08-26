/* tests/hub-tab-telemetry-audit.mjs: OPENING A HUB SUB-TAB LEAVES A NUMBER.
 *
 * WHY THIS EXISTS. Tom, 2026-08-18: "hide the Looks tab, check the stats first."
 * The stats did not exist. Looks is a sub-tab of the Bonehead hub, reached by a
 * pill in the Wardrobe, and NOTHING in the app recorded a sub-tab open: the only
 * trackScreen() call in js/app.js is the bottom-nav tab. So no Looks number was
 * ever written, none could be recovered, and the decision had no evidence under
 * it. Anyone who quoted a Looks figure invented one.
 *
 * js/app.js now fires trackEvent('hub_tab', { t }) inside openCharacter(), which
 * is the single funnel both the #chTabs chips and the .ward-looks door pass
 * through. This audit exists because a week of waiting on a call that silently
 * never fires is exactly the cost the instrumentation was meant to avoid: a
 * seam with no consumer looks identical to a working one from the outside.
 *
 * WHAT IT ASSERTS, all by OPERATING real controls with a real mouse:
 *   SETUP    the hub rendered and the Looks door is on the Wardrobe, so the
 *            clicks below land on something. Nothing to click is a FAILURE.
 *   CONTROL  WITHOUT the probe, a webdriver session queues NOTHING. This is the
 *            row that keeps the fix honest in the other direction: automated
 *            runs must never register as phantom testers and inflate the very
 *            counts Tom is about to read. It also proves QUEUED is not passing
 *            on rows some earlier boot left behind.
 *   QUEUED   with the probe set, a real click on the Looks door writes a
 *            hub_tab row carrying t: 'looks'.
 *   COVERAGE the #chTabs chips go through the same call, so the wardrobe chip
 *            queues too. Without this, QUEUED would still pass on a change that
 *            special-cased Looks and left every other sub-tab dark, which is
 *            the same blind spot in a new coat.
 *
 * DIRECTION OF FAILURE. Remove the trackEvent call from openCharacter and
 * QUEUED + COVERAGE go red while CONTROL stays green. Remove the __evProbe
 * hatch from track() and all three go red together, which is the signal that
 * the audit is measuring the gate rather than the app.
 *
 * Self-serves THIS checkout when given no URL: boot() defaults to the live site,
 * so a bare run would grade production and read as coverage of the tree.
 *   node tests/hub-tab-telemetry-audit.mjs            # this worktree
 *   node tests/hub-tab-telemetry-audit.mjs <url>      # somewhere else
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boot, serveTree, sleep } from './godmode.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argUrl = process.argv[2] || process.env.URL;
const own = argUrl ? null : await serveTree(ROOT);
const url = argUrl || own.url;

const { browser, page } = await boot(url);
let bad = 0;
const check = (l, ok, d = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${l}${d ? '  ' + d : ''}`); if (!ok) bad++; };
const done = async code => { await browser.close(); if (own) own.close(); process.exit(code); };

const hubTabRows = () => page.evaluate(async () => {
  const db = await import('./js/db.js');
  const rows = (await db.kvGet('evq', [])) || [];
  return rows.filter(r => r.name === 'hub_tab').map(r => r.props && r.props.t);
});

const toWardrobe = async () => {
  await page.evaluate(() => { location.hash = '#/bonehead'; });
  await page.waitForFunction(() => !!document.querySelector('#chTabs .ch-tab'), { timeout: 20000, polling: 100 });
  await page.click('#chTabs .ch-tab[data-tab="wardrobe"]');
  await page.waitForFunction(() => !!document.querySelector('.ward-head [data-tab="looks"]'), { timeout: 20000, polling: 100 });
  await sleep(400);
};

await toWardrobe();
const seen = await page.evaluate(() => ({
  chips: [...document.querySelectorAll('#chTabs .ch-tab')].map(c => c.dataset.tab),
  door: !!document.querySelector('.ward-head [data-tab="looks"]'),
  bot: navigator.webdriver,
}));
check('SETUP the hub rendered, the Looks door is on the Wardrobe, and this is a bot session',
  seen.door && seen.chips.length > 0 && seen.bot === true, JSON.stringify(seen));
if (bad) { console.log('\nFAIL (setup): nothing below would grade against a real screen.'); await done(2); }

/* CONTROL first, before the probe exists. */
await page.click('.ward-head [data-tab="looks"]');
await sleep(900);
const quiet = await hubTabRows();
check('CONTROL without the probe a webdriver session queues nothing', quiet.length === 0,
  `${quiet.length} hub_tab rows: ${quiet.join(',') || '(none)'}`);

/* Now the probe, and the same clicks a player makes. */
await page.evaluate(() => { window.__evProbe = 1; });
await toWardrobe();                                  // the wardrobe CHIP
await page.click('.ward-head [data-tab="looks"]');   // the Looks DOOR
await sleep(900);
const rows = await hubTabRows();

check('QUEUED a real click on the Looks door writes hub_tab t:looks', rows.includes('looks'),
  `rows: ${rows.join(',') || '(none)'}`);
check('COVERAGE the hub chips go through the same call, so they queue too', rows.includes('wardrobe'),
  `rows: ${rows.join(',') || '(none)'}`);

console.log(`\nhub-tab-telemetry: ${bad ? bad + ' FAILED' : 'clean'}`);
await done(bad ? 1 : 0);
