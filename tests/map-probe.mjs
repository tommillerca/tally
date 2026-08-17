/* THROWAWAY DIAGNOSTIC PROBE (gwart/mapdiag). Not a gate, not registered.
 * Drives the Boneyard exactly as spire-gate does and records WHY the map dies:
 * every failed request, every page error with its stack, and the state of the
 * MapLibre Map object itself. Never exits non-zero: it is a measurement. */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serveTree, loadPuppeteer } from './godmode.js';

/* Self-sufficient launch: this probe must run on origin/main too, where
   godmode has no launch() export yet (that lands with gwart/launchfix). Chrome
   refuses its sandbox as uid 0, so add the root flags when we are root. */
const rootArgs = process.getuid?.() === 0 ? ['--no-sandbox', '--disable-setuid-sandbox'] : [];
const puppeteer = await loadPuppeteer();
const launch = opts => puppeteer.launch({ headless: process.env.HEADLESS_MODE || 'new', ...opts, args: [...rootArgs, ...(opts.args || [])] });

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ABORT_REMOTE = !!process.env.ABORT_REMOTE;

const srv = await serveTree(ROOT);
const base = srv.url.replace(/\/?$/, '/');
const origin = new URL(base).origin;
console.log('serving', base, ABORT_REMOTE ? '(remote requests aborted at the browser)' : '');

const browser = await launch({
  defaultViewport: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage();
const errors = [], failed = [], remote = [];
page.on('pageerror', e => errors.push({ msg: e.message, stack: String(e.stack || '').split('\n').slice(0, 6) }));
page.on('requestfailed', r => failed.push({ url: r.url().slice(0, 120), err: r.failure()?.errorText }));
if (ABORT_REMOTE) {
  await page.setRequestInterception(true);
  page.on('request', r => {
    if (r.url().startsWith(origin) || r.url().startsWith('data:') || r.url().startsWith('blob:')) return r.continue();
    remote.push(r.url().slice(0, 120));
    return r.abort();
  });
} else {
  page.on('request', r => { if (!r.url().startsWith(origin) && !/^(data|blob):/.test(r.url())) remote.push(r.url().slice(0, 120)); });
}

await browser.defaultBrowserContext().overridePermissions(origin, ['geolocation']);
await page.setGeolocation({ latitude: 49.2827, longitude: -123.1207, accuracy: 8 });
await page.goto(base + '?demo', { waitUntil: 'networkidle2' });
await sleep(2600);

// Prove geolocation actually answers in this container, before the map asks.
const geo = await page.evaluate(() => new Promise(res => {
  const t0 = performance.now();
  navigator.geolocation.getCurrentPosition(
    p => res({ ok: true, ms: Math.round(performance.now() - t0), lat: p.coords.latitude, lng: p.coords.longitude }),
    e => res({ ok: false, ms: Math.round(performance.now() - t0), code: e.code, msg: e.message }),
    { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 });
}));
console.log('GEOLOCATION', JSON.stringify(geo));

// Prove the vendored library loads, parses and constructs a Map with a LOCAL
// style that has no remote sources, in a throwaway container. If this works the
// library and the GL context are exonerated.
const lib = await page.evaluate(async () => {
  const out = {};
  const t0 = performance.now();
  try {
    const m = await import('./js/map.js');
    const gl = await m.loadMaplibre();
    out.loaded = !!gl; out.version = gl.version || null; out.loadMs = Math.round(performance.now() - t0);
    out.supported = typeof gl.supported === 'function' ? gl.supported() : 'n/a';
    const div = document.createElement('div');
    div.style.cssText = 'position:absolute;left:-9999px;width:300px;height:300px';
    document.body.appendChild(div);
    const map = new gl.Map({
      container: div, center: [-123.1207, 49.2827], zoom: 14, attributionControl: false,
      style: { version: 8, sources: {}, layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#123' } }] },
    });
    out.emptyStyle = await new Promise(res => {
      const t = setTimeout(() => res('TIMEOUT'), 8000);
      map.on('load', () => { clearTimeout(t); res('load fired in ' + Math.round(performance.now() - t0) + 'ms'); });
      map.on('error', e => { clearTimeout(t); res('ERROR ' + (e.error?.message || e.message)); });
    });
    out.painted = !!map.getCanvas()?.width;
    map.remove(); div.remove();
  } catch (e) { out.threw = String(e); }
  return out;
});
console.log('MAPLIBRE', JSON.stringify(lib, null, 1));

// Now the real screen, driven the way spire-gate drives it.
await page.evaluate(() => { location.hash = '#/today'; });
await sleep(900);
await page.evaluate(() => { location.hash = '#/boneyard'; });
await sleep(2000);
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find(x => /open the map/i.test(x.textContent || ''));
  if (b) b.click();
});

for (const t of [1500, 3000, 5000, 9000, 14000]) {
  await sleep(t === 1500 ? 1500 : t - (t === 3000 ? 1500 : t === 5000 ? 3000 : t === 9000 ? 5000 : 9000));
  const snap = await page.evaluate(() => {
    const map = window.__map;
    const body = document.getElementById('mapBody');
    const st = (() => { try { return map?.style; } catch { return null; } })();
    return {
      mapBodyText: (body?.textContent || '').trim().slice(0, 90),
      hasStage: !!document.getElementById('mapStage'),
      hasCanvas: !!document.querySelector('#mapCanvas canvas'),
      markersIn: !!document.getElementById('mapStage')?.classList.contains('markers-in'),
      mapSpire: !!document.querySelector('#mapSpire'),
      mapDen: !!document.querySelector('#mapDen'),
      markers: document.querySelectorAll('.maplibregl-marker').length,
      spawnMarks: document.querySelectorAll('.maplibregl-marker .map-spawn, .maplibregl-marker.map-spawn').length,
      mapObj: !!map,
      mapLoaded: (() => { try { return map?.loaded(); } catch (e) { return 'threw ' + e.message; } })(),
      styleLoaded: (() => { try { return map?.isStyleLoaded(); } catch (e) { return 'threw ' + e.message; } })(),
      areTilesLoaded: (() => { try { return map?.areTilesLoaded(); } catch (e) { return 'threw ' + e.message; } })(),
      sources: (() => { try { return Object.keys(st?.sourceCaches || st?._otherSourceCaches || {}); } catch { return null; } })(),
      layerCount: (() => { try { return map?.getStyle()?.layers?.length; } catch (e) { return 'threw ' + e.message; } })(),
    };
  });
  console.log(`T+${t}ms`, JSON.stringify(snap));
}

console.log('\nPAGE ERRORS', errors.length);
for (const e of errors) console.log(' -', e.msg, '\n   ', e.stack.join('\n    '));
console.log('\nREMOTE REQUESTS', remote.length);
for (const u of [...new Set(remote)]) console.log(' -', u);
console.log('\nFAILED REQUESTS', failed.length);
for (const f of failed.slice(0, 12)) console.log(' -', f.err, f.url);

await browser.close();
srv.close();
