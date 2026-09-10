/* R9: real Wardrobe controls, rendered pixels, and emitted feedback.
 *
 * Cold browser at 390x844 with touch and haptics enabled. F9 measures five empty
 * stat-capable slots after an actual cosmetic tap: the SAME slot's screenshot
 * must change, its plus must disappear, and its canvas must contain ink. The
 * doll must change too. Exactly one toast mutation within 300ms says "on".
 * M14 is independent: seed worn gear, tap a displacing tile ONCE, require one
 * warning within 300ms, no equipment write, a light haptic, and restored ink
 * after the 3200ms cool-off. M11 checks the cue before the first tap, including
 * its contribution to screenshot pixels. Empty controls/samples fail.
 *
 * Additional real controls: off/on, family colourway, gear tile and commit,
 * free and paid looks, saved fit save/apply/delete/cancel, and strip. The toast
 * queue is filled through the existing webdriver seam, never by editing #toast.
 * Error preemption is checked separately because toast() is shared plumbing.
 *
 * Independent red commands (exit 1 must name F9 or M14, not SETUP):
 *   node tests/wardrobe-feedback-audit.mjs --fault=f9 --case=f9
 *   node tests/wardrobe-feedback-audit.mjs --fault=m14 --case=m14
 * Original checkout source, read-only, before committing this patch:
 *   node tests/wardrobe-feedback-audit.mjs --baseline --case=f9
 *   node tests/wardrobe-feedback-audit.mjs --baseline --case=m14
 * Faults replace only the served app response, never any checkout file.
 * These commands have NOT produced pixel evidence in the authoring sandbox:
 * serveTree fails with listen EPERM. An infrastructure failure is not red proof.
 */
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boot, seed, sleep, serveTree } from './godmode.js';
import { declareAudit, recordAuditRow, completeAudit } from './audit-lifecycle.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const flag = name => process.argv.find(a => a.startsWith(`--${name}=`))?.split('=')[1];
const only = flag('case'), fault = flag('fault');
if (only && !['f9', 'm14'].includes(only)) throw new Error('Unknown --case');
if (fault && !['f9', 'm14'].includes(fault)) throw new Error('Unknown --fault');
// F9: five slots times five rows, plus three off/on rows. M14: five rows.
// The full run adds seventeen rows for the remaining controls and shared toast.
const expectedRows = only === 'f9' ? 28 : only === 'm14' ? 5 : 50;
declareAudit({ expectedRows });
let source = process.argv.includes('--baseline')
  ? execFileSync('git', ['show', 'HEAD:js/app.js'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })
  : readFileSync(path.join(ROOT, 'js/app.js'), 'utf8');
if (fault) {
  const needle = fault === 'f9' ? 'if (done) await refreshSlot(await equipped());'
    : 'onArm: () => { haptic.tap(); toast(warning, 3200, { action: true }); },';
  if (source.split(needle).length !== 2) throw new Error(`Fault ${fault} must replace exactly one site`);
  source = source.replace(needle, '/* R9 audit fault */');
}
let fails = 0, rows = 0, browser, srv;
const ok = (name, pass, detail = '') => {
  rows++;
  recordAuditRow(name, pass ? 'PASS' : 'FAIL');
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}${detail ? ': ' + detail : ''}`);
  if (!pass) fails++;
};
try {
  srv = await serveTree(ROOT);
  const session = await boot(srv.url, { headless: process.env.HEADLESS_MODE || 'shell' });
  browser = session.browser;
  const page = session.page;
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.setBypassServiceWorker(true);
  await page.setCacheEnabled(false);
  await page.setRequestInterception(true);
  page.on('request', req => {
    if (new URL(req.url()).pathname === '/js/app.js') {
      void req.respond({ status: 200, contentType: 'text/javascript', body: source });
    } else void req.continue();
  });
  await seed(page, { level: 20, dust: 500, reload: false });
  const fixture = await page.evaluate(async () => {
    const loot = await import('./js/loot.js');
    const db = await import('./js/db.js');
    const { BH_ITEMS } = await import('./data/boneheadz.js');
    const { GEAR_ITEMS } = await import('./js/gear.js');
    await db.kvSet('haptics', true);
    await db.kvSet('outfits', []);
    const items = {};
    for (const slot of ['H', 'T', 'P', 'IR', 'IL']) {
      const i = BH_ITEMS.find(i => i.slot === slot && !i.default && !i.id.startsWith('FB'));
      if (!i) throw new Error(`No cosmetic in ${slot}`);
      await loot.grantCosmetic(i.id, 'r9-feedback-audit');
      await loot.equip(slot, null);
      items[slot] = { id: i.id, name: i.name };
    }
    for (const id of ['H10-1', 'H10-3']) await loot.grantCosmetic(id, 'r9-feedback-audit');
    const gear = GEAR_ITEMS.filter(g => g.slot === 'H' && g.minLevel <= 20).sort((a, b) => a.minLevel - b.minLevel)[0];
    if (!gear) throw new Error('No fixture gear');
    await loot.grantGear(gear.id, 'r9-feedback-audit');
    return { items, gear: { id: gear.id, name: gear.name } };
  });
  await page.reload({ waitUntil: 'networkidle2' });
  await sleep(1800);
  // Only instrument platform output. Production click handlers and toast writer run.
  await page.evaluate(() => {
    window.__r9Buzz = [];
    Object.defineProperty(navigator, 'vibrate', { configurable: true, value: p => { window.__r9Buzz.push(p); return true; } });
    window.__r9Messages = [];
    new MutationObserver(ms => {
      for (const m of ms) {
        if (m.type === 'childList') window.__r9Messages.push({ text: [...m.addedNodes].map(n => n.textContent).join(''), at: performance.now() });
      }
    }).observe(document.querySelector('#toast'), { childList: true });
    new MutationObserver(ms => {
      for (const m of ms) if (m.type === 'childList') window.__r9Messages.push({ text: [...m.addedNodes].map(n => n.textContent).join(''), at: performance.now() });
    }).observe(document.querySelector('#srLive'), { childList: true });
  });
  const click = async sel => {
    await page.waitForSelector(sel, { visible: true, timeout: 5000 });
    await page.$eval(sel, el => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
    await sleep(100);
    await page.$eval(sel, el => {
      const r = el.getBoundingClientRect(), x = r.x + r.width / 2, y = r.y + r.height / 2;
      if (!el.contains(document.elementFromPoint(x, y))) throw new Error(`Covered control: ${el.outerHTML}`);
      return { x, y };
    });
    await page.evaluate(() => { window.__r9Start = performance.now(); });
    await page.tap(sel);
  };
  const wardrobe = async slot => {
    await page.evaluate(() => { location.hash = '#/today'; }); await sleep(500);
    await page.evaluate(() => { location.hash = '#/bonehead'; }); await sleep(800);
    await click('[data-tab="wardrobe"]');
    await click(`.pd-slot[data-pd="${slot}"]`);
    await page.waitForSelector(`.ward-grid[data-wslot="${slot}"]`);
    await sleep(600);
  };
  // Freeze only idle motion so a doll pixel difference measures dressing.
  await page.addStyleTag({ content: '.bh-stage.lg, .bh-stage.lg * { animation: none !important; transition: none !important; }' });
  const shot = async sel => {
    await page.$eval(sel, el => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
    await sleep(100);
    const el = await page.$(sel);
    if (!el) throw new Error(`Missing pixel sample ${sel}`);
    return el.screenshot({ encoding: 'base64' });
  };
  const diff = async (a, b) => page.evaluate(async (a, b) => {
    const decode = async data => {
      const im = new Image(); im.src = 'data:image/png;base64,' + data; await im.decode();
      const cv = document.createElement('canvas'); cv.width = im.naturalWidth; cv.height = im.naturalHeight;
      const ctx = cv.getContext('2d'); ctx.drawImage(im, 0, 0);
      return { w: cv.width, h: cv.height, data: ctx.getImageData(0, 0, cv.width, cv.height).data };
    };
    const x = await decode(a), y = await decode(b);
    if (!x.w || !x.h || x.w !== y.w || x.h !== y.h) return -1;
    let n = 0;
    for (let i = 0; i < x.data.length; i += 4) if (Math.max(...[0, 1, 2].map(k => Math.abs(x.data[i + k] - y.data[i + k]))) > 16) n++;
    return n;
  }, a, b);
  const ink = sel => page.$eval(sel, cv => {
    const data = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
    let n = 0; for (let i = 3; i < data.length; i += 4) if (data[i] > 30) n++;
    return n;
  }).catch(() => 0);
  const backlog = async () => {
    await page.evaluate(() => {
      for (let i = 0; i < 4; i++) window.__toast(`Startup chatter ${i}`, 6000);
    });
    await sleep(20);
  };
  const resetFeedback = () => page.evaluate(() => {
    window.__r9Messages = []; window.__r9Buzz = []; window.__r9Start = performance.now();
  });
  const feedback = () => page.evaluate(() => ({
    messages: window.__r9Messages.map(m => ({ text: m.text, ms: m.at - window.__r9Start })),
    buzz: window.__r9Buzz, text: document.querySelector('#toast').textContent,
  }));
  const receipt = async (label, expected, wait = 400) => {
    await sleep(wait);
    const f = await feedback();
    ok(label, f.messages.length === 1 && f.messages[0].text === expected && f.messages[0].ms <= 300 && f.buzz.length === 1, JSON.stringify(f));
  };
  if (!only || only === 'f9') {
    for (const [slot, seededItem] of Object.entries(fixture.items)) {
      await wardrobe(slot);
      // The demo already owns colourways, including IR10-3. A family tile
      // shows its best owned variant while empty, not necessarily the id we
      // granted. Tap that real tile and check the receipt for its displayed art.
      const item = await page.evaluate(async ({ slot, id }) => {
        const grid = document.querySelector(`.ward-grid[data-wslot="${slot}"]`);
        const tile = [...grid.querySelectorAll('button[data-equip]')].find(el =>
          el.dataset.equip === id || (el.dataset.famIds || '').split(' ').includes(id));
        const { BH_BY_ID } = await import('./data/boneheadz.js');
        const rendered = tile && BH_BY_ID[tile.dataset.equip];
        if (!rendered || rendered.slot !== slot) throw new Error(`No rendered fixture tile for ${slot}: ${id}`);
        return { id: rendered.id, name: rendered.name };
      }, { slot, id: seededItem.id });
      fixture.items[slot] = item;
      const pd = `.pd-slot[data-pd="${slot}"]`;
      ok(`F9 ${slot} starts empty`, !!(await page.$(`${pd} .pd-empty`)));
      const before = await shot(pd);
      const dollBefore = await shot('.bh-stage.lg');
      await backlog(); await resetFeedback();
      await click(`[data-equip="${item.id}"]`);
      await sleep(300);
      const early = await feedback();
      const after = await shot(pd);
      const dollAfter = await shot('.bh-stage.lg');
      const changed = await diff(before, after), dollChanged = await diff(dollBefore, dollAfter);
      const painted = await ink(`${pd} canvas`);
      ok(`F9 ${slot} slot pixels`, changed > 20 && painted > 20 && !(await page.$(`${pd} .pd-empty`)), `changed=${changed}, ink=${painted}`);
      ok(`F9 ${slot} doll pixels`, dollChanged > 20, `changed=${dollChanged}`);
      await sleep(3300);
      const f = await feedback();
      ok(`F9 ${slot} one immediate announcement`, early.messages.length === 1 && early.messages[0].text === `${item.name} on.` && early.messages[0].ms <= 300 && f.messages.length === 1, JSON.stringify(f));
      ok(`F14 ${slot} dressing haptic`, f.buzz.length === 1, JSON.stringify(f.buzz));
    }
    // Opposite actions have opposite text and pixels. These are real tile taps.
    await wardrobe('H');
    await resetFeedback(); await click('[data-equip=""]');
    await receipt('F11 off receipt', `${fixture.items.H.name} off.`);
    ok('F11 off tile says None', await page.$eval('[data-equip=""]', el => el.textContent.trim() === 'None'));
    await resetFeedback(); await click(`[data-equip="${fixture.items.H.id}"]`);
    await receipt('F11 on receipt', `${fixture.items.H.name} on.`);
  }
  if (!only || only === 'm14') {
    await page.evaluate(async id => (await import('./js/loot.js')).equipGear('H', id), fixture.gear.id);
    await wardrobe('H');
    const sel = '[data-equip="H10-1"]';
    const cue = await page.$eval(sel, el => ({ label: el.getAttribute('aria-label'), text: el.querySelector('.ward-arm-cue')?.textContent }));
    const visible = await shot(sel);
    await page.$eval(sel, el => { const cue = el.querySelector('.ward-arm-cue'); if (cue) cue.style.visibility = 'hidden'; });
    const hidden = await shot(sel);
    await page.$eval(sel, el => { const cue = el.querySelector('.ward-arm-cue'); if (cue) cue.style.visibility = ''; });
    const cuePixels = await diff(visible, hidden);
    ok('M11 visible contract before tap', cue.text === '2 taps' && /Tap again/.test(cue.label || '') && cuePixels > 10, `pixels=${cuePixels}, ${JSON.stringify(cue)}`);
    await backlog(); await resetFeedback(); await click(sel);
    await sleep(300);
    const early = await feedback();
    await sleep(3700);
    const late = await feedback();
    const state = await page.evaluate(async () => (await import('./js/loot.js')).gearLoadout());
    ok('M14 first tap speaks once immediately', early.messages.length === 1 && /^Tap again: takes off /.test(early.messages[0].text) && early.messages[0].ms <= 300 && late.messages.length === 1 && late.buzz.length === 1, JSON.stringify(late));
    ok('M14 first tap never equips', state.H === fixture.gear.id, JSON.stringify(state));
    ok('M14 cool-off restores painted art', await ink(`${sel} canvas`) > 20 && await page.$eval(sel, el => el.dataset.armed === '0'));
    await click(sel); await sleep(100); await resetFeedback(); await click(sel);
    const name = await page.evaluate(() => import('./data/boneheadz.js').then(m => m.BH_BY_ID['H10-1'].name));
    await receipt('M14 confirmed tap announces on once', `${name} on.`);
  }
  if (!only) {
    // Family rail and both statted-gear commit controls.
    await wardrobe('H');
    await click('[data-equip="H10-1"]'); await sleep(600);
    await resetFeedback(); await click('.fam-rail [data-equip="H10-3"]');
    const hat3 = await page.evaluate(() => import('./data/boneheadz.js').then(m => m.BH_BY_ID['H10-3'].name));
    await receipt('Family colourway receipt', `${hat3} on.`);
    await click(`[data-equipgear="${fixture.gear.id}"]`);
    await resetFeedback(); await click(`[data-equipgear="${fixture.gear.id}"]`);
    await receipt('Gear tile receipt', `${fixture.gear.name} on.`);
    // Remove the gear through the guarded cosmetic control, inspect it again,
    // then use the separate Equip button.
    await click('[data-equip="H10-1"]'); await click('[data-equip="H10-1"]'); await sleep(600);
    await click(`[data-equipgear="${fixture.gear.id}"]`);
    await resetFeedback(); await click(`[data-equipgear-commit="${fixture.gear.id}"]`);
    await receipt('Gear button receipt', `${fixture.gear.name} on.`);
    // Paid look: the arming tap spends nothing; the second tap announces once.
    await click('[data-look="H10-3"]'); await sleep(500);
    const price = await page.$eval('[data-look-apply]', el => Number(el.dataset.lookPrice));
    ok('Paid look fixture costs dust', price > 0);
    await click('[data-look-apply]'); await resetFeedback(); await click('[data-look-apply]');
    await receipt('Paid look receipt', `Look changed. −${price} dust.`);
    await click('[data-look=""]'); await sleep(500);
    await resetFeedback(); await click('[data-look-apply]');
    await receipt('Free look receipt', 'Look changed.');
    // Save through the real form, then wear, cancel deletion, and confirm deletion.
    await click('[data-fit-save]');
    await page.$eval('#txIn', el => { el.value = 'R9 fit'; });
    await backlog(); await resetFeedback(); await click('#txGo'); await sleep(700);
    const saved = await feedback();
    ok('F18 save bypasses startup backlog', saved.messages.length === 1 && saved.messages[0].text.startsWith('Saved "R9 fit"') && saved.messages[0].ms < 1000, JSON.stringify(saved));
    const fitId = await page.evaluate(() => import('./js/loot.js').then(async m => (await m.fits()).find(f => f.name === 'R9 fit')?.id));
    if (!fitId) throw new Error('Saved fit missing');
    await resetFeedback(); await click(`[data-fit="${fitId}"]`);
    await receipt('Saved fit on receipt', 'R9 fit on.');
    const editFit = async () => {
      const sel = `[data-fit="${fitId}"]`;
      await page.$eval(sel, el => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
      const r = await page.$eval(sel, el => { const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
      await page.mouse.move(r.x, r.y); await page.mouse.down(); await sleep(600); await page.mouse.up();
      await click(`[data-fit-del="${fitId}"]`);
    };
    const fitExists = () => page.evaluate(id => import('./js/loot.js').then(async m => (await m.fits()).some(f => f.id === id)), fitId);
    await editFit();
    ok('M-C opening deletion preserves fit', await fitExists());
    await click('#sheets .sheet-close'); await sleep(400);
    ok('M-C Cancel preserves fit', await fitExists());
    // The edit mode stays active after Cancel.
    await click(`[data-fit-del="${fitId}"]`);
    await resetFeedback(); await click('[data-fit-delete-confirm]');
    await receipt('M-C delete confirmation receipt', 'Deleted "R9 fit".');
    ok('M-C only confirmation deletes fit', !(await fitExists()));
    await click('[data-fit-reset]'); await resetFeedback(); await click('[data-fit-reset]');
    await sleep(600);
    const strip = await feedback();
    ok('Strip keeps one receipt and one haptic', strip.messages.length === 1 && /off/.test(strip.messages[0].text) && strip.buzz.length === 1, JSON.stringify(strip));
    // The football rail has its own Wear control. Seed two owned teams, then
    // select the other team through the real rail and wear it.
    const football = await page.evaluate(async () => {
      const { FOOTBALL_ITEMS } = await import('./data/football-teams.js');
      const loot = await import('./js/loot.js');
      const items = FOOTBALL_ITEMS.filter(i => i.slot === 'H').slice(0, 2);
      if (items.length !== 2) throw new Error('Football fixture is empty');
      for (const i of items) await loot.grantCosmetic(i.id, 'r9-feedback-audit');
      await loot.equip('H', items[0].id);
      return items.map(i => ({ id: i.id, name: i.name, team: i.football.team }));
    });
    await wardrobe('H');
    const team = football[1].team;
    await click(`[data-fbteam="${team}"]`); await sleep(400);
    const wearing = await page.$eval('[data-fbwear]', el => el.dataset.fbwear);
    const footballName = await page.evaluate(id => import('./data/boneheadz.js').then(m => m.BH_BY_ID[id].name), wearing);
    await resetFeedback(); await click('[data-fbwear]');
    await receipt('Football Wear receipt', `${footballName} on.`);
    // Shared toast plumbing: action backlog eviction must not drop errors.
    await page.evaluate(() => window.__toast('Write failed', 700, { error: true }));
    await sleep(20);
    await page.evaluate(() => {
      window.__toast('Action receipt', 400, { action: true });
      for (let i = 0; i < 6; i++) window.__toast('Later routine ' + i, 100);
    });
    ok('F18 active error is preserved', await page.$eval('#toast', t => t.textContent === 'Write failed'));
    await sleep(900);
    ok('F18 action follows error', await page.$eval('#toast', t => t.textContent === 'Action receipt'));
    const ui = await page.evaluate(async () => (await import('./tests/ui-audit.js')).uiAudit());
    ok('Required UI audit', ui.pass && ui.checked.controls > 0, JSON.stringify(ui));
  }
  if (rows !== expectedRows) throw new Error(`Expected ${expectedRows} audit rows, ran ${rows}`);
  completeAudit();
  console.log(`${rows - fails} passed, ${fails} failed; rows=${rows}/${expectedRows}`);
  process.exitCode = fails ? 1 : 0;
} catch (error) {
  console.error(`BLOCKED/INCOMPLETE after ${rows}/${expectedRows} rows: ${error.stack || error}`);
  process.exitCode = 2;
} finally {
  if (browser) await browser.close();
  srv?.close();
}
