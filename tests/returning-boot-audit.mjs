/* THE BOOT A LAPSED PLAYER ACTUALLY GETS.
 *
 * Round 43 measured three independent five-day players brought back after 10,
 * 30 and 90 days. The SAVE was perfect at every gap (zero rows lost, the day
 * close paid, the crate paid). The BOOT was not, and both faults are about a
 * sentence nobody reads:
 *
 *   TOP   R43-7. The one line telling a returning player they were paid for the
 *         day they walked away is a #toast at z-index 80. The daily wheel's veil
 *         goes up at 3.7s at z-index 210 and never times out, so 3 of 3 boot
 *         toasts were drawn UNDERNEATH it. Graded by hit test, not by geometry:
 *         document.elementFromPoint at the toast's own centre has to answer the
 *         toast (or something inside it), because a getBoundingClientRect over a
 *         covered element reads perfectly (anti-regression rule 6).
 *   FOLD  R43-8a. #wbCard, the app's only greeting to a returning player, was
 *         measured at 1220px on an 852px viewport at all three gap lengths: 368px
 *         below the fold. It was put below the day container on 2026-09-05 for a
 *         real reason (inside .dayflow it pushed the collapsed summary off a
 *         568px screen) so this is graded from BOTH sides, and reverting fails
 *         the other one.
 *   WHOLE R43-8b. The 320x568 half of that trade: .dayblk still fits inside one
 *         screen height, which is exactly what today-peek-audit's WHOLE row
 *         holds, re-asserted here on a LAPSED seed so the fix cannot buy the fold
 *         back by growing the day.
 *   TRUE  R43-8c. The card said "Everything is where you left it." while the
 *         streak read 5 to 0 at every gap, and nothing on Today mentions the
 *         streak at all. The card's own design note is right that a day count is
 *         an accusation; claiming everything survived is the opposite error. The
 *         row grades the RENDERED card text: it must not claim everything, and it
 *         must name the streak.
 *
 * THE SEED IS THE REAL PATH, not a stamped flag. A log row and kv 'lastOpenDay'
 * are backdated by GAP_DAYS and the page is reloaded, so maybeWelcomeBack() is
 * what decides the player is back and what writes 'wbReturnDay'. Stamping
 * wbReturnDay directly would have graded a card the app might never raise.
 *
 * AN EMPTY SAMPLE IS A FAILURE. SETUP refuses to grade anything unless the card
 * really rendered and the wheel veil really went up, because every row below
 * passes trivially on a screen with neither on it.
 *
 * PROVEN RED, 2026-09-07, on this tree, one revert at a time, exit codes to files:
 *   TOP    `.toast { z-index: 80 }` restored (app.css):
 *     FAIL TOP 393x852 the day-close line is the top element at its own centre
 *          point  covered by DIV.dw at (196, 700)
 *   FOLD   #wbCard moved back below the day section (js/app.js):
 *     FAIL FOLD 393x852 the returning player's greeting is above the fold at
 *          first paint  card top 1220.0 against a 852px viewport
 *   TRUE   the headline restored to "Everything is where you left it.":
 *     FAIL TRUE 393x852 the card does not claim everything survived when the
 *          streak did not  says "everything"
 *     FAIL TRUE 393x852 and it names the streak that reset  no mention of the
 *          streak
 *   WHOLE  #wbCard moved back INSIDE .dayflow (the pre-2026-09-05 position):
 *     FAIL WHOLE 320x568 the collapsed day still fits inside one screen height
 *          day is 611.4px against a 501.8px screen
 *
 * Run: node tests/returning-boot-audit.mjs [baseUrl]
 */
import { boot, settle, sleep, serveTree, shotDir } from './godmode.js';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const argv = process.argv[2] || process.env.URL;
const srvHandle = argv ? null : await serveTree(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));
const base = argv || srvHandle.url;
const SHOTS = process.env.SHOT_DIR || shotDir('returning-boot');
const fails = [];
const ok = (name, pass, detail = '') => {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
  if (!pass) fails.push(name);
};

/* 90 days is the longest gap round 43 drove and the one R43-12 is about. The
   card, the toast and the layout are identical at 10 and 30 (measured 3 of 3 at
   each), so one gap is graded here and the pool-level rules are unit rows. */
const GAP_DAYS = 90;
const CONFIGS = [{ w: 393, h: 852 }, { w: 320, h: 568 }];

const { browser, page } = await boot(base);
/* THE GRADED BOOT HAPPENS AT 393x852, not at boot()'s 430x932 default: the row
   below names that viewport and a row must be measured where it says it was. */
await page.setViewport({ width: CONFIGS[0].w, height: CONFIGS[0].h, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const errs = [];
page.on('pageerror', e => errs.push(e.message));

/* Backdate the save, then let the app decide. dateKey() is local, not UTC: a
   UTC day key is a different day to everything in the app that groups by
   dateKey, which is how a seed written at 9pm landed on tomorrow (godmode). */
const day = (offset) => {
  const d = new Date(); d.setDate(d.getDate() - offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
await page.evaluate(async (gapDay) => {
  const db = await new Promise((res, rej) => {
    const r = indexedDB.open('tally-demo'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
  await new Promise((res, rej) => {
    const tx = db.transaction(['log', 'kv'], 'readwrite');
    /* THE DEMO PROFILE IS A COMMITTED PLAYER: seedDemo writes a fortnight of
       logs ending yesterday, every one of them already closed. Left in place the
       "last logged day" is yesterday and awardDayCloseIfDue pays nothing, so the
       one sentence this file is about never fires. Clearing the log store is what
       makes this a LAPSED save rather than a busy one. */
    tx.objectStore('log').clear();
    /* On budget against the demo profile's 2570 kcal target (>= 60%, <= 100%),
       so the close pays the crate line rather than the consolation line. */
    tx.objectStore('log').put({ id: 'lapsed-seed-1', date: gapDay, meal: 0, name: 'Oats', kcal: 1800, p: 80, c: 200, f: 60, ts: Date.now() });
    tx.objectStore('kv').put({ k: 'lastOpenDay', v: gapDay });
    /* boot()'s dismissOverlays already spun today's wheel on the throwaway first
       load, and 'wheelLastDate' is what stops it coming back. Clearing it is what
       makes the GRADED load a real returning boot: veil up at 3.7s, day-close
       toast fired at 2400ms, exactly the overlap R43-7 measured. */
    tx.objectStore('kv').delete('wheelLastDate');
    tx.oncomplete = res; tx.onerror = () => rej(tx.error);
  });
}, day(GAP_DAYS));
/* THE WHEEL IS SUPPRESSED UNDER AUTOMATION ON PURPOSE (js/wheel.js CALM_BOOT:
   navigator.webdriver means no device check could ever reach Today). __wheelForce
   is that module's own escape hatch and it grants nothing: the wheelLastDate gate
   and the monotonic day guard both still run, so what comes up here is the real
   daily wheel on the real path, not a veil painted by the harness. */
await page.evaluateOnNewDocument(() => {
  window.__wheelForce = true;
  /* SAMPLE THE OVERLAP, DO NOT GUESS AT IT. The day-close toast is fired on a
     2400ms timer and lives 3400ms; the veil goes up at 3.7s. A single
     screenshot at a chosen instant grades whatever happened to be on screen at
     that instant, which is how a guard reads green on the broken build. This
     polls every 100ms from the first paint and hit-tests the toast AT ITS OWN
     CENTRE in the same tick it is measured, so every frame where a boot toast
     and the veil are both up is graded. */
  window.__rbSamples = [];
  window.__rbVeilSeen = 0;
  setInterval(() => {
    if (document.querySelector('.dw')) window.__rbVeilSeen++;
    const t = document.getElementById('toast');
    if (!t || t.hidden) return;
    const r = t.getBoundingClientRect();
    if (!(r.width > 0 && r.height > 0)) return;
    const x = Math.round(r.left + r.width / 2), y = Math.round(r.top + r.height / 2);
    const el = document.elementFromPoint(x, y);
    window.__rbSamples.push({
      t: Math.round(performance.now()),
      text: t.textContent,
      veil: !!document.querySelector('.dw'),
      x, y,
      inToast: !!el && (el === t || t.contains(el)),
      hit: el ? el.tagName + (el.id ? '#' + el.id : '') + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/)[0] : '') : 'nothing',
    });
  }, 100);
});
await page.reload({ waitUntil: 'networkidle2' });

/* THE WHEEL VEIL IS THE POINT OF THE FIRST ROW, so this does NOT dismiss it. It
   goes up at 3.7s and never times out; the boot toasts run from 2400ms. Wait out
   the whole window, then read the samples. */
await sleep(9000);

const { samples, veilSeen } = await page.evaluate(() => ({ samples: window.__rbSamples || [], veilSeen: window.__rbVeilSeen || 0 }));
const veiled = samples.filter(s => s.veil);
/* THE LINE THIS IS ABOUT. Both branches of the day close (awardDayCloseIfDue in
   js/app.js: the crate line and the consolation line) name the day the player
   walked away from, and the returning-player branch of each says "your last
   logged day". Matching on that phrase means the row cannot be satisfied by some
   other boot toast that happened to be up under the veil. */
const isDayClose = s => /last logged day/i.test(s.text);
const dayCloseVeiled = veiled.filter(isDayClose);

ok('SETUP the daily wheel veil really went up over the returning boot (nothing below is graded without it)',
  veilSeen > 0, veilSeen ? `${veilSeen} samples with .dw up` : 'no .dw in any sample: the covering element this row is about never rendered');
ok('SETUP the day-close line was really on screen while the veil was up (an empty sample is a failure)',
  dayCloseVeiled.length > 0,
  dayCloseVeiled.length ? `${dayCloseVeiled.length} samples, first at ${dayCloseVeiled[0].t}ms: ${JSON.stringify(dayCloseVeiled[0].text)}`
    : `no day-close toast under the veil; saw ${JSON.stringify([...new Set(samples.map(s => s.text))])}`);

if (dayCloseVeiled.length) {
  const covered = dayCloseVeiled.filter(s => !s.inToast);
  ok('TOP 393x852 the day-close line is the top element at its own centre point on a returning boot',
    covered.length === 0,
    covered.length ? `covered in ${covered.length}/${dayCloseVeiled.length} samples by ${[...new Set(covered.map(s => s.hit))].join(', ')} at (${covered[0].x}, ${covered[0].y})`
      : `${dayCloseVeiled.length}/${dayCloseVeiled.length} samples answer the toast itself`);
}

/* Now clear the wheel and grade the settled Today, which is what the fold rows
   are about: scrollTop 0, wheel gone, first paint of the screen a returning
   player is left on. */
await page.evaluate(() => document.querySelector('.dw')?.remove());
await settle(page, 400);

for (const cfg of CONFIGS) {
  const tag = `${cfg.w}x${cfg.h}`;
  await page.setViewport({ width: cfg.w, height: cfg.h, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await settle(page, 500);
  await page.evaluate(() => {
    const sc = document.getElementById('screen') || document.scrollingElement;
    if (sc) sc.scrollTop = 0;
    window.scrollTo(0, 0);
  });
  await sleep(250);
  const m = await page.evaluate(() => {
    const card = document.getElementById('wbCard');
    const dayBox = document.querySelector('section.dayblk');
    const tabs = document.querySelector('.tabbar');
    const fold = tabs ? tabs.getBoundingClientRect().top : window.innerHeight;
    const cr = card ? card.getBoundingClientRect() : null;
    const dr = dayBox ? dayBox.getBoundingClientRect() : null;
    return {
      cardTop: cr ? +cr.top.toFixed(1) : null,
      cardBottom: cr ? +cr.bottom.toFixed(1) : null,
      cardText: card ? card.textContent.replace(/\s+/g, ' ').trim() : null,
      dayH: dr ? +(dr.bottom - dr.top).toFixed(1) : null,
      fold: +fold.toFixed(1),
      vh: window.innerHeight,
    };
  });
  fs.writeFileSync(path.join(SHOTS, `returning-${tag}.png`), await page.screenshot({ encoding: 'binary' }));

  ok(`SETUP ${tag} the return card really rendered (an empty sample is a failure)`,
    m.cardTop != null, m.cardTop != null ? `#wbCard top ${m.cardTop}` : 'no #wbCard on Today');
  if (m.cardTop == null) continue;

  if (cfg.w === 393) {
    /* ABOVE THE FOLD MEANS READABLE, not "starts one pixel up". The card is the
       app's whole greeting, so the row is its TOP above the tab bar with enough
       of it showing to read the headline: 44px is the headline line plus its
       padding, measured on this build. */
    ok(`FOLD ${tag} the returning player's greeting is above the fold at first paint`,
      m.cardTop < m.fold - 44,
      `card top ${m.cardTop}, bottom ${m.cardBottom}, fold ${m.fold} on a ${m.vh}px viewport`);

    const text = (m.cardText || '').toLowerCase();
    ok(`TRUE ${tag} the card does not claim everything survived when the streak did not`,
      !/\beverything\b/.test(text), `card reads ${JSON.stringify(m.cardText)}`);
    ok(`TRUE ${tag} and it names the streak that reset`,
      /streak/.test(text), `card reads ${JSON.stringify(m.cardText)}`);
  }

  if (cfg.w === 320) {
    /* today-peek-audit's WHOLE row, re-asserted on a LAPSED seed. That audit
       runs on an ordinary save, so it cannot see a return card growing the day;
       this is the side of the 2026-09-05 trade that the fold row could buy back. */
    ok(`WHOLE ${tag} the collapsed day still fits inside one screen height with the return card on screen`,
      m.dayH != null && m.dayH <= m.fold,
      m.dayH != null ? `day is ${m.dayH}px against a ${m.fold}px screen` : 'no section.dayblk to measure');
  }
}

ok('CLEAN no JS errors on the returning boot', errs.length === 0, errs.join(' | ') || 'none');

console.log(`\nshots: ${SHOTS}`);
await browser.close();
if (srvHandle) srvHandle.close();
console.log(fails.length ? `\n${fails.length} FAILED` : '\nall rows passed');
process.exit(fails.length ? 1 : 0);
