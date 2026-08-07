/* THE STEP RACE: one set of numbers, everywhere.
 *
 * Tom, 2026-08-08: "make sure your popup reflects the new date and prizes we
 * cant have mixed messaging." Three places quote the purse (the announcement
 * poster, the Crew card, the server that actually pays it) and they are in two
 * different files and two different runtimes, so they WILL drift unless
 * something fails when they do.
 *
 * Also asserts the race period starts on its epoch rather than the calendar
 * Monday: "the step race should start today if we're posting it today why the
 * fuck would we do it monday."
 *
 * PROVE-RED (confirmed 2026-08-08): change any coin figure in RACE_PURSE without
 * changing STEP_RACE_PODIUM in server/src/index.js and PURSE fails naming the
 * place; set RACE_EPOCH to a Monday-derived key and START fails.
 *
 * Usage: node tests/race-audit.mjs
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { boot, seed, sleep } from './godmode.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const results = [];
const ok = (name, pass, detail = '') => { results.push({ name, pass }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`); };

const APP = readFileSync(path.join(ROOT, 'js/app.js'), 'utf8');
const SRV = readFileSync(path.join(ROOT, 'server/src/index.js'), 'utf8');

/* ---------- PURSE: the client poster and the server payer must agree ---------- */
const grab = (src, marker) => {
  const i = src.indexOf(marker);
  if (i < 0) return null;
  const open = src.indexOf('[', i), close = src.indexOf('];', open);
  return src.slice(open, close + 1);
};
const parsePlaces = block => [...(block || '').matchAll(/coins:\s*(\d+)[^}]*?(?:dust:\s*(\d+))?[^}]*?place:\s*'([^']+)'/g)]
  .map(m => ({ coins: +m[1], place: m[3] }));
const parseClient = block => [...(block || '').matchAll(/place:\s*'([^']+)',\s*coins:\s*(\d+)/g)]
  .map(m => ({ place: m[1], coins: +m[2] }));

const srvPlaces = parsePlaces(grab(SRV, 'STEP_RACE_PODIUM'));
const cliPlaces = parseClient(grab(APP, 'const RACE_PURSE'));
ok('PURSE both sides declare a purse at all (an empty parse is a FAILURE)',
  srvPlaces.length >= 5 && cliPlaces.length >= 5, `server ${srvPlaces.length}, client ${cliPlaces.length}`);
const mismatches = [];
for (let i = 0; i < Math.max(srvPlaces.length, cliPlaces.length); i++) {
  const a = srvPlaces[i], b = cliPlaces[i];
  if (!a || !b || a.coins !== b.coins || a.place !== b.place) {
    mismatches.push(`#${i + 1} server ${a ? a.place + '/' + a.coins : 'missing'} vs client ${b ? b.place + '/' + b.coins : 'missing'}`);
  }
}
ok('PURSE the popup quotes exactly what the server pays', mismatches.length === 0,
  mismatches.length ? '\n      ' + mismatches.join('\n      ') : `${srvPlaces.length} places agree`);
ok('PURSE places pay in descending order', srvPlaces.every((p, i) => i === 0 || p.coins < srvPlaces[i - 1].coins),
  srvPlaces.map(p => p.coins).join(' > '));

/* ---------- START: the race begins on its epoch, not a calendar Monday ---------- */
let srv = null;
let base = process.env.URL;
if (!base) {
  srv = spawn('python3', ['-m', 'http.server', '8157', '--bind', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
  await sleep(900);
  base = 'http://127.0.0.1:8157/';
}
const { browser, page } = await boot(base, {
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
await page.setViewport({ width: 393, height: 852, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await seed(page, { level: 14 });

const epoch = (APP.match(/RACE_EPOCH = '([\d-]+)'/) || [])[1];
ok('START the race declares an epoch', !!epoch, String(epoch));

const periods = await page.evaluate(async ep => {
  const w = window.__raceWeek;
  if (!w) return null;
  const day = n => {
    const d = new Date(Date.parse(ep + 'T00:00:00') + n * 86400000);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  return { d0: w(day(0)), d3: w(day(3)), d6: w(day(6)), d7: w(day(7)), d8: w(day(8)), epoch: ep, day7: day(7) };
}, epoch);

ok('START the hook exists so this can be measured at all', !!periods, JSON.stringify(periods));
if (periods) {
  ok('START day one of the race IS the epoch, not the Monday before it',
    periods.d0 === epoch, `${periods.d0} vs epoch ${epoch}`);
  ok('START the whole first week belongs to period one',
    periods.d3 === epoch && periods.d6 === epoch, `d3=${periods.d3} d6=${periods.d6}`);
  ok('START day 8 rolls into the next race', periods.d7 === periods.day7 && periods.d8 === periods.day7,
    `d7=${periods.d7} d8=${periods.d8}`);
}

/* ---------- ANNOUNCE: the poster renders, and quotes the shipped purse ---------- */
const poster = await page.evaluate(async () => {
  if (!window.__raceIntro) return null;
  await window.__raceIntro();
  await new Promise(r => setTimeout(r, 600));
  const v = document.querySelector('.race-veil');
  if (!v) return { open: false };
  return {
    open: true,
    eyebrow: v.querySelector('.drop-eyebrow')?.textContent.trim(),
    title: (v.querySelector('.drop-title')?.textContent || '').replace(/\s+/g, ' ').trim(),
    terms: [...v.querySelectorAll('.spire-terms li')].map(l => l.textContent.replace(/\s+/g, ' ').trim()),
    artLayers: v.querySelectorAll('.race-intro-art img').length,
    cta: v.querySelector('.drop-cta')?.textContent.trim(),
  };
});
ok('ANNOUNCE the poster opens', poster && poster.open, JSON.stringify(poster && poster.title));
if (poster && poster.open) {
  ok('ANNOUNCE it draws the player\'s own bonehead (an empty stage is a FAILURE)', poster.artLayers > 0, `${poster.artLayers} layers`);
  ok('ANNOUNCE it says the race starts today, not on a Monday',
    /today/i.test(poster.eyebrow || '') && poster.terms.some(t => /from today/i.test(t)),
    `${poster.eyebrow} | ${poster.terms[0]}`);
  const first = cliPlaces[0];
  ok('ANNOUNCE it quotes the SHIPPED first prize, not a hard-coded one',
    poster.terms.some(t => t.includes(first.coins.toLocaleString())),
    `looking for ${first.coins.toLocaleString()} in: ${poster.terms.join(' / ').slice(0, 160)}`);
  ok('ANNOUNCE it says everyone gets paid down to fifth',
    poster.terms.some(t => new RegExp(`top ${cliPlaces.length}`, 'i').test(t)), poster.terms.join(' / ').slice(0, 160));
}

/* ---------- the card renders as the approved mockup, not the old list ---------- */
ok('CARD it is the collapsed banner, not a flat list', /race-banner/.test(APP) && !/race-rows/.test(APP),
  'details banner present, old .race-rows gone');
ok('CARD each racer runs their own bonehead', /class="run" style="left:\$\{pct\}%"[\s\S]{0,80}avatarLayersHtml/.test(APP),
  'avatar in the lane marker');

await browser.close();
if (srv) srv.kill();
const failed = results.filter(r => !r.pass).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
if (!results.length) { console.log('FAIL: no checks ran'); process.exit(1); }
process.exit(failed ? 1 : 0);
