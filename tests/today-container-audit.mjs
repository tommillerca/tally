/* THE DAY IS ONE CONTAINER, AND A PAST DAY IS NOT A STRIPPED ONE.
 *
 * Today is the app's default screen and its most regression-prone one: four of
 * the four bugs that produced the anti-regression rules were on it, one of them
 * a floating element that made day-navigation impossible for a whole release.
 * The v425 rework moves its whole hierarchy, so it gets a guard per claim.
 *
 * WHAT TOM ASKED FOR, and what each row is holding to it:
 *   "accidentally changing the day on your macros makes all the news above
 *    disappear and makes the player feel like they just broke the game and dont
 *    know how to go back."          -> PASTDAY and ESCAPE
 *   "remove the 'start with breakfast' button that's there"   -> NUDGE
 *   "have quests be always under the initial 4 buttons"       -> QUESTS
 * plus the two structural claims of the approved design (variant d2):
 *   the orphan `< TODAY Aug 22 > [gear]` row stops existing   -> ORPHAN
 *   every day-scoped section is INSIDE the day, not beside it -> NESTED
 * and the standing repo contract that a day change re-renders in place:
 *   refresh() preserves scroll, route() goes to top           -> SCROLL
 *
 * WHAT A FAILING RESULT LOOKS LIKE (anti-regression rule 1), per row:
 *   ORPHAN   a `.day-strip` exists again, or any of the three day controls is
 *            outside `.dayhdr`, or elementFromPoint at a control's centre
 *            answers something other than that control (rule 6: the gear once
 *            covered the next-day arrow and nobody noticed for a release).
 *   NESTED   a day-scoped section is a SIBLING of `.dayblk` rather than a
 *            descendant, or the promo banner is inside the day, or it comes
 *            before the day in document order.
 *   PASTDAY  a past day is missing a section today has. The bound is a DECLARED
 *            exception list, not a trend: TODAY_ONLY below has exactly one
 *            entry with a reason, so a NEW today-only section goes red here
 *            rather than quietly re-stripping the day one card at a time.
 *   ESCAPE   the way home is not on screen, not tappable, or does not land on
 *            today.
 *   NUDGE    the first-meal nudge is back in the served source, or its card is
 *            in the DOM, or something has queued itself between the four doors
 *            and the quests. The source half is the half with teeth: the demo
 *            save has logged food, so the nudge would not render on it anyway
 *            and a DOM-only check would pass on the pre-fix tree (rule 1).
 *   SCROLL   a day change lands at the top. That is `route()` in place of
 *            `refresh()`, the known regression the contract exists for.
 *
 * PROVEN RED, and each mutation goes red ONLY where it should, which is the
 * half that says the rows are not just noisy. Three throwaway trees, each one a
 * `git archive HEAD` extract with the mutation seeded by `git show <rev>:<path>
 * > file` (never a checkout into a worktree, which rewrote an index here once
 * and shipped two pre-fix commits while the audits kept passing):
 *   R1  js/app.js + app.css from the pre-fix base d8819940
 *       24 red: SETUP, all of ORPHAN, all of NESTED, all of NUDGE, PASTDAY
 *       (3 markers on a past day against 11 on today; quests, promo, meals and
 *       the sign-off all gone). SCROLL and ESCAPE stay GREEN, correctly: the
 *       pre-fix screen already refreshed in place and its arrows still worked.
 *   R2  both day arrows call route() instead of refresh()
 *       1 red, and only SCROLL: 900 -> 0.
 *   R3  #todaySettings stretched to 96px over the next-day arrow, the exact
 *       shape of the v-release bug where the gear made day-navigation
 *       impossible
 *       4 red: the two arrows in ORPHAN and in ESCAPE, each naming
 *       'todaySettings' as what answered the tap.
 *
 * An empty sample is a failure everywhere: SETUP refuses to grade a screen with
 * no sections on it, and PASTDAY refuses to grade an empty marker set.
 *
 * Usage: node tests/today-container-audit.mjs [baseUrl]   (serves this repo if
 * omitted, so a bare run can never grade production).
 */
import { boot, serveTree, sleep } from './godmode.js';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const argUrl = process.argv[2] || process.env.URL;
const srv = argUrl ? null : await serveTree(repo);
const base = (argUrl || srv.url).replace(/\/?$/, '/');

let bad = 0;
const ok = (label, pass, detail = '') => {
  console.log(`${pass ? 'ok  ' : 'FAIL'} ${label}${detail ? '  ' + detail : ''}`);
  if (!pass) bad++;
};

/* THE ONE SECTION ALLOWED TO BE TODAY-ONLY, and it is a storage fact rather than
   a layout choice: js/wellness.js keeps water/bed/sleep in a SINGLE kv record
   stamped with one date, so a past day reads back as zeros and one tap on the
   water button would save that zeroed record over today's. Delete this entry the
   day wellness gets a per-date store. Anything else that appears in this diff is
   a regression, not a new exception. */
const TODAY_ONLY = ['sec:wellness'];

/* WAIT FOR THE DAY TO ACTUALLY CHANGE, never for a fixed sleep. renderToday is
   async and the gate runs suites in parallel, so under load a 1.8s sleep samples
   the frame BEFORE the re-render: the first run inside the gate read "Today" off
   a screen that was one tick away from saying "Friday" and failed a healthy tree
   (lessons_guard_samples_wrong_instant). Poll the value the click is supposed to
   move instead, then grade. */
async function tapDay(page, id, want) {
  await page.evaluate(i => document.getElementById(i)?.click(), id);
  /* A timeout is a graded FAILURE, not a thrown audit: an exception here would
     stop every row below from running at all, which reads as "fewer failures". */
  const landed = await page.waitForFunction(
    w => document.getElementById('datePick')?.value === w, { timeout: 15000, polling: 120 }, want)
    .then(() => true).catch(() => false);
  await sleep(400);   // let the ring tween and the images settle before measuring
  return landed;
}

const { browser, page, errors } = await boot(base);
try {
  await page.evaluate(() => { location.hash = '#/today'; });
  await sleep(2600);
  await page.evaluate(() => {
    document.querySelector('.dw')?.remove();
    document.querySelector('.drop-veil')?.remove();
    const s = document.createElement('style');
    s.textContent = '#toast{display:none!important}.demo-badge,#demoBadge{display:none!important}';
    document.head.appendChild(s);
  });

  /* Every structural claim on the screen, as a set of names. Kickers are read
     from their own text so a renamed or dropped section shows up as a diff
     rather than as a silently absent querySelector. */
  const MARKERS = `(() => {
    const sc = document.getElementById('screen');
    const m = new Set();
    if (sc.querySelector('.hero-scene')) m.add('hero');
    if (sc.querySelector('.hero-actions')) m.add('doors');
    if (sc.querySelector('.q-collapse')) m.add('quests');
    if (sc.querySelector('.hype')) m.add('promo');
    if (sc.querySelector('.ring-card')) m.add('calories');
    if (sc.querySelector('.tsec-meals')) m.add('meals');
    if (sc.querySelector('.day-signoff')) m.add('signoff');
    for (const h of sc.querySelectorAll('.tsec-h')) m.add('sec:' + h.textContent.trim().toLowerCase());
    return [...m];
  })()`;
  const markers = () => page.evaluate(MARKERS);

  const shape = () => page.evaluate(() => {
    const sc = document.getElementById('screen');
    const blk = sc.querySelector('.dayblk');
    const hdr = blk && blk.querySelector('.dayhdr');
    const hit = id => {
      const b = document.getElementById(id);
      if (!b) return { id, present: false };
      const r = b.getBoundingClientRect();
      const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return { id, present: true, w: Math.round(r.width), h: Math.round(r.height),
        mine: !!(at && (at === b || b.contains(at))), got: at ? (at.id || at.className || at.tagName) : null };
    };
    const doors = sc.querySelector('.hero-actions');
    const kids = [...sc.children];
    return {
      dayStrip: !!sc.querySelector('.day-strip'),
      dayblk: !!blk, dayhdr: !!hdr,
      hdrHoldsControls: !!hdr && ['prevDay', 'nextDay', 'todaySettings']
        .every(id => hdr.contains(document.getElementById(id))),
      controls: ['prevDay', 'nextDay', 'todaySettings'].map(hit),
      titleFirst: !!hdr && hdr.firstElementChild?.className.includes('day-title'),
      /* Read from EITHER header. Pinning the day's title to the new class name
         would make this row go red on a tree that simply has the old one, which
         is a false red about the selector rather than a finding about the day
         (lessons_audit_drift_false_red). ORPHAN owns the class-name claim. */
      h1: sc.querySelector('.dayhdr h1, .day-strip h1')?.textContent.trim() || null,
      sub: sc.querySelector('.dayhdr .sub, .day-strip .sub')?.textContent.trim() || null,
      pickDate: document.getElementById('datePick')?.value || null,
      // day-scoped things: inside the day block, never a sibling of it
      nested: ['.ring-card', '.tsec-meals', '.day-signoff', '.tsec']
        .map(s => [s, sc.querySelectorAll(s).length, blk ? blk.querySelectorAll(s).length : 0]),
      // the promo is the opposite claim: outside the day, and after it
      promoInDay: !!(blk && blk.querySelector('.hype')),
      promoAfterDay: (() => {
        const p = sc.querySelector('.promo-slot');
        return !!(p && blk && (blk.compareDocumentPosition(p) & Node.DOCUMENT_POSITION_FOLLOWING));
      })(),
      nudge: !!sc.querySelector('.unlock-nudge, #ulSkip'),
      afterDoors: doors?.nextElementSibling?.className || null,
      sections: sc.querySelectorAll('.tsec').length,
      topLevel: kids.map(e => e.tagName.toLowerCase() + '.' + (e.className || '').split(' ').filter(Boolean).join('.')),
    };
  });

  const todayShape = await shape();
  const todayMarks = await markers();
  console.log('TODAY', JSON.stringify({ ...todayShape, marks: todayMarks }, null, 1));

  // ---------------------------------------------------------------- SETUP
  ok('SETUP no page errors on the way in', errors.length === 0, errors.join(' | '));
  ok('SETUP the day rendered with sections in it (an empty screen grades nothing)',
    todayShape.dayblk && todayShape.sections >= 3 && todayMarks.length >= 6,
    `${todayShape.sections} sections, ${todayMarks.length} markers`);

  // --------------------------------------------------------------- ORPHAN
  ok('ORPHAN the floating day-nav row does not exist', !todayShape.dayStrip);
  ok('ORPHAN the day container carries a header', todayShape.dayblk && todayShape.dayhdr);
  ok('ORPHAN both arrows and the gear live INSIDE that header', todayShape.hdrHoldsControls);
  ok('ORPHAN the title leads the header, controls follow it', todayShape.titleFirst);
  for (const c of todayShape.controls) {
    ok(`ORPHAN ${c.id} is on screen and answers its own centre tap`,
      c.present && c.w > 0 && c.h > 0 && c.mine, JSON.stringify(c));
  }

  // --------------------------------------------------------------- NESTED
  for (const [sel, inScreen, inDay] of todayShape.nested) {
    ok(`NESTED every ${sel} is inside the day container, none beside it`,
      inScreen > 0 && inScreen === inDay, `${inDay} of ${inScreen}`);
  }
  ok('NESTED the promo banner is NOT inside the day', !todayShape.promoInDay);
  ok('NESTED and it comes after the whole day, not before it', todayShape.promoAfterDay);

  // ---------------------------------------------------------------- NUDGE
  /* COMMENTS ARE NOT EVIDENCE OF LIFE, the same call tests/selector-audit.mjs
     makes and for the same reason: the removal is documented in place, so the
     names survive in prose and a raw text search would grade the tombstone as
     the corpse. Strip comments, then look. (Crude on purpose: a `//` inside a
     URL string loses its tail, which cannot affect a search for these three
     tokens.) */
  const src = (await (await fetch(base + 'js/app.js')).text())
    .replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/.*$/gm, ' ');
  const revived = ['Start with breakfast', 'unlock-nudge', 'ulSkip'].filter(t => src.includes(t));
  ok('NUDGE the served source carries no first-meal nudge outside its comments',
    src.length > 100000 && revived.length === 0, revived.join(', ') || `${src.length} chars of code read`);
  ok('NUDGE no nudge card is on the screen', !todayShape.nudge);
  ok('NUDGE quests are the element directly after the four doors',
    /q-collapse/.test(todayShape.afterDoors || ''), String(todayShape.afterDoors));

  // --------------------------------------------------------------- SCROLL
  /* Measured on the state the contract is about: scrolled DOWN, then the day
     changed. The bound has a direction: landing at the top is the failure, so
     the assertion is both "close to where we were" and "not zero". */
  const scroll = await page.evaluate(() => {
    const sc = document.getElementById('screen');
    /* Derived from the SCROLLABLE RANGE, not from a landmark of the new layout:
       a target read off `.dayblk` throws on any tree that does not have one, and
       an audit that throws stops grading the rows below it instead of failing
       them. Half the range is deep enough to be a reading position and shallow
       enough to survive the shorter content of a past day. */
    sc.scrollTop = Math.min(900, Math.round((sc.scrollHeight - sc.clientHeight) / 2));
    return sc.scrollTop;
  });
  await sleep(200);
  const yesterday = await page.evaluate(() => {
    const d = new Date(document.getElementById('datePick').value + 'T12:00:00');
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  });
  const wentBack = await tapDay(page, 'prevDay', yesterday);
  ok('SCROLL the previous-day arrow really moved the day before anything was measured',
    wentBack, `wanted ${yesterday}`);
  const after = await page.evaluate(() => document.getElementById('screen').scrollTop);
  ok('SCROLL the day change had somewhere to fall FROM (a zero start grades nothing)', scroll > 120, String(scroll));
  ok('SCROLL a day change keeps the reading position, it does not go to the top',
    after > 0 && Math.abs(after - scroll) <= 24, `${scroll} -> ${after}`);

  // -------------------------------------------------------------- PASTDAY
  const pastShape = await shape();
  const pastMarks = await markers();
  console.log('PAST DAY', JSON.stringify({ ...pastShape, marks: pastMarks }, null, 1));
  ok('PASTDAY we really are on another day', pastShape.h1 !== 'Today' && !!pastShape.h1,
    `${pastShape.h1} / ${pastShape.sub}`);
  ok('PASTDAY there is something on it to grade (an empty marker set is a failure)',
    pastMarks.length >= 6, `${pastMarks.length} markers`);
  const missing = todayMarks.filter(m => !pastMarks.includes(m));
  ok('PASTDAY a past day keeps every section today has, bar the declared exception',
    missing.every(m => TODAY_ONLY.includes(m)), `missing: ${missing.join(', ') || 'nothing'}`);
  for (const m of ['hero', 'doors', 'quests', 'promo', 'calories', 'meals', 'signoff']) {
    ok(`PASTDAY the news above survives the day change: ${m}`, pastMarks.includes(m));
  }
  ok('PASTDAY the day is still one container with its header on it',
    pastShape.dayblk && pastShape.hdrHoldsControls && !pastShape.dayStrip);
  ok('PASTDAY quests still sit directly under the four doors',
    /q-collapse/.test(pastShape.afterDoors || ''), String(pastShape.afterDoors));

  // --------------------------------------------------------------- ESCAPE
  /* Hit-tested with the header ON SCREEN, because that is the question: a player
     who has read down a past day scrolls back up to the day bar and taps. Taking
     the sample where PASTDAY left the page (mid-scroll) would read
     elementFromPoint off the viewport and grade a healthy screen red. */
  await page.evaluate(() => document.querySelector('.dayhdr, .day-strip')?.scrollIntoView({ block: 'center' }));
  await sleep(500);
  const escape = await shape();
  for (const c of escape.controls) {
    ok(`ESCAPE ${c.id} is reachable from a past day`, c.present && c.mine, JSON.stringify(c));
  }
  const cameHome = await tapDay(page, 'nextDay', todayShape.pickDate);
  ok('ESCAPE the next-day arrow moved the day at all', cameHome, `wanted ${todayShape.pickDate}`);
  const home = await page.evaluate(() => ({
    h1: document.querySelector('.dayhdr h1, .day-strip h1')?.textContent.trim(),
    pick: document.getElementById('datePick')?.value,
  }));
  /* Compared against the date the app itself showed on the first render, not
     against a date computed here: toISOString() is UTC and this app keys days
     locally, so a run after 20:00 EDT would grade against tomorrow. */
  ok('ESCAPE the next-day arrow lands back on today',
    home.h1 === 'Today' && !!todayShape.pickDate && home.pick === todayShape.pickDate,
    JSON.stringify({ ...home, expected: todayShape.pickDate }));
} finally {
  await browser.close();
  srv?.close?.();
}

console.log(bad ? `\n${bad} FAILED` : '\nTODAY CONTAINER VERIFIED');
process.exit(bad ? 1 : 0);
