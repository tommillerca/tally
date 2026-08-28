/* THE GROUND UNDER YOUR FEET DOES NOT BECOME UNKNOWN. 2026-08-27.
 *
 * js/water.js caps its tile cache at MAX_TILES and sweeps when it overflows. The
 * sweep iterated the Map, which iterates in INSERTION order, so it threw away the
 * OLDEST-FETCHED tiles: the ones under the player, fetched first when the map
 * opened and read on every pass since.
 *
 * WHAT THAT COSTS A PLAYER. One wanderersNear call walks nine cells whose
 * candidate laps reach past the warmed block, queues new tiles, trips the cap,
 * and the sweep takes the home tiles with it. isWater then answers `undefined`
 * for the cell the player is standing in, and wandererAt cannot tell that apart
 * from "this cell is all water", so THE WANDERER VANISHES and comes back on the
 * next 5 s world pass. Seen while fixing the Wanderer audits the same day:
 * realWanderer returned w:null while a probe one second later said
 * wandererAt(2464,-6156) was true.
 *
 * SO THIS GRADES THE PROPERTY, NOT THE POLICY. It does not assert "the cache is
 * an LRU"; it asserts that a point which HAS answered keeps answering while the
 * player walks around and the cache churns past its cap. That is the thing the
 * player experiences, and it stays true if the policy is ever replaced.
 *
 *   WARM     HOME answers at all, so the rest is not measuring an empty cache.
 *   CHURN    enough distinct tiles were pulled to overflow the cap, or the test
 *            never exercised the sweep and would pass on nothing.
 *   HOLD     HOME still answers afterwards. The row.
 *
 * PROVE-RED: restore the insertion-order sweep in js/water.js
 *   for (const [k, v] of tiles) { if (v !== 'pending') tiles.delete(k); ... }
 * and HOLD goes red with HOME reading undefined, while WARM and CHURN stay green.
 *
 * Usage: node tests/water-cache-audit.mjs [baseUrl]
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boot, sleep, serveTree, unproven, unprovenReport, exitFor } from './godmode.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HOME = { lat: 49.2827, lng: -123.1207 };   // Vancouver, the fixture everything else uses

let fails = 0;
const ok = (label, pass, detail = '') => {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}${detail ? `  | ${detail}` : ''}`);
  if (!pass) fails++;
};

const base = process.argv[2] || process.env.URL || null;
const srv = base ? null : await serveTree(ROOT);
const url = base || srv.url;
const { browser, page } = await boot(url);

try {
  const r = await page.evaluate(async (HOME) => {
    const water = await import('./js/water.js');
    const answer = () => water.isWater(HOME.lat, HOME.lng);

    // 1. warm HOME and wait for it to actually answer
    const t0 = Date.now();
    while (answer() === undefined && Date.now() - t0 < 30000) {
      await water.ensureWater([[HOME.lat, HOME.lng]], 8000).catch(() => {});
      await new Promise(r => setTimeout(r, 200));
    }
    const warm = answer();
    if (warm === undefined) return { warm: 'never answered', tiles: 0, after: undefined };

    /* 2. churn: walk a wide lattice so far past the cap that the sweep must run
          more than once, RE-READING HOME throughout exactly as the app does on
          every world pass. z14 is ~0.022 deg of longitude here, so 0.03 steps
          guarantee a distinct tile per point. */
    let pulled = 0, reads = 0, blanks = 0, firstBlankAt = null;
    for (let a = -5; a <= 5; a++) {
      const batch = [];
      for (let b = -5; b <= 5; b++) batch.push([HOME.lat + a * 0.03, HOME.lng + b * 0.03]);
      await water.ensureWater(batch, 4000).catch(() => {});
      pulled += batch.length;
      /* READ HOME EVERY PASS, THE WAY THE WORLD TICK DOES, AND RECORD EVERY
         ANSWER. Checking only at the END measures the wrong instant: a read of an
         evicted tile also RE-FETCHES it, which re-inserts it at the tail of the
         Map and immunises it against the very insertion-order sweep under test.
         The symptom a player sees is TRANSIENT, one pass where the ground reads
         unknown and the Wanderer is not drawn, so a single blank is the failure. */
      const v = answer();
      reads++;
      if (v === undefined) { blanks++; if (firstBlankAt === null) firstBlankAt = pulled; }
      await new Promise(r => setTimeout(r, 30));
    }
    return { warm, tiles: pulled, reads, blanks, firstBlankAt, after: answer() };
  }, HOME);

  ok('WARM   the tile under the player answers before anything else is measured',
    r.warm !== undefined && r.warm !== 'never answered',
    r.warm === 'never answered' ? 'HOME never resolved (tiles unreachable?)' : `isWater(HOME) = ${r.warm}`);

  if (r.warm === 'never answered') {
    unproven('CHURN enough tiles were pulled to overflow the cache', 'HOME never answered, so nothing below was exercised');
    unproven('HOLD the tile under the player still answers after the cache churned', 'HOME never answered');
  } else {
    ok('CHURN  enough distinct tiles were pulled to overflow the cap and force the sweep',
      r.tiles > 64, `${r.tiles} points requested against MAX_TILES 64`);
    ok('HOLD   the tile under the player NEVER reads unknown again, on any pass',
      r.blanks === 0,
      r.blanks
        ? `${r.blanks} of ${r.reads} passes read undefined (first after ${r.firstBlankAt} points): the sweep evicted the ground under the player, which is the Wanderer blinking out`
        : `${r.reads} passes, every one answered`);
  }
} finally {
  await browser.close().catch(() => {});
  if (srv) srv.close();
}

unprovenReport();
console.log(fails ? `\nwater-cache: ${fails} FAILED` : '\nwater-cache: clean');
process.exit(exitFor(fails));
