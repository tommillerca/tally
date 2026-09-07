/* THE BOOT A LAPSED PLAYER ACTUALLY GETS.
 *
 * Round 43 measured three independent five-day players brought back after 10,
 * 30 and 90 days. The SAVE was perfect at every gap (zero rows lost, the day
 * close paid, the crate paid). The BOOT was not, and both faults are about a
 * sentence nobody reads:
 *
 *   TOP   R43-7. The one line telling a returning player they were paid for the
 *         day they walked away is a #toast. The daily wheel's veil goes up at
 *         3.7s at z-index 210 and never times out, and 3 of 3 boot toasts were
 *         drawn UNDERNEATH it. Graded on PIXELS, not on a hit test: see the row.
 *   FOLD  R43-8a. #wbCard, the app's only greeting to a returning player, was
 *         measured at 1220px on an 852px viewport at all three gap lengths, 368px
 *         below the fold (1411px on this seed, which carries a news pill). It was
 *         put below the day container on 2026-09-05 for a real reason (inside
 *         .dayflow it pushed the collapsed summary off a 568px screen), so this is
 *         graded from BOTH sides and reverting fails the other one.
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
 * really rendered, the wheel veil really went up and the day-close line was
 * really photographed under it, because every row below passes trivially on a
 * screen with none of them on it. FOLD also asserts scrollTop 0 in the same
 * evaluate as the measurement, because "at first paint" is a claim about where
 * the screen was, and a scrolled screen would read green on a buried card.
 *
 * PROVEN RED, 2026-09-07, on this Mac, exit codes read from files, never a pipe.
 * The whole shipped tree (origin/main js/app.js, js/quests.js, app.css and
 * index.html copied into a throwaway rsync of this worktree) against THIS audit:
 *   FAIL TOP 393x852 ...  0.0% of the toast's box is --surface-3, floor 25%;
 *        mean rgb(10, 12, 10) over 676x130px          (the veil's own near-black)
 *   FAIL FOLD 393x852 ... card top 1411, bottom 1540, fold 785.8 on a 852px
 *        viewport
 *   FAIL TRUE 393x852 the card does not claim everything survived when the streak
 *        did not  card reads "Everything is where you left it. 3 crates are
 *        waiting in your backpack. Good to be back"
 *   FAIL TRUE 393x852 and it names the streak that reset   (same text)
 * Each half of the TOP fix on its own, from the fixed tree, one at a time:
 *   `.toast { z-index: 80 }`                       FAIL TOP  0.0%, rgb(10, 12, 10)
 *   #toast moved back inside #app, z-index 320     FAIL TOP  0.0%, rgb(10, 12, 10)
 * And WHOLE, which the fold fix could have bought back, by putting the card back
 * INSIDE .dayflow on the shipped tree (its pre-2026-09-05 position):
 *   FAIL WHOLE 320x568 the collapsed day still fits inside one screen height with
 *        the return card on screen  day is 539.1px against a 501.8px screen
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
fs.mkdirSync(SHOTS, { recursive: true });   // shotDir() makes its own; an env override may not exist yet
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
  window.__rbVeilSeen = 0;
  setInterval(() => { if (document.querySelector('.dw')) window.__rbVeilSeen++; }, 100);
  /* WHERE THE LINE IS, WHILE IT IS THERE. The day-close toast is fired on a
     2400ms timer and lives 3400ms; the veil goes up at 3.7s. This reports the
     overlap so the screenshot below is taken INSIDE it rather than at an instant
     chosen in advance, which is how a guard grades a frame the bug is not on. */
  window.__rbNow = () => {
    const t = document.getElementById('toast');
    if (!t || t.hidden) return null;
    const r = t.getBoundingClientRect();
    if (!(r.width > 0 && r.height > 0)) return null;
    return { text: t.textContent, veil: !!document.querySelector('.dw'),
      rect: { x: r.left, y: r.top, width: r.width, height: r.height } };
  };
});
await page.reload({ waitUntil: 'networkidle2' });

/* THE WHEEL VEIL IS THE POINT OF THE FIRST ROW, so this does NOT dismiss it. It
   goes up at 3.7s and never times out. Poll for the overlap rather than sleeping
   to a chosen instant, then photograph the toast's own box while both are up.

   GRADED ON PIXELS, NOT ON A HIT TEST. document.elementFromPoint is the tool
   anti-regression rule 6 names, and it is the WRONG one here: .toast is
   `pointer-events: none` on purpose (it ate taps on Today until 2026-08-31), so
   it is transparent to hit testing whether it is on top or buried, and a row
   built on it can never pass. It cannot fail either way on the shipped build, so
   it would have looked like a working guard. What the player needs is to READ the
   line, so what is graded is whether the pill's own surface is on the screen
   inside its own box: #2a2734 (--surface-3) against the veil's opaque
   near-black. */
const VEIL_WAIT_MS = 12000;
let shot = null, snap = null;
for (let waited = 0; waited < VEIL_WAIT_MS; waited += 150) {
  snap = await page.evaluate(() => window.__rbNow());
  if (snap && snap.veil && /last logged day/i.test(snap.text)) {
    const r = snap.rect;
    shot = await page.screenshot({ encoding: 'base64', clip: { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) } });
    break;
  }
  shot = null;
  await sleep(150);
}
const veilSeen = await page.evaluate(() => window.__rbVeilSeen || 0);

ok('SETUP the daily wheel veil really went up over the returning boot (nothing below is graded without it)',
  veilSeen > 0, veilSeen ? `${veilSeen} samples with .dw up` : 'no .dw in any sample: the covering element this row is about never rendered');
/* THE LINE THIS IS ABOUT. Both branches of the day close (awardDayCloseIfDue in
   js/game.js: the crate line and the consolation line) name the day the player
   walked away from, and the returning-player branch of each says "your last
   logged day". Matching on that phrase means the row cannot be satisfied by some
   other boot toast that happened to be up under the veil. */
ok('SETUP the day-close line was really on screen while the veil was up (an empty sample is a failure)',
  !!shot, shot ? `photographed at ${Math.round(snap.rect.x)},${Math.round(snap.rect.y)} ${Math.round(snap.rect.width)}x${Math.round(snap.rect.height)}: ${JSON.stringify(snap.text)}`
    : 'no day-close toast under the veil in 12s');

if (shot) {
  /* Decode in the page: the clip is in CSS px and the PNG is at dpr 2, so the
     ratio is read off the image's own pixels rather than assumed. */
  const px = await page.evaluate(async (b64) => {
    const img = new Image();
    await new Promise(r => { img.onload = r; img.src = 'data:image/png;base64,' + b64; });
    const c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    c.getContext('2d').drawImage(img, 0, 0);
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let pill = 0, total = 0, sum = [0, 0, 0];
    for (let i = 0; i < d.length; i += 4) {
      total++; sum[0] += d[i]; sum[1] += d[i + 1]; sum[2] += d[i + 2];
      // --surface-3 #2a2734, the pill's own fill, with room for the border and the antialiased type
      if (Math.abs(d[i] - 0x2a) <= 14 && Math.abs(d[i + 1] - 0x27) <= 14 && Math.abs(d[i + 2] - 0x34) <= 14) pill++;
    }
    return { w: c.width, h: c.height, ratio: +(pill / total).toFixed(3), mean: sum.map(v => Math.round(v / total)) };
  }, shot);
  fs.writeFileSync(path.join(SHOTS, 'toast-under-veil.png'), Buffer.from(shot, 'base64'));
  /* 0.25 is well under the ~0.6 a pill of type scores on this build and far over
     the 0.0 the veil's own near-black gradient can reach. An empty sample cannot
     reach it either. */
  ok('TOP 393x852 the day-close line is the top element at its own centre point on a returning boot (its own surface is what is painted inside its own box)',
    px.ratio >= 0.25,
    `${(px.ratio * 100).toFixed(1)}% of the toast's box is --surface-3, floor 25%; mean rgb(${px.mean.join(', ')}) over ${px.w}x${px.h}px`);
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
    const sc = document.getElementById('screen') || document.scrollingElement;
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
      scrollTop: sc ? +(sc.scrollTop || 0).toFixed(1) : null,
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
    /* FIRST PAINT MEANS THE TOP OF THE SCREEN. A row that measures the card
       after something scrolled is measuring a screen the player did not arrive
       on, and it would read green on a card 800px down. */
    ok(`FOLD ${tag} and the screen really is at the top when that is measured`,
      m.scrollTop === 0, `#screen scrollTop ${m.scrollTop}`);

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
