/* A BEATEN WANDERER IS GONE FROM THE BONEYARD, AND THE NEXT ONE STILL WALKS.
 *
 * Tom, 2026-08-22: "after defeating the wanderer he was still just there in the
 * boneyard and didnt disappear."
 *
 * He was. `wandererDone` (the xp ledger, rebuilt on every refreshWorld) only
 * ever gated the ENCOUNTER, never the marker, so the man you had just killed
 * kept walking his loop with his lantern lit and could not be fought. The fix is
 * one filter where the markers are built. This suite is the half of it that
 * cannot be argued: a REAL fight, won through the real engine, and then the map
 * measured.
 *
 * THE TWO HALVES ARE ONE BUG. "He disappears" is also what a marker that never
 * drew looks like, and "he comes back" is also what a ledger that forgot the win
 * looks like, so neither half is worth anything alone:
 *   BEFORE   his own marker, by id, is on the map. The positive control, and
 *            every row below is gated on it.
 *   DESPAWN  the fight is won for real (window.__bhFight.finish, the game's own
 *            engine, not a dispatched event) and his marker is gone WHILE the
 *            module still derives his instance as live, so an instance that
 *            merely rolled over cannot pass for a despawn.
 *   LEDGER   the win is on his instance key, which is what the map reads.
 *   NEIGHBOURS the Wanderer nobody beat is still drawn. A filter that cleared
 *            the map would pass DESPAWN and be a worse bug than this one.
 *   NEXT     the clock is moved on one WANDER_LAP_MIN and the page reloaded. The
 *            ledger still holds the beaten key, a new instance is drawn, and its
 *            key is unclaimed.
 *
 * NEEDS A MAP. MapLibre needs WebGL and vector tiles; on a machine with neither,
 * every row here would be graded against a blank screen and pass on nothing, so
 * it measures the capability first and reports UNPROVEN with exit 97 rather than
 * green, the same contract tests/wanderer-patrol-live-audit.mjs runs under.
 *
 * PROVE-RED, 2026-08-22. Throwaway tree from `git archive HEAD`, exit read from a
 * FILE: refreshWanderer's filter deleted, back to `wanderersNear(date, lat, lng)`
 * -> exit 1, and exactly one row red:
 *   DESPAWN  "2 marker(s) drawn [2464_-6156_i25, 2464_-6155_i25], and he is
 *            still a live instance at 416m"
 * against the fixed tree's "1 marker(s) drawn [2464_-6155_i25]". BEFORE, LEDGER,
 * NEIGHBOURS and NEXT stayed green through the mutation, so the red is about the
 * marker and nothing else. That two-marker line IS Tom's report.
 *
 *   node tests/wanderer-despawn-audit.mjs
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boot, seed, sleep, serveTree, boneyardCapability, unproven, unprovenReport, exitFor, dismissOverlays } from './godmode.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const srv = process.env.URL ? null : await serveTree(ROOT);
const base = process.env.URL || srv.url;
console.log(`URL UNDER TEST  ${base}`);
let fails = 0;
const ok = (n, p, d = '') => { console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${d ? '  | ' + d : ''}`); if (!p) fails = 1; };

const GL = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const HOME = { latitude: 49.2827, longitude: -123.1207 };

/* WHICH WANDERERS ARE DERIVED RIGHT NOW, WHICH ONES ARE DRAWN, AND WHAT THE
   LEDGER SAYS. Read together in one page evaluation so the three cannot be about
   different moments: he moves continuously and his instance rolls over on a
   45-minute clock, so the set has to be re-derived at the instant the markers
   are counted.
   The markers are matched BY ID rather than by distance to a projected point.
   The first cut of this suite did project, could not reach the map object, got
   null back for every distance and passed "no marker near him" on nothing at
   all, which is this repo's oldest wound (tally/CLAUDE.md rule 3). */
const look = page => page.evaluate(async (HOME) => {
  const W = await import('./js/wanderer.js');
  const { dateKey } = await import('./js/nutrition.js');
  const db = await import('./js/db.js');
  const date = dateKey();
  const drawn = [...document.querySelectorAll('.map-wanderer-mark')].map(n => ({
    id: n.dataset.w || null,
    visible: +getComputedStyle(n).opacity > 0.5 && n.getBoundingClientRect().width > 10,
  }));
  const near = W.wanderersNear(date, HOME.latitude, HOME.longitude)
    .map(w => ({ id: w.id, key: W.wandererKey(date, w), cell: `${w.cx}_${w.cy}`, inst: w.inst, dist: Math.round(w.dist) }));
  return { date, drawn, near,
    ledger: (await db.db.all('xp')).filter(r => r.type === 'wanderer').map(r => r.key),
    arena: !!document.getElementById('arena'), enc: !!document.querySelector('.wnd-enc') };
}, HOME);

async function openBoneyard(page) {
  await page.evaluate(() => { location.hash = '#/boneyard'; });
  await sleep(2500);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('#screen button')].find(x => /start|allow|enable|walk|open|let/i.test(x.textContent || ''));
    if (b) b.click();
  });
  await sleep(9000);
}

const { browser, page, errors: errs = [] } = await boot(base, { args: GL });
page.on('pageerror', e => errs.push(String(e)));
let cap = null;
try {
  const origin = new URL(base).origin;
  await browser.defaultBrowserContext().overridePermissions(origin, ['geolocation']);
  await page.setViewport({ width: 393, height: 852, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.setGeolocation(HOME);
  cap = await boneyardCapability(page);
  if (!cap.ok) {
    unproven('BEFORE his own marker is on the map before the fight', 'this machine cannot draw the Boneyard');
    unproven('DESPAWN he is gone from the map after the win', 'this machine cannot draw the Boneyard');
    unproven('LEDGER the win is recorded on his instance key', 'this machine cannot draw the Boneyard');
    unproven('NEXT the next instance walks again', 'this machine cannot draw the Boneyard');
  } else {
    await seed(page, { level: 18, coins: 500 });
    // stand 45 m into his light, computed off his REAL heading, so the encounter
    // fires from the player's position exactly as it does for a walker.
    const target = await page.evaluate(async (HOME) => {
      const W = await import('./js/wanderer.js');
      const { dateKey } = await import('./js/nutrition.js');
      const w = W.wanderersNear(dateKey(), HOME.latitude, HOME.longitude)[0];
      const R = 6371000, r = Math.PI / 180, dr = 45 / R;
      const f1 = w.lat * r, l1 = w.lng * r, b = w.heading * r;
      const f2 = Math.asin(Math.sin(f1) * Math.cos(dr) + Math.cos(f1) * Math.sin(dr) * Math.cos(b));
      const l2 = l1 + Math.atan2(Math.sin(b) * Math.sin(dr) * Math.cos(f1), Math.cos(dr) - Math.sin(f1) * Math.sin(f2));
      return { lat: f2 / r, lng: l2 / r, w: { id: w.id, heading: w.heading } };
    }, HOME);
    await page.setGeolocation({ latitude: target.lat, longitude: target.lng });
    await openBoneyard(page);

    const before = await look(page);
    const him = before.near.find(w => w.id === target.w.id) || before.near[0];
    ok('BEFORE his own marker is on the map before the fight (the positive control: every row below is gated on this)',
      !!him && before.drawn.some(m => m.id === him.id && m.visible),
      `${before.drawn.length} wanderer marker(s) drawn [${before.drawn.map(m => m.id).join(', ')}], his own id ${him && him.id}`);

    // take the encounter and win it through the real engine
    await sleep(1500);
    await page.evaluate(() => {
      const b = document.querySelector('.wnd-enc .wnd-fight');
      if (b) b.click();
    });
    await sleep(3500);
    const inArena = await page.evaluate(() => !!document.getElementById('arena') && !!window.__bhFight);
    if (!inArena) {
      ok('CONTROL the encounter really started a fight', false, 'no arena and no __bhFight after taking the encounter');
    } else {
      await page.evaluate(() => window.__bhFight.finish('p'));
      await sleep(2500);
      await dismissOverlays(page, 8);
      await sleep(6000);   // let refreshWorld's own tick run at least once

      const after = await look(page);
      /* STILL DERIVED, AND NO LONGER DRAWN. Both halves: if his instance had
         simply rolled over mid-run he would be undrawn for a reason that has
         nothing to do with the win, so the row refuses to grade unless the
         module still says this exact instance is out there. */
      const stillDerived = after.near.some(w => w.id === him.id);
      ok('DESPAWN the Wanderer you just beat is gone from the map',
        stillDerived && !after.drawn.some(m => m.id === him.id),
        stillDerived ? `${after.drawn.length} marker(s) drawn [${after.drawn.map(m => m.id).join(', ') || 'none'}], and he is still a live instance at ${him.dist}m`
          : 'his instance rolled over mid-run, so this row measured NOTHING');
      ok('LEDGER the win is recorded on his own instance key, which is what the map reads',
        after.ledger.includes(him.key), `ledger holds ${JSON.stringify(after.ledger)}, his key ${him.key}`);
      /* AND ONLY HIM. A filter that took every Wanderer off the map would pass
         DESPAWN and be a worse bug than the one being fixed. */
      const others = before.drawn.filter(m => m.id !== him.id).map(m => m.id);
      ok('NEIGHBOURS the Wanderers nobody beat are still drawn',
        others.length === 0 || others.every(id => after.drawn.some(m => m.id === id)),
        others.length ? `${others.join(', ')} still on the map` : 'no second Wanderer was near enough to grade this');

      /* THE OTHER DIRECTION. A marker that never comes back is the same screen as
         a marker that never drew, so the clock is moved one lap and the page
         reloaded: the ledger still holds the beaten key, the new instance's key
         is one nobody has claimed, and he has to be out there again. */
      await page.evaluateOnNewDocument(() => {
        const ND = Date, SHIFT = 45 * 60 * 1000;
        function D(...a) { return a.length ? new ND(...a) : new ND(ND.now() + SHIFT); }
        D.now = () => ND.now() + SHIFT; D.parse = ND.parse; D.UTC = ND.UTC; D.prototype = ND.prototype;
        window.Date = D;
      });
      await page.reload({ waitUntil: 'networkidle2' });
      await sleep(2600);
      await dismissOverlays(page);
      await openBoneyard(page);
      const next = await look(page);
      /* NOT "his cell, one instance on": every Wanderer's beat re-rolls at the
         turnover, so the man in his cell can easily be past WANDER_SHOW_M and
         out of the picture for reasons that have nothing to do with the ledger
         (measured: he was, and 2464_-6155 was the one in range). The claim that
         matters is the one the cap makes: a NEW instance is drawn, its key is
         unclaimed, the beaten instance is not on the map, and the ledger has NOT
         forgotten the win, which is what would make "he walks again" trivial. */
      const fresh = next.drawn.filter(m => m.id && m.id !== him.id);
      ok('NEXT the next instance walks again, on a key nobody has claimed, with the win still on the ledger',
        next.ledger.includes(him.key) && fresh.length > 0 && fresh.every(m => m.visible)
        /* The key is rebuilt from the marker's own id rather than looked up in
           `near`: the derived set is sampled at HOME while the markers were
           built at the player's real fix 45 m away, so a Wanderer sitting on the
           WANDER_SHOW_M boundary can be drawn and still be absent from this
           sample, which took the row red on a perfectly good map. wandererKey is
           `wanderer-<date>-<id>` and nothing else. */
        && fresh.every(m => !next.ledger.includes(`wanderer-${next.date}-${m.id}`))
        && !next.drawn.some(m => m.id === him.id),
        `${next.drawn.length} marker(s) drawn [${next.drawn.map(m => m.id).join(', ') || 'none'}] one lap on from ` +
        `the beaten ${him.id}; ledger still ${JSON.stringify(next.ledger)}`);
    }
  }
  ok('NO PAGE ERRORS', errs.length === 0, errs.slice(0, 2).join(' | '));
} finally {
  await browser.close();
  if (srv) await srv.close();
}
unprovenReport('wanderer-despawn-audit', cap);
console.log(fails ? '\nWANDERER DESPAWN AUDIT FAILED' : '\nWANDERER DESPAWN AUDIT VERIFIED');
process.exit(exitFor(fails));
