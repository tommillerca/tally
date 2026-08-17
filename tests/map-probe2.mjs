/* THROWAWAY DIAGNOSTIC PROBE B (gwart/mapdiag).
 * Isolates the two effects of a dead tile source by serving a style that has NO
 * remote source at all: the map then loads cleanly, so the map.once('error')
 * body-wipe (app.js:12933) cannot fire and app.js:13211 cannot throw. Whatever
 * is STILL missing afterwards is missing because there are no vector tiles to
 * snap POIs against, not because the screen was torn down. */
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
const srv = await serveTree(ROOT);
const base = srv.url.replace(/\/?$/, '/');
const origin = new URL(base).origin;

const STUB_STYLE = JSON.stringify({
  version: 8, name: 'no-sources',
  sources: {},
  layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#1b1712' } }],
});

const browser = await launch({
  defaultViewport: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message + ' @ ' + String(e.stack || '').split('\n')[1]?.trim()));
await page.setRequestInterception(true);
page.on('request', r => {
  if (/assets\/map\/boneheadz-style\.json/.test(r.url())) {
    return r.respond({ status: 200, contentType: 'application/json', body: STUB_STYLE });
  }
  if (!r.url().startsWith(origin) && !/^(data|blob):/.test(r.url())) return r.abort();
  return r.continue();
});

await browser.defaultBrowserContext().overridePermissions(origin, ['geolocation']);
// stand on a real spire, exactly as spire-gate does
await page.setGeolocation({ latitude: 49.2827, longitude: -123.1207, accuracy: 8 });
await page.goto(base + '?demo', { waitUntil: 'networkidle2' });
await sleep(2600);
const spire = await page.evaluate(async () => {
  const m = await import('./js/spires.js');
  const s = m.spiresNear(49.2827, -123.1207)[0];
  return s ? { id: s.id, lat: s.lat, lng: s.lng, name: s.name } : null;
});
console.log('spire', JSON.stringify(spire));
await page.setGeolocation({ latitude: spire.lat, longitude: spire.lng, accuracy: 8 });

await page.evaluate(() => { location.hash = '#/today'; });
await sleep(900);
await page.evaluate(() => { location.hash = '#/boneyard'; });
await sleep(2000);
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find(x => /open the map/i.test(x.textContent || ''));
  if (b) b.click();
});
await sleep(9000);

const snap = await page.evaluate(() => {
  const map = window.__map;
  const sb = document.querySelector('#mapSpire');
  return {
    mapBodyText: (document.getElementById('mapBody')?.textContent || '').trim().slice(0, 70),
    hasStage: !!document.getElementById('mapStage'),
    hasCanvas: !!document.querySelector('#mapCanvas canvas'),
    markersIn: !!document.getElementById('mapStage')?.classList.contains('markers-in'),
    mapLoaded: (() => { try { return map?.loaded(); } catch { return null; } })(),
    markers: document.querySelectorAll('.maplibregl-marker').length,
    poiMarkers: document.querySelectorAll('.maplibregl-marker .map-spawn, .maplibregl-marker .map-den-mark, .maplibregl-marker .map-spire').length,
    queryRendered: (() => { try { return map.queryRenderedFeatures().length; } catch (e) { return 'threw'; } })(),
    spireBtn: sb ? { hidden: sb.hidden, text: (sb.textContent || '').trim() } : null,
    readout: (document.getElementById('mapReadout')?.textContent || '').trim().slice(0, 60),
  };
});
console.log('STUB-STYLE RUN', JSON.stringify(snap, null, 1));
console.log('PAGE ERRORS', errors.length, errors);
await browser.close();
srv.close();
