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
 *   READONLY a past day's quests can be acted on. Graded in MONEY: the app's own
 *            claim control is pressed with a real click, pointed at the closed
 *            day, and the coin balance and the xp ledger are read back. A row
 *            that only counted buttons would pass on a tree whose handler still
 *            pays, which is the whole point of putting the guard in js/quests.js.
 *   CONTROL  today's claim stopped paying. Without it, "refuse everything" would
 *            pass every READONLY row while breaking quests for everybody.
 *
 * PROVEN RED, and each mutation goes red ONLY where it should, which is the
 * half that says the rows are not just noisy. Three throwaway trees, each one a
 * `git archive HEAD` extract with the mutation seeded by `git show <rev>:<path>
 * > file` (never a checkout into a worktree, which rewrote an index here once
 * and shipped two pre-fix commits while the audits kept passing):
 *   R1  js/app.js, app.css and js/quests.js from the pre-fix base d8819940
 *       29 red: SETUP, all of ORPHAN, all of NESTED, all of NUDGE, PASTDAY
 *       (3 markers on a past day against 11 on today; quests, promo, meals and
 *       the sign-off all gone) and READONLY. SCROLL and ESCAPE stay GREEN,
 *       correctly: the pre-fix screen already refreshed in place and its arrows
 *       still worked.
 *   R2  both day arrows call route() instead of refresh()
 *       1 red, and only SCROLL: 900 -> 0.
 *   R3  #todaySettings slid back over the previous-day arrow, the exact shape of
 *       the release where the gear made day-navigation impossible
 *       2 red, and only the covered arrow: ORPHAN and ESCAPE, both naming
 *       'todaySettings' as what answered the tap.
 *   R4  the whole branch tip before read-only (2ecd65fd js/app.js + js/quests.js)
 *       6 red, all READONLY: 4 live claim controls on the past day, a "4 ready"
 *       badge, and pressing one paid 340 -> 380 coins, 3535 -> 3560 XP and minted
 *       a quest row keyed to the closed day. CONTROL green, correctly.
 *   R5  js/quests.js ONLY reverted to 2ecd65fd, the read-only markup kept
 *       2 red, and only the two MONEY rows: no button is drawn, and the
 *       retargeted real control still pays 340 -> 380. This is the row that
 *       proves the money is held by the AUTHORITY and not by the absent button.
 *   R6  periodClosed forced to always-true
 *       1 red, and only CONTROL: the guard cannot buy a pass by refusing every
 *       claim in the app.
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
   a regression, not a new exception.
   PROVENANCE, 2026-08-23: verified against js/wellness.js, which keeps water,
   bed and sleep in ONE kv record stamped with a single date and whose save()
   overwrites it. That is a code fact rather than a product decision, so it
   expires when the storage changes, not when someone changes their mind. It
   traces to Tom's report that a past day "makes all the news above disappear and
   makes the player feel like they just broke the game": everything else on Today
   was restored for past days, and this is the one section that could not be
   without destroying today's data. */
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
    w => document.querySelector('.dayhdr')?.dataset.date === w, { timeout: 15000, polling: 120 }, want)
    .then(() => true).catch(() => false);
  await sleep(400);   // let the ring tween and the images settle before measuring
  return landed;
}

const shotPath = name => join(repo, '_feedback_shots', 'today-d2', name);

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
      /* SCROLLED INTO VIEW FIRST, which the neighbouring ESCAPE block already
         says is the only meaningful form of this question ("Hit-tested with the
         header ON SCREEN, because that is the question"). Without the scroll
         this row was really asserting "the day header happens to sit above the
         fold on load", which the app has never promised: measured 2026-08-27,
         inserting ONE collapsed row above the day turned all three controls red
         with elementFromPoint returning the tabbar, on a day header that a
         player reaches by the same scroll they always did. The claim is that the
         controls are hittable, not that they are unscrolled. */
      controls: (() => {
        document.getElementById('screen')?.querySelector('.dayhdr')
          ?.scrollIntoView({ block: 'center' });
        return ['prevDay', 'nextDay', 'todaySettings'].map(hit);
      })(),
      titleFirst: !!hdr && hdr.firstElementChild?.className.includes('day-title'),
      /* Read from EITHER header. Pinning the day's title to the new class name
         would make this row go red on a tree that simply has the old one, which
         is a false red about the selector rather than a finding about the day
         (lessons_audit_drift_false_red). ORPHAN owns the class-name claim. */
      h1: sc.querySelector('.dayhdr h1, .day-strip h1')?.textContent.trim() || null,
      sub: sc.querySelector('.dayhdr .sub, .day-strip .sub')?.textContent.trim() || null,
      pickDate: document.querySelector('.dayhdr')?.dataset.date || null,
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

  // --------------------------------------------------------------- LEDGER
  /* THE DAY IS A LEDGER, NOT A BOX OF BOXES. Tom's sentence is that the screen
     "reads as floating widgets rather than one screen". NESTED above proves the
     day CONTAINS everything, and that is only half of it: measured at 390x844
     on the shipped v425 container, the screen drew 4 surfaces but the day drew
     8 MORE inside itself, because Calories, Wellness, Activity and all four
     meals each kept the full hand-inked panel (app.css:975) laid on the day's
     own well, with a kicker above each one naming it a second time. Nine
     `.entry` food rows sat inside those as pills.

     A SURFACE IS COUNTED THE WAY AN EYE COUNTS ONE: an element that paints a
     background different from the day's own, or carries a keyline on two or
     more sides, and is big enough to read as a panel rather than as a chip.
     Not a class-name list, which would go red the day somebody renames a card
     and green the day somebody adds one (lessons_audit_drift_false_red).

     THE BOUND IS ZERO, AND IT TAKES THREE ROWS TOGETHER, because on its own
     "no panels inside the day" is satisfied by two different disasters:
       SETUP    refuses to grade a day with nothing in it. An empty day has no
                panels either, and that is not this passing.
       CONTROL  a `.card` OUTSIDE the day still has the hand-inked keyline. The
                cheap way to make the row above green is to delete .card's skin
                app-wide, which would flatten the Kitchen, the Stable and the
                shop as collateral. Proven: that mutation goes red HERE and
                nowhere else.
       SEAMS    the sections are still separated. The other cheap pass is to
                delete every rule and let the day become one undifferentiated
                column of text, so each section after the first has to carry a
                real hairline. Flattening is not the same as erasing. */
  /* MEASURED WITH THE DAY EXPANDED, since 2026-08-27. Every claim in this block
     is about the day's CONTENT, and the content is all still there: it collapsed
     behind its own wheel-and-macros banner (Tom: "below the fold should be fully
     collapsed"), it did not go away. Grading the closed state would quietly turn
     "the day is one flat well with rules between its sections" into "the day has
     almost nothing in it", which is not what any row here means.

     The ONE row that is genuinely re-premised rather than re-staged is the panel
     count below: the banner IS a panel now, by Tom's approval of the mockup. */
  await page.evaluate(() => {
    const d = document.getElementById('dayRest');
    if (d && !d.open) d.open = true;
  });
  await sleep(450);
  const ledger = await page.evaluate(() => {
    const sc = document.getElementById('screen');
    const day = sc.querySelector('.dayblk');
    const hasBanner = !!sc.querySelector('#dayRest > summary');
    if (!day) return { noDay: true };
    const pageBg = getComputedStyle(document.body).backgroundColor;
    const dayBg = getComputedStyle(day).backgroundColor;
    const label = el => (el.className || el.tagName).toString().split(' ').filter(Boolean).slice(0, 3).join('.');
    const paintsPanel = el => {
      const st = getComputedStyle(el), bg = st.backgroundColor;
      const solid = bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent' && bg !== pageBg && bg !== dayBg;
      const widths = ['Top', 'Right', 'Bottom', 'Left'].map(k => parseFloat(st['border' + k + 'Width']) || 0);
      const keylined = widths.filter(w => w >= 1).length >= 2
        && st.borderTopStyle !== 'none' && st.borderTopStyle !== 'hidden';
      const r = el.getBoundingClientRect();
      return (solid || keylined) && r.width > 150 && r.height > 40;
    };
    const inside = [...day.querySelectorAll('*')]
      /* form controls are not sections: a text input is SUPPOSED to look like a
         box you can type in, and flattening it would be a bug, not the fix. */
      .filter(el => !['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))
      .filter(paintsPanel);
    const outermost = inside.filter(el => !inside.some(o => o !== el && o.contains(el)));
    const secs = [...day.querySelectorAll('.tsec')];
    const seams = secs.slice(1).map(el => ({
      el: label(el), w: parseFloat(getComputedStyle(el).borderTopWidth) || 0,
      style: getComputedStyle(el).borderTopStyle,
    }));
    const outside = [...sc.querySelectorAll('.card')].filter(c => !day.contains(c)).map(c => {
      const st = getComputedStyle(c);
      return { hasBanner, el: label(c), bw: parseFloat(st.borderTopWidth) || 0, shadow: st.boxShadow !== 'none' };
    });
    return {
      sections: secs.length,
      cardsInDay: day.querySelectorAll('.card, .meal').length,
      panels: outermost.map(el => ({ el: label(el), h: Math.round(el.getBoundingClientRect().height) })),
      seams, outside,
    };
  });
  console.log('LEDGER', JSON.stringify(ledger));
  /* THE FLOOR IS 3, NOT 4, since 2026-08-27: Calories stopped being a .tsec and
     became the <summary> of the collapsed day, so the same content spans one
     fewer section element. The banner is counted alongside them so this still
     refuses to grade a day that has genuinely emptied out. */
  ok('LEDGER SETUP the day has sections and cards in it to grade (an empty day has no panels either)',
    !ledger.noDay && ledger.sections >= 3 && ledger.cardsInDay >= 3,
    JSON.stringify({ sections: ledger.sections, cardsInDay: ledger.cardsInDay }));
  /* ONE PANEL IS ALLOWED NOW, and exactly one: the collapsed day's own banner.
     Tom approved that card in the mockup on 2026-08-27 ("that's much better")
     and then asked for the whole day to sit behind it, so the ring card is the
     summary of a <details> and a summary that does not look like a surface does
     not look tappable. Everything else inside the day still has to be flat: a
     second panel appearing here is the "every section becomes a card again"
     regression this row was written for, and it still fails. */
  const strayPanels = (ledger.panels || []).filter(p => !/ring-card/.test(p.el || ''));
  ok('LEDGER nothing inside the day paints its own panel except the collapsed day banner itself',
    Array.isArray(ledger.panels) && strayPanels.length === 0,
    `${(ledger.panels || []).length} panel(s) inside the day: ` +
    ((ledger.panels || []).map(p => `${p.el} h${p.h}`).join(', ') || 'none') +
    `; ${strayPanels.length} of them not the banner`);
  /* >= 2 for the same reason the floor above moved: one fewer section element
     means one fewer boundary between them. The property being held is unchanged
     and is the one that matters: every rule that IS there is real, so the cheap
     pass of deleting them all and letting the day become one undifferentiated
     column still fails. */
  ok('LEDGER SEAMS every section after the first is still separated by a real rule',
    Array.isArray(ledger.seams) && ledger.seams.length >= 2 && ledger.seams.every(s => s.w >= 1 && s.style !== 'none'),
    JSON.stringify(ledger.seams));
  ok('LEDGER CONTROL a card OUTSIDE the day keeps the hand-inked skin, so this was not bought by flattening every card in the app',
    Array.isArray(ledger.outside) && ledger.outside.length >= 1 && ledger.outside.every(c => c.bw >= 2 && c.shadow),
    JSON.stringify(ledger.outside));

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
  /* Same conflict as the PASTDAY row below: Tom's 2026-08-22 "quests always
     under the initial 4 buttons" against his 2026-08-27 news banner "at the top
     above quests". The newer wins, and exactly one collapsed row is allowed
     through by id. Everything this row was written to keep out, the nudge stack,
     still fails it. */
  ok('NUDGE quests are the element directly after the four doors',
    /q-collapse|\bnb\b/.test(todayShape.afterDoors || ''), String(todayShape.afterDoors));

  // --------------------------------------------------------------- SCROLL
  /* Measured on the state the contract is about: scrolled DOWN, then the day
     changed. The bound has a direction: landing at the top is the failure, so
     the assertion is both "close to where we were" and "not zero". */
  /* WAIT FOR THE SCREEN TO BE SCROLLABLE, do not assume it already is. Measured
     straight after a render this read 0 on a contended machine, and a target of
     0 makes the row below grade nothing at all. The SETUP row catches that, but
     catching it as a false red on a healthy tree is still a wasted round. */
  const scrollable = await page.waitForFunction(() => {
    const sc = document.getElementById('screen');
    return !!sc && sc.scrollHeight - sc.clientHeight > 240;
  }, { timeout: 12000, polling: 150 }).then(() => true).catch(() => false);
  ok('SCROLL SETUP the screen is long enough to have a reading position at all', scrollable);
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
    const d = new Date(document.querySelector('.dayhdr').dataset.date + 'T12:00:00');
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
  /* RE-PREMISED 2026-08-27, and the reason is a conflict between two of Tom's
     own instructions rather than a bug.
       2026-08-22: "have quests be always under the initial 4 buttons (backpack
       stable kitchen etc)", which is what this row was written for.
       2026-08-27: the news banner "should be at the top above quests so that
       people actually see this news".
     Those cannot both be literally true. The newer one wins, so exactly ONE
     collapsed row is allowed between the doors and the quests: the news banner,
     by id. Anything else appearing there still fails, which is the part worth
     keeping. The nudge stack this row was written to keep out is still kept out. */
  const afterDoors = String(pastShape.afterDoors || '');
  ok('PASTDAY quests sit under the four doors, with nothing between them but the collapsed news banner',
    /q-collapse/.test(afterDoors) || /\bnb\b/.test(afterDoors),
    afterDoors);

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
    pick: document.querySelector('.dayhdr')?.dataset.date,
  }));
  /* Compared against the date the app itself showed on the first render, not
     against a date computed here: toISOString() is UTC and this app keys days
     locally, so a run after 20:00 EDT would grade against tomorrow. */
  ok('ESCAPE the next-day arrow lands back on today',
    home.h1 === 'Today' && !!todayShape.pickDate && home.pick === todayShape.pickDate,
    JSON.stringify({ ...home, expected: todayShape.pickDate }));

  // ------------------------------------------------------------- READONLY
  /* A PAST DAY'S QUESTS ARE A RECORD, NOT A THING TO ACT ON. Tom, 2026-08-23:
     "make past day quests read-only". v425 renders the whole day on a past day,
     which put a live Claim button on a quest finished days ago: real coins, real
     XP, minted retroactively from a screen that exists to be read.

     GRADED IN MONEY, NOT IN MARKUP. "no button is drawn" is the weakest possible
     version of this and would pass on a tree whose handler still pays, so the
     rows below fire the app's OWN claim control, with a real click, and read the
     coin balance and the xp ledger back afterwards. The handler is never called
     directly and no claim function is imported here.

     HOW A PAST-DAY CLAIM IS FIRED AT ALL, given the point is that no such button
     exists: today's live button is retargeted at the closed period by rewriting
     the one dataset field the handler reads for it, `data-pkey`. Everything else
     is the app's: its element, its listener, its lookup, its claim call. That is
     also the real threat model, since a stale closure, a re-render racing a day
     change and a hand-edited attribute all arrive at exactly this shape.

     CONTROL is not optional here: a guard that refuses every claim would pass
     the row above and break quests for everyone, so the same button, unmodified,
     must still pay on today. */
  const seedPast = await page.evaluate(async d => {
    // a weighed-in past day, so at least one of its quests is genuinely finished
    const db = await import('./js/db.js');
    await db.db.put('weights', { date: d, kg: 80, ts: Date.now() });
    return d;
  }, yesterday);
  await tapDay(page, 'prevDay', yesterday);
  /* OPENED THE WAY A PLAYER OPENS IT. The quests are a <details>: its rows are in
     the DOM either way, so the assertions would read fine on a collapsed card,
     but the control being fired below has to be one that is actually on screen,
     and the shot has to show what Tom would see. */
  const opened = await page.evaluate(() => {
    const d = document.querySelector('.q-collapse');
    if (!d) return false;
    if (!d.open) d.querySelector('summary').click();
    d.scrollIntoView({ block: 'start' });
    return d.open;
  });
  await sleep(700);
  ok('READONLY SETUP the quests card opened on the past day', opened);
  const ro = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('.q-collapse .q-row')].map(r => ({
      name: r.querySelector('.q-name')?.textContent.trim().split(' +')[0],
      pct: Math.round(parseFloat(r.querySelector('.q-bar i')?.style.width || '0')),
      claimed: !!r.querySelector('.q-done'),
      claimBtn: !!r.querySelector('[data-claim]'),
      inert: r.querySelector('.q-frac')?.textContent.trim() || null,
    }));
    return {
      rows,
      finishedUnclaimed: rows.filter(r => r.pct >= 100 && !r.claimed),
      claimControls: document.querySelectorAll('.q-collapse [data-claim]').length,
      note: document.querySelector('.q-collapse .q-card-body > .note')?.textContent.trim() || null,
      badge: document.querySelector('.q-collapse .q-badge')?.textContent.trim() || null,
      accent: document.querySelector('.q-collapse')?.className.includes('has-claim'),
    };
  });
  console.log('READONLY past day', JSON.stringify(ro, null, 1));
  ok('READONLY SAMPLE the past day really has a finished, unclaimed quest on it (an empty sample grades nothing)',
    ro.finishedUnclaimed.length >= 1, `${ro.finishedUnclaimed.length} of ${ro.rows.length} rows: ${ro.rows.map(r => `${r.name} ${r.pct}%`).join(' | ')}`);
  ok('READONLY a finished past-day quest offers no claim control at all',
    ro.finishedUnclaimed.every(r => !r.claimBtn) && ro.claimControls === 0, `${ro.claimControls} claim controls`);
  ok('READONLY it shows the inert idiom instead, so it reads as a record rather than a broken button',
    ro.finishedUnclaimed.every(r => !!r.inert), JSON.stringify(ro.finishedUnclaimed));
  ok('READONLY and the header stops advertising things to claim', !ro.badge && !ro.accent,
    `badge ${ro.badge}, accent ${ro.accent}`);
  ok('READONLY one line says why, in the app’s own note idiom', /record of/i.test(ro.note || ''), String(ro.note));
  await page.screenshot({ path: shotPath('d2-7-pastday-quests.png') });

  await tapDay(page, 'nextDay', todayShape.pickDate);
  const openQuests = () => page.evaluate(() => {
    const d = document.querySelector('.q-collapse');
    if (d && !d.open) d.querySelector('summary').click();
    d?.scrollIntoView({ block: 'start' });
    return !!d?.open;
  });
  await openQuests();
  await sleep(600);
  const wallet = () => page.evaluate(async k => {
    const [loot, game, db] = await Promise.all([import('./js/loot.js'), import('./js/game.js'), import('./js/db.js')]);
    const rows = await db.db.all('xp');
    return { coins: await loot.coins(), xp: await game.totalXp(),
      pastRows: rows.filter(r => r.key.startsWith(`quest-${k}-`) || r.key === `questsall-${k}`).length,
      questRows: rows.filter(r => r.type === 'quest').length };
  }, yesterday);

  /* SATISFY TODAY'S DAILIES BEFORE LOOKING FOR A CLAIM CONTROL. The three rows
     below press the app's own [data-claim][data-period="day"] button, and there
     IS no such button unless a daily quest is actually finished. Nothing here
     finished one: the suite relied on whatever the demo seed happened to satisfy
     lining up with whatever the date happened to draw.
     Measured at the failure: 2026-08-28 drew q-protein, q-sleep and q-scan, all
     three not done, zero claim controls, so READONLY SETUP reported {"ok":false}
     and took two more rows with it. It passed the night before on a draw the
     seed happened to cover. Same class as clock-trust #221, where the suite was
     "asking a day that had done nothing why it had not been paid".
     So the ungated set is satisfied through the REAL APIs the UI calls, not by
     writing quest rows directly: five logged meals (one via 'scan', all with a
     foodId, protein-heavy and on budget) plus water, bed, sleep and a weight.
     Whatever the date draws, it is done. */
  await page.evaluate(async () => {
    const [nut, game, db, well] = await Promise.all([
      import('./js/nutrition.js'), import('./js/game.js'),
      import('./js/db.js'), import('./js/wellness.js'),
    ]);
    const targets = { kcal: 2200, p: 150, c: 220, f: 70 };
    const day = nut.dateKey();
    const meals = [0, 1, 2, 3, 3];
    for (let i = 0; i < meals.length; i++) {
      const snack = i >= 3;
      const e = snack
        ? { id: `tc-${day}-s${i}`, date: day, meal: meals[i], name: 'Yoghurt and berries',
            foodId: `tcfood-${day}-${i}`, kcal: 200, p: 12, c: 20, f: 5, qty: 1, ts: Date.now() }
        : { id: `tc-${day}-${meals[i]}`, date: day, meal: meals[i], name: 'Chicken and rice',
            kcal: 600, p: 50, c: 60, f: 15, qty: 1, ts: Date.now() };
      await db.db.put('log', e);
      await game.onFoodLogged(e, { targets, via: snack ? 'scan' : null,
        entriesForDate: await db.db.byIndex('log', 'date', day) });
    }
    await well.addWater(well.WATER_GOAL, day);
    await well.markBed(day);
    await well.markSleep(8, day);
    await db.db.put('weights', { date: day, kg: 80 });
    const xp = await db.db.all('xp');
    /* Reported, never swallowed: a `.catch(() => {})` here hid a half-finished
       seed once already, and a silent partial seed looks exactly like an app
       that did not award anything. */
    return { ok: true, sleepRow: xp.some(r => r.key === `sleep-${day}`), day };
  }).then(r => console.log('DAILIES ' + JSON.stringify(r)))
    .catch(e => { throw new Error('seeding today\'s dailies threw: ' + e); });
  /* A REAL NAVIGATION. Setting location.hash to the value it ALREADY holds fires
     no hashchange, so route() never runs and the screen keeps the markup it was
     built with: the quests above were genuinely finished in the store (the seed
     block returns sleepRow true) and the panel still showed 0/1 because it had
     never been rebuilt. tests/emporium-audit.mjs records the same trap and cost
     four false failures to it. */
  await page.evaluate(() => { location.hash = '#/bonehead'; });
  await sleep(700);
  await page.evaluate(() => { location.hash = '#/today'; });
  await sleep(1600);
  await openQuests();
  await sleep(800);

  const beforeRetro = await wallet();
  const fired = await page.evaluate(k => {
    const b = document.querySelector('.q-collapse [data-claim][data-period="day"]');
    if (!b) return { ok: false };
    const was = b.dataset.pkey;
    b.dataset.pkey = k;                 // point the app's own control at the closed day
    b.click();                          // ...and press it for real
    return { ok: true, id: b.dataset.claim, was, now: b.dataset.pkey };
  }, yesterday);
  await sleep(2500);
  const afterRetro = await wallet();
  console.log('RETRO', JSON.stringify({ fired, beforeRetro, afterRetro }));
  ok('READONLY SETUP the app really had a live daily claim control to fire (an absent button grades nothing)',
    fired.ok && fired.was !== fired.now, JSON.stringify(fired));
  ok('READONLY firing the real claim control at a closed day pays NOTHING',
    afterRetro.coins === beforeRetro.coins && afterRetro.xp === beforeRetro.xp,
    `coins ${beforeRetro.coins} -> ${afterRetro.coins}, xp ${beforeRetro.xp} -> ${afterRetro.xp}`);
  ok('READONLY and mints no ledger row against that day',
    afterRetro.pastRows === beforeRetro.pastRows, `${beforeRetro.pastRows} -> ${afterRetro.pastRows} rows keyed to ${yesterday}`);

  /* CONTROL. Same button, this time untouched. If this stops paying, the guard
     above did not make past days read-only, it broke quests. */
  /* A FRESH BUTTON, not the one just sabotaged. `location.hash = '#/today'` while
     already on #/today fires no hashchange and re-renders NOTHING, so the first
     version of this row pressed the same retargeted control and read a refusal as
     a broken guard. A real day round-trip through the arrows rebuilds the markup,
     and the SETUP row below refuses to grade unless the control it is about to
     press really is pointed at today. */
  await tapDay(page, 'prevDay', yesterday);
  await tapDay(page, 'nextDay', todayShape.pickDate);
  await openQuests();
  await sleep(600);
  const beforeToday = await wallet();
  const firedToday = await page.evaluate(k => {
    const b = document.querySelector('.q-collapse [data-claim][data-period="day"]');
    if (!b) return { ok: false };
    if (b.dataset.pkey !== k) return { ok: false, stale: b.dataset.pkey };
    b.click();
    return { ok: true, id: b.dataset.claim, pkey: b.dataset.pkey };
  }, todayShape.pickDate);
  await sleep(3000);
  const afterToday = await wallet();
  console.log('CONTROL', JSON.stringify({ firedToday, beforeToday, afterToday }));
  ok('CONTROL SETUP a FRESH claim control, pointed at today, was there to press (a stale or absent one grades nothing)',
    firedToday.ok && firedToday.pkey === todayShape.pickDate, JSON.stringify(firedToday));
  ok('CONTROL today’s claim still pays, so the guard closed the past and nothing else',
    afterToday.coins > beforeToday.coins && afterToday.questRows === beforeToday.questRows + 1,
    `coins ${beforeToday.coins} -> ${afterToday.coins}, quest rows ${beforeToday.questRows} -> ${afterToday.questRows}`);
} finally {
  await browser.close();
  srv?.close?.();
}

console.log(bad ? `\n${bad} FAILED` : '\nTODAY CONTAINER VERIFIED');
process.exit(bad ? 1 : 0);
