/* WATCHDOG FIRST. Every render script I wrote today could hang forever and two
   of them did, holding a headless Chrome for 11 hours. Nothing reaps them, so
   the script reaps itself. */
const WATCHDOG = setTimeout(() => { console.log('WATCHDOG: forced exit'); process.exit(3); }, 90_000);
WATCHDOG.unref?.();
setTimeout(() => process.exit(3), 95_000).unref?.();

import { boot, sleep, serveTree } from './tests/godmode.js';
import path from 'node:path';

let browser, srv;
try {
  srv = await serveTree(path.resolve('.'));
  /* USE THE PAGE boot() RETURNS. Navigating again after boot threw away the
     seeded save and landed the capture on the onboarding screen, which is how
     the first run claimed to render try-on and produced a picture of FEED THE
     BONES instead. */
  const booted = await boot(srv.url);
  browser = booted.browser;
  const page = booted.page;
  await sleep(1200);

  for (const [w, h] of [[440, 956], [393, 852]]) {
    await page.setViewport({ width: w, height: h, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await page.evaluate(() => { location.hash = '#/bonehead'; });
    await sleep(900);
    await page.evaluate(() => document.querySelector('[data-tab="shop"]')?.click());
    await sleep(1500);
    await page.evaluate(() => {
      document.querySelectorAll('*').forEach(e => {
        if (e.children.length === 0 && /^DEMO$/i.test((e.textContent || '').trim())) e.style.display = 'none';
      });
    });
    /* SUPPRESS THE TOAST FOR THE CAPTURE ONLY. Measured: the toast box spans
       y816-860 and the name row y814-834 with the NOT YOURS YET badge at
       y812-836, so a toast covers BOTH. That is a REAL app-side bug and it is
       NOT fixed by this line: hiding it here only makes the design judgeable. */
    await page.evaluate(() => { const t = document.querySelector('#toast, .toast'); if (t) t.style.display = 'none'; });
    // a GARMENT first
    await page.evaluate(() => document.querySelector('[data-tryon]:not([data-tryon="AURA"])')?.click());
    await sleep(700);
    await page.screenshot({ path: `/tmp/tryon-${w}-garment-early.png` });
    await sleep(1400);
    await page.screenshot({ path: `/tmp/tryon-${w}-garment.png` });
    const m = await page.evaluate(() => {
      const s = document.querySelector('.sheet');
      return { sheet: !!s, h: s ? Math.round(s.getBoundingClientRect().height) : 0,
               text: (s?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 120) };
    });
    console.log(`${w}x${h} garment`, JSON.stringify(m));
    // close, then the AURA
    await page.evaluate(() => document.querySelector('.sheet [data-close], .sheet .sheet-x, .sheet button')?.click());
    await sleep(800);
    await page.evaluate(() => document.querySelector('[data-tryon="AURA"]')?.click());
    await sleep(1800);
    await page.screenshot({ path: `/tmp/tryon-${w}-aura.png` });
    console.log(`${w}x${h} aura captured`);
  }
} catch (e) {
  console.log('ERROR:', e.message);
} finally {
  try { await browser?.close(); } catch {}
  try { await srv?.stop?.(); } catch {}
  clearTimeout(WATCHDOG);
  console.log('DONE, cleaned up');
  process.exit(0);
}
