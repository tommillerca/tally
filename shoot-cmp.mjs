const W=setTimeout(()=>process.exit(3),60_000); W.unref?.();
import { serveTree } from './tests/godmode.js';
import puppeteer from '/Users/tommiller/Documents/Hyperframes Editor/overlay-render-kit/node_modules/puppeteer/lib/esm/puppeteer/puppeteer.js';
import path from 'node:path';
let browser, srv;
try {
  srv = await serveTree(path.resolve('.'));
  browser = await puppeteer.launch({ headless: 'shell', args:['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 430, height: 900, deviceScaleFactor: 2 });
  await page.goto(srv.url + 'cmp.html', { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => document.title === 'ready', { timeout: 20000 });
  await new Promise(r=>setTimeout(r,400));
  const h = await page.evaluate(()=>document.body.scrollHeight);
  await page.setViewport({ width: 430, height: Math.min(h+30, 1400), deviceScaleFactor: 2 });
  await new Promise(r=>setTimeout(r,300));
  await page.screenshot({ path: '/tmp/grill-compare.png' });
  console.log('captured');
} catch(e){ console.log('ERROR:', e.message); }
finally { try{await browser?.close();}catch{} try{await srv?.stop?.();}catch{} clearTimeout(W); process.exit(0); }
