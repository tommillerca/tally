/* AN EQUAL-TRACK GRID MUST NOT BE WIDENED BY ITS OWN LABEL.
 *
 * THE BUG (found by a scale audit, fixed on gwart/clientfix). app.css had 22
 * `repeat(N, 1fr)` grid rules and not one use of `minmax(0, 1fr)`. A `1fr`
 * track is `minmax(auto, 1fr)`, and that automatic minimum resolves to the
 * track's min-content width, so the longest unbreakable label in any cell
 * pushes its track wider than the equal share and the whole grid grows past its
 * container. Nothing about the rule says so: the container has a sensible width
 * and the grid still overflows it.
 *
 * Two were measured overflowing at 320x568: .badge-grid put 7 badges out to
 * x=347 in a 320 viewport, and the Settings redeem row reached x=322. The other
 * twenty were never individually driven, and which of them overflows depends
 * entirely on the longest string a player's data happens to produce. That is
 * the reason this is fixed as a class and guarded as a property.
 *
 * WHAT IS GUARDED, AND WHY IT IS NOT THE TWO KNOWN CASES. Pinning .badge-grid
 * and the redeem row would pass on the day the Crew tab gets a long name. The
 * property is: at 320x568, the narrowest phone this app supports, no control
 * lands outside the viewport. Every button, link and field on every route and
 * every hub tab is measured against the viewport box, and the ones legitimately
 * inside a horizontal scroller are excluded BY THE SCROLLER, not by name.
 *
 * DIRECTION AND BOUND. The bound is the viewport's own edge: right <= 320,
 * left >= 0. Not "less overflow than before", not "the grid got narrower". A
 * control one pixel outside is untappable in the same way as one 27px outside,
 * and this app has shipped both.
 *
 * THE STATIC HALF IS THE COVERAGE HALF. The behavioural half can only see the
 * grids this run manages to put on screen with the demo profile's data. So
 * app.css is also required to contain no `repeat(N, 1fr)` at all: the next
 * four-column grid someone writes fails here on the day it is written, whether
 * or not any check ever drives the screen it lives on. Every grid selector the
 * scan finds is printed with the instances this run measured, and the ones it
 * could NOT reach are printed too, by name, so an undriven rule cannot rot into
 * "covered" (the figure-audit contract, applied to layout).
 *
 * ONLY ONE AUDIT IN THE TREE EVER SETS A 320 VIEWPORT (tests/batch-audit.mjs at
 * two points); every other one runs 375, 390 or 430. That is why a grid could
 * overflow the narrowest supported phone for this long without anything going
 * red. Reported here rather than fixed here.
 *
 * PROVE-RED: run this file in a checkout of 56c5058 (the pre-fix tree). The
 * REPEAT row goes red naming all 22 rules, and the 320x568 OVERFLOW row goes
 * red naming the controls that land outside the viewport.
 *
 * Usage: node tests/grid-min-width-audit.mjs [baseUrl]   (CENSUS=1 to print the
 * per-grid measurement table used to diff a before against an after)
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serveTree, loadPuppeteer, sleep } from './godmode.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const results = [];
const ok = (n, pass, d = '') => { results.push({ n, pass }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${n}${d ? '  ' + d : ''}`); };

/* ============================ static half ============================ */

const css = readFileSync(path.join(ROOT, 'app.css'), 'utf8');

/* Selector -> the grid-template-columns it declares. Brace-walking rather than
   one big regex, so each declaration knows the rule it belongs to. */
function gridRules(src) {
  const rules = [];
  const stack = [];
  let buf = '', i = 0;
  while (i < src.length) {
    if (src[i] === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i + 2); i = e < 0 ? src.length : e + 2; continue; }
    const c = src[i];
    if (c === '{') { stack.push(buf.trim().replace(/\s+/g, ' ')); buf = ''; i++; continue; }
    if (c === '}') { stack.pop(); buf = ''; i++; continue; }
    if (c === ';') {
      const m = buf.trim().match(/^grid-template-columns\s*:\s*([\s\S]+)$/);
      if (m) rules.push({ sel: stack[stack.length - 1] || '', value: m[1].replace(/\s+/g, ' ').trim(), at: stack.slice(0, -1).filter(s => s.startsWith('@')).join(' ') });
      buf = ''; i++; continue;
    }
    buf += c; i++;
  }
  return rules;
}

const rules = gridRules(css);
ok('SETUP  the stylesheet scanner found the grid rules (a hollow parse would make every row below vacuous)',
  rules.length >= 20, `${rules.length} grid-template-columns declarations parsed`);

/* The class, by its shape: N equal tracks written as a repeat(). */
const bareRepeat = rules.filter(r => /repeat\(\s*\d+\s*,\s*1fr\s*\)/.test(r.value));
ok('REPEAT  no `repeat(N, 1fr)` survives in app.css: an equal-track grid declares minmax(0, 1fr) so a long label cannot widen its track past the equal share',
  bareRepeat.length === 0,
  bareRepeat.length ? `\n        ${bareRepeat.map(r => `${r.sel} { ${r.value} }`).join('\n        ')}` : `all ${rules.filter(r => /minmax\(\s*0\s*,\s*1fr\s*\)/.test(r.value)).length} equal-track repeats carry minmax(0, 1fr)`);

/* The same defect wears a second costume, and it is REPORTED rather than
   asserted: `1fr 1fr` is `minmax(auto,1fr) minmax(auto,1fr)`, identical
   behaviour, written out longhand. They are listed on every run so the decision
   to leave them is visible, and the 320 overflow row below is what actually
   holds them to account: if one of them ever pushes a control off the screen,
   this audit goes red on the control, not on the syntax. */
const longhand = rules.filter(r => /^(1fr\s+)+1fr$/.test(r.value));
console.log(`NOTE  ${longhand.length} rules write equal tracks longhand (\`1fr 1fr\`), same automatic minimum, not rewritten here: ${[...new Set(longhand.map(r => r.sel))].slice(0, 12).join(', ')}${longhand.length > 12 ? ' ...' : ''}`);

/* The selectors the behavioural half will look for. */
const gridSelectors = [...new Set(rules
  .filter(r => /repeat\(\s*\d+\s*,\s*(1fr|minmax\(\s*0\s*,\s*1fr\s*\))\s*\)/.test(r.value))
  .map(r => r.sel)
  .filter(s => s && !s.startsWith('@') && !/[>+~]/.test(s)))];

/* ========================== behavioural half ========================== */

const puppeteer = await loadPuppeteer();
let srvHandle = null;
let base = process.argv.slice(2).find(a => !a.startsWith('--')) || process.env.URL;
if (!base) { srvHandle = await serveTree(ROOT); base = srvHandle.url; }
base = base.replace(/\/?$/, '/');

const browser = await puppeteer.launch({
  headless: process.env.HEADLESS_MODE || 'new',
  args: process.getuid?.() === 0 ? ['--no-sandbox', '--disable-setuid-sandbox'] : [],
});

const ROUTES = ['today', 'bonehead', 'shop', 'progress', 'trends', 'friends', 'settings'];

/* Collect, at one stop: every control outside the viewport box, and a
   measurement of every grid instance on screen. */
const COLLECT = (sels) => {
  const vw = innerWidth;
  /* A control inside a horizontal RAIL is reachable by scrolling the rail, and
     chip rails are a deliberate pattern here. The walk up STOPS at #screen and
     #app: those two scroll horizontally only because CSS forces overflow-x to
     auto whenever overflow-y is not visible, which is true of every screen in
     this app. Treating them as rails excused every control on every screen and
     made this row unfailable, which is how the first version of it reported a
     clean 320 on the tree with the badge grid hanging 27px off it. A rail also
     has to actually HAVE scroll room, or a container that merely declares
     overflow-x would excuse an overflow it cannot scroll to. */
  const scroller = el => {
    for (let n = el.parentElement; n; n = n.parentElement) {
      if (n === document.body || n === document.documentElement || n.id === 'screen' || n.id === 'app') return null;
      const ox = getComputedStyle(n).overflowX;
      if ((ox === 'auto' || ox === 'scroll') && n.scrollWidth > n.clientWidth + 1) return n;
    }
    return null;
  };
  /* A FULL-BLEED CONTROL IS NOT AN UNREACHABLE ONE, and the difference is a
     property, not a name. .gw-art is Gwart on the Shop: absolutely positioned,
     centred, 480px wide at every viewport, so it hangs off BOTH edges (-80..400
     at 320) and .gw-panel clips it with overflow-x: hidden. Measured: document
     scrollWidth === clientWidth at 320, 360 and 375, and scrolling to x=500
     moves 0px. It cannot be untappable, because it spans the entire viewport
     width: every horizontal position on the screen is inside it.

     THE EXEMPTION IS DELIBERATELY NARROW so it cannot excuse the case this row
     exists for. BOTH must hold: the control overflows on BOTH sides (so it
     covers the whole viewport, rather than having been pushed out of the layout
     on one side, which is what .badge-grid did at 27px past the right edge),
     AND an ancestor clips it. A bleed that is NOT clipped scrolls the page
     sideways and is caught by the SIDESCROLL row below instead. */
  const clipped = el => {
    for (let n = el.parentElement; n; n = n.parentElement) {
      const ox = getComputedStyle(n).overflowX;
      if (ox === 'hidden' || ox === 'clip') return true;
      if (n === document.body) return false;
    }
    return false;
  };
  const bleed = (el, r) => r.left < -0.5 && r.right > vw + 0.5 && clipped(el);
  const visible = el => {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none' && parseFloat(cs.opacity) > 0.01;
  };
  const label = el => (el.getAttribute('aria-label') || (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 24) || el.className || el.tagName).toString();

  const controls = [...document.querySelectorAll('button, input, select, textarea, a[href], [role="button"]')];
  const out = [];
  for (const el of controls) {
    if (!visible(el)) continue;
    /* A control inside a horizontal scroller is REACHABLE by scrolling that
       strip, which is a deliberate pattern here (chip rails, carousels). The
       exclusion is the scroller itself, never a name on a list. */
    if (scroller(el)) continue;
    const r = el.getBoundingClientRect();
    if (bleed(el, r)) continue;
    if (r.right > vw + 0.5 || r.left < -0.5) {
      out.push({ label: label(el), cls: (el.className || '').toString().slice(0, 40), left: Math.round(r.left), right: Math.round(r.right) });
    }
  }

  const grids = [];
  for (const sel of sels) {
    let nodes = [];
    try { nodes = [...document.querySelectorAll(sel)]; } catch { continue; }
    nodes.forEach((el, i) => {
      if (!visible(el)) return;
      const r = el.getBoundingClientRect();
      const kids = [...el.children].map(k => k.getBoundingClientRect());
      const widest = kids.length ? Math.max(...kids.map(k => k.right)) : r.right;
      grids.push({
        sel, i,
        w: Math.round(r.width), left: Math.round(r.left), right: Math.round(r.right),
        h: Math.round(r.height),
        kids: kids.length,
        kidW: kids.length ? Math.round(kids[0].width) : 0,
        kidRight: Math.round(widest),
        pastParent: Math.round(widest - r.right),
        pastViewport: Math.round(widest - vw),
        cols: getComputedStyle(el).gridTemplateColumns.split(' ').length,
      });
    });
  }
  /* MEASURED ON THE CONTAINER THE PLAYER ACTUALLY SWIPES, which is #screen, not
     the document. Every screen in this app renders inside #screen and CSS forces
     its overflow-x to auto (the same fact scroller() refuses to treat as a
     rail), so the document itself never gains scroll room however wide the
     content gets. The first version of this row read documentElement and body
     alone and COULD NOT FAIL: measured at 320, a deliberately planted 900px
     element took #screen to scrollWidth 932 against clientWidth 320 while
     documentElement and body both stayed at 320/320. */
  const de = document.documentElement;
  const boxes = [de, document.body, document.getElementById('screen'), document.getElementById('app')].filter(Boolean);
  const sideScroll = Math.max(...boxes.map(b => b.scrollWidth - b.clientWidth));
  const sideWhere = (boxes.find(b => b.scrollWidth - b.clientWidth === sideScroll) || {}).id || 'document';
  return { controls: out, grids, vw, sideScroll, sideWhere };
};

async function walk(w, h) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.goto(base + '?demo', { waitUntil: 'networkidle2' });
  await sleep(2800);
  for (let i = 0; i < 8; i++) {
    const hit = await page.evaluate(() => {
      const rx = /^(spin|nice|done|collect|claim|continue|ok|got it|next|skip|back to the pit)$/i;
      const b = [...document.querySelectorAll('button')].find(x => rx.test((x.textContent || '').trim()) && x.getBoundingClientRect().width);
      if (!b) return false; b.click(); return true;
    });
    if (!hit) break;
    await sleep(1100);
  }

  const stops = [];
  for (const r of ROUTES) {
    await page.evaluate(x => { location.hash = '#/' + x; }, r);
    await sleep(2100);
    await page.evaluate(() => document.getAnimations().forEach(a => { try { a.finish(); } catch { /* not running */ } }));
    stops.push({ where: `#/${r}`, ...await page.evaluate(COLLECT, gridSelectors) });
  }
  /* the hub's six tabs share one route and each carries its own grids */
  await page.evaluate(() => { location.hash = '#/bonehead'; });
  await sleep(2100);
  const tabs = await page.evaluate(() => [...document.querySelectorAll('.chip.ch-tab')].map(t => (t.textContent || '').trim()));
  for (const label of tabs) {
    await page.evaluate(l => {
      const t = [...document.querySelectorAll('.chip.ch-tab')].find(x => (x.textContent || '').trim() === l);
      t?.click();
    }, label);
    await sleep(1900);
    await page.evaluate(() => document.getAnimations().forEach(a => { try { a.finish(); } catch { /* not running */ } }));
    stops.push({ where: `hub:${label}`, ...await page.evaluate(COLLECT, gridSelectors) });
  }

  /* THE CANARY, on this run, on this page, at this width. Anti-regression rule
     2: prove the guard fails. A control-overflow detector that excuses too much
     reports a clean sweep on a broken app, which is exactly what the first
     version of the exclusion above did. So put ONE deliberately over-wide
     control on the screen and require the detector to name it, then take it
     away again. If this row is green, the OVERFLOW rows above are the app's
     answer and not the detector's silence. */
  const canary = await page.evaluate(() => {
    const host = document.querySelector('#screen');
    if (!host) return { err: 'no #screen to plant the canary in' };
    const b = document.createElement('button');
    b.id = '__gridCanary';
    b.textContent = 'CANARYCANARYCANARYCANARYCANARYCANARYCANARYCANARY';
    b.style.cssText = 'white-space:nowrap;position:relative;display:block';
    host.appendChild(b);
    const r = b.getBoundingClientRect();
    return { right: Math.round(r.right), vw: innerWidth };
  });
  const withCanary = await page.evaluate(COLLECT, gridSelectors);
  await page.evaluate(() => document.getElementById('__gridCanary')?.remove());

  await ctx.close();
  return { stops, tabs, canary, canarySeen: withCanary.controls.some(c => /CANARY/.test(c.label)) };
}

const VIEWPORTS = [{ w: 320, h: 568 }, { w: 360, h: 640 }, { w: 375, h: 667 }];
const seenSelectors = new Set();
const censusLines = [];

for (const vp of VIEWPORTS) {
  const { stops, tabs, canary, canarySeen } = await walk(vp.w, vp.h);
  const tag = `${vp.w}x${vp.h}`;

  ok(`SETUP ${tag}  the walk really visited the app (an empty sample set is a failure, never a pass)`,
    stops.length >= ROUTES.length + 4 && tabs.length >= 4,
    `${stops.length} stops: ${ROUTES.length} routes + ${tabs.length} hub tabs (${tabs.join(', ')})`);

  const gridsSeen = stops.reduce((n, s) => n + s.grids.length, 0);
  ok(`SETUP ${tag}  grid instances were actually on screen to measure`,
    gridsSeen >= 8, `${gridsSeen} instances of ${new Set(stops.flatMap(s => s.grids.map(g => g.sel))).size} of the ${gridSelectors.length} equal-track selectors`);

  for (const s of stops) for (const g of s.grids) {
    seenSelectors.add(g.sel);
    censusLines.push(`${tag} ${s.where} ${g.sel}#${g.i} w=${g.w} left=${g.left} right=${g.right} kids=${g.kids} kidW=${g.kidW} pastParent=${g.pastParent} cols=${g.cols}`);
  }

  ok(`CANARY ${tag}  the overflow detector CAN fail: a deliberately over-wide control planted on the screen is reported`,
    !canary.err && canarySeen && canary.right > canary.vw,
    canary.err || `planted control right=${canary.right} in a ${canary.vw} viewport, detected: ${canarySeen}`);

  /* THE CLASS ITSELF: an equal-track grid's cells must stay inside the grid's
     own box, and inside the viewport. `1fr` is `minmax(auto, 1fr)`, so before
     the fix a cell's min-content pushed its track wider than the equal share
     and the row spilled out of the container that sized it. This is the row
     that goes red on .badge-grid at 320 (cells reaching x=347 in a 320
     viewport), and it does not name .badge-grid to do it. */
  const spills = stops.flatMap(s => s.grids
    .filter(g => g.pastParent > 0.5 || g.pastViewport > 0.5)
    .map(g => `${s.where}: ${g.sel}#${g.i} grid ${g.left}..${g.right} but cells reach x=${g.kidRight} (${g.pastParent > 0 ? `${g.pastParent}px past its own box` : 'inside its box'}, ${g.pastViewport > 0 ? `${g.pastViewport}px past the ${vp.w} viewport` : 'inside the viewport'})`));
  ok(`CELLS ${tag}  every equal-track grid keeps its cells inside its own box and inside the viewport`,
    spills.length === 0,
    spills.length ? `\n        ${[...new Set(spills)].slice(0, 20).join('\n        ')}` : `${stops.reduce((n, s) => n + s.grids.length, 0)} grid instances, none spilling`);

  /* THE HARM THE OVERFLOW ROW WAS ONLY A PROXY FOR. A control off the edge
     matters because it is untappable or because the page slides sideways under
     the thumb. The bound above grades the first; nothing graded the second, so
     an unclipped bleed could satisfy the letter of this file and still hand a
     player a page that scrolls left-right. Graded at every width, from the same
     walk, with the offending stop named. */
  const slides = stops.filter(s => s.sideScroll > 1).map(s => `${s.where}: ${s.sideScroll}px of horizontal scroll room on #${s.sideWhere}`);
  ok(`SIDESCROLL ${tag}  no screen scrolls sideways (#screen, #app, body and documentElement: scrollWidth <= clientWidth)`,
    slides.length === 0,
    slides.length ? `\n        ${[...new Set(slides)].join('\n        ')}` : `${stops.length} stops, none scrollable sideways`);

  const offenders = stops.flatMap(s => s.controls.map(c => `${s.where}: "${c.label}" ${c.cls} left=${c.left} right=${c.right} (viewport ${vp.w})`));
  /* THE PROPERTY, and it is only asserted at the narrowest supported phone.
     360 and 375 are walked for the before/after census, not graded, because a
     rule that fits at 375 and not at 320 is still the bug. */
  if (vp.w === 320) {
    ok(`OVERFLOW ${tag}  no control lands outside the viewport (right <= ${vp.w}, left >= 0)`,
      offenders.length === 0,
      offenders.length ? `\n        ${[...new Set(offenders)].slice(0, 20).join('\n        ')}` : `every control on ${stops.length} stops is inside the viewport box`);
  } else {
    ok(`OVERFLOW ${tag}  no control lands outside the viewport (measured at all three widths, graded here too: a wider phone must not regress either)`,
      offenders.length === 0,
      offenders.length ? `\n        ${[...new Set(offenders)].slice(0, 20).join('\n        ')}` : `every control on ${stops.length} stops is inside the viewport box`);
  }
}

/* UNDRIVEN RULES ARE NAMED, EVERY RUN. This run can only measure the grids the
   demo profile puts on screen; the rest are covered by the static half alone,
   and saying so out loud is the difference between coverage and the appearance
   of it. */
const undriven = gridSelectors.filter(s => !seenSelectors.has(s));
console.log(`\nDRIVEN    ${seenSelectors.size}/${gridSelectors.length} equal-track selectors were measured live: ${[...seenSelectors].join(', ')}`);
console.log(`UNDRIVEN  ${undriven.length} were not reached by this walk, so only the static REPEAT row covers them: ${undriven.join(', ') || 'none'}`);
if (process.env.CENSUS) { console.log('\n--- CENSUS ---'); for (const l of censusLines) console.log(l); }

await browser.close();
if (srvHandle) srvHandle.close();

const failed = results.filter(r => !r.pass);
if (!results.length) { console.log('\nFAIL: no checks ran'); process.exit(1); }
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) { console.log('FAILED: ' + failed.map(f => f.n).join(', ')); process.exit(1); }
console.log('grid-min-width-audit clean');
