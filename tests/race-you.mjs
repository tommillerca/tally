/* YOU ARE ALWAYS ON YOUR OWN STEP-RACE BOARD.
 *
 * Tom, 2026-08-07: "ship the fix to the step race before you do anything else
 * right now it shows no leaders we cant keep fucking this up."
 *
 * The board is server-ranked, and the server can legitimately leave you off it:
 * your push may not have landed yet, or (from v300) your total is gated out
 * because your app counted it under older rules. Both are correct server
 * behaviour and both produce the same thing on the phone: a board with no lanes
 * saying "Nobody has walked a step yet", to a player who has personally walked
 * thousands. That is not a stale number, it is a false statement.
 *
 * So the client splices its own count in from local truth and re-ranks. This
 * test drives the real Crew tab with a REAL board response that does not contain
 * you, which is the failing case, and asserts you are in it anyway.
 *
 * PROVE-RED (confirmed 2026-08-07): delete the `if (!rows.some(p => p.you))`
 * block from hydrateRace and both LANE checks fail with your lane missing and the
 * banner reading "Nobody has walked a step yet".
 *
 * Usage: node tests/race-you.mjs
 */
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { boot, seed, sleep, serveTree} from './godmode.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let srv = null, srvHandle = null;
let base = process.env.URL;
if (!base) {
  /* serveTree: a free port from the OS, and a HARD ERROR if python never
     bound. The hard-coded port with stdio:'ignore' meant a stranded server
     already holding it made this audit talk to whatever was listening. */
  srvHandle = await serveTree(ROOT);
  srv = { kill: () => srvHandle.close() };
  base = srvHandle.url;
}
const results = [];
const ok = (name, pass, detail = '') => { results.push({ name, pass }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`); };

const { browser, page } = await boot(base);
await page.setViewport({ width: 393, height: 852, deviceScaleFactor: 2, isMobile: true, hasTouch: true });

/* A board with two other racers and NO row for you: exactly what the server
   returns while your own total is unranked. Everything else on the response is
   shaped like the real endpoint so the banner renders its real markup. */
await page.setRequestInterception(true);
page.on('request', req => {
  // the signed request carries custom headers, so the browser preflights it:
  // answer OPTIONS properly or the fetch throws and this tests nothing
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,PUT,POST,OPTIONS',
    'Access-Control-Allow-Headers': '*',
  };
  if (req.method() === 'OPTIONS') return req.respond({ status: 204, headers: cors, body: '' });
  if (/\/steps\/week/.test(req.url())) {
    return req.respond({
      status: 200,
      contentType: 'application/json',
      headers: cors,
      body: JSON.stringify({
        week: null,
        players: [
          { rank: 1, name: 'Bony Wrecker', steps: 9000, outfit: { B: 'B0-1', SK: 'SK0-1' }, you: false },
          { rank: 2, name: 'Withered Lich', steps: 1200, outfit: { B: 'B0-1', SK: 'SK0-1' }, you: false },
        ],
        yourRank: null,
        podium: [{ place: '1st', coins: 5000, crate: 'golden', dust: 200 }],
        champion: null,
      }),
    });
  }
  // everything else (including the profile PUT, which must not reach production)
  if (/bonez-api|workers\.dev/.test(req.url())) return req.respond({ status: 500, headers: cors, body: '{}' });
  return req.continue();
});

await seed(page, { level: 14 });
// today's walk, in the same health row the app writes and weekStepsNow sums
await page.evaluate(async () => {
  const { db } = await import('./js/db.js');
  const d = new Date();
  const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  await db.put('health', { date: key, steps: 4200 });
  const { kvSet } = await import('./js/db.js');
  await kvSet('social', { playerId: 'race-you', handle: 'Audit Bones', friendCode: 'BONE-TEST-TEST', name: 'Audit Bones', onlineAt: Date.now() });
});

await page.evaluate(() => { location.hash = '#/friends'; });
await sleep(3000);

const board = await page.evaluate(() => {
  const card = document.querySelector('#raceCard');
  if (!card) return { present: false };
  const lanes = [...card.querySelectorAll('.race-lane')].map(l => ({
    rank: l.querySelector('.rk')?.textContent.trim(),
    name: l.querySelector('.nm b')?.textContent.trim(),
    steps: l.querySelector('.st')?.textContent.trim(),
    you: l.classList.contains('you'),
  }));
  return {
    present: true,
    hidden: card.hidden,
    line: card.querySelector('.gbn-txt small')?.textContent.replace(/\s+/g, ' ').trim() || null,
    lanes,
    emptyCopy: /nobody has walked a step/i.test(card.innerText),
  };
});

ok('BOARD the race card renders at all (an absent card is a FAILURE)', board.present && board.hidden === false,
  JSON.stringify({ present: board.present, hidden: board.hidden }));
ok('BOARD the server\'s own racers are still there', board.lanes.length >= 2,
  `${board.lanes.length} lanes: ${board.lanes.map(l => l.name).join(', ')}`);
/* THE POINT: your 4,200 steps came from this device, not the response. */
const you = board.lanes.find(l => l.you);
ok('LANE you are on the board even though the server left you off', !!you,
  JSON.stringify(board.lanes));
ok('LANE with your real local count, ranked against the rest',
  !!you && /4,200/.test(you.steps || '') && you.rank === '2',
  JSON.stringify(you));
ok('LANE the banner does not tell a walker nobody has walked',
  board.emptyCopy === false && /behind|in front|leads/i.test(board.line || ''), String(board.line));

await browser.close();
if (srv) srv.kill();
const failed = results.filter(r => !r.pass).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
if (!results.length) { console.log('FAIL: no checks ran'); process.exit(1); }
process.exit(failed ? 1 : 0);
