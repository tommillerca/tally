/* READINESS HAS TO BE RELATIVE TO YOU, OR IT IS DECORATION.
 *
 * Tom, 2026-08-12: "is it actually accurate or is it bs? It's a massive part
 * of the fitness side of the app so I want it to be actually useful."
 *
 * The audit that prompted this found the shape was right (baseline-relative,
 * HRV and RHR, sane clamps) and the wiring was not:
 *   1. The baseline INCLUDED the latest reading, so today was compared against
 *      a set containing itself. Every delta is pulled toward zero, hardest
 *      when readings repeat, which is exactly when a watch syncs sparsely.
 *   2. Day one printed a confident 72 ("READY") off a baseline of one.
 *   3. The RHR and HRV tiles rendered undated, so a week-old reading looked
 *      like this morning's.
 *   4. A 35-minute nap scored 40 and was fed in as a night's sleep.
 *
 * These are measured against the REAL function in the running app, by seeding
 * health rows and reading what the screen actually says. The discriminating
 * case is DEGENERATE DATA: a player whose readings barely move. Under the old
 * maths their score is pinned near 72 forever no matter what their body does,
 * which is the failure that makes the number decoration.
 *
 * PROVE-RED: put the latest reading back into its own baseline and case 1
 * fails; drop the calibrating gate and case 2 fails.
 *
 * Usage: node tests/readiness-audit.mjs [baseUrl]   (serves this repo if omitted)
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boot, sleep, serveTree } from './godmode.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argUrl = process.argv.slice(2).find(a => !a.startsWith('--'));
const srv = argUrl ? null : await serveTree(ROOT);
const base = argUrl || srv.url;

const fails = [];
const ok = (n, p, d = '') => { console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${d ? '  ' + d : ''}`); if (!p) fails.push(n); };

const { browser, page } = await boot(base);

/* Seed health rows straight into the demo database, then read the score the
   app computes. `rhr` is a list of resting-HR values, oldest first, one per
   day ending today. */
const seedHealth = (rhr, hrv, extra = {}) => page.evaluate(async ({ rhr, hrv, extra }) => {
  const db = await new Promise((res, rej) => { const r = indexedDB.open('tally-demo'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  await new Promise((res, rej) => { const tx = db.transaction('health', 'readwrite'); tx.objectStore('health').clear(); tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
  /* LOCAL, not UTC (godmode.js's localDay says why at length). This runs in page
     context so it cannot import it. At 21:5x EDT toISOString dated the seeded
     "today" as tomorrow, so the one differing reading never became `latest`,
     every delta cancelled, and better/flat/worse all scored the base 72. */
  const dk = n => { const d = new Date(); d.setDate(d.getDate() - n);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const rows = rhr.map((v, i) => ({ date: dk(rhr.length - 1 - i), restingHr: v, hrv: hrv[i], ...(i === rhr.length - 1 ? extra : {}) }));
  await new Promise((res, rej) => { const tx = db.transaction('health', 'readwrite'); rows.forEach(r => tx.objectStore('health').put(r)); tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
  db.close();
  return rows.length;
}, { rhr, hrv, extra });

/* RELOAD AFTER SEEDING, ALWAYS. The app reads the health store once during
   boot, so writing rows and re-routing renders the numbers it already had:
   the first version of this file reported "calibrating" against twenty
   seeded days and would have read as the fix failing. */
const readCard = async () => {
  await page.reload({ waitUntil: 'domcontentloaded' });
  await sleep(2600);
  await page.evaluate(() => { location.hash = '#/progress'; });
  await sleep(2800);
  return page.evaluate(() => {
  const card = document.querySelector('.rd-card');
  const txt = card ? card.innerText.replace(/\s+/g, ' ') : '';
  const num = card ? card.querySelector('.rd-score, .rd-big, .rd-num') : null;
  return {
    present: !!card,
    calibrating: !!card && card.classList.contains('rd-calibrating'),
    text: txt.slice(0, 220),
    score: num ? parseInt(num.textContent, 10) : null,
  };
  });
};
const scoreFor = async (rhr, hrv, extra = {}) => { await seedHealth(rhr, hrv, extra); return readCard(); };

const flat = n => Array(n).fill(60);
const flatH = n => Array(n).fill(45);

/* 1. CALIBRATING: three days of data cannot produce a verdict. */
const few = await scoreFor(flat(3), flatH(3));
ok('SETUP the readiness card renders at all', few.present, few.text.slice(0, 60));
ok('CALIBRATING too few prior days says so instead of printing a number', few.calibrating, few.text.slice(0, 120));

/* 2. DEGENERATE DATA: readings that never move must NOT read as a verdict
      about the body. With the latest value inside its own baseline the deltas
      cancel and this lands on the hardcoded middle (72 = "READY"). */
const deg = await scoreFor(flat(20), flatH(20));
ok('SETUP degenerate data still produces a card', deg.present && !deg.calibrating, `score=${deg.score}`);

/* 3. THE REAL TEST: an identical player except today's reading is genuinely
      better (lower resting HR, higher HRV) must score HIGHER than the flat
      player. If the latest reading sits in its own baseline, these two
      converge and the difference collapses. */
const better = await scoreFor([...flat(19), 50], [...flatH(19), 62]);
const worse = await scoreFor([...flat(19), 72], [...flatH(19), 30]);
ok('a genuinely better day scores ABOVE a flat baseline', better.score > deg.score, `better=${better.score} flat=${deg.score}`);
ok('a genuinely worse day scores BELOW a flat baseline', worse.score < deg.score, `worse=${worse.score} flat=${deg.score}`);
/* The size of the spread is the thing that dies when the baseline is polluted:
   with the latest reading included, 20 samples dilute it to almost nothing. */
ok('and the spread is big enough to be a real signal, not a rounding wobble', (better.score - worse.score) >= 12,
  `spread=${better.score - worse.score} (better=${better.score} worse=${worse.score})`);

/* 4. A NAP IS NOT A NIGHT: 35 minutes must not be scored as sleep. */
const nap = await scoreFor(flat(20), flatH(20), { sleepMin: 35 });
ok('a 35-minute nap does not drag the score as if it were a night', nap.score === deg.score,
  `withNap=${nap.score} withoutSleep=${deg.score}`);

console.log(`\n${fails.length ? `${fails.length} FAILED` : 'ALL PASS'}`);
await browser.close();
srv?.close();
process.exit(fails.length ? 1 : 0);
