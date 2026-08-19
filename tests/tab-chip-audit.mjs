/* THE SELECTED TAB CHIP: loud enough to find, quiet enough not to run the screen.
 *
 * WHY THIS EXISTS. `.chip.ch-tab.on` shipped a solid `--coral` fill. Measured on
 * Shop at 440x956 the selected chip was 89.4% saturated pixels BY ITS OWN AREA,
 * against 3.7% for its unselected siblings and 14.2% for the most colourful
 * PRODUCT on the same screen: the loudest object on a shopping screen was a
 * navigation control, and a full-bleed accent fill is ~88% saturated by
 * construction, so nothing could out-shout it without putting a solid fill behind
 * the goods. Its label was also the worst-contrast text in the row, 2.39:1
 * cream-on-coral, while the chips NOT selected sat at 8.12:1.
 *
 * WHICH DIRECTION IS FAILURE (anti-regression rule 11). Both directions are, and
 * that is the whole point of this file. Too much accent and navigation eats the
 * screen; too little and nobody can find the tab they are on. So this is a BAND,
 * with a hard CEILING on the fill and a hard FLOOR on distinguishability, never a
 * trend. A check that only said "quieter than before" would grade an invisible
 * selected state as a win.
 *
 * NOT-BY-COLOUR-ALONE IS MEASURED, NOT ASSERTED. Hue is one of four signals and
 * three of them survive total colour loss: the ring's greyscale luminance step,
 * the label brightness step, and aria-selected. RING is computed from the
 * DESATURATED render, so a fix that moved all its margin into hue goes red here.
 *
 * EMPTY IS A FAILURE (rule 3). Every state must yield one selected chip and three
 * unselected siblings, at both viewports, on all four tabs. Fewer than the full
 * 8 states, or any state missing siblings, fails before a single number is graded.
 *
 * Run:  node tests/tab-chip-audit.mjs http://127.0.0.1:PORT/
 * argv FIRST, env.URL second: boot()'s default is the LIVE site, and an audit that
 * silently grades production reads as coverage of the tree under test.
 */
import { boot, sleep } from './godmode.js';

const base = process.argv[2] || process.env.URL;
const VIEWPORTS = [{ w: 440, h: 956, n: '440x956' }, { w: 393, h: 852, n: '393x852' }];
const TABS = ['wardrobe', 'crates', 'shop', 'talents'];

/* THE BAND. Every number is a measurement off this tree, stated so a later change
   has to move the constant on purpose and say why.
   FILL_MAX 0.30  measured 0.140 worst case after the fix, 0.898 before it. A solid
                  fill cannot get under 0.80, so the ceiling is unambiguous.
   DE_MIN    10   measured 13.9 worst case after the fix; 1.2 with the selected state
                  neutralised. CIE76 dE of ~2.3 is one just-noticeable difference, so
                  10 sits several JNDs above "can you see it" and well under 13.9.
   RING_MIN 1.8   measured 2.02 worst case after the fix, GREYSCALE, against 1.62 at
                  BEST on the old solid fill (whose margin was all in the block, not
                  the ring) and 1.00 with the selected state neutralised. The floor
                  separates all three.
   TEXT_MIN 4.5   WCAG AA for body text. The chip label is 11px, so no large-text
                  exemption applies to it. The old fill put it at 2.39:1. */
const FILL_MAX = 0.30, DE_MIN = 10, RING_MIN = 1.8, TEXT_MIN = 4.5;
/* saturated pixel = HSV S >= 0.35 and V >= 0.30. Fixed here so every run, and the
   before/after pair this file was written from, are the same measurement. */
const S_MIN = 0.35, V_MIN = 0.30;

let bad = 0;
const check = (l, ok, d = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${l}${d ? '  ' + d : ''}`); if (!ok) bad++; };

const { browser, page } = await boot(base);
const states = [];

for (const vp of VIEWPORTS) {
  await page.setViewport({ width: vp.w, height: vp.h, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.evaluate(() => { location.hash = '#/bonehead'; });
  await sleep(2600);
  for (const tab of TABS) {
    await page.evaluate(t => document.querySelector(`#chTabs .ch-tab[data-tab="${t}"]`)?.click(), tab);
    await sleep(1700);

    const geo = await page.evaluate(() => {
      const row = document.querySelector('#chTabs');
      const on = document.querySelector('#chTabs .ch-tab.on');
      const off = [...document.querySelectorAll('#chTabs .ch-tab:not(.on)')];
      if (!row || !on) return null;
      /* composite through ancestors until opaque: the same algorithm
         contrast-audit.mjs uses, and the only honest way to read text contrast
         off a translucent ground. */
      const parse = s => { const v = (s.match(/[\d.]+/g) || []).map(Number); if (v.length === 3) v.push(1); return v; };
      const over = (f, b) => [0, 1, 2].map(i => f[i] * f[3] + b[i] * (1 - f[3]));
      const groundOf = el => {
        let n = el.parentElement, acc = [];
        while (n && n !== document.documentElement) {
          const c = parse(getComputedStyle(n).backgroundColor);
          if (c[3] > 0) acc.push(c);
          if (c[3] > 0.95) break;
          n = n.parentElement;
        }
        let g = [13, 12, 18];
        for (let i = acc.length - 1; i >= 0; i--) g = over(acc[i], g);
        return g;
      };
      const read = el => {
        const cs = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        const ground = over(parse(cs.backgroundColor), groundOf(el));
        return {
          rect: { x: r.x, y: r.y, w: r.width, h: r.height },
          label: (el.querySelector('span')?.textContent || '').trim(),
          text: over(parse(cs.color), ground), ground,
          role: el.getAttribute('role'), ariaSelected: el.getAttribute('aria-selected'),
        };
      };
      const rr = row.getBoundingClientRect();
      return { row: { x: rr.x, y: rr.y, w: rr.width, h: rr.height },
               on: read(on), off: off.map(read),
               rowRole: row.getAttribute('role'),
               ariaTrue: [...document.querySelectorAll('#chTabs .ch-tab')].filter(b => b.getAttribute('aria-selected') === 'true').length };
    });
    if (!geo) { console.log(`  no chip row rendered for ${tab} @ ${vp.n}`); continue; }

    /* ONE screenshot of the row, sliced per chip in the page's own canvas. Decoding
       in the browser keeps this file free of an image dependency, exactly as
       crate-palette-audit.mjs does it. */
    const clip = { x: Math.floor(geo.row.x), y: Math.floor(geo.row.y),
                   width: Math.ceil(geo.row.w), height: Math.ceil(geo.row.h) };
    const shot = await page.screenshot({ clip, encoding: 'base64' });

    const px = await page.evaluate(async (b64, clip, chips, S_MIN, V_MIN) => {
      const img = await new Promise((res, rej) => {
        const i = new Image(); i.onload = () => res(i); i.onerror = rej;
        i.src = 'data:image/png;base64,' + b64;
      });
      const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
      const g = c.getContext('2d', { willReadFrequently: true });
      g.imageSmoothingEnabled = false; g.drawImage(img, 0, 0);
      const k = img.naturalWidth / clip.width;              // device px per css px
      const stat = r => {
        const x0 = Math.round((r.x - clip.x) * k), y0 = Math.round((r.y - clip.y) * k);
        const w = Math.round(r.w * k), h = Math.round(r.h * k);
        if (w < 4 || h < 4) return null;
        const d = g.getImageData(x0, y0, w, h).data;
        let hit = 0, n = 0, sr = 0, sg = 0, sb = 0, rr = 0, rg = 0, rb = 0, rn = 0;
        const t = Math.max(2, Math.round(3 * k / 2));        // the ring: outer ~1.5 css px
        for (let i = 0; i < d.length; i += 4) {
          const p = i / 4, x = p % w, y = (p / w) | 0;
          const R = d[i], G = d[i + 1], B = d[i + 2];
          n++; sr += R; sg += G; sb += B;
          const mx = Math.max(R, G, B), mn = Math.min(R, G, B);
          if (mx && (mx - mn) / mx >= S_MIN && mx / 255 >= V_MIN) hit++;
          if (x < t || y < t || x >= w - t || y >= h - t) { rr += R; rg += G; rb += B; rn++; }
        }
        return { sat: hit / n, n, mean: [sr / n, sg / n, sb / n], ring: [rr / rn, rg / rn, rb / rn] };
      };
      return { on: stat(chips.on), off: chips.off.map(stat), imgW: img.naturalWidth };
    }, shot, clip, { on: geo.on.rect, off: geo.off.map(o => o.rect) }, S_MIN, V_MIN);

    states.push({ vp: vp.n, tab, geo, px });
  }
}

/* ---- rule 3: nothing below is graded until the sample is real ---- */
const want = VIEWPORTS.length * TABS.length;
check(`SAMPLE  all ${want} chip-row states rendered and were measured`,
  states.length === want, `${states.length}/${want}`);
const thin = states.filter(s => s.geo.off.length < 3 || !s.px.on || s.px.off.some(o => !o) || s.px.on.n < 2000);
check('SAMPLE  every state gave one selected chip, three siblings, and real pixels',
  states.length > 0 && thin.length === 0,
  thin.length ? thin.map(s => `${s.vp}/${s.tab} siblings=${s.geo.off.length} px=${s.px.on?.n}`).join('; ') : `${states.length} states, ${states[0]?.px.on.n} px in the smallest read`);
if (!states.length || thin.length) {
  console.log('\nFAIL  nothing was measured, so nothing below would mean anything.');
  await browser.close();
  process.exit(1);
}

const L = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
const cr = (a, b) => { const x = L(a), y = L(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const lab = c => { const f = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const [r, g, b] = c.map(f);
  const h = t => t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
  const X = h((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047);
  const Y = h(0.2126 * r + 0.7152 * g + 0.0722 * b);
  const Z = h((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883);
  return [116 * Y - 16, 500 * (X - Y), 200 * (Y - Z)]; };
const de = (a, b) => { const p = lab(a), q = lab(b); return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); };
const avg = a => a.reduce((s, v) => s + v, 0) / a.length;
const mix = cs => [0, 1, 2].map(i => avg(cs.map(c => c[i])));

const rows = states.map(s => {
  const sib = mix(s.px.off.map(o => o.mean));
  const sibRing = mix(s.px.off.map(o => o.ring));
  return {
    id: `${s.vp}/${s.tab}`,
    fill: s.px.on.sat,
    sibFill: avg(s.px.off.map(o => o.sat)),
    de: de(s.px.on.mean, sib),
    ring: cr(s.px.on.ring, sibRing),
    selText: cr(s.geo.on.text, s.geo.on.ground),
    offText: Math.min(...s.geo.off.map(o => cr(o.text, o.ground))),
    aria: s.geo.ariaTrue, role: s.geo.on.role, rowRole: s.geo.rowRole,
  };
});
console.log('');
console.log(`${'state'.padEnd(18)} ${'fill%'.padStart(7)} ${'sib%'.padStart(6)} ${'dE76'.padStart(6)} ${'ring'.padStart(6)} ${'sel txt'.padStart(8)} ${'off txt'.padStart(8)}`);
for (const r of rows)
  console.log(`${r.id.padEnd(18)} ${(r.fill * 100).toFixed(1).padStart(7)} ${(r.sibFill * 100).toFixed(1).padStart(6)} ${r.de.toFixed(1).padStart(6)} ${r.ring.toFixed(2).padStart(6)} ${r.selText.toFixed(2).padStart(8)} ${r.offText.toFixed(2).padStart(8)}`);
console.log('');

const worstFill = Math.max(...rows.map(r => r.fill));
check(`FILL    no selected chip is more than ${(FILL_MAX * 100) | 0}% accent by its own area`,
  worstFill <= FILL_MAX,
  `worst ${(worstFill * 100).toFixed(1)}% at ${rows.find(r => r.fill === worstFill).id} (a solid fill measures ~89%)`);

const worstDe = Math.min(...rows.map(r => r.de));
check(`MARGIN  the selected chip is at least dE76 ${DE_MIN} from its siblings`,
  worstDe >= DE_MIN,
  `worst ${worstDe.toFixed(1)} at ${rows.find(r => r.de === worstDe).id}`);

const worstRing = Math.min(...rows.map(r => r.ring));
check(`RING    selection survives total colour loss: ring luminance >= ${RING_MIN}:1 vs the siblings'`,
  worstRing >= RING_MIN,
  `worst ${worstRing.toFixed(2)}:1 at ${rows.find(r => r.ring === worstRing).id}`);

const worstSel = Math.min(...rows.map(r => r.selText));
check(`TEXT    the SELECTED label clears ${TEXT_MIN}:1 on its own ground`,
  worstSel >= TEXT_MIN, `worst ${worstSel.toFixed(2)}:1 at ${rows.find(r => r.selText === worstSel).id}`);

const worstOff = Math.min(...rows.map(r => r.offText));
check(`TEXT    every UNSELECTED label clears ${TEXT_MIN}:1 too`,
  worstOff >= TEXT_MIN, `worst ${worstOff.toFixed(2)}:1 at ${rows.find(r => r.offText === worstOff).id}`);

check('ARIA    exactly one chip is aria-selected="true", inside a tablist',
  rows.every(r => r.aria === 1 && r.role === 'tab' && r.rowRole === 'tablist'),
  rows.map(r => `${r.id}:${r.aria}/${r.role}/${r.rowRole}`).filter((_, i) => i < 2).join(' '));

console.log(`\n${bad ? 'FAIL' : 'PASS'}  ${rows.length} states, ${bad} failing check(s)`);
await browser.close();
process.exit(bad ? 1 : 0);
