/* N1: real Chrome coverage for opt-in environments and the phone rotation lock.
 * Failing direction: landscape does not cover/hit-block the app, or portrait
 * remains blocked. CONTROL operates the Settings button after rotation back.
 * Browser/server proof is pending review in a socket-capable environment.
 * Run: node tests/orientation-audit.mjs [baseUrl]
 */
import { boot, setOrientation, sleep, dismissOverlays } from './godmode.js';
const { browser, page, errors } = await boot(process.argv[2] || process.env.URL, {
  timezone: 'Pacific/Kiritimati', locale: 'de-DE', orientation: 'portrait',
});
let bad = 0;
const ok = (label, pass, detail = '') => {
  console.log(`${pass ? 'PASS' : 'FAIL'} ${label} ${detail}`);
  if (!pass) bad++;
};
const environment = () => page.evaluate(() => ({
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  locale: Intl.NumberFormat().resolvedOptions().locale,
  number: (1234567).toLocaleString(), offset: new Date('2026-09-07T12:00:00Z').getTimezoneOffset(),
  coarse: matchMedia('(pointer: coarse)').matches,
  width: innerWidth, height: innerHeight,
}));
const lock = () => page.evaluate(() => {
  const el = document.getElementById('rotateLock');
  if (!el) return { present: false };
  const r = el.getBoundingClientRect(), s = getComputedStyle(el);
  const visible = s.display !== 'none' && s.visibility !== 'hidden' && Number(s.opacity) > 0 && r.width > 0 && r.height > 0;
  const hits = [[0.1, 0.1], [0.5, 0.5], [0.9, 0.9]].map(([x, y]) => el.contains(document.elementFromPoint(innerWidth * x, innerHeight * y)));
  return { present: true, visible, hits, covers: r.left <= 0 && r.top <= 0 && r.right >= innerWidth && r.bottom >= innerHeight,
    message: el.textContent.includes('TURN ME BACK') };
});
try {
  for (const phase of ['boot', 'reload']) {
    if (phase === 'reload') {
      await page.reload({ waitUntil: 'networkidle2' });
      await dismissOverlays(page);
    }
    const e = await environment();
    ok(`ENVIRONMENT ${phase} real UTC+14 and German Intl`, e.timezone === 'Pacific/Kiritimati' && e.offset === -840 && e.locale === 'de-DE' && e.number === '1.234.567', JSON.stringify(e));
  }
  const portrait = await lock();
  ok('CONTROL portrait has a lock element but leaves the app uncovered', portrait.present && !portrait.visible && portrait.hits.every(h => !h), JSON.stringify(portrait));
  await setOrientation(page, 'landscape'); await sleep(300);
  const e = await environment();
  ok('LANDSCAPE 852x393 with coarse pointer', e.width === 852 && e.height === 393 && e.coarse, JSON.stringify(e));
  const landscape = await lock();
  ok('LANDSCAPE lock visibly covers and intercepts the app', landscape.present && landscape.visible && landscape.covers && landscape.message && landscape.hits.every(Boolean), JSON.stringify(landscape));
  await setOrientation(page, 'portrait'); await sleep(300);
  const back = await lock(), size = await environment();
  ok('PORTRAIT 393x852 releases the lock', size.width === 393 && size.height === 852 && back.present && !back.visible && back.hits.every(h => !h), JSON.stringify(back));
  await page.evaluate(() => { location.hash = '#/today'; }); await sleep(1800);
  const settings = await page.$('#todaySettings');
  if (settings) { await settings.scrollIntoView(); await settings.click(); }
  const opened = await page.waitForFunction(() => location.hash === '#/settings' && !!document.querySelector('.settings-row'), { timeout: 10000 }).then(() => true).catch(() => false);
  ok('CONTROL Settings opens through a real click after rotating back', !!settings && opened);
  ok('ERRORS no browser exceptions', errors.length === 0, JSON.stringify(errors));
} finally { await browser.close(); }
console.log(`orientation: ${bad ? bad + ' FAILED' : 'clean'}`);
process.exitCode = bad ? 1 : 0;
