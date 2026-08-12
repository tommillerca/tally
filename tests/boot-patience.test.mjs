/* DISCRIMINATING TEST for the boot change, without needing a loaded box.
 * The failure mode is "the network never goes quiet inside the timeout", so
 * simulate exactly that: serve the app but keep ONE request permanently in
 * flight (a hanging asset). networkidle2 can then never see its quiet window
 * and must time out; a readiness wait does not care, because the app has
 * rendered. Same tree, same page, only the wait strategy differs.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPuppeteer } from './godmode.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };

const held = [];
const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split('?')[0]);
  // one endpoint that never answers: the app requests it and it stays in flight
  if (rel.startsWith('/__hang')) { held.push(res); return; }
  const full = path.join(ROOT, rel === '/' ? 'index.html' : rel.replace(/^\/+/, ''));
  if (!full.startsWith(ROOT) || !fs.existsSync(full) || !fs.statSync(full).isFile()) { res.writeHead(404).end('no'); return; }
  let body = fs.readFileSync(full);
  if (rel === '/' || rel.endsWith('index.html')) {
    // inject a request that never completes, so the network is never idle
    /* THREE hanging requests, not one: networkidle2 tolerates up to TWO in
       flight, so a single hang does not defeat it. My first version hung one
       and both boots sailed through in a second, which would have read as
       "the fix does nothing" when it was the simulation that was wrong. */
    body = Buffer.from(String(body).replace('</body>',
      '<script>for (let i = 0; i < 3; i++) fetch("/__hang?" + i).catch(()=>{});</script></body>'));
  }
  res.writeHead(200, { 'content-type': MIME[path.extname(full)] || 'application/octet-stream', 'cache-control': 'no-store' });
  res.end(body);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}/`;
console.log('serving with one permanently in-flight request at', url);

const puppeteer = await loadPuppeteer();
const run = async (label, waitOpts, readiness) => {
  const browser = await puppeteer.launch({ headless: 'new', defaultViewport: { width: 430, height: 932 } });
  const page = await browser.newPage();
  const t0 = Date.now();
  let verdict;
  try {
    await page.goto(url + '?demo', waitOpts);
    if (readiness) {
      await page.waitForFunction(() => {
        const s = document.getElementById('screen');
        return !!(s && s.children.length && document.querySelectorAll('.tab').length);
      }, { timeout: 60000, polling: 150 });
    }
    const rendered = await page.evaluate(() => {
      const s = document.getElementById('screen');
      return { screenKids: s ? s.children.length : 0, tabs: document.querySelectorAll('.tab').length };
    });
    verdict = `REACHED THE APP in ${((Date.now() - t0) / 1000).toFixed(1)}s  screenKids=${rendered.screenKids} tabs=${rendered.tabs}`;
  } catch (e) {
    verdict = `DIED after ${((Date.now() - t0) / 1000).toFixed(1)}s: ${String(e).split('\n')[0]}`;
  }
  await browser.close();
  console.log(`${label}\n    ${verdict}`);
  return verdict;
};

const oldWay = await run('OLD  goto(networkidle2, 30s default)', { waitUntil: 'networkidle2' }, false);
const newWay = await run('NEW  goto(domcontentloaded, 60s) + app-readiness wait', { waitUntil: 'domcontentloaded', timeout: 60000 }, true);

held.forEach(r => { try { r.end(); } catch { /* already gone */ } });
server.close();
const pass = /DIED/.test(oldWay) && /REACHED THE APP/.test(newWay);
console.log(`\n${pass ? 'DISCRIMINATING: old boot dies, new boot reaches the app' : 'NOT DISCRIMINATING: both behaved the same, this proves nothing'}`);
process.exit(pass ? 0 : 1);
