/* THE REACH BATCH: the three changes whose whole point is that a player who has
 * never gardened is treated differently, plus the trust line under the numbers.
 * Every check here OPERATES the real control on a real boot; nothing is graded by
 * reading source except the analytics rows, which cannot be observed at runtime
 * (see ITEM 2 below for why, stated rather than hidden).
 *
 *   ITEM 1  the Today banner is no longer gated on ripe crops, so a first-timer
 *           sees it. Fresh profile, zero plots planted, banner present, VISIBLE,
 *           hit-tested, and its CTA lands on the Bone Garden.
 *   ITEM 4  the welcome kit grants a starter pouch, read back through the garden
 *           UI, and a SECOND grant pays nothing (rewarded-actions SOP rule 5).
 *   ITEM 6  the food-log boundary line sits at the bottom of the diary, under the
 *           numbers, visible, on every day.
 *   ITEM 3  the plant sheet names what a seed is FOR (bonus pin, same batch).
 *
 * Self-serves this checkout when no URL is given, because the default in boot()
 * is PRODUCTION and an audit that silently grades the live site while reading as
 * coverage of the tree under test is worse than no audit.
 *
 * Usage: node tests/garden-reach-audit.mjs [url]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boot, serveTree, sleep } from './godmode.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = process.argv[2] || process.env.URL;
const server = arg ? null : await serveTree(ROOT);
const { browser, page, errors } = await boot(arg || server.url);

let bad = 0;
const check = (l, ok, d = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${l}${d ? '  ' + d : ''}`); if (!ok) bad++; };

const closeSheets = async () => {
  for (let i = 0; i < 6; i++) {
    const open = await page.evaluate(() => !!document.querySelector('#sheets > div'));
    if (!open) break;
    await page.evaluate(() => history.back());
    await sleep(500);
  }
};
const gotoToday = async () => {
  await closeSheets();
  await page.evaluate(() => { location.hash = '#/today'; });
  await sleep(1800);
  await page.evaluate(() => { document.querySelector('.dw')?.remove(); document.querySelector('.drop-veil')?.remove(); });
  await sleep(300);
};
// click where a thumb would: a real mouse event at the element's centre, after
// scrolling it into view (a below-the-fold element measures fine and gets clicked
// in dead space)
const tap = async (sel) => {
  const hit = await page.evaluate(s => {
    const el = document.querySelector(s);
    if (!el) return null;
    el.scrollIntoView({ block: 'center' });
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return { dead: true };
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, sel);
  if (!hit || hit.dead) return false;
  await page.mouse.click(hit.x, hit.y);
  return true;
};

/* ================= ITEM 1: the door banner, with nothing planted ================= */
await gotoToday();

// STATE FIRST. This check is only about the never-planted player, so prove that
// is the state being measured before grading anything (rule 12).
const virgin = await page.evaluate(async () => {
  const g = await import('./js/garden.js');
  const st = await g.gardenState();
  return { ready: st.readyCount, planted: st.plots.filter(p => !p.empty).length };
});
console.log('garden state at check time:', JSON.stringify(virgin));
check('ITEM 1 the profile under test really has nothing planted', virgin.planted === 0 && virgin.ready === 0, JSON.stringify(virgin));

const banner = await page.evaluate(() => {
  const d = document.querySelector('details.garden-banner');
  if (!d) return null;
  const s = d.querySelector('summary');
  // scroll it in first: elementFromPoint takes VIEWPORT coordinates and returns
  // null for anything below the fold, which reads as "covered" when it is not
  s.scrollIntoView({ block: 'center' });
  const r = s.getBoundingClientRect();
  // VISIBLE, not merely present: a row in the DOM with no box is not a door.
  const cs = getComputedStyle(d);
  return {
    w: Math.round(r.width), h: Math.round(r.height),
    display: cs.display, visibility: cs.visibility, opacity: cs.opacity,
    text: s.textContent.replace(/\s+/g, ' ').trim(),
    iconDrawn: !!s.querySelector('svg'),
    open: d.open,
    // and it must be reachable: whatever is on top at the summary's centre has to
    // be the summary itself (anti-regression rule 6)
    onTop: (() => {
      const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return el ? (el.closest('summary') === s ? 'summary' : el.className || el.tagName) : 'nothing';
    })(),
  };
});
console.log('banner:', JSON.stringify(banner));
check('ITEM 1 a player who never planted still gets the garden banner', !!banner);
if (banner) {
  check('ITEM 1 it has a real box on screen', banner.w > 100 && banner.h > 20 && banner.visibility === 'visible' && banner.opacity !== '0',
    `${banner.w}x${banner.h} ${banner.visibility} @${banner.opacity}`);
  check('ITEM 1 nothing covers it', banner.onTop === 'summary', banner.onTop);
  check('ITEM 1 it uses the no-crops copy, not a crop count', /Grow your own ingredients/.test(banner.text) && !/ready to pick/.test(banner.text), banner.text);
  check('ITEM 1 its icon actually draws', banner.iconDrawn);
  check('ITEM 1 it starts collapsed like every other row', banner.open === false);
}

// OPERATE it: open the row, hit-test the CTA, click it, assert where it landed.
check('ITEM 1 the summary is tappable', await tap('details.garden-banner summary'));
await sleep(700);
const cta = await page.evaluate(() => {
  const b = document.getElementById('gardenToKitchen');
  if (!b) return null;
  const r = b.getBoundingClientRect();
  const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return { w: Math.round(r.width), h: Math.round(r.height), onTop: el === b ? 'cta' : (el && (el.id || el.className || el.tagName)) || 'nothing' };
});
console.log('CTA:', JSON.stringify(cta));
check('ITEM 1 opening the row reveals a real CTA with nothing over it', !!cta && cta.w > 50 && cta.h > 20 && cta.onTop === 'cta', JSON.stringify(cta));
check('ITEM 1 the CTA is tappable', await tap('#gardenToKitchen'));
await sleep(1800);
const landed = await page.evaluate(() => [...document.querySelectorAll('#sheets .sheet h2')].slice(-1)[0]?.textContent.trim());
check('ITEM 1 the banner CTA lands on the garden', landed === 'The Bone Garden', String(landed));

/* ================= ITEM 6: the boundary line under the numbers ================= */
await gotoToday();
const trust = await page.evaluate(() => {
  const el = document.querySelector('.log-only');
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const ring = document.querySelector('.ring-wrap');
  const meals = [...document.querySelectorAll('section.meal')].slice(-1)[0];
  return {
    text: el.textContent.replace(/\s+/g, ' ').trim(),
    w: Math.round(r.width), h: Math.round(r.height),
    visibility: getComputedStyle(el).visibility,
    // "where the NUMBERS are": below the ring and below the last meal block
    belowRing: ring ? r.top > ring.getBoundingClientRect().bottom : null,
    belowMeals: meals ? r.top > meals.getBoundingClientRect().top : null,
    inToday: !!el.closest('.screen'),
    inSheet: !!el.closest('#sheets'),
  };
});
console.log('log-only line:', JSON.stringify(trust));
check('ITEM 6 the food diary carries the boundary line', !!trust);
if (trust) {
  check('ITEM 6 it says the diary only records what you log', /only records what you log/i.test(trust.text), trust.text);
  check('ITEM 6 it names the Kitchen as the thing that does NOT count', /Kitchen/.test(trust.text) && /counts as food/i.test(trust.text), trust.text);
  check('ITEM 6 it has a real box on screen', trust.w > 100 && trust.h > 8 && trust.visibility === 'visible', `${trust.w}x${trust.h}`);
  check('ITEM 6 it sits below the numbers, not in the game room', trust.belowRing === true && trust.belowMeals === true && trust.inToday && !trust.inSheet, JSON.stringify(trust));
}
// and on a day that is not today, because a trust line that comes and goes is not one
await page.evaluate(() => document.getElementById('prevDay')?.click());
await sleep(1600);
const trustYesterday = await page.evaluate(() => !!document.querySelector('.log-only'));
check('ITEM 6 it is there on previous days too', trustYesterday === true);
await page.evaluate(() => document.getElementById('nextDay')?.click());
await sleep(1400);

/* ================= ITEM 4: the starter pouch ================= */
/* The demo profile pre-sets loot-init, so a ?demo boot never runs the welcome
   kit. Clear the flag and the garden, then call the REAL exported function on the
   REAL path: that is the fresh-install state transition, reproduced rather than
   simulated. The seeds are then read back THROUGH THE GARDEN UI, not from kv. */
const grant1 = await page.evaluate(async () => {
  const db = await import('./js/db.js');
  const game = await import('./js/game.js');
  await db.kvSet('loot-init', false);
  await db.kvSet('garden', null);
  const kit = await game.initLootIfNeeded();
  const g = await import('./js/garden.js');
  return { kit, seeds: await g.seeds() };
});
console.log('first welcome kit:', JSON.stringify(grant1));
const total = s => Object.values(s || {}).reduce((a, n) => a + n, 0);
check('ITEM 4 the welcome kit hands a brand-new player seeds', total(grant1.seeds) >= 2, JSON.stringify(grant1.seeds));
check('ITEM 4 and says so, so the toast can name them', grant1.kit && grant1.kit.seeds === total(grant1.seeds), JSON.stringify(grant1.kit));

// REWARDED-ACTIONS SOP rule 5: perform it a second time in the already-satisfied
// state and assert the second attempt pays NOTHING.
const grant2 = await page.evaluate(async () => {
  const game = await import('./js/game.js');
  const g = await import('./js/garden.js');
  const kit = await game.initLootIfNeeded();
  return { kit, seeds: await g.seeds() };
});
console.log('second welcome kit:', JSON.stringify(grant2));
check('ITEM 4 a second welcome kit pays nothing', grant2.kit === null && total(grant2.seeds) === total(grant1.seeds),
  `kit=${JSON.stringify(grant2.kit)} seeds ${total(grant1.seeds)} -> ${total(grant2.seeds)}`);

// read them back through the UI: Kitchen -> GROW -> the seed pouch
await gotoToday();
check('ITEM 4 the Kitchen opens', await tap('#kitchenActBtn'));
await sleep(1800);
check('ITEM 4 the GROW door opens', await tap('#doorGrow'));
await sleep(1600);
const pouch = await page.evaluate(() => {
  const chips = [...document.querySelectorAll('#gardenBody .t3-seed')];
  return {
    chips: chips.length,
    labels: chips.map(c => c.textContent.replace(/\s+/g, ' ').trim()),
    emptyCopy: /No seeds yet/.test(document.getElementById('gardenBody')?.textContent || ''),
    beds: document.querySelectorAll('#gardenBody .t3-bed.empty').length,
  };
});
console.log('pouch:', JSON.stringify(pouch));
check('ITEM 4 the new player sees seeds in the pouch, not the empty-pouch copy', pouch.chips >= 2 && !pouch.emptyCopy, JSON.stringify(pouch));
check('ITEM 4 and beds to put them in', pouch.beds >= 1, `${pouch.beds} empty beds`);

/* ================= ITEM 3: what is this seed FOR ================= */
check('ITEM 3 an empty bed opens the plant sheet', await tap('#gardenBody .t3-bed.empty'));
await sleep(1600);
const labels = await page.evaluate(() => {
  const rows = [...document.querySelectorAll('#plantBody .crate-row')];
  return rows.map(r => ({
    name: r.querySelector('b')?.textContent.trim(),
    use: r.querySelector('.seed-use')?.textContent.trim() || null,
  }));
});
console.log('plant sheet:', JSON.stringify(labels));
check('ITEM 3 the plant sheet is actually showing seeds (an empty sample is not a pass)', labels.length >= 2, `${labels.length} rows`);
check('ITEM 3 every seed says what it is for', labels.length >= 2 && labels.every(r => r.use), JSON.stringify(labels));
check('ITEM 3 and names a real dish, with a real count', labels.some(r => /\d+ more for .+|enough for .+/.test(r.use || '')), JSON.stringify(labels.map(r => r.use)));

/* ================= ITEM 5: the bumper crop, at harvest ================= */
/* The reveal ALREADY names a bumper (kick line, gold card, bigger confetti), so
   nothing was built here. What was wrong is the sentence under it: a bumper is an
   independent 1-in-10 roll, and the copy congratulated an UNWATERED bed for care
   it never got. Drive the real harvest button with the roll forced, on a bed that
   was deliberately never watered, and read what the player reads. */
check('ITEM 5 the seed plants from the plant sheet', await tap('#plantBody [data-sow="marrow"]'));
await sleep(1600);
await page.evaluate(async () => {
  const db = await import('./js/db.js');
  const g = await db.kvGet('garden');
  g.plots = g.plots.map(p => (p ? { ...p, readyAt: Date.now() - 1000, watered: false } : p));
  await db.kvSet('garden', g);
  // force the 1-in-10: BUMPER_CHANCE is 0.10 and harvestYield rolls rand() < it
  window.__realRandom = Math.random;
  Math.random = () => 0;
});
await sleep(1400);
check('ITEM 5 a ripe, unwatered bed is harvestable', await tap('#gardenBody .t3-bed.ready'));
await sleep(1800);
const reveal = await page.evaluate(() => {
  Math.random = window.__realRandom || Math.random;
  const card = document.querySelector('.hv-card');
  return card ? {
    bumperClass: card.classList.contains('bumper'),
    kick: card.querySelector('.hv-kick')?.textContent.trim(),
    sub: card.querySelector('.hv-sub')?.textContent.trim(),
    name: card.querySelector('.hv-name')?.textContent.trim(),
  } : null;
});
console.log('bumper reveal:', JSON.stringify(reveal));
check('ITEM 5 the harvest reveal exists (an empty sample is not a pass)', !!reveal);
if (reveal) {
  check('ITEM 5 a bumper crop is named as one', reveal.kick === 'BUMPER CROP' && reveal.bumperClass, JSON.stringify(reveal));
  check('ITEM 5 and the reason given is the roll, not watering that never happened',
    /roll/i.test(reveal.sub || '') && !/^Watered/i.test(reveal.sub || ''), reveal.sub);
}
await closeSheets();

/* ================= ITEM 2: the intro popup's four rows ================= */
/* STATED LIMITATION, not a hidden one. analytics.js gates track() on
   navigator.webdriver AND on ?demo, and every audit environment is both, so these
   rows CANNOT be observed at runtime from here without editing analytics.js
   (another lane's file). So: the four calls are pinned in source, and the two
   controls that carry them are OPERATED above and below so a dead button cannot
   pass. Deleting any one of the four turns this red. */
const src = fs.readFileSync(path.join(ROOT, 'js/app.js'), 'utf8');
const popupSrc = src.slice(src.indexOf('async function maybeShowGardenPopup'), src.indexOf('function gardenBannerHtml'));
check('ITEM 2 the popup source block was found (an empty sample is not a pass)', popupSrc.length > 500, `${popupSrc.length} chars`);
for (const ev of ['garden_intro_shown', 'garden_intro_suppressed', 'garden_intro_cta', 'garden_intro_later']) {
  check(`ITEM 2 ${ev} is reported`, new RegExp(`trackEvent\\(['"]${ev}['"]`).test(popupSrc));
}
/* The four names being SOMEWHERE in the block is not enough: the card has two
   dismissal paths and one of them satisfied the name check on its own, so
   deleting the row off the button did not go red. Pin each row to the control it
   belongs to, within the handler that control binds. */
for (const [label, anchor, ev] of [
  ['the Maybe-later button', "#gardenLaterBtn", 'garden_intro_later'],
  ['the tap-outside path', "veil.addEventListener('click'", 'garden_intro_later'],
  ['the SEE THE GARDEN button', "#gardenSeeBtn", 'garden_intro_cta'],
]) {
  /* Bound the window at the NEXT binding, not at a character count: a fixed
     window spilled into the following handler and read that one's row as this
     one's, so deleting the button's row still passed. */
  const at = popupSrc.indexOf(anchor);
  const bind = at < 0 ? -1 : popupSrc.indexOf('addEventListener', at);
  const next = bind < 0 ? -1 : popupSrc.indexOf('addEventListener', bind + 1);
  const handler = bind < 0 ? '' : popupSrc.slice(at, next < 0 ? popupSrc.length : next);
  check(`ITEM 2 ${label} was found in source (an empty sample is not a pass)`, handler.length > 30, `${handler.length} chars`);
  check(`ITEM 2 ${label} carries its own row`, new RegExp(`trackEvent\\(['"]${ev}['"]`).test(handler), handler.split('\n')[0].trim());
}
/* and the control the 'later' row hangs off must really dismiss the card: a
   tracking call on a dead button is worse than no tracking. Forced the same way
   the intro audit forces it (webdriver is gated so audits stay quiet). */
await closeSheets();
await page.evaluate(async () => { await (await import('./js/db.js')).kvSet('gardenIntroSeen', 0); });
await page.evaluateOnNewDocument(() => { window.__gardenForce = 1; });
await page.reload({ waitUntil: 'networkidle2' });
await sleep(6000);
await page.evaluate(() => { document.querySelector('.dw')?.remove(); document.querySelector('.drop-veil:not(.garden-veil)')?.remove(); });
await sleep(1500);
const shown = await page.evaluate(() => !!document.querySelector('.garden-veil'));
check('ITEM 2 the intro popup is on screen to be dismissed', shown);
if (shown) {
  check('ITEM 2 Maybe later is tappable', await tap('#gardenLaterBtn'));
  await sleep(900);
  const gone = await page.evaluate(() => !document.querySelector('.garden-veil'));
  check('ITEM 2 Maybe later actually dismisses the card', gone);
}

check('NO page errors during the run', errors.length === 0, errors.join(' | '));

await browser.close();
server?.close();
console.log(bad ? `\n${bad} FAILED` : '\nGARDEN REACH VERIFIED');
process.exit(bad ? 1 : 0);
