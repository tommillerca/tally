/* THE LOOK PANEL, GRADED AS A NEW PLAYER WOULD MEET IT (?mogv2).
 *
 * WHY THIS EXISTS. Tom, v424 item 11: "we need to make a cleaner interface for the
 * transmog section that makes it clear for players what is happening really think
 * this out and grill it as a new player to see what is the most confusing thing
 * about it." The grill ran on 2026-08-23 at 430x932 against a seeded mid-game
 * account, and the finding that outranks the rest is geometric, not verbal:
 *
 *   TAPPING A LOOK ALREADY RESTAGED THE PAPER DOLL, CORRECTLY, AND THE DOLL WAS
 *   480px ABOVE THE TOP OF THE VIEWPORT WHILE IT HAPPENED (stage rect -894..-480).
 *
 * So the feature's whole output landed off screen and the player bought a look
 * they had never seen. Measured cost of going to look: a 934px scroll up, one
 * whole viewport, then back down to press the button.
 *
 * Every row below is about that class of failure: a thing the panel claims to
 * show has to be ON SCREEN, in DECODED PIXELS, at the moment the finger is on the
 * control. A row that only asserts markup exists would have graded the old panel
 * green, because its markup was right and its geometry was not.
 *
 * NOT GRADED HERE, deliberately: prices, gates and yields. This was an interface
 * pass. The one economic row (ECONOMY) exists to prove the interface did NOT move
 * any of them, and melt-ui-audit still owns transmogPrice's own behaviour.
 *
 * Usage:  node tests/transmog-clarity-audit.mjs [url]
 * With no url it serves this tree itself. It never falls through to boot()'s
 * default, which is production.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { boot, seed, serveTree, sleep, settle } from './godmode.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = process.argv[2] || process.env.URL;
const server = arg ? null : await serveTree(ROOT);
const BASE = (arg || server.url).replace(/\/?$/, '/');
console.log(`grading ${BASE}`);
const { browser, page } = await boot(BASE);

let bad = 0;
const check = (l, ok, d = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${l}${d ? '  ' + d : ''}`); if (!ok) bad++; };

/* A REALISTIC ACCOUNT, NEVER AN EMPTY ONE. An empty wardrobe makes every layout
   look clean: no tiles, no prices, no truncation, nothing to be confused by. */
await seed(page, { level: 16, coins: 4200, dust: 40 });
const fixture = () => page.evaluate(async () => {
  const loot = await import('./js/loot.js');
  const { GEAR_ITEMS } = await import('./js/gear.js');
  const { BH_ITEMS } = await import('./data/boneheadz.js');
  const { totalXp, levelFor } = await import('./js/game.js');
  const lvl = levelFor(await totalXp()).level;
  for (const slot of ['H', 'T', 'IR']) {
    for (const g of GEAR_ITEMS.filter(x => x.slot === slot && (x.minLevel || 1) <= lvl).slice(0, 3)) await loot.grantGear(g.id, 'test');
  }
  for (const i of BH_ITEMS.filter(i => i.slot === 'H').slice(0, 9)) await loot.grantCosmetic(i.id, 'test');
  const wh = GEAR_ITEMS.filter(g => g.slot === 'H' && (g.minLevel || 1) <= lvl)[0];
  if (wh) await loot.equipGear('H', wh.id);
  return { heads: BH_ITEMS.filter(i => i.slot === 'H').slice(0, 9).length };
});
console.log('fixture:', JSON.stringify(await fixture()));

const openWardrobe = async (qs) => {
  await page.goto(BASE + qs, { waitUntil: 'networkidle2' });
  await sleep(2200);
  await page.evaluate(() => { location.hash = '#/bonehead'; });
  await sleep(2200);
  await settle(page);
};

/* ---------------------------------------------------------------- VARIANT ----
   The rework is behind ?mogv2 until Tom picks it, so the shipped screen must be
   untouched without the flag. A variant that leaks is a variant nobody agreed to.
   PROVE-RED: drop the `if (S.mogv2)` guard so the new panel renders always. */
await openWardrobe('?demo');
const v1 = await page.evaluate(() => ({
  newPanel: !!document.querySelector('.mog-panel'),
  oldBar: !!document.querySelector('.look-bar'),
  oldHeading: [...document.querySelectorAll('#chContent .sect-h')].map(h => h.textContent.trim()).join(' | '),
}));
check('VARIANT without ?mogv2 the shipped panel is what renders', !v1.newPanel && v1.oldBar, JSON.stringify(v1));

await openWardrobe('?demo&mogv2');

/* -------------------------------------------------------------- STRUCTURE ----
   Empty sample sets are failures (anti-regression rule 3), so everything below
   is gated on there actually being a panel with tiles in it. */
const struct = await page.evaluate(() => {
  const p = document.querySelector('.mog-panel');
  if (!p) return { why: 'no .mog-panel' };
  const r = p.getBoundingClientRect();
  return {
    panelH: Math.round(r.height), vh: innerHeight,
    tiles: document.querySelectorAll('.mog-panel .look-grid .ward-cell').length,
    figures: document.querySelectorAll('.mog-figs figure').length,
    layers: document.querySelectorAll('.mog-figs figure img').length,
    lead: (document.querySelector('.mog-lead')?.textContent || '').replace(/\s+/g, ' ').trim(),
    heading: (document.querySelector('.mog-h')?.textContent || '').replace(/\s+/g, ' ').trim(),
  };
});
console.log('structure:', JSON.stringify(struct));
check('STRUCTURE the panel is on screen with real tiles to choose from (zero is a FAILURE)',
  !struct.why && struct.tiles >= 3 && struct.figures === 2 && struct.layers > 0, JSON.stringify(struct));
/* THE WHOLE DECISION IN ONE SCREEN. The old flow put the doll one viewport above
   the tiles; if this panel grows past a screen it has reinvented that problem.
   PROVE-RED: set .bh-stage.mog-fig to 420px and the panel outgrows the viewport. */
check('STRUCTURE the whole panel fits in one 932px screen, so nothing is a scroll away',
  !struct.why && struct.panelH <= struct.vh, `${struct.panelH}px of ${struct.vh}px`);
/* Tom's first sentence: what you keep. It is the LEAD, above the tiles, not a
   12.5px grey note under the commit button where the old copy put it. */
check('STRUCTURE the first line says what you keep, before any control',
  /keeps/i.test(struct.lead) || /free/i.test(struct.lead), struct.lead);

/* ----------------------------------------------------------------- PREVIEW ---
   THE ROW THIS SUITE EXISTS FOR. Put the page where a real thumb puts it, tap a
   real tile with a real pointer, and require that the AFTER figure was fully in
   frame while it happened. Geometry, at the moment of the tap, not afterwards.
   PROVE-RED: delete the .mog-figs block from the template. */
await page.evaluate(() => document.querySelector('.mog-panel .look-grid')?.scrollIntoView({ block: 'center' }));
await sleep(700); await settle(page);
const at = await page.evaluate(() => {
  const cells = [...document.querySelectorAll('.mog-panel .look-grid .ward-cell.look')];
  const t = cells.find(c => /^\d+/.test((c.querySelector('.look-cost')?.textContent || '').trim())) || cells[2];
  if (!t) return { why: 'no tile to tap' };
  const tr = t.getBoundingClientRect();
  const fig = document.querySelectorAll('.mog-figs figure')[1];
  const fr = fig ? fig.getBoundingClientRect() : null;
  return { cx: tr.left + tr.width / 2, cy: tr.top + tr.height / 2, look: t.dataset.look,
    figTop: fr ? Math.round(fr.top) : null, figBottom: fr ? Math.round(fr.bottom) : null,
    vh: innerHeight, inFrame: !!(fr && fr.top >= 0 && fr.bottom <= innerHeight && fr.height > 40) };
});
console.log('at tap time:', JSON.stringify(at));
check('PREVIEW the "after" figure is fully on screen at the moment the tile is tapped',
  !at.why && at.inFrame, JSON.stringify(at));

/* DECODED PIXELS, not a CSS box (tally/CLAUDE.md: a rect reads fine over a blank
   frame). Sample the After figure's own art before and after a REAL pointer tap
   and require it to actually change.
   PROVE-RED: render the After figure from `look` instead of `stageEq`, which is
   the classic preview-that-does-not-preview, and the delta goes to 0. */
const sampleFig = () => page.evaluate(() => {
  const fig = document.querySelectorAll('.mog-figs figure')[1];
  const imgs = [...fig.querySelectorAll('img')];
  return { srcs: imgs.map(i => i.getAttribute('src')).join('|'),
    decoded: imgs.length > 0 && imgs.every(i => i.naturalWidth > 0),
    n: imgs.length };
});
const beforeFig = await sampleFig();
await page.mouse.click(at.cx, at.cy);
await sleep(900); await settle(page);
const afterFig = await sampleFig();
console.log('after-figure art:', JSON.stringify({ beforeFig, afterFig }));
check('PREVIEW its art is DECODED, not an empty box', afterFig.decoded && afterFig.n > 0, JSON.stringify(afterFig));
check('PREVIEW tapping a look actually changes the "after" figure',
  beforeFig.srcs !== afterFig.srcs, `${beforeFig.n} layers -> ${afterFig.n}, changed: ${beforeFig.srcs !== afterFig.srcs}`);
/* and the caption has to admit which one it is, or two identical figures read as
   a rendering bug rather than as a comparison. */
const caps = await page.evaluate(() => [...document.querySelectorAll('.mog-cap')].map(c => c.textContent.trim()));
check('PREVIEW the pair is labelled Now and After', caps[0] === 'Now' && caps[1] === 'After', JSON.stringify(caps));

/* -------------------------------------------------------------------- BAR ----
   Tom's ask, verbatim: one sentence per step, what you are giving, what you are
   getting, and that nothing is destroyed.

   AND THEY HAVE TO RENDER. The shipped v1 bar has `.lb-txt` and a `.btn`, and
   `.btn` is width:100% while `.look-bar .btn` only sets flex:none, so the button
   lies across the whole 398px bar and the status text measures ZERO pixels wide.
   That is the sentence telling the player what they are buying, and nobody could
   read it. So this row measures WIDTH and hit-tests, never presence.
   PROVE-RED: put width:100% back on .look-bar.mog-bar .btn.mog-go. */
const bar = await page.evaluate(() => {
  const rows = [...document.querySelectorAll('.mog-lines span')].map(s => {
    const b = s.querySelector('b'), i = s.querySelector('i');
    const br = b ? b.getBoundingClientRect() : null;
    const hit = br ? document.elementFromPoint(br.left + Math.min(6, br.width / 2), br.top + br.height / 2) : null;
    return { label: (i?.textContent || '').trim(), value: (b?.textContent || '').trim(),
      w: br ? Math.round(br.width) : 0, coveredByButton: !!(hit && hit.closest('button')) };
  });
  const safe = document.querySelector('.mog-safe');
  const btn = document.querySelector('.mog-go');
  const sr = safe?.getBoundingClientRect(), brr = btn?.getBoundingClientRect();
  return { rows, safeText: (safe?.textContent || '').replace(/\s+/g, ' ').trim(),
    safeVisibleWithButton: !!(sr && brr && sr.top < innerHeight && sr.bottom > 0 && brr.top < innerHeight && brr.bottom > 0),
    btnW: brr ? Math.round(brr.width) : null, btnLabel: (btn?.textContent || '').trim() };
});
console.log('bar:', JSON.stringify(bar));
const labels = bar.rows.map(r => r.label.toLowerCase());
check('BAR it says what you keep, what you get and what you pay, in that order',
  labels.join('|') === 'you keep|you get|you pay', JSON.stringify(labels));
check('BAR every one of those lines RENDERS (the v1 bar squeezed its own text to 0px)',
  bar.rows.length === 3 && bar.rows.every(r => r.w > 20 && r.value && !r.coveredByButton),
  JSON.stringify(bar.rows));
check('BAR the price is named in words, not a bare number',
  /bone dust|nothing/i.test(bar.rows[2]?.value || ''), bar.rows[2]?.value);
check('BAR "nothing is destroyed" is on screen in the same frame as the button',
  /nothing is destroyed/i.test(bar.safeText) && bar.safeVisibleWithButton, bar.safeText.slice(0, 90));

/* -------------------------------------------------------------- CURRENCY -----
   One currency, one picture. The grill found three on one screen: the wallet pill
   draws pixCur('dust') purple crystals, the tile drew a literal Unicode ' ◆' out
   of .look-cost::after, and the sentence below called ICONS.dust(12), which is
   UNDER pixCur's 16px floor and silently falls back to a tan vector diamond.
   Asserted against the WALLET, not against a hardcoded filename, so the row
   follows the art if the art is ever replaced.
   PROVE-RED: drop the `dust` class off the price span and the ◆ comes back. */
const money = await page.evaluate(() => {
  const wallet = [...document.querySelectorAll('.ward-head .bh-pill')]
    .map(p => p.querySelector('img'))
    .find(i => i && /dust/i.test(i.getAttribute('src') || ''));
  const tile = document.querySelector('.mog-panel .look-cost.dust');
  const ti = tile?.querySelector('img, svg');
  return {
    walletSrc: wallet?.getAttribute('src') || null,
    tileSrc: ti?.getAttribute?.('src') || null,
    tileText: (tile?.textContent || '').trim(),
    dingbat: tile ? getComputedStyle(tile, '::after').content : 'no tile',
    anyDingbatLeft: [...document.querySelectorAll('.mog-panel .look-cost')]
      .some(c => /◆/.test(getComputedStyle(c, '::after').content || '')),
  };
});
console.log('currency:', JSON.stringify(money));
check('CURRENCY the price wears the same art as the wallet pill',
  !!money.walletSrc && money.tileSrc === money.walletSrc, JSON.stringify(money));
check('CURRENCY no Unicode dingbat is standing in for the dust icon', !money.anyDingbatLeft, money.dingbat);

/* ------------------------------------------------------------ EVERY SLOT -----
   The section used to render NOTHING on a slot holding nothing, so walking the
   doll made a feature appear and disappear, which reads as a bug rather than as a
   rule. Every gear slot now answers, with a panel or with the rule in one line.
   PROVE-RED: restore `if (!GEAR_SLOTS.includes(slot) || !baseArtId) return ''`. */
const slots = await page.evaluate(async () => {
  const { GEAR_SLOTS } = await import('./js/gear.js');
  const out = [];
  for (const code of GEAR_SLOTS) {
    const b = document.querySelector(`[data-pd="${code}"]`);
    if (!b) { out.push({ code, why: 'no doll slot' }); continue; }
    b.click();
    await new Promise(r => setTimeout(r, 750));
    out.push({ code,
      panel: !!document.querySelector('.mog-panel'),
      line: !!document.querySelector('.mog-empty'),
      tiles: document.querySelectorAll('.mog-panel .look-grid .ward-cell').length });
  }
  return out;
});
console.log('slots:', JSON.stringify(slots));
check('EVERY SLOT no gear slot leaves the look section silently missing',
  slots.length > 0 && slots.every(s => s.panel || s.line), JSON.stringify(slots.filter(s => !s.panel && !s.line)));

/* -------------------------------------------------------------- NO DEAD UI ---
   The "What is this?" link belongs to Gwart's Guide, which is a different
   workstream. It is rendered ONLY when window.openGuide exists, so this screen
   can never show a control that does nothing (anti-regression rule 5). Both
   halves are asserted: absent with no opener, present AND wired with one. */
const guide = await page.evaluate(() => ({ shownWithNoOpener: !!document.querySelector('[data-guide]') }));
check('NO DEAD UI the guide link is absent while no opener is registered', !guide.shownWithNoOpener, JSON.stringify(guide));
const wired = await page.evaluate(async () => {
  window.__guideCalls = [];
  window.openGuide = t => window.__guideCalls.push(t);
  document.querySelector('[data-pd="H"]').click();
  await new Promise(r => setTimeout(r, 900));
  const link = document.querySelector('.mog-panel [data-guide]');
  if (!link) return { rendered: false };
  link.click();
  await new Promise(r => setTimeout(r, 250));
  return { rendered: true, label: link.textContent.trim(), calls: window.__guideCalls };
});
console.log('guide hook:', JSON.stringify(wired));
check('NO DEAD UI once an opener exists the link appears and calls it with "transmog"',
  wired.rendered && wired.calls?.[0] === 'transmog', JSON.stringify(wired));

/* ---------------------------------------------------------------- ECONOMY ----
   THIS WAS AN INTERFACE PASS, so the numbers must not have moved. Applying
   through the REAL control charges exactly what transmogPrice quotes, and one tap
   still only arms (the arm-then-confirm on a paid apply is the dust safeguard and
   is not mine to remove).
   PROVE-RED: take the armToConfirm off the paid branch and the first tap spends. */
const econ = await page.evaluate(async () => {
  const loot = await import('./js/loot.js');
  const cells = [...document.querySelectorAll('.mog-panel .look-grid .ward-cell.look')];
  const t = cells.find(c => /^\d+/.test((c.querySelector('.look-cost')?.textContent || '').trim()));
  if (!t) return { why: 'no priced look on screen' };
  t.click();
  await new Promise(r => setTimeout(r, 700));
  const btn = document.querySelector('.mog-go');
  const target = btn?.dataset.lookApply;
  const authority = await loot.transmogPrice('H', target);
  const quoted = Number(btn?.dataset.lookPrice || 0);
  const before = await loot.boneDust();
  btn.click(); await new Promise(r => setTimeout(r, 400));
  const armedDust = await loot.boneDust(), armedLabel = btn.textContent.trim();
  btn.click(); await new Promise(r => setTimeout(r, 1500));
  const after = await loot.boneDust();
  return { target, authority, quoted, before, armedDust, armedLabel, after,
    wearing: (await loot.equipped())['H'] };
});
console.log('economy:', JSON.stringify(econ));
check('ECONOMY the button quotes the price the authority charges',
  !econ.why && econ.quoted === econ.authority && econ.authority > 0, JSON.stringify(econ));
check('ECONOMY one tap arms and spends NOTHING',
  !econ.why && econ.armedDust === econ.before && /spend/i.test(econ.armedLabel), `${econ.before} -> ${econ.armedDust}, "${econ.armedLabel}"`);
check('ECONOMY the confirm charges exactly that and nothing else',
  !econ.why && econ.after === econ.before - econ.authority, `${econ.before} -> ${econ.after}, price ${econ.authority}`);
check('ECONOMY and the player is actually wearing what they paid for',
  !econ.why && econ.wearing === econ.target, `${econ.wearing} vs ${econ.target}`);

/* SOURCE ROW, not a render: the interface pass must not have touched a number.
   Cheap, and it goes red the day somebody hides a balance change in a UI diff. */
const loot = readFileSync(path.join(ROOT, 'js/loot.js'), 'utf8');
const costTable = (loot.match(/const TRANSMOG_COST = \{[^}]*\}/) || [''])[0];
check('ECONOMY the transmog cost table is untouched by this pass',
  /common: 6/.test(costTable) && /uncommon: 12/.test(costTable) && /rare: 25/.test(costTable)
  && /epic: 60/.test(costTable) && /legendary: 60/.test(costTable), costTable.replace(/\s+/g, ' '));

await browser.close();
if (server) server.close();
console.log(bad ? `\n${bad} FAILED` : `\nTRANSMOG CLARITY OK`);
process.exit(bad ? 1 : 0);
