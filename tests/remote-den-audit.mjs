/* THE DAILY REMOTE DEN, AFTER YOU BEAT IT.
 *
 * Tom, 2026-08-10: "once the daily free boss is beaten it should show that not a
 * button that says free to fight again, there's no point to that" and "why is the
 * remote one a day boss in the pit not raising the cap for the other pit ladder
 * like an open world boss should".
 *
 * Both were one bug. The cleared state was written and could never be reached:
 * the card asked pitBeatKeys(), which collects only 'pitrung' and 'pitchamp'
 * rows, while claimDenWin files the remote win as a 'bossday' row under denKey().
 * So the row said "free" forever. The ceiling WAS rising underneath (measured:
 * denWinsCount 0 -> 1 on the broken build) but nothing on screen said so, which
 * is why it read as not counting.
 *
 * Every check here operates the real control and reads the state AFTER the win.
 * Rendering the Pit and looking at it proves nothing: the pre-fix build rendered
 * a perfectly good Pit.
 *
 * PROVE-RED: with `rDone` back on `beaten.has(...)`, "the card shows it is
 * beaten" and "the FIGHT button is gone" both fail.
 */
import { boot, seed, sleep, finishFight, openPit, serveTree } from './godmode.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const fails = [];
const ok = (n, p, d = '') => { console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${d ? '  ' + d : ''}`); if (!p) fails.push(n); };
const argv = process.argv[2] || process.env.URL;
const srvHandle = argv ? null : await serveTree(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));
const base = argv || srvHandle.url;
const { browser, page } = await boot(base);
const errs = []; page.on('pageerror', e => errs.push(String(e)));

await seed(page, { level: 25, coins: 800 });
await openPit(page);
await sleep(1400);

const readRow = () => page.evaluate(async () => {
  const poi = await import('./js/poi.js');
  const sect = [...document.querySelectorAll('.t3-sect')].find(s => /Remote den/i.test(s.textContent));
  const row = sect ? sect.nextElementSibling : null;
  return {
    denWins: await poi.denWinsCount(),
    text: row ? row.innerText.replace(/\s+/g, ' ').trim() : null,
    hasFightBtn: !!document.getElementById('remoteDenBtn'),
    doneClass: row ? row.classList.contains('done') : null,
  };
});

const before = await readRow();
ok('the Pit offers a remote den to fight', before.hasFightBtn && !!before.text, before.text);
/* An empty reward label is a failure, not a pass. denRewardLabel takes the
   REWARD; the call site passed the whole den, so every field read undefined and
   the row rendered a bare "· · free" for months. */
ok('and it says what it pays', !/·\s*·/.test(before.text || '') && /coins|XP|Crate|Egg/i.test(before.text || ''), before.text);

await page.evaluate(() => document.getElementById('remoteDenBtn').click());
await sleep(2000);
await finishFight(page, 'p');
await sleep(3500);
// clear the loot reveal / level-up chain the win opens
for (let i = 0; i < 10; i++) {
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find(x => /^(nice|done|collect|claim|continue|ok|got it|next|back to the pit|keep)$/i.test(x.textContent.trim()));
    if (b) b.click();
  });
  await sleep(600);
}
await page.evaluate(() => document.querySelectorAll('.sheet-close').forEach(b => b.click()));
await sleep(1200);
await openPit(page);
await sleep(1600);

const after = await readRow();
ok('beating it raises the Gauntlet ceiling', after.denWins > before.denWins,
  `${before.denWins} -> ${after.denWins} world-boss wins (cap +${3 * (after.denWins - before.denWins)})`);
ok('the card shows it is beaten', /beaten|tomorrow/i.test(after.text || ''), after.text);
ok('the FIGHT button is gone', !after.hasFightBtn, after.hasFightBtn ? 'still offering a pointless re-fight' : '');
ok('and it points at tomorrow', /tomorrow/i.test(after.text || ''), after.text);

ok('no page errors', errs.length === 0, errs.join(' ; '));
await browser.close();
if (srvHandle) srvHandle.close();
console.log(fails.length ? `\n${fails.length} FAILED: ${fails.join(', ')}` : '\nall green');
process.exit(fails.length ? 1 : 0);
