/* THE TALK BOX SAYS ITS LINE, AND THE PLAYER CAN HURRY IT ALONG.
 *
 * Tom, 2026-08-20: "i also want to create an old school dialogue style system
 * where it types on with this style of font", "typing dialogue is going to be
 * instead of the chat bubbles everywhere in the app". Approved in the canvas
 * "The Raising and the Talk Box", artboard "The talk box".
 *
 * WHAT THIS PINS, and every one of these is a thing that can break silently:
 *   TYPE       the line arrives character by character, not all at once. Both a
 *              DOM sample (the exact prefix sequence) and a PIXEL sample (the ink
 *              really landed on screen), because a text node with the right
 *              content and nothing painted is the text version of v245's
 *              invisible punch.
 *   SKIP       a tap MID-LINE completes the line. It does not restart it and it
 *              does not do nothing. Fired as a real mouse click at the box's own
 *              coordinates, in the state the player is complaining about: the
 *              precondition row refuses to grade unless the tap really landed
 *              between the first character and the last.
 *   EXCLUSIVE  the caret and the gold chevron are never both on screen, or the
 *              box says "wait" twice. Graded on PIXELS across every frame of a
 *              held box, which is the only surface where both states occur.
 *   REDUCED    prefers-reduced-motion prints the whole line at once and drops the
 *              blink. Graded from the FIRST frame after render, because "it ends
 *              up complete" is true of the animated version too.
 *
 * HOW IT IS GRADED, and why not a computed style. tally/CLAUDE.md: fire the real
 * control and assert pixels. getComputedStyle would happily report a visible
 * caret over a frame nobody painted. So the box is screenshotted at its own
 * clipped rect and every frame is reduced to three counts:
 *
 *   ink    pixels of --text (#f2e9d7) inside .tb-line: the characters themselves.
 *   caret  pixels of --accent (#a5e847) inside .tb-line.
 *   chev   pixels of --gold (#ffc961) anywhere in the box.
 *
 * THREE CONTROLS, BECAUSE A CHECK THAT CANNOT FAIL IS NOT A CHECK. Every count
 * above is a detector that could simply never fire, and two of them are asserted
 * to be ZERO somewhere, which is exactly the shape that passes on a blank frame:
 *   CONTROL-CARET      some frame of a typing box scores caret pixels. Without
 *                      this, "the caret is never on at the same time as the
 *                      chevron" is satisfied by a caret nobody can see.
 *   CONTROL-CHEVRON    some frame of a FINISHED HELD box scores chevron pixels.
 *                      Same argument from the other side.
 *   CONTROL-ISOLATION  the speaker's NAME is the same #a5e847 as the caret, so the
 *                      caret count is only a caret count if the measured region
 *                      excludes the label. Measured on a finished held box, which
 *                      HAS a name and has NO caret: the count must be zero. If the
 *                      name bleeds in (the box is rotated 2 degrees, so it could),
 *                      this goes red instead of EXCLUSIVE passing while blind.
 * plus SAMPLE rows: an empty frame set, an empty sample list or a zero-length
 * line is a FAILURE, never a pass (anti-regression rule 3).
 *
 * HITTEST is anti-regression rule 6 as an assertion. The box floats over #bhStage,
 * whose job is to open the Backpack. While the line is live the box must own the
 * tap (or it can never be skipped); once a line that leaves on its own has
 * finished, the box must hand the tap back (or it eats a 42%-wide target for the
 * rest of the render). BOTH directions, because either one alone is satisfiable by
 * a mistake.
 *
 * COVERAGE derives the graded set from js/*.js rather than from a list somebody
 * remembers to update: every talkBoxHtml() call site in the app must appear in
 * SITES below, so the NEXT chat bubble converted to a talk box fails this audit
 * until it is either driven or given a written reason. This is the half that stops
 * the audit rotting into a green that covers one screen out of seventeen.
 *
 * Usage: node tests/talkbox-audit.mjs [baseUrl]   (serves this repo if omitted)
 *        --frames DIR   also writes the captured frames, for a visual strip
 */
import path from 'node:path';
import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { loadPuppeteer, serveTree, sleep, chromePath, sandboxArgs, exitFor } from './godmode.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
/* NEVER BARE. godmode's boot() defaults to the live production site, so an audit
   that forgets to pass a base grades whatever is deployed and reads as coverage of
   the working tree. This serves THIS checkout unless a URL is given on purpose. */
const fi = argv.indexOf('--frames');
const framesDir = fi >= 0 ? argv[fi + 1] : null;
/* The frames directory is a positional-looking value, so it has to be excluded by
   INDEX, not by shape: `--frames /tmp/x` was read as the base URL and every run
   died on "Cannot navigate to invalid URL". */
const argUrl = argv.find((a, i) => !a.startsWith('--') && i !== fi + 1) || process.env.URL;
const srv = argUrl ? null : await serveTree(ROOT);
const base = (argUrl || srv.url).replace(/\/?$/, '/');

const results = [];
const ok = (name, pass, detail = '') => {
  results.push({ name, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
};

/* MEASURED ON THIS TREE, not guessed, and both floors sit in the middle of a gap.
   At 440x956, deviceScaleFactor 2, Today's box:
     caret    present 241 - 242 px    absent (finished box, name visible)   0
     chevron  present  32 -  46 px    absent (a plain, un-held line)      0 - 8
   The absent side is a true zero because the box fill is opaque and nothing else
   inside it carries either colour, so the floors exist only to absorb a stray
   anti-aliased pixel. The chevron count is small because it is a 2.2px stroke on
   an 11px glyph; the FIRST version of this measured gold across the WHOLE box and
   scored up to 14 px on a box with no chevron at all (artwork showing past the
   rotated corners mid-pop), which left a 14-to-32 gap I was not willing to grade
   on. Restricting it to the corner the chevron actually occupies moved the absent
   side to a real 0 and cost nothing: every gold pixel of a real chevron is in
   there (32 of 32, measured both ways). The 0-8 on the absent side is backdrop
   showing past the rotated corner during the box's entry pop; the floor is 20,
   which is the middle of the 8-to-32 gap rather than the edge of it. */
const CARET_MIN = 40;
const CHEV_MIN = 20;
/* The chevron's corner, as a fraction of the box: right 38%, bottom 40%. app.css
   puts .tb-next at right 0.81em / bottom 0.69em of an 11px box, glyph ~10px. */
const CHEV_REGION = { x: 0.62, y: 0.60, w: 0.38, h: 0.40 };
/* Under 4 distinct ink levels a "typing" animation is indistinguishable from one
   jump. 59 characters at 26ms is 1.5s, sampled every ~80ms: about 18 levels. */
const MIN_LEVELS = 4;
const MIN_FRAMES = 6;
/* Colour match, per channel. The caret and the chevron are flat fills, so their
   cores match exactly; 28 is loose enough for the compositor's own rounding and
   tight enough that the olive backdrop (#7a8a4a-ish) is nowhere near lime. */
const TOL = 28;
const ACCENT = [165, 232, 71];   // --accent  #a5e847
const GOLD = [255, 201, 97];     // --gold    #ffc961
const INK = [242, 233, 215];     // --text    #f2e9d7

/* EVERY talkBoxHtml() CALL SITE IN THE APP. A site that is not here fails
   COVERAGE below; a site that is here and undriven prints its reason on every
   run so it cannot rot into "covered". */
const SITES = {
  'js/app.js:hero-bubble': { driven: true, why: 'Today, the default home screen: the most-seen line of prose in the app. Driven by every run below.' },
};
/* The pet line reuses the SAME box element through runTalkBox(), so it is not a
   second talkBoxHtml() site; it is driven anyway, because it is the only surface
   that carries a name and the only one that waits. */

const puppeteer = await loadPuppeteer();
const browser = await puppeteer.launch({
  headless: process.env.HEADLESS_MODE || 'shell',
  defaultViewport: { width: 440, height: 956, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  executablePath: chromePath(),
  args: [...sandboxArgs(), '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding'],
});

/* Decode in a THROWAWAY page: the page under test is the subject of the
   measurement and must not be asked to do arithmetic mid-animation. Same canvas
   approach as boot-flash-audit.mjs, so no image dependency. */
const meterPage = await browser.newPage();
await meterPage.goto('data:text/html,<body></body>');
let SCALE = null;   // image px per CSS px, learned once from a real capture
const measure = (b64, sub, goldRegion) => meterPage.evaluate(async (data, region, goldReg, tol, accent, gold, ink) => {
  const img = new Image();
  img.src = 'data:image/png;base64,' + data;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height).data;
  const near = (i, t) => Math.abs(d[i] - t[0]) <= tol && Math.abs(d[i + 1] - t[1]) <= tol && Math.abs(d[i + 2] - t[2]) <= tol;
  // region is the .tb-line box in IMAGE pixels, already insetted by the caller
  const x0 = Math.max(0, Math.round(region.x)), x1 = Math.min(c.width, Math.round(region.x + region.w));
  const y0 = Math.max(0, Math.round(region.y)), y1 = Math.min(c.height, Math.round(region.y + region.h));
  const gx0 = Math.max(0, Math.round(goldReg.x * c.width)), gx1 = Math.min(c.width, Math.round((goldReg.x + goldReg.w) * c.width));
  const gy0 = Math.max(0, Math.round(goldReg.y * c.height)), gy1 = Math.min(c.height, Math.round((goldReg.y + goldReg.h) * c.height));
  let caret = 0, inkPx = 0, chev = 0;
  for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
    const i = (y * c.width + x) * 4;
    if (x >= gx0 && x < gx1 && y >= gy0 && y < gy1 && near(i, gold)) chev++;
    if (x >= x0 && x < x1 && y >= y0 && y < y1) {
      if (near(i, accent)) caret++;
      else if (near(i, ink)) inkPx++;
    }
  }
  return { caret, ink: inkPx, chev,
    area: Math.max(0, (x1 - x0)) * Math.max(0, (y1 - y0)),
    goldArea: Math.max(0, (gx1 - gx0)) * Math.max(0, (gy1 - gy0)),
    w: c.width, h: c.height };
}, b64, sub, goldRegion, TOL, ACCENT, GOLD, INK);

const page = await browser.newPage();
const pageErrors = [];
page.on('pageerror', e => { pageErrors.push(String(e)); console.log('PAGEERROR', e.message); });
await page.goto(base + '?demo', { waitUntil: 'networkidle2' });
await sleep(2400);
// the demo profile opens with a spin and first-run cards; they are not the subject
for (let i = 0; i < 6; i++) {
  const hit = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find(x => /^(spin|nice|done|collect|claim|continue|ok|got it|next|skip)$/i.test(x.textContent.trim()));
    if (b) { b.click(); return true; } return false;
  });
  if (!hit) break;
  await sleep(1400);
}

/* Read everything this audit grades off the live box in ONE evaluate, so a sample
   is one coherent moment rather than four reads drifting apart. */
const GEO = () => page.evaluate(() => {
  const b = document.querySelector('.hero-bubble');
  if (!b) return null;
  const line = b.querySelector('.tb-line'), txt = b.querySelector('.tb-txt'), name = b.querySelector('.tb-name');
  const r = b.getBoundingClientRect(), l = line.getBoundingClientRect();
  const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
  return {
    box: { x: r.x, y: r.y, w: r.width, h: r.height },
    line: { x: l.x, y: l.y, w: l.width, h: l.height },
    len: txt.textContent.length,
    full: (line.dataset.tb || '').length,
    prefix: (line.dataset.tb || '').startsWith(txt.textContent),
    done: b.classList.contains('tb-done'),
    hold: b.classList.contains('tb-hold'),
    gone: b.classList.contains('tb-gone'),
    name: name ? name.textContent : '',
    // anti-regression rule 6: who really owns this pixel
    hit: (() => { const e = document.elementFromPoint(cx, cy); return e ? (e.closest('.talkbox') ? 'box' : (e.id || e.className || e.tagName)) : 'none'; })(),
    centre: [cx, cy],
  };
});

/* One sample = the geometry AND the pixels of that same moment. The clip is the
   box's own axis-aligned rect, outset 2px so the border survives rounding; the
   caret region is .tb-line inside it, with the TOP pulled in 4px because the box
   is rotated 2 degrees and the speaker's name sits directly above the line in the
   same colour as the caret (see CONTROL-ISOLATION). */
async function sample() {
  const g = await GEO();
  if (!g) return null;
  const clip = { x: Math.max(0, g.box.x - 2), y: Math.max(0, g.box.y - 2), width: g.box.w + 4, height: g.box.h + 4 };
  if (clip.width < 8 || clip.height < 8) return null;
  const b64 = await page.screenshot({ clip, encoding: 'base64' });
  if (SCALE == null) {
    const probe = await measure(b64, { x: 0, y: 0, w: 1, h: 1 }, CHEV_REGION);
    SCALE = probe.w / clip.width;
    console.log(`(image scale ${SCALE} px per CSS px)`);
  }
  const m = await measure(b64, {
    x: (g.line.x - clip.x) * SCALE,
    y: (g.line.y - clip.y + 4) * SCALE,
    w: g.line.w * SCALE,
    h: (g.line.h - 4) * SCALE,
  }, CHEV_REGION);
  return { ...g, ...m, b64 };
}

/* Force a fresh Today render, which is what starts a line from zero. Real
   navigation, so the whole route + reveal path runs and the typing begins where
   the player actually sees it begin. */
async function freshToday() {
  await page.evaluate(() => { location.hash = '#/progress'; });
  await sleep(800);
  await page.evaluate(() => { location.hash = '#/today'; });
}

async function capture({ ms = 2600, every = 80 } = {}) {
  const out = [];
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const s = await sample();
    if (s) out.push(s);
    await sleep(every);
  }
  return out;
}

const dumpFrames = async (frames, tag) => {
  if (!framesDir) return;
  await mkdir(framesDir, { recursive: true });
  for (let i = 0; i < frames.length; i++) {
    await writeFile(path.join(framesDir, `${tag}-${String(i).padStart(2, '0')}-len${frames[i].len}.png`), Buffer.from(frames[i].b64, 'base64'));
  }
};

console.log(`grading ${base}\n`);

/* ---- FONT ------------------------------------------------------------------ */
{
  const f = await page.evaluate(() => {
    const b = document.querySelector('.hero-bubble');
    const face = [...document.fonts].find(x => x.family === 'BoldPixels');
    return {
      family: b ? getComputedStyle(b).fontFamily : '(no box)',
      status: face ? face.status : '(no face declared)',
      check: document.fonts.check('12px BoldPixels'),
    };
  });
  ok('FONT the dialogue face really loaded, so the box is not silently in the fallback',
    f.status === 'loaded' && f.check === true, `status=${f.status} check=${f.check}`);
  ok('FONT the box asks for BoldPixels first', /^['"]?BoldPixels/.test(f.family), f.family);
}

/* ---- RUN 1: the plain line (Today's own, auto-dismissing, no chevron) ------- */
let plain = [];
{
  await freshToday();
  plain = await capture({ ms: 2600, every: 80 });
  await dumpFrames(plain, 'plain');

  ok('SAMPLE the plain line was captured at all (an empty frame set grades nothing)',
    plain.length >= MIN_FRAMES, `${plain.length} frames (need ${MIN_FRAMES})`);
  const full = plain.length ? plain[plain.length - 1].full : 0;
  ok('SAMPLE the line has something to say (a zero-length line would pass every row below)',
    full > 0, `${full} characters`);
  ok('SAMPLE both measured regions have real area (a zero-area crop scores zero for every colour)',
    plain.every(f => f.area > 100 && f.goldArea > 100),
    `min caret region ${Math.min(...plain.map(f => f.area || 0))} px, min chevron region ${Math.min(...plain.map(f => f.goldArea || 0))} px`);

  if (plain.length >= MIN_FRAMES && full > 0) {
    const lens = plain.map(f => f.len);
    const distinct = [...new Set(lens)];
    const mid = distinct.filter(n => n > 0 && n < full);
    ok('TYPE-DOM the line arrives character by character, not in one jump',
      mid.length >= MIN_LEVELS - 2, `${distinct.length} distinct lengths, ${mid.length} of them partial: ${lens.join(',')}`);
    ok('TYPE-DOM every partial state is a real PREFIX of the finished line',
      plain.every(f => f.prefix), `${plain.filter(f => !f.prefix).length} sample(s) were not a prefix`);
    ok('TYPE-DOM the length never goes backwards',
      lens.every((n, i) => i === 0 || n >= lens[i - 1]), lens.join(','));
    ok('TYPE-DOM the line finishes',
      lens[lens.length - 1] === full && plain[plain.length - 1].done, `ended at ${lens[lens.length - 1]}/${full}, done=${plain[plain.length - 1].done}`);

    /* THE PIXEL HALF, AND ITS FIRST VERSION WAS VACUOUS. The DOM half proves the
       string grows; this proves the characters were painted. The first version
       asserted "the ink count takes intermediate values", and MUTANT 1 (typing
       deleted, the line printed all at once) PASSED it: a settled, unchanging line
       still scores 713 - 741 ink pixels across frames, because sub-pixel
       compositing jitters the count by a couple of dozen. So the test measured
       noise and called it an animation.
       The fix measures the noise instead of guessing at it. The FINISHED frames are
       the same picture over and over, so their spread IS this run's noise floor; a
       frame counts as a genuine partial paint only if it sits more than three noise
       floors below the finished amount. A print-at-once produces none of those, and
       real typing produces one per sample. */
    const inks = plain.map(f => f.ink);
    /* PAINTED finished frames only. A `done` frame that scores zero ink is one
       where the box has not been painted yet (the route is still in flight), and
       letting it into the noise measurement inflates the floor, which loosens the
       band. Excluding it makes this row STRICTER, not weaker. */
    const tail = plain.filter(f => f.done && f.ink > 0).map(f => f.ink);
    ok('SAMPLE enough finished frames to measure this run\'s pixel noise floor from',
      tail.length >= 3, `${tail.length} finished frames`);
    const finalInk = tail.length ? Math.round(tail.reduce((a, b) => a + b, 0) / tail.length) : 0;
    const noise = tail.length ? Math.max(...tail) - Math.min(...tail) : 0;
    const floorNoise = Math.max(noise, 20);
    const band = finalInk - 3 * floorNoise;
    const partials = inks.filter(n => n > floorNoise && n < band);
    ok('TYPE-PIXELS the painted ink really ramps: frames well BELOW the finished amount, not just noise around it',
      tail.length >= 3 && partials.length >= MIN_LEVELS - 1,
      `${partials.length} frames under ${band} ink (finished ${finalInk} +/- noise ${noise}): ${inks.join(',')}`);
    ok('TYPE-PIXELS the finished line is actually painted',
      finalInk > 50, `${finalInk} ink px`);

    const withCaret = plain.filter(f => f.caret >= CARET_MIN);
    ok('CONTROL-CARET the caret detector fires at all (without this, every "no caret" row below is blind)',
      withCaret.length > 0, `${withCaret.length}/${plain.length} frames scored >= ${CARET_MIN}, max ${Math.max(...plain.map(f => f.caret))}`);
    ok('CONTROL-CHEVRON-NEGATIVE a line that leaves on its own never shows the chevron, and nothing else in the box is gold',
      plain.every(f => f.chev < CHEV_MIN), `max ${Math.max(...plain.map(f => f.chev))} gold px (floor ${CHEV_MIN})`);
    ok('STATE the plain line has no speaker label (this is you, not a character)',
      plain.every(f => f.name === ''), `saw "${plain[0].name}"`);

    /* HITTEST, both directions (anti-regression rule 6). */
    const live = plain.find(f => !f.done);
    const settled = plain[plain.length - 1];
    ok('HITTEST while the line is live the box owns its own centre, so the skip tap can land',
      !!live && live.hit === 'box', live ? `hit=${live.hit}` : 'no live frame captured');
    ok('HITTEST once a self-dismissing line is finished the box hands the tap back to the stage',
      settled.done && settled.hit !== 'box', `done=${settled.done} hit=${settled.hit}`);
  }
}

/* ---- RUN 2: SKIP ----------------------------------------------------------- */
{
  await freshToday();
  /* MEASURE IN THE STATE THE PLAYER IS COMPLAINING ABOUT. Wait for the line to be
     genuinely mid-flight before tapping: a tap at 0 characters or at the last one
     proves nothing about skipping. */
  let pre = null;
  for (let i = 0; i < 120; i++) {
    const g = await GEO();
    if (g && g.len > 2 && g.len < g.full - 2 && !g.done) { pre = g; break; }
    await sleep(25);
  }
  ok('SKIP-PRECONDITION the tap landed mid-line, so the skip has something to skip',
    !!pre && pre.len > 2 && pre.len < pre.full - 2,
    pre ? `${pre.len}/${pre.full} characters typed at the moment of the tap` : 'never caught the line mid-flight');

  if (pre) {
    // a REAL mouse click at the box's own coordinates, not element.click()
    await page.mouse.click(pre.centre[0], pre.centre[1]);
    const after = [];
    for (let i = 0; i < 20; i++) { const g = await GEO(); if (g) after.push(g); await sleep(20); }
    const first = after[0];
    ok('SKIP a tap mid-line completes the line',
      !!first && first.len === first.full && first.done,
      first ? `${first.len}/${first.full} within ${20}ms of the tap, done=${first.done}` : 'no sample after the tap');
    ok('SKIP-NO-RESTART the line never goes back to the beginning (a restart is the other wrong answer)',
      after.every(g => g.len === g.full), `lengths after the tap: ${after.map(g => g.len).join(',')}`);
    ok('SKIP-NO-RESTART the skip is not a no-op either: the line was incomplete before the tap and complete after',
      pre.len < pre.full && after.length > 0 && after[0].len === after[0].full,
      `${pre.len} -> ${after[0]?.len} of ${pre.full}`);
  }
}

/* ---- RUN 3: the HELD line (named speaker, chevron) ------------------------- */
let held = [];
{
  await freshToday();
  await sleep(2200);   // let the plain line settle so this run is only about the pet's
  const pet = await page.$('#heroPetBtn');
  ok('SAMPLE the pet control exists, so the held/named states can be reached at all', !!pet);
  if (pet) {
    await pet.click();               // THE REAL CONTROL
    held = await capture({ ms: 2200, every: 70 });
    await dumpFrames(held, 'held');

    ok('SAMPLE the held line was captured', held.length >= MIN_FRAMES, `${held.length} frames`);
    if (held.length >= MIN_FRAMES) {
      ok('STATE the pet is a NAMED SPEAKER: the label is what makes a line a character',
        held.every(f => f.name.length > 0), `name="${held[0].name}"`);
      ok('STATE the pet line WAITS instead of leaving on its own',
        held.every(f => f.hold), `${held.filter(f => !f.hold).length} frame(s) not held`);

      const done = held.filter(f => f.done);
      const typing = held.filter(f => !f.done);
      ok('CONTROL-CARET the caret detector fires on the held box too, above the name label',
        typing.some(f => f.caret >= CARET_MIN),
        `${typing.length} typing frames, max caret ${typing.length ? Math.max(...typing.map(f => f.caret)) : 0}`);
      ok('CONTROL-CHEVRON the chevron detector fires on a finished held box',
        done.some(f => f.chev >= CHEV_MIN),
        `${done.length} finished frames, max gold ${done.length ? Math.max(...done.map(f => f.chev)) : 0}`);
      /* The name is the SAME #a5e847 as the caret. On a finished box the caret is
         gone and the name is not, so a non-zero count here means the region is
         reading the label and the caret count means nothing. */
      ok('CONTROL-ISOLATION the caret region excludes the speaker label, so a caret count is a caret',
        done.length > 0 && done.every(f => f.caret < CARET_MIN),
        `${done.length} finished frames (name "${held[0].name}" visible), max caret ${done.length ? Math.max(...done.map(f => f.caret)) : 'n/a'}`);

      const both = held.filter(f => f.caret >= CARET_MIN && f.chev >= CHEV_MIN);
      ok('EXCLUSIVE the caret and the chevron are never both on screen, or the box says "wait" twice',
        both.length === 0,
        `${both.length} of ${held.length} frames showed both` + (both.length ? ` (first: caret ${both[0].caret}, gold ${both[0].chev})` : ''));

      /* The chevron's promise: a box that asks for a tap answers one. */
      const g = await GEO();
      if (g) {
        await page.mouse.click(g.centre[0], g.centre[1]);
        await sleep(320);
        const after = await GEO();
        ok('DISMISS tapping a finished, waiting box closes it (that is what the chevron is asking for)',
          !!after && after.gone, `gone=${after ? after.gone : 'no box'}`);
      }
    }
  }
}

/* ---- RUN 4: REDUCED MOTION ------------------------------------------------- */
{
  /* fx.js reads matchMedia ONCE at module load, so the emulation has to be in
     place before the app's modules run. Emulate, then reload. */
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await page.reload({ waitUntil: 'networkidle2' });
  await sleep(2400);
  const reduced = await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  ok('SAMPLE the page really is in reduced motion, or this whole run is about nothing', reduced === true, `matches=${reduced}`);

  await freshToday();
  /* THE FIRST FRAME IS THE POINT. "It ends up complete" is true of the animated
     version too, so this samples fast and from the start: EVERY sample must
     already carry the whole line. */
  const fast = [];
  for (let i = 0; i < 40; i++) { const s = await sample(); if (s) fast.push(s); await sleep(15); }
  await dumpFrames(fast, 'reduced');

  ok('SAMPLE the reduced-motion line was captured', fast.length >= MIN_FRAMES, `${fast.length} frames`);
  const rfull = fast.length ? fast[0].full : 0;
  ok('SAMPLE the reduced-motion line has something to say', rfull > 0, `${rfull} characters`);
  /* FROM THE MOMENT THE LINE STARTS. Samples at zero characters are the window
     between the markup landing and the screen being revealed, where the box is not
     on screen yet and revealWhenReady has not started it: grading those is grading
     the wrong moment, and it made this row red on a correct build. The assertion
     stays sharp, because a line that types on is partial on its FIRST started
     sample and every one after it until it finishes. */
  const started = fast.filter(f => f.len > 0);
  ok('SAMPLE the reduced-motion line was captured after it started (a pre-reveal frame grades nothing)',
    started.length >= MIN_FRAMES, `${started.length} of ${fast.length} samples had the line started`);
  if (started.length >= MIN_FRAMES && rfull > 0) {
    const fast2 = started;
    const partial = fast2.filter(f => f.len !== f.full);
    ok('REDUCED the whole line is printed at once: from its first character on, no sample is ever partial',
      partial.length === 0 && fast2[0].len === fast2[0].full,
      `${partial.length} of ${fast2.length} started samples were partial, first started sample ${fast2[0].len}/${fast2[0].full}`);
    /* NO BLINK, GRADED IN PIXELS. Reduced motion goes straight to the finished
       state, where the caret is not rendered at all, so the honest assertion is
       that the detector which demonstrably sees carets (CONTROL-CARET above) sees
       none here. */
    ok('REDUCED the blinking caret is gone (same detector that fires on the animated run)',
      fast2.every(f => f.caret < CARET_MIN), `max caret ${Math.max(...fast2.map(f => f.caret))} px, floor ${CARET_MIN}`);
    /* And no 0.001s-duration caret spinning invisibly at 1000 iterations a second,
       which is this repo's own reduced-motion trap. */
    const anims = await page.evaluate(() => document.getAnimations().map(a => a.animationName || '').filter(n => /^tb/.test(n)));
    ok('REDUCED no talk-box animation is left running under reduced motion (not even a 0.001s one)',
      anims.length === 0, anims.length ? anims.join(',') : 'none');
  }
  await page.emulateMediaFeatures([]);
}

/* ---- COVERAGE: the graded set is derived from the app, not remembered ------ */
{
  const files = (await readdir(path.join(ROOT, 'js'))).filter(f => f.endsWith('.js') && f !== 'talkbox.js');
  const found = [];
  for (const f of files) {
    const src = await readFile(path.join(ROOT, 'js', f), 'utf8');
    /* A WINDOW, NOT A LINE. The one real call site in the app spans two lines,
       with the surface's own class in the options object on the second, so a
       line-at-a-time matcher could not see it and reported the site it had just
       counted as unregistered. That is the same shape of blindness as the CSS
       check that required a closing brace before its selector. 400 characters is
       comfortably more than one call and less than the next one. */
    for (const m of src.matchAll(/\btalkBoxHtml\s*\(/g)) {
      const before = src.slice(0, m.index);
      const line = before.split('\n').length;
      const lineStart = before.lastIndexOf('\n') + 1;
      if (/^\s*(\*|\/\/)/.test(src.slice(lineStart, m.index))) continue;   // a mention in a comment
      found.push({ file: `js/${f}`, line, window: src.slice(m.index, m.index + 400).replace(/\s+/g, ' ') });
    }
  }
  ok('COVERAGE the app has talk-box call sites to grade (zero would make this audit vacuous)',
    found.length > 0, `${found.length} call site(s)`);

  /* A site is matched by the class it renders into, which is how a converted
     surface identifies itself. Anything unmatched is an unregistered surface. */
  const keys = Object.keys(SITES);
  const unregistered = found.filter(f => !keys.some(k => {
    const [file, cls] = k.split(':');
    return f.file === file && f.window.includes(cls);
  }));
  ok('COVERAGE every talkBoxHtml() call site in the app is registered in SITES, so the NEXT converted bubble fails until it is driven or excused',
    unregistered.length === 0,
    unregistered.length ? unregistered.map(u => `${u.file}:${u.line} ${u.window.slice(0, 90)}`).join(' | ') : `${found.length} site(s), all registered`);
  /* The matcher itself can go blind: if a SITES key stops matching anything, the
     row above still passes (nothing is unregistered) while grading nothing. */
  const dead = keys.filter(k => { const [file, cls] = k.split(':'); return !found.some(f => f.file === file && f.window.includes(cls)); });
  ok('COVERAGE every SITES key still matches a real call site, so a stale key cannot read as coverage',
    dead.length === 0, dead.length ? dead.join(', ') : `${keys.length} key(s) all matched`);

  const undriven = keys.filter(k => !SITES[k].driven);
  console.log(`\nregistered talk-box surfaces: ${keys.length}, driven ${keys.length - undriven.length}, undriven ${undriven.length}`);
  for (const k of undriven) console.log(`  UNDRIVEN ${k}: ${SITES[k].why}`);
  ok('COVERAGE every registered surface states a reason', keys.every(k => (SITES[k].why || '').length > 10));
}

ok('the app threw nothing while the talk box ran', pageErrors.length === 0, pageErrors.join(' | ') || 'clean');

await browser.close().catch(() => {});
srv?.close();

const failed = results.filter(r => !r.pass);
if (!results.length) { console.log('\nFAIL: no checks ran'); process.exit(1); }
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) { console.log('FAILED: ' + failed.map(f => f.name).join(' | ')); }
else console.log('the talk box types, skips, and never says "wait" twice');
process.exit(exitFor(failed.length));
