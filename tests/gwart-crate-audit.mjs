/* THE CRATE REMINDER FIRES ONCE PER APP OPEN, AND HE KEEPS TALKING AFTERWARDS.
 *
 * Tom, 2026-08-22: "If you have an unopened crate it's all Gwart talks about
 * that many reminders is annoying." The crate bucket is gwartPool's top
 * early-return, so while a crate sat unopened it swallowed every other state:
 * the bag cycled its eight lines and he never said anything else all session.
 * The fix caps it in gwartLine (gwCrateNagged, the gwEntranceSeen idiom), which
 * is the one path all three speaking callers take, so the cap holds wherever he
 * speaks and not only on the render the bug was reported from.
 *
 * DRIVEN THROUGH THE REAL CONTROL. The crate is granted through the app's own
 * grantCrate, a real reload starts the session under test (a fresh module is a
 * fresh flag, which is what "per app open" means), and the plaque is tapped with
 * real mouse clicks at its own coordinates. Nothing here calls gwartLine.
 *
 * THE OUTCOME READ is .tb-line's data-tb, which is the whole target line the
 * app's own render handed the typer, so this is state and not a race against an
 * animation (js/talkbox.js sets it synchronously in runTalkBox).
 *
 * TWO DIRECTIONS, because a cap that silences him is not a fix:
 *   ONCE / ONCE-TAPS   the crate reminder appears at most once, and the once is
 *                      the line he opens with, so the player is still told.
 *   VOICE              the taps after it come back from the REST of the
 *                      catalogue, with real variety, rather than a stuck line.
 * CONTROL is the blind-detector guard: the opening line must itself be a crate
 * line. That fails loudly if the seeded crate never reached Gwart's context or
 * if CRATE_LINES drifts from the catalogue, either of which would otherwise make
 * ONCE pass by finding nothing. If the crate copy is rewritten, fix CRATE_LINES;
 * never loosen ONCE.
 *
 * PROVEN RED against the pre-fix js/app.js (d8819940) in a throwaway tree seeded
 * with `git archive HEAD` + `git show d8819940:js/app.js`: every one of the ten
 * taps comes back from the crate bucket, so ONCE fails at 11 crate lines of 11,
 * ONCE-TAPS fails on all ten taps and VOICE fails at 0 non-crate lines. An empty
 * sample fails SAMPLE rather than passing on nothing.
 *
 * Run: node tests/gwart-crate-audit.mjs [baseUrl]   (serves this repo if omitted)
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boot, sleep, serveTree, dismissOverlays } from './godmode.js';

const argv = process.argv[2] || process.env.URL;
const srv = argv ? null : await serveTree(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));
const base = argv || srv.url;
const fails = [];
const ok = (name, pass, detail = '') => { console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`); if (!pass) fails.push(name); };

/* The crate bucket, verbatim from gwartPool (js/app.js). CONTROL goes red if
   this drifts from the catalogue.
   PROVENANCE: copied from gwartPool's crate bucket and verified against it
   2026-08-22, when the 21 Gwart lines were rewritten from resigned to wry
   (Tom: "the lines feel a little sad or something, let's make them a bit
   lighter"). This is a MIRROR of production data, not a decision: when gwartPool
   changes, this list changes with it and CONTROL is what catches the drift. */
const CRATE_LINES = [
  'A crate by his feet, still shut. I gave him hands for this.',
  'That crate has been there since I arrived. I am curious.',
  'Nobody was ever dressed by a crate that stayed shut.',
  'The crate is not a decoration. It opens.',
  'Open the crate. I want to see what he is wearing next.',
  'Open it. I have a guess about what is in there.',
  'Whatever is in there is already yours. Go and look.',
  'A shut crate is just a box. Make it something else.',
];

const { browser, page } = await boot(base);

/* Grant through the app's own path, then a REAL reload: the flag is module
   state, so the session under test has to OPEN with the crate already in the
   bag, exactly as a player's does. */
await page.evaluate(async () => { const l = await import('./js/loot.js'); await l.grantCrate('daily', 'gwart-crate-audit'); });
await page.reload({ waitUntil: 'networkidle2' });
await sleep(2600);
await dismissOverlays(page);

const crateCount = await page.evaluate(async () => (await (await import('./js/loot.js')).unopenedCrates()).length);
ok('SETUP an unopened crate is really in the bag', crateCount >= 1, `${crateCount} unopened`);

const line = () => page.evaluate(() => document.querySelector('.gw-box .tb-line')?.dataset.tb || '');
const opening = await line();
ok('SETUP Gwart is on Today with a line on the box', opening.length > 0, `"${opening.slice(0, 60)}"`);
ok('CONTROL the opening line of the session IS the crate reminder (the state reached Gwart, and CRATE_LINES still matches the catalogue)',
  CRATE_LINES.includes(opening), `"${opening.slice(0, 70)}"`);

/* TEN REAL TAPS ON THE TALK BOX, one app open.
   IT USED TO TAP THE PLAQUE, and the plaque stopped being this control on
   2026-08-23: Tom, 2026-08-22, "clicking on gwart should take you to an
   explainer FAQ page", so #gwartBtn opens Gwart's Guide now and the box he is
   speaking out of advances the line instead (renderToday, and the .gw-row
   .gw-box.tb-done rule in app.css). NOTHING ABOUT WHAT THIS FILE GRADES MOVED:
   the cap still lives in gwartLine, the box tap is still one of the three real
   callers, and this is still a real mouse click at a real control's coordinates
   rather than a call to gwartLine. Repointing the driver is the correct response
   to a superseded instruction; loosening ONCE would not have been.

   WAIT FOR tb-done, which the old 260ms did not have to. The box only takes
   pointer events once the typer has finished with it, so a click fired mid-type
   lands on a pointer-events:none element and the tap silently does nothing. */
const tap = async () => {
  const at = await page.evaluate(async () => {
    for (let i = 0; i < 40; i++) {
      const b = document.querySelector('.gw-row .gw-box.tb-done');
      const r = b?.getBoundingClientRect();
      if (r && r.width) return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      await new Promise(r2 => setTimeout(r2, 100));
    }
    return null;
  });
  if (!at) return false;
  await page.mouse.click(at.x, at.y);
  await sleep(260);
  return true;
};

const taps = [];
for (let i = 0; i < 10; i++) {
  if (!await tap()) break;
  taps.push(await line());
}
ok('SAMPLE ten taps each produced a line (an empty sample is a failure, never a pass)',
  taps.length === 10 && taps.every(l => l.length > 0), `${taps.filter(Boolean).length}/10 lines`);

const all = [opening, ...taps];
const crateHits = all.filter(l => CRATE_LINES.includes(l));
ok('ONCE the crate reminder fired at most once this app open', crateHits.length <= 1,
  `${crateHits.length} crate lines across ${all.length} sampled`);
ok('ONCE-TAPS and the once was the opening line: no tap brought it back',
  taps.length > 0 && taps.every(l => !CRATE_LINES.includes(l)),
  `${taps.filter(l => CRATE_LINES.includes(l)).length} of ${taps.length} taps were crate lines`);
const others = new Set(taps.filter(l => l && !CRATE_LINES.includes(l)));
ok('VOICE he still has plenty to say once the crate drops out (a cap that silences him is not a fix)',
  others.size >= 4, `${others.size} distinct non-crate lines: ${[...others].slice(0, 2).map(l => `"${l.slice(0, 40)}"`).join(' ')}`);

console.log(`\n${fails.length ? `${fails.length} FAILED` : 'ALL PASS'}`);
await browser.close();
srv?.close();
process.exit(fails.length ? 1 : 0);
