/* EVERY FAILURE A PLAYER CAN HIT MUST SAY SOMETHING, AND SAY ENOUGH.
 *
 * THE STANDARD, stated up front so the grading is not a matter of opinion:
 *
 *   A failure message is ADEQUATE when it says WHAT failed AND WHAT the player
 *   can do about it. Anything else is inadequate, in this order of badness:
 *     1. SILENCE          nothing appears at all. Invisible to the player and
 *                         invisible to whoever is asked to support them.
 *     2. A MACHINE STRING  "Unexpected token '<' ... is not valid JSON", a bare
 *                         URL, a bare friend code. Words, but not to a person.
 *     3. A VAGUE APOLOGY   "Could not save that." True, useless, unactionable.
 *
 * At five friendly testers a vague error is a shrug. At a thousand it is a
 * support email with no diagnosis possible, and this app has no support team.
 *
 * WHAT THIS FILE CANNOT DO is grade tone, and it must not try: a guard pinned to
 * an exact string pins the copy and goes red on every honest edit. So the guard
 * is STRUCTURAL. It drives real failures through real controls and measures the
 * answer: is anything VISIBLE, does it carry enough CHARACTERS and WORDS to be a
 * sentence rather than a shrug, is it short enough to read inside a toast, and
 * is it free of machine strings. Copy can be rewritten freely underneath it.
 *
 * DIRECTION (anti-regression rule 11). Failure is DOWNWARD in substance: absent,
 * or shorter than the floor, or leaking an engine string. It is not "the app
 * threw no error" and it is not "the message got longer". A trend would be
 * meaningless here, so both ends are pinned:
 *
 *   BOUND   FLOOR   >= 24 characters AND >= 5 words, and VISIBLE on screen
 *           CEILING <= 200 characters (a toast the player cannot finish reading
 *                   before it leaves is another way of saying nothing; the
 *                   longest shipped failure copy today is 124)
 *           PLAIN   zero matches for the machine-string pattern
 *
 * The floor is the half that catches silence and shrugs. The ceiling is the half
 * that stops the floor being satisfied by padding, which is the only way a
 * character-count check can be gamed.
 *
 * EVERY SCENARIO CARRIES A CONTROL, because an empty sample set is a failure and
 * not a pass (rule 3). If the harness never reached the sheet, never got the
 * write refused, or never removed the row, the CONTROL row goes red and the
 * grading rows below it mean nothing.
 *
 * WHAT IS DRIVEN, and why each one is a failure a player really hits:
 *
 *   QUICKADD  the quick-add sheet writes to 'log', the same store and the same
 *             quota as the portion sheet that was fixed in v373. It was left
 *             bare: a refused put threw out of the handler, so no toast, no
 *             close, no XP, and a filled-in form that looked untouched.
 *   WEIGHT    a weigh-in writes to 'weights' with no guard at all. Same shape.
 *   FOOD      saving a custom food (the end of a label scan, a minute of the
 *             player's work) writes to 'foods' with no guard. Same shape.
 *   RELOG     one-tap re-log of a previous meal, 'log' again, no guard.
 *   CRATE     openCrate() THROWS 'crate gone' when its row has moved under it,
 *             which is what a double tap produces. The button had already been
 *             disabled, so the tap left a dead control and no message.
 *   VIGOR     consumeConsumable() returning false WAS the entire message. The
 *             Battle Charm handler two lines above it says why it refused.
 *   IMPORT    the JSON parse sits in FRONT of importAll, and only importAll
 *             speaks player English. Picking the wrong file printed the parser's
 *             own words into a toast, and left the file input unable to re-fire.
 *
 * Storage really does fill: measured growth is ~2.4MB a year, and a phone with
 * 500MB free reaches its origin quota in roughly four years of daily use
 * (tests/db-quota-finding.mjs). The refusal is INJECTED here, which proves how
 * OUR CODE handles a rejected write. That is our code, and injection is the
 * honest way to reach it.
 *
 * PROVE-RED: revert any one fix and its rows go red. Measured, see the report.
 *
 * Usage: node tests/failure-voice-audit.mjs [baseUrl]   (serves this repo if omitted)
 */
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { boot, seed, sleep, serveTree } from './godmode.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argUrl = process.argv.slice(2).find(a => !a.startsWith('--'));
const srv = argUrl ? null : await serveTree(ROOT);
const base = (argUrl || srv.url).replace(/\/?$/, '/');
console.log(`failure-voice-audit against ${base}\n`);

const FLOOR_CHARS = 24;
const FLOOR_WORDS = 5;
const CEIL_CHARS = 200;
/* The machine-string pattern. Everything here has been printed at a player by
   this app or is one edit away from it: the JSON parser's own words, a raw
   DOMException name, a template hole that resolved to nothing, an object
   stringified by accident. */
const MACHINE = /undefined|\[object |\bNaN\b|Unexpected token|not valid JSON|DOMException|QuotaExceeded|Error:|at <anonymous>|\$\{/i;

const fails = [];
const ok = (n, p, d = '') => { console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${d ? '  ' + d : ''}`); if (!p) fails.push(n); };

/* ---------- part one: the STATIC half ----------------------------------------
 * A driven scenario proves the paths it drives. It cannot prove that the NEXT
 * player-data write somebody adds will speak, and that is exactly how this class
 * of bug spread: the portion sheet was fixed and four siblings writing to the
 * same stores were left bare for another release. So every db.put on a store
 * that holds the player's own logged data must either sit in a try whose catch
 * toasts, or be declared here with a reason. A new one that is neither FAILS.
 * Same shape as the release gate's own coverage assertion, and the same price:
 * one line per exemption, on the record as a decision. */
const DATA_STORES = ['log', 'weights', 'foods', 'health'];
/* KEYED ON THE WRITE PLUS THE LINE ABOVE IT, NOT THE WRITE ALONE. Two different
   sites in this file are byte-for-byte `await db.put('foods', food);`: the
   favourite-usage bookkeeping and the custom-food save. A key of just the line
   would have let the exemption written for the harmless one silently excuse the
   one that matters, which is the exact failure mode this map exists to prevent.
   The preceding non-blank line is enough to tell them apart and still survives
   ordinary editing inside the handler. */
const EXEMPT = {
  "food.lastUsedAt = Date.now(); >>> await db.put('foods', food);":
    'persistFoodUse: usage bookkeeping (useCount / lastUsedAt) that runs AFTER the log row it belongs to has already landed and been confirmed. A refusal costs a sort order, not the player\'s data, and a second toast on a successful save is noise.',
  "$('#favBtn', wrap).classList.toggle('gold', !!food.favorite); >>> if (food.source !== 'generic') await db.put('foods', food);":
    'the favourite star: a toggle whose entire result is the star\'s own state, re-read from the store on the next render. Nothing the player typed is at stake.',
  "if (payload.wtypes) row.wtypes = payload.wtypes; >>> await db.put('health', row);":
    'Apple Health intake. Not a player tap: it runs from a sync that reports its own outcome, and syncFromClipboard owns the messages (tests/health-intake-audit.mjs).',
  "if (payload.weightKg != null) { >>> await db.put('weights', { date: payload.date, kg: payload.weightKg });":
    'same Health intake path as above, same owner of the message.',
  "const awakeMin = Math.round(sleepMin * 0.05); >>> await db.put('health', {":
    'demo seeding, reachable only under ?demo. No player sees it.',
  "const n = nutrientsFor(food, sel); >>> await db.put('log', {":
    'demo seeding, reachable only under ?demo. No player sees it.',
  "const kg = 87.4 - (30 - i) * 0.045 + ((i * 7) % 3) * 0.14 - 0.1; >>> await db.put('weights', { date: addDays(today, -i), kg: Math.round(kg * 10) / 10 });":
    'demo seeding, reachable only under ?demo. No player sees it.',
};

const APP = await readFile(path.join(ROOT, 'js', 'app.js'), 'utf8');

/* Every try block in the file, with the body of its catch, so a write can be
   asked whether SOME enclosing try answers for it in words. */
function tryBlocks(src) {
  const out = [];
  const re = /\btry\s*\{/g;
  let m;
  while ((m = re.exec(src))) {
    const open = src.indexOf('{', m.index);
    let d = 0, end = -1;
    for (let i = open; i < src.length; i++) {
      if (src[i] === '{') d++;
      else if (src[i] === '}') { d--; if (d === 0) { end = i; break; } }
    }
    if (end < 0) continue;
    const after = src.slice(end, end + 4000);
    const cm = after.match(/^\s*\}\s*catch\s*(\([^)]*\))?\s*\{/);
    let catchBody = '';
    if (cm) {
      const cOpen = end + cm[0].lastIndexOf('{');
      let cd = 0, cEnd = -1;
      for (let i = cOpen; i < src.length; i++) {
        if (src[i] === '{') cd++;
        else if (src[i] === '}') { cd--; if (cd === 0) { cEnd = i; break; } }
      }
      if (cEnd > 0) catchBody = src.slice(cOpen, cEnd);
    }
    out.push({ start: m.index, end, catchBody });
  }
  return out;
}

const BLOCKS = tryBlocks(APP);
const APP_LINES = APP.split('\n');
const putRe = new RegExp(`db\\.put\\(\\s*'(${DATA_STORES.join('|')})'`, 'g');
const sites = [];
let pm;
while ((pm = putRe.exec(APP))) {
  const lineNo = APP.slice(0, pm.index).split('\n').length;
  const line = APP_LINES[lineNo - 1].trim();
  let j = lineNo - 2;
  while (j >= 0 && !APP_LINES[j].trim()) j--;
  const key = `${j >= 0 ? APP_LINES[j].trim() : ''} >>> ${line}`;
  const guarded = BLOCKS.some(b => pm.index > b.start && pm.index < b.end && /toast\(/.test(b.catchBody));
  sites.push({ lineNo, line, key, store: pm[1], guarded });
}
ok('STATIC-CONTROL the scanner actually found the player-data writes (an empty scan is not a clean scan)',
  sites.length >= 10, `${sites.length} db.put sites on ${DATA_STORES.join('/')}`);
const undeclared = sites.filter(s => !s.guarded && !EXEMPT[s.key]);
ok('STATIC every player-data write either speaks on refusal or is declared with a reason',
  undeclared.length === 0,
  undeclared.length ? undeclared.map(s => `js/app.js:${s.lineNo} ${s.line}`).join(' | ') : `${sites.filter(s => s.guarded).length} guarded, ${sites.length - sites.filter(s => s.guarded).length} declared`);
/* A declaration for a write that no longer exists rots into false coverage the
   same way an unrun audit does, so it is a failure too. */
const staleExempt = Object.keys(EXEMPT).filter(k => !sites.some(s => s.key === k && !s.guarded));
ok('STATIC no exemption outlives the write it excuses', staleExempt.length === 0, staleExempt.join(' | ') || 'none');

/* ---------- part two: the DRIVEN half --------------------------------------- */
const { browser, page } = await boot(base, { headless: process.env.HEADLESS_MODE || 'shell' });
const pageErrs = [];
page.on('pageerror', e => pageErrs.push(String(e).split('\n')[0]));
await seed(page, { level: 12, coins: 5000 });
await sleep(1500);

/* Read what the player can actually SEE. Visibility is measured, not assumed: a
   toast element exists on every screen whether or not it is showing anything,
   so presence proves nothing (this is the fav-skull lesson). */
const readToast = () => page.evaluate(() => {
  const t = document.getElementById('toast');
  if (!t) return { present: false, visible: false, text: '' };
  const cs = getComputedStyle(t);
  const r = t.getBoundingClientRect();
  return {
    present: true,
    text: (t.textContent || '').trim(),
    visible: !t.hidden && cs.display !== 'none' && cs.visibility !== 'hidden'
      && parseFloat(cs.opacity || '1') > 0.01 && r.width > 0 && r.height > 0,
  };
});

/* Wait for the toast queue to drain before provoking anything, so a message left
   over from an earlier step can never be graded as this step's answer. */
async function quiet(ms = 8000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await page.evaluate(() => { const t = document.getElementById('toast'); return !t || t.hidden; })) return true;
    await sleep(200);
  }
  return false;
}

/* Close whatever sheets are open, one history step at a time. `history.back()`
   is ASYNCHRONOUS: a `while (querySelector('.sheet')) history.back()` inside one
   page.evaluate never yields, so the DOM it is testing can never change and the
   renderer spins forever. It hung this audit on its first run. */
async function closeSheets(max = 6) {
  for (let i = 0; i < max; i++) {
    const open = await page.evaluate(() => !!document.querySelector('#sheets .sheet'));
    if (!open) return true;
    await page.evaluate(() => history.back());
    await sleep(700);
  }
  return false;
}

function grade(tag, m) {
  const text = m.text || '';
  const chars = text.length;
  const words = text.split(/\s+/).filter(Boolean).length;
  ok(`${tag} SPEAKS  something visible answers the tap`, m.visible === true, JSON.stringify(text.slice(0, 120)));
  ok(`${tag} FLOOR   >= ${FLOOR_CHARS} chars and >= ${FLOOR_WORDS} words`,
    chars >= FLOOR_CHARS && words >= FLOOR_WORDS, `${chars} chars / ${words} words`);
  ok(`${tag} CEILING <= ${CEIL_CHARS} chars`, chars <= CEIL_CHARS, `${chars} chars`);
  ok(`${tag} PLAIN   no machine string leaked`, !MACHINE.test(text), (text.match(MACHINE) || ['clean'])[0]);
}

/* Reject the NEXT write to one store, exactly the way a full origin quota does. */
async function failNextPut(store) {
  await page.evaluate(async (s) => {
    const d = await import('./js/db.js');
    if (!window.__realPut) {
      window.__realPut = d.db.put.bind(d.db);
      d.db.put = (st, val) => {
        if (window.__failStore && st === window.__failStore) {
          window.__failStore = null;
          return Promise.reject(new DOMException('The quota has been exceeded.', 'QuotaExceededError'));
        }
        return window.__realPut(st, val);
      };
    }
    window.__failStore = s;
  }, store);
}
const rows = store => page.evaluate(async s => (await (await import('./js/db.js')).db.all(s)).length, store);
const tap = sel => page.evaluate(s => { const b = document.querySelector(s); if (b) { b.click(); return true; } return false; }, sel);
const setVal = (sel, v) => page.evaluate((s, val) => {
  const i = document.querySelector(s);
  if (!i) return false;
  i.value = val;
  i.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
}, sel, v);

// ---------------------------------------------------------------- QUICKADD ---
{
  await page.evaluate(() => { location.hash = '#/today'; });
  await sleep(1600);
  await tap('[data-addmeal]');
  await sleep(1500);
  const opened = await tap('#actQuick');
  await sleep(1400);
  const typed = await setVal('#qaKcal', '420');
  const before = await rows('log');
  await quiet();
  await failNextPut('log');
  const submitted = await tap('#qaAdd');
  await sleep(1600);
  const m = await readToast();
  const after = await rows('log');
  const sheetUp = await page.evaluate(() => !!document.querySelector('#qaAdd'));
  ok('QUICKADD-CONTROL the sheet opened, a number was typed, the write was refused',
    opened && typed && submitted && after === before, `opened=${opened} typed=${typed} submitted=${submitted} rows ${before}->${after}`);
  grade('QUICKADD', m);
  ok('QUICKADD LANDING the sheet stays open so the player has somewhere to retry', sheetUp === true, String(sheetUp));
  await closeSheets();
}

// ------------------------------------------------------------------ WEIGHT ---
{
  await page.evaluate(() => { location.hash = '#/progress'; });
  await sleep(2200);
  const opened = await tap('#logWeight');
  await sleep(1400);
  const typed = await setVal('#wVal', '82.5');
  const before = await rows('weights');
  await quiet();
  await failNextPut('weights');
  const submitted = await tap('#wSave');
  await sleep(1600);
  const m = await readToast();
  const after = await rows('weights');
  const sheetUp = await page.evaluate(() => !!document.querySelector('#wSave'));
  ok('WEIGHT-CONTROL the sheet opened, a weight was typed, the write was refused',
    opened && typed && submitted && after === before, `opened=${opened} typed=${typed} submitted=${submitted} rows ${before}->${after}`);
  grade('WEIGHT', m);
  ok('WEIGHT LANDING the sheet stays open with the number still in it', sheetUp === true, String(sheetUp));
  await closeSheets();
}

// -------------------------------------------------------------------- FOOD ---
{
  await page.evaluate(() => { location.hash = '#/foods'; });
  await sleep(2200);
  const opened = await tap('#newFood');
  await sleep(1500);
  const named = await setVal('#ffName', 'Audit Bar');
  const typed = await setVal('#ffKcal', '210');
  const before = await rows('foods');
  await quiet();
  await failNextPut('foods');
  const submitted = await tap('#ffSave');
  await sleep(1600);
  const m = await readToast();
  const after = await rows('foods');
  const formUp = await page.evaluate(() => !!document.querySelector('#ffSave'));
  ok('FOOD-CONTROL the form opened, was filled in, and the write was refused',
    opened && named && typed && submitted && after === before,
    `opened=${opened} filled=${named && typed} submitted=${submitted} rows ${before}->${after}`);
  grade('FOOD', m);
  ok('FOOD LANDING the form stays open so nothing typed is lost', formUp === true, String(formUp));
  await closeSheets();
}

// ------------------------------------------------------------------- RELOG ---
{
  /* "Log it again" only renders a [data-relog] row for a recent entry with no
     food behind it, which is a quick add. The demo profile logs everything
     against a food id, so the row never appeared and the CONTROL below caught
     that the scenario had not run at all rather than passing on an empty sample
     (rule 3). Plant one quick-add row and the real render path does the rest. */
  await page.evaluate(async () => {
    const d = await import('./js/db.js');
    await d.db.put('log', {
      id: 'audit-relog', date: new Date().toISOString().slice(0, 10), meal: 0,
      ts: Date.now(), foodId: null, name: 'Audit Quick', portionLabel: '',
      kcal: 300, p: 10, c: 30, f: 8,
    });
  });
  await page.evaluate(() => { location.hash = '#/today'; });
  await sleep(1800);
  await tap('[data-addmeal]');
  await sleep(2000);
  const found = await page.evaluate(() => !!document.querySelector('[data-relog]'));
  if (!found) {
    ok('RELOG-CONTROL a re-log row was on offer', false, 'no [data-relog] row rendered');
  } else {
    const before = await rows('log');
    await quiet();
    await failNextPut('log');
    const submitted = await tap('[data-relog]');
    await sleep(1600);
    const m = await readToast();
    const after = await rows('log');
    ok('RELOG-CONTROL a re-log row was tapped and the write was refused',
      submitted && after === before, `submitted=${submitted} rows ${before}->${after}`);
    grade('RELOG', m);
  }
  await closeSheets();
}

// ------------------------------------------------------------------- CRATE ---
{
  await page.evaluate(() => { location.hash = '#/bonehead'; });
  await sleep(2000);
  await tap('.ch-tab[data-tab="crates"]');
  await sleep(2000);
  const id = await page.evaluate(() => document.querySelector('[data-open]')?.dataset.open || null);
  let gone = false;
  if (id) {
    // pull the row out from under the button: exactly what a double tap does
    gone = await page.evaluate(async (invId) => {
      const d = await import('./js/db.js');
      await d.db.del('inv', invId);
      return !(await d.db.all('inv')).some(r => r.id === invId);
    }, id);
  }
  await quiet();
  const submitted = id ? await tap(`[data-open="${id}"]`) : false;
  await sleep(2200);
  const m = await readToast();
  const dead = await page.evaluate(inv => {
    const b = document.querySelector(`[data-open="${inv}"]`);
    return b ? b.disabled : 'gone-from-dom';
  }, id);
  ok('CRATE-CONTROL a crate button existed, its row was really removed, and it was tapped',
    !!id && gone && submitted, `id=${id} rowRemoved=${gone} tapped=${submitted}`);
  grade('CRATE', m);
  ok('CRATE LANDING the button is not left dead (rule 8: degrade to ugly, never to stuck)',
    dead === false || dead === 'gone-from-dom', String(dead));
}

// ------------------------------------------------------------------- VIGOR ---
{
  const planted = await page.evaluate(async () => {
    const d = await import('./js/db.js');
    await d.db.put('inv', { id: 'audit-vigor', kind: 'vigor', source: 'audit', ts: Date.now() });
    return true;
  });
  await tap('.ch-tab[data-tab="wardrobe"]');
  await sleep(1400);
  await tap('.ch-tab[data-tab="crates"]');
  await sleep(2000);
  const btn = await page.evaluate(() => !!document.querySelector('#useVigor'));
  const removed = await page.evaluate(async () => {
    const d = await import('./js/db.js');
    await d.db.del('inv', 'audit-vigor');
    return !(await d.db.all('inv')).some(r => r.id === 'audit-vigor');
  });
  await quiet();
  const submitted = await tap('#useVigor');
  await sleep(1800);
  const m = await readToast();
  ok('VIGOR-CONTROL the draught button rendered, its row was removed, and it was tapped',
    planted && btn && removed && submitted, `planted=${planted} button=${btn} removed=${removed} tapped=${submitted}`);
  grade('VIGOR', m);
}

// ------------------------------------------------------------------ IMPORT ---
{
  await page.evaluate(() => { location.hash = '#/settings'; });
  await sleep(2400);
  await quiet();
  const handed = await page.evaluate(() => {
    const inp = document.getElementById('importFile');
    if (!inp) return false;
    const dt = new DataTransfer();
    // the likeliest real failure: the player picks the wrong file
    dt.items.add(new File(['<!doctype html><html><body>not a backup</body></html>'], 'holiday-photo.html', { type: 'text/html' }));
    inp.files = dt.files;
    inp.dispatchEvent(new Event('change', { bubbles: true }));
    return inp.files.length === 1;
  });
  await sleep(1800);
  const m = await readToast();
  const cleared = await page.evaluate(() => {
    const inp = document.getElementById('importFile');
    return inp ? inp.value === '' : 'no-input';
  });
  ok('IMPORT-CONTROL a non-backup file really reached the import handler', handed === true, String(handed));
  grade('IMPORT', m);
  ok('IMPORT LANDING the picker is reset, so picking a file again re-fires (a dead retry is a second failure)',
    cleared === true, String(cleared));
}

ok('NO-THROW nothing escaped to the page during any of the seven scenarios',
  pageErrs.length === 0, pageErrs.slice(0, 2).join(' | ') || 'none');

await browser.close();
srv?.close?.();
console.log(`\n${fails.length ? `FAILED ${fails.length}:\n  ${fails.join('\n  ')}` : 'ALL GREEN: every driven failure speaks, in words, within bounds'}`);
process.exit(fails.length ? 1 : 0);
