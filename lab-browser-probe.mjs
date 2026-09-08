/* Operator browser proof: the Laboratory must RENDER and its real control must
   reach the real engine. Node guards proved the seam; this proves the room. */
import { boot, sleep, serveTree, seed } from './tests/godmode.js';
const srv = await serveTree(process.cwd());
const { browser, page } = await boot(srv.url);
const errs = [];
page.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
page.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text().slice(0, 160)); });

// ?demo puts the app on a throwaway save so seed() will act; then reload so
// the seeded pets are the state the app boots against.
await page.goto(srv.url + '/?demo=1&godmode=1', { waitUntil: 'networkidle0' });
await sleep(1500);
const seeded = await seed(page, { level: 12, pets: [
  { sp: 'C5', morph: 'base' }, { sp: 'C5', morph: 'base' }, { sp: 'C5', morph: 'base' },
  { sp: 'C1', morph: 'base' }, { sp: 'C1', morph: 'base' },
] }).catch(e => ({ error: String(e.message || e) }));
console.log('seed: ' + JSON.stringify(seeded).slice(0, 200));
await page.goto(srv.url + '/?demo=1&godmode=1', { waitUntil: 'networkidle0' });
await sleep(1800);
// dismiss any first-run splash so the app itself is on screen
await page.evaluate(() => {
  for (const b of document.querySelectorAll('button')) {
    if (/^(start|new|got it|continue|skip|play)/i.test(b.textContent.trim())) { b.click(); return; }
  }
});
await sleep(1200);

const probe = await page.evaluate(async () => {
  const out = {};
  // 1. does the engine resolve inside the REAL page, not just in node?
  const loot = await import('./js/loot.js');
  const e = loot.laboratory;
  out.engineLive = !!(e && e.version === 1 &&
    ['snapshot','quote','animate','purchase','acknowledge','setUi'].every(k => typeof e[k] === 'function'));
  // 2. can the engine read real state through the real db?
  try { const s = await e.snapshot(); out.snapshotKeys = Object.keys(s || {}).slice(0, 8); }
  catch (err) { out.snapshotError = String(err.message || err); }
  // 3. is there a real way in?
  out.doors = [...document.querySelectorAll('[data-lab-open], .lab-door')].length;
  return out;
});
console.log('probe: ' + JSON.stringify(probe));

// 4. walk the app's own routes looking for the door a player would press
const hunt = await page.evaluate(async () => {
  const seen = [];
  const routes = ['stable','backpack','pets','collection','paddock','today','shop'];
  for (const r of routes) {
    location.hash = '#/' + r;
    await new Promise(res => setTimeout(res, 700));
    const doors = document.querySelectorAll('[data-lab-open], .lab-door').length;
    const txt = document.body.innerText;
    seen.push({ route: r, doors, lab: /laborator/i.test(txt), chars: txt.replace(/\s+/g,' ').length });
    if (doors) break;
  }
  return seen;
});
console.log('routes: ' + JSON.stringify(hunt));
const found = hunt.find(h => h.doors > 0);
let room = { skipped: 'no door on any route' };
if (found) {
  await page.evaluate(() => document.querySelector('[data-lab-open], .lab-door').click());
  await sleep(1400);
  room = await page.evaluate(() => {
    const t = document.body.innerText;
    return { mentionsLab: /laborator/i.test(t), chars: t.replace(/\s+/g,' ').length,
             animate: /animate/i.test(t), recipes: /base|ember|frost|toxic|rose|midnight/i.test(t) };
  });
}
console.log('room: ' + JSON.stringify(room));
console.log('errors: ' + (errs.length ? errs.slice(0,4).join(' | ') : 'none'));
await page.screenshot({ path: '/tmp/lab-room.png', fullPage: false });
await browser.close(); srv.close();
