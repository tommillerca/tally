/* Assessment-B evidence dump for the Football Kit poster (#fbSect).
 * NOT a test: no exit-code contract. Boots the real app via tests/godmode.js
 * (same harness scratchpad/proof/capture.mjs uses), then:
 *   1. writes the poster's rendered outerHTML closed + open, wrapped in a
 *      minimal document that links the real app.css, so the impeccable
 *      detector sees real cascade/computed styles instead of raw template text.
 *   2. dumps computed styles + rects for the requested selectors as JSON.
 *   3. screenshots the open poster (dpr2) so background-behind-text can be
 *      sampled for contrast on the grain/gradient surfaces, per pixel not
 *      per token.
 * Run: HEADLESS_MODE=shell node scratchpad/critique/dump.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { boot, seed, settle, setWidth, serveTree, sleep } from '../../tests/godmode.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const OUT = HERE;
const PYTOOL = path.resolve(HERE, '..', 'proof', 'imgtool.py');

const meanRgb = (imgPath, x, y, w, h) => {
  if (w <= 0 || h <= 0) return null;
  const r = JSON.parse(execFileSync('python3', [PYTOOL, 'measure', imgPath,
    String(Math.round(x)), String(Math.round(y)), String(Math.round(w)), String(Math.round(h)), '999'], { encoding: 'utf8' }));
  return r.mean_dark_rgb || r.mean_all_rgb || null; // thresh 999: every non-transparent px counts as "dark"
};

const srgbToLin = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
const luminance = ([r, g, b]) => 0.2126 * srgbToLin(r) + 0.7152 * srgbToLin(g) + 0.0722 * srgbToLin(b);
const contrast = (fg, bg) => {
  const L1 = luminance(fg), L2 = luminance(bg);
  const [hi, lo] = L1 > L2 ? [L1, L2] : [L2, L1];
  return (hi + 0.05) / (lo + 0.05);
};
const parseRgb = str => {
  const m = str.match(/rgba?\(([^)]+)\)/);
  if (!m) return null;
  return m[1].split(',').slice(0, 3).map(s => parseFloat(s));
};

async function main() {
  const srv = await serveTree(ROOT);
  const { browser, page } = await boot(srv.url);
  page.on('pageerror', e => console.error('PAGEERROR', e.message));

  const results = { computed: {}, contrast: {}, tokens: {}, detector: {}, notes: [] };

  try {
    await seed(page, { level: 20, coins: 400000 });
    await setWidth(page, 390, 844);

    const gotoShop = async () => {
      await page.evaluate(() => { location.hash = '#/shop'; });
      await sleep(3200);
      await settle(page);
      await page.evaluate(() => document.querySelectorAll('#toast, .toast').forEach(n => n.remove()));
    };
    await gotoShop();

    const bodyClass = await page.evaluate(() => document.body.className);

    // ---------- HTML dumps (closed, then open) ----------
    const wrap = (inner, cls) => `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="../../app.css"></head>
<body class="${cls}">
<div id="app"><div class="page"><div class="shop">
${inner}
</div></div></div>
</body></html>`;

    const closedHtml = await page.evaluate(() => document.getElementById('fbSect')?.outerHTML || null);
    if (!closedHtml) { console.error('MISSING: #fbSect not found closed'); results.notes.push('fbSect missing closed'); }
    else {
      fs.writeFileSync(path.join(OUT, 'fbsect.html'), wrap(closedHtml, bodyClass));
      console.log('WROTE fbsect.html (closed)');
    }

    await page.evaluate(() => { const el = document.getElementById('fbSect'); if (el) el.open = true; });
    await settle(page);

    const openHtml = await page.evaluate(() => document.getElementById('fbSect')?.outerHTML || null);
    if (!openHtml) { console.error('MISSING: #fbSect not found open'); results.notes.push('fbSect missing open'); }
    else {
      fs.writeFileSync(path.join(OUT, 'fbsect-open.html'), wrap(openHtml, bodyClass));
      console.log('WROTE fbsect-open.html (open)');
    }

    // ---------- root tokens ----------
    results.tokens = await page.evaluate(() => {
      const cs = getComputedStyle(document.documentElement);
      return { '--surface-2': cs.getPropertyValue('--surface-2').trim(), '--text': cs.getPropertyValue('--text').trim(),
        '--text-2': cs.getPropertyValue('--text-2').trim(), '--text-3': cs.getPropertyValue('--text-3').trim() };
    });

    // ---------- computed styles + rects ----------
    const PROPS = ['color', 'backgroundColor', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing'];
    const dumpOne = async (sel, opts = {}) => page.evaluate((s, props, opts) => {
      const nodes = [...document.querySelectorAll(s)];
      let node = nodes[0];
      if (opts.disabled) node = nodes.find(n => !n.disabled) || nodes[0];
      if (opts.enabled) node = nodes.find(n => !n.disabled) || nodes[0];
      if (!node) return null;
      const cs = getComputedStyle(node);
      const r = node.getBoundingClientRect();
      const out = { selector: s, count: nodes.length, rect: { x: r.x, y: r.y, width: r.width, height: r.height } };
      for (const p of props) out[p] = cs[p];
      return out;
    }, sel, PROPS, opts);

    for (const sel of ['.fb-drop .eyebrow', '.fb-drop h2', '.fb-drop .tx small', '.fb-drop .t3-price', '.fb-swatch.xs', '.fb-kitline', '.fb-save']) {
      results.computed[sel] = await dumpOne(sel);
    }
    // enabled/disabled drop-buy[data-buyfb]: force one of each via the DOM
    // property (matches :disabled the same way the real UA state would).
    results.computed['.drop-buy[data-buyfb] (enabled, natural)'] = await dumpOne('.drop-buy[data-buyfb]');
    const forcedDisabled = await page.evaluate(() => {
      const btns = [...document.querySelectorAll('.drop-buy[data-buyfb]')];
      const target = btns.find(b => !b.disabled);
      if (!target) return false;
      target.disabled = true;
      return true;
    });
    if (forcedDisabled) {
      results.computed['.drop-buy[data-buyfb] (forced disabled via .disabled=true)'] = await dumpOne('.drop-buy[data-buyfb]:disabled');
    } else {
      results.notes.push('.drop-buy[data-buyfb]: no enabled button found to force-disable (all owned/disabled already?)');
    }

    // ---------- screenshot for pixel-sampled contrast ----------
    // NOTE: deliberately NOT calling page.setViewport again here -- setWidth()
    // already set dpr2/isMobile, and a second setViewport call was observed to
    // trigger the app's resize-driven re-render, which re-rendered #fbSect
    // CLOSED (the open=true we forced via the DOM property doesn't survive a
    // fresh footballShelfHtml() call unless the app's own wasOpen tracking
    // catches it first). Re-open explicitly and verify before the shot.
    await page.evaluate(() => { const el = document.getElementById('fbSect'); if (el && !el.open) el.open = true; });
    await settle(page);
    const isOpenNow = await page.evaluate(() => !!document.getElementById('fbSect')?.open);
    console.log('fbSect.open before screenshot:', isOpenNow);
    const fbSect = await page.$('#fbSect');
    await fbSect.evaluate(n => n.scrollIntoView({ block: 'start' }));
    await settle(page);
    const wrapRect = await fbSect.evaluate(n => { const r = n.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; });
    const shotPath = path.join(OUT, 'fbsect-shot-dpr2.png');
    await fbSect.screenshot({ path: shotPath });
    console.log('WROTE', shotPath);

    /* RE-FETCH RECTS IN THE SAME SCROLL STATE AS THE SHOT.
     * The rects stashed in results.computed were read BEFORE scrollIntoView
     * moved the page (they were read while the page sat at whatever scroll
     * position the earlier `#fbTeam`/dump work left it at). getBoundingClientRect
     * is viewport-relative, so subtracting a rect taken at scroll position A from
     * wrapRect taken at scroll position B silently points at the wrong pixels --
     * caught by cropping the sampled coordinates and seeing "Lizard Helmet"
     * where the price chip should have been. Fixed by reading every target
     * rect fresh, in one call, at the exact scroll position the screenshot used. */
    const freshRects = await page.evaluate(sels => Object.fromEntries(sels.map(s => {
      const el = document.querySelector(s);
      if (!el) return [s, null];
      const r = el.getBoundingClientRect();
      return [s, { x: r.x, y: r.y, width: r.width, height: r.height }];
    })), ['.fb-drop .eyebrow', '.fb-drop h2', '.fb-drop .tx small', '.fb-drop .t3-price', '.fb-kitline', '.fb-save']);
    console.log('freshRects', JSON.stringify(freshRects));

    // For each text element: sample a background-only strip adjacent to it
    // (a margin/padding gap with no glyphs), not the text's own box, then
    // compute contrast fg-color (from computed style) vs that sampled bg.
    const DPR = 2;
    const sampleBgNear = (rect, dx, dy, w, h) => {
      const x = (rect.x - wrapRect.x + dx) * DPR, y = (rect.y - wrapRect.y + dy) * DPR;
      const v = meanRgb(shotPath, x, y, w * DPR, h * DPR);
      return v;
    };

    const contrastRow = (label, compEntry, bgRgb, method) => {
      if (!compEntry || !bgRgb) { results.contrast[label] = { error: 'missing data' }; return; }
      const fg = parseRgb(compEntry.color);
      const ratio = fg ? contrast(fg, bgRgb) : null;
      const size = parseFloat(compEntry.fontSize);
      const weight = parseInt(compEntry.fontWeight, 10) || 400;
      const large = size >= 24 || (size >= 18.66 && weight >= 700);
      const threshold = large ? 3.0 : 4.5;
      results.contrast[label] = {
        fg: compEntry.color, bg_sampled_rgb: bgRgb, font_size_px: size, font_weight: weight,
        large_text: large, ratio: ratio ? +ratio.toFixed(2) : null,
        threshold_AA: threshold, pass_AA: ratio ? ratio >= threshold : null, method,
      };
    };

    // eyebrow: sample the .tx top-padding gap just above it
    let e = results.computed['.fb-drop .eyebrow'], eR = freshRects['.fb-drop .eyebrow'];
    if (e && eR) contrastRow('.fb-drop .eyebrow', e, sampleBgNear(eR, 0, -4, Math.min(30, eR.width), 2), 'sampled bg strip 4px above (container top padding, pre-text)');
    // h2: sample the margin-bottom gap below it (2px 0 8px margin -> clear band)
    let h2 = results.computed['.fb-drop h2'], h2R = freshRects['.fb-drop h2'];
    if (h2 && h2R) contrastRow('.fb-drop h2', h2, sampleBgNear(h2R, 0, h2R.height + 2, Math.min(30, h2R.width), 3), 'sampled bg strip in the 8px margin-bottom gap below the heading');
    // tx small: sample its own margin-bottom gap (8px) before .fb-teams
    let sm = results.computed['.fb-drop .tx small'], smR = freshRects['.fb-drop .tx small'];
    if (sm && smR) contrastRow('.fb-drop .tx small', sm, sampleBgNear(smR, 0, smR.height + 2, Math.min(30, smR.width), 3), 'sampled bg strip in the 8px margin-bottom gap below the copy');
    // t3-price: opaque gold chip, no grain shows through (position:relative,
    // elevated above the ::before grain layer) -- sample its own box directly.
    let tp = results.computed['.fb-drop .t3-price'], tpR = freshRects['.fb-drop .t3-price'];
    if (tp && tpR) contrastRow('.fb-drop .t3-price', tp, sampleBgNear(tpR, 2, 2, Math.min(20, tpR.width - 4), Math.min(10, tpR.height - 4)), 'sampled own chip fill directly (opaque, no grain beneath)');
    // fb-kitline / fb-save: on .drop-item.fb (opaque var(--surface-2)), sample own row gap
    let kl = results.computed['.fb-kitline'], klR = freshRects['.fb-kitline'];
    if (kl && klR) contrastRow('.fb-kitline', kl, sampleBgNear(klR, 0, -3, Math.min(20, klR.width), 2), 'sampled bg strip just above (opaque card surface, no grain)');
    let fs_ = results.computed['.fb-save'], fsR = freshRects['.fb-save'];
    if (fs_ && fsR) contrastRow('.fb-save', fs_, sampleBgNear(fsR, 0, -3, Math.min(20, fsR.width), 2), 'sampled bg strip just above (opaque card surface, no grain)');

    fs.writeFileSync(path.join(OUT, 'computed.json'), JSON.stringify(results, null, 2));
    console.log('WROTE computed.json');

  } finally {
    await browser.close();
    srv.close?.();
    console.log('done');
  }
}

main().catch(e => { console.error('FATAL', e); process.exitCode = 1; });
