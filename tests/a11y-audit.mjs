/* THE ACCESSIBILITY GUARD.
 *
 * Round-5 adversarial pass, 2026-08-31. Five separate defects, all measured at
 * 375x667 and 390x844, all shipped:
 *
 *   - the wallet chips are 25x15.5 to 44x16. They open real sheets and they are
 *     the smallest interactive elements in the app. Apple's floor is 44x44.
 *   - .toast is fixed at z-index 80 with no pointer-events, so for the 2.2 to
 *     3.6 seconds a message is up it EATS the taps of everything under it.
 *     That is this repo's own anti-regression rule 6, broken by the toast.
 *   - cream on coral measures 2.39:1 in the fight HUD's range pill and the
 *     Build tab's TO SPEND chip, against the 4.5 small text needs.
 *   - wardrobe rarity was carried by border colour ALONE, so a colourblind
 *     player cannot read their own collection.
 *   - #toast got its aria-live INSIDE the first nextToast() call, in the same
 *     tick the first message landed, so the session's first toast announced to
 *     nobody.
 *
 * WHAT MAKES THIS A CHECK AND NOT A FILE. Four things, and rule 1 of
 * tally/CLAUDE.md is why each one is here:
 *
 *   1. TAP TARGETS ARE MEASURED BY HIT-TESTING, NOT BY READING A BOX. The fix
 *      is a transparent ::before that enlarges the tappable area without moving
 *      a pixel, so getBoundingClientRect on the button still reports 25x15.5
 *      and would grade a correct fix as broken. This walks outward from each
 *      control's centre with document.elementFromPoint and reports how far the
 *      control actually answers. That also means a NEIGHBOUR stealing the
 *      overlap shows up as a smaller number, which is the failure the day-nav
 *      arrows shipped once before.
 *   2. THE TOAST IS GRADED IN TWO RENDERED STATES. Same buttons, same page,
 *      once with a real toast on screen and once without. A markup assertion
 *      that `pointer-events: none` is present would pass over a toast that had
 *      been given a higher-specificity override somewhere else in 11k lines.
 *      Both sample sets must be non-empty (rule 3).
 *   3. CONTRAST IS SAMPLED OFF THE RENDER. The failing backgrounds here are a
 *      soft-light grain layer and a radial coral wash: neither is a
 *      backgroundColor any DOM walk can read, and the token comment at the top
 *      of app.css claiming 5.00:1 is true of --surface and false of what the
 *      player sees. So this screenshots the page, decodes it, and takes the
 *      modal pixel inside each text box as the real background.
 *   4. IT CARRIES ITS OWN CONTROLS. A 20x20 probe button, a 2.39:1 probe pair
 *      and a rarity-free probe cell are planted on the page and MUST be caught.
 *      If the instrument stops finding the bugs it was built for, the run fails
 *      even when the app is clean.
 *
 *   node tests/a11y-audit.mjs [baseUrl]
 */
import { boot, sleep, settle, setWidth, exitFor } from './godmode.js';

const base = process.argv.slice(2).find(a => !a.startsWith('--')) || process.env.URL;
const SIZES = [[375, 667], [390, 844]];
const FLOOR = 44;                       // Apple HIG minimum tappable edge, in CSS px
const problems = [];
const rows = [];
const fail = m => { problems.push(m); console.log(`FAIL  ${m}`); };
const info = m => console.log(`      ${m}`);

/* ---------------------------------------------------------------- helpers */

/* Injected once per page. Everything below runs inside the page. */
const HARNESS = () => {
  const W = window;

  /* HOW FAR DOES THIS CONTROL ACTUALLY ANSWER A TAP.
     Walks out from the centre in each direction until elementFromPoint stops
     naming the control (or something inside it). Binary-ish stepping keeps it
     to ~7 probes a direction instead of 60. Returns the effective hit box in
     CSS px, which is the number Apple's 44 is about. */
  W.__hitBox = el => {
    el.scrollIntoView({ block: 'center', behavior: 'instant' });
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return null;
    let cx = Math.round(r.left + r.width / 2), cy = Math.round(r.top + r.height / 2);
    const owns = (x, y) => {
      if (x < 0 || y < 0 || x > innerWidth - 1 || y > innerHeight - 1) return false;
      const hit = document.elementFromPoint(x, y);
      return !!hit && (hit === el || el.contains(hit));
    };
    if (!owns(cx, cy)) {
      /* ONE NUDGE, THEN BELIEVE IT. scrollIntoView({block:'center'}) can park a
         row under the day header, which is a harness artifact and not the
         player's experience. Scroll it lower and re-read once; if it is still
         covered, that IS the finding. */
      let sc = el.parentElement;
      while (sc && !(sc.scrollHeight > sc.clientHeight + 4 && /auto|scroll/.test(getComputedStyle(sc).overflowY))) sc = sc.parentElement;
      for (const dy of [-60, -120, 60, 120]) {
        (sc || document.scrollingElement).scrollBy(0, dy);
        const r2 = el.getBoundingClientRect();
        cx = Math.round(r2.left + r2.width / 2); cy = Math.round(r2.top + r2.height / 2);
        if (owns(cx, cy)) break;
      }
      if (!owns(cx, cy)) return { blocked: document.elementFromPoint(cx, cy)?.className || 'unknown' };
    }
    // reach in one direction: largest d up to 40 where the control still answers
    const reach = (dx, dy) => {
      let lo = 0, hi = 40;
      while (lo < hi) { const mid = Math.ceil((lo + hi) / 2);
        if (owns(cx + dx * mid, cy + dy * mid)) lo = mid; else hi = mid - 1; }
      return lo;
    };
    const l = reach(-1, 0), rr = reach(1, 0), u = reach(0, -1), d = reach(0, 1);
    return { w: l + rr + 1, h: u + d + 1, box: { w: +r.width.toFixed(1), h: +r.height.toFixed(1) } };
  };

  /* Which element receives a tap at a control's centre. Anti-regression rule 6. */
  W.__topAt = (el, scroll = true) => {
    /* scroll=false for the toast band: __topAt used to scroll unconditionally,
       so the "with a toast" pass measured a DIFFERENT set of buttons from the
       "without" pass (2 vs 3 at 390x844) and the comparison was between two
       different pages. Anything already in the toast's band is on screen by
       definition and must not be moved. */
    if (scroll) el.scrollIntoView({ block: 'center', behavior: 'instant' });
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2));
    if (!hit) return 'none';
    if (hit === el || el.contains(hit)) return 'self';
    return hit.id ? '#' + hit.id : hit.tagName.toLowerCase() + '.' + String(hit.className || '').split(' ')[0];
  };

  W.__lum = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
  W.__ratio = (a, b) => { const l1 = W.__lum(a), l2 = W.__lum(b);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); };
};

/* THE MODAL PIXEL IS THE BACKGROUND. Text covers a minority of its own box, so
   the most common colour inside the box is what is behind the glyphs, grain,
   wash, gradient and all. Antialiased edges are a long tail and never the mode.
   Quantised to 4 levels per channel so a grain that dithers by +-3 does not
   split its own peak into forty buckets. */
async function samplePage(page, shot) {
  await page.evaluate(async png => {
    const img = await createImageBitmap(await (await fetch(png)).blob());
    const cv = new OffscreenCanvas(img.width, img.height);
    const cx = cv.getContext('2d', { willReadFrequently: true });
    cx.drawImage(img, 0, 0);
    const dpr = img.width / innerWidth;
    window.__bgAt = (el, fg) => {
      const r = el.getBoundingClientRect();
      const x = Math.round(r.left * dpr), y = Math.round(r.top * dpr);
      const w = Math.round(r.width * dpr), h = Math.round(r.height * dpr);
      if (w < 2 || h < 2 || x < 0 || y < 0 || x + w > img.width || y + h > img.height) return null;
      const d = cx.getImageData(x, y, w, h).data;
      const hist = new Map();
      for (let i = 0; i < d.length; i += 4) {
        const k = ((d[i] >> 2) << 16) | ((d[i + 1] >> 2) << 8) | (d[i + 2] >> 2);
        const e = hist.get(k); if (e) { e.n++; e.r += d[i]; e.g += d[i + 1]; e.b += d[i + 2]; }
        else hist.set(k, { n: 1, r: d[i], g: d[i + 1], b: d[i + 2] });
      }
      /* THE MODE MUST NOT BE THE INK. A tight heading set in a display face can
         put more glyph pixels than background pixels inside its own box, and
         the first version of this dutifully reported .hype-eye at 1:1 because
         the winning bucket WAS the text colour. So the background is the most
         common colour that is not the ink: same rule, one exclusion, and if
         nothing survives it that is a null and a loud failure rather than a
         flattering number. */
      const far = e => !fg || Math.abs(e.r / e.n - fg[0]) + Math.abs(e.g / e.n - fg[1]) + Math.abs(e.b / e.n - fg[2]) > 60;
      let best = null; for (const e of hist.values()) if (far(e) && (!best || e.n > best.n)) best = e;
      return best ? [Math.round(best.r / best.n), Math.round(best.g / best.n), Math.round(best.b / best.n)] : null;
    };
  }, shot);
}

const shotOf = async page => 'data:image/png;base64,' + await page.screenshot({ encoding: 'base64' });

/* --------------------------------------------------------- the registries */

/* TAP TARGETS THIS PASS IS RESPONSIBLE FOR, and where the 44 comes from:
   Apple's Human Interface Guidelines have said 44x44pt since iOS 7, and it is
   what App Store review taps against. Round-5 accessibility pass, 2026-08-31,
   which measured every one of these under it at 375x667 and 390x844.
   Every row must measure FLOOR x FLOOR of real, un-stolen hit area on every
   viewport. Add a row with every new control; a control that cannot be reached
   is a FAILURE, never a skip. */
const TARGETS = [
  { surface: 'today', sel: '#coinBtn',       why: 'wallet: opens the crates hub' },
  { surface: 'today', sel: '#dustBtn',       why: 'wallet: opens the crates hub' },
  { surface: 'today', sel: '#vigorBtn',      why: 'wallet: opens the Pit' },
  { surface: 'today', sel: '#cratesBtn',     why: 'wallet: opens the crates hub', optional: true },
  { surface: 'today', sel: '#prevDay',       why: 'day nav' },
  { surface: 'today', sel: '#nextDay',       why: 'day nav' },
  { surface: 'today', sel: '#todaySettings', why: 'day nav: Settings' },
  { surface: 'today', sel: '.q-claim',       why: 'quest payout', inject: 'q-claim' },
  { surface: 'settings', sel: '.seg button', why: 'every On/Off in Settings', all: true },
  /* Round-9 pass, 2026-09-01. The segmented toggles above already passed at 44
     effective; the secondary buttons beneath them never got the treatment and
     measured 42x43 (.btn.small) and 74x17.5 (#recalc). Taken by CLASS, not by
     the eight ids, so the next button added to Settings is graded too. */
  { surface: 'settings', sel: '.btn.small', why: 'every secondary Settings action: export, import, erase, redeem, save targets, notification test, copy diagnostics, what is new', all: true },
  { surface: 'settings', sel: '#recalc', why: 'the Recalculate link in the DAILY TARGETS card title' },
  { surface: 'build', sel: '.t3-pm',         why: 'stat +/-', all: true },
  { surface: 'build', sel: '#gearBtn',      why: 'the floating Settings gear (route() hides it on Today/Settings/Boneyard)' },
  { surface: 'shop',  sel: '#gwGear',       why: "the Emporium's own Settings gear" },
  { surface: 'shop',  sel: 'button.t3-price', why: 'buy', all: true },
  /* THE LOGGING PATH, QA round 25 M24 (the a11y half), 2026-09-04. Until this
     block the registry held not one control from the Add or Portion sheets:
     the thing a player touches most, every day, and the surface this audit was
     never pointed at. So `.sheet-close` shipped at 44x41 (its own min-height: 44px
     at app.css ~445 is shadowed by `.t1-icon-btn`'s min-height: 40px 6,283 lines
     later at the SAME specificity), `#favBtn` at 40x41 and `#qtyIn` at 181x31,
     all with this file green. Third guard of the round found testing above the
     layer its bug lives at (after the xp-cap lint and the log-write injection).
     PROVE-RED: with the three M20 CSS fixes reverted (`.t1-tools .t1-icon-btn`
     and the `.t1-step .val input` min-height), exactly these three rows go red
     on both viewports: #favBtn, the portion sheet's .sheet-close, #qtyIn. Every
     other row here already sits on a 44px+ recipe (.t1-seg button 44, .t1-step
     button 56, .t1-search input 48, .t1-frow 64, .btn ~54) and stays green.
     .sheet-close is scoped to the TOP sheet (#sheets > div:last-child): on the
     portion surface the Add sheet is still mounted underneath with its own
     .sheet-close, which querySelectorAll would return first and the hit-test
     would then report as blocked by the backdrop above it, a false red. */
  { surface: 'add', sel: '#sheets > div:last-child .sheet-close',   why: 'Add sheet: Done (the shadowed .sheet-close)' },
  { surface: 'add', sel: '#mealChips button',      why: 'Add sheet: meal chips', all: true },
  { surface: 'add', sel: '#q',                     why: 'Add sheet: the search input' },
  { surface: 'add', sel: '#results button[data-food]', why: 'Add sheet: the first result row (opens the portion sheet)' },
  { surface: 'portion', sel: '#favBtn',            why: 'Portion sheet: favourite (a bare .t1-icon-btn, 40x40 until M20)' },
  { surface: 'portion', sel: '#sheets > div:last-child .sheet-close', why: 'Portion sheet: Cancel (the shadowed .sheet-close)' },
  { surface: 'portion', sel: '#servChips button',  why: 'Portion sheet: serving chips', all: true },
  { surface: 'portion', sel: '.t1-step button',    why: 'Portion sheet: the +/- stepper', all: true },
  { surface: 'portion', sel: '#qtyIn',             why: 'Portion sheet: the amount input (181x31 until M20)' },
  { surface: 'portion', sel: '#pMealChips button', why: 'Portion sheet: meal chips', all: true },
  { surface: 'portion', sel: '#addBtn',            why: 'Portion sheet: commit' },
];

/* CONTRAST PAIRS THIS PASS IS RESPONSIBLE FOR, and where the thresholds come
   from: WCAG 2.1 AA, 4.5:1 for body text and 3:1 for large text, which is the
   bar an accessibility review applies. Round-5 accessibility pass, 2026-08-31,
   which measured these four groups failing, worst 2.39:1 across 26 instances.
   Text colour comes from the computed style (glyphs paint at full alpha); the
   background is the modal pixel off the render, which is the only honest read
   of a grain-blended card or a coral radial wash. */
const CONTRAST = [
  /* NO ROW FOR THE NEWS PILL'S HERO BANNER, 2026-09-03, and it is the driver that
     stops it rather than the subject. Two .hype rows lived here until the Today
     hype banner was deleted that morning; the banner came back the same day as the
     hero slot inside the news pill, which is a <details> that is SHUT at rest. The
     element finder below requires `offsetParent !== null`, and everything behind a
     shut disclosure is display:none, so a row here would find nothing on every
     run: `optional: true` would make it a check that cannot fail, and without it
     the file goes red on healthy code. Teaching this pass to open a disclosure is
     the honest fix and it is a change to the driver, not a row.
     UNTIL THEN THE ARITHMETIC IS PINNED IN app.css, over the worst pixel that
     coral wash can paint (rgb(130,62,60), both coral layers at full strength):
     both lines of the hero's copy are --text at 6.44:1, and the comment there
     records why the blurb cannot take --text-2 (3.48:1) or an opacity. */
  { surface: 'today', sel: '.tsec-h',          why: '--text-3 over a grain-blended card' },
  { surface: 'today', sel: '.day-title .sub',  why: '--text-3 subtitle' },
  { surface: 'today', sel: '.q-coins',         why: '--text-3 note', optional: true },
  { surface: 'build', sel: '.t3-fighter .tp b',     why: 'TO SPEND chip: cream on coral' },
  { surface: 'build', sel: '.t3-fighter .tp small', why: 'TO SPEND chip: cream on coral' },
  { surface: 'fight', sel: '.range-pill',      why: 'fight HUD range pill: cream on coral' },
];

/* ------------------------------------------------------------ navigation */

async function goTo(page, surface) {
  /* history.back() is ASYNC. The first version of this looped on
     querySelector('#sheets > div') without awaiting, so it fired back() hundreds
     of times, navigated off the app and killed the execution context at 390x844.
     Bounded, and awaited. */
  const clean = async () => {
    await page.evaluate(() => { document.querySelector('.dw')?.remove(); document.querySelector('.drop-veil')?.remove(); });
    for (let i = 0; i < 4; i++) {
      if (!await page.evaluate(() => !!document.querySelector('#sheets > div'))) break;
      await page.evaluate(() => history.back());
      await sleep(400);
    }
  };
  if (surface === 'today')    { await page.evaluate(() => { location.hash = '#/today'; }); await sleep(2200); }
  if (surface === 'settings') { await page.evaluate(() => { location.hash = '#/settings'; }); await sleep(2000); }
  if (surface === 'build') {
    await page.evaluate(() => { location.hash = '#/bonehead'; }); await sleep(2000);
    await page.evaluate(() => document.querySelector('[data-tab="talents"]')?.click()); await sleep(1600);
  }
  if (surface === 'shop') {
    await page.evaluate(() => { location.hash = '#/bonehead'; }); await sleep(2000);
    await page.evaluate(() => document.querySelector('[data-tab="shop"]')?.click()); await sleep(1800);
  }
  if (surface === 'wardrobe') {
    await page.evaluate(() => { location.hash = '#/bonehead'; }); await sleep(2000);
    await page.evaluate(() => document.querySelector('[data-tab="wardrobe"]')?.click()); await sleep(1800);
  }
  if (surface === 'pit') {
    await page.evaluate(() => { location.hash = '#/today'; }); await sleep(1800);
    await clean();
    await page.evaluate(() => document.getElementById('pitBtn')?.click()); await sleep(2000);
  }
  if (surface === 'fight') {
    await goTo(page, 'pit');
    /* A REAL MOUSE, not .click(). godmode says so and means it: some of this
       app's handlers never see a synthetic click, and a fight that silently
       does not start would leave the range pill unmeasured and green. */
    const at = await page.evaluate(() => {
      const b = document.querySelector('button[data-spar]');
      if (!b) return null; b.scrollIntoView({ block: 'center', behavior: 'instant' });
      const r = b.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    if (at) await page.mouse.click(at.x, at.y);
    await sleep(2800);
  }
  /* THE LOGGING PATH (QA round 25 M24). Two sheets, reached the way a player
     reaches them: the FAB, then a search, then the first result. A fresh audit
     profile has no recents, so the default list is an empty note and the
     "first result row" only exists after a query; "banana" is a built-in with
     two servings, so the portion sheet opens in serving mode and renders #qtyIn
     (grams mode renders #gramsIn instead, which is the same rule and the same
     fix). #fab's handler is a plain addEventListener('click'), so .click() is
     enough here. */
  if (surface === 'add' || surface === 'portion') {
    await page.evaluate(() => { location.hash = '#/today'; }); await sleep(1800);
    await clean();
    await page.evaluate(() => document.getElementById('fab')?.click()); await sleep(1500);
    await page.evaluate(() => {
      const q = document.getElementById('q');
      if (!q) return;
      q.value = 'banana'; q.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await sleep(900);   // the search debounce is 120ms
    if (surface === 'portion') {
      await page.evaluate(() => document.querySelector('#results button[data-food]')?.click());
      await sleep(1500);
    }
  }
  if (!['pit', 'fight', 'add', 'portion'].includes(surface)) await clean();
  await settle(page);
  await page.evaluate(HARNESS);
}

/* A control this profile does not happen to render still has to be measured:
   the fix is CSS, and that CSS only means anything inside a real row. So the
   button is built with the app's own class and appended to a real .q-row, in
   the real grid, at the real width. Labelled INJECTED in the report so nobody
   reads it as a driven control. */
async function inject(page, kind) {
  if (kind !== 'q-claim') return;
  /* TWO, in ADJACENT rows. One probe cannot see the failure that matters here:
     a 44px hit area on a 28px button in a 7px-gapped list is only 44px if the
     row above and below are not claiming the same pixels. */
  await page.evaluate(() => {
    /* THE REAL ONE FIRST. The quest list lives in a closed <details.q-collapse>,
       and its `has-claim` class means the app has already decided a real Claim
       button belongs in there. Opening it is what a player does; the button
       that comes back is the app's own, not a probe. */
    document.querySelector('details.q-collapse')?.setAttribute('open', '');
  });
  await sleep(700);
  await page.evaluate(() => {
    /* A SECOND ONE, ADJACENT. One button cannot show the failure that matters:
       a 44px hit area on a 28px button in a 7px-gapped list is only 44px if the
       row above is not claiming the same pixels. */
    const rows = [...document.querySelectorAll('.q-row')].filter(r => r.offsetParent);
    if (rows.filter(r => r.querySelector('.q-claim')).length >= 2) return;
    for (const row of rows.slice(0, 2)) {
      if (row.querySelector('.q-claim')) continue;
      row.querySelector('.q-frac, .q-done')?.remove();
      const b = document.createElement('button');
      b.className = 'q-claim'; b.textContent = 'Claim'; b.dataset.claim = '__probe';
      row.appendChild(b);
    }
  });
}

/* --------------------------------------------------------------- sections */

async function tapTargets(page, w, h) {
  const bySurface = new Map();
  for (const t of TARGETS) { if (!bySurface.has(t.surface)) bySurface.set(t.surface, []); bySurface.get(t.surface).push(t); }
  let measured = 0;
  for (const [surface, list] of bySurface) {
    await goTo(page, surface);
    for (const t of list) {
      if (t.inject) await inject(page, t.inject);
      const got = await page.evaluate((sel, all) => {
        const els = [...document.querySelectorAll(sel)].filter(e => e.offsetParent !== null || getComputedStyle(e).position === 'fixed');
        const pick = all ? els : els.slice(0, 1);
        /* SCROLLED TO, then hit-tested. elementFromPoint answers about the
           VIEWPORT, so a control below the fold reads as "nothing tappable at
           its centre" no matter how big its hit area is, and Settings is far
           longer than a phone. Scroll and measure one at a time: instant
           scrolling settles synchronously, so each read is of that control's
           own layout, and a neighbour that steals the overlap still shows up. */
        return pick.map(e => {
          e.scrollIntoView({ block: 'center', behavior: 'instant' });
          return { id: e.id || null, probe: e.dataset.claim === '__probe',
            hit: window.__hitBox(e), top: window.__topAt(e) };
        });
      }, t.sel, !!t.all || !!t.inject);
      if (!got.length) {
        if (t.optional) { info(`${w}x${h} ${surface} ${t.sel}: not present on this profile (optional)`); continue; }
        fail(`${w}x${h} ${surface} ${t.sel}: NOT FOUND, so its tap target was never measured`);
        continue;
      }
      for (const g of got) {
        measured++;
        const name = g.id ? '#' + g.id : t.sel;
        if (!g.hit || g.hit.blocked) { fail(`${w}x${h} ${name}: nothing tappable at its centre (${g.hit?.blocked || 'no box'})`); continue; }
        rows.push({ w, h, name, ...g.hit, why: t.why, inject: !!t.inject });
        const tag = g.probe ? ' PROBE' : '';
        if (g.hit.w < FLOOR || g.hit.h < FLOOR)
          fail(`${w}x${h} ${name}: hit area ${g.hit.w}x${g.hit.h} (box ${g.hit.box.w}x${g.hit.box.h}), floor is ${FLOOR}x${FLOOR}${tag}`);
        else info(`${w}x${h} ${name}: hit ${g.hit.w}x${g.hit.h} (box ${g.hit.box.w}x${g.hit.box.h})${tag}`);
        if (g.top !== 'self') fail(`${w}x${h} ${name}: a tap at its centre lands on ${g.top}, not on it`);
      }
    }
  }
  /* AND THEY MUST NOT HAVE STOLEN ANYONE ELSE'S TAPS. Anti-regression rule 6,
     and the reason it is here by name: the Settings gear sitting on top of the
     next-day arrow already made day navigation impossible for a whole release,
     and this change deliberately grows seven controls past their own boxes.
     Scoped on purpose. It asks only whether an OVERLAY took a tap, so it can
     never go red on an overlap that was already there (the FAB over a news row)
     and it can never pass by finding nothing: SAMPLE fails an empty sweep. */
  let swept = 0;
  for (const surface of ['today', 'settings', 'build', 'shop']) {
    await goTo(page, surface);
    const stolen = await page.evaluate(OVR => {
      const out = [];
      for (const b of document.querySelectorAll('button')) {
        const r = b.getBoundingClientRect();
        if (r.width < 3 || r.height < 3 || r.top < 0 || r.top > innerHeight - 4) continue;
        out.push(b);
      }
      const thieves = [];
      for (const b of out) {
        const hit = document.elementFromPoint(Math.round(b.getBoundingClientRect().left + b.getBoundingClientRect().width / 2),
          Math.round(b.getBoundingClientRect().top + b.getBoundingClientRect().height / 2));
        if (!hit || hit === b || b.contains(hit)) continue;
        const owner = hit.closest(OVR);
        if (owner && owner !== b) thieves.push({ victim: b.id || String(b.className).split(' ')[0], thief: owner.id || String(owner.className).split(' ')[0] });
      }
      return { seen: out.length, thieves };
    }, '.wallet-pill .wp, .dayhdr .icon-btn, .gear-btn, .seg button, .q-claim, .btn.small, #recalc, button.t3-price');
    swept += stolen.seen;
    for (const t of stolen.thieves)
      fail(`${w}x${h} ${surface}: the enlarged hit area on "${t.thief}" now eats the tap on "${t.victim}"`);
  }
  if (!swept) fail(`${w}x${h} SAMPLE: the neighbour sweep looked at zero buttons, so it proved nothing about the overlays`);
  else info(`${w}x${h} neighbour sweep: ${swept} on-screen buttons across four surfaces, none of them taken by an enlarged hit area`);

  /* THE INSTRUMENT HAS TO CATCH A SMALL BUTTON. Planted 20x20 with nothing near
     it: if this measures >= FLOOR the walk is lying and every green above is
     worthless. */
  await goTo(page, 'today');
  const probe = await page.evaluate(() => {
    const b = document.createElement('button');
    b.style.cssText = 'position:fixed;left:8px;top:50%;width:20px;height:20px;z-index:5;opacity:0';
    b.id = 'a11yProbeSmall'; document.body.appendChild(b);
    const r = window.__hitBox(b); b.remove(); return r;
  });
  if (!probe || probe.blocked || probe.w >= FLOOR || probe.h >= FLOOR)
    fail(`CONTROL: the 20x20 probe measured ${JSON.stringify(probe)}; the hit-box walk cannot detect a small target, so nothing it reported is trustworthy`);
  else info(`CONTROL: 20x20 probe measured ${probe.w}x${probe.h}, correctly under the floor`);
  if (!measured) fail('CONTROL: zero tap targets were measured; an empty sample set is a failure, not a pass');
  return measured;
}

/* THE TOAST, IN TWO RENDERED STATES. Not "is pointer-events set" but "do the
   buttons under a real toast still answer a real tap". */
async function toastEatsTaps(page, w, h) {
  await goTo(page, 'today');
  // the tap-target section leaves two probe buttons in the quest list; they are
  // not the app's controls and have no business in this band
  await page.evaluate(() => document.querySelectorAll('[data-claim="__probe"]').forEach(b => b.remove()));
  /* ONE list of elements, hit-tested twice. Keyed by index, because two rows can
     share a class and the two passes must be about the same buttons. */
  const band = () => page.evaluate(() => {
    const t = document.getElementById('toast');
    const y = innerHeight - (parseFloat(getComputedStyle(t).bottom) || 96) - 20;
    window.__band = [...document.querySelectorAll('button')].filter(b => {
      const bb = b.getBoundingClientRect();
      return bb.width > 2 && bb.height > 2
        && Math.abs(bb.top + bb.height / 2 - y) < 60 && Math.abs(bb.left + bb.width / 2 - innerWidth / 2) < 130;
    });
    return window.__band.map((b, i) => ({ i, k: b.id || String(b.className).split(' ')[0] || b.tagName, own: window.__topAt(b, false) === 'self', top: window.__topAt(b, false) }));
  });
  const reread = () => page.evaluate(() => (window.__band || []).map((b, i) =>
    ({ i, k: b.id || String(b.className).split(' ')[0] || b.tagName, own: window.__topAt(b, false) === 'self', top: window.__topAt(b, false) })));
  const withoutT = await band();
  await page.evaluate(() => window.__toast && window.__toast('Accessibility probe: is this eating your taps', 6000));
  await sleep(500);
  const shown = await page.evaluate(() => {
    const t = document.getElementById('toast');
    return !t.hidden && t.getBoundingClientRect().height > 4;
  });
  if (!shown) { fail(`${w}x${h} toast: could not put a real toast on screen, so the hit test never ran`); return; }
  const withT = await reread();
  if (!withoutT.length || !withT.length || withoutT.length !== withT.length) {
    fail(`${w}x${h} toast: ${withoutT.length} buttons in the band with no toast and ${withT.length} with one; the two states must be the same buttons, and an empty sample set is a failure`);
    return;
  }
  const wasFine = new Set(withoutT.filter(b => b.own).map(b => b.i));
  const lost = withT.filter(b => !b.own && wasFine.has(b.i));
  info(`${w}x${h} toast: ${withT.length} buttons in its band, ${wasFine.size} of them reachable with no toast; ${lost.length} lose the tap when one is up`);
  if (!wasFine.size) { fail(`${w}x${h} toast: no button under the toast band was reachable even without a toast, so the comparison had nothing to say`); return; }
  for (const b of lost) fail(`${w}x${h} toast eats the tap on "${b.k}": the centre of it hits ${b.top}`);
  /* And the toast itself must still be READ by a screen reader while being
     invisible to a finger: pointer-events:none must not have been achieved by
     hiding it. */
  const alive = await page.evaluate(() => { const t = document.getElementById('toast');
    const cs = getComputedStyle(t); return { vis: cs.visibility, op: +cs.opacity, txt: t.textContent.length }; });
  if (alive.vis === 'hidden' || alive.op < 0.5 || !alive.txt)
    fail(`${w}x${h} toast: it stopped eating taps by disappearing (${JSON.stringify(alive)}), which is not the fix`);
  await page.evaluate(() => { const t = document.getElementById('toast'); t.hidden = true; t.textContent = ''; });
}

async function contrast(page, w, h) {
  const bySurface = new Map();
  for (const c of CONTRAST) { if (!bySurface.has(c.surface)) bySurface.set(c.surface, []); bySurface.get(c.surface).push(c); }
  let n = 0;
  for (const [surface, list] of bySurface) {
    await goTo(page, surface);
    for (const c of list) {
      /* SCROLL IT INTO THE SHOT FIRST. The screenshot is the viewport, so a
         heading below the fold sampled nothing and the row reported "off-screen"
         where it should have reported 2.59:1. One screenshot per pair, taken
         where the pair is. */
      await page.evaluate(sel => {
        const el = [...document.querySelectorAll(sel)].find(e => e.offsetParent !== null && e.textContent.trim());
        el?.scrollIntoView({ block: 'center', behavior: 'instant' });
      }, c.sel);
      await sleep(350);
      await samplePage(page, await shotOf(page));
      const got = await page.evaluate(sel => {
        const el = [...document.querySelectorAll(sel)].find(e => e.offsetParent !== null && e.textContent.trim());
        if (!el) return null;
        const cs = getComputedStyle(el);
        const fg = (cs.color.match(/[\d.]+/g) || []).map(Number);
        const bg = window.__bgAt(el, fg);
        if (!bg) return { noBg: true };
        return { fg, bg, ratio: +window.__ratio(fg, bg).toFixed(2),
          size: parseFloat(cs.fontSize), weight: parseInt(cs.fontWeight) || 400,
          sample: el.textContent.trim().slice(0, 22) };
      }, c.sel);
      if (!got) { if (c.optional) { info(`${w}x${h} ${surface} ${c.sel}: not on screen (optional)`); continue; }
        fail(`${w}x${h} ${surface} ${c.sel}: NOT FOUND, so its contrast was never measured`); continue; }
      if (got.noBg) { fail(`${w}x${h} ${surface} ${c.sel}: off-screen in the render, so no pixel was sampled`); continue; }
      n++;
      const large = got.size >= 24 || (got.size >= 18.66 && got.weight >= 700);
      const need = large ? 3 : 4.5;
      const line = `${w}x${h} ${c.sel}: ${got.ratio}:1 (need ${need}) ${got.size}px/${got.weight} rgb(${got.fg.slice(0, 3)}) on rgb(${got.bg}) "${got.sample}"`;
      rows.push({ w, h, name: c.sel, ratio: got.ratio, need, why: c.why });
      if (got.ratio < need) fail(line); else info(line);
    }
  }
  /* THE INSTRUMENT HAS TO CATCH A KNOWN FAILURE. Cream on coral is 2.39:1: if
     the sampler grades this as a pass it is reading the wrong pixels. */
  const ctrl = await page.evaluate(() => {
    const d = document.createElement('div');
    d.style.cssText = 'position:fixed;left:10px;top:120px;z-index:4;background:#fd6857;color:#f2e9d7;font-size:13px;padding:6px 10px';
    d.textContent = 'probe'; d.id = 'a11yProbeContrast'; document.body.appendChild(d);
    return d.getBoundingClientRect().width > 4;
  });
  if (ctrl) {
    await samplePage(page, await shotOf(page));
    const r = await page.evaluate(() => { const d = document.getElementById('a11yProbeContrast');
      const bg = window.__bgAt(d, [242, 233, 215]); const v = bg ? +window.__ratio([242, 233, 215], bg).toFixed(2) : null; d.remove(); return v; });
    if (r === null || r > 3.0) fail(`CONTROL: the cream-on-coral probe measured ${r}:1; it is 2.39:1, so the sampler is reading the wrong pixels and nothing above is trustworthy`);
    else info(`CONTROL: cream-on-coral probe measured ${r}:1, correctly failing`);
  } else fail('CONTROL: the contrast probe could not be planted');
  if (!n) fail('CONTROL: zero contrast pairs were measured; an empty sample set is a failure, not a pass');
}

/* RARITY MUST SURVIVE THE COLOUR BEING TAKEN AWAY. Two rendered states of the
   same grid: as shipped, and with every colour channel flattened. If the tiers
   are only told apart in the first, the signal is colour and nothing else. */
async function rarityNotColourOnly(page, w, h) {
  /* THE DEMO PROFILE OWNS ONE COMMON HAT. One tier on screen cannot answer
     "is anything but colour telling the tiers apart", and reporting that as a
     pass is exactly the empty-sample failure rule 3 is about. So the tiers are
     put there through the app's REAL grant path (loot.js grantGear, the same
     call a crate makes), not by hand-writing DOM. */
  await goTo(page, 'wardrobe');
  const granted = await page.evaluate(async () => {
    if (!navigator.webdriver) return { error: 'not webdriver' };
    const gear = await import(new URL('js/gear.js', location.href).href);
    const loot = await import(new URL('js/loot.js', location.href).href);
    const bySlot = new Map();
    for (const g of gear.GEAR_ITEMS) {
      if (!bySlot.has(g.slot)) bySlot.set(g.slot, new Map());
      const m = bySlot.get(g.slot);
      if (!m.has(g.rarity)) m.set(g.rarity, g);
    }
    // the slot that can show the most tiers at once
    let best = null;
    for (const [slot, m] of bySlot) if (!best || m.size > best.m.size) best = { slot, m };
    if (!best || best.m.size < 2) return { error: `no slot carries two rarities (best ${best?.m.size})` };
    for (const g of best.m.values()) await loot.grantGear(g.id, 'a11y-audit');
    return { slot: best.slot, tiers: [...best.m.keys()] };
  });
  if (granted.error) { fail(`${w}x${h} wardrobe: could not put two rarity tiers on screen (${granted.error}), so the rarity signal was never graded`); return; }
  info(`${w}x${h} wardrobe: granted ${granted.tiers.join('/')} in slot ${granted.slot} through loot.grantGear`);
  await page.reload({ waitUntil: 'networkidle2' });
  await sleep(2600);
  await goTo(page, 'wardrobe');
  const opened = await page.evaluate(slot => {
    const b = document.querySelector(`.pd-slot[data-pd="${slot}"]`);
    if (!b) return false;
    b.scrollIntoView({ block: 'center', behavior: 'instant' });
    const r = b.getBoundingClientRect();
    b.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }));
    return true;
  }, granted.slot);
  if (!opened) { fail(`${w}x${h} wardrobe: no paperdoll slot for ${granted.slot}, so the granted tiers were never put on screen`); return; }
  await sleep(1800);
  /* THE FIRST VERSION OF THIS ROW WAS VACUOUS AND PASSED ON THE BROKEN TREE.
     It asked whether the tiers had distinct colour-free signals and took the
     cell's whole accessible name as that signal. Four different gear pieces
     have four different NAMES, so it answered "4 distinct" on origin/main,
     where rarity was carried by nothing but a border colour. It was the exact
     shape rule 1 of tally/CLAUDE.md is about: a check that could not fail.
     Graded properly it is two questions, and the first is what makes the
     second necessary:
       GREYSCALE: how much of the tier separation survives the colour being
         taken away. The border colours are measured as rendered and again as
         their luminance, and if the second number is smaller then colour is
         carrying information a colourblind player does not receive.
       NAMED: with that established, every cell must name its OWN tier in a
         channel that is not a colour. Not "the tiers differ somehow", which an
         item name satisfies by accident, but "this epic cell says epic". */
  const got = await page.evaluate(() => {
    const lum = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
      return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
    const parse = t => (t.match(/[\d.]+/g) || []).map(Number);
    const cells = [...document.querySelectorAll('.ward-cell[class*="r-"]')].filter(c => c.offsetParent !== null);
    const rows = cells.map(c => {
      const rar = (String(c.className).match(/\br-([a-z]+)/) || [])[1] || '?';
      const border = getComputedStyle(c).borderColor;
      const bl = lum(parse(border));
      /* what a screen reader says, plus what a colourblind eye can still read
         off the tile. The rarity letter is aria-hidden, so both are needed. */
      const label = (c.getAttribute('aria-label') || c.getAttribute('title') || '')
        + ' ' + [...c.querySelectorAll('canvas[aria-label]')].map(x => x.getAttribute('aria-label')).join(' ');
      const tag = (c.querySelector('.ward-rar')?.textContent || '').trim();
      return { rar, border, bl: +bl.toFixed(4), label: label.toLowerCase(), tag: tag.toLowerCase() };
    });
    return { count: cells.length, rows };
  });
  if (got.count === 0) { fail(`${w}x${h} wardrobe: no rarity-bearing cells found, so the rarity signal was never graded`); return; }
  const tiers = [...new Set(got.rows.map(r => r.rar))];
  if (tiers.length < 2) { fail(`${w}x${h} wardrobe: only ${tiers.length} rarity tier on screen; two are needed to tell whether anything but colour separates them`); return; }
  const inColour = new Set(got.rows.map(r => r.border)).size;
  // two lumas closer than this are the same shade of grey to anyone who cannot
  // separate the hues; 0.02 is about 1 step of 8-bit grey at these values
  const greys = [];
  for (const r of got.rows) if (!greys.some(g => Math.abs(g - r.bl) < 0.02)) greys.push(r.bl);
  info(`${w}x${h} wardrobe: ${got.count} cells, ${tiers.length} tiers; ${inColour} distinct border colours in colour, ${greys.length} distinguishable in greyscale`);
  /* AND IT MUST NOT LAND ON ANY OTHER BADGE. A wardrobe tile can carry four
     other things in its corners: the +PWR line along the bottom, the level lock
     top-right, the equipped tick (a ::after) top-right, and the SLIMED tag (a
     ::before) top-left. Two of those are pseudo-elements with no box to query,
     so their rectangles are reconstructed from their own computed offsets.
     Written because the first placement guessed an offset off a font size and
     was wrong on 3 of 3 tiles. */
  const clash = await page.evaluate(() => {
    const pseudoBox = (el, which) => {
      const cs = getComputedStyle(el, which);
      if (!cs.content || cs.content === 'none' || cs.position !== 'absolute') return null;
      const r = el.getBoundingClientRect();
      const num = v => (v === 'auto' ? null : parseFloat(v) || 0);
      const w = parseFloat(cs.width) || 0, h = parseFloat(cs.height) || 0;
      const t = num(cs.top), l = num(cs.left), b = num(cs.bottom), rt = num(cs.right);
      const top = t !== null ? r.top + t : (b !== null ? r.bottom - b - h : r.top);
      const left = l !== null ? r.left + l : (rt !== null ? r.right - rt - w : r.left);
      return { left, top, right: left + w, bottom: top + h, which };
    };
    const over = (a, b) => !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
    const hits = []; let pairs = 0;
    for (const c of document.querySelectorAll('.ward-cell')) {
      const tag = c.querySelector('.ward-rar');
      if (!tag || !tag.offsetParent) continue;
      const a = tag.getBoundingClientRect();
      const others = [...c.querySelectorAll('.gear-stat, .gear-lock, .look-tag')]
        .map(e => Object.assign(e.getBoundingClientRect().toJSON(), { which: e.className }))
        .concat([pseudoBox(c, '::before'), pseudoBox(c, '::after')].filter(Boolean));
      if (!others.length) continue;
      pairs++;
      for (const b of others) if (over(a, b))
        hits.push({ tier: (String(c.className).match(/\br-([a-z]+)/) || [])[1], against: b.which,
          tag: [a.left, a.top, a.right, a.bottom].map(Math.round),
          other: [b.left, b.top, b.right, b.bottom].map(Math.round) });
    }
    return { pairs, hits };
  });
  if (!clash.pairs) fail(`${w}x${h} wardrobe: not one tile carried a tier tag alongside another badge, so the overlap check graded nothing`);
  else if (clash.hits.length) fail(`${w}x${h} wardrobe: the tier tag lands on another badge on ${clash.hits.length} of ${clash.pairs} tiles (${JSON.stringify(clash.hits[0])})`);
  else info(`${w}x${h} wardrobe: the tier tag clears every other badge on all ${clash.pairs} tiles`);

  /* AND THE TAG ITSELF HAS TO BE LEGIBLE. It is a new element and its plate
     alpha was chosen from arithmetic (a white art pixel behind it puts the epic
     violet at 3.69:1 at .78 and 5.3 at .88), so the number gets read back off
     the render like every other pair here rather than left as a calculation. */
  /* INTO THE SHOT FIRST. The grid sits well below the fold on a 667px screen,
     the screenshot is the viewport, and the first version of this row reported
     "no background pixel sampled" four times rather than a ratio. */
  /* ONE GRID PER SHOT (2026-09-04). QA round 23 F6 put the tier tag on the
     look tiles too, in a second .ward-grid below the fit grid. The first version
     of this loop scrolled the FIRST grid into view, shot the viewport once and
     sampled EVERY .ward-rar on the page, so the look grid's tags were off-screen
     and read "no background pixel sampled" (four reds on gate7's successor run,
     healthy CSS). Each grid is now scrolled, shot and sampled on its own, and a
     tag whose box is outside the viewport is skipped rather than failed. */
  const gridCount = await page.evaluate(() => document.querySelectorAll('.ward-grid').length);
  const tags = [];
  for (let gi = 0; gi < gridCount; gi++) {
    await page.evaluate(i => document.querySelectorAll('.ward-grid')[i]?.scrollIntoView({ block: 'center', behavior: 'instant' }), gi);
    await sleep(400);
    await samplePage(page, await shotOf(page));
    tags.push(...await page.evaluate(i => {
    const out = [];
    const grid = document.querySelectorAll('.ward-grid')[i];
    for (const t of grid.querySelectorAll('.ward-rar')) {
      if (!t.offsetParent) continue;
      const r = t.getBoundingClientRect();
      if (r.bottom <= 0 || r.top >= innerHeight || r.right <= 0 || r.left >= innerWidth) continue;   // not in this shot
      const fg = (getComputedStyle(t).color.match(/[\d.]+/g) || []).map(Number);
      const bg = window.__bgAt(t, fg);
      out.push({ rar: (String(t.parentElement.className).match(/\br-([a-z]+)/) || [])[1],
        v: bg ? +window.__ratio(fg, bg).toFixed(2) : null, fg: fg.slice(0, 3), bg });
    }
    return out;
  }, gi));
  }
  if (!tags.length) info(`${w}x${h} wardrobe: no tier tag was on screen to measure`);
  for (const t of tags) {
    const line = `${w}x${h} .ward-rar (${t.rar}): ${t.v}:1 rgb(${t.fg}) on rgb(${t.bg})`;
    if (t.v === null) fail(`${w}x${h} .ward-rar (${t.rar}): no background pixel sampled`);
    else if (t.v < 4.5) fail(`${line} (need 4.5)`);
    else info(line);
    if (t.v !== null) rows.push({ w, h, name: `.ward-rar ${t.rar}`, ratio: t.v, need: 4.5, why: 'the new tier tag on its own plate' });
  }

  const unnamed = got.rows.filter(r => !r.label.includes(r.rar) && r.tag !== r.rar[0]);
  if (unnamed.length)
    fail(`${w}x${h} wardrobe: ${unnamed.length} of ${got.count} cells never say their own tier in anything but colour (${[...new Set(unnamed.map(r => r.rar))].join(', ')}); a colourblind player cannot read their own collection`);
  else info(`${w}x${h} wardrobe: all ${got.count} cells name their own tier without using colour`);
}

/* THE TOKEN PAIR THE SHIPPED CSS ACTUALLY ASKS FOR. --text-3 on --surface-3 is
   not hypothetical: .drop-buy[data-buydrop]:disabled sets exactly that pair,
   and it is the WORST surface --text-3 lands on (4.03:1 on origin/main, while
   the token's own comment claimed 5.00:1, which was true only of --surface).
   The disabled drop button needs a sold-out drop to render, so the pair is
   rendered from the live tokens and read back through the same screenshot
   sampler as every other pair here, rather than computed from two hex strings
   in this file that could drift from the stylesheet. */
async function tokenPairs(page, w, h) {
  await goTo(page, 'today');
  const planted = await page.evaluate(() => {
    const d = document.createElement('div');
    d.id = 'a11yTokenProbe';
    d.style.cssText = 'position:fixed;left:10px;top:200px;z-index:4;background:var(--surface-3);color:var(--text-3);font-size:12px;font-weight:700;padding:8px 14px';
    d.textContent = 'disabled drop button';
    document.body.appendChild(d);
    const cs = getComputedStyle(d);
    return { fg: (cs.color.match(/[\d.]+/g) || []).map(Number) };
  });
  await samplePage(page, await shotOf(page));
  const r = await page.evaluate(fg => {
    const d = document.getElementById('a11yTokenProbe');
    const bg = window.__bgAt(d, fg);
    const v = bg ? +window.__ratio(fg, bg).toFixed(2) : null;
    d.remove();
    return { v, bg };
  }, planted.fg);
  if (r.v === null) { fail(`${w}x${h} --text-3 on --surface-3: no background pixel was sampled, so the pair was never graded`); return; }
  const line = `${w}x${h} --text-3 on --surface-3: ${r.v}:1 (need 4.5) rgb(${planted.fg.slice(0, 3)}) on rgb(${r.bg})`;
  rows.push({ w, h, name: '--text-3 on --surface-3', ratio: r.v, need: 4.5, why: 'the worst surface --text-3 lands on (.drop-buy:disabled)' });
  if (r.v < 4.5) fail(line); else info(line);
}

/* A LIVE REGION MUST EXIST BEFORE ITS CONTENT CHANGES. Two states of the same
   attribute: at boot, before any toast has ever fired, and after the first one.
   Equal means it was in the markup; different means it was attached in the same
   tick as the message and the first announcement was lost. */
async function liveRegion(page, w, h) {
  /* AT PARSE TIME, NOT AT READ TIME. Reading #toast after boot proves nothing:
     the app fires a toast during boot, so the attributes were already there and
     the row was green on the exact tree that shipped the bug. __atParse is
     recorded by an observer installed before any of the app's own script runs
     (see the evaluateOnNewDocument in the run block), so this is genuinely two
     rendered states: what the markup carried, and what the first message saw. */
  const cold = await page.evaluate(() => window.__toastAtParse || { missing: true });
  if (cold.missing) { fail(`${w}x${h} toast: the parse-time observer never saw #toast appear, so the live region was never graded`); return; }
  await page.evaluate(() => window.__toast && window.__toast('live region probe', 400));
  await sleep(300);
  const warm = await page.evaluate(() => {
    const t = document.getElementById('toast');
    return { live: t?.getAttribute('aria-live'), role: t?.getAttribute('role') };
  });
  info(`${w}x${h} toast live region: cold aria-live=${cold.live} role=${cold.role}; after first toast aria-live=${warm.live} role=${warm.role}`);
  if (!cold.live || !cold.role)
    fail(`${w}x${h} toast: aria-live/role were absent before the first message (cold ${cold.live}/${cold.role}, warm ${warm.live}/${warm.role}); a live region attached in the same tick as its content does not announce`);
  await page.evaluate(() => { const t = document.getElementById('toast'); t.hidden = true; t.textContent = ''; });
}

/* FIVE BUTTONS CALLED "FIGHT" ARE ONE BUTTON TO A SCREEN READER. */
async function pitNames(page, w, h) {
  await goTo(page, 'pit');
  const got = await page.evaluate(() => {
    const sheet = document.querySelector('#sheets .sheet-body') || document;
    return [...sheet.querySelectorAll('button')]
      .filter(b => b.offsetParent !== null && /^(fight|rematch)$/i.test(b.textContent.trim()))
      .map(b => (b.getAttribute('aria-label') || b.textContent.trim()).toLowerCase());
  });
  if (got.length < 2) { fail(`${w}x${h} pit: found ${got.length} FIGHT buttons, so nothing about duplicate names was graded`); return; }
  const dupes = got.filter((n, i) => got.indexOf(n) !== i);
  info(`${w}x${h} pit: ${got.length} fight buttons, ${new Set(got).size} distinct accessible names`);
  if (dupes.length) fail(`${w}x${h} pit: ${dupes.length} fight buttons share an accessible name with another (${[...new Set(dupes)].join(', ')}); a screen reader cannot tell them apart`);
}

/* ------------------------------------------------------------------ run */

/* 'shell', not 'new': on this Mac Page.captureScreenshot never returns under
   headless 'new', and this audit samples pixels off a screenshot. See boot(). */
const { browser, page } = await boot(base, { headless: process.env.HEADLESS_MODE || 'shell' });
try {
  /* THE PARSE-TIME SNAPSHOT. Installed before any of the app's script runs and
     then reloaded, so __toastAtParse records what #toast's markup carried the
     instant the parser produced it: the only moment that can tell a static
     live region apart from one attached in the same tick as its first message.
     Reading it after boot cannot, because boot fires a toast. */
  await page.evaluateOnNewDocument(() => {
    const snap = el => { window.__toastAtParse = {
      live: el.getAttribute('aria-live'), role: el.getAttribute('role'),
      text: el.textContent.trim().length }; };
    const seen = document.getElementById?.('toast');
    if (seen) return snap(seen);
    /* `document`, not `document.documentElement`: at document-start the root
       element does not exist yet and observe() throws on null. Observing the
       document itself covers everything the parser is about to build. */
    new MutationObserver((_, o) => {
      const t = document.getElementById('toast');
      if (t) { snap(t); o.disconnect(); }
    }).observe(document, { childList: true, subtree: true });
  });
  await page.reload({ waitUntil: 'networkidle2' });
  await sleep(2600);
  for (const [w, h] of SIZES) {
    console.log(`\n===== ${w}x${h} =====`);
    await setWidth(page, w, h);
    await sleep(600);
    await goTo(page, 'today');
    await liveRegion(page, w, h);
    await tapTargets(page, w, h);
    await toastEatsTaps(page, w, h);
    await contrast(page, w, h);
    await rarityNotColourOnly(page, w, h);
    await tokenPairs(page, w, h);
    await pitNames(page, w, h);
  }
} finally {
  await browser.close();
}

console.log('\n----- measured -----');
for (const r of rows) console.log(JSON.stringify(r));
console.log(`\n${problems.length ? `FAILING: ${problems.length}` : 'clean'}`);
process.exit(exitFor(problems.length));
