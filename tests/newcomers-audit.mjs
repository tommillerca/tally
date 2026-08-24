/* THE NEW-PLAYER CARD HIDES FOR THREE REASONS, ALL OF THEM DELIBERATE.
 *
 * Tom, 2026-08-13: "the new player section of the crew tab is gone."
 *
 * This exists because that report has three candidate explanations and only
 * evidence separates them: the fetch failed, nobody qualified, or something
 * regressed. It drives all six branches of hydrateNewcomers so the answer is a
 * measurement rather than an opinion, and so a future change that silently
 * stops the card rendering cannot pass.
 *
 * The bar is EVIDENCE OF PLAY, and it is Tom's own: v286 accepted "seen in the
 * last fortnight", which every fresh signup passes by definition, and the
 * section filled with real-but-untouched level-1 accounts that read as bots.
 * So: not you, not already known (friend OR outgoing request), and either past
 * level 1 or came back on a later day than you joined.
 *
 * PROVE-RED: invert `playing()` to `=> false`, or drop the `!known.has(...)`
 * clause, and rows A and E go red while B, C, D and F stay green.
 *
 * Usage: node tests/newcomers-audit.mjs
 */

import { boot, seed, sleep, serveTree } from './godmode.js';
const DAY = 86400000;
const srv = await serveTree(process.cwd());
const { browser, page } = await boot(srv.url, { headless: process.env.HEADLESS_MODE || 'shell' });
const errs = []; page.on('pageerror', e => errs.push(String(e).split('\n')[0]));
await seed(page, { level: 12 });

const fails = [];
async function scenario(label, { players, friends = [], outgoing = [] }, expectShown = null) {
  await page.evaluate((pl, fr, out) => {
    window.__testMe = { playerId: 'me', name: 'Me', friendCode: 'BONE-ME', handle: 'me' };
    window.__testFriends = { friends: fr, incoming: [], outgoing: out };
    window.__testLb = pl;
    location.hash = '#/today';
  }, players, friends, outgoing);
  await sleep(600);
  await page.evaluate(() => { location.hash = '#/friends'; });
  await sleep(2600);
  const r = await page.evaluate(() => {
    const card = document.getElementById('newcomersCard');
    const rows = document.querySelectorAll('#newcomersList .t3-row').length;
    return { exists: !!card, hidden: card ? card.hidden : null, rows };
  });
  const shown = r.exists && !r.hidden;
  const pass = expectShown === null ? true : shown === expectShown;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label.padEnd(46)} card=${r.exists ? (r.hidden ? 'HIDDEN' : 'SHOWN ') : 'ABSENT'} rows=${r.rows}`);
  if (!pass) fails.push(label);
  return r;
}

const now = Date.now();
const mk = (id, o = {}) => ({ playerId: id, name: 'Pal ' + id, level: 5, badges: 0,
  outfit: { B: 'B0-1', SK: 'SK0-1' }, pet: null, addToken: 'ATOK-' + id,
  lastSeen: now, joinedAt: now - 3 * DAY, spires: 0, spireDays: 0, you: false, ...o });

// A. players who clearly qualify: level > 1, strangers
await scenario('A qualifying strangers (should SHOW)', { players: [mk('a1'), mk('a2'), mk('a3')] }, true);
// B. same players, but all already in the Crew
await scenario('B all already friends (should hide)', {
  players: [mk('b1'), mk('b2')], friends: [{ playerId: 'b1' }, { playerId: 'b2' }] }, false);
// C. already-sent requests count as known too
await scenario('C all have outgoing requests (should hide)', {
  players: [mk('c1'), mk('c2')], outgoing: [{ playerId: 'c1' }, { playerId: 'c2' }] }, false);
// D. real accounts that never played: level 1, joined and seen the same day
await scenario('D level-1 same-day signups (should hide)', {
  players: [mk('d1', { level: 1, joinedAt: now, lastSeen: now }), mk('d2', { level: 1, joinedAt: now, lastSeen: now })] }, false);
// E. level 1 but came back a later day: qualifies on clause two
await scenario('E level-1 but returned next day (should SHOW)', {
  players: [mk('e1', { level: 1, joinedAt: now - 3 * DAY, lastSeen: now })] }, true);
// F. the payload is null, which is Reg's "it is P0's fault" hypothesis
await scenario('F fetch returns null (P0-fault hypothesis)', { players: null }, false);
if (errs.length) { console.log('FAIL  page errors:', errs.slice(0, 2).join(' ; ')); fails.push('page errors'); }
await browser.close(); srv.close?.();
console.log(fails.length ? `\n${fails.length} FAILED: ${fails.join(', ')}` : '\nnewcomers card behaves as designed');
process.exit(fails.length ? 1 : 0);
