/* EVERY MODULE THE APP IMPORTS MUST BE PRECACHED, OR ONE BAD BAR KILLS THE APP.
 *
 * 2026-08-12: a TestFlight user opened the app for the first time on one bar of
 * LTE and got a blank screen he could not get past. The gear button and the tab
 * bar were there; nothing else was. Cause: app.js reaches 41 modules and sw.js
 * precached 38. haptics.js, bosses.js and wraith-fx.js were STATIC imports, so
 * one of them failing to arrive killed the whole module graph and left only
 * index.html's static shell painted.
 *
 * It persists rather than recovering, which is why it reads as "stuck": the SW
 * answers a js request that misses network AND cache with index.html, and a
 * module served text/html is a hard error.
 *
 * This walks the real import graph from js/app.js and diffs it against the real
 * PRECACHE list, so the next module added cannot be quietly forgotten. It is
 * pure Node, no browser, milliseconds, and it belongs in the FAST tier for that
 * reason: this failure costs a player the entire app on first impression.
 *
 * PROVE-RED: delete any module line from sw.js PRECACHE and this names it.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const results = [];
const ok = (n, p, d = '') => { results.push(p); console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${d ? '  ' + d : ''}`); };

const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
/* Read the PRECACHE array itself, not the whole file: a module named only in a
   comment must not count as protected. That is the same "a mention is not
   evidence" rule the selector sweep learned the hard way. */
const arr = sw.slice(sw.indexOf('PRECACHE'), sw.indexOf('];', sw.indexOf('PRECACHE')));
const precached = new Set([...arr.matchAll(/['"]\.\/([\w./-]+\.js)['"]/g)].map(m => m[1]));

/* The real graph, followed transitively from the entry point, because a module
   is just as fatal whether app.js imports it directly or two hops down.
   AND THE SPECIFIER IS RESOLVED AGAINST THE FILE THAT WROTE IT, not assumed to
   be a sibling in js/. It used to match only './x.js' and prepend 'js/', which
   silently discarded every '../data/*.js' app.js imports. app.js:90 imports
   HERO_EDGE from '../data/hero-edge.js' statically; it shipped in v455, was
   never precached, and this file stayed green through all of it while
   tests/offline-boot-audit.mjs went red on a cold offline boot with 0 chars on
   #screen (the SW answers a js miss with index.html, and a module served
   text/html is a hard load error). Two of the three data modules were in
   PRECACHE by hand, which is exactly how a hand-kept list rots.
   PROVE-RED: delete './data/hero-edge.js' from sw.js PRECACHE and this names
   it; it did not before this change. */
const reached = new Set();
const walk = rel => {
  if (reached.has(rel)) return;
  reached.add(rel);
  const full = path.join(ROOT, rel);
  if (!fs.existsSync(full)) return;
  const src = fs.readFileSync(full, 'utf8');
  for (const m of src.matchAll(/(?:^|\n)\s*(?:import|export)[^'"]*['"](\.\.?\/[\w./-]+\.js)['"]/g))
    walk(path.posix.normalize(path.posix.join(path.posix.dirname(rel), m[1])));
};
walk('js/app.js');

ok('SETUP the import graph was actually walked (an empty graph would pass everything)', reached.size > 20, `${reached.size} modules reached from js/app.js`);
ok('SETUP the PRECACHE list was actually parsed', precached.size > 20, `${precached.size} js entries in PRECACHE`);

const missing = [...reached].filter(m => !precached.has(m) && fs.existsSync(path.join(ROOT, m))).sort();
ok('every module the app imports is precached', missing.length === 0,
  missing.length ? `MISSING: ${missing.join(', ')} (one failed fetch of any of these = a blank app)` : `all ${reached.size} covered`);

/* AND EVERY PIXEL ICON THE APP CAN ASK FOR. Added 2026-08-20, when a 17-file
   icon batch went in believing this file already covered the art. It did not:
   it only ever read the `js/*.js` entries out of PRECACHE, so a drawing that
   was wired up and never precached is a BLANK ICON on a bad connection, and
   nothing went red. PIX_CUR is the authority on what pixCur can build a path
   to, so derive from it rather than hand-listing.
   PROVE-RED: delete any './assets/icons-pix/*.png' line from sw.js PRECACHE and
   this names it. */
const pix = fs.readFileSync(path.join(ROOT, 'js/icons-pix.js'), 'utf8');
const pixArt = [...(pix.match(/const PIX_CUR = \{([\s\S]*?)\};/) || [, ''])[1]
  .matchAll(/:\s*'([^']+)'/g)].map(m => `assets/icons-pix/${m[1]}.png`);
/* crateIcon is the OTHER pixel drawer and it builds its own paths, including a
   `-24` variant for the 24..47 step. The map spawn markers started asking 24 on
   2026-08-20, so those files went live in the same session; covering only
   PIX_CUR would have left half the class unguarded. */
const app = fs.readFileSync(path.join(ROOT, 'js/app.js'), 'utf8');
for (const m of (app.match(/const CRATE_ICON_PIX = \{([\s\S]*?)\};/) || [, ''])[1].matchAll(/:\s*'([^']+)'/g)) {
  pixArt.push(`assets/${m[1]}.png`, `assets/${m[1]}-24.png`);
}
const precachedArt = new Set([...arr.matchAll(/['"]\.\/(assets\/[\w./-]+)['"]/g)].map(m => m[1]));
ok('SETUP the pixel-art table was actually parsed', pixArt.length > 20, `${pixArt.length} paths pixCur can build`);
const artMissing = [...new Set(pixArt)].filter(a => !precachedArt.has(a)).sort();
ok('every pixel icon pixCur can serve is precached', artMissing.length === 0,
  artMissing.length ? `MISSING: ${artMissing.join(', ')} (a blank icon on one bar of LTE)` : `all ${new Set(pixArt).size} covered`);

/* The reverse direction is a much smaller problem (a stale entry wastes a
   fetch) but a listed-but-absent path BRICKS the install for everyone, which
   is a documented rule in this repo, so it is worth the two lines. */
const ghosts = [...precached].filter(m => !fs.existsSync(path.join(ROOT, m))).sort();
ok('no precached path points at a file that does not exist', ghosts.length === 0,
  ghosts.length ? `GHOSTS: ${ghosts.join(', ')} (a listed-but-absent path fails the whole install)` : 'none');

const failed = results.filter(r => !r).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
