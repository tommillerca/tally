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
 * FOUR WAYS THIS SUITE GRADED NOTHING, ALL FIXED 2026-08-27, NONE OF THEM THE
 * APP. It came back UNPROVEN on one run and FAILED on the next two, on clean
 * main, with `CONTROL the encounter really started a fight | no arena and no
 * __bhFight after taking the encounter` -- a sentence that reads as a dead fight
 * engine on the single most important thing the Wanderer does.
 *
 *   1. THE LAND ORACLE WAS NOT PASSED. It asked wanderersNear(date, lat, lng);
 *      js/app.js asks wanderersNear(date, lat, lng, undefined, isWater). The
 *      land fallback (js/wanderer.js landCandidate) reseeds his beat CENTRE when
 *      candidate 0's lap crosses water, and the candidate index is NOT part of
 *      his id, so the oracle-free call returns the right id at the wrong place.
 *      Measured over 224 (date, instance) samples at HOME across 7 days:
 *        190 the 45 m point really was inside the real cone
 *         25 he had moved (331 m, 556 m, 599 m measured) and it was not
 *          2 the oracle-free id was not in the real set at all
 *          2 nobody in range once the constraint applies
 *          5 nobody in range at all, a real data state
 *      12% of instances stood the player outside a cone that does not exist,
 *      no encounter fired, and CONTROL blamed openFight. Now derived through
 *      godmode's realWanderer, which asks the app's question.
 *   2. `|| before.near[0]` MADE THE POSITIVE CONTROL LIE. On the run whose
 *      45-minute instance rolled over between the fix and the map it printed
 *      "2 wanderer marker(s) drawn [..._i18, ..._i18], his own id ..._i19", a
 *      man nobody had walked up to; and on a run where near[0] happened to be
 *      drawn it would have passed BEFORE and graded every row below against the
 *      WRONG Wanderer. Gone. A rolled instance measured nothing and is declared.
 *   3. THE CLICK WAS A SILENT NO-OP. `const b = ...; if (b) b.click()` after a
 *      flat sleep(1500). The sheet is opened by refreshWanderer on a 5 s world
 *      tick that cannot fire before js/water.js's tiles land, so on a slow fetch
 *      the suite clicked nothing and reported the fight engine broken. It now
 *      WAITS for the button and reports `opened` and `clicked` separately, so a
 *      trigger fault and an engine fault do not print the same sentence.
 *   4. `look()` DERIVED AT HOME while the markers were built at the player's
 *      real fix. Now derived where the player is standing.
 *   AND NEXT'S EMPTY SAMPLE IS GONE. The beat re-rolls at the turnover and can
 *   land past WANDER_SHOW_M of wherever the player was left standing (measured:
 *   the man in his own cell was 1666 m away one lap on), so 1 run in 3 declared
 *   NEXT unproven and exited 97. The fix now stands 400 m BEHIND the new
 *   instance: inside the 1200 m the map draws at, outside the 300 m cone, so
 *   the row grades every run. The claim is unchanged.
 *
 * PROVE-RED, 2026-08-27, after all of the above. Throwaway `cp -R` of the tree
 * with its .git removed, one mutation at a time, exit read from a FILE:
 *   js/app.js refreshWanderer's `.filter(w => !wandererDone.has(...))` deleted
 *     -> exit 1, DESPAWN alone red. (See the log at the foot of this header.)
 *   js/app.js `startWandererEncounter(w, rec.el)` deleted -> exit 1, CONTROL
 *     alone red, and it now names the right half: "cone entry never opened the
 *     encounter sheet in 20000ms".
 *
 *   node tests/wanderer-despawn-audit.mjs
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boot, seed, sleep, serveTree, boneyardCapability, unproven, unprovenReport, exitFor, dismissOverlays, realWanderer } from './godmode.js';

/* Thrown when the date's own Wanderer set puts nobody near HOME, so the run has
   nothing to grade. Caught below, after the four rows have been DECLARED, which
   keeps the suite out of the gate's failure count without letting it pass. */
class NoWanderer extends Error {}

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
/* AT THE PLAYER'S OWN FIX, AND THROUGH THE LAND ORACLE. Both were wrong and
   both are the same mistake: asking a different question from the one js/app.js
   asks and then grading the app's answer against it. The set was derived at
   HOME while the markers were built at the player's real fix (which is why NEXT
   grew a comment about a Wanderer "on the WANDER_SHOW_M boundary" being drawn
   and absent from the sample), and it was derived with no isWater, which moves
   him hundreds of metres under the same id. See realWanderer in godmode.js. */
const look = (page, at) => page.evaluate(async (at) => {
  const W = await import('./js/wanderer.js');
  const water = await import('./js/water.js');
  const { dateKey } = await import('./js/nutrition.js');
  const db = await import('./js/db.js');
  const date = dateKey();
  const drawn = [...document.querySelectorAll('.map-wanderer-mark')].map(n => ({
    id: n.dataset.w || null,
    visible: +getComputedStyle(n).opacity > 0.5 && n.getBoundingClientRect().width > 10,
  }));
  const near = W.wanderersNear(date, at.lat, at.lng, undefined, water.isWater)
    .map(w => ({ id: w.id, key: W.wandererKey(date, w), cell: `${w.cx}_${w.cy}`, inst: w.inst, dist: Math.round(w.dist) }));
  return { date, drawn, near,
    ledger: (await db.db.all('xp')).filter(r => r.type === 'wanderer').map(r => r.key),
    arena: !!document.getElementById('arena'), enc: !!document.querySelector('.wnd-enc') };
}, at);

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
    /* Stand 45 m into his light, computed off the position and heading the APP
       derives (land oracle and all), so the encounter fires from the player's
       position exactly as it does for a walker. */
    const target = await realWanderer(page, HOME);
    if (!target.w) {
      /* SAME SENTENCE, SAME FIX AS THE PATROL SUITE. It opened by blaming his
         loop, which is only one of the three things realWanderer can mean by an
         empty set, and the other two include the land oracle being unreachable.
         The lead clause now claims only what is certain. */
      const why = `no Wanderer could be stood in front of on this run: ${target.why}`;
      unproven('BEFORE his own marker is on the map before the fight', why);
      unproven('DESPAWN he is gone from the map after the win', why);
      unproven('LEDGER the win is recorded on his instance key', why);
      unproven('NEXT the next instance walks again', why);
      throw new NoWanderer(why);
    }
    await page.setGeolocation({ latitude: target.p.lat, longitude: target.p.lng });
    await openBoneyard(page);

    const before = await look(page, target.p);
    /* HIS ID, OR NOTHING. This used to fall back to `before.near[0]`, and the
       fallback is why a rolled instance produced the unreadable
       "2 wanderer marker(s) drawn [..._i18, ..._i18], his own id ..._i19": the
       target was taken at i18, the 45-minute clock turned over, and the row
       reported a man nobody had walked up to. Worse in the other direction, on
       a run where near[0] happened to be drawn the whole suite would go on to
       grade a DIFFERENT Wanderer from the one the player is standing in front
       of. A rolled instance measured nothing, so it is declared, not failed. */
    const him = before.near.find(w => w.id === target.w.id);
    if (!him) {
      const why = `his 45-minute instance rolled over between the fix and the map: took ${target.w.id}, the live set is now [${before.near.map(w => w.id).join(', ') || 'empty'}]`;
      unproven('BEFORE his own marker is on the map before the fight', why);
      unproven('DESPAWN he is gone from the map after the win', why);
      unproven('LEDGER the win is recorded on his instance key', why);
      unproven('NEXT the next instance walks again', why);
      throw new NoWanderer(why);
    }
    ok('BEFORE his own marker is on the map before the fight (the positive control: every row below is gated on this)',
      before.drawn.some(m => m.id === him.id && m.visible),
      `${before.drawn.length} wanderer marker(s) drawn [${before.drawn.map(m => m.id).join(', ')}], his own id ${him.id}`);

    /* TAKE THE ENCOUNTER AND WIN IT THROUGH THE REAL ENGINE.
       WAITED FOR, NOT SLEPT ON, AND THE CLICK IS ASSERTED TO HAVE LANDED. The
       old shape was `await sleep(1500)` and then `const b = ...; if (b) b.click()`,
       which is a no-op on a miss: when the sheet had not arrived yet the suite
       clicked nothing, found no arena, and printed "no arena and no __bhFight
       after taking the encounter" -- a sentence that blames the fight engine for
       a sheet that was never opened. The encounter is opened by refreshWanderer,
       which runs on a 5 s world tick and cannot fire before js/water.js's tiles
       land, so how long it takes is the network's business, not the app's.
       Two separate facts now, so a triager can tell them apart:
         opened  did cone entry produce the sheet at all
         clicked did the Fight button exist when we pressed it */
    const enc = await page.evaluate(async () => {
      const t0 = Date.now();
      while (Date.now() - t0 < 20000) {
        if (document.querySelector('.wnd-enc .wnd-fight')) return { opened: true, ms: Date.now() - t0 };
        await new Promise(r => setTimeout(r, 200));
      }
      return { opened: false, ms: Date.now() - t0 };
    });
    const clicked = enc.opened && await page.evaluate(() => {
      const b = document.querySelector('.wnd-enc .wnd-fight');
      if (!b) return false;
      b.click();
      return true;
    });
    await sleep(3500);
    const inArena = await page.evaluate(() => !!document.getElementById('arena') && !!window.__bhFight);
    if (!inArena) {
      /* WHICH HALF BROKE. A sheet that never opened is a trigger/derivation
         story; a Fight button that was pressed and opened no arena is the fight
         engine, and only the second one is this suite's business to shout
         about. */
      ok('CONTROL the encounter really started a fight',
        false,
        enc.opened
          ? `the encounter sheet opened after ${enc.ms}ms and Fight was ${clicked ? 'clicked' : 'NOT clickable'}, but there is no arena and no __bhFight`
          : `cone entry never opened the encounter sheet in ${enc.ms}ms: standing at ${target.p.lat.toFixed(6)},${target.p.lng.toFixed(6)}, `
            + `45 m dead ahead of ${target.w.id} (heading ${target.w.heading.toFixed(0)}, ${target.w.dist} m from HOME), predicted-in-cone ${target.predicted}`);
    } else {
      await page.evaluate(() => window.__bhFight.finish('p'));
      await sleep(2500);
      await dismissOverlays(page, 8);
      await sleep(6000);   // let refreshWorld's own tick run at least once

      const after = await look(page, target.p);
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
      /* STAND WHERE THE NEXT MAN IS, instead of hoping. Every beat re-rolls at
         the turnover, so the lap that follows can legitimately leave nobody
         within WANDER_SHOW_M of where you happened to be standing -- measured
         on clean main, 1 run in 3 reported NEXT as an empty sample and exited
         97 UNPROVEN while the other 2 graded it. An UNPROVEN that comes and
         goes is not a check. So the fix is moved to 400 m BEHIND the new
         instance: inside the 1200 m the map draws at, outside the 300 m cone so
         nothing charges, and the row grades every run. Nothing is weakened --
         the claim was never about which patch of ground the player stands on. */
      const nextMan = await realWanderer(page, { latitude: target.p.lat, longitude: target.p.lng }, { offsetDeg: 180, metres: 400, anyone: true });
      if (nextMan.w) await page.setGeolocation({ latitude: nextMan.p.lat, longitude: nextMan.p.lng });
      await openBoneyard(page);
      const next = await look(page, nextMan.w ? nextMan.p : target.p);
      /* NOT "his cell, one instance on": every Wanderer's beat re-rolls at the
         turnover, so the man in his cell can easily be past WANDER_SHOW_M and
         out of the picture for reasons that have nothing to do with the ledger
         (measured: he was, and 2464_-6155 was the one in range). The claim that
         matters is the one the cap makes: a NEW instance is drawn, its key is
         unclaimed, the beaten instance is not on the map, and the ledger has NOT
         forgotten the win, which is what would make "he walks again" trivial. */
      const fresh = next.drawn.filter(m => m.id && m.id !== him.id);
      /* An empty `fresh` is an EMPTY SAMPLE, not a failure: the comment above
         records that a legitimate lap can leave nobody in range. Failing on it
         reds the gate for a healthy app, and passing on it would be a row that
         cannot fail. Declare it instead, which is what unproven is for. */
      if (!fresh.length) unproven('NEXT the next instance walks again',
        `no new instance was in range this lap even standing 400 m off ${nextMan.w ? nextMan.w.id : 'nobody'} `
        + `(${next.drawn.length} marker(s) drawn, ${next.near.length} derived; ${nextMan.tiles} water tiles warmed over ${nextMan.waitedMs}ms: ${nextMan.why}: `
        + 'an empty sample, not a defect)');
      else ok('NEXT the next instance walks again, on a key nobody has claimed, with the win still on the ledger',
        next.ledger.includes(him.key) && fresh.every(m => m.visible)
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
} catch (e) {
  if (!(e instanceof NoWanderer)) throw e;
  console.log(`  (run skipped: ${e.message})`);
} finally {
  await browser.close();
  if (srv) await srv.close();
}
unprovenReport('wanderer-despawn-audit', cap);
console.log(fails ? '\nWANDERER DESPAWN AUDIT FAILED' : '\nWANDERER DESPAWN AUDIT VERIFIED');
process.exit(exitFor(fails));
