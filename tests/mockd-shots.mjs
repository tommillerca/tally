/* MOCKUP capture for the Today pass-two rework (branch x425/mockup-today-v2).
 * Serves THIS tree, boots ?demo, seeds a level, and captures four shots per
 * variant at iPhone dimensions: top of Today, the day-anchored sections, deep
 * in the food log, and a PAST day reached by tapping the real back arrow.
 *
 * Every capture is gated on assertions that the page IS the variant it claims:
 * the body class, the day header present with the arrows inside it, the OLD
 * orphan `.day-strip` row genuinely absent, the promo banner outside the day
 * flow on the side the variant chose, and the pinned/not-pinned state the shot
 * is supposed to show. A stale draft has posed as a fix in this repo before.
 * The day arrows are also hit-tested with elementFromPoint in both the resting
 * and the pinned state (anti-regression rule 6: a floating element made day
 * navigation impossible for a whole release).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serveTree, boot, seed, dismissOverlays, sleep } from './godmode.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, '_feedback_shots', 'today-v2');
fs.mkdirSync(OUT, { recursive: true });

let fails = 0;
const check = (ok, msg) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`); if (!ok) fails++; };

/* Where is the promo banner relative to the day block? "up" = before it, "down"
 * = after it, "inside" = still interrupting the day (the bug this pass kills). */
const promoWhere = page => page.evaluate(() => {
  const promo = document.querySelector('.promo-slot'), day = document.querySelector('.dayblk');
  if (!promo || !day) return promo ? 'no-day' : 'none';
  if (day.contains(promo)) return 'inside';
  return (promo.compareDocumentPosition(day) & Node.DOCUMENT_POSITION_FOLLOWING) ? 'up' : 'down';
});

/* elementFromPoint at the centre of each day control; the answer must be that
 * control (or a child of it), never the header chrome or something floating. */
const hitTest = page => page.evaluate(() => {
  const out = {};
  for (const id of ['prevDay', 'nextDay', 'todaySettings']) {
    const b = document.getElementById(id);
    if (!b) { out[id] = 'MISSING'; continue; }
    const r = b.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    out[id] = !hit ? 'null' : (b.contains(hit) ? 'ok' : (hit.id || hit.className || hit.tagName));
  }
  return out;
});

const srv = await serveTree(ROOT);
const { browser, page, errors } = await boot(srv.url);
await seed(page, { level: 8 });
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });

const land = async v => {
  /* The overlay sweep can click a quest Claim and ride its reward flow off
     Today; a second load arrives with the overlays already claimed. */
  await page.goto(`${srv.url}?demo&mockd=${v}`, { waitUntil: 'networkidle2' });
  await sleep(2200);
  await dismissOverlays(page);
  await page.goto(`${srv.url}?demo&mockd=${v}`, { waitUntil: 'networkidle2' });
  await sleep(2400);
};

for (const v of ['1', '2', '3']) {
  await land(v);

  const st = await page.evaluate(() => {
    const hdr = document.querySelector('.dayhdr');
    return {
      body: document.body.className,
      hdr: !!hdr,
      arrowsInside: !!(hdr && hdr.querySelector('#prevDay') && hdr.querySelector('#nextDay') && hdr.querySelector('#todaySettings')),
      orphanRow: !!document.querySelector('.day-strip'),
      flow: !!document.querySelector('.dayblk > .dayflow'),
      nested: document.querySelectorAll('.dayflow .tsec').length,
      strayTsec: document.querySelectorAll('.tsec:not(.dayflow .tsec)').length,
      nudge: !!document.querySelector('#unlockNudge'),
      quests: !!document.querySelector('.q-collapse'),
      dayTitle: hdr ? hdr.querySelector('.day-title h1').textContent.trim() + ' ' + hdr.querySelector('.day-title .sub').textContent.trim() : '',
    };
  });
  check(st.body.includes('mockd' + v), `d${v}: body carries mockd${v} (got "${st.body}")`);
  check(st.hdr, `d${v}: one day header present`);
  check(st.arrowsInside, `d${v}: day arrows + gear live INSIDE the header`);
  check(!st.orphanRow, `d${v}: the orphan .day-strip row is gone`);
  check(st.flow, `d${v}: .dayflow nests under the header`);
  check(st.nested >= 4, `d${v}: ${st.nested} sections nested inside the day`);
  check(st.strayTsec === 0, `d${v}: no day-scoped section left outside the day (${st.strayTsec} stray)`);
  check(!st.nudge, `d${v}: the breakfast nudge is gone`);
  check(st.quests, `d${v}: quests present under the hub chips`);
  check(/^Today /.test(st.dayTitle), `d${v}: header reads "${st.dayTitle}"`);

  const where = await promoWhere(page);
  check(where === (v === '2' ? 'down' : 'up'), `d${v}: promo evicted ${where} (expected ${v === '2' ? 'down' : 'up'})`);

  // (a) top of Today
  await page.evaluate(() => { document.querySelector('.screen').scrollTop = 0; });
  await sleep(600);
  const condA = await page.evaluate(() => document.querySelector('.dayhdr').classList.contains('cond'));
  check(!condA, `d${v}: header RESTING in the top shot`);
  await page.screenshot({ path: path.join(OUT, `d${v}-1-top.png`) });

  // (b) the day header with its nested sections arriving under it. The day is
  // far below the fold at scrollTop 0, so this — not the top shot — is where the
  // resting header is on screen and its controls can be hit-tested at all.
  const hdrTop = await page.evaluate(() => document.querySelector('#dayHdrPin').offsetTop);
  await page.evaluate(t => { document.querySelector('.screen').scrollTop = t - 30; }, Math.max(30, hdrTop));
  await sleep(700);
  const condB = await page.evaluate(() => document.querySelector('.dayhdr').classList.contains('cond'));
  check(!condB, `d${v}: header RESTING (not yet pinned) in the day shot`);
  const restHits = await hitTest(page);
  check(Object.values(restHits).every(x => x === 'ok'), `d${v}: day controls hittable at rest (${JSON.stringify(restHits)})`);
  await page.screenshot({ path: path.join(OUT, `d${v}-2-day.png`) });

  // (c) deep into the food log; mockd1/3 pin, mockd2 by design does not
  await page.evaluate(t => { document.querySelector('.screen').scrollTop = t + 1150; }, hdrTop);
  await sleep(800);
  const condC = await page.evaluate(() => document.querySelector('.dayhdr').classList.contains('cond'));
  check(condC === (v !== '2'), `d${v}: header ${condC ? 'PINNED' : 'not pinned'} deep in the log (expected ${v !== '2' ? 'pinned' : 'not pinned'})`);
  if (v !== '2') {
    const hits = await hitTest(page);
    check(Object.values(hits).every(x => x === 'ok'), `d${v}: day controls still hittable while pinned (${JSON.stringify(hits)})`);
  }
  await page.screenshot({ path: path.join(OUT, `d${v}-3-food.png`) });

  // (e) the bottom: where the day ENDS, and where mockd2's evicted promo landed
  await page.evaluate(() => { const s = document.querySelector('.screen'); s.scrollTop = s.scrollHeight; });
  await sleep(800);
  await page.screenshot({ path: path.join(OUT, `d${v}-5-bottom.png`) });

  // (d) a PAST day, reached by tapping the real back arrow
  await page.evaluate(() => { document.querySelector('.screen').scrollTop = 0; });
  await sleep(400);
  await page.click('#prevDay');
  await sleep(1400);
  const past = await page.evaluate(() => {
    const hdr = document.querySelector('.dayhdr');
    return {
      title: hdr ? hdr.querySelector('.day-title h1').textContent.trim() : '',
      sub: hdr ? hdr.querySelector('.day-title .sub').textContent.trim() : '',
      orphanRow: !!document.querySelector('.day-strip'),
      flow: !!document.querySelector('.dayblk > .dayflow'),
      nested: document.querySelectorAll('.dayflow .tsec').length,
      promo: !!document.querySelector('.promo-slot'),
    };
  });
  check(past.title !== '' && past.title !== 'Today', `d${v}: past day header reads "${past.title} ${past.sub}"`);
  check(!past.orphanRow, `d${v}: past day has no orphan .day-strip either`);
  check(past.flow && past.nested >= 2, `d${v}: past day still nests ${past.nested} sections under its header`);
  check(!past.promo, `d${v}: no promo banner on a past day`);
  /* Framed on the day itself, not the top of the screen: a past day's whole
     question is whether the header still holds a thinner day together, and the
     day sits below the fold on every variant. */
  const pastTop = await page.evaluate(() => document.querySelector('#dayHdrPin').offsetTop);
  await page.evaluate(t => { document.querySelector('.screen').scrollTop = t - 30; }, Math.max(30, pastTop));
  await sleep(700);
  const pastCond = await page.evaluate(() => document.querySelector('.dayhdr').classList.contains('cond'));
  check(!pastCond, `d${v}: past-day header RESTING in its shot`);
  await page.screenshot({ path: path.join(OUT, `d${v}-4-pastday.png`) });
}

check(errors.length === 0, `no page errors (${errors.length ? errors.join(' | ') : 'clean'})`);
await browser.close();
srv.close();
console.log(fails ? `\n${fails} FAILURES` : '\nALL GREEN');
process.exit(fails ? 1 : 0);
