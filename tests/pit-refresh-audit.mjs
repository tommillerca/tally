/* THE PIT RE-RENDERS WHEN A FIGHT ENDS. Tom, 2026-08-11: "I just beat the live
 * wire in the pit as my free daily remote den it didn't change my cap AND it
 * still says fight after I beat it already."
 *
 * Both halves were ONE bug: the fight's onClose re-rendered the Pit only if
 * `$('.pit-sect', pitWrap)` matched, and the t3 Build rebuild renamed that
 * class to '.t3-sect', so the guard could never match again and the post-fight
 * re-render silently died for EVERY Pit fight. The ledger recorded the win and
 * the ceiling rose; the screen never re-read either. Fourth instance today of
 * a check pinned to an incidental instead of a capability, but this one
 * shipped.
 *
 * This audit drives the REAL path: Today -> The Pit -> the remote den's FIGHT
 * button -> a real win through the state seam (the engine's own damage and
 * settle run) -> close the fight sheet -> assert the still-open Pit now says
 * TOMORROW with no FIGHT button, without any manual reopen.
 *
 * PROVE-RED (performed at build): restore the '.pit-sect' guard and the row
 * keeps offering FIGHT after the win, which is Tom's report verbatim.
 *
 * Run: node tests/pit-refresh-audit.mjs http://127.0.0.1:PORT/
 */
import { boot, seed, sleep } from './godmode.js';

const fails = [];
const ok = (n, p, d = '') => { console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${d ? '  ' + d : ''}`); if (!p) fails.push(n); };
const base = process.argv[2] || process.env.URL;
if (!base) { console.log('FAIL  needs a base URL, no safe default.'); process.exit(1); }

const { browser, page, errors } = await boot(base);
await seed(page, { level: 30, coins: 500, dust: 500 });

/* Today -> The Pit */
await page.evaluate(() => { location.hash = '#/'; });
await sleep(1400);
await page.evaluate(() => document.querySelector('#pitBtn')?.click());
await sleep(1600);
const pit = await page.evaluate(() => ({
  open: !!document.querySelector('#pitBody'),
  fightBtn: !!document.querySelector('#remoteDenBtn'),
  rowText: document.querySelector('#remoteDenBtn')?.closest('.t3-row')?.textContent || '',
}));
ok('the Pit opens with the remote den offering a fight', pit.open && pit.fightBtn, pit.rowText.slice(0, 60));

/* fight it, win for real through the seam (engine's own damage + settle) */
await page.evaluate(() => document.querySelector('#remoteDenBtn')?.click());
await sleep(2400);
const won = await page.evaluate(async () => {
  if (!window.__bhFight) return { why: 'no fight seam: the fight never opened' };
  const over = await window.__bhFight.finish('p');
  return { over: over && over.winner === 'p' };
});
await sleep(1800);   // settle choreography + rewards paint
ok('the remote den fight was actually won', !won.why && won.over === true, won.why || 'winner=p');

/* close ONLY the fight sheet (the top-most), leaving the Pit open beneath */
await page.evaluate(() => {
  const sheets = [...document.querySelectorAll('#sheets .sheet-close')];
  sheets[sheets.length - 1]?.click();
});
await sleep(1200);

/* THE POINT: the still-open Pit must now say beaten, with no re-open */
const after = await page.evaluate(() => {
  const body = document.querySelector('#pitBody');
  const row = body ? [...body.querySelectorAll('.t3-row')].find(r => /remote|beaten|tomorrow/i.test(r.textContent) || r.querySelector('#remoteDenBtn')) : null;
  return {
    pitStillOpen: !!body,
    fightBtnGone: !document.querySelector('#remoteDenBtn'),
    saysTomorrow: !!row && /TOMORROW/i.test(row.textContent),
    rowText: row ? row.textContent.replace(/\s+/g, ' ').slice(0, 90) : '(row not found)',
  };
});
ok('the Pit is still open under the closed fight', after.pitStillOpen, '');
ok('the beaten remote den stops offering FIGHT, without reopening the Pit',
  after.fightBtnGone && after.saysTomorrow, after.rowText);

ok('no page errors', (errors || []).length === 0, (errors || [])[0] || '');

await browser.close();
console.log(fails.length ? `\n${fails.length} FAILED: ${fails.join(', ')}` : '\nthe pit keeps up');
process.exit(fails.length ? 1 : 0);
