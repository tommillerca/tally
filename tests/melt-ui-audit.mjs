/* The melt confirm bar overlapping list rows. A screenshot alone would not prove
 * it: the test is whether the bar is OPAQUE and whether a tap at a row's label
 * still reaches that row. */
import { boot, sleep } from './godmode.js';
const DIR = '/private/tmp/claude-502/-Users-tommiller-Documents-Hyperframes-Editor/a40abded-9d02-469c-8111-2200136500f1/scratchpad/shots';
/* argv FIRST, env.URL second: the convention error-telemetry-audit and
   year-readout-audit already use. Reading env.URL ONLY meant that any run passing
   the URL as an argument (which is how the release gate invokes every suite) fell
   through to godmode's boot() default, https://tommillerca.github.io/tally/, and
   graded PRODUCTION while reading as coverage of the tree under test. */
const { browser, page } = await boot(process.argv[2] || process.env.URL);
let bad = 0;
const check = (l, ok, d = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${l}${d ? '  ' + d : ''}`); if (!ok) bad++; };

// a long list, so the bar really does sit over rows
await page.evaluate(async () => {
  const loot = await import('./js/loot.js');
  const { GEAR_ITEMS } = await import('./js/gear.js');
  const { totalXp, levelFor } = await import('./js/game.js');
  const lvl = levelFor(await totalXp()).level;
  const grantable = GEAR_ITEMS.filter(g => (g.minLevel || 1) <= lvl).slice(0, 14);
  for (const g of grantable) await loot.grantGear(g.id, 'test');
  /* EQUIP ONE. The direct-melt button (`[data-meltbench]`) only renders on a WORN
     row, by design: losing the piece you are wearing to a stray tap is the one
     mistake worth blocking, so worn pieces are never bulk-selectable and carry
     their own control instead. With nothing equipped the fixture had no such row
     and the SOP checks below reported "no direct-melt control on screen". */
  if (grantable[0]) await loot.equipGear(grantable[0].slot, grantable[0].id);
});
await page.evaluate(() => { location.hash = '#/bonehead'; });
await sleep(1800);
await page.evaluate(() => document.querySelector('#chTabs .ch-tab[data-tab="crates"]').click());
await sleep(1800);
/* THE ENTRANCE, before anything is tapped. Tom's complaint was that melting is
   buried: it lived in a collapsed <details> three levels deep, so the spare count
   and its dust total were only legible inside the summary of a closed panel.
   PROVE-RED: remove the `.melt-lede` block (or the ` open` attribute) and this
   fails, because the numbers are no longer readable without a tap. */
const entrance = await page.evaluate(() => {
  const lede = document.querySelector('.melt-lede');
  const fold = document.querySelector('.melt-fold');
  const vis = e => { if (!e) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  return { text: (lede?.textContent || '').replace(/\s+/g, ' ').trim(), ledeVisible: vis(lede), foldOpen: !!fold?.open };
});
console.log('entrance:', JSON.stringify(entrance));
check('the spare count and its dust total are readable without opening anything',
  entrance.ledeVisible && /\d+ spare piece/.test(entrance.text) && /\d/.test(entrance.text.split('worth')[1] || ''),
  JSON.stringify(entrance));
check('and the bench is already open when there is something to melt', entrance.foldOpen, JSON.stringify(entrance));

/* IDEMPOTENT OPEN. This used to click the summary unconditionally to open the
   fold; now that it opens itself when spares exist, that same click CLOSED it and
   every check below read an empty list. Ask the element, do not assume. */
await page.evaluate(() => {
  const f = document.querySelector('.melt-fold');
  f.scrollIntoView({ block: 'start' });
  if (!f.open) f.querySelector('summary').click();
});
await sleep(800);

/* EVERY ROW READS AS ACTIONABLE, measured by role and geometry rather than by a
   class name (the drift lesson from dust-safeguard the same night). An unworn row
   must expose a real, hittable control: the checkbox inside its <label>.
   PROVE-RED: set `.melt-pick { display: none }` and the tap target vanishes. */
const rowsProbe = await page.evaluate(() => {
  const out = [];
  for (const row of document.querySelectorAll('.melt-row')) {
    const box = row.querySelector('input[type=checkbox]');
    const btn = row.querySelector('button');
    const ctl = box || btn;
    const r = ctl ? ctl.getBoundingClientRect() : null;
    row.scrollIntoView({ block: 'center' });
    const rr = ctl ? ctl.getBoundingClientRect() : null;
    const hit = rr ? document.elementFromPoint(rr.left + rr.width / 2, rr.top + rr.height / 2) : null;
    out.push({
      name: (row.querySelector('b')?.textContent || '').slice(0, 22),
      worn: row.classList.contains('worn'),
      hasControl: !!ctl, big: !!(r && r.width >= 16 && r.height >= 16),
      reachable: !!(hit && (hit === ctl || ctl.contains(hit) || hit.closest('.melt-row') === row)),
    });
  }
  return out;
});
/* PUT THE SCROLL BACK. The probe above scrollIntoViews EVERY row to hit-test it,
   which leaves the page at the last one, and the bar checks further down then
   measured a bar 300px ABOVE the viewport and read as two failures on working
   code. A probe that moves the page must restore it. */
await page.evaluate(() => document.querySelector('.melt-fold')?.scrollIntoView({ block: 'start' }));
await sleep(500);
console.log(`rows: ${rowsProbe.length}, dead: ${JSON.stringify(rowsProbe.filter(r => !r.hasControl || !r.big || !r.reachable))}`);
check('an empty row sample is a failure, not a pass', rowsProbe.length > 0, `${rowsProbe.length} rows`);
check('every row exposes a real, hittable control', rowsProbe.length > 0 && rowsProbe.every(r => r.hasControl && r.big && r.reachable),
  JSON.stringify(rowsProbe.filter(r => !r.hasControl || !r.big || !r.reachable).slice(0, 4)));
// tick one so the bar appears
await page.evaluate(() => { const c = [...document.querySelectorAll('.melt-pick')].find(x => !x.disabled); c.click(); });
await sleep(700);

const probe = await page.evaluate(() => {
  const go = document.getElementById('meltGo');
  if (!go) return null;
  const cs = getComputedStyle(go);
  const r = go.getBoundingClientRect();
  // what is actually painted at the bar's centre, and is anything showing through?
  const atBar = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  // every row label that the bar's box overlaps: a tap there must NOT hit the bar
  const rows = [...document.querySelectorAll('.melt-row')];
  const overlapped = rows.filter(row => {
    const rr = row.getBoundingClientRect();
    return rr.bottom > r.top && rr.top < r.bottom;
  }).map(row => {
    const rr = row.getBoundingClientRect();
    const hit = document.elementFromPoint(rr.left + 90, rr.top + rr.height / 2);
    return { name: row.textContent.trim().split('\n')[0].slice(0, 24), hitIsBar: !!(hit && hit.closest('#meltGo')) };
  });
  return {
    bg: cs.backgroundColor, opaque: !/rgba\(0, 0, 0, 0\)|transparent/.test(cs.backgroundColor),
    zIndex: cs.zIndex, position: cs.position,
    atBarIsBar: !!(atBar && atBar.closest('#meltGo')),
    whatIsAtTheBar: atBar ? `${atBar.tagName}.${(atBar.className || '').toString().split(' ')[0]}#${atBar.id || ''}` : 'nothing',
    barRect: { top: Math.round(r.top), bottom: Math.round(r.bottom), h: Math.round(r.height) },
    viewportH: innerHeight,
    overlapped,
  };
});
console.log('bar:', JSON.stringify(probe));
check('the confirm bar exists', !!probe);
if (probe) {
  check('it is OPAQUE, so rows cannot bleed through', probe.opaque, probe.bg);
  check('a tap on the bar hits the bar', probe.atBarIsBar, `${probe.whatIsAtTheBar} at ${JSON.stringify(probe.barRect)}`);
  // the defect Tom photographed: the bar drawn across a gear row
  check('the bar overlaps NO gear row at all', probe.overlapped.length === 0, JSON.stringify(probe.overlapped));
  check('it is on screen when the fold opens', probe.barRect.top >= 0 && probe.barRect.bottom <= probe.viewportH, JSON.stringify(probe.barRect));
  // the important one: a row the bar covers must be reachable by scrolling, i.e.
  // the fold reserves space so the LAST row clears the bar
  const last = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('.melt-row')];
    const lastRow = rows[rows.length - 1];
    lastRow.scrollIntoView({ block: 'center' });
    const go = document.getElementById('meltGo');
    const rr = lastRow.getBoundingClientRect(), gr = go.getBoundingClientRect();
    const hit = document.elementFromPoint(rr.left + 90, rr.top + rr.height / 2);
    return { rowTop: Math.round(rr.top), barTop: Math.round(gr.top), covered: !!(hit && hit.closest('#meltGo')), label: lastRow.textContent.trim().split('\n')[0].slice(0, 26) };
  });
  console.log('last row after scrolling to it:', JSON.stringify(last));
  check('the last row is reachable, not stuck under the bar', !last.covered, JSON.stringify(last));
}
/* ---- REWARDED-ACTIONS SOP (melt pays dust), per tally/CLAUDE.md ------------
   State transition: owned(gear) -> destroyed(gear) + dust(+N). The inv row IS the
   ledger, so a second melt of the same piece must find nothing and pay ZERO. The
   SOP is explicit that proving it returns false is not enough: prove it PAYS
   NOTHING. First melt is driven through a real control (the worn row's button). */
const melt = await page.evaluate(async () => {
  const loot = await import('./js/loot.js');
  const btn = document.querySelector('[data-meltbench]');
  if (!btn) return { why: 'no direct-melt control on screen' };
  const id = btn.dataset.meltbench;
  const { GEAR_BY_ID } = await import('./js/gear.js');
  const worth = loot.gearDustValue(GEAR_BY_ID[id]);
  const before = await loot.boneDust();
  /* THE WORN PIECE IS ARM-THEN-CONFIRM (js/app.js, the [data-meltbench] handler):
     one tap only arms it, and that friction is deliberate, because losing the piece
     you are WEARING to a stray tap is the one mistake worth blocking. My first
     version of this check tapped once and called the app broken. So assert the
     safeguard as well: one tap must spend nothing. */
  btn.click();
  await new Promise(r => setTimeout(r, 400));
  const armedDust = await loot.boneDust();
  const armedText = btn.textContent.trim();
  btn.click();                                          // the confirm
  await new Promise(r => setTimeout(r, 1400));
  const after = await loot.boneDust();
  const second = await loot.disenchantGear(id);         // the SAME piece again
  const afterSecond = await loot.boneDust();
  return { id, worth, before, armedDust, armedText, after, second, afterSecond,
    rowGone: !document.querySelector(`[data-meltbench="${id}"], [data-meltsel="${id}"]`) };
});
console.log('melt:', JSON.stringify(melt));
check('one tap on a WORN piece spends nothing and asks first',
  !melt.why && melt.armedDust === melt.before && /confirm/i.test(melt.armedText || ''),
  `${melt.before} -> ${melt.armedDust}, says "${melt.armedText}"`);
check('melting through the real control pays exactly the piece value',
  !melt.why && melt.worth > 0 && melt.after === melt.before + melt.worth, JSON.stringify(melt));
check('and the piece is gone from the bench', !melt.why && melt.rowGone, String(melt.rowGone));
/* THE HEADER MUST SURVIVE AN IN-PLACE MELT. Melting a worn piece does NOT
   re-render the list (so it cannot jump to the top), so the header is patched by
   hand and can go stale. The old patch counted the surviving `[data-meltbench]`
   BUTTONS, which exist only on worn rows, so melting the piece you were wearing
   left the header reading "0 spare pieces worth 0" over a bench still holding
   thirteen.
   I first wrote a companion check on the .melt-lede line outside the fold and
   COULD NOT MAKE IT GO RED, because this handler is only reachable from a worn row
   and melting a worn piece cannot change the spare count. That was the code being
   unreachable, not the check being weak, so the code went rather than the check.
   PROVE-RED (real): restore the old `left.length` summary and the number stops
   matching the rows on screen. */
const after1 = await page.evaluate(() => ({
  summary: (document.querySelector('.melt-fold > summary')?.textContent || '').replace(/\s+/g, ' ').trim(),
  benchRows: document.querySelectorAll('.melt-row').length,
}));
console.log('header after an in-place melt:', JSON.stringify(after1));
check('the bench header counts the rows that are actually left',
  after1.benchRows > 0 && new RegExp(`\\b${after1.benchRows}\\b`).test(after1.summary), JSON.stringify(after1));
check('SOP: a second melt of the same piece pays NOTHING',
  !melt.why && melt.second?.ok === false && melt.afterSecond === melt.after,
  `${melt.after} -> ${melt.afterSecond}, reason ${melt.second?.reason}`);

/* EVERY RARITY IN THE GAME IS MELTABLE. Tom: "just make sure any gear in the game
   could be melted idk what the tiers are for rarity." disenchantGear has no rarity
   or stats gate today, so this pins that a future tier cannot ship unmeltable, and
   it enumerates the rarities from the catalogue rather than hardcoding today's. */
const rar = await page.evaluate(async () => {
  const loot = await import('./js/loot.js');
  const { GEAR_ITEMS } = await import('./js/gear.js');
  const tiers = [...new Set(GEAR_ITEMS.map(g => g.rarity))];
  const out = {};
  for (const t of tiers) {
    const g = GEAR_ITEMS.find(x => x.rarity === t);
    await loot.grantGear(g.id, 'test');
    const before = await loot.boneDust();
    const res = await loot.disenchantGear(g.id);
    out[t] = { ok: !!res.ok, paid: (await loot.boneDust()) - before };
  }
  return { tiers, out };
});
console.log('rarities:', JSON.stringify(rar));
check('every rarity in the catalogue melts and pays', rar.tiers.length > 0
  && rar.tiers.every(t => rar.out[t].ok && rar.out[t].paid > 0), JSON.stringify(rar.out));

/* ---- TRANSMOG ON A PLAIN COSMETIC (Tom's consistency call, 2026-08-11) -----
   The panel used to require a STATTED piece, so a slot holding a plain cosmetic
   showed nothing at all. It is offered everywhere now, and FREE where there are no
   stats to preserve, because that outcome is identical to equipping the cosmetic
   directly. Price is asserted at the AUTHORITY (transmogPrice), not off the button
   label: applyTransmog prices itself, so a button merely labelled free would have
   shown free and still charged.
   PROVE-RED: restore `!wornGear` in the panel gate and the panel disappears;
   remove the gearLoadout check in transmogPrice and the price stops being 0. */
const mog = await page.evaluate(async () => {
  const loot = await import('./js/loot.js');
  const { BH_ITEMS } = await import('./data/boneheadz.js');
  // a head cosmetic, equipped WITHOUT gear: equip() drops the statted piece for us
  // a fresh profile owns one head look, so grant a couple to have something to swap
  for (const i of BH_ITEMS.filter(i => i.slot === 'H').slice(0, 3)) await loot.grantCosmetic(i.id, 'test');
  const owned = [...await loot.ownedCosmeticIds()];
  const head = BH_ITEMS.filter(i => i.slot === 'H' && owned.includes(i.id));
  if (head.length < 2) return { why: `need 2 owned head looks, have ${head.length}` };
  await loot.equip('H', head[0].id);
  const price = await loot.transmogPrice('H', head[1].id);
  return { wearing: head[0].id, target: head[1].id, price, gearInSlot: !!(await loot.gearLoadout())['H'] };
});
console.log('transmog on a plain cosmetic:', JSON.stringify(mog));
if (mog.why) { check('the transmog fixture had looks to work with', false, mog.why); }
else {
  check('a slot with no statted gear prices a look at ZERO at the authority',
    mog.gearInSlot === false && mog.price === 0, JSON.stringify(mog));
  await page.evaluate(() => { location.hash = '#/bonehead'; });
  await sleep(1600);
  await page.evaluate(() => document.querySelector('#chTabs .ch-tab[data-tab="wardrobe"]')?.click());
  await sleep(1800);
  const panel = await page.evaluate(() => {
    const grid = document.querySelector('.look-grid');
    const own = document.querySelector('.look-grid .ward-cell.look[data-look=""]');
    const bar = document.querySelector('.look-bar');
    return { hasPanel: !!grid, cells: document.querySelectorAll('.look-grid .ward-cell').length,
      ownPreselected: !!own?.classList.contains('equipped'),
      tag: (own?.querySelector('.look-tag')?.textContent || '').trim(),
      /* the panel's OWN note is the sibling right after the look bar. Reaching for
         `parentElement.querySelector('p.note')` grabbed the wardrobe's generic
         "tap a piece to inspect its stats" line instead and failed on correct copy. */
      note: (bar?.nextElementSibling?.matches('p.note') ? bar.nextElementSibling.textContent : '').replace(/\s+/g, ' ').trim().slice(0, 160) };
  });
  console.log('panel:', JSON.stringify(panel));
  check('the transmog panel is offered on a slot holding a plain cosmetic', panel.hasPanel && panel.cells >= 2, JSON.stringify(panel));
  check('with what you are wearing preselected', panel.ownPreselected && /as equipped/i.test(panel.tag), JSON.stringify(panel));
  check('and it says switching is free rather than quoting a price', /free/i.test(panel.note), panel.note);

  /* THE END OF THE CHAIN, and it runs LAST on purpose: applying a transmog moves
     what is preselected, so doing this before the panel checks above made them
     fail on correct behaviour (my own ordering bug, caught by running it).
     Panel present + price 0 still does not mean the look CHANGES. equipped() used
     to skip any slot with no gear (`if (!lo[slot]) continue`), so relaxing the UI
     alone would have shipped a panel that takes a tap and does nothing, which is
     worse than the gate it replaced. Assert what the player actually wears.
     PROVE-RED: restore that guard in js/loot.js and `after` stays the old art. */
  const applied = await page.evaluate(async (target) => {
    const loot = await import('./js/loot.js');
    const before = (await loot.equipped())['H'];
    const res = await loot.applyTransmog('H', target);
    return { before, target, after: (await loot.equipped())['H'], res };
  }, mog.target);
  console.log('applied:', JSON.stringify(applied));
  check('applying it actually changes what you are wearing',
    applied.res?.ok === true && applied.after === applied.target,
    `${applied.before} -> ${applied.after} (wanted ${applied.target})`);
  check('and it cost nothing', applied.res?.cost === 0, `cost ${applied.res?.cost}`);

  /* A LOOK YOU CHOOSE OUTRANKS A DISGUISE YOU FORGOT. equipped() honours a
     transmog on a gearless slot as of today, so a STALE entry (unequipping gear
     never cleared one) would have reapplied itself the moment a player updated and
     silently changed their appearance. Deliberately equipping a plain look now
     drops the slot's transmog. Saved fits are exempt via keepGear, which is why
     the clear lives inside that branch: a fit applies its own transmogs first.
     PROVE-RED: remove the transmog clear from equip() in js/loot.js and the stale
     disguise survives, so `after` comes back as the disguise, not the pick. */
  const stale = await page.evaluate(async (other) => {
    const loot = await import('./js/loot.js');
    const tmBefore = (await loot.transmogMap())['H'] || null;   // the disguise from above
    await loot.equip('H', other);                               // deliberately pick a look
    return { tmBefore, tmAfter: (await loot.transmogMap())['H'] || null,
      after: (await loot.equipped())['H'], picked: other };
  }, mog.wearing);
  console.log('stale disguise:', JSON.stringify(stale));
  check('deliberately equipping a plain look clears that slot\'s disguise',
    stale.tmBefore !== null && stale.tmAfter === null && stale.after === stale.picked,
    JSON.stringify(stale));
}

const el = await page.$('.melt-fold');
if (el) await el.screenshot({ path: `${DIR}/melt-bar.png` });
console.log('shot melt-bar');
await browser.close();
console.log(bad ? `\n${bad} FAILED` : '\nMELT BAR OK');
process.exit(bad ? 1 : 0);
