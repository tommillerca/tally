/* Operator render proof for frozen R8. Local implementation sandbox: BLOCKED
 * on listen EPERM, not a rendered pass or RED. Commands:
 *   node tests/r8-shop-css-browser-audit.mjs
 *   node tests/r8-shop-css-browser-audit.mjs --css /tmp/r8-shop-proof/baseline.css
 *   node tests/r8-shop-css-browser-audit.mjs --remove-short
 * The baseline and remove-short runs must exit 1 on assertions after rendering.
 * A launch/listener failure proves no visual assertion. No token contrast math:
 * screenshot pairs isolate painted glyphs and their composited backgrounds.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { boot, seed, sleep, serveTree, setWidth } from './godmode.js';

const supplied = process.argv.slice(2).find(a => /^https?:/.test(a)) || process.env.URL;
if (supplied) assert(['localhost', '127.0.0.1', '[::1]'].includes(new URL(supplied).hostname), 'Local disposable checkout only');
const cssArg = process.argv.indexOf('--css');
let css = readFileSync(cssArg < 0 ? new URL('../app.css', import.meta.url) : process.argv[cssArg + 1], 'utf8');
if (process.argv.includes('--remove-short')) css = css.replaceAll('.t3-price[data-short="1"]', '.r8-removed-short');
let srv, browser, page, failures = 0;
function ok(label, pass, detail = '') {
  console.log(`${pass ? 'PASS' : 'FAIL'} ${label}${detail ? ': ' + detail : ''}`);
  if (!pass) failures++;
}
async function openShop(coins, dust) {
  await seed(page, { level: 20, coins, dust });
  await page.evaluate(() => { location.hash = '#/today'; });
  await sleep(400);
  await page.evaluate(() => { location.hash = '#/shop'; });
  await page.waitForSelector('.rk-buy [data-buyrack]');
  // Replace, rather than append to, app.css so baseline/mutation runs cannot
  // inherit the final fix through the cascade. Resolve asset URLs at this origin.
  await page.evaluate(async source => {
    const links = [...document.querySelectorAll('link[rel="stylesheet"]')]
      .filter(l => new URL(l.href).pathname.endsWith('/app.css'));
    if (links.length !== 1) throw Error(`CONTROL expected one app.css, saw ${links.length}`);
    const style = document.createElement('style'); style.textContent = source;
    links[0].replaceWith(style);
    await document.fonts.ready;
  }, css);
  await page.addStyleTag({ content: '*, *::before, *::after { animation: none !important; transition: none !important; }' });
  await sleep(300);
}
async function measure(selector) {
  const el = await page.$(selector);
  assert(el, `CONTROL missing price: ${selector}`);
  await el.scrollIntoView(); await sleep(150);
  const normal = await el.screenshot({ encoding: 'base64' });
  const original = await el.evaluate(e => {
    const value = e.getAttribute('style');
    e.style.setProperty('color', 'transparent', 'important');
    e.style.setProperty('text-shadow', 'none', 'important');
    return value;
  });
  let ground;
  try { ground = await el.screenshot({ encoding: 'base64' }); }
  finally { await el.evaluate((e, value) => value == null ? e.removeAttribute('style') : e.setAttribute('style', value), original); }
  return page.evaluate(async (painted, blank) => {
    const decode = async b64 => {
      const bitmap = await createImageBitmap(await (await fetch('data:image/png;base64,' + b64)).blob());
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height), ctx = canvas.getContext('2d');
      ctx.drawImage(bitmap, 0, 0); bitmap.close();
      return { width: canvas.width, height: canvas.height, data: ctx.getImageData(0, 0, canvas.width, canvas.height).data };
    };
    const a = await decode(painted), b = await decode(blank);
    if (a.width !== b.width || a.height !== b.height) throw Error('CONTROL screenshot geometry changed');
    const luma = rgb => rgb.map(c => c / 255).map(c => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4)
      .reduce((s, c, i) => s + c * [.2126, .7152, .0722][i], 0);
    const ratio = (x, y) => (Math.max(x, y) + .05) / (Math.min(x, y) + .05);
    const modes = new Map();
    for (let i = 0; i < a.data.length; i += 4) {
      const rgb = Array.from(a.data.slice(i, i + 3)), bg = Array.from(b.data.slice(i, i + 3));
      if (Math.max(...rgb.map((v, j) => Math.abs(v - bg[j]))) < 16) continue;
      const key = rgb.join(',');
      const row = modes.get(key) || { count: 0, minContrast: Infinity, rgb };
      row.count++; row.minContrast = Math.min(row.minContrast, ratio(luma(rgb), luma(bg)));
      modes.set(key, row);
    }
    // Modal changed RGB selects opaque glyph interiors, excluding their many
    // antialiased edge shades. The control rejects missing/too-small samples.
    const ink = [...modes.values()].sort((x, y) => y.count - x.count)[0];
    let bright = 0, total = 0;
    const inset = Math.ceil(8 * devicePixelRatio);
    for (let y = inset; y < b.height - inset; y++) for (let x = inset; x < b.width - inset; x++) {
      const i = 4 * (y * b.width + x);
      bright += luma(Array.from(b.data.slice(i, i + 3))) > .2 ? 1 : 0;
      total++;
    }
    return { ink, brightFraction: total ? bright / total : null, samples: total };
  }, normal, ground);
}
try {
  srv = supplied ? null : await serveTree(fileURLToPath(new URL('../', import.meta.url)));
  const session = await boot(supplied || srv.url, { deviceScaleFactor: 2 });
  ({ browser, page } = session);
  await setWidth(page, 393, 852);
  await openShop(250000, 250000);
  const selectors = await page.evaluate(() => ['coin', 'dust'].map(currency => {
    const e = document.querySelector(`.rk-buy [data-buyrack][data-cur="${currency}"]`);
    if (!e) throw Error(`CONTROL missing ${currency} shelf price`);
    return `.rk-buy [data-buyrack="${CSS.escape(e.dataset.buyrack)}"][data-cur="${currency}"]`;
  }));
  selectors.push('.pet-hero [data-petbuy]');
  const affordable = [];
  for (const selector of selectors) {
    assert(await page.$eval(selector, e => !e.classList.contains('cant') && !e.hasAttribute('data-short')), 'CONTROL affordable wallet is reflected in markup');
    affordable.push(await measure(selector));
  }
  await openShop(40, 0);
  for (let i = 0; i < selectors.length; i++) {
    const selector = selectors[i];
    assert(await page.$eval(selector, e => e.classList.contains('cant') || e.dataset.short === '1'), 'CONTROL short wallet is reflected in markup');
    const short = await measure(selector), filled = affordable[i];
    ok(`CONTROL ${selector} captures glyphs and backgrounds`, [filled, short].every(m => m.ink?.count >= 10 && m.samples >= 100), JSON.stringify({ filled, short }));
    ok(`EMPHASIS ${selector} affordable fill dominates hollow short state`, filled.brightFraction > .5 && filled.brightFraction > short.brightFraction + .25);
    ok(`CONTRAST ${selector} affordable digits at least 4.5:1`, filled.ink?.minContrast >= 4.5, String(filled.ink?.minContrast));
  }
  // State comparison on one generic ghost control, composited inside the real
  // Shop card. Identical text/geometry, changing only the native disabled flag.
  await page.evaluate(() => {
    const button = document.createElement('button'); button.id = 'r8-ghost';
    button.className = 'btn ghost small'; button.textContent = 'Wear it';
    document.querySelector('.rk').append(button);
  });
  const ghost = await page.$('#r8-ghost'); await ghost.scrollIntoView();
  const enabled = await ghost.screenshot();
  await ghost.evaluate(e => { e.disabled = true; });
  const disabled = await ghost.screenshot();
  ok('GHOST disabled differs visibly from enabled', !enabled.equals(disabled));
  ok('CONTROL stable disabled screenshots are identical', disabled.equals(await ghost.screenshot()));
  ok('NO page errors', session.errors.length === 0, session.errors.join(' | '));
} catch (e) {
  console.error(`${e.code === 'EPERM' ? 'BLOCKED' : 'ERROR'} node tests/r8-shop-css-browser-audit.mjs: ${e.stack}`);
  failures++;
} finally {
  await browser?.close(); srv?.close();
}
console.log(`R8 Shop CSS render: ${failures ? `${failures} failed or blocked` : 'all passed'}`);
process.exitCode = failures ? 1 : 0;
