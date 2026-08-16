/* tests/hollow-beds-audit.mjs — the guard rail for js/hollow-beds.js.
 *
 * WHAT IT IS FOR. hollow-beds.js replaces openHollow's hand-written bed and crop
 * SVG with the designer's own pieces out of HLW_ART. Four separate guards in this
 * project turned out incapable of failing because each hardcoded its own scope,
 * so COVERAGE here is DERIVED: it reads the HLW_ART keys, works out which of them
 * are bed-class from the key namespace, and fails on any piece that is neither
 * rendered by the module nor excused by name in NOT_IN_BEDS below. A new
 * crop-* or hollow-bed-* piece from the designer enters scope on its own and
 * goes red until somebody deals with it.
 *
 * WHERE IT RUNS. It serves THIS checkout and boots that URL. It never boots the
 * default, which is https://tommillerca.github.io/tally/ and would silently grade
 * production. The URL is printed on every run.
 *
 * WHAT IT MEASURES, in the real browser with the shipped app.css:
 *   COVERAGE     every bed-class HLW_ART piece is used or excused, no stale excuses
 *   BLANK        every state differs from the bare background
 *   DISTINCT     all 28 state pairs differ by measured pixels
 *   DROPLET      the thirst droplet exists for canWater and for nothing else,
 *                in the markup AND in the pixels
 *   INERT        zero buttons, and elementFromPoint never lands on module output
 *   BOX          the sign at 1,500 and at 4,000 stays inside its declared 96x96,
 *                and bed art stays inside 84x60 plus its declared headroom
 *   MOTION       animations run with motion on (or the next line proves nothing),
 *                and ZERO report playState "running" with reduce emulated
 *
 * LIMITATION, stated rather than hidden: the module is not wired into openHollow
 * yet (Reggie owns that call site), so the rig below mounts its output into the
 * live app document rather than into #hlwStage. tests/hollow-audit.mjs is what
 * covers the shipped screen.
 *
 * Usage:  node tests/hollow-beds-audit.mjs [width] [height]
 * Set HB_OUT to a directory to also write the screenshots and the raw JSON.
 * An empty sample set is a FAILURE, never a pass.
 */
import fs from 'node:fs';
import { boot, serveTree, sleep, setWidth } from './godmode.js';

const ROOT = process.env.HB_ROOT || decodeURIComponent(new URL('..', import.meta.url).pathname);
const W = Number(process.argv[2]) || 390, H = Number(process.argv[3]) || 844;
const OUT = process.env.HB_OUT || '';

/* Bed-class pieces that this module deliberately does NOT draw. Each needs a
   reason, each must still exist in HLW_ART, and none may turn up in the render. */
const NOT_IN_BEDS = {
  'hollow-bed-frame': 'the five-slot frame is scene chrome drawn once by openHollow, not per-bed art',
  'hollow-timer-chip': 'a fixed 64x22 SVG pill cannot flex to a "2h 58m" label, and its baked droplet would put a droplet on non-thirsty beds; .hlw-chip already carries its spec (rgba(13,12,18,.6), r11, h22)',
  'hollow-water-done': 'a tick droplet on every watered bed is the exact regression the shipped thirst-cue fix removed; watered is carried by the ABSENCE of the thirst chip',
  'hollow-coin-plaque': 'the coin balance is HUD chrome, not a bed, and the module contract has no export for it',
};
/* Derived, not listed: anything the designer names as a crop or as bed/water/
   timer/price/coin furniture is in scope. */
const BED_CLASS = /^(crop-|hollow-(bed|water|timer|price|coin))/;

/* The pixel bar. 0.9% of a 84x100 cell at dsf 2 is ~150 device pixels: far more
   than antialiasing noise between two identical renders (which measures 0.00%),
   far under the smallest real difference here. */
const DISTINCT_MIN = 0.009;
const BLANK_MIN = 0.02;      // vs the bare background
const HEADROOM_MAX = 30;     // px of ripe plant allowed above BED_BOX

const srv = await serveTree(ROOT);
console.log(`hollow-beds-audit: serving ${ROOT}`);
console.log(`hollow-beds-audit: URL ${srv.url}   (never the live default)`);
const { browser, page, errors } = await boot(srv.url);
const consoleErrs = [];
page.on('console', m => { if (m.type() === 'error') consoleErrs.push(m.text()); });
await setWidth(page, W, H);
await sleep(900);

const fail = [];
const note = (cond, msg) => { if (!cond) fail.push(msg); };

/* ---------- the rig: every state the module can render, in the live document
     with the shipped app.css, at 1:1 so measurements are the CSS pixels. ---------- */
const CELL = { w: 84, h: 100, pad: 10 };
const buildRig = async () => page.evaluate(async ([base, cell]) => {
  const m = await import(new URL('js/hollow-beds.js', base).href);
  const art = await import(new URL('js/hollow-art.js', base).href);
  const now = Date.now(), HOUR = 36e5;
  // one plot shape, exactly as gardenState() emits it, plus the two optional flags
  const grow = (ing, frac, canWater = false) => {
    const span = 3 * HOUR, remaining = Math.round(span * (1 - frac));
    return { index: 0, empty: false, ing, name: ing, rare: ing === 'ectoplasm',
      plantedAt: now - (span - remaining), readyAt: now + remaining, ready: false,
      watered: !canWater, remainingMs: remaining, canWater };
  };
  const ripe = ing => ({ index: 0, empty: false, ing, name: ing, rare: ing === 'ectoplasm',
    plantedAt: now - 4 * HOUR, readyAt: now - 6e5, ready: true, watered: true, remainingMs: 0, canWater: false });

  const BEDS = [
    ['locked', { index: 0, empty: true, locked: true }],
    ['empty', { index: 0, empty: true }],
    ['tilled', { index: 0, empty: true, tilled: true }],
    ['seeded', grow('ember', 0.05)],
    ['sprout', grow('ember', 0.45)],
    ['young', grow('ember', 0.80)],
    ['ripe', ripe('ember')],
    ['ripe-rare', ripe('ectoplasm')],
  ];
  // chip states, including the two that must NOT wear a droplet
  const CHIPS = [
    ['chip-thirsty', grow('ember', 0.5, true)],
    ['chip-watered', grow('ember', 0.5, false)],
    ['chip-ready', ripe('ember')],
    ['chip-empty', { index: 0, empty: true }],
  ];
  const SIGNS = [['sign-1500', 1500], ['sign-4000', 4000]];

  document.querySelector('#hbRig')?.remove();
  const rig = document.createElement('div');
  rig.id = 'hbRig';
  const cols = 4;
  rig.style.cssText = `position:fixed;left:0;top:0;z-index:999999;width:${cols * cell.w + (cols - 1) * cell.pad}px;`
    + 'background:linear-gradient(180deg,#55673a 0%,#617442 38%,#5d7040 66%,#4f6138 100%);'
    + `display:grid;grid-template-columns:repeat(${cols},${cell.w}px);gap:0 ${cell.pad}px;`;

  /* .hb-out IS the rig's own positioning wrapper and everything INSIDE it is
     module output, so the inert probes below can tell the two apart. */
  const cellHtml = (name, cls, style, inner) =>
    `<div class="hb-cell" data-name="${name}" style="position:relative;width:${cell.w}px;height:${cell.h}px">`
    + `<div class="hb-out ${cls}" style="position:absolute;${style}">${inner}</div></div>`;

  // the bed art box sits at the BOTTOM of the cell, leaving the top for the
  // headroom a ripe plant grows into
  const bedTop = cell.h - 60;
  const html = [
    ...BEDS.map(([n, p]) => cellHtml(n, 'hb-bedbox', `left:0;top:${bedTop}px;width:84px;height:60px`, m.hlwBedArt(p))),
    // a bare cell, so "non-blank" is measured against the actual background
    cellHtml('background', '', 'left:0;top:0', ''),
    ...CHIPS.map(([n, p]) => cellHtml(n, '', 'left:42px;top:40px', m.hlwChipHtml(p))),
    ...SIGNS.map(([n, price]) => cellHtml(n, '', 'left:9px;top:15px', m.hlwPriceSignHtml(price))),
  ].join('');
  rig.innerHTML = html;
  document.body.appendChild(rig);

  return {
    artKeys: Object.keys(art.HLW_ART),
    bedNames: BEDS.map(([n]) => n),
    chipMarkup: Object.fromEntries([...CHIPS, ...BEDS].map(([n, p]) => [n, m.hlwChipHtml(p)])),
    chipCanWater: Object.fromEntries([...CHIPS, ...BEDS].map(([n, p]) => [n, !!p.canWater])),
    bedBox: m.BED_BOX,
  };
}, [srv.url, CELL]);

const rig = await buildRig();
note(rig.artKeys.length > 20, `EMPTY SAMPLE: HLW_ART has ${rig.artKeys.length} keys`);
note(rig.bedBox && rig.bedBox.w === 84 && rig.bedBox.h === 60,
  `BED_BOX changed to ${JSON.stringify(rig.bedBox)}; the caller positions on it, so say so out loud`);

/* ---------- 1. MOTION with the setting OFF: if nothing runs here, the reduced
     motion assertion below cannot fail and is worth nothing. ---------- */
await sleep(400);
const motionOn = await page.evaluate(() => {
  const rig = document.querySelector('#hbRig');
  return document.getAnimations().filter(a => a.effect && a.effect.target && rig.contains(a.effect.target))
    .map(a => ({ name: a.animationName || '?', state: a.playState }));
});
note(motionOn.length > 0, 'EMPTY SAMPLE: the module rendered no animations at all, so the reduced-motion check below proves nothing');
note(motionOn.some(a => a.state === 'running'),
  `MOTION: nothing in the module is running with motion ON (${JSON.stringify(motionOn)}), so the reduce check cannot fail`);

/* ---------- 2. MOTION with reduce emulated: ZERO may still be running ---------- */
await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
await buildRig();
await sleep(900);
const motionOff = await page.evaluate(() => {
  const rig = document.querySelector('#hbRig');
  const mine = document.getAnimations().filter(a => a.effect && a.effect.target && rig.contains(a.effect.target));
  return {
    total: mine.length,
    running: mine.filter(a => a.playState === 'running')
      .map(a => ({ name: a.animationName || '?', target: a.effect.target.getAttribute('class') || a.effect.target.tagName })),
  };
});
/* NOT "total > 0" here. Under reduce the global rule caps iterations at 1, so a
   finished no-fill animation is dropped from getAnimations() and an empty list is
   the CORRECT answer. What proves this check can fail is the assertion directly
   above: the same rig runs animations with the setting off. The direction is
   positive -> zero, and zero is the bound. */
note(motionOff.running.length === 0,
  `REDUCED MOTION STILL RUNNING: ${motionOff.running.length} of ${motionOff.total} -> ${JSON.stringify(motionOff.running.slice(0, 6))}`);

/* everything below is measured in the reduce state, so a pulsing fruit cannot
   make two screenshots of the same state disagree */

/* ---------- 3. COVERAGE, derived from HLW_ART ---------- */
const used = await page.evaluate(() => [...new Set([...document.querySelectorAll('#hbRig [class*="hlw-p-"]')]
  .map(el => (el.getAttribute('class') || '').match(/hlw-p-([\w-]+)/)?.[1]).filter(Boolean))]);
const scope = rig.artKeys.filter(k => BED_CLASS.test(k));
note(scope.length >= 10, `EMPTY SAMPLE: only ${scope.length} bed-class pieces derived from HLW_ART`);
note(used.length > 0, 'EMPTY SAMPLE: the render used no HLW_ART pieces at all');
for (const k of scope) {
  if (!used.includes(k) && !(k in NOT_IN_BEDS)) fail.push(`COVERAGE ${k} is neither rendered nor listed in NOT_IN_BEDS`);
}
for (const [k, why] of Object.entries(NOT_IN_BEDS)) {
  if (!rig.artKeys.includes(k)) fail.push(`COVERAGE stale exclusion: ${k} is not in HLW_ART any more`);
  if (!BED_CLASS.test(k)) fail.push(`COVERAGE pointless exclusion: ${k} was never in scope`);
  if (used.includes(k)) fail.push(`COVERAGE ${k} is excused in NOT_IN_BEDS but the module renders it`);
  if (!why || why.length < 20) fail.push(`COVERAGE ${k} has no real reason`);
}

/* ---------- 4. every bed state is non-blank and DISTINCT, by pixels ---------- */
const clips = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('#hbRig .hb-cell')]
  .map(c => { const r = c.getBoundingClientRect(); return [c.dataset.name, { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) }]; })));
const shots = {};
for (const [name, clip] of Object.entries(clips)) {
  shots[name] = (await page.screenshot({ clip })).toString('base64');
  if (OUT) fs.writeFileSync(`${OUT}/hb-${name}.png`, Buffer.from(shots[name], 'base64'));
}
const names = [...rig.bedNames, 'background'];
note(names.every(n => shots[n]), `EMPTY SAMPLE: missing screenshots for ${names.filter(n => !shots[n])}`);

const px = await page.evaluate(async ([imgs, keys]) => {
  const load = async b64 => {
    const im = new Image(); im.src = 'data:image/png;base64,' + b64; await im.decode();
    const c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
    const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(im, 0, 0);
    return { d: g.getImageData(0, 0, c.width, c.height).data, w: c.width, h: c.height };
  };
  const data = {};
  for (const k of keys) data[k] = await load(imgs[k]);
  const frac = (a, b) => {
    if (a.d.length !== b.d.length) return 1;
    let n = 0;
    for (let i = 0; i < a.d.length; i += 4) {
      if (Math.max(Math.abs(a.d[i] - b.d[i]), Math.abs(a.d[i + 1] - b.d[i + 1]), Math.abs(a.d[i + 2] - b.d[i + 2])) > 16) n++;
    }
    return n / (a.d.length / 4);
  };
  const pairs = {}, vsBg = {};
  for (const k of keys) if (k !== 'background') vsBg[k] = +frac(data[k], data.background).toFixed(5);
  for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) {
    if (keys[i] === 'background' || keys[j] === 'background') continue;
    pairs[`${keys[i]}|${keys[j]}`] = +frac(data[keys[i]], data[keys[j]]).toFixed(5);
  }
  return { vsBg, pairs, size: [data[keys[0]].w, data[keys[0]].h] };
}, [Object.fromEntries(names.map(n => [n, shots[n]])), names]);

note(Object.keys(px.vsBg).length === rig.bedNames.length, `EMPTY SAMPLE: ${Object.keys(px.vsBg).length} states measured`);
for (const [k, v] of Object.entries(px.vsBg)) {
  if (v < BLANK_MIN) fail.push(`BLANK state "${k}" differs from the bare background by only ${(v * 100).toFixed(2)}% of pixels`);
}
const pairList = Object.entries(px.pairs).sort((a, b) => a[1] - b[1]);
note(pairList.length === 28, `EMPTY SAMPLE: ${pairList.length} state pairs compared, expected 28`);
for (const [k, v] of pairList) {
  if (v < DISTINCT_MIN) fail.push(`DISTINCT ${k} differ by only ${(v * 100).toFixed(2)}% of pixels (floor ${(DISTINCT_MIN * 100).toFixed(2)}%)`);
}

/* ---------- 5. the droplet: canWater and nothing else, markup AND pixels ---------- */
const dropMarkup = Object.entries(rig.chipMarkup)
  .map(([n, html]) => ({ n, canWater: rig.chipCanWater[n], hasSvg: /<svg/.test(html), empty: html === '' }));
note(dropMarkup.some(d => d.canWater) && dropMarkup.some(d => !d.canWater && !d.empty),
  'EMPTY SAMPLE: the chip states do not cover both a thirsty and a watered growing bed');
for (const d of dropMarkup) {
  if (d.canWater && !d.hasSvg) fail.push(`DROPLET "${d.n}" can be watered but its chip carries no droplet`);
  if (!d.canWater && d.hasSvg) fail.push(`DROPLET "${d.n}" is not thirsty but its chip still carries a droplet`);
}
const dropRender = await page.evaluate(() => {
  const chips = [...document.querySelectorAll('#hbRig .hlw-chip')];
  return {
    chips: chips.length,
    withSvg: chips.filter(c => c.querySelector('svg')).length,
    svgOutsideThirst: chips.filter(c => c.querySelector('svg') && !c.classList.contains('thirst')).length,
    thirstNoSvg: chips.filter(c => c.classList.contains('thirst') && !c.querySelector('svg')).length,
    /* ONE LINE. The caller's anchor is a zero-width absolutely positioned
       wrapper, so a chip with no nowrap gets min-content and "1h 30m" arrives
       stacked. Measured, not assumed: two lines is roughly double the height. */
    lines: chips.map(c => ({ text: c.textContent.trim(), rects: c.getClientRects().length, h: +c.getBoundingClientRect().height.toFixed(1), w: +c.getBoundingClientRect().width.toFixed(1) })),
    dropClip: (() => {
      const s = document.querySelector('#hbRig .hlw-chip.thirst svg');
      if (!s) return null;
      const r = s.getBoundingClientRect(), c = s.closest('.hlw-chip').getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y), width: Math.max(1, Math.round(r.width)), height: Math.max(1, Math.round(r.height)),
        inChip: r.left >= c.left - 0.5 && r.right <= c.right + 0.5 };
    })(),
  };
});
note(dropRender.chips >= 2, `EMPTY SAMPLE: ${dropRender.chips} chips rendered`);
note(dropRender.svgOutsideThirst === 0, `DROPLET rendered on ${dropRender.svgOutsideThirst} non-thirsty chip(s)`);
note(dropRender.thirstNoSvg === 0, `DROPLET missing from ${dropRender.thirstNoSvg} thirst chip(s)`);
note(dropRender.withSvg === 1, `DROPLET expected exactly 1 chip carrying one, got ${dropRender.withSvg}`);
note(dropRender.dropClip?.inChip, 'DROPLET is not inside its chip');
note(dropRender.lines.length >= 2, `EMPTY SAMPLE: ${dropRender.lines.length} chips measured for wrapping`);
for (const l of dropRender.lines) {
  if (l.h > 26) fail.push(`CHIP "${l.text}" is ${l.h}px tall, so it wrapped onto more than one line`);
  if (l.w < 24) fail.push(`CHIP "${l.text}" is only ${l.w}px wide`);
}
// and it has to be VISIBLE, not just present: ink pixels against the lime chip
let dropInk = null;
if (dropRender.dropClip) {
  const b64 = (await page.screenshot({ clip: { x: dropRender.dropClip.x, y: dropRender.dropClip.y, width: dropRender.dropClip.width, height: dropRender.dropClip.height } })).toString('base64');
  if (OUT) fs.writeFileSync(`${OUT}/hb-droplet.png`, Buffer.from(b64, 'base64'));
  dropInk = await page.evaluate(async b => {
    const im = new Image(); im.src = 'data:image/png;base64,' + b; await im.decode();
    const c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
    const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(im, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let dark = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) { n++; if (d[i] < 90 && d[i + 1] < 110 && d[i + 2] < 90) dark++; }
    return { dark, n, frac: +(dark / n).toFixed(4) };
  }, b64);
  note(dropInk.n > 0, 'EMPTY SAMPLE: the droplet screenshot had no pixels');
  note(dropInk.frac > 0.15, `DROPLET is present but invisible: only ${(dropInk.frac * 100).toFixed(1)}% ink pixels in its own box`);
}

/* ---------- 6. INERT: no buttons, nothing answers a tap ---------- */
const inert = await page.evaluate(() => {
  const rig = document.querySelector('#hbRig');
  const outs = [...rig.querySelectorAll('.hb-out')];
  const mine = new Set(outs.flatMap(o => [...o.querySelectorAll('*')]));
  const interactiveTags = outs.flatMap(o => [...o.querySelectorAll('button,a,input,select,textarea,[onclick],[tabindex],[role="button"]')])
    .map(e => e.tagName);
  const pe = [...mine].filter(e => getComputedStyle(e).pointerEvents !== 'none')
    .map(e => `${e.tagName}.${(e.getAttribute('class') || '').slice(0, 40)}`);
  // probe a grid over every cell
  const hits = [], probed = [];
  for (const c of rig.querySelectorAll('.hb-cell')) {
    const r = c.getBoundingClientRect();
    for (let i = 1; i <= 5; i++) for (let j = 1; j <= 5; j++) {
      const x = r.left + r.width * i / 6, y = r.top + r.height * j / 6;
      const el = document.elementFromPoint(x, y);
      probed.push(1);
      if (!el) continue;
      if (mine.has(el) || ['BUTTON', 'A', 'INPUT'].includes(el.tagName)) {
        hits.push(`${c.dataset.name}@${i},${j} -> ${el.tagName}.${(el.getAttribute('class') || '').slice(0, 30)}`);
      }
    }
  }
  return { nodes: mine.size, interactiveTags, pe, hits, probes: probed.length };
});
note(inert.nodes > 20, `EMPTY SAMPLE: only ${inert.nodes} module nodes in the rig`);
note(inert.probes >= 300, `EMPTY SAMPLE: only ${inert.probes} elementFromPoint probes`);
note(inert.interactiveTags.length === 0, `INERT the module emitted interactive elements: ${inert.interactiveTags}`);
note(inert.pe.length === 0, `INERT ${inert.pe.length} module node(s) are not pointer-events:none: ${inert.pe.slice(0, 4)}`);
note(inert.hits.length === 0, `INERT elementFromPoint landed on module output: ${inert.hits.slice(0, 5)}`);

/* ---------- 7. BOX: the sign and the bed art stay where they say they do ---------- */
const boxes = await page.evaluate(([headroom]) => {
  const over = (child, box) => Math.max(box.left - child.left, box.top - child.top, child.right - box.right, child.bottom - box.bottom);
  const signs = [...document.querySelectorAll('#hbRig .hlw-p-hollow-price-sign')].map(svg => {
    const R = svg.getBoundingClientRect();
    const bad = [...svg.querySelectorAll('*')].map(el => {
      const r = el.getBoundingClientRect();
      if (!r.width && !r.height) return null;
      const o = over(r, R);
      return o > 0.5 ? { tag: el.tagName, over: +o.toFixed(2) } : null;
    }).filter(Boolean);
    return { text: svg.textContent.trim(), w: +R.width.toFixed(1), h: +R.height.toFixed(1), children: svg.querySelectorAll('*').length, bad };
  });
  const beds = [...document.querySelectorAll('#hbRig .hb-bedbox')].map(box => {
    const R = box.getBoundingClientRect();
    const name = box.closest('.hb-cell').dataset.name;
    let up = 0, side = 0, down = 0;
    const kids = [...box.querySelectorAll('svg')];
    for (const el of kids) {
      const r = el.getBoundingClientRect();
      up = Math.max(up, R.top - r.top);
      down = Math.max(down, r.bottom - R.bottom);
      side = Math.max(side, R.left - r.left, r.right - R.right);
    }
    return { name, kids: kids.length, w: +R.width.toFixed(1), h: +R.height.toFixed(1), up: +up.toFixed(1), side: +side.toFixed(1), down: +down.toFixed(1) };
  });
  return { signs, beds, headroom };
}, [HEADROOM_MAX]);
note(boxes.signs.length === 2, `EMPTY SAMPLE: ${boxes.signs.length} price signs rendered, expected 2 (1,500 and 4,000)`);
for (const s of boxes.signs) {
  note(s.children > 3, `EMPTY SAMPLE: sign "${s.text}" has ${s.children} drawn children`);
  /* 96x96 since the sign went to 2x with the rest of the scene. At 66 hlwArt
     rounded the 48px sprite to 1x and the price was drawn at half the scene's
     pixel size. This pin tracks SIGN_BOX in js/hollow-beds.js. */
  note(s.w === 96 && s.h === 96, `BOX sign "${s.text}" declares 96x96 but measures ${s.w}x${s.h}`);
  if (s.bad.length) fail.push(`BOX sign "${s.text}" paints outside its 96x96 box: ${JSON.stringify(s.bad)}`);
  if (!/^[\d,]+$/.test(s.text)) fail.push(`BOX sign shows "${s.text}", not a price`);
}
note(boxes.beds.length === 8, `EMPTY SAMPLE: ${boxes.beds.length} bed boxes, expected 8`);
for (const b of boxes.beds) {
  note(b.kids > 0, `EMPTY SAMPLE: bed state "${b.name}" drew nothing`);
  if (b.side > 0.5) fail.push(`BOX bed "${b.name}" paints ${b.side}px outside BED_BOX horizontally`);
  if (b.down > 0.5) fail.push(`BOX bed "${b.name}" paints ${b.down}px below BED_BOX`);
  if (b.up > HEADROOM_MAX) fail.push(`BOX bed "${b.name}" reaches ${b.up}px above BED_BOX, over the ${HEADROOM_MAX}px headroom`);
}

/* ---------- report ---------- */
note(errors.length === 0, `PAGE ERRORS: ${JSON.stringify(errors.slice(0, 3))}`);
note(consoleErrs.length === 0, `CONSOLE ERRORS: ${JSON.stringify(consoleErrs.slice(0, 3))}`);

const res = { url: srv.url, viewport: [W, H], scope, used, notInBeds: Object.keys(NOT_IN_BEDS),
  vsBackground: px.vsBg, pairs: Object.fromEntries(pairList), motionOn, motionOff, dropRender, dropInk, inert: { ...inert, hits: inert.hits.slice(0, 5) }, boxes, fail };
if (OUT) fs.writeFileSync(`${OUT}/hollow-beds.json`, JSON.stringify(res, null, 1));

console.log(`\nCOVERAGE  scope ${scope.length}: ${scope.join(' ')}`);
console.log(`          used  ${used.length}: ${used.join(' ')}`);
console.log(`          excused ${Object.keys(NOT_IN_BEDS).length}: ${Object.keys(NOT_IN_BEDS).join(' ')}`);
console.log(`BLANK     min vs background ${(Math.min(...Object.values(px.vsBg)) * 100).toFixed(2)}%  ${JSON.stringify(px.vsBg)}`);
console.log(`DISTINCT  closest pairs: ${pairList.slice(0, 5).map(([k, v]) => `${k} ${(v * 100).toFixed(2)}%`).join(' | ')}`);
console.log(`MOTION    on: ${motionOn.filter(a => a.state === 'running').length}/${motionOn.length} running   reduce: ${motionOff.running.length}/${motionOff.total} running`);
console.log(`DROPLET   chips ${dropRender.chips}, carrying a droplet ${dropRender.withSvg}, ink ${dropInk ? (dropInk.frac * 100).toFixed(1) + '%' : 'n/a'}`);
console.log(`INERT     ${inert.nodes} nodes, ${inert.probes} probes, ${inert.hits.length} landed on module output`);
console.log(`BOX       signs ${boxes.signs.map(s => `${s.text} ${s.w}x${s.h} over=${s.bad.length}`).join(' , ')}`);
console.log(`          beds up/side/down max ${Math.max(...boxes.beds.map(b => b.up)).toFixed(1)} / ${Math.max(...boxes.beds.map(b => b.side)).toFixed(1)} / ${Math.max(...boxes.beds.map(b => b.down)).toFixed(1)}`);
console.log(`\n=== hollow-beds ${W}x${H} ===`);
console.log(fail.length ? fail.map(f => 'FAIL ' + f).join('\n') : 'ALL PASS');
await browser.close(); srv.close?.();
process.exit(fail.length ? 1 : 0);
