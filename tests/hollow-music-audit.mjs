/* tests/hollow-music-audit.mjs: THE HOLLOW'S MUSIC, AND ABOVE ALL ITS SILENCE.
 *
 * THE PROPERTY THIS FILE EXISTS FOR IS SECTION 1: a player who has never asked
 * for music hears none. Everything else here is ordinary feature coverage and
 * could be re-derived by hand; that one cannot, because the failure is silent
 * on the developer's machine (where the preference is already on, from testing)
 * and loud in the player's hand, in a quiet room, on a phone whose volume they
 * did not choose. An app that starts singing at somebody unprompted is not a
 * bug report you get, it is an uninstall.
 *
 * SO THE DEFAULT-OFF CHECK IS DELIBERATELY BELT AND BRACES, four independent
 * observations of the same claim, because any one of them could be defeated by
 * a plausible refactor:
 *   1a  no call to HTMLMediaElement.play() ever happened. Hooked at document
 *       start, so it sees a play() from anywhere in the app, including code
 *       that does not exist yet. This survives someone moving the player.
 *   1b  no <audio> element exists at all. This survives someone hooking play()
 *       around a mute, or preloading "just to warm the cache".
 *   1c  the STORED preference is not true. This catches a profile that arrives
 *       already opted in: a seeded default, a migration, a restored backup that
 *       writes the key.
 *   1d  the RESOLVED preference, read off the pill the player is looking at, is
 *       not true. 1c cannot see this one: flipping the kvGet fallback leaves
 *       the key genuinely absent on disk while S.music comes up true in memory,
 *       and that mutation was measured passing 1c and failing 1d.
 *
 * AND SECTION 0 IS THE ANTI-VACUUM ROW. If the Hollow never opened, or the
 * control is not on the screen, then all of section 1 passes while measuring an
 * empty room. That is the "an empty sample set is a FAILURE" rule, and it is
 * checked FIRST so a broken opener reads as a broken opener.
 *
 * Sections 2 to 7 drive the REAL pill with a real mouse at its real
 * coordinates, never the play function: start, stop, persist across a reload,
 * stop on close, pause on a hidden tab, and the Settings mirror.
 *
 * PROVEN RED TWICE, each in its own throwaway copy of the tree outside the
 * worktree, 27/27 green before and after.
 *
 * (1) autoplay: `if (S.music) hollowMusicPlay();` -> `hollowMusicPlay();`
 *     so entering the Hollow plays unconditionally.  exit 1, 24/27
 *       FAIL  1a  play() was called 1 time(s) on the default profile
 *       FAIL  1b  1 <audio> element(s) exist on the default profile
 *       FAIL  2 exactly ONE play() reached the media element  2 call(s)
 *
 * (2) the default itself: kvGet('music', false) === true
 *                      -> kvGet('music', true) !== false.  exit 1, 10/27
 *       FAIL  1a  play() was called 1 time(s) on the default profile
 *       FAIL  1b  1 <audio> element(s) exist on the default profile
 *       FAIL  1d  the control reads as off  aria-pressed=true
 *       FAIL  2 the control STARTS it  ... paused:true (the tap now MUTES)
 *     Note 1c PASSED here (kv music = "__absent__"), which is exactly why 1d
 *     exists: stored and resolved are two different claims.
 *
 * Usage:  node tests/hollow-music-audit.mjs [url]
 */
import { boot, serveTree, dismissOverlays, sleep } from './godmode.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argUrl = process.argv.slice(2).find(a => !a.startsWith('--')) || process.env.URL;
const srv = argUrl ? null : await serveTree(ROOT);
const base = argUrl || srv.url;

const results = [];
const ok = (name, pass, detail = '') => {
  results.push(pass);
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
};

const { browser, page } = await boot(base);

/* HOOK play() AT DOCUMENT START, THEN RELOAD SO THE HOOK IS THERE FROM THE
   FIRST BYTE. Recording the src matters: the barcode scanner owns a <video>
   and its play() is not this feature's play(). */
await page.evaluateOnNewDocument(() => {
  window.__mediaPlays = [];
  const real = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function (...a) {
    window.__mediaPlays.push({ src: this.currentSrc || this.src || '(none)', tag: this.tagName, at: Date.now() });
    return real.apply(this, a);
  };
});
await page.reload({ waitUntil: 'networkidle2' });
await sleep(2400);
await dismissOverlays(page);

const musicPlays = () => page.evaluate(() =>
  (window.__mediaPlays || []).filter(p => /morningdew/i.test(p.src)).length);
const audioEls = () => page.evaluate(() =>
  [...document.querySelectorAll('audio')].map(a => ({
    src: a.currentSrc || a.src, paused: a.paused, loop: a.loop,
    t: +a.currentTime.toFixed(3), vol: a.volume, muted: a.muted,
  })));
const kvMusic = () => page.evaluate(async b => {
  const db = await import(new URL('js/db.js', b).href);
  return db.kvGet('music', '__absent__');
}, base.replace(/\/?$/, '/'));

/* THE TOPMOST SHEET'S Done, NOT THE FIRST ONE IN THE DOM.
   The Hollow opens ON TOP of the Kitchen, so there are two `.sheet-close`
   buttons on screen and querySelector returns the KITCHEN'S. Its coordinates
   sit 75px below the Hollow's own header, over the Hollow's instruction line,
   so a real mouse click there hits `.hlw-bar` and closes nothing. That read as
   "closing the Hollow does not stop the music" for one full run, which is the
   right lesson twice over: the guard failed loudly rather than passing, and the
   thing it was actually measuring was the harness. Measured, not guessed:
   Kitchen Done at y146 (elementFromPoint = hlw-bar), Hollow Done at y71. */
async function closeTopSheet() {
  const hit = await page.evaluate(() => {
    const sheets = [...document.querySelectorAll('#sheets .sheet')];
    const b = sheets[sheets.length - 1]?.querySelector('.sheet-close');
    if (!b) return null;
    const r = b.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, depth: sheets.length };
  });
  if (!hit) return null;
  await page.mouse.click(hit.x, hit.y);
  return hit;
}

async function openHollow() {
  for (let i = 0; i < 4; i++) { if (!await closeTopSheet()) break; await sleep(500); }
  await page.evaluate(() => document.querySelector('#kitchenActBtn')?.click());
  await sleep(1500);
  await page.evaluate(() => document.querySelector('#doorGrow')?.click());
  await sleep(2600);
  return page.evaluate(() => !!document.querySelector('#hlwStage'));
}

/* A REAL MOUSE AT REAL COORDINATES, not element.click(). This app has handlers
   that a programmatic click does not reach, and a check that "passes" through
   one is testing nothing. Returns the rect so a caller can prove it clicked
   something with size. */
async function clickSel(sel) {
  const hit = await page.evaluate(s => {
    const el = document.querySelector(s);
    if (!el) return null;
    el.scrollIntoView({ block: 'center' });
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: +r.width.toFixed(1), h: +r.height.toFixed(1) };
  }, sel);
  if (!hit) return null;
  await page.mouse.click(hit.x, hit.y);
  return hit;
}

// ---------------------------------------------------------------- 0. SETUP
const opened = await openHollow();
ok('0 SETUP the Hollow actually opened (everything below is vacuous otherwise)', opened);
const btn = await page.evaluate(() => {
  const b = document.querySelector('#hlwMusic');
  if (!b) return null;
  const r = b.getBoundingClientRect();
  return {
    w: +r.width.toFixed(1), h: +r.height.toFixed(1),
    onscreen: r.top >= 0 && r.bottom <= innerHeight && r.left >= 0,
    pressed: b.getAttribute('aria-pressed'),
    label: b.getAttribute('aria-label'),
    // what a thumb actually lands on at this point, through every layer above it
    hits: (el => el ? (el.id || el.tagName) : 'null')(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)),
  };
});
ok('0 SETUP the mute control is ON SCREEN inside the Hollow, not buried', !!btn && btn.onscreen,
  btn ? `${btn.w}x${btn.h} onscreen=${btn.onscreen} aria-label="${btn.label}"` : 'NO #hlwMusic IN THE DOM');
/* 44 is the platform's minimum thumb target. The coin chip beside it is a
   readout and is allowed to be smaller; this is a control. */
ok('0 SETUP the control is a real thumb target (>=40px tall)', !!btn && btn.h >= 40, btn ? `${btn.h}px tall` : 'n/a');
ok('0 SETUP nothing sits on top of the control', !!btn && btn.hits === 'hlwMusic', btn ? `elementFromPoint at its centre = ${btn.hits}` : 'n/a');

// ------------------------------------------------- 1. THE ONE THAT MATTERS
const plays0 = await musicPlays();
const els0 = await audioEls();
const pref0 = await kvMusic();
ok('1a DEFAULT-OFF  play() is never called on a default profile', plays0 === 0,
  `play() was called ${plays0} time(s) on the default profile`);
ok('1b DEFAULT-OFF  no <audio> element is even constructed', els0.length === 0,
  `${els0.length} <audio> element(s) exist on the default profile${els0.length ? ': ' + JSON.stringify(els0) : ''}`);
ok('1c DEFAULT-OFF  the stored preference is not true', pref0 !== true, `kv music = ${JSON.stringify(pref0)}`);
ok('1d DEFAULT-OFF  the control reads as off', btn && btn.pressed === 'false', btn ? `aria-pressed=${btn.pressed}` : 'n/a');

// ------------------------------------------------- 2. THE CONTROL STARTS IT
const tap1 = await clickSel('#hlwMusic');
await sleep(1400);
const els1 = await audioEls();
await sleep(1100);
const els1b = await audioEls();
const playing = els1.length === 1 && !els1[0].paused;
const advancing = els1b.length === 1 && els1b[0].t > els1[0].t;
ok('2 the control STARTS it (real mouse on the real pill)', !!tap1 && playing,
  `tapped ${tap1 ? `${tap1.w}x${tap1.h} at (${tap1.x.toFixed(0)},${tap1.y.toFixed(0)})` : 'NOTHING'} -> ${JSON.stringify(els1)}`);
ok('2 the clock is actually ADVANCING (a mounted element is not a playing one)', advancing,
  `currentTime ${els1[0] ? els1[0].t : '?'} -> ${els1b[0] ? els1b[0].t : '?'}`);
ok('2 it is the Hollow loop, looping, and under full volume', playing && /morningdew-loop\.m4a$/.test(els1[0].src) && els1[0].loop === true && els1[0].vol < 1 && !els1[0].muted,
  els1[0] ? `src=${els1[0].src.split('/').pop()} loop=${els1[0].loop} volume=${els1[0].vol} muted=${els1[0].muted}` : 'n/a');
ok('2 exactly ONE play() reached the media element (not a stack of them)', await musicPlays() === 1, `${await musicPlays()} call(s)`);

// -------------------------------------------------- 3. AND TAPS BACK OFF
await clickSel('#hlwMusic');
await sleep(900);
const els2 = await audioEls();
ok('3 tapping the control again STOPS it', els2.length === 1 && els2[0].paused, JSON.stringify(els2));
ok('3 and the preference went back off', await kvMusic() === false, `kv music = ${JSON.stringify(await kvMusic())}`);

// ------------------------------------------------- 4. IT SURVIVES A RELOAD
await clickSel('#hlwMusic');            // back on, so there is something to persist
await sleep(700);
const prefOn = await kvMusic();
await page.reload({ waitUntil: 'networkidle2' });
await sleep(2400);
await dismissOverlays(page);
const playsAfterBoot = await musicPlays();
ok('4 the preference persisted across a reload', prefOn === true, `kv music = ${JSON.stringify(prefOn)}`);
/* AND IT STILL DOES NOT PLAY AT BOOT. The preference being on is permission to
   play IN THE HOLLOW, never on the Today screen or out of a pocket. */
ok('4 an ON preference still plays NOTHING at boot, outside the Hollow', playsAfterBoot === 0,
  `${playsAfterBoot} play() call(s) before the Hollow was ever opened`);
await openHollow();
await sleep(1600);
const els3 = await audioEls();
const btn3 = await page.evaluate(() => document.querySelector('#hlwMusic')?.getAttribute('aria-pressed'));
ok('4 re-entering the Hollow with the preference on resumes it', els3.length === 1 && !els3[0].paused, JSON.stringify(els3));
ok('4 and the pill shows on', btn3 === 'true', `aria-pressed=${btn3}`);

// -------------------------------------------- 5. CLOSING THE HOLLOW STOPS IT
const closed = await closeTopSheet();
await sleep(1200);
const gone = await page.evaluate(() => !document.querySelector('#hlwStage'));
const els4 = await audioEls();
/* ASSERT THE SHEET IS ACTUALLY GONE FIRST. Without this row, a click that
   closed nothing would make the next row fail for the wrong reason and send
   somebody hunting a bug in app.js that is not there. */
ok('5 CONTROL the Hollow really closed (a click that closes nothing proves nothing)', !!closed && gone,
  `clicked sheet depth ${closed ? closed.depth : 'n/a'}, #hlwStage gone=${gone}`);
ok('5 closing the Hollow STOPS playback', els4.length === 1 && els4[0].paused && els4[0].t === 0,
  `${JSON.stringify(els4)} (a still-playing loop here follows you onto every other screen)`);

// ------------------------------------------------ 6. A HIDDEN TAB PAUSES IT
await openHollow();
await sleep(1400);
const beforeHide = await audioEls();
await page.evaluate(() => {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
  document.dispatchEvent(new Event('visibilitychange'));
});
await sleep(700);
const hidden = await audioEls();
ok('6 CONTROL it was playing before the tab was hidden', beforeHide.length === 1 && !beforeHide[0].paused, JSON.stringify(beforeHide));
ok('6 a hidden tab PAUSES it', hidden.length === 1 && hidden[0].paused, JSON.stringify(hidden));
await page.evaluate(() => {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
  document.dispatchEvent(new Event('visibilitychange'));
});
await sleep(900);
const shown = await audioEls();
ok('6 coming back to a still-open Hollow resumes it', shown.length === 1 && !shown[0].paused, JSON.stringify(shown));

// --------------------------------------------- 7. THE SETTINGS MIRROR
/* The second place Tom asked for. It must be the SAME preference, so killing it
   here has to kill the sound that is playing right now in the sheet behind. */
const settings = await page.evaluate(() => {
  location.hash = '#/settings';
  return true;
});
await sleep(2000);
const seg = await page.evaluate(() => {
  const on = document.querySelector('#musOn'), off = document.querySelector('#musOff');
  if (!on || !off) return null;
  return { onLit: on.classList.contains('on'), offLit: off.classList.contains('on'),
    row: on.closest('.settings-row')?.querySelector('b')?.textContent || '' };
});
ok('7 Settings carries the same control', settings && !!seg, seg ? `row "${seg.row}" onLit=${seg.onLit} offLit=${seg.offLit}` : 'NO #musOn/#musOff IN SETTINGS');
ok('7 and it reflects the live preference (on)', !!seg && seg.onLit && !seg.offLit, seg ? `onLit=${seg.onLit} offLit=${seg.offLit}` : 'n/a');
await clickSel('#musOff');
await sleep(900);
const els5 = await audioEls();
ok('7 turning it off in Settings kills the sound that is playing', els5.length === 1 && els5[0].paused, JSON.stringify(els5));
ok('7 and it is one preference, not two', await kvMusic() === false, `kv music = ${JSON.stringify(await kvMusic())}`);

// ----------------------------------------------------------------- verdict
await browser.close();
srv?.close();
const failed = results.filter(r => !r).length;
/* An empty sample set is a FAILURE, never a pass. */
if (!results.length) { console.log('\nFAIL  no assertions ran at all'); process.exit(1); }
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
