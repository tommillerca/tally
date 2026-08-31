/* tests/gap-settle-audit.mjs — THE LAPSED PLAYER'S RETURN: the gap settle, the
 * day-guard's voice, and the streak reminder that dies with the streak.
 *
 * Round-4 cluster (2026-08-31). Three trapdoors a player who lapses 2+ days
 * fell through, all quiet:
 *
 *   GAP SETTLE   awardDayCloseIfDue only ever looked at YESTERDAY, so a 2+ day
 *                gap silently discarded the day-close crate earned on the last
 *                logged day. Now the LAST LOGGED day settles, bounded at exactly
 *                ONE day however long the gap (js/game.js awardDayCloseIfDue).
 *                Direction: an unpaid earned crate is failure; MORE than one
 *                missed day paying is also failure (that would be a backlog).
 *   GUARD VOICE  claimQuest returning null reached a glowing Claim button whose
 *                tap did nothing. A day-guard refusal now returns
 *                { dayGuard: reason } so the handler can toast why. The guard's
 *                DECISION is asserted unchanged: it still pays nothing.
 *   STREAK NAG   the 20:30 "keep your streak" notification was a repeating
 *                schedule with no gate: a dead streak got nagged nightly
 *                forever. Now it only schedules while the streak is alive, and
 *                as a ONE-SHOT, so it cannot outlive the streak on a phone that
 *                never opens the app again (js/notify.js syncNotifications).
 *   CONTROL      every absence claim is paired with a presence row, so an empty
 *                sample cannot pass.
 *
 * PROVEN RED on origin/main (pre-fix) in a throwaway tree: the GAP rows red
 * (crate discarded), the VOICE rows red (null, indistinguishable), the STREAK
 * rows red (repeating schedule with no streak). See the branch notes.
 *
 * Usage: node tests/gap-settle-audit.mjs            (serves this tree)
 *        node tests/gap-settle-audit.mjs <base-url>
 */
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { boot, serveTree } from './godmode.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let fails = 0;
const ok = (label, pass, detail = '') => {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}${detail ? `  | ${detail}` : ''}`);
  if (!pass) fails = 1;
};

const srv = process.argv[2] ? null : await serveTree(ROOT);
const base = process.argv[2] || srv.url;
console.log(`URL UNDER TEST: ${base}`);
const { browser, page } = await boot(base);

try {
  const r = await page.evaluate(async () => {
    const game = await import('./js/game.js');
    const quests = await import('./js/quests.js');
    const dbmod = await import('./js/db.js');
    const nut = await import('./js/nutrition.js');
    const { db, kvGet, kvSet } = dbmod;
    const out = {};
    const today = nut.dateKey();
    const T = n => nut.addDays(today, -n);
    const targets = { kcal: 2000, p: 120 };
    const uid = () => 'gap-' + Math.random().toString(36).slice(2);
    const seedDay = async (d, kcal) => db.put('log', { id: uid(), date: d, meal: 0, kcal, p: 30, c: 10, f: 5, ts: Date.now() });
    const xpRow = async key => (await db.all('xp')).find(rw => rw.key === key) || null;
    const crateCount = async () => (await db.all('inv')).filter(x => x.kind === 'crate').length;
    /* Sweep the 7-day window this file plays in: demo-db log rows, freeze
       markers and any dayclose/effort rows the app's own boot already minted,
       so every scenario starts from a known-empty window. */
    const clearWindow = async () => {
      for (const rw of await db.all('log')) if (rw.date >= T(6)) await db.del('log', rw.id);
      for (const rw of await db.all('xp')) {
        const m = /^(dayclose|dayeffort|protein|meals3)-(\d{4}-\d{2}-\d{2})$/.exec(rw.key);
        if ((m && m[2] >= T(6)) || (rw.type === 'freeze' && rw.date >= T(6))) await db.del('xp', rw.key);
      }
    };

    /* ---- 1. THE GAP PAYS THE LAST LOGGED DAY, AND ONLY THAT ONE. ---- */
    await clearWindow();
    await seedDay(T(5), 1500);                    // an older logged day: must NOT pay
    await seedDay(T(3), 1500);                    // the LAST logged day: on budget, must pay
    out.crates0 = await crateCount();
    out.gap = await game.awardDayCloseIfDue(targets);
    out.gapRowLast = await xpRow(`dayclose-${T(3)}`);
    out.gapRowOlder = (await xpRow(`dayclose-${T(5)}`)) || (await xpRow(`dayeffort-${T(5)}`));
    out.crates1 = await crateCount();
    // second open pays nothing again (ledger dedupe)
    out.gapAgain = await game.awardDayCloseIfDue(targets);
    out.crates2 = await crateCount();

    /* ---- 2. A DAY SETTLED BEFORE THE GAP DOES NOT PAY TWICE. ---- */
    await clearWindow();
    await seedDay(T(4), 1500);
    await db.put('xp', { key: `dayclose-${T(4)}`, type: 'dayclose', xp: 50, label: 'x', date: T(4), ts: Date.now() });
    out.crates3 = await crateCount();
    out.settled = await game.awardDayCloseIfDue(targets);
    out.crates4 = await crateCount();

    /* ---- 3. CONTROL: the plain yesterday case is untouched. ---- */
    await clearWindow();
    await seedDay(T(1), 1500);
    out.yday = await game.awardDayCloseIfDue(targets);
    out.ydayRow = await xpRow(`dayclose-${T(1)}`);

    /* ---- 4. THE GUARD STILL RULES, AND NOW SPEAKS. Force rule 3 (unwitnessed:
       the lapsed 7+ day shape) by pinning the witness 9 days back, then assert
       the settle pays NOTHING and claimQuest names its refusal. kv saved and
       restored so the rest of the app is untouched. ---- */
    const saved = {};
    for (const k of ['dayHighWater', 'dayPaceKey', 'dayPaceAt', dbmod.DAY_WITNESS_KEY]) saved[k] = await kvGet(k, null);
    const ord = nut.dayOrdinal(today);
    await kvSet('dayHighWater', T(1));
    await kvSet('dayPaceKey', T(1));
    await kvSet('dayPaceAt', Date.now());
    await kvSet(dbmod.DAY_WITNESS_KEY, ord - (dbmod.WITNESS_GRACE + 2));
    out.guardProbe = await dbmod.claimDay(today);          // control: the guard really refuses here
    await clearWindow();
    await seedDay(T(2), 1500);
    out.guardSettle = await game.awardDayCloseIfDue(targets);
    out.guardSettleRow = await xpRow(`dayclose-${T(2)}`);
    const q = { id: 'gapvoice', name: 'Gap voice', coins: 10 };
    const coinsBefore = await kvGet('coins', 0);
    out.guardClaim = await quests.claimQuest(today, q, 'day');
    out.guardClaimRow = await xpRow(`quest-${today}-gapvoice`);
    out.guardCoinsDelta = (await kvGet('coins', 0)) - coinsBefore;
    for (const [k, v] of Object.entries(saved)) await kvSet(k, v);

    /* ---- 5. STREAK REMINDER: no streak, no nag; a live streak arms ONE shot.
       Capacitor is stubbed so the real syncNotifications runs its native path
       against a recorder. Last, so the stub cannot leak into anything above. */
    const scheduled = [];
    const cancelled = [];
    window.Capacitor = {
      isNativePlatform: () => true,
      Plugins: { LocalNotifications: {
        getPending: async () => ({ notifications: [{ id: 2 }] }),   // a legacy repeating nag is pending
        cancel: async ({ notifications }) => { cancelled.push(...notifications.map(n => n.id)); },
        schedule: async ({ notifications }) => { scheduled.push(...notifications); },
        requestPermissions: async () => ({ display: 'granted' }),
        checkPermissions: async () => ({ display: 'granted' }),
      } },
    };
    const notify = await import('./js/notify.js');
    await kvSet('notifPrefs', { enabled: true, reminder: true, streak: true, friends: true, siege: true });
    await clearWindow();                                    // dead streak: nothing today or yesterday
    await notify.syncNotifications();
    out.deadStreak = { scheduled: scheduled.map(n => n.id), cancelled: [...cancelled] };
    scheduled.length = 0; cancelled.length = 0;
    await seedDay(today, 500);                              // live streak: logged today
    await notify.syncNotifications();
    const streakNoti = scheduled.find(n => n.id === 2);
    out.liveStreak = {
      scheduled: scheduled.map(n => n.id),
      oneShot: !!(streakNoti && streakNoti.schedule && streakNoti.schedule.at && !streakNoti.schedule.on),
      at: streakNoti && streakNoti.schedule && streakNoti.schedule.at ? new Date(streakNoti.schedule.at).getTime() : null,
      now: Date.now(),
    };
    await clearWindow();
    return out;
  });

  /* ---- grade ---- */
  const gapPaid = r.gap && r.gap.closed && r.gap.gap === true;
  ok('CONTROL: the gap settle returned a payout at all', !!r.gap, JSON.stringify(r.gap));
  ok('GAP: the last logged day closed on budget, flagged as a gap', gapPaid, JSON.stringify(r.gap));
  ok('GAP: the dayclose ledger row is for the LAST logged day', !!r.gapRowLast, JSON.stringify(r.gapRowLast));
  ok('BOUND: the older missed day paid nothing (exactly one day settles)', !r.gapRowOlder, JSON.stringify(r.gapRowOlder));
  ok('GAP: exactly one crate landed', r.crates1 === r.crates0 + 1, `${r.crates0} -> ${r.crates1}`);
  ok('DEDUPE: a second open pays nothing again', !r.gapAgain && r.crates2 === r.crates1, `again=${JSON.stringify(r.gapAgain)} crates ${r.crates1} -> ${r.crates2}`);
  ok('SETTLED-BEFORE-GAP: an already-settled last day pays nothing', !r.settled && r.crates4 === r.crates3, `res=${JSON.stringify(r.settled)} crates ${r.crates3} -> ${r.crates4}`);
  ok('CONTROL: the plain yesterday settle still pays, not flagged as a gap', !!(r.yday && r.yday.closed && !r.yday.gap && r.ydayRow), JSON.stringify(r.yday));

  ok('CONTROL: the forced guard state really refuses (unwitnessed)', !!(r.guardProbe && !r.guardProbe.fresh && r.guardProbe.reason === 'unwitnessed'), JSON.stringify(r.guardProbe));
  ok('GUARD: the settle pays nothing under a refusing guard', !r.guardSettle && !r.guardSettleRow, JSON.stringify(r.guardSettle));
  ok('VOICE: claimQuest names the day-guard refusal', !!(r.guardClaim && r.guardClaim.dayGuard === 'unwitnessed'), JSON.stringify(r.guardClaim));
  ok('VOICE PAYS NOTHING: no ledger row, no coins', !r.guardClaimRow && r.guardCoinsDelta === 0, `row=${JSON.stringify(r.guardClaimRow)} coins=${r.guardCoinsDelta}`);

  ok('STREAK: a dead streak schedules NO streak nag', !r.deadStreak.scheduled.includes(2), JSON.stringify(r.deadStreak.scheduled));
  ok('STREAK: the legacy repeating nag is cancelled on sync', r.deadStreak.cancelled.includes(2), JSON.stringify(r.deadStreak.cancelled));
  ok('CONTROL: the food reminder still schedules (sync ran)', r.deadStreak.scheduled.includes(1), JSON.stringify(r.deadStreak.scheduled));
  ok('STREAK: a live streak schedules the nag', r.liveStreak.scheduled.includes(2), JSON.stringify(r.liveStreak.scheduled));
  ok('STREAK: the nag is a ONE-SHOT in the future, never repeating', r.liveStreak.oneShot && r.liveStreak.at > r.liveStreak.now, JSON.stringify(r.liveStreak));

  /* The handler wiring, pinned in source: the return shape only matters if the
     click handler actually toasts it. */
  const appSrc = fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8');
  ok('WIRING: the claim handler voices res.dayGuard with the honest toast',
    appSrc.includes('res?.dayGuard') && appSrc.includes('check the clock with the server'),
    'js/app.js [data-claim] handler');
} finally {
  await browser.close();
  if (srv) srv.close();
}
process.exit(fails);
