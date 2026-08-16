/* tests/hollow-audit.mjs — the Hollow's own guard rail.
 *
 * Every finding the Impeccable critique raised is pinned here, and every
 * assertion was proven RED against the exact code that shipped before the fix:
 *   hit boxes      84px wide -> bed0's right edge answered as bed1, bed2's as
 *                  #hlwBuy (a 1,500-coin spend). Overlap 20.1 x 57.5.
 *   thirst cue     the droplet chip rendered on EVERY growing bed, so the bed
 *                  that wanted water had no cue of its own.
 *   the fold       the only instruction on the screen, "Nothing ever dies"
 *                  included, sat 1007px down a 844px viewport.
 *   reduced motion animation-duration:0.001s alone left 23 of 24 animations
 *                  reporting playState "running", app-wide, not just here.
 *
 * Usage:  node tests/hollow-audit.mjs 390 844 [reduce]
 * Set HLW_OUT to a directory to also write a screenshot and the raw JSON.
 * An empty sample set is a FAILURE, never a pass.
 */
import fs from 'node:fs';
import { boot, serveTree, dismissOverlays, sleep, setWidth } from './godmode.js';

const ROOT = process.env.HLW_ROOT || decodeURIComponent(new URL('..', import.meta.url).pathname);
const W = Number(process.argv[2]), H = Number(process.argv[3]);
const REDUCED = process.argv[4] === 'reduce';
const TAG = `${W}x${H}${REDUCED ? '-rm' : ''}`;
const OUT = process.env.HLW_OUT || '';

const srv = await serveTree(ROOT);
const { browser, page, errors } = await boot(srv.url);
const consoleErrs = [];
page.on('console', m => { if (m.type() === 'error') consoleErrs.push(m.text()); });
if (REDUCED) await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
await setWidth(page, W, H);
await sleep(600);
await dismissOverlays(page);

// ---- put the garden into the state the fixes are ABOUT: one ready, one growing
// and watered, one growing and thirsty. Written through the app's own kv. ----
await page.evaluate(async base => {
  const kv = await import(new URL('js/db.js', base).href);
  const now = Date.now();
  await kv.kvSet('garden', {
    seeds: { graveroot: 4, ember: 2 },
    plotsOwned: 3,
    plots: [
      { ing: 'ember', plantedAt: now - 4 * 36e5, readyAt: now - 6e5, watered: true },
      { ing: 'graveroot', plantedAt: now - 36e5, readyAt: now + 72 * 6e4, watered: true },
      { ing: 'bog', plantedAt: now - 18e5, readyAt: now + 38 * 6e4, watered: false },
    ],
    composts: { date: '', used: 0 },
  });
  /* A RETURNING player for sections 1 to 5, so the full instruction note is the
     one on screen. The first visit is seeded deliberately in section 6, and the
     two states now show different instructions: the bar replaces the note. */
  await kv.kvSet('hlwSeen', now - 2 * 864e5);
}, srv.url);

await page.evaluate(() => document.querySelector('#kitchenActBtn')?.click());
await sleep(1500);
await page.evaluate(() => document.querySelector('#doorGrow')?.click());
await sleep(2600);

const fail = [];
const note = (cond, msg) => { if (!cond) fail.push(msg); };

// ---------- 1. per-bed hit test: centre AND both horizontal thirds ----------
const hits = await page.evaluate(() => {
  const desc = el => el ? `${el.tagName}${el.id ? '#' + el.id : ''}${((el.className.baseVal ?? el.className) || '').toString().trim().split(/\s+/).filter(Boolean).map(c => '.' + c).join('')}${el.dataset && el.dataset.bed != null ? `[bed=${el.dataset.bed}]` : ''}` : 'null';
  const out = [];
  const btns = [...document.querySelectorAll('#hlwStage .hlw-bed')];
  for (const b of btns) {
    const r = b.getBoundingClientRect();
    const id = b.id || `bed${b.dataset.bed}`;
    const pts = { left: r.left + r.width * 0.17, mid: r.left + r.width / 2, right: r.right - r.width * 0.17 };
    const row = { id, w: +r.width.toFixed(1), h: +r.height.toFixed(1), onscreen: r.top >= 0 && r.bottom <= innerHeight, probes: {} };
    for (const [k, x] of Object.entries(pts)) {
      for (const [ky, y] of [['top', r.top + r.height * 0.2], ['ctr', r.top + r.height / 2], ['bot', r.bottom - r.height * 0.2]]) {
        const inView = y >= 0 && y <= innerHeight && x >= 0 && x <= innerWidth;
        row.probes[`${k}-${ky}`] = inView ? desc(document.elementFromPoint(x, y)) : 'OFFSCREEN';
      }
    }
    out.push(row);
  }
  return out;
});
note(hits.length >= 4, `EMPTY SAMPLE: only ${hits.length} .hlw-bed buttons found`);
for (const r of hits) {
  const bad = Object.entries(r.probes).filter(([, v]) => v !== 'OFFSCREEN' && !v.includes(r.id.startsWith('bed') ? `[bed=${r.id.slice(3)}]` : r.id));
  if (bad.length) fail.push(`HITBOX ${r.id} (${r.w}x${r.h}) leaks at ${bad.map(([k, v]) => `${k}->${v}`).join(', ')}`);
  if (Math.min(r.w, r.h) < 40) fail.push(`TAP TARGET ${r.id} is ${r.w}x${r.h}, under the 40px floor`);
}

// ---------- 2. pairwise bed rect intersection: must be ZERO ----------
const overlaps = await page.evaluate(() => {
  const bs = [...document.querySelectorAll('#hlwStage .hlw-bed')].map(b => ({ id: b.id || `bed${b.dataset.bed}`, r: b.getBoundingClientRect() }));
  const out = [];
  for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) {
    const a = bs[i].r, b = bs[j].r;
    const ow = Math.min(a.right, b.right) - Math.max(a.left, b.left);
    const oh = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    if (ow > 0 && oh > 0) out.push({ a: bs[i].id, b: bs[j].id, ow: +ow.toFixed(1), oh: +oh.toFixed(1) });
  }
  return out;
});
note(overlaps.length === 0, `OVERLAP: ${JSON.stringify(overlaps)}`);

// ---------- 3. the instruction must be visible WITHOUT scrolling ----------
const foldInfo = await page.evaluate(() => {
  const sc = document.querySelector('#hollowBody');
  sc.scrollTop = 0;
  const n = sc.querySelector('.note, .hlw-bar');
  const r = n ? n.getBoundingClientRect() : null;
  const say = document.querySelector('#hlwSay');
  const sr = say ? say.getBoundingClientRect() : null;
  return {
    noteText: n ? n.textContent.trim() : null,
    noteFullyVisible: !!r && r.top >= 0 && r.bottom <= innerHeight,
    noteBottom: r ? +r.bottom.toFixed(1) : null,
    keeperSayVisible: !!sr && sr.top >= 0 && sr.bottom <= innerHeight,
    sayBottom: sr ? +sr.bottom.toFixed(1) : null,
    innerH: innerHeight,
    maxScroll: sc.scrollHeight - sc.clientHeight,
  };
});
note(foldInfo.noteText, 'NO instruction (.note or .hlw-bar) found in #hollowBody');
note(foldInfo.noteFullyVisible, `NOTE BELOW FOLD: bottom ${foldInfo.noteBottom} vs viewport ${foldInfo.innerH}`);
note(/cauldron/i.test(foldInfo.noteText || ''), 'NOTE never says where the harvest goes');
note(foldInfo.keeperSayVisible, `KEEPER LINE BELOW FOLD: bottom ${foldInfo.sayBottom} vs viewport ${foldInfo.innerH}`);

// ---------- 4. the thirsty bed is the ONLY one wearing the cue ----------
const chips = await page.evaluate(() => {
  const inter = (a, b) => {
    if (!a || !b) return null;
    const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
    const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    return w > 0 && h > 0 ? { w: +w.toFixed(1), h: +h.toFixed(1) } : null;
  };
  const sign = document.querySelector('#hlwSign');
  const sr = sign ? sign.getBoundingClientRect() : null;
  const others = [...document.querySelectorAll('#hlwStage .hlw-chip')].map(c => c.getBoundingClientRect());
  return [...document.querySelectorAll('#hlwStage .hlw-chip')].map((c, i) => {
    const cs = getComputedStyle(c), r = c.getBoundingClientRect();
    return {
      text: c.textContent.trim(), thirst: c.classList.contains('thirst'),
      bg: cs.backgroundColor, color: cs.color, hasDroplet: !!c.querySelector('svg'),
      w: +r.width.toFixed(1), hitsSign: inter(r, sr),
      hitsChip: others.map((o, j) => j === i ? null : inter(r, o)).filter(Boolean),
    };
  });
});
const thirsty = chips.filter(c => c.thirst), timers = chips.filter(c => !c.thirst);
note(chips.length >= 2, `EMPTY SAMPLE: ${chips.length} chips (need a thirsty AND a watered growing bed)`);
note(thirsty.length === 1, `expected exactly 1 thirst chip, got ${thirsty.length}`);
note(timers.every(c => !c.hasDroplet), 'a droplet still renders on a bed that is NOT thirsty');
note(thirsty.every(c => c.hasDroplet), 'the thirsty bed has no droplet');
for (const c of chips) {
  if (c.hitsSign) fail.push(`CHIP "${c.text}" (${c.w}px) overlaps the price sign by ${c.hitsSign.w}x${c.hitsSign.h}`);
  if (c.hitsChip.length) fail.push(`CHIP "${c.text}" overlaps another chip: ${JSON.stringify(c.hitsChip)}`);
}

// ---------- 5. reduced motion: nothing may still be RUNNING ----------
let motion = null;
if (REDUCED) {
  await sleep(900);
  motion = await page.evaluate(() => {
    const all = document.getAnimations().map(a => ({
      name: a.animationName || (a.effect && a.effect.getKeyframes && 'css') || '?',
      state: a.playState,
      iters: a.effect ? a.effect.getTiming().iterations : null,
      target: a.effect && a.effect.target ? (a.effect.target.id || a.effect.target.className.baseVal || a.effect.target.className || a.effect.target.tagName) : null,
    }));
    return { total: all.length, running: all.filter(a => a.state === 'running'), sample: all.slice(0, 24) };
  });
  note(motion.total > 0, 'EMPTY SAMPLE: getAnimations() returned nothing, the check did not run');
  note(motion.running.length === 0, `REDUCED MOTION STILL RUNNING: ${motion.running.length} of ${motion.total} -> ${JSON.stringify(motion.running.slice(0, 6))}`);
}


/* ---------- 6. the keeper knows your name, and survives not knowing it ------ */
const pools = await page.evaluate(async base => {
  const src = await (await fetch(new URL('js/app.js', base))).text();
  const block = src.slice(src.indexOf('const HLW_SAY = {'), src.indexOf('\nfunction hlwLine'));
  const out = {};
  for (const m of block.matchAll(/^\s{2}([a-zA-Z]+):\s*\[([\s\S]*?)^\s{2}\],/gm)) {
    const lines = [...m[2].matchAll(/^\s*'((?:[^'\\]|\\.)*)',/gm)].map(x => x[1]);
    out[m[1]] = { total: lines.length, unnamed: lines.filter(l => !l.includes('{n}')).length,
      named: lines.filter(l => l.includes('{n}')).length };
  }
  return out;
}, srv.url);
note(Object.keys(pools).length >= 6, `EMPTY SAMPLE: parsed ${Object.keys(pools).length} keeper pools`);
for (const [k, v] of Object.entries(pools)) {
  note(v.unnamed >= 1, `POOL "${k}" has ${v.unnamed} nameless lines: a player with no registered name would leave the keeper SILENT`);
}
note(Object.values(pools).some(v => v.named >= 1), 'no pool uses {n} at all, so the keeper never says the name');

/* CLOSE FIRST, THEN RESET. Closing the sheet is what writes hlwSeen now, so
   seeding a first visit before the close just gets overwritten by it. Getting
   this backwards made the audit report a self-destruct that the code no longer
   has, which would have sent me to fix working code. */
await page.evaluate(() => { document.querySelector('.sheet-close')?.click(); });
await sleep(900);
const named = await page.evaluate(async () => {
  const kv = await import('./js/db.js');
  await kv.kvSet('social', { name: 'Bonecrusher' });
  await kv.kvSet('hlwSeen', 0);
  return (await kv.kvGet('hlwSeen', -1)) === 0;
});
note(named, 'could not seed a first visit: hlwSeen did not reset');
await page.evaluate(() => document.querySelector('#doorGrow')?.click());
await sleep(2400);
const nameState = await page.evaluate(() => {
  const say = document.querySelector('#hlwSay');
  return {
    text: say ? say.textContent.trim() : null,
    live: say ? say.getAttribute('aria-live') : null,
    leftoverToken: say ? say.textContent.includes('{n}') : false,
    firstLayer: !!document.querySelector('.hlw-first'),
    bar: !!document.querySelector('.hlw-bar'),
    pet: !!document.querySelector('#hlwPet'),
  };
});
note(nameState.text, 'the keeper said nothing at all');
note(!nameState.leftoverToken, `an unsubstituted {n} reached the screen: "${nameState.text}"`);
note(nameState.live === 'polite', 'the keeper line is the screen primary status text and has no aria-live');

/* ---------- 7. first visit: guidance present, and it eats no taps ---------- */
note(nameState.firstLayer, 'FIRST VISIT: no .hlw-first guidance layer, which is the comp gap Tom flagged twice');
note(nameState.bar, 'FIRST VISIT: no bottom instruction bar');
note(!nameState.pet, 'FIRST VISIT: the pet is on screen and competes with the one cue the layer exists to deliver');
const shedHit = await page.evaluate(() => {
  const shed = document.querySelector('#hlwShed');
  if (!shed) return { err: 'no shed' };
  const r = shed.getBoundingClientRect();
  const desc = el => el ? `${el.tagName}${el.id ? '#' + el.id : ''}${((el.className.baseVal ?? el.className) || '').toString().trim().split(/\s+/).filter(Boolean).map(c => '.' + c).join('')}` : 'null';
  const pts = [[r.left + r.width / 2, r.top + r.height / 2], [r.left + r.width * 0.3, r.top + r.height * 0.3], [r.right - r.width * 0.3, r.bottom - r.height * 0.3]];
  return { hits: pts.map(([x, y]) => (y >= 0 && y <= innerHeight ? desc(document.elementFromPoint(x, y)) : 'OFFSCREEN')) };
});
note(!shedHit.err && shedHit.hits.every(h => h === 'OFFSCREEN' || h.includes('hlwShed')),
  `FIRST VISIT: the guidance layer intercepts the shed tap it is pointing at -> ${JSON.stringify(shedHit)}`);

/* ---------- 8. firstEver must not expire mid-visit ------------------------- */
const seenDuring = await page.evaluate(async () => (await (await import('./js/db.js')).kvGet('hlwSeen', 0)));
note(seenDuring === 0, `firstEver SELF-DESTRUCTS: hlwSeen was written to ${seenDuring} while the sheet is still open, so the welcome line expires mid-visit`);

/* ---------- 8b. THE SCREEN IN MOTION ---------------------------------------
 * Every other section in this file measures a STILL FRAME, and a creative
 * director found three defects none of them could ever see by firing one real
 * harvest tap and looking 1.4s later: the keeper standing on 96% of the bed you
 * just harvested, his speech bubble clipped 23px off the device viewport, and
 * the reward toast landing on a neighbouring timer chip. This file passed clean
 * through all of it. A guard that only knows the screen at rest teaches the team
 * that "passing" means "the still frame is fine".
 * So: tap a real ripe bed, then assert on real rects at t+400/1400/2400ms. */
{
  await page.evaluate(async () => {
    const kv = await import('./js/db.js');
    const now = Date.now();
    await kv.kvSet('garden', { seeds: { graveroot: 4 }, plotsOwned: 3, plots: [
      { ing: 'ember', plantedAt: now - 4 * 36e5, readyAt: now - 6e5, watered: true },
      { ing: 'graveroot', plantedAt: now - 36e5, readyAt: now + 72 * 6e4, watered: true },
      { ing: 'bog', plantedAt: now - 18e5, readyAt: now + 38 * 6e4, watered: false },
    ], composts: { date: '', used: 0 } });
    await kv.kvSet('hlwSeen', now - 2 * 864e5);
  });
  await page.evaluate(() => { document.querySelector('.sheet-close')?.click(); });
  await sleep(900);
  await page.evaluate(() => document.querySelector('#doorGrow')?.click());
  await sleep(2600);

  const ripe = await page.evaluate(() => {
    const b = [...document.querySelectorAll('#hlwStage .hlw-bed[data-bed]')]
      .find(x => /ready to harvest/i.test(x.getAttribute('aria-label') || ''));
    if (!b) return null;
    const i = b.dataset.bed;
    b.click();
    return i;
  });
  note(ripe != null, 'MOTION: no ripe bed to tap, so the motion checks did not run (EMPTY SAMPLE)');

  if (ripe != null) {
    const frames = [];
    for (const t of [400, 1400, 2400]) {
      await sleep(t - (frames.length ? [400, 1400, 2400][frames.length - 1] : 0));
      frames.push(await page.evaluate(bed => {
        const inter = (a, b) => {
          if (!a || !b) return null;
          const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
          const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
          return w > 0 && h > 0 ? { w: +w.toFixed(1), h: +h.toFixed(1) } : null;
        };
        const r = el => el ? el.getBoundingClientRect() : null;
        const stage = document.querySelector('#hlwStage');
        const sr = stage.getBoundingClientRect();
        const art = document.querySelector(`#hlwBedArt${bed}`);
        const av = document.querySelector('#hlwAv');
        const say = document.querySelector('#hlwSay');
        const toast = document.querySelector('.hlw-toast');
        const chips = [...document.querySelectorAll('#hlwStage .hlw-chip')].map(r);
        const sayR = r(say);
        /* INTERSECTION IS NOT OCCLUSION. Two boxes can overlap while the lower
           one is painted ON TOP, which is exactly the fix here: the harvested bed
           is raised above the keeper for the length of the pluck. So record who
           actually paints above whom, and only count the overlap when the keeper
           wins. Measured, not assumed: read both computed z-indexes. */
        const zi = el => { if (!el) return 0; const v = parseInt(getComputedStyle(el).zIndex, 10); return Number.isFinite(v) ? v : 0; };
        const keeperAbove = zi(av) > zi(art);
        return {
          artZ: zi(art), keeperZ: zi(av), keeperAbove,
          keeperOverBed: keeperAbove ? inter(r(art), r(av)) : null,
          keeperBoxOverlap: inter(r(art), r(av)),
          bedBox: art ? { w: +r(art).width.toFixed(1), h: +r(art).height.toFixed(1) } : null,
          sayClipLeft: sayR ? +Math.max(0, sr.left - sayR.left).toFixed(1) : null,
          sayClipRight: sayR ? +Math.max(0, sayR.right - sr.right).toFixed(1) : null,
          sayOffViewport: sayR ? +Math.max(0, -sayR.left, sayR.right - innerWidth).toFixed(1) : null,
          toastOverChip: toast ? chips.map(c => inter(r(toast), c)).filter(Boolean) : [],
          toastPresent: !!toast,
        };
      }, ripe));
    }
    /* SCOPE IT TO THE PAYOFF WINDOW. Walking across a bed on the way somewhere is
       not a defect, it is a character crossing a garden. The defect is standing on
       the bed DURING the reward, so measure only the frames where the reward is on
       screen. Widening this to every frame made it fail on ordinary transit, which
       would have trained everyone to ignore it. */
    const payoff = frames.filter(f => f.toastPresent);
    note(payoff.length > 0, 'MOTION no frame had the reward on screen, so the occlusion check proved nothing (EMPTY SAMPLE)');
    const worstOcc = payoff.map(f => f.keeperOverBed).filter(Boolean)
      .sort((a, b) => (b.w * b.h) - (a.w * a.h))[0] || null;
    const box = frames.find(f => f.bedBox)?.bedBox;
    /* The keeper may stand NEAR the bed he is working; he may not stand ON it.
       Failure direction and bound, not a trend: no more than a third of the bed
       art may be hidden at any sampled moment. 96% is what shipped. */
    const occFrac = worstOcc && box ? (worstOcc.w * worstOcc.h) / (box.w * box.h) : 0;
    note(occFrac <= 0.34,
      `MOTION the keeper stands ON the harvested bed: ${Math.round(occFrac * 100)}% of the art occluded (${JSON.stringify(worstOcc)} of ${JSON.stringify(box)})`);
    /* An EMPTY sample here would make the check above trivially pass, so require
       that the two figures really did share space and the art really did win. */
    note(frames.some(f => f.keeperBoxOverlap),
      'MOTION the keeper never came near the bed he harvested, so the occlusion check proved nothing (EMPTY SAMPLE)');
    note(payoff.some(f => f.artZ > f.keeperZ),
      `MOTION the harvested bed is never raised above the keeper, so the pluck plays behind him (artZ ${frames.map(f => f.artZ).join('/')} vs keeperZ ${frames.map(f => f.keeperZ).join('/')})`);
    const clip = Math.max(...frames.map(f => Math.max(f.sayClipLeft || 0, f.sayClipRight || 0, f.sayOffViewport || 0)));
    note(clip <= 0.5, `MOTION the keeper's speech bubble is clipped by ${clip}px during the harvest`);
    const tc = frames.flatMap(f => f.toastOverChip);
    note(tc.length === 0, `MOTION the reward toast collides with a timer chip: ${JSON.stringify(tc)}`);
    note(frames.some(f => f.toastPresent), 'MOTION no reward toast appeared at all after a real harvest (EMPTY SAMPLE)');
  }
}

/* ---------- 8c. IS IT ACTUALLY A MODAL ------------------------------------
 * Measured before the fix: the tab cycle was 59 stops long and the first stop
 * INSIDE the Hollow was stop 46. Forty-five focusable controls sat behind the
 * overlay, invisible and tabbable, and Escape did nothing. role="dialog" was
 * set with aria-modal null and no accessible name. */
{
  const modal = await page.evaluate(() => {
    // the LAST sheet: the Hollow opens on top of the Kitchen, so the first
    // .sheet in the document is not the one under test
    const sheets = [...document.querySelectorAll('#sheets .sheet')];
    const sheet = sheets[sheets.length - 1];
    const app = document.querySelector('#app');
    // an element inside an inert subtree is NOT reachable, so it must not count
    const reachable = el => { for (let n = el; n; n = n.parentElement) if (n.inert) return false; return true; };
    const focusables = root => [...root.querySelectorAll('a[href],button,input,select,textarea,[tabindex]:not([tabindex="-1"])')]
      .filter(el => !el.disabled && el.offsetParent !== null && reachable(el));
    return {
      hasSheet: !!sheet,
      ariaModal: sheet ? sheet.getAttribute('aria-modal') : null,
      name: sheet ? (sheet.getAttribute('aria-label') || '') : '',
      // the background is every child of #app EXCEPT the sheet host, because
      // #sheets lives inside #app and inerting the parent kills the sheet too
      appInert: !!(app && [...app.children].filter(el => el.id !== 'sheets').every(el => el.inert)),
      appHidden: app ? app.getAttribute('aria-hidden') : null,
      bgFocusable: app ? [...app.children].filter(el => el.id !== 'sheets')
        .reduce((n, el) => n + focusables(el).length, 0)
        + sheets.slice(0, -1).reduce((n, el) => n + focusables(el).length, 0) : -1,
      focusInside: !!(sheet && sheet.contains(document.activeElement)),
    };
  });
  note(modal.hasSheet, 'MODAL no sheet on screen, so the modal checks did not run (EMPTY SAMPLE)');
  note(modal.ariaModal === 'true', `MODAL role=dialog without aria-modal (got ${modal.ariaModal})`);
  note(modal.name.length > 0, 'MODAL the dialog has no accessible name');
  note(modal.appInert, 'MODAL the background is not inert, so every control behind the overlay is still tabbable');
  note(modal.bgFocusable === 0, `MODAL ${modal.bgFocusable} focusable controls remain behind the overlay`);
  note(modal.focusInside, 'MODAL focus never moved into the sheet on open');

  await page.keyboard.press('Escape');
  await sleep(800);
  const gone = await page.evaluate(() => !document.querySelector('#hollowBody'));
  note(gone, 'MODAL Escape does not close the sheet');
  // reopen for whatever runs after this
  if (gone) {
    await page.evaluate(() => document.querySelector('#doorGrow')?.click());
    await sleep(2400);
  }
}

/* ---------- 9. the only exit clears the 44px floor ------------------------- */
const closeBox = await page.evaluate(() => {
  const b = document.querySelector('.sheet-close');
  if (!b) return null;
  const r = b.getBoundingClientRect();
  return { w: +r.width.toFixed(1), h: +r.height.toFixed(1) };
});
note(closeBox && closeBox.w >= 44 && closeBox.h >= 44,
  `the sheet's only exit is ${closeBox ? closeBox.w + 'x' + closeBox.h : 'missing'}, under the 44px floor`);

await sleep(300);
if (OUT) await page.screenshot({ path: `${OUT}/fix-${TAG}.png` });

const res = { TAG, fail, hits, overlaps, foldInfo, chips, motion, pageErrors: errors, consoleErrors: consoleErrs };
if (OUT) fs.writeFileSync(`${OUT}/fix-${TAG}.json`, JSON.stringify(res, null, 1));
note(errors.length === 0, `PAGE ERRORS: ${JSON.stringify(errors.slice(0, 3))}`);
console.log(`\n=== ${TAG} ===`);
console.log(fail.length ? fail.map(f => 'FAIL ' + f).join('\n') : 'ALL PASS');
await browser.close(); srv.close?.();
process.exit(fail.length ? 1 : 0);
