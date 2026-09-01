/* Show the badge wall with the four Warden badges EARNED, so Tom sees them as a
 * player would rather than greyed out. */
import { boot, sleep, serveTree } from './godmode.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const DIR = '/private/tmp/claude-502/-Users-tommiller-Documents-Hyperframes-Editor/a40abded-9d02-469c-8111-2200136500f1/scratchpad/shots';
/* argv FIRST, env.URL second: the convention error-telemetry-audit and
   year-readout-audit already use. Reading env.URL ONLY meant that any run passing
   the URL as an argument (which is how the release gate invokes every suite) fell
   through to godmode's boot() default, https://tommillerca.github.io/tally/, and
   graded PRODUCTION while reading as coverage of the tree under test.
   AND NEITHER IS SET IS THE SAME BUG, 2026-09-01. The paragraph above closed the
   argv half and left the default alone, so a bare `node tests/badges-audit.mjs`
   still shot the live site: every prove-red run in a worktree proved nothing
   about the worktree. Self-serve this checkout when given no URL, the way
   looks-door-audit and kitchen-queue-audit already do. */
const srv = (process.argv[2] || process.env.URL)
  ? null
  : await serveTree(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));
const { browser, page } = await boot(process.argv[2] || process.env.URL || srv.url);
let bad = 0;
const check = (l, ok, d = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${l}${d ? '  ' + d : ''}`); if (!ok) bad++; };

// award the four through the real ledger so they show as earned
await page.evaluate(async () => {
  const { db } = await import('./js/db.js');
  const { dateKey } = await import('./js/nutrition.js');
  for (const id of ['warden-7', 'warden-30', 'warden-100', 'siege-1'])
    await db.put('xp', { key: 'badge-' + id, type: 'badge', xp: 25, date: dateKey(), note: id });
});
/* THE DOOR MOVED, AND THE MISS WAS SILENT. Measured 2026-09-01: this walked to
   '#/bonehead' and clicked `#chTabs .ch-tab[data-tab="progress"]`, and that chip
   came off the hub row on 2026-08-17 with LEVEL (see the note beside #chTabs in
   app.js: the SCREEN is still rendered and still reachable, only its chip went).
   `?.click()` swallowed the miss, so the run sat on Wardrobe and read 0 badges of
   any kind: `"total": 0`. The wall itself was never broken. On the same tree the
   Progress screen draws 29 badges with all four Warden tiles earned and drawn.
   Drive the door a player actually uses, Progress then its BADGES "Details" link,
   and ASSERT the control before clicking it, because a navigation that quietly
   does nothing reads for weeks as a broken app. */
await page.evaluate(() => { location.hash = '#/progress'; });
await sleep(1800);
const door = await page.evaluate(() => { const b = document.querySelector('#openProg'); if (!b) return false; b.click(); return true; });
await sleep(2200);

const d = await page.evaluate(() => {
  /* PICK THE FOUR BY data-badge, NOT BY RENDERED TEXT. The old filter compared
     `textContent.trim()` to the badge NAME, and a badge whose icon has fallen
     back to a system emoji renders that emoji INSIDE the button, so its text
     becomes "\u{1F3DA}Warden" and it drops straight out of the sample. That is
     precisely the defect the icon row below exists to catch, so the filter
     emptied the sample exactly when it mattered: measured 2026-09-01 in a
     throwaway tree with the tombstone mapping deleted from BADGE_ICON, Warden
     vanished from `found` and the icon row graded the three tiles that were
     still fine. Four regressed at once and it would have graded []. The id is
     the tile's identity and no rendering bug can move it. */
  const wanted = ['warden-7', 'warden-30', 'warden-100', 'siege-1'];
  const all = [...document.querySelectorAll('.badge')];
  const mine = wanted.map(id => all.find(b => b.dataset.badge === id)).filter(Boolean);
  return {
    total: all.length,
    found: mine.map(b => ({
      name: b.textContent.trim(),
      earned: !b.classList.contains('locked'),
      drawn: !!b.querySelector('.bicon svg'),
      rawEmoji: /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(b.querySelector('.bicon')?.textContent || ''),
    })),
  };
});
console.log(JSON.stringify(d, null, 1));
check('the Details door into the badge wall is on the Progress screen', door);
check('all four Warden badges are on the wall', d.found.length === 4, `${d.found.length} of 4`);
/* EVERY() IS TRUE ON THE EMPTY SET, so for as long as the navigation above was
   broken both rows below said ok while measuring nothing: the icon row printed
   its own detail as a literal `[]` and still passed. Only the count row noticed.
   The sample size is now part of each predicate rather than a separate row,
   because a row that grades nothing must fail ITSELF, not rely on a neighbour
   failing. Same wound as tally/CLAUDE.md rules 1 and 3: an empty sample is a
   failure, never a pass. */
check('they show as earned', d.found.length === 4 && d.found.every(b => b.earned), `${d.found.filter(b => b.earned).length} of ${d.found.length} earned`);
check('each one draws a pack icon, not a system emoji', d.found.length === 4 && d.found.every(b => b.drawn && !b.rawEmoji), JSON.stringify(d.found.map(b => [b.name, b.drawn, b.rawEmoji])));

// frame the four so they are legible in the shot (by id, same reason as above)
await page.evaluate(() => {
  document.querySelector('.badge[data-badge="warden-7"]')?.scrollIntoView({ block: 'center' });
});
await sleep(600);
const grid = await page.$('.badge-grid');
if (grid) { await grid.screenshot({ path: `${DIR}/badges.png` }); console.log('shot badges'); }
await browser.close();
srv?.close();
console.log(bad ? `\n${bad} FAILED` : '\nWARDEN BADGES RENDER AS DRAWN ICONS');
process.exit(bad ? 1 : 0);
