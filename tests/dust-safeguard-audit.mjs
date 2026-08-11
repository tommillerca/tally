/* One curious tap must not spend dust. The failing result this guards against is
 * a dust balance that drops on the FIRST tap. */
import { boot, sleep } from './godmode.js';
/* argv FIRST, env.URL second: the convention error-telemetry-audit and
   year-readout-audit already use. Reading env.URL ONLY meant that any run passing
   the URL as an argument (which is how the release gate invokes every suite) fell
   through to godmode's boot() default, https://tommillerca.github.io/tally/, and
   graded PRODUCTION while reading as coverage of the tree under test. */
const { browser, page } = await boot(process.argv[2] || process.env.URL);
let bad = 0;
const check = (l, ok, d = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${l}${d ? '  ' + d : ''}`); if (!ok) bad++; };
const dust = () => page.evaluate(async () => (await import('./js/loot.js')).boneDust());

await page.evaluate(async () => { await (await import('./js/loot.js')).boneDustAdd(500); });
await page.evaluate(() => { location.hash = '#/bonehead'; });
await sleep(1800);
await page.evaluate(() => document.querySelector('#chTabs .ch-tab[data-tab="shop"]').click());
await sleep(1800);

const before = await dust();
const cell = await page.evaluate(() => {
  const b = document.querySelector('[data-dustbuy="charm"]');
  if (!b) return null;
  b.scrollIntoView({ block: 'center' });
  return { label: b.textContent.replace(/\s+/g, ' ').trim(), hasDesc: !!b.querySelector('.dc-desc') };
});
console.log('charm cell:', JSON.stringify(cell), 'dust', before);
check('the cell exists and explains the item', !!cell && cell.hasDesc, JSON.stringify(cell));
check('it names what it does', /pays more|Pit win/i.test(cell?.label || ''), cell?.label);

// FIRST tap: must not spend
await (await page.$('[data-dustbuy="charm"]')).click();
await sleep(700);
const afterOne = await dust();
const armed = await page.evaluate(() => {
  const b = document.querySelector('[data-dustbuy="charm"]');
  return { armed: b?.dataset.armed, text: b?.textContent.replace(/\s+/g, ' ').trim() };
});
console.log('after one tap:', afterOne, JSON.stringify(armed));
check('ONE tap spends nothing', afterOne === before, `${before} -> ${afterOne}`);
check('and it asks for confirmation', armed.armed === '1' && /tap again/i.test(armed.text), JSON.stringify(armed));

// SECOND tap: buys
await (await page.$('[data-dustbuy="charm"]')).click();
await sleep(1600);
const afterTwo = await dust();
console.log('after the confirm:', afterTwo);
check('the second tap actually buys', afterTwo === before - 25, `${before} -> ${afterTwo}`);

// and the arm times out rather than staying hot forever
await page.evaluate(() => { location.hash = '#/bonehead'; });
await sleep(1500);
await page.evaluate(() => document.querySelector('#chTabs .ch-tab[data-tab="shop"]').click());
await sleep(1600);
const d0 = await dust();
await (await page.$('[data-dustbuy="charm"]')).click();
await sleep(4000);
const cooled = await page.evaluate(() => document.querySelector('[data-dustbuy="charm"]')?.dataset.armed);
check('the armed state cools off on its own', cooled === '0', String(cooled));
check('and nothing was spent while it cooled', (await dust()) === d0);
await browser.close();
console.log(bad ? `\n${bad} FAILED` : '\nDUST SHOP SAFEGUARD VERIFIED');
process.exit(bad ? 1 : 0);
