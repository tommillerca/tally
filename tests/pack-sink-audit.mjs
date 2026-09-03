/* THE PACK REVEAL RENDERS A PAYLOAD INERT. 2026-09-01.
 *
 * tests/render-sink-lint.mjs pins the SOURCE: no field that can carry another
 * player's text is interpolated raw into markup. That is a shape assertion, and
 * this repo has been bitten by shape assertions staying green over broken state
 * (lessons: "a guard can assert SHAPE, never STATE"). A rename of esc(), a sink
 * moved behind a helper, a second `.pc-stats` writer: all leave the lint green.
 *
 * So this is the other half and it grades PIXELS-adjacent state instead: feed a
 * real payload through the real render and read the real DOM back.
 *
 * WHY THE SEAM. openPackReveal is entered from a crate open, a boss settle or an
 * ingested grant, and none of those can be made to carry an attacker's string
 * from a test. window.__packReveal is not a fixture: it is
 * `(cards, opts) => openPackReveal(cards, opts || {})`, webdriver-gated, so this
 * drives the SHIPPED function with the SHIPPED markup builder. Registered in
 * guard-hygiene-lint's seam inventory with that reason.
 *
 * MEASURED against 996f28b9 (pre-fix): FIRED 1, NODES 2 (one img[onerror] from
 * `stats`, one from `footerNote`), and the legitimate control note rendered
 * WRONG as well, with "<Graveholt>" swallowed as an unknown tag. On this tree:
 * FIRED 0, NODES 0, and the control note reads back verbatim.
 *
 * Usage: node tests/pack-sink-audit.mjs        (URL=... for live)
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boot, sleep, serveTree } from './godmode.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let srvHandle = null;
let base = process.env.URL;
if (!base) { srvHandle = await serveTree(ROOT); base = srvHandle.url; }

const results = [];
const ok = (name, pass, detail = '') => { results.push({ name, pass }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`); };

const { browser, page } = await boot(base);
await page.setViewport({ width: 393, height: 852, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await sleep(1600);
await page.evaluate(() => { location.hash = '#/today'; });
await sleep(1600);

/* Both raw slots at once, with the same payload, so a fix to one and not the
   other cannot read as clean. */
const PAYLOAD = '<img src=x onerror="window.__xssFired=1">';
const hostile = await page.evaluate(async payload => {
  window.__xssFired = 0;
  if (!window.__packReveal) return { err: 'no __packReveal hook' };
  window.__packReveal([{ name: 'x', rarity: 'rare', kind: 'GEAR', stats: payload }], { footerNote: payload });
  await new Promise(r => setTimeout(r, 1400));
  const stats = document.querySelector('.pc-stats');
  const foot = document.querySelector('.pack-coins');
  return {
    fired: window.__xssFired,
    nodes: document.querySelectorAll('.pack-reveal img[onerror]').length,
    statsText: stats ? stats.textContent : null,
    footText: foot ? foot.textContent : null,
  };
}, PAYLOAD);

ok('REACH the seam ran and the reveal painted both slots',
  !hostile.err && hostile.statsText !== null && hostile.footText !== null,
  hostile.err || `stats=${JSON.stringify((hostile.statsText || '').slice(0, 40))} foot=${JSON.stringify((hostile.footText || '').slice(0, 40))}`);
ok('FIRED no handler in the payload ever ran', hostile.fired === 0, `__xssFired=${hostile.fired}`);
ok('NODES the payload created no live element', hostile.nodes === 0, `${hostile.nodes} img[onerror] in the reveal`);
/* The payload has to arrive as VISIBLE TEXT, not merely be absent. A sink that
   dropped the field entirely would satisfy both rows above and lose the real
   sentence a player is supposed to read. */
ok('TEXT the payload reads back as text in both slots',
  (hostile.statsText || '').includes('<img src=x') && (hostile.footText || '').includes('<img src=x'),
  `stats=${JSON.stringify(hostile.statsText)} foot=${JSON.stringify(hostile.footText)}`);

/* CONTROL. Escaping is not free: a legitimate note carrying an ampersand, a
   quote or angle brackets must read as itself and NOT as visible entities. This
   is the row that catches a double-escape, and it is red on the PRE-FIX tree
   too, where the raw sink ate "<Graveholt>" as an unknown tag. */
const LEGIT = 'Bone "Daddy" & Co toppled <Graveholt>. Walk back and take it.';
const legit = await page.evaluate(async note => {
  history.back();
  await new Promise(r => setTimeout(r, 700));
  window.__packReveal([{ name: 'Spire Lost', rarity: 'rare', kind: 'DARK SPIRE', stats: note }], { footerNote: '+40 XP' });
  await new Promise(r => setTimeout(r, 1400));
  const el = document.querySelector('.pc-stats');
  const foot = document.querySelector('.pack-coins');
  return { text: el && el.textContent, foot: foot && foot.textContent };
}, LEGIT);

ok('CONTROL a legitimate note reads back verbatim, with no visible entities',
  legit.text === LEGIT && !/&amp;|&lt;|&#39;/.test(legit.text || ''),
  JSON.stringify(legit.text));
ok('CONTROL the footer still renders its own honest value', legit.foot === '+40 XP', JSON.stringify(legit.foot));

await browser.close();
if (srvHandle) srvHandle.close();
const failed = results.filter(r => !r.pass).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
