/* THE TALK BOX SAYS ITS LINE, AND THE PLAYER CAN HURRY IT ALONG.
 *
 * Tom, 2026-08-20: "i also want to create an old school dialogue style system
 * where it types on with this style of font", "typing dialogue is going to be
 * instead of the chat bubbles everywhere in the app". Approved in the canvas
 * "The Raising and the Talk Box", artboard "The talk box".
 *
 * WHAT CHANGED IN v418, and why this audit no longer drives Today. Tom: "let's
 * remove the text bubble until we have gwart in the scene floating and talking
 * that will replace the bonehead talking and gwart will be more the coach
 * character." Today's line came off, so the app currently has ZERO talkBoxHtml()
 * surfaces. js/talkbox.js still ships, still precaches, and is what Gwart will
 * speak through, so deleting this audit with the surface would hand the next
 * author an untested typewriter. It grades the MODULE instead, on a harness page
 * (tests/talkbox-harness.html) that imports js/talkbox.js and calls
 * talkBoxHtml() + runTalkBox() against the REAL app.css, because the four states
 * are enforced by those rules and a harness with its own stylesheet would grade
 * nothing that ships.
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
 *              held box, which is the only shape where both states occur.
 *   REDUCED    prefers-reduced-motion prints the whole line at once and drops the
 *              blink. Graded from the FIRST frame after the run starts, because
 *              "it ends up complete" is true of the animated version too.
 *   TODAY      the Today screen carries no talk box. One row on the REAL app, so
 *              this removal cannot be silently undone, with a SETUP row so the
 *              absence cannot pass on a screen that never rendered.
 *
 * HOW IT IS GRADED, and why not a computed style. tally/CLAUDE.md: fire the real
 * control and assert pixels. getComputedStyle would happily report a visible
 * caret over a frame nobody painted. So the box is screenshotted at its own
 * clipped rect and every frame is reduced to three counts:
 *
 *   ink    pixels of --text (#f2e9d7) in the caret region: the characters.
 *   caret  pixels of --accent (#a5e847) in the caret region.
 *   chev   pixels of --gold (#ffc961) in the chevron's corner.
 *
 * THE CARET REGION, and the caveat the previous version of this file admitted to.
 * It used to be .tb-line's own rect, and at FULL line length the caret falls
 * OUTSIDE that: .tb-reveal is absolutely positioned over .tb-line, so once the
 * text fills the ghost, `text + caret` is wider than `text` alone and the caret
 * wraps onto a line below the rect. That is exactly the moment EXCLUSIVE is about
 * (the chevron only appears on a FINISHED box), so the row was narrower than its
 * description: it could not have seen the violation it claims to forbid. FIXED
 * HERE, two ways. The region now runs from .tb-line's top down to the box's inner
 * bottom, so a wrapped caret is inside it. And CONTROL-EXCLUSIVE-REACH forces the
 * caret visible on a finished held box and requires the SAME frame to score both
 * a caret and a chevron: the detector pair is proven able to see the failure
 * before EXCLUSIVE is allowed to report that it did not happen.
 *
 * FOUR CONTROLS, BECAUSE A CHECK THAT CANNOT FAIL IS NOT A CHECK. Every count
 * above is a detector that could simply never fire, and two of them are asserted
 * to be ZERO somewhere, which is exactly the shape that passes on a blank frame:
 *   CONTROL-CARET      some frame of a typing box scores caret pixels.
 *   CONTROL-CHEVRON    some frame of a FINISHED HELD box scores chevron pixels.
 *   CONTROL-ISOLATION  the speaker's NAME is the same #a5e847 as the caret, so the
 *                      caret count is only a caret count if the measured region
 *                      excludes the label. Measured on a finished held box, which
 *                      HAS a name and has NO caret: the count must be zero.
 *   CONTROL-EXCLUSIVE-REACH  see above: both detectors firing in one frame.
 * plus SAMPLE rows: an empty frame set, an empty sample list or a zero-length
 * line is a FAILURE, never a pass (anti-regression rule 3).
 *
 * HITTEST is anti-regression rule 6 as an assertion, and it is module CSS, not a
 * surface's: while the line is live the box must own the tap (or it can never be
 * skipped); once a line that leaves on its own has finished, the box must hand
 * the tap back (or it eats whatever it is floating over for the rest of the
 * render). BOTH directions, because either one alone is satisfiable by a mistake.
 *
 * COVERAGE derives the graded set from js/*.js rather than from a list somebody
 * remembers to update: every talkBoxHtml() call site in the app must appear in
 * SITES below, so the NEXT surface converted to a talk box fails this audit until
 * it is either driven or given a written reason. SITES is empty right now and
 * that is the point: Gwart's line will fail this until it is registered.
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
const HARNESS = base + 'tests/talkbox-harness.html';

const results = [];
const ok = (name, pass, detail = '') => {
  results.push({ name, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
};

/* MEASURED ON THIS TREE, not guessed, and both floors sit in the middle of a gap.
   At 440x956, deviceScaleFactor 2, --tb-size 11px (the harness uses the same size
   Today's box did, so these floors carry over unchanged):
     caret    present 241 - 242 px    absent (finished box, name visible)   0
     chevron  present  32 -  46 px    absent (a plain, un-held line)      0 - 8
   The absent side is a true zero because the box fill is opaque and nothing else
   inside it carries either colour, so the floors exist only to absorb a stray
   anti-aliased pixel. The chevron count is small because it is a 2.2px stroke on
   an 11px glyph; the FIRST version of this measured gold across the WHOLE box and
   scored up to 14 px on a box with no chevron at all (backdrop showing past the
   rotated corners mid-pop), which left a 14-to-32 gap I was not willing to grade
   on. Restricting it to the corner the chevron actually occupies moved the absent
   side to a real 0 and cost nothing. */
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
   tight enough that the olive plate (#7a8a4a) is nowhere near lime. */
const TOL = 28;
const ACCENT = [165, 232, 71];   // --accent  #a5e847
const GOLD = [255, 201, 97];     // --gold    #ffc961
const INK = [242, 233, 215];     // --text    #f2e9d7

/* Long enough to wrap onto three lines at the harness width, so the caret spends
   the run in the same awkward end-of-wrapped-line place it does in a real box. */
const LINE = 'Crack that crate open already, chief, it is not going to do it by itself.';
const HELD_LINE = 'Woof. (Feed him.) Bark. Bones. Bark.';
const SPEAKER = 'BONEHOUND';

/* EVERY talkBoxHtml() CALL SITE IN THE APP. A site that is not here fails
   COVERAGE below; a site that is here and undriven prints its reason on every
   run so it cannot rot into "covered". EMPTY ON PURPOSE as of v418: Today's line
   came off and Gwart's is not built. The rows below still grade the module, and
   the moment Gwart (or anything else) renders a box, COVERAGE goes red until it
   is registered here. */
const SITES = {};

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
  // region is the caret region in IMAGE pixels, already insetted by the caller
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

/* ==================== TODAY CARRIES NO TALK BOX ============================
   The one row on the real app, and it comes first so a failure here is the first
   thing printed. v418 took the line off Today; without this row putting it back
   is silent, and the audit that used to guard it now looks at a harness. */
{
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
  await page.evaluate(() => { location.hash = '#/today'; });
  await sleep(1400);
  const t = await page.evaluate(() => ({
    /* THE PREMISE. An absence passes on a screen that never rendered, so this
       row has to be true before the next one means anything. The hero card is
       the specific thing the box used to float over. */
    rendered: (document.getElementById('screen')?.textContent || '').trim().length > 200,
    hero: !!document.querySelector('.hero-card #bhStage'),
    boxes: document.querySelectorAll('.talkbox').length,
    bubbles: document.querySelectorAll('.hero-bubble').length,
  }));
  ok('SETUP Today really rendered, with the hero card the box used to sit on (an empty screen would pass the row below for free)',
    t.rendered && t.hero, JSON.stringify({ rendered: t.rendered, hero: t.hero }));
  ok('TODAY the Today screen carries no talk box: the line is off until Gwart is in the scene to say it',
    t.boxes === 0 && t.bubbles === 0, `${t.boxes} .talkbox, ${t.bubbles} .hero-bubble`);
}

/* ==================== THE MODULE, ON ITS HARNESS ========================== */
await page.goto(HARNESS, { waitUntil: 'networkidle2' });
await page.evaluate(() => document.fonts.ready);
const harnessUp = await page.evaluate(() => !!window.__tbHarness && typeof window.tbMount === 'function');
ok('SETUP the harness loaded js/talkbox.js and exposes the real emitter and runner',
  harnessUp, harnessUp ? HARNESS : `${HARNESS} did not come up`);

/* Read everything this audit grades off the live box in ONE evaluate, so a sample
   is one coherent moment rather than four reads drifting apart. */
const GEO = () => page.evaluate(() => {
  const b = document.querySelector('.talkbox');
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
   box's own axis-aligned rect, outset 2px so the border survives rounding.
   THE CARET REGION runs from .tb-line's top (pulled in 4px, because the speaker's
   name sits directly above the line in the same colour as the caret: see
   CONTROL-ISOLATION) down to the box's inner bottom, so the caret that wraps
   below .tb-line at full line length is inside it. See the header. */
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
  const top = g.line.y - clip.y + 4;
  const bottom = g.box.y + g.box.h - 2 - clip.y;
  const m = await measure(b64, {
    x: (g.line.x - clip.x) * SCALE,
    y: top * SCALE,
    w: g.line.w * SCALE,
    h: Math.max(0, bottom - top) * SCALE,
  }, CHEV_REGION);
  return { ...g, ...m, b64 };
}

/* Mount a fresh box and start it, which is what starts a line from zero. The two
   halves are separate on purpose: talkBoxHtml() renders the markup and
   runTalkBox() begins the typing, exactly the way the app's reveal path does it. */
async function freshLine(text, opts = {}) {
  const mounted = await page.evaluate((t, o) => window.tbMount(t, o), text, opts);
  await page.evaluate(() => window.tbStart());
  return mounted;
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
  await freshLine(LINE);
  /* A @font-face is only fetched once something on the page asks for a glyph in
     it, so this waits AFTER the first box is mounted, and awaits inside the page:
     page.evaluate cannot serialise the FontFaceSet that document.fonts.ready
     resolves to, and returning it read as "already settled" while the face was
     still loading. */
  await page.evaluate(async () => { await document.fonts.ready; return true; });
  const f = await page.evaluate(() => {
    const b = document.querySelector('.talkbox');
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

/* ---- RUN 1: the plain line (no speaker, no chevron, leaves on its own) ------ */
let plain = [];
{
  const mounted = await freshLine(LINE);
  ok('SAMPLE talkBoxHtml() rendered a box for the plain line', mounted);
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
       where the box has not been painted yet, and letting it into the noise
       measurement inflates the floor, which loosens the band. Excluding it makes
       this row STRICTER, not weaker. */
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
    ok('STATE the plain line has no speaker label (a label is what marks a character)',
      plain.every(f => f.name === ''), `saw "${plain[0].name}"`);

    /* HITTEST, both directions (anti-regression rule 6). This is module CSS
       (.talkbox.tb-done:not(.tb-hold) goes pointer-events:none), so it is the
       module's promise to every surface, not Today's. */
    const live = plain.find(f => !f.done);
    const settled = plain[plain.length - 1];
    ok('HITTEST while the line is live the box owns its own centre, so the skip tap can land',
      !!live && live.hit === 'box', live ? `hit=${live.hit}` : 'no live frame captured');
    ok('HITTEST once a self-dismissing line is finished the box hands the tap back to what it floats over',
      settled.done && settled.hit !== 'box', `done=${settled.done} hit=${settled.hit}`);
  }
}

/* ---- RUN 2: SKIP ----------------------------------------------------------- */
{
  await freshLine(LINE);
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
  const mounted = await freshLine(HELD_LINE, { name: SPEAKER, hold: true });
  ok('SAMPLE talkBoxHtml() rendered a NAMED, HELD box, so those two states can be reached at all', mounted);
  held = await capture({ ms: 2200, every: 70 });
  await dumpFrames(held, 'held');

  ok('SAMPLE the held line was captured', held.length >= MIN_FRAMES, `${held.length} frames`);
  if (held.length >= MIN_FRAMES) {
    ok('STATE a named speaker carries its label: the label is what makes a line a character',
      held.every(f => f.name.length > 0), `name="${held[0].name}"`);
    ok('STATE a held line WAITS instead of leaving on its own',
      held.every(f => f.hold), `${held.filter(f => !f.hold).length} frame(s) not held`);

    const done = held.filter(f => f.done);
    const typing = held.filter(f => !f.done);
    ok('CONTROL-CARET the caret detector fires on the held box too, below the name label',
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

    /* CAN THIS ROW SEE THE FAILURE IT FORBIDS? The chevron only appears on a
       FINISHED box, and on a finished box the caret is display:none, so nothing in
       the frames above ever had the chance to score both. The previous version of
       this audit stopped there and admitted the row was narrower than its
       description. This forces the caret back on at exactly that moment (the one
       state where both would collide) and requires ONE frame to score both
       detectors. If the caret at full line length falls outside the measured
       region, this goes red and EXCLUSIVE below is not allowed to claim a clean
       sweep. */
    await page.evaluate(() => {
      const s = document.createElement('style');
      s.id = 'tbReach';
      s.textContent = '.talkbox.tb-done .tb-caret { display: inline-block !important; animation: none !important; }';
      document.head.appendChild(s);
    });
    await sleep(120);
    const reach = await sample();
    await page.evaluate(() => document.getElementById('tbReach')?.remove());
    ok('CONTROL-EXCLUSIVE-REACH with the caret forced on over a finished held box, ONE frame scores a caret AND a chevron, so EXCLUSIVE can see the collision it forbids',
      !!reach && reach.caret >= CARET_MIN && reach.chev >= CHEV_MIN,
      reach ? `caret ${reach.caret} (floor ${CARET_MIN}), gold ${reach.chev} (floor ${CHEV_MIN})` : 'no frame captured');
    await sleep(120);
    const restored = await sample();
    ok('CONTROL-EXCLUSIVE-REACH the forced caret was taken back off again, so the rows after this one grade the real box',
      !!restored && restored.caret < CARET_MIN, restored ? `caret ${restored.caret}` : 'no frame captured');

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

/* ---- RUN 4: REDUCED MOTION ------------------------------------------------- */
{
  /* fx.js reads matchMedia ONCE at module load, so the emulation has to be in
     place before the module runs. Emulate, then reload. */
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await page.reload({ waitUntil: 'networkidle2' });
  await page.evaluate(() => document.fonts.ready);
  const reduced = await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  ok('SAMPLE the page really is in reduced motion, or this whole run is about nothing', reduced === true, `matches=${reduced}`);

  await freshLine(LINE);
  /* THE FIRST FRAME IS THE POINT. "It ends up complete" is true of the animated
     version too, so this samples fast and from the start: EVERY sample must
     already carry the whole line. */
  const fast = [];
  for (let i = 0; i < 40; i++) { const s = await sample(); if (s) fast.push(s); await sleep(15); }
  await dumpFrames(fast, 'reduced');

  ok('SAMPLE the reduced-motion line was captured', fast.length >= MIN_FRAMES, `${fast.length} frames`);
  const rfull = fast.length ? fast[0].full : 0;
  ok('SAMPLE the reduced-motion line has something to say', rfull > 0, `${rfull} characters`);
  const started = fast.filter(f => f.len > 0);
  ok('SAMPLE the reduced-motion line was captured after it started (a frame before the run grades nothing)',
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
  const CALL = /\btalkBoxHtml\s*\(/g;
  const scan = src => {
    const out = [];
    for (const m of src.matchAll(CALL)) {
      const before = src.slice(0, m.index);
      const lineStart = before.lastIndexOf('\n') + 1;
      if (/^\s*(\*|\/\/)/.test(src.slice(lineStart, m.index))) continue;   // a mention in a comment
      out.push({ line: before.split('\n').length, window: src.slice(m.index, m.index + 400).replace(/\s+/g, ' ') });
    }
    return out;
  };
  const files = (await readdir(path.join(ROOT, 'js'))).filter(f => f.endsWith('.js') && f !== 'talkbox.js');
  const found = [];
  for (const f of files) {
    const src = await readFile(path.join(ROOT, 'js', f), 'utf8');
    /* A WINDOW, NOT A LINE. The one real call site the app used to have spanned
       two lines, with the surface's own class in the options object on the second,
       so a line-at-a-time matcher could not see it and reported the site it had
       just counted as unregistered. That is the same shape of blindness as the CSS
       check that required a closing brace before its selector. 400 characters is
       comfortably more than one call and less than the next one. */
    for (const s of scan(src)) found.push({ file: `js/${f}`, ...s });
  }
  ok('SAMPLE the coverage scan really read the app (zero files would make every row here vacuous)',
    files.length >= 5, `${files.length} module(s) scanned`);
  /* THE SCANNER'S OWN POSITIVE CONTROL. There are ZERO call sites in the app right
     now (that is the point of v418), so "nothing unregistered" is exactly the
     shape that passes while blind. This proves the matcher would see a site if
     there were one, and that a mention in a comment is still skipped. */
  const probe = scan('const a = 1;\n// talkBoxHtml( in a comment\nfoo(talkBoxHtml(x, { cls: "gwart-line" }));\n');
  ok('CONTROL-SCANNER the call-site matcher finds a real call and skips a commented one, so "no unregistered sites" is not blindness',
    probe.length === 1 && probe[0].window.includes('gwart-line'),
    `${probe.length} hit(s): ${probe.map(p => p.window.slice(0, 40)).join(' | ')}`);

  /* A site is matched by the class it renders into, which is how a converted
     surface identifies itself. Anything unmatched is an unregistered surface. */
  const keys = Object.keys(SITES);
  const unregistered = found.filter(f => !keys.some(k => {
    const [file, cls] = k.split(':');
    return f.file === file && f.window.includes(cls);
  }));
  ok('COVERAGE every talkBoxHtml() call site in the app is registered in SITES, so the NEXT surface to render a box (Gwart) fails until it is driven or excused',
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
  if (!keys.length) console.log('  (no app surface renders a talk box right now: Today\'s came off in v418, Gwart\'s is not built. The module is graded on tests/talkbox-harness.html.)');
}

ok('the app threw nothing while the talk box ran', pageErrors.length === 0, pageErrors.join(' | ') || 'clean');

await browser.close().catch(() => {});
srv?.close();

const failed = results.filter(r => !r.pass);
if (!results.length) { console.log('\nFAIL: no checks ran'); process.exit(1); }
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) { console.log('FAILED: ' + failed.map(f => f.name).join(' | ')); }
else console.log('the talk box types, skips, and never says "wait" twice; Today stays quiet');
process.exit(exitFor(failed.length));
