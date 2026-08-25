/* THE MEMORY CENSUS: every screen that mounts art in a loop, at EIGHT layers,
 * measured at the END OF A SCROLL.
 *
 * WHY THIS FILE EXISTS. tests/lb-memory-audit.mjs put a 90 MB budget on ONE
 * screen against a fixture wearing TWO cosmetic layers. Real players wear eight.
 * That single-screen, thin-fixture budget is exactly how six more screens with
 * the identical defect stayed invisible while we fixed the seventh
 * (gwart/MEMORY-CENSUS.md, 2026-08-13):
 *
 *     Crew tab, 120 friends   984 imgs   1537.5 MB   (no scrolling needed)
 *     Collection / Looks      371 imgs     579.7 MB
 *     Backpack melt bench     129 imgs     201.6 MB
 *     Crew tab, 8 friends     128 imgs     200.0 MB   (over the line AT OPEN)
 *     Today                    91 imgs     129.1 MB
 *
 * iOS kills the WKWebView renderer on memory and leaves NO javascript error:
 * the tab blanks and the app returns to the last route. Nothing throws, so
 * every check we owned said these screens were fine.
 *
 * THE TWO RULES THIS FILE IS BUILT ON (tally/CLAUDE.md 11 and 12):
 *   - A resource that can EXHAUST needs a CEILING, never a trend. The row this
 *     replaces asserted the mounted-image count GREW on scroll, so it passed
 *     BECAUSE the app was broken and would have gone red on the fix.
 *   - Measure in the state the player is complaining about. Every number here
 *     is the PEAK across open plus a full scroll of every scrollable container,
 *     twice, not the number at open.
 *
 * THE METRIC. Decoded RGBA actually resident in the document: every <img> with
 * naturalWidth > 0 counted as naturalWidth * naturalHeight * 4, plus every
 * <canvas> backing store as width * height * 4. That is what the renderer pays.
 *
 * EVERY NUMBER HERE IS A FLOOR, NOT A CEILING. querySelectorAll('img') cannot
 * see a CSS background-image and cannot see an off-DOM `new Image()`, and both
 * exist in this app. A screen passing here is "not caught by this instrument",
 * not "proven clean". BOTH HOLES ARE NOW SIZED rather than left open-ended
 * (2026-08-15, at 393x852 DPR 2, each measured with a control background that
 * had to move the number by exactly 1.5625 MB or the run reported nothing):
 *   - CSS background-image is effectively EMPTY. Zero file-backed sources on
 *     Today, Crew and the Boneyard; one 192px thumb (0.14 MB) on the
 *     Collection. The one data: source per screen is the --grain texture, and
 *     it is `150px 150px / repeat` everywhere it appears, so it is one tile the
 *     compositor rasterises once (~0.34 MB), not the painted area.
 *   - The off-DOM pile is the Wardrobe's, and it is what the OFF-DOM row below
 *     grades. THE NOTE THAT USED TO SIT HERE SAID EVERY ONE OF THOSE IMAGES WAS
 *     192x192 AND IT WAS WRONG, which is exactly why the row could be written,
 *     registered and then sit red for days: it graded a screen nobody had
 *     itemised. Itemised 2026-08-24, by logging src and naturalWidth per
 *     construction instead of only summing them: 402 Images, of which 258 were
 *     192x192 thumbnails and 126 were 640x640 MASTERS. drawTrimmedArt escalated
 *     any thumbnail whose trimmed ink fell under SMALL_INK straight to the
 *     master, 31 of the 57 hats trip that test at 192, and the hat slot lists
 *     them twice (the slot grid and the transmog look picker), so 62 concurrent
 *     640x640 bitmaps stood at the peak: 103.1 MB, over this file's ceiling,
 *     reproduced twice. The escalation now climbs one tier at a time, so the 384
 *     sheet serves most of them and only 24 canvases still reach a master; the
 *     same instrument reads 38.6 MB.
 *     AND THEN THE ART STOPPED BEING MOSTLY NOTHING (2026-08-24, later the same
 *     day). Every one of those thumbnails is a full-body SQUARE with the garment
 *     in a patch of it: the median hat is 61 ink pixels inside a 192px canvas,
 *     so 90% of what decoded was transparent padding. The canvases now take a
 *     CROPPED sheet, assets/bh/thumb/trim, and this row reads 11.6-12.2 MB over
 *     three consecutive runs on a busy machine (load ~13). 422 off-DOM Images
 *     became 242, none of them a master, and the escalation above no longer
 *     fires on this screen at all.
 *
 * NOT COVERED, and none of it may be read as safe:
 *   - Boneyard map. NOT a WebGL limitation: this file simply does not launch
 *     with `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader
 *     --ignore-gpu-blocklist`, and with those four flags MapLibre starts here
 *     and the screen measures 19.34 MB at open and 28.05 MB at MAP_MIN_ZOOM
 *     with 17 dens and 3 spires on screen (measured twice, 2026-08-14 and
 *     2026-08-15). It is CLEAN, it needs no device to clear this census, and
 *     the earlier "needs a device" note in this header was wrong. It is still
 *     not a ROW here because its tiles come from openfreemap over the network,
 *     and a row that goes green when tiles fail to load is a hollow check while
 *     a row that goes red is a network outage failing the gate. Which of those
 *     to accept is a product call, not this file's to make.
 *   - Stable / paddock. Another lane's unmerged work; deliberately not driven.
 *
 * AN EMPTY SCREEN IS A FAILURE, NEVER A PASS (rule 3). Every row asserts the
 * screen rendered (markup length + the art the screen is about) before it
 * grades the budget, because "mounts nothing" satisfies a budget on its own.
 *
 * PROVE-RED: revert any one of the three fixes it guards and the matching row
 * goes red --
 *   1A  drop `thumb: true` from crewCardHtml / lbAvatar / the Collection cell
 *       / the melt bench and CREW, LOOKS and BACKPACK all blow their ceiling.
 *   1B  make applyFan mount every card instead of only the seated ones (or
 *       never clear an `off` card) and CREW blows its ceiling on a 30-friend
 *       crew.
 *   1C  build teaserWallHtml eagerly in cosmeticTeaserBannerHtml instead of on
 *       first open and TODAY blows its ceiling.
 *
 * Usage: node tests/memory-census.mjs [url]      (self-serves this checkout)
 *        DIAG=1 node tests/memory-census.mjs     (per-screen breakdown)
 */

import { boot, seed, sleep, serveTree, retryOnDetach } from './godmode.js';

const CEILING_MB = 90;   // the same line lb-memory-audit draws, now on every screen

/* EIGHT LAYERS, because that is what a real player wears: body, skull, hat,
   eyes, top, right hand, pants, footwear. The two-layer fixture this suite used
   before is worth 4x and it changes verdicts. */
const FIT8 = { B: 'B0-1', SK: 'SK0-1', H: 'H1', E: 'E1', T: 'T1', IR: 'IR1', P: 'P1', FW: 'FW1' };

const base = process.argv[2] || process.env.URL;
const srv = base ? null : await serveTree(process.cwd());
/* A THROWN AUDIT MUST NOT STRAND A BROWSER. The harness leaks one on any run
   that throws (16 orphaned Chromes and 176 helpers were found on this machine
   on 2026-08-14, one alive for 15 hours). Until that lands in godmode.js, this
   file closes its own: everything below runs inside try/finally. */
let browser = null, page = null;
try {
  ({ browser, page } = await retryOnDetach(
    () => boot(base || srv.url, { headless: process.env.HEADLESS_MODE || 'shell' }),
    () => sleep(1500)));
  await run();
} finally {
  try { await browser?.close(); } catch { /* already gone */ }
  srv?.close?.();
}

async function run() {
const errs = [];
page.on('pageerror', e => errs.push(String(e).split('\n')[0]));
const fails = [];
const ok = (n, p, d = '') => { console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${d ? '  ' + d : ''}`); if (!p) fails.push(n); };

/* ---- the instrument ----------------------------------------------------- */

/* Every evaluate goes through the harness's ONE bounded detach retry. Under CPU
   contention CDP flips a frame's execution-context id and puppeteer throws
   "Attempted to use detached Frame" with nothing having navigated; a census that
   drives six screens hits it often enough to matter. */
const pe = (...a) => retryOnDetach(() => page.evaluate(...a), () => sleep(1200));

const shot = () => pe(() => {
  const imgs = [...document.querySelectorAll('img')];
  let bytes = 0, decoded = 0;
  for (const i of imgs) if (i.naturalWidth) { bytes += i.naturalWidth * i.naturalHeight * 4; decoded++; }
  const cvs = [...document.querySelectorAll('canvas')];
  for (const c of cvs) bytes += c.width * c.height * 4;
  const scr = document.getElementById('screen');
  const sheet = [...document.querySelectorAll('#sheets .sheet')].pop();
  return {
    mb: +(bytes / 1048576).toFixed(1),
    imgs: imgs.length, decoded, canvases: cvs.length,
    chars: (sheet ? sheet.innerHTML.length : 0) + (scr ? scr.innerHTML.length : 0),
    // the biggest single contributors, for DIAG
    top: Object.entries(imgs.filter(i => i.naturalWidth).reduce((a, i) => {
      const r = i.getBoundingClientRect();
      const k = `${i.naturalWidth}px source -> ${Math.round(r.width)}px box  (${(i.parentElement?.className || i.className || '?').toString().split(' ')[0] || '?'})`;
      a[k] = (a[k] || 0) + 1; return a;
    }, {})).sort((a, b) => b[1] - a[1]).slice(0, 8),
  };
});

/* SCROLL EVERY CONTAINER TO ITS VERY END, TWICE, and keep the PEAK. The end of
   the scroll is where the leaderboard died and where the Collection dies; open
   is the one state nobody was complaining about. */
async function peakOf(label) {
  let peak = await shot();
  const at = { open: peak.mb };
  for (let pass = 0; pass < 2; pass++) {
    for (const f of [0.25, 0.5, 0.75, 1, 0]) {
      await pe(frac => {
        const boxes = [document.scrollingElement, ...document.querySelectorAll('*')]
          .filter(e => e && e.scrollHeight > e.clientHeight + 8);
        for (const b of boxes) b.scrollTop = (b.scrollHeight - b.clientHeight) * frac;
      }, f);
      await sleep(650);
      const s = await shot();
      if (s.mb > peak.mb) peak = s;
    }
  }
  peak.openMb = at.open;
  if (process.env.DIAG) {
    console.log(`\n  DIAG ${label}: open ${at.open} MB, peak ${peak.mb} MB over ${peak.imgs} imgs / ${peak.canvases} canvases`);
    for (const [k, n] of peak.top) console.log(`       ${String(n).padStart(4)} x  ${k}`);
    console.log('');
  }
  return peak;
}

/* A FRESH DOCUMENT PER SCREEN. Without this, one screen's DOM inflates the
   next one's total: the census's first pass reported the Crew fan's 480 images
   inside the leaderboard's number. */
async function fresh() {
  await retryOnDetach(() => page.goto((base || srv.url).replace(/\/?$/, '/') + '?demo', { waitUntil: 'networkidle2' }), () => sleep(1200));
  await sleep(2200);
  await pe(() => {
    for (const b of document.querySelectorAll('button')) {
      const t = (b.textContent || '').trim().toLowerCase();
      if (/^(spin|nice|done|collect|claim|continue|ok|got it|next|skip)$/.test(t)) { b.click(); break; }
    }
  });
  await sleep(900);
}

const friendFixture = n => Array.from({ length: n }, (_, i) => ({
  playerId: 'cf' + i, name: 'Bonehead ' + i, alias: null, lastSeen: Date.now() - (i % 3) * 90000,
  profile: { level: 40 - (i % 30), levelName: 'Bonehead', badges: i % 9, gearCount: i % 12,
    outfit: { ...FIT8, BG: 'BG1' }, pet: null },
}));

/* ---- the account: a completionist hoarder, which is the worst case --------
   364 cosmetics owned and 120 gear pieces is the account gwart measured. The
   Collection and the melt bench are loops over exactly these two numbers. */
await seed(page, { level: 40, coins: 99999, dust: 99999 });
const account = await pe(async () => {
  const loot = await import('./js/loot.js');
  const { GEAR_ITEMS } = await import('./js/gear.js');
  const { BH_ITEMS } = await import('./data/boneheadz.js');
  let looks = 0, gear = 0;
  for (const i of BH_ITEMS) { try { await loot.grantCosmetic(i.id, 'census'); looks++; } catch { /* not grantable */ } }
  for (const g of GEAR_ITEMS.slice(0, 120)) { try { await loot.grantGear(g.id, 'census'); gear++; } catch { /* not grantable */ } }
  return { looks, gear };
});
console.log(`account seeded: ${account.looks} cosmetics granted, ${account.gear} gear pieces\n`);
ok('ACCOUNT the fixture really is a hoarder (an empty account measures nothing)',
  account.looks > 300 && account.gear > 100, `${account.looks} cosmetics, ${account.gear} gear`);

/* ---- the screens --------------------------------------------------------- */

const results = {};

async function screen(name, drive, { art, minChars = 400 } = {}) {
  await fresh();
  await drive();
  const p = await peakOf(name);
  results[name] = p;
  const rendered = p.chars > minChars;
  const hasArt = art == null ? true : await pe(sel => document.querySelectorAll(sel).length, art);
  ok(`RENDERED ${name} actually drew something (an empty sample is a FAILURE)`,
    rendered && !!hasArt, `${p.chars} chars of markup, ${hasArt} x "${art || '-'}"`);
  ok(`CEILING  ${name} stays under ${CEILING_MB} MB at the END OF THE SCROLL`,
    p.mb < CEILING_MB, `${p.mb} MB peak (${p.openMb} MB at open) across ${p.imgs} imgs / ${p.canvases} canvases`);
}

await screen('today', async () => {
  await pe(() => { location.hash = '#/today'; });
  await sleep(2000);
}, { art: '#bhStage img' });

const crewDrive = n => async () => {
  await pe(f => {
    window.__testMe = { playerId: 'me', name: 'Census', handle: 'c', friendCode: 'BONE-0' };
    window.__testFriends = { friends: f, incoming: [], outgoing: [] };
    location.hash = '#/friends';
  }, friendFixture(n));
  await sleep(2600);
  /* WALK THE FAN THE WHOLE WAY ROUND. A bound that only holds at open is a
     defer: the leaderboard's first fix looked perfect until the end of a
     scroll. Every friend has to pass through a seat. */
  for (let i = 0; i < n + 4; i++) {
    await pe(() => document.getElementById('cfanNext')?.click());
    await sleep(70);
  }
  await sleep(700);
};
await screen('crew fan, 30 friends', crewDrive(30), { art: '.cfan-card' });
await screen('crew fan, 120 friends', crewDrive(120), { art: '.cfan-card' });

/* THE CEILING, STATED AS A CEILING (rule 11). Not "the fan mounts fewer than it
   used to" and never "more mount as you go", which is the shape of check that
   passed BECAUSE the leaderboard was broken. Quadrupling the crew must not move
   the mounted-image count at all: the fan seats seven cards whatever its size,
   so the only thing that may grow is the number of empty card shells.
   PROVE-RED: delete the `if (off) stage.textContent = ''` branch in applyFan and
   this goes red at 120 friends (every card that has ever been seated stays
   mounted, which is the v373 leaderboard bug exactly). */
ok('BOUND    the crew fan mounts the same handful of stacks at 120 friends as at 30',
  results['crew fan, 120 friends'].imgs <= results['crew fan, 30 friends'].imgs + 4,
  `${results['crew fan, 30 friends'].imgs} imgs at 30 friends, ${results['crew fan, 120 friends'].imgs} at 120 (the census measured 984 / 1537.5 MB)`);

await screen('leaderboard, 100 rows', async () => {
  await pe(fit => {
    window.__testMe = { playerId: 'me', name: 'Census', handle: 'c', friendCode: 'BONE-0' };
    window.__testFriends = { friends: [], incoming: [], outgoing: [] };
    window.__testLb = Array.from({ length: 100 }, (_, i) => ({
      playerId: 'p' + i, name: 'Bonehead ' + i, level: 60 - Math.floor(i / 2), badges: 0,
      outfit: fit, pet: null, addToken: 'ATOK-' + i, lastSeen: Date.now(),
      joinedAt: Date.now(), spires: 0, spireDays: 0, you: false }));
    location.hash = '#/friends';
  }, FIT8);
  await sleep(2200);
  await pe(() => document.getElementById('crewLeaderboard')?.click());
  await sleep(2600);
}, { art: '.lb-row' });

/* The Collection is opened through the wardrobe's own pill, and this used to read
   `document.querySelector('.looks-card')?.click()`. That class has not existed in
   the app for some time (0 hits in js/app.js and app.css); the control is
   `.bh-pill.ward-looks` carrying data-tab="looks" at js/app.js:12316.

   The `?.` is what made it survive: it clicked null, did nothing, threw nothing,
   and the two rows below then graded a screen the suite had never navigated to.
   Both reported "0 elements found", which is why they read as a memory ceiling
   being breached when they were really a selector finding nothing. Until now the
   Collection and looks-shelf numbers in this file were NOT-MEASURED rather than
   clean, which is the distinction this file's own header draws.

   So it throws now. A navigation that does not happen must be loud: a silent
   miss here does not fail, it quietly re-measures the previous screen.
   Found 2026-08-23 by a peer session while auditing why this suite was red on
   pristine main. */
const openCollection = () => pe(() => {
  const b = document.querySelector('.ward-looks');
  if (!b) throw new Error('.ward-looks not found: the Collection never opened, so anything measured after this is a different screen');
  b.click();
});

await screen('collection / looks shelf', async () => {
  await pe(() => { location.hash = '#/bonehead'; });
  await sleep(2200);
  await openCollection();
  await sleep(2400);
}, { art: '.col-cell img' });

await screen('backpack melt bench', async () => {
  await pe(() => { location.hash = '#/bonehead'; });
  await sleep(2200);
  await pe(() => document.querySelector('#chTabs .ch-tab[data-tab="crates"]')?.click());
  await sleep(2400);
}, { art: '.melt-row' });

await screen('wardrobe, hat slot', async () => {
  /* THE ONE NUMBER querySelectorAll('img') CANNOT SEE. The Wardrobe's DOM is
     genuinely cheap (135 canvases at 200x200 is 20.6 MB) and the damage is
     entirely OFF-DOM: hydratePackArt fires every canvas through Promise.all and
     drawTrimmedArt builds a `new Image()` per canvas at the SOURCE's natural
     size, so 135 bitmaps decode and are alive at the same instant. gwart
     measured 210.9 MB there and this instrument reproduces it: hook the Image
     constructor, hold each one from construction until its load handlers have
     run, and sample the sum at every load. */
  await pe(() => {
    window.__imgPeakMB = 0;
    window.__imgSrc = [];
    const Native = window.Image;
    const live = new Set();
    const sample = () => {
      let b = 0;
      for (const im of live) if (im.naturalWidth) b += im.naturalWidth * im.naturalHeight * 4;
      window.__imgPeakMB = Math.max(window.__imgPeakMB, +(b / 1048576).toFixed(1));
    };
    window.Image = function (w, h) {
      const im = new Native(w, h);
      live.add(im);
      // registered at construction, so it runs BEFORE the caller's own onload;
      // the double microtask lets that handler finish before the image is released
      const done = () => queueMicrotask(() => queueMicrotask(() => live.delete(im)));
      im.addEventListener('load', () => {
        // the DECODED url, not the attribute a renderer wrote: this is what the
        // TIER row below grades, and a canvas has no naturalWidth to read later
        window.__imgSrc.push((im.currentSrc || im.src).split('assets/bh/')[1] || '?');
        sample(); done();
      }, { once: true });
      im.addEventListener('error', done, { once: true });
      return im;
    };
  });
  await pe(() => { location.hash = '#/bonehead'; });
  await sleep(2200);
  // 'H' is the wardrobe's default slot, so opening the tab IS the hat slot.
  await pe(() => document.querySelector('#chTabs .ch-tab[data-tab="wardrobe"]')?.click());
  await sleep(3000);
}, { art: '.ward-grid canvas' });

/* READ THE OFF-DOM PEAK NOW, while the page that recorded it is still loaded:
   the tier checks below reload, and window.__imgPeakMB does not survive that. */
const offDom = await pe(() => window.__imgPeakMB);
const wardSrc = await pe(() => window.__imgSrc);
/* PROVE-RED (2026-08-24, a tar-built throwaway with the FILE mutated and the
   copy grepped to confirm it landed): put drawTrimmedArt's small-ink escalation
   back to a jump straight to the master and this row reports 103 MB. That is the
   state this row was actually in when it was written, and it stayed red for days
   because the header note beside it asserted the opposite without itemising. */
ok('OFF-DOM  the Wardrobe\'s concurrent source bitmaps stay under 90 MB too',
  offDom > 0 && offDom < CEILING_MB, `${offDom} MB peak concurrent off-DOM (gwart measured 210.9 MB on 640px sources)`);

/* THE CROPPED TIER IS WHAT ACTUALLY DECODED, and the escalation never fires.
   A CEILING CANNOT GRADE THIS. The row above passed at 38.1 MB before the crop
   and passes at 11.6-12.2 MB after it, so it would stay green through a full
   revert of bhTrim() back to bhThumb(); this is the row that would not. It reads
   the srcs the hook collected AT LOAD, because the thing asserted is what the
   browser decoded, and a canvas has no naturalWidth to read afterwards.

   Only drawTrimmedArt builds off-DOM Images, so in practice this sample is 100%
   trim and the square-tier count is 0. The bound is 0.9 anyway: a future surface
   that legitimately hands drawTrimmedArt a square-tier source should not have to
   come back here, and the number that carries the meaning is `masters === 0` --
   the escalation ladder gone quiet is the whole point of cropping.
   METHOD 2026-08-24, this file's own hook, 430x932 DPR 2, machine busy (load
   ~13): 270 images, 100% trim, 0 masters, three consecutive runs. */
const trimShare = wardSrc.filter(s => s.startsWith('thumb/trim/')).length / (wardSrc.length || 1);
const masters = wardSrc.filter(s => /^(?!thumb\/)/.test(s)).length;
ok('TIER     the Wardrobe\'s canvases decode the CROPPED sheet and never reach a master',
  wardSrc.length > 100 && trimShare > 0.9 && masters === 0,
  `${wardSrc.length} images: ${(trimShare * 100).toFixed(0)}% trim, ${masters} masters, `
  + `${wardSrc.filter(s => /^thumb\/\d/.test(s)).length} square-tier`);

/* THE SHEET REALLY IS BEING SERVED, tier by tier. avatarLayersHtml falls back to
   the 640px art when a thumbnail 404s (rule 8: degrade to ugly, never to
   invisible), which is right for a player and WRONG for a check: a whole missing
   thumbnail directory would look like a clean pass with quietly restored memory.
   So assert the decoded width, on the screen, per tier.
   PROVE-RED: `rm -rf assets/bh/thumb/384` and the crew row goes red at 640.
   An empty sample is a FAILURE: zero images means the screen never rendered. */
await fresh();
await crewDrive(8)();
const tiers = await pe(() => {
  const w = sel => [...document.querySelectorAll(sel)].filter(i => i.naturalWidth).map(i => i.naturalWidth);
  return { card: w('.cfan-stage .bh-anim img'), bg: w('.cfan-bg') };
});
ok('TIER     the crew card figure is served from the 384 sheet, not the 640px art',
  tiers.card.length > 8 && tiers.card.every(n => n === 384),
  `${tiers.card.length} layers, widths ${[...new Set(tiers.card)].join('/') || 'NONE'}`);
ok('TIER     the crew card backdrop is served from the 192 sheet',
  tiers.bg.length > 0 && tiers.bg.every(n => n === 192),
  `${tiers.bg.length} backdrops, widths ${[...new Set(tiers.bg)].join('/') || 'NONE'}`);

await fresh();
await pe(() => { location.hash = '#/bonehead'; });
await sleep(2200);
await openCollection();
await sleep(2400);
const colTier = await pe(() => [...document.querySelectorAll('.col-cell img')].filter(i => i.naturalWidth).map(i => i.naturalWidth));
ok('TIER     the Collection\'s tiles are served from the 192 sheet',
  colTier.length > 100 && colTier.every(n => n === 192),
  `${colTier.length} tiles, widths ${[...new Set(colTier)].join('/') || 'NONE'}`);

/* PROVE-RED: revert the .ward-art / .pd-art canvases to bhAsset() and this row
   reports ~210 MB, the number gwart measured, because every one of those 135
   concurrent source bitmaps goes back to 640x640. An empty sample (nothing
   constructed) is a FAILURE here, not a pass: it would mean the hook never saw
   the render it exists to measure. */
ok('NO page errors anywhere in the census', errs.length === 0, errs.slice(0, 3).join(' ; '));

console.log('\n  screen                       open MB    peak MB    imgs');
for (const [k, v] of Object.entries(results)) {
  console.log(`  ${k.padEnd(28)}${String(v.openMb).padStart(7)}${String(v.mb).padStart(11)}${String(v.imgs).padStart(8)}`);
}

console.log(fails.length ? `\n${fails.length} FAILED: ${fails.join(', ')}` : '\nmemory census clean');
process.exitCode = fails.length ? 1 : 0;
}
