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

/* ONE TAP, ONE ARENA. Added 2026-09-01 with the atomic Pit charge.
 *
 * startPit is async and the FIGHT buttons are never disabled, so both taps of a
 * double tap ran the whole body before either arena appeared. Measured on
 * origin/main 3d4b208c through this exact path, with TWO charges in hand: two
 * clicks in one task left TWO #youStage arenas on screen against ONE charge off
 * the meter, because the read-modify-write spend lost one of its own updates.
 * It takes both fixes to hold: with the atomic spend in and the re-entrancy
 * guard out, the same double tap opens two arenas and honestly charges two.
 *
 * TWO CHARGES, NOT ONE, and that is deliberate. On a one-charge account the
 * atomic spend refuses the second tap on its own, so the guard is invisible and
 * the row would grade half the fix. With change in hand the guard is the only
 * thing standing between one tap-tap and two arenas.
 *
 * THE MEASURE IS THE WHOLE METER (free + banked Vigor), never freeUsed. The
 * first cut of this row counted the free floor alone and read "two arenas, one
 * charge" on a healthy build, because opening the Pit runs refreshPitEnergy and
 * the demo save's steps had quietly paid Vigor: the second spend was legal and
 * came out of a column the check could not see. fromSteps is pinned at the cap
 * below so that refresh grants nothing while this runs.
 *
 * THE CONTROL is a SINGLE tap on the same screen in the same session: one arena,
 * one charge. Without it a button that does nothing at all scores a perfect
 * double-tap row. */
const tapProbe = async (taps) => {
  /* CLOSE FIRST, THEN RESET, and the order is load-bearing. Abandoning a live
     staked fight is a forfeit, so the sheet's own onClose writes 'pitFight' on
     the way out. Resetting before the close let that write land AFTER the reset,
     and the next tap was correctly routed to the DOWN, NOT OUT panel instead of
     opening an arena: the control read arenas 0, spent 0 on a healthy build. */
  for (let i = 0; i < 4; i++) {
    const closed = await page.evaluate(() => {
      const s = [...document.querySelectorAll('#sheets .sheet-close')];
      if (!s.length) return false; s[s.length - 1].click(); return true;
    });
    if (!closed) break;
    await sleep(600);
  }
  await page.evaluate(async () => {
    const [db, nutrition, energy] = await Promise.all([
      import('/js/db.js'), import('/js/nutrition.js'), import('/js/energy.js')]);
    // TWO free fights in hand, no banked Vigor, no unacknowledged loss in the
    // way, and fromSteps at the cap so a refresh on the way in pays nothing
    await db.kvSet('pitEnergy', { date: nutrition.dateKey(), freeUsed: energy.FREE_FIGHTS - 2, vigor: 0, fromSteps: energy.STEP_VIGOR_CAP, fromLog: 0 });
    await db.kvSet('pitFight', null);
  });
  await page.evaluate(() => { location.hash = '#/'; });
  await sleep(1200);
  await page.evaluate(() => document.querySelector('#pitBtn')?.click());
  await sleep(1600);
  // the whole meter, read AFTER the Pit rendered (renderPit runs refreshPitEnergy)
  const readyBefore = await page.evaluate(async () => (await (await import('/js/energy.js')).pitEnergy()).ready);
  const fired = await page.evaluate(n => {
    const b = document.querySelector('button[data-rung]:not([disabled])');
    if (!b) return 0;
    // in ONE task: the second click lands before the first handler's first await
    // has settled, which is what a double tap on a phone actually is
    for (let i = 0; i < n; i++) b.click();
    return n;
  }, taps);
  await sleep(3600);
  const readyAfter = await page.evaluate(async () => (await (await import('/js/energy.js')).pitEnergy()).ready);
  const arenas = await page.evaluate(() => document.querySelectorAll('#youStage').length);
  return { fired, readyBefore, spent: readyBefore - readyAfter, arenas };
};
const twice = await tapProbe(2);
ok('ONE-TAP with TWO charges in hand a double tap on a rung opens ONE arena and spends ONE charge',
  twice.fired === 2 && twice.readyBefore === 2 && twice.arenas === 1 && twice.spent === 1, JSON.stringify(twice));
const once = await tapProbe(1);
ok('CONTROL a single tap on the same button DOES open an arena and DOES spend a charge, so the row above is not passing on a dead button',
  once.fired === 1 && once.readyBefore === 2 && once.arenas === 1 && once.spent === 1, JSON.stringify(once));

ok('no page errors', (errors || []).length === 0, (errors || [])[0] || '');

await browser.close();
console.log(fails.length ? `\n${fails.length} FAILED: ${fails.join(', ')}` : '\nthe pit keeps up');
process.exit(fails.length ? 1 : 0);
