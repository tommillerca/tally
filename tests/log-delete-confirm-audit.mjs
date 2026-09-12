// F17: exercise both production log edit paths. Browser proof is pending.
import { boot, seed, serveTree, sleep } from './godmode.js';
import { fileURLToPath } from 'node:url';

process.env.HEADLESS_MODE = 'shell';
let browser, server, failed = 0;
const check = (name, pass, detail) => {
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}: ${detail}`);
  if (!pass) failed++;
};
try {
  const supplied = process.argv.slice(2).find(a => /^https?:/.test(a));
  server = supplied ? null : await serveTree(fileURLToPath(new URL('../', import.meta.url)));
  const session = await boot(supplied || server.url);
  browser = session.browser;
  const { page } = session;
  await seed(page, { level: 12 });
  await page.waitForSelector('#screen');
  await sleep(4500);
  const click = async sel => {
    await page.waitForSelector(sel);
    await page.evaluate(sel => document.querySelector(sel).click(), sel);
  };
  const exists = id => page.evaluate(async id => {
    const { db } = await import('./js/db.js');
    return !!(await db.get('log', id));
  }, id);
  const confirm = '[data-log-delete-confirm]';
  for (const quick of [false, true]) {
    const row = await page.evaluate(async quick => {
      if (!new URLSearchParams(location.search).has('demo')) throw Error('demo fixture required');
      const { db } = await import('./js/db.js');
      const { GENERIC_FOODS } = await import('./data/generic-foods.js');
      const food = GENERIC_FOODS[0];
      const d = new Date();
      const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      for (const r of await db.all('log')) await db.del('log', r.id);
      const row = { id: quick ? 'f17-quick' : 'f17-full', date, meal: 1, ts: Date.now(),
        foodId: quick ? null : food.id, name: quick ? 'Quick "rice" & beans' : food.name,
        kcal: 165, p: 31, c: 0, f: 3.6, portionLabel: '100 g', sel: { mode: 'grams', grams: 100 } };
      await db.put('log', row);
      location.hash = '#/today';
      return row;
    }, quick);
    // Reload to refresh Today even when the route was already Today.
    await page.reload({ waitUntil: 'networkidle2' });
    await page.waitForSelector('#screen');
    await sleep(4500);
    await page.evaluate(() => { location.hash = '#/today'; });
    await click(`[data-entry="${row.id}"]`);
    const del = quick ? '#qaDel' : '#delBtn';
    await page.waitForSelector(del);
    check(quick ? 'QUICK CONTROL' : 'CONTROL', await exists(row.id), 'edit sheet open and seeded entry exists');
    const asks = async () => {
      await click(del);
      await page.waitForSelector(confirm);
      const heading = await page.evaluate(sel => document.querySelector(sel).closest('.sheet').querySelector('h2').textContent, confirm);
      check(quick ? 'QUICK ASKS' : 'ASKS', heading === `Delete "${row.name}"?` && await exists(row.id), heading);
    };
    await asks();
    if (!quick) {
      await click('.sheet:has([data-log-delete-confirm]) .sheet-close');
      await page.waitForFunction(sel => !document.querySelector(sel), {}, confirm);
      check('CANCEL', await exists(row.id), 'confirmation closed and entry retained');
      await asks();
    }
    await click(confirm);
    await page.waitForFunction(async id => {
      const { db } = await import('./js/db.js');
      return !(await db.get('log', id));
    }, {}, row.id);
    await page.waitForFunction(name => document.querySelector('#toast')?.textContent.includes(`Deleted "${name}"`), {}, row.name);
    check(quick ? 'QUICK DELETES' : 'DELETES', !await exists(row.id), `entry gone and toast names ${row.name}`);
    await page.waitForFunction(() => !document.querySelector('#sheets .sheet'));
    await sleep(300);
  }
} catch (error) {
  console.error(`BLOCKED log-delete-confirm: ${error.stack}`);
  failed++;
} finally {
  await browser?.close();
  server?.close();
}
console.log(`log-delete-confirm: ${failed} failures`);
process.exitCode = failed ? 1 : 0;
