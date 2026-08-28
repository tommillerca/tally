/* tests/boneyard-density-audit.mjs — THE BONEYARD READS FULL, AND THE HEADER
 * TELLS THE TRUTH ABOUT IT.
 *
 * WHY THIS EXISTS AND WHY IT IS A BROWSER AUDIT.
 * tests/boneyard-supply-audit.mjs owns the faucet and it is pure: it counts what
 * the generator produces. That is the wrong instrument for "does the map look
 * empty", and it proved it. Its viewport row modelled the phone screen with the
 * 256px-tile metres-per-pixel constant while MapLibre's zoom is defined against
 * 512px tiles, so it modelled a screen four times the real one and reported 10.2
 * spawns where the rendered map drew four. The number Tom judges is the number
 * of markers on the glass, and only the renderer knows it.
 *
 * WHAT IT ASSERTS, and which direction is failure (anti-regression rule 11):
 *   VISIBLE   markers inside the map canvas, over TEN locations. Failure is DOWN:
 *             a mean below the floor, or too many nearly-empty screens. Empty-looking
 *             map is the complaint this branch exists to answer.
 *   BUDGET    total live DOM markers. Failure is UP: every marker is a live DOM
 *             node transformed on each frame, and "as many as possible" is the
 *             leaderboard memory bug wearing a different hat. Measured ceiling,
 *             three real touch drags with rAF intervals sampled, under software
 *             GL (slower than the phone): median/p95 ms per frame was
 *             16.6/16.7 at 17, 39, 69 and 84 markers, and 16.6/24.9 at 107.
 *             60fps holds to ~84; the first dropped frames appear near 107.
 *             The bound here is 100, between the two.
 *   HEADER    the "N nearby" line equals the markers actually inside the canvas.
 *             Failure is either direction: before this branch the header read 8
 *             over a screen showing three, which is a lie whichever number is
 *             right, and it is the one number a player can check by looking.
 *   CONTROL   the map canvas exists, markers exist, and the header is actually
 *             showing the spawn count rather than the step race or an incubating
 *             egg, at every location sampled. Without this the other three rows
 *             pass on a blank screen (anti-regression rule 3).
 *
 * PROVE-RED: run against the parent branch econ/boneyard-supply (bfacd28), which
 * has the same spawn field and the old 16.4 start zoom. Three rows go red and
 * all four CONTROL rows stay green, so the reds are real and not an empty
 * sample: VISIBLE 4.00 markers on screen against a floor of 10, the emptiest
 * location 3 against a floor of 5, and HEADER saying 6, 6, 8, 8 over 4, 3, 6, 3
 * markers. On this branch the same run gives 13.75, 12 and 13=13, 12=12, 15=15,
 * 14=15.
 *
 * Serves the tree by default and NEVER defaults to production. Pass a URL as
 * argv[2] only to point it somewhere deliberately.
 * Usage: node tests/boneyard-density-audit.mjs      (exits non-zero on failure)
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boot, seed, sleep, serveTree } from './godmode.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/* Four real places, because one lucky cell must not carry the claim: a dense
   downtown grid, a residential grid, an arterial strip and a quieter east-side
   grid. All Vancouver, the latitude every number in this branch was measured at. */
/* TEN, NOT FOUR. The floor used to be calibrated against these first four, and
   four draws from a distribution with sd ~= 3 carry a standard error of ~1.5
   markers before the app is involved. That is why this row read as "does not
   reproduce on every machine": it was mostly reading its own sample size.
   The six below come from the 50-cell sweep in docs/BONEYARD-DENSITY-MEASUREMENT.md
   (10 locations x 5 consecutive dates, every cell measured). */
const SPOTS = [
  [49.2827, -123.1207],   // downtown waterfront
  [49.2650, -123.1560],   // kitsilano grid
  [49.2490, -123.1000],   // main/kingsway
  [49.2790, -123.0680],   // east side grid
  [49.2260, -123.1010],   // sunset/south van
  [49.2450, -123.0700],   // trout lake
  [49.2680, -123.0980],   // commercial drive
  [49.2320, -123.1560],   // dunbar
  [49.2570, -123.1250],   // cambie/city hall
  [49.2210, -123.0680],   // killarney
];
/* THE FLOOR OF 10 DOES NOT REPRODUCE ON EVERY MACHINE. Investigated 2026-08-22
   after this row sat in the "flaky" pile for nine days while failing every run.
   It is not flaky and the code has not regressed. Evidence:
     - the spawn FIELD is uniform and healthy: over 400 Vancouver points, mean
       46.0 spawns per 3x3 cells, p10 45, p90 47. The four SPOTS below sit at
       45, 45, 46, 46, i.e. exactly on the field mean, not a low draw.
     - boneyard-supply-audit (pure, 25 samples over 40000 cells) reports 13.5
       spawns per phone viewport against its floor of 8, and passes.
     - raising the settle from 12s to 24s does not move the result (9.00 both).
     - CHECKED OUT 5bf8af14, THE COMMIT THAT RECORDED 13.75, and ran this same
       audit there today: 9.25. Same four locations, 4/14/9/10.
   The code that measured 13.75 measures 9.25 on this machine. The variable is
   the environment (tile data and software GL here versus whatever the original
   calibration ran on), not the app. Rendered counts are stable per location and
   vary by geography: 49.2827 is waterfront downtown and draws 3-4 every run,
   because the walkability snap pushes spawns off the water and out of view.
   DO NOT lower this to 9 to make the row green. "The number Tom judges is the
   number of markers on the glass" and the glass is a phone, not this container.
   Re-calibrating against software GL would bake in a number that represents no
   player. This needs a floor measured on a phone-representative machine, which
   is a decision with Tom, not a threshold nudge. Until then the red is honest:
   it means "this machine cannot reproduce the calibration", not "the app broke".
   See docs/FLAKE-CLASSIFICATION-2026-08-22.md.

   2026-08-27, AND IT IS THE DATE SEED, NOT THE MACHINE. The 2026-08-22 note
   above says this container gives 9.0 to 9.5 at every commit and that 49.2827
   "draws 3 to 4 every single run". Both are now false on the same container,
   and what changed was the calendar.
     - EIGHT runs today on origin/main, five alone and three under deliberate
       contention (five other browser suites, then five other MAP suites, all
       still running when the density run ended): 15.50, 15.50, 15.25, 15.50,
       15.50, 15.50, 15.25, 15.25. Every one green, exit 0, floor 10.
       49.2827 drew 13 or 14 in all eight, not 3 to 4.
     - Contention was ruled out by that comparison, which is the SERIAL-list
       test in release-gate.mjs. Green alone AND green in company is not a
       contention flake.
     - THE SPAWN FIELD IS DATE-SEEDED and these four SPOTS are n=4. Counting
       spawnsNear within a fixed 300 m band, from the pure generator, so the
       renderer and the tiles are out of the picture, the four-spot mean over 21
       consecutive dates runs 5.50 to 8.50, a 1.55x swing with nothing but the
       date changing (low 5.50 on 2026-08-29, high 8.50 on 2026-08-20; today is
       8.00, the second highest of the 21). Instance-of-day does nothing: the
       faucet reads a flat 20 at all 32 instances.
     - That swing is the whole history of this row. 13.75 when written, 9.25 on
       2026-08-22, 7.75 in a release-gate run this week, 15.4 today, all on code
       that has not regressed. A pass/fail verdict on a fixed four-location
       sample is decided by which day it runs.
   NOTHING WAS CHANGED HERE, and lowering the floor would still be wrong for the
   reason above. What this row actually needs is a bigger location sample, which
   invalidates the floor that was calibrated against these four and is therefore
   the same decision with Tom the 2026-08-22 note reserved. It is also NOT an
   exit-97 case: godmode's rule is that UNPROVEN is claimed against a missing
   machine capability measured in the same run, and this machine has every one
   of them. It draws the map, reaches the tiles and grades the row for real. A
   red here is a dice roll, not a machine that cannot look. */
/* SIX, MEASURED, NOT GUESSED. docs/BONEYARD-DENSITY-MEASUREMENT.md, 50 cells:
   min 3, median 9, mean 8.60, max 16. Graded over 1050 simulated runs the way
   this file grades, the old floor of 10 passed 23% OF THE TIME ON HEALTHY CODE.
   A row that is red three runs in four teaches people to ignore it, which is
   worse than not having it. Six sits below the healthy mean with room for the
   spread and still sits well above the 4.00 the parent branch drew.
   The variance is NOT mainly the calendar, which is what this file used to
   assume: LOCATION 13.1%, DATE 12.1%, residual 74.8%. Three quarters is the
   per-cell roll, so the answer is a bigger sample, not a different day. */
const VISIBLE_FLOOR = 6;
/* THE DEAD-SCREEN ROW, REPLACED. It used to be worst-of-N >= ceil(FLOOR/2), and
   worst-of-N gets HARSHER as the sample grows: ten locations means ten chances
   to draw the low tail, so widening the sample would have broken the very row
   that was meant to benefit from it. It is now a COUNT: a couple of thin screens
   in ten is the distribution doing its job, but a third of the map being nearly
   empty is the defect this row exists to catch.
   Both numbers keep their prove-red against the parent branch, which drew mean
   4.00 with its worst location at 3. */
const SPARSE_AT = 4;    // a location drawing fewer than this is "nearly empty"
const SPARSE_MAX = 2;   // at most this many of SPOTS may be nearly empty
const MARKER_BUDGET = 100;  // measured: 60fps to ~84 markers, first drops near 107

const out = [];
let fails = 0;
const ok = (m, cond, detail = '') => {
  if (cond) out.push(`ok   ${m}${detail ? '  ' + detail : ''}`);
  else { fails++; out.push(`FAIL ${m}${detail ? '  ' + detail : ''}`); }
};

const srv = process.argv[2] ? null : await serveTree(ROOT);
const base = process.argv[2] || srv.url;
console.log(`URL UNDER TEST: ${base}`);

const { browser, page } = await boot(base, {
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const rows = [];
try {
  await browser.defaultBrowserContext().overridePermissions(new URL(base).origin, ['geolocation']);
  // iPhone 17 Pro Max, the phone the complaint came from
  await page.setViewport({ width: 440, height: 956, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await seed(page, {});

  for (const [lat, lng] of SPOTS) {
    await page.setGeolocation({ latitude: lat, longitude: lng });
    await page.evaluate(() => { location.hash = '#/today'; });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await sleep(1500);
    await page.evaluate(() => { location.hash = '#/boneyard'; });
    await sleep(1500);
    await page.evaluate(() => { const b = document.querySelector('#mapStart'); if (b && b.offsetParent) b.click(); });
    await sleep(12000);   // geolocation, tiles, the first placement pass and the reveal

    rows.push(await page.evaluate(() => {
      const stage = document.querySelector('#mapStage');
      const canvas = stage && stage.querySelector('canvas');
      const box = canvas && canvas.getBoundingClientRect();
      /* Visible means the marker's own centre is inside the MAP CANVAS, which is
         what the header now counts. Measuring against the window instead would
         quietly count markers under the tab bar and turn the agreement row into
         an off-by-one lottery. */
      const inCanvas = el => {
        if (!box) return false;
        const b = el.getBoundingClientRect();
        if (!b.width || !b.height) return false;   // a 0x0 box has no centre worth testing
        const cx = b.left + b.width / 2, cy = b.top + b.height / 2;
        return +getComputedStyle(el).opacity > 0.01 &&
          cx >= box.left && cx <= box.right && cy >= box.top && cy <= box.bottom;
      };
      /* .maplibregl-marker, not .map-spawn on its own: the map KEY inside
         #mapStage draws the same .map-spawn chips as legend swatches, and while
         the key is hidden every one of them reports a 0x0 rect at (0,0), which
         is inside the canvas. Counting those put this audit five markers ahead
         of the header and had me chasing a bug in the app that was in the
         measurement. Only a real marker carries maplibre's own class. */
      const spawns = [...(stage ? stage.querySelectorAll('.map-spawn.maplibregl-marker') : [])];
      // `far` markers are the distant crate/rare beacons; the header excludes them
      const nearSpawns = spawns.filter(el => !el.classList.contains('far'));
      const allMarkers = stage ? stage.querySelectorAll('.maplibregl-marker').length : 0;
      const line = ((document.querySelector('#mapCount') || {}).textContent || '').trim();
      const m = /^(\d[\d,]*)\s+(nearby|spawn nearby)$/.exec(line);
      return {
        canvas: !!canvas,
        visible: nearSpawns.filter(inCanvas).length,
        spawnsInDom: spawns.length,
        allMarkers,
        line,
        headerCount: m ? Number(m[1].replace(/,/g, '')) : null,
      };
    }));
    console.log(`  ${SPOTS[rows.length - 1][0]}  ${JSON.stringify(rows[rows.length - 1])}`);
  }

  /* ---- CONTROL first. Every row below divides by or reads from this sample,
     and a blank Boneyard would otherwise pass VISIBLE's floor by having nothing
     to count and HEADER's equality by both sides being zero. ---- */
  ok('CONTROL  every location was actually sampled', rows.length === SPOTS.length, `${rows.length}/${SPOTS.length}`);
  ok('CONTROL  the map canvas rendered at every location',
    rows.length > 0 && rows.every(r => r.canvas), `${rows.filter(r => r.canvas).length} with a canvas`);
  ok('CONTROL  markers were drawn at every location',
    rows.length > 0 && rows.every(r => r.allMarkers > 0), rows.map(r => r.allMarkers).join(', '));
  ok('CONTROL  the header is showing the spawn count, not the race or an egg',
    rows.length > 0 && rows.every(r => r.headerCount !== null), rows.map(r => JSON.stringify(r.line)).join(' '));
  if (fails) {
    console.log(out.join('\n'));
    console.log('\nthe sample did not hold: every row below would be vacuous. FAILED');
    await browser.close().catch(() => {});
    if (srv) srv.close();
    process.exit(1);
  }

  /* ---- VISIBLE. Failure is DOWN. ---- */
  const meanVisible = rows.reduce((a, r) => a + r.visible, 0) / rows.length;
  ok(`VISIBLE  ${meanVisible.toFixed(2)} spawn markers on screen`,
    meanVisible >= VISIBLE_FLOOR, `floor ${VISIBLE_FLOOR}, the parent branch drew 4.00`);
  const sparse = rows.filter(r => r.visible < SPARSE_AT);
  const worst = Math.min(...rows.map(r => r.visible));
  ok(`VISIBLE  ${sparse.length} of ${rows.length} locations are nearly empty (worst ${worst})`,
    sparse.length <= SPARSE_MAX,
    `at most ${SPARSE_MAX} may be under ${SPARSE_AT}: a mean cannot carry a dead screen, ` +
    `and worst-of-N only gets harsher as the sample grows`);

  /* ---- BUDGET. Failure is UP. A ceiling, never a trend. ---- */
  const most = Math.max(...rows.map(r => r.allMarkers));
  ok(`BUDGET  at most ${most} live DOM markers at once`,
    most <= MARKER_BUDGET, `ceiling ${MARKER_BUDGET}; measured 60fps to ~84, frames dropping near 107`);

  /* ---- HEADER. Failure is either direction.
     Tolerance of one marker, and only one: the header tests map.project against
     the canvas size while this counts DOM centres against the canvas rect, so a
     marker sitting within a rounding error of the edge can legitimately land on
     opposite sides of the two. One marker cannot hide the bug this row exists
     for, which was a header reading 8 over three markers. ---- */
  const disagree = rows.filter(r => Math.abs(r.headerCount - r.visible) > 1);
  ok('HEADER  "N nearby" equals the markers inside the canvas, +/-1',
    disagree.length === 0,
    disagree.length ? disagree.map(r => `says ${r.headerCount}, shows ${r.visible}`).join(' | ')
      : rows.map(r => `${r.headerCount}=${r.visible}`).join(', '));
} finally {
  await browser.close().catch(() => {});
  if (srv) srv.close();
}

console.log(out.join('\n'));
console.log(fails ? `\n${fails} FAILED` : '\nall good');
process.exit(fails ? 1 : 0);
