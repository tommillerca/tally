/* A BROWSER THAT DOES NOT KNOW dvh MUST STILL BE ABLE TO REACH THE TAB BAR.
 *
 * THE BUG (found by a scale audit, fixed on gwart/clientfix). app.css said
 *
 *     #app { max-width: 600px; margin: 0 auto; height: 100dvh; ... }
 *
 * with no height declaration in front of it, and the 503 KB sheet contained
 * ZERO @supports blocks. An unknown unit makes a declaration invalid at parse
 * time, so a browser that does not implement dvh drops the whole line and #app
 * has no height at all. .tabbar is `flex: none; position: relative`, an in-flow
 * flex child, so the navigation slides to the bottom of a document as tall as
 * Today's content happens to be.
 *
 * Measured at 390x844 on Today by stripping the dvh declarations, which is
 * exactly what a parser that drops them produces:
 *     dvh honoured   #app  844px   tab-bar top  779px   on screen
 *     dvh dropped    #app 3083px   tab-bar top 3017px   2173px below the fold
 * No tabs, no FAB, no way off Today without scrolling three screens. That is
 * Android below Chrome 108 (Dec 2022) and iOS below 15.4 (Mar 2022).
 *
 * DIRECTION AND BOUND (anti-regression rule 11). The measured quantity is the
 * tab bar's position with dvh DROPPED, and the bound is the viewport: its
 * bottom edge must be inside the visible box, and its centre must be what a
 * thumb hits there. "The tab bar moved less than before" would grade 2173px and
 * 400px the same, and 400px is just as unreachable.
 *
 * WHY THE SIMULATION IS THE WHOLE STYLESHEET AND NOT #app. Injecting
 * `#app { height: auto }` reproduces one line. The audit instead rewrites the
 * served CSS the way an old parser sees it: every declaration whose value
 * mentions dvh or svh is deleted, and every @supports block that tests for them
 * is deleted whole. So a dvh added anywhere later is simulated too, and the
 * static half below refuses to let one arrive without a fallback in the first
 * place.
 *
 * TWO KINDS OF FALLBACK, AND THE DIFFERENCE IS MEASURED, NOT ASSUMED.
 *   1. A declaration with no var() in it (`height: 100dvh`) is invalid at PARSE
 *      time in an old browser, so the previous declaration for the same
 *      property survives and wins. The conventional `height: 100vh` on the line
 *      before is a real fallback.
 *   2. A declaration containing var() (`max-height: calc(100dvh - var(--sat) -
 *      24px)`) is assumed valid at parse time and only fails at COMPUTED-VALUE
 *      time, after substitution. Per CSS Variables, that makes the declaration
 *      unset rather than ignored, and earlier declarations are NOT used. A
 *      custom property behaves the same way at its use site. Measured in
 *      Chromium with a made-up unit standing in for dvh:
 *        max-height: calc(100vh - var(--sat) - 24px);
 *        max-height: calc(100xyz - var(--sat) - 24px);   -> computed `none`
 *        height: 100vh; height: 100xyz;                  -> computed 844px
 *        --w: min(61vw,264px); --w: min(61vw,264px,calc((100xyz - 300px)*.61));
 *        width: var(--w);                                -> computed auto
 *      So the plain fallback is INERT for those two shapes and they need
 *      @supports, which is why this file grades the two cases by different
 *      rules instead of demanding one pattern everywhere.
 *
 * PROVE-RED: run this file in a checkout of 56c5058 (the pre-fix tree). Every
 * FALLBACK row and both DROPPED rows go red; the HONOURED rows stay green,
 * because the modern rendering was never the broken half.
 *
 * Usage: node tests/dvh-fallback-audit.mjs [baseUrl]
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serveTree, loadPuppeteer, sleep } from './godmode.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const results = [];
const ok = (n, pass, d = '') => { results.push({ n, pass }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${n}${d ? '  ' + d : ''}`); };

/* ============================ static half ============================ */
/* Every dvh/svh declaration in the sheet is classified and graded. This is the
   coverage half: a NEW dynamic-viewport unit written anywhere in app.css fails
   here on the day it is written, which is the only way this stays fixed. */

const css = readFileSync(path.join(ROOT, 'app.css'), 'utf8');

/* Walk the file tracking brace depth so each declaration knows whether it sits
   inside an @supports that tests for the unit it uses, and what the previous
   declaration in its own block was. A regex alone cannot answer either. */
function scan(src) {
  const decls = [];
  const stack = [];            // open at-rule preludes, outermost first
  let buf = '', prevInBlock = null, i = 0;
  while (i < src.length) {
    /* skip comments verbatim: a commented-out dvh is not a declaration */
    if (src[i] === '/' && src[i + 1] === '*') { const end = src.indexOf('*/', i + 2); i = end < 0 ? src.length : end + 2; continue; }
    const c = src[i];
    if (c === '{') { stack.push(buf.trim()); buf = ''; prevInBlock = null; i++; continue; }
    if (c === '}') { stack.pop(); buf = ''; prevInBlock = null; i++; continue; }
    if (c === ';') {
      const text = buf.trim(); buf = ''; i++;
      const m = text.match(/^([-a-zA-Z][-\w]*)\s*:\s*([\s\S]+)$/);
      if (!m) continue;
      const d = { prop: m[1], value: m[2], text, prev: prevInBlock, supports: stack.filter(s => /^@supports/i.test(s)).join(' ') };
      decls.push(d);
      prevInBlock = d;
      continue;
    }
    buf += c; i++;
  }
  return decls;
}

const decls = scan(css);
const dyn = decls.filter(d => /\b\d*\.?\d+(dvh|svh|lvh|dvw|svw|lvw)\b/.test(d.value));

/* EMPTY-SAMPLE GUARD: a drifted scanner finds nothing and every row below then
   passes for free. app.css has ten of these today. */
ok('SETUP  the stylesheet scanner found >=5 dynamic-viewport declarations (a hollow parse would make every FALLBACK row below vacuous)',
  dyn.length >= 5, `${decls.length} declarations parsed, ${dyn.length} using dvh/svh/lvh`);

const bad = [];
for (const d of dyn) {
  const guarded = /dvh|svh|lvh/.test(d.supports);
  const usesVar = /var\(/.test(d.value);
  const isCustom = d.prop.startsWith('--');
  const plainFallback = !!(d.prev && d.prev.prop === d.prop && /\b\d*\.?\d+vh\b/.test(d.prev.value) && !/dvh|svh|lvh/.test(d.prev.value));
  let why = null;
  if (guarded) why = null;
  else if (isCustom) why = 'custom property, and a preceding declaration is NOT a fallback for one: it loses at computed-value time, measured. Needs @supports.';
  else if (usesVar) why = 'contains var(), so it is invalid at COMPUTED-VALUE time and the preceding declaration is discarded rather than used, measured. Needs @supports.';
  else if (!plainFallback) why = `no \`${d.prop}\` fallback in vh immediately before it, so an old parser drops the property entirely`;
  if (why) bad.push(`${d.prop}: ${d.value.replace(/\s+/g, ' ').slice(0, 60)}  [${why}]`);
}
ok('FALLBACK  every dvh/svh declaration in app.css either has a vh fallback on the line before it or sits in an @supports that tests for the unit',
  bad.length === 0, bad.length ? `\n        ${bad.join('\n        ')}` : `all ${dyn.length} dynamic-viewport declarations are covered`);

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

/* THE OLD PARSER, as a source transform on the real sheet. Delete @supports
   blocks that test for a dynamic viewport unit (an old browser evaluates the
   condition as false), then delete every declaration that mentions one (an old
   browser cannot parse the value). Nothing else is touched. */
function asOldBrowser(input) {
  /* Comments go first, replaced by a space so nothing joins up. Browsers drop
     them, and leaving them in would let this file's OWN prose about 100dvh be
     read as a declaration by the two regexes below. */
  const src = input.replace(/\/\*[\s\S]*?\*\//g, ' ');
  let out = '', i = 0;
  while (i < src.length) {
    const at = src.indexOf('@supports', i);
    if (at < 0) { out += src.slice(i); break; }
    const open = src.indexOf('{', at);
    const cond = src.slice(at, open);
    if (!/dvh|svh|lvh/.test(cond)) { out += src.slice(i, open + 1); i = open + 1; continue; }
    let depth = 0, j = open;
    for (; j < src.length; j++) { if (src[j] === '{') depth++; else if (src[j] === '}') { depth--; if (!depth) break; } }
    out += src.slice(i, at);
    i = j + 1;
  }
  /* declarations: with a trailing semicolon, and the last one in a block without */
  return out
    .replace(/[^;{}]*:[^;{}]*\b\d*\.?\d+(?:dvh|svh|lvh)\b[^;{}]*;/g, '')
    .replace(/[^;{}]*:[^;{}]*\b\d*\.?\d+(?:dvh|svh|lvh)\b[^;{}]*(?=\})/g, '');
}

const cssOld = asOldBrowser(css);
/* Measured against the comment-free sheet, because that is what the transform
   starts from; against the raw 503 KB it would be comparing two different
   things and the ratio would mean nothing. */
const cssBare = css.replace(/\/\*[\s\S]*?\*\//g, ' ');
ok('SETUP  the simulated old-parser stylesheet really did lose the dynamic-viewport declarations, and lost only those',
  !/\d(?:dvh|svh|lvh)\b/.test(cssOld) && cssOld.length > cssBare.length * 0.9,
  `${cssBare.length} bytes without comments -> ${cssOld.length} bytes, dvh/svh remaining: ${(cssOld.match(/\d(?:dvh|svh|lvh)\b/g) || []).length}`);

const VIEWPORTS = [{ w: 390, h: 844 }, { w: 320, h: 568 }];

/* One page per (viewport, mode). `drop` swaps the stylesheet for the old-parser
   version before the first paint, so nothing is measured mid-relayout. */
async function measure({ w, h }, drop) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  if (drop) {
    await page.setRequestInterception(true);
    page.on('request', req => {
      if (/app\.css/.test(req.url())) req.respond({ status: 200, contentType: 'text/css', body: cssOld }).catch(() => {});
      else req.continue().catch(() => {});
    });
  }
  await page.goto(base + '?demo', { waitUntil: 'networkidle2' });
  await sleep(2600);
  /* clear the daily spin and first-run cards, same as godmode's dismissOverlays */
  for (let i = 0; i < 6; i++) {
    const hit = await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find(x => /^(spin|nice|done|collect|claim|continue|ok|got it|next|skip|back to the pit)$/i.test((x.textContent || '').trim()) && !x.disabled && x.getBoundingClientRect().width);
      if (!b) return null;
      b.scrollIntoView({ block: 'center' });
      const r = b.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    if (!hit) break;
    await page.mouse.click(hit.x, hit.y);
    await sleep(1200);
  }
  await page.evaluate(() => { location.hash = '#/today'; });
  await sleep(1400);
  const m = await page.evaluate(() => {
    const app = document.getElementById('app'), bar = document.getElementById('tabbar');
    const ar = app.getBoundingClientRect(), br = bar.getBoundingClientRect();
    const tabs = [...bar.querySelectorAll('.tab, .fab')].map(t => {
      const r = t.getBoundingClientRect();
      const hit = document.elementFromPoint(Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2));
      return { label: t.getAttribute('aria-label'), top: Math.round(r.top), reached: !!(hit && (hit === t || t.contains(hit))) };
    });
    return {
      vh: innerHeight,
      appH: Math.round(ar.height),
      barTop: Math.round(br.top), barBottom: Math.round(br.bottom),
      tabs,
      docH: Math.round(document.documentElement.scrollHeight),
    };
  });
  await ctx.close();
  return m;
}

for (const vp of VIEWPORTS) {
  const honoured = await measure(vp, false);
  const dropped = await measure(vp, true);
  const tag = `${vp.w}x${vp.h}`;

  /* The control. If this ever fails the simulation is not the interesting half. */
  ok(`HONOURED ${tag}  with dvh understood, the tab bar sits on screen`,
    honoured.barBottom <= honoured.vh + 1 && honoured.barTop < honoured.vh,
    `#app ${honoured.appH}px  tab-bar top ${honoured.barTop}  bottom ${honoured.barBottom}  viewport ${honoured.vh}`);

  /* THE BOUND: the bar's bottom edge is inside the viewport. Not "closer than
     it was", not "less than a screen away". Inside. */
  ok(`DROPPED ${tag}  with the dvh declarations dropped, the tab bar is STILL on screen`,
    dropped.barBottom <= dropped.vh + 1 && dropped.barTop < dropped.vh,
    `#app ${dropped.appH}px  document ${dropped.docH}px  tab-bar top ${dropped.barTop}  bottom ${dropped.barBottom}  viewport ${dropped.vh}  (${dropped.barTop - dropped.vh > 0 ? dropped.barTop - dropped.vh + 'px BELOW the fold' : 'on screen'})`);

  /* Position is not reachability: a bar at the right coordinates under an
     overlay is still unusable, so hit-test every tab and the FAB. */
  const unreachable = dropped.tabs.filter(t => !t.reached);
  ok(`DROPPED ${tag}  every tab and the FAB answer a tap at their own centre`,
    dropped.tabs.length >= 5 && unreachable.length === 0,
    `${dropped.tabs.length} controls, unreachable: ${unreachable.map(t => `${t.label}@y${t.top}`).join(', ') || 'none'}`);
}

await browser.close();
if (srvHandle) srvHandle.close();

const failed = results.filter(r => !r.pass);
if (!results.length) { console.log('\nFAIL: no checks ran'); process.exit(1); }
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) { console.log('FAILED: ' + failed.map(f => f.n).join(', ')); process.exit(1); }
console.log('dvh-fallback-audit clean');
