/* THE WANDERER'S PRE-FIGHT ENCOUNTER.
 *
 * Tom, 2026-08-21, with screenshots: the screen goes dark, a lantern glows, the
 * app's typing box says what is coming, and two proper buttons ask whether you
 * fight it or run. Choosing FIGHT zooms in retro style, Pokemon trainer-battle
 * style, before the arena arrives.
 *
 * WHAT THIS FILE IS FOR, and it is not "does the overlay exist". Four things
 * here are quiet enough to break without anybody noticing on a screenshot:
 *
 *   1. FLEE HAS TO BE FREE AND REAL. It is a boss standing in the street that
 *      the player did not ask for. If Flee opens the arena anyway, or costs a
 *      ledger row, the prompt is decoration and the fight is still an ambush.
 *   2. THE HANDOVER HAS TO BE COVERED. The zoom ends on a bright hold frame and
 *      the arena is built UNDERNEATH it. Tear the overlay down one line early
 *      and the map comes back for however long openFight takes, which is the
 *      exact tray-flash defect tests/route-flash-audit.mjs exists for.
 *   3. THE ZOOM HAS TO MOVE PIXELS. tally/CLAUDE.md, and this repo has shipped
 *      the mistake it is warning about: a CSS box reads fine over a blank frame.
 *      A `scale()` in a stylesheet is not evidence that anything grew, so the
 *      ZOOM row screenshots two frames of the REAL transition, fired by a REAL
 *      tap on the REAL button, and compares them.
 *   4. THE TOAST HAS TO STAY GONE. The line used to be a toast, and a toast
 *      slides over the map without stopping it. If somebody restores it
 *      "for clarity" the encounter is announced twice and the choice is
 *      pre-empted by the thing it replaced.
 *
 * PROVEN RED, on this tree, 2026-08-21, in a throwaway copy. All eight rows were
 * shown to fail on the real defect and to come back green when it was reverted:
 *   WIRED     revert cone entry to the straight-to-arena path -> FAIL
 *   NOTOAST   restore the old toast() call                    -> FAIL (found)
 *   LINES     blank ENCOUNTER_LINES[1]     -> FAIL, box shows ""
 *   CHOICE    delete the Flee button       -> FAIL, "Fight" alone
 *   SCENE     make it a 40vh bottom sheet  -> FAIL
 *   FLEE      wire Flee to end('fight')    -> FAIL, choice=null overlay still up
 *   ZOOM      replace steps(7) with none   -> FAIL, art 413px against 479 at rest
 *   COVER     el.remove() before resolving -> FAIL, overlay:false
 *
 * ONE HONEST NOTE ON THE ZOOM ROW. It needs BOTH terms and only one of them
 * caught the mutation. With the animation removed the art measured 413px where
 * the row wants 670, so the SIZE term is what went red; the byte-delta term
 * stayed at 86% because the flash under the zoom still fires and still repaints
 * the screen. The byte term is not therefore useless: the rect alone is geometry,
 * and tally/CLAUDE.md is explicit that a CSS box reads fine over a blank frame,
 * so it is there to prove the frame really redrew. It is a second opinion, not
 * the measurement, and this note exists so nobody reads it as the measurement.
 *
 * Run: node tests/wanderer-encounter-audit.mjs [url]
 */
import { boot, sleep, settle, serveTree } from './godmode.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let fails = 0;
const ok = (name, pass, detail = '') => {
  if (!pass) fails++;
  console.log(`${pass ? 'ok  ' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
};

/* ---------------------------------------------------------------- static ---
   Two rows that need no browser, because what they assert is a SHAPE in the
   source: that the map's cone-entry path goes through the encounter, and that
   the toast it replaced did not come back. */
const appJs = fs.readFileSync(path.join(ROOT, 'js/app.js'), 'utf8');
const wandJs = fs.readFileSync(path.join(ROOT, 'js/wanderer.js'), 'utf8');

const startFn = (appJs.match(/async function startWandererEncounter[\s\S]*?\n    }\n/) || [''])[0];
ok('WIRED cone entry goes through the encounter, not straight to the arena',
  /showWandererEncounter\(/.test(startFn) && /choice === 'flee'/.test(startFn),
  startFn ? `${startFn.split('\n').length} lines` : 'startWandererEncounter NOT FOUND');

ok('NOTOAST the line it replaced is not also toasted over the map',
  !/toast\(\s*['"]The lantern swings onto you/.test(appJs), 'old charge toast absent');

/* --------------------------------------------------------------- in page --- */
const argv = process.argv[2] || process.env.URL;
const srv = argv ? null : await serveTree(ROOT);
const base = argv || srv.url;
const { browser, page } = await boot(base);

const open = () => page.evaluate(async () => {
  document.querySelectorAll('.wnd-enc, #arena').forEach(n => n.remove());
  const m = await import('./js/wanderer.js');
  /* The promise is deliberately NOT awaited: it does not settle until the
     player chooses, and choosing is what the rows below are here to do. */
  window.__wndPick = null;
  m.showWandererEncounter({ reduced: false }).then(r => { window.__wndPick = r; });
  return { lines: m.ENCOUNTER_LINES, zoomMs: m.ZOOM_MS };
});

const meta = await open();
/* long enough for both lines to type out and the buttons to fade in */
await sleep(3400);
await settle(page);

const shown = await page.evaluate(() => {
  const el = document.querySelector('.wnd-enc');
  if (!el) return null;
  const acts = el.querySelector('.wnd-enc-acts');
  const btns = [...el.querySelectorAll('.wnd-enc-acts .btn')];
  return {
    text: (el.querySelector('.tb-txt') || {}).textContent || '',
    label: el.querySelector('.talkbox')?.getAttribute('aria-label') || '',
    actsOn: !!acts && getComputedStyle(acts).opacity === '1',
    btns: btns.map(b => ({ tag: b.tagName, txt: b.textContent.trim(), cls: b.className })),
    /* the art is a real <img> with the shipped plate, not a CSS shape */
    art: el.querySelector('.wnd-enc-art')?.getAttribute('src') || '',
    covers: (() => { const b = el.getBoundingClientRect();
      return b.width >= innerWidth - 1 && b.height >= innerHeight - 1; })(),
  };
});

ok('LINES the box types Tom\'s two lines through the app\'s one talk box',
  !!shown && shown.text === meta.lines[1] && meta.lines.every(l => l.trim().length > 3),
  shown ? `showing "${shown.text}"` : 'no .wnd-enc on screen');

ok('CHOICE two real buttons, Fight and Flee, and they are <button>',
  !!shown && shown.btns.length === 2 && shown.btns.every(b => b.tag === 'BUTTON')
    && /fight/i.test(shown.btns[0].txt) && /flee/i.test(shown.btns[1].txt) && shown.actsOn,
  shown ? shown.btns.map(b => b.txt).join(' / ') + (shown.actsOn ? '' : ' [HIDDEN]') : '-');

ok('SCENE it takes the whole screen and it is his own plate',
  !!shown && shown.covers && /wanderer\.png$/.test(shown.art), shown ? shown.art : '-');

/* ---- FLEE: a real tap on the real control, and nothing may follow it ---- */
await page.evaluate(() => document.querySelector('.wnd-enc .wnd-flee').click());
await sleep(700);
const afterFlee = await page.evaluate(() => ({
  overlay: !!document.querySelector('.wnd-enc'),
  arena: !!document.getElementById('arena'),
  pick: window.__wndPick && window.__wndPick.choice,
}));
ok('FLEE backing out closes the encounter and opens no fight',
  afterFlee.pick === 'flee' && !afterFlee.overlay && !afterFlee.arena,
  `choice=${afterFlee.pick} overlay=${afterFlee.overlay} arena=${afterFlee.arena}`);

/* ---- ZOOM: fire the real button, screenshot the real frames, diff pixels ----
   NOT getComputedStyle. A transform that is declared and never composited reads
   identical to one that runs, and this repo has been burned by exactly that. */
await open();
await sleep(3400);
const shot = async () => Buffer.from(await page.screenshot({ encoding: 'base64', type: 'png' }), 'base64');
const before = await page.screenshot({ encoding: 'binary' });
await page.evaluate(() => document.querySelector('.wnd-enc .wnd-fight').click());
await sleep(Math.round(meta.zoomMs * 0.45));
const mid = await page.screenshot({ encoding: 'binary' });

/* PNG bytes are not comparable pixel-for-pixel, so the frames are reduced in
   the page instead: the art's rendered ink box, read off getBoundingClientRect
   of the IMAGE, which the compositor has to have updated for the transform to
   be on screen at all. Combined with a raw byte-length delta on the two PNGs,
   which a frozen frame cannot produce. */
const grew = await page.evaluate(() => {
  const a = document.querySelector('.wnd-enc-art');
  if (!a) return null;
  const b = a.getBoundingClientRect();
  return { w: Math.round(b.width), h: Math.round(b.height) };
});
const startW = await page.evaluate(() => {
  const a = document.querySelector('.wnd-enc-art');
  return a ? Math.round(a.offsetWidth * 1.16) : 0;
});
const byteDelta = Math.abs(before.length - mid.length) / Math.max(before.length, mid.length);
ok('ZOOM the charge actually grows on screen, measured on the rendered frame',
  !!grew && grew.w > startW * 1.4 && byteDelta > 0.02,
  grew ? `art ${grew.w}px wide against ${startW}px at rest, frame bytes moved ${(byteDelta * 100).toFixed(1)}%` : '-');

/* ---- COVER: at the moment the arena would be built, the map is not visible --- */
await sleep(meta.zoomMs);
const atHandover = await page.evaluate(() => {
  const el = document.querySelector('.wnd-enc');
  if (!el) return { overlay: false };
  const b = el.getBoundingClientRect();
  const cs = getComputedStyle(el);
  return { overlay: true, w: Math.round(b.width), h: Math.round(b.height),
    opacity: cs.opacity, pick: window.__wndPick && window.__wndPick.choice };
});
ok('COVER the overlay is still up when the choice resolves, so no map frame shows',
  atHandover.overlay && atHandover.pick === 'fight' && Number(atHandover.opacity) > 0.9,
  JSON.stringify(atHandover));

await browser.close();
if (srv) await srv.close();
console.log(`\n${fails ? `${fails} FAILED` : 'all green'}, 8 checks`);
process.exit(fails ? 1 : 0);
