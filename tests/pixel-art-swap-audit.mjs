/* tests/pixel-art-swap-audit.mjs — WHERE THE APP STILL DRAWS THE OLD PICTURE.
 *
 * WHY THIS EXISTS, in Tom's words, 2026-08-21:
 *   "the daily spin wheel still doesnt have the pixel art icons in some of the
 *    wheel's parts ive also seen pixel art mixed and not swapped elsewhere in
 *    the app"
 * He was right about the wheel and right that it was not only the wheel. Three
 * of the seven wedges drew vectors at 35-39 rendered px, next to four wedges of
 * 48px pixel art in the same circle. The comment above them said the art did not
 * exist. It did: two different 48px chests under assets/crates/ and all seven
 * ingredients under assets/icons-pix/. A note that says "no art exists" is the
 * most durable way to hide a swap, because it stops the next person looking.
 *
 * WHAT THE TWO EXISTING GUARDS COVER, AND THE HOLE BETWEEN THEM.
 *   tests/icon-inventory-audit.mjs   the REGISTER. Pure source. It knows every
 *     call site, its requested size, and whether that size clears the drawer's
 *     pixel floor. It cannot know what a screen LOOKS like, and it grades a
 *     drawer by a declared `floor`, so a drawer declared `floor: null` ("no
 *     pixel art exists") is believed. js/wheel.js:iconAt and :iconHtml are
 *     declared exactly that way, which is why 305 graded sites and 7/7 green
 *     coexisted with three vector wedges on the wheel.
 *   tests/boneyard-icon-audit.mjs    the RENDER, for ONE screen. It boots the
 *     Boneyard, reads the map and the map key, and measures pixels. Everything
 *     it does is right and none of it looks anywhere else: Today, the hub, the
 *     Shop, the Kitchen, the Pit, the Stable, the Crew, the badge wall and the
 *     daily wheel are all outside it.
 * So the hole is: EVERY OTHER SCREEN, RENDERED. This file is that, and it does
 * not read a class name to find an icon, because the whole defect is that a
 * silent fallback produces markup that looks correct in source and correct in
 * the DOM. It identifies a drawing by the drawing: the vector pack's path data,
 * normalised through the page's own serializer, so a rendered <svg> is matched
 * back to the concept it depicts and then asked whether that concept has pixel
 * art on disk.
 *
 * WHAT IT ASSERTS, and which direction is failure.
 *   CONTROL   NINE rows, because this file has three graded media and each one
 *             passes for free on a sample that does not contain it. Every driver
 *             painted something (counted INSIDE the app's content, not including
 *             the always-present tab bar), the ten drivers landed on ten DIFFERENT
 *             screens, all three media are present, the seeded dish really reached
 *             the Backpack, an icons-pix PNG was found AND decoded, EVERY pixel
 *             img decoded, the vector fingerprint table matched real drawings, the
 *             emoji table was derived from the game's data, and the inventory parse
 *             yielded rows. An empty sample is a FAILURE, never a pass: four
 *             guards in this repo went green while blind on 2026-08-19.
 *   SWAP      no rendered vector draws at >= 16 CSS px for a concept that HAS
 *             pixel art. 16 is pixCur's floor, so at or above it the art was
 *             available and something chose the vector. Below 16 is the standing
 *             rule (a 48px drawing crushed into a line of copy is mush) and is
 *             already inventoried by icon-inventory-audit's SUBFLOOR list.
 *   EMOJI     no element whose entire text is a single emoji renders at >= 16px
 *             for a concept that has pixel art. This is the third medium and
 *             neither existing guard can see it: an emoji is not an <svg> and
 *             not an <img>, so it is invisible to a scan for either. It found the
 *             Backpack tab's active-dish row drawing the recipe EMOJI in a
 *             .crate-ico slot, which app.css sets to font-size 24, while the
 *             Kitchen drew the 24px pixel dish off the very same buff objects.
 *   STEP      every icons-pix / crates <img> renders at a whole 16/24/48/96 AND
 *             at exactly the width its own attribute claims. Failure is the
 *             fractional resample: art that only survives integer scaling put
 *             through a CSS transform reads as mush while every count still
 *             passes. (boneyard-icon-audit pins this on the map; this pins it
 *             everywhere else.)
 *   CALLSITE  no bhIcon() call asks >= 16 for a pack id that has a pixel twin.
 *             SOURCE-derived on purpose: this is the half the DOM sample cannot
 *             reach, because SCREENS is ten screens and the app has more.
 *             A call passing a TINT is exempt by derivation, not by hand: pixel
 *             art cannot be recoloured, so a tinted call is a deliberate vector
 *             (the rule badgePixHtml already documents). A call that is the RHS
 *             of a `pixCur(...) ||` is also exempt by derivation: it is the
 *             fallback arm and never renders while the art is on disk.
 *   SHORTFALL no call site asks a size that snaps down by more than a fifth.
 *             pixCur snaps 48/24/16 and crateIcon floors at 24, so a request for
 *             34 serves 24 and leaves 10px of reserved space empty. This is the
 *             mechanism behind the mini-boss skull ("mini boss den scale up
 *             skill it's too small"): it asked 17, served 16, and sat in a 34px
 *             disc. A fifth is the threshold because 26 -> 24 is rounding and
 *             34 -> 24 is a hole.
 *
 * WHERE THE TWO SOURCE ROWS GET THEIR DATA. From icon-inventory-audit.mjs's own
 * printed inventory, run as a child process, NOT from a second scanner written
 * here. That file's header says running it regenerates the inventory, and it is
 * 545 lines of careful prose-stripping and drawer arithmetic that would be worse
 * the second time. If its output format ever changes, the parse yields zero rows
 * and CONTROL goes red rather than these two rows passing on nothing.
 *
 * PROVE-RED: see PROVEN-RED-BY at the bottom. Every row was reddened against a
 * real defect in a throwaway tree, exit codes read from a file.
 *
 * Serves this tree by default and NEVER defaults to production. Pass a URL as
 * argv[2] only to point it somewhere deliberately.
 * Usage: HEADLESS_MODE=shell node tests/pixel-art-swap-audit.mjs
 */
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boot, seed, sleep, serveTree } from './godmode.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const JS = path.join(ROOT, 'js');
const STEPS = [16, 24, 48, 96, 144];
const FLOOR = 16;              // pixCur's floor. At or above it, the art exists to be used.
const SHORTFALL_KEEP = 0.8;    // a request may lose up to a fifth to snapping

const out = [];
let fails = 0;
const ok = (m, cond, detail = '') => {
  if (cond) out.push(`ok   ${m}${detail ? '  ' + detail : ''}`);
  else { fails++; out.push(`FAIL ${m}${detail ? '  ' + detail : ''}`); }
};

/* ==========================================================================
 * 1. WHICH CONCEPTS HAVE PIXEL ART. Derived from the tables that decide it,
 *    never hand-listed: a hand list is one art drop away from lying, and a
 *    lying list is what put three vector wedges on the wheel.
 * ======================================================================== */
const pixSrc = readFileSync(path.join(JS, 'icons-pix.js'), 'utf8');
const appSrc = readFileSync(path.join(JS, 'app.js'), 'utf8');
const packSrc = readFileSync(path.join(JS, 'icons-pack.js'), 'utf8');

const table = (src, name) => Object.fromEntries(
  [...((src.match(new RegExp(`const ${name} = \\{([\\s\\S]*?)\\n?\\};`)) || [, ''])[1])
    .matchAll(/'?([\w-]+)'?\s*:\s*'([^']+)'/g)].map(m => [m[1], m[2]]));

const PIX_CUR = table(pixSrc, 'PIX_CUR');                 // concept -> assets/icons-pix/<file>.png
const CRATE_ICON_PIX = table(appSrc, 'CRATE_ICON_PIX');   // crate kind -> assets/<path>.png
/* THE PACK IDS THAT HAVE A PIXEL TWIN, by the three rules that actually relate
   the two sets. Identity covers the badges, the dishes and the tombstone; the
   `ingr-` strip covers the seven cooking ingredients, which PIX_CUR keys by
   INGREDIENTS id; and the three below are the renames, each with the crate art
   or the consumable id it maps onto. */
const RENAMED = { 'crate-daily': 'crate', 'crate-golden': 'crates/golden/f0', charm: 'xp2' };
const twinOf = id => (PIX_CUR[id] ? id
  : PIX_CUR[id.replace(/^ingr-/, '')] ? id.replace(/^ingr-/, '')
    : RENAMED[id] || null);

/* The pack's raw path data, per id. bhIcon emits `<svg ...>${it.p}</svg>`, so
   `p` IS what lands in the DOM and it is the only thing that identifies which
   drawing you are looking at once it is on screen. */
const RAW = {};
for (const m of packSrc.matchAll(/^\s*"([\w-]+)":\s*\{ vb: "([^"]+)", p: "((?:[^"\\]|\\.)*)" \},$/gm)) {
  RAW[m[1]] = JSON.parse('"' + m[3] + '"');
}
const VECTORS = Object.entries(RAW)
  .map(([id, markup]) => ({ id, concept: twinOf(id), markup }))
  .filter(v => v.concept);

/* THE EMOJI THAT STAND FOR A CONCEPT WITH ART. Scraped off the object literals
   that pair an emoji with an id: cooking.js (ingredients, dishes, potions),
   loot.js (crates, consumables) and app.js's BADGE_ICON, which is literally an
   emoji -> pack-id map. Each line offers up to three concept candidates (its
   leading key, its `id:` and its `iconId:`); the first with a pixel twin wins. */
const EMOJI = {};
const EMOJI_RX = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]\u{FE0F}?/u;
for (const f of ['cooking.js', 'loot.js', 'app.js']) {
  for (const line of readFileSync(path.join(JS, f), 'utf8').split('\n')) {
    const e = (line.match(new RegExp(`icon:\\s*'(${EMOJI_RX.source})'`, 'u'))
      || line.match(new RegExp(`^\\s*'(${EMOJI_RX.source})':\\s*'([\\w-]+)'`, 'u')));
    if (!e) continue;
    const glyph = e[1].replace(/️/g, '');
    const cands = [e[2], (line.match(/\bid:\s*'([\w-]+)'/) || [])[1],
      (line.match(/\biconId:\s*'([\w-]+)'/) || [])[1],
      (line.match(/^\s*([\w-]+):\s*\{/) || [])[1]].filter(Boolean);
    for (const c of cands) {
      const t = twinOf(c) || (CRATE_ICON_PIX[c] ? c : null);
      if (t) { (EMOJI[glyph] ||= new Set()).add(c); break; }
    }
  }
}
const EMOJI_MAP = Object.fromEntries(Object.entries(EMOJI).map(([k, v]) => [k, [...v].join('/')]));

/* ==========================================================================
 * 2. THE DECLARED EXEMPTIONS. Each one is a decision on the record, with the
 *    reason. A NEW hit fails by name; a declared one that gets fixed also
 *    fails, so the ledger cannot rot into a list of things that are no longer
 *    true. Same contract as icon-inventory-audit's SUBFLOOR.
 * ======================================================================== */
/* SWAP + EMOJI: keyed `<screen>|<concept>`. */
const SWAP_OK = {
  /* ---- THE BADGE WALL. This is an ART JOB, not a wiring miss, and doing the
     wiring alone would make it worse. #/progress draws all 23 achievement
     badges through badgeIconHtml -> bhIcon(id, 22). Exactly seven of the 23
     ids have a pixel drawing (badge-skull, badge-crown, badge-trophy,
     badge-footprint, badge-signpost, tombstone, and ingr-marrow standing in for
     the bone). Wiring those seven puts seven pixel sprites in a grid of sixteen
     vectors, which is a louder version of the complaint this file is named for.
     The 16 with no drawing are badge-boxing, badge-target, badge-muscle,
     badge-map, badge-meal, badge-scan, badge-magnify, flame, badge-rocket,
     badge-laurels, badge-cart, badge-scales, badge-tophat, badge-coat,
     badge-moai and garden-*. Swap the wall when those exist, all at once. */
  'progress|badge-skull': 'the badge wall: 7 of 23 badges have art, see the block above.',
  'progress|badge-crown': 'the badge wall: 7 of 23 badges have art, see the block above.',
  'progress|badge-trophy': 'the badge wall: 7 of 23 badges have art, see the block above.',
  'progress|badge-footprint': 'the badge wall: 7 of 23 badges have art, see the block above.',
  'progress|badge-signpost': 'the badge wall: 7 of 23 badges have art, see the block above.',
  'progress|tombstone': 'the badge wall: 7 of 23 badges have art, see the block above.',
  'progress|marrow': 'the badge wall: 7 of 23 badges have art, see the block above.',

  /* ---- THE ONE SITE THAT IS TWO PIXELS SHORT, and it is already on the other
     guard's list. renderPit draws the Gauntlet card's golden crate at 22, and
     crateIcon's floor is 24, so it falls to the vector. icon-inventory-audit
     declares it as 'js/app.js:renderPit|crate/golden', calls it "the strongest
     CANDIDATE on this list", and that is where the decision belongs: it is a
     card-layout change (the row is 22px of art today) and it wants Tom's eye on
     the rendered card, not a blind +2 from here. */
  'pit|crates/golden/f0': '22px on the Gauntlet card, 2 under crateIcon\'s floor. Declared and reasoned in icon-inventory-audit SUBFLOOR as js/app.js:renderPit|crate/golden.',

  /* ---- THE WHEEL HUB. .dw-hub is a 💀 at font-size min(7vw,26px), and
     badge-skull.png would fit it. It is deliberately NOT swapped: the hub is
     the wheel's axle, a piece of furniture inside a bespoke component with its
     own injected stylesheet, not one of the seven prize icons Tom was pointing
     at. Swapping it is a look decision on the wheel's centre, not a leftover.
     Listed rather than filtered out so it is Tom's call to make, not mine. */
  'wheel|badge-skull': 'js/wheel.js .dw-hub, the wheel\'s axle glyph. Furniture, not a prize icon; a look decision for Tom rather than a missed swap.',
  'wheel-reveal|badge-skull': 'js/wheel.js .dw-hub, see wheel|badge-skull.',

};

/* CALLSITE: keyed `<file>:<line>`. */
const CALLSITE_OK = {};

/* SHORTFALL: keyed `<file>:<line>`, and every one names what it would take.
   These are the sites where the reserved space and the served art are more than
   a fifth apart. They are a WORKLIST, not a clean bill: each is a real hole,
   none is a wrong medium, and every one needs a look at the rendered surface
   before its number moves, because bumping a request to the next whole step
   grows the icon and can push its own row. */
const SHORTFALL_OK = {
  'js/app.js:hydrateRaceResult|badge-trophy@21': 'badgePixHtml(badge-trophy, 21) -> 16 in the race-result ribbon. 21 is one under 24 and the ribbon is a fixed-height pill; needs the pill measured before the bump.',
  'js/app.js:revealGift|crate/?@130': 'crateIcon(p.crate, 130) -> 96 on the gift reveal CARD. 34px of the card\'s art slot is empty. 144 is the next whole step and the card is 148 wide at 375; wants the card re-measured, not a blind +14.',
  'js/app.js:openDenSheet|coin@22': 'ICONS.coin(22) -> 16 in the den sheet reward row, which sits beside ICONS.star(20) -> 16, so the row is internally consistent AT 16 and moving one of the two would break that.',
  'js/app.js:renderFriends|badge-trophy@22': 'badgePixHtml(badge-trophy, 22) -> 16 on the race champion strip. Same pill question as :1624.',
  'js/app.js:NEWS|badge-crown@34': 'badgePixHtml(badge-crown, 34) -> 24 as the NEWS row thumb. The largest single hole on this list at 10px; 48 is the next step and would double the thumb, so this is a NEWS row layout decision.',
  'js/app.js:renderBoneyard|crate/?@130': 'crateIcon(res.crate, 130) -> 96 on the Boneyard collect reveal. The same card as :2400 and it moves with it.',
  'js/app.js:renderPit|tombstone@22': 'badgePixHtml(tombstone, 22) -> 16 in the Pit ceiling head, beside badgePixHtml(badge-skull, 20) -> 16. Consistent at 16 for the same reason as :4349.',
};

/* ==========================================================================
 * 3. THE SCREENS. Each drives ONE surface and must report that it rendered
 *    something; a driver that reaches nothing is a FAILURE, not a pass.
 * ======================================================================== */
const SCREENS = [
  ['today', p => hash(p, '#/today')],
  ['bonehead', p => hash(p, '#/bonehead')],
  ['shop', p => hash(p, '#/shop')],
  ['progress', p => hash(p, '#/progress')],
  /* NOT HERE, AND MEASURED RATHER THAN ASSUMED: #/foods, #/friends and #/settings
     render 1, 0 and 0 pictures respectively outside the tab bar on a demo save.
     Foods is a text list with stroke controls, and Crew and Settings draw nothing
     at all without a signed-in social account. Driving them costs 15s and adds a
     screen the distinctness control cannot tell from another empty one, so they
     would have to be exempted from their own control. The one icon on those
     screens that this class could reach is the sealed-gift crate in renderFriends,
     which needs a pending gift from a real account to render; it is covered from
     source by the CALLSITE row instead. */
  ['backpack', p => viaToday(p, 'charBtn')],
  ['stable', p => viaToday(p, 'stableBtn')],
  ['kitchen', async p => {
    await viaToday(p, 'kitchenActBtn');
    await p.evaluate(() => document.getElementById('doorCook')?.click());
    await sleep(1400);
  }],
  ['pit', p => viaToday(p, 'pitBtn')],
  /* The wheel is forced open rather than waited for: it is once-a-day gated and
     skipped under webdriver, and `force` is the hook it already exposes for
     exactly this (tests/wheel-audit.mjs uses the same door). */
  ['wheel', async p => {
    await hash(p, '#/today');
    await p.evaluate(async () => {
      const w = await import('./js/wheel.js');
      window.__wheelForce = 1;
      w.maybeShowDailyWheel({ sounds: false, force: true });
    });
    await sleep(2500);
  }],
  ['wheel-reveal', async p => {
    await p.evaluate(() => window.__dw && window.__dw.reveal());
    await sleep(1300);
  }],
];

const closeAll = p => p.evaluate(() => {
  document.querySelectorAll('#sheets .sheet').forEach(s => s.remove());
  document.querySelector('.dw')?.remove();
});
const hash = async (p, h) => { await p.evaluate(x => { location.hash = x; }, h); await sleep(1400); await closeAll(p); };
const viaToday = async (p, id) => {
  await hash(p, '#/today');
  await p.evaluate(i => document.getElementById(i)?.click(), id);
  await sleep(2000);
};

/* ==========================================================================
 * 4. THE RENDER PASS.
 * ======================================================================== */
const srv = process.argv[2] ? null : await serveTree(ROOT);
const base = process.argv[2] || srv.url;
console.log(`URL UNDER TEST: ${base}`);

const { browser, page } = await boot(base, {
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const nodes = [];
const drove = [];
try {
  await page.setViewport({ width: 430, height: 932, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await seed(page, { level: 14, coins: 5000, dust: 5000 });
  /* GIVE THE SAMPLE THE SURFACES IT IS MEANT TO GRADE. The hub's "active dish"
     row and the Kitchen's pantry only render when there is something in them, and
     an audit whose sample cannot reach the row it was written for is the vacuous
     green four guards in this repo shipped on 2026-08-19. The active-dish row is
     specifically where the EMOJI row's real subject lives: without this the only
     emoji in the whole sample is the wheel's own hub, which is declared, so the
     row would grade nothing while reporting ok. Written the way the game writes
     it, off real RECIPES entries through cooking.js's own buff shape. */
  await page.evaluate(async () => {
    const { RECIPES } = await import('./js/cooking.js');
    const { kvSet } = await import('./js/db.js');
    const r = RECIPES.find(x => x.buff) || RECIPES[0];
    const b = { recipe: r.id, name: r.name, icon: r.icon, ...r.buff };
    if (b.kind === 'coins') b.untilMs = Date.now() + 6 * 3600e3;
    if (b.kind === 'combat') b.fightsLeft = b.fights;
    await kvSet('foodbuffs', [b]);
    await kvSet('pantry', RECIPES.slice(0, 3).map(x => ({ recipeId: x.id, name: x.name, icon: x.icon, cookedAt: Date.now() })));
    await kvSet('ingredients', { marrow: 4, graveroot: 3, ember: 2, bog: 2, sinew: 3, salt: 4, ectoplasm: 1 });
  });
  await page.reload({ waitUntil: 'networkidle2' });
  await sleep(2200);

  for (const [label, drive] of SCREENS) {
    let err = null;
    /* NO closeAll() HERE. Every driver that needs one calls hash(), which closes
       for it; `wheel-reveal` deliberately continues from the screen `wheel` left
       open, and closing first detached the wheel and graded an empty overlay. */
    try { await drive(page); await sleep(700); }
    catch (e) { err = String(e.message || e).split('\n')[0]; }
    const got = err ? { seen: [], total: 0, slots: 0 } : await page.evaluate((label, VECTORS, EMOJI_MAP) => {
      /* NORMALISE THE EXPECTED MARKUP THROUGH THIS PAGE'S OWN SERIALIZER.
         Comparing a string from a .js file against element.innerHTML compares
         two different quoting conventions and matches nothing, which is a guard
         that passes because it can never fire. Round-tripping both sides
         through the same parser is the only version that cannot go blind. */
      const bin = document.createElement('div');
      bin.style.cssText = 'position:absolute;left:-9999px;top:-9999px';
      document.body.appendChild(bin);
      const fp = s => s.replace(/\s+/g, '').slice(0, 160);
      const byFp = {};
      for (const v of VECTORS) {
        bin.innerHTML = `<svg viewBox="0 0 512 512">${v.markup}</svg>`;
        byFp[fp(bin.firstChild.innerHTML)] = v;
      }
      bin.remove();

      const px = n => Math.round(n * 10) / 10;
      const shown = el => {
        const cs = getComputedStyle(el);
        if (cs.visibility === 'hidden' || cs.display === 'none' || cs.opacity === '0') return false;
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      };
      const seen = [];
      for (const el of document.querySelectorAll('img')) {
        if (!shown(el)) continue;
        const r = el.getBoundingClientRect();
        seen.push({ label, kind: 'img', src: el.getAttribute('src'), nw: el.naturalWidth,
          w: px(r.width), h: px(r.height), attrW: Number(el.getAttribute('width')) || null });
      }
      for (const el of document.querySelectorAll('svg')) {
        if (el.closest('svg') !== el || !shown(el)) continue;   // outermost only
        const hit = byFp[fp(el.innerHTML)];
        if (!hit) continue;
        const r = el.getBoundingClientRect();
        seen.push({ label, kind: 'svg', concept: hit.concept, id: hit.id, w: px(r.width), h: px(r.height) });
      }
      /* EMOJI. An icon slot is an element whose ENTIRE trimmed text is the
         glyph: a sentence that happens to contain 🦴 is copy, not an icon, and
         flagging it would be the false red that teaches people to ignore this
         file. The size that matters is the rendered font-size, because an emoji
         has no box of its own. */
      const glyphs = Object.keys(EMOJI_MAP);
      for (const el of document.querySelectorAll('span,b,i,div,button,small,td,li')) {
        if (el.children.length || !shown(el)) continue;
        const t = (el.textContent || '').replace(/️/g, '').trim();
        if (!glyphs.includes(t)) continue;
        seen.push({ label, kind: 'emoji', glyph: t, concept: EMOJI_MAP[t],
          w: px(parseFloat(getComputedStyle(el).fontSize)), h: 0 });
      }
      /* `total` is the DRIVER's control and is deliberately not the same number
         as seen.length. #/settings and #/foods hold only stroke controls (close,
         chevron, search) which no pixel art will ever replace, so they classify
         to zero here while having rendered perfectly. Grading the driver on the
         classified count would demand every screen carry currency, which is a
         false red; grading it on "did this surface paint any picture at all" is
         the question the control is actually asking. */
      /* CONTENT ONLY, NOT THE CHROME. #tabbar and #gearBtn are static markup in
         index.html and are on screen on every route, so counting the whole
         document made this "did the app boot", which it already knows, and the
         row could not fail on a screen that rendered nothing at all. */
      const total = [...document.querySelectorAll('img,svg')]
        .filter(el => shown(el) && !el.closest('#tabbar') && !el.closest('#gearBtn')).length;
      /* The seeded-surface control's evidence, and the only place this file looks
         at a class: it asks whether the ROW EXISTS, never what is drawn in it. */
      const slots = [...document.querySelectorAll('.crate-row .crate-ico')].filter(shown).length;
      return { seen, total, slots };
    }, label, VECTORS, EMOJI_MAP);
    nodes.push(...got.seen);
    drove.push({ label, err, n: got.seen.length, total: got.total, slots: got.slots });
    console.log(`  ${label.padEnd(14)} ${err ? 'DRIVER FAILED: ' + err : `${got.total} pictures, ${got.seen.length} classified`}`);
  }
} finally {
  await browser.close().catch(() => {});
  if (srv) srv.close();
}

/* ==========================================================================
 * 5. THE ROWS.
 * ======================================================================== */
const PIXPATH = /^assets\/(icons-pix|crates)\//;
const pixImgs = nodes.filter(n => n.kind === 'img' && PIXPATH.test(n.src || ''));

/* ---- CONTROL first. Every row below reads from this sample. ---- */
const dead = drove.filter(d => d.err || !d.total);
ok('CONTROL  every screen driver reached a surface that painted something',
  dead.length === 0,
  dead.length ? dead.map(d => `${d.label}: ${d.err || 'ZERO pictures rendered'}`).join(' | ')
    : `${drove.length} screens, ${drove.reduce((s, d) => s + d.total, 0)} pictures, ${nodes.length} classified as icons`);
/* AND THE TEN SCREENS ARE TEN DIFFERENT SCREENS. This is the control
   that "did it paint anything" cannot be: the tab bar and the gear button are
   always on screen, so a driver whose click silently misses still reports a
   healthy picture count while grading Today for the fourth time. That is not
   hypothetical, it is what this file did while it was being written: openCharacter
   routes to the hub, so #charBtn no longer existed for the next three drivers and
   `stable`, `kitchen` and `pit` all came back as the same 29 nodes. Every row
   would have stayed green over a sample missing three of its screens. */
/* STRUCTURAL, NOT DIMENSIONAL. The first version put each node's rendered width
   in the signature and two renders of the SAME screen came back different, so
   the row passed on a driver that had plainly no-oped: route() adds .route-in
   and .screen-in, so a measurement taken a few frames apart reads fractionally
   different boxes off identical markup. WHICH pictures a screen draws is the
   stable identity; how wide they were at the instant of measurement is not. */
const sig = d => JSON.stringify(nodes.filter(n => n.label === d.label)
  .map(n => `${n.kind}:${n.src || n.concept || n.glyph}`).sort());
const sigs = new Map();
const clones = [];
for (const d of drove) {
  const k = sig(d);
  if (sigs.has(k)) clones.push(`${d.label} is identical to ${sigs.get(k)}`); else sigs.set(k, d.label);
}
ok('CONTROL  no two screen drivers landed on the same screen',
  clones.length === 0,
  clones.length ? clones.join(' | ') : `${sigs.size} distinct screens out of ${drove.length} drivers`);
/* ALL THREE MEDIA, OR THE ROW FOR THE MISSING ONE IS VACUOUS. SWAP grades
   vectors, EMOJI grades emoji and STEP grades pixel <img>; each one passes for
   free if its probe found nothing at all, and "found nothing" is indistinguishable
   from "there was nothing wrong" in the output. So the sample has to prove it can
   SEE each medium before any of them is graded. This is the row that would have
   caught a fingerprint table that stopped matching, or the day someone replaces
   the last emoji in the app and the EMOJI probe quietly starts covering zero. */
const media = { 'pixel <img>': pixImgs.length,
  'identified vector': nodes.filter(n => n.kind === 'svg').length,
  'emoji slot': nodes.filter(n => n.kind === 'emoji').length };
const blindTo = Object.entries(media).filter(([, n]) => !n).map(([k]) => k);
ok('CONTROL  the sample contains all three media, so no row is graded blind',
  blindTo.length === 0,
  blindTo.length ? `found ZERO of: ${blindTo.join(', ')} — the matching row below cannot fail`
    : Object.entries(media).map(([k, n]) => `${k} ${n}`).join(', '));
/* AND THE SEEDED SURFACE REALLY ARRIVED. The hub's active-dish row is the one
   place in the sample where an emoji has ever stood in for pixel art (Backpack tab,
   the "Kitchen · food & buffs" section), so if the
   seed stops landing, EMOJI quietly goes back to grading nothing but the wheel's
   own declared hub.
   DELIBERATELY MEDIUM-BLIND. The first version of this row asserted a dish PNG on
   the hub, which reads as the stronger check and is the wrong one: it goes red on
   exactly the defect EMOJI exists to catch, and because a failed CONTROL aborts
   the run, the EMOJI row would never have been reached to report it. A control
   proves the SAMPLE was reached; whether what arrived is correct is the graded
   row's job, and merging the two costs you the row. */
ok('CONTROL  the seeded dish reached the hub, so the EMOJI row has a real surface',
  (drove.find(d => d.label === 'backpack') || {}).slots > 0,
  `${(drove.find(d => d.label === 'backpack') || {}).slots || 0} icon slots in the Backpack tab's dish rows`);
ok('CONTROL  the sample holds pixel art that actually DECODED (not just boxes)',
  pixImgs.length > 0 && pixImgs.some(i => i.nw > 0),
  `${pixImgs.length} pixel imgs, ${pixImgs.filter(i => i.nw > 0).length} decoded`);
/* THE FINGERPRINT TABLE IS THE INSTRUMENT, so it gets its own control. If the
   pack's markup ever stops round-tripping (a serializer change, a regenerated
   icons-pack.js with a different shape), SWAP would report zero hits and read as
   perfect. Require that the table was built AND that it matched something. */
ok('CONTROL  the vector fingerprint table was built and matched real drawings',
  VECTORS.length >= 20 && nodes.some(n => n.kind === 'svg'),
  `${VECTORS.length} pack ids with a pixel twin, ${nodes.filter(n => n.kind === 'svg').length} matched on screen`);
ok('CONTROL  the emoji table was derived from the game\'s own data',
  Object.keys(EMOJI_MAP).length >= 10,
  `${Object.keys(EMOJI_MAP).length} emoji stand for a concept with art`);
const blank = pixImgs.filter(i => !(i.nw > 0));
ok('CONTROL  every pixel <img> reports naturalWidth > 0',
  blank.length === 0,
  blank.length ? [...new Set(blank.map(i => i.src))].join(', ') : `${pixImgs.length} decoded`);
if (fails) { console.log(out.join('\n')); console.log('\nthe sample did not hold; nothing below it is evidence'); process.exit(1); }

/* ---- SWAP. A vector at or above the floor, for a concept that has art. ---- */
const swapHits = nodes.filter(n => n.kind === 'svg' && n.w >= FLOOR);
const swapNew = [...new Set(swapHits.map(n => `${n.label}|${n.concept}`))].filter(k => !SWAP_OK[k]).sort();
ok('SWAP     no screen draws a VECTOR at >= 16px for a concept that has pixel art',
  swapNew.length === 0,
  swapNew.length
    ? swapNew.map(k => {
      const h = swapHits.filter(n => `${n.label}|${n.concept}` === k);
      return `${k} (pack id ${h[0].id}) at ${[...new Set(h.map(n => n.w))].join('/')}px x${h.length}`;
    }).join(' | ')
    : `${swapHits.length} declared, ${nodes.filter(n => n.kind === 'svg').length} vectors identified in all`);
const swapGone = Object.keys(SWAP_OK).filter(k => !swapHits.some(n => `${n.label}|${n.concept}` === k)
  && !nodes.some(n => n.kind === 'emoji' && `${n.label}|${n.concept}` === k)).sort();

/* ---- EMOJI. The third medium, invisible to any svg-or-img scan. ---- */
const emojiHits = nodes.filter(n => n.kind === 'emoji' && n.w >= FLOOR);
const emojiNew = [...new Set(emojiHits.map(n => `${n.label}|${n.concept}`))].filter(k => !SWAP_OK[k]).sort();
ok('EMOJI    no icon slot draws an EMOJI at >= 16px for a concept that has pixel art',
  emojiNew.length === 0,
  emojiNew.length
    ? emojiNew.map(k => {
      const h = emojiHits.filter(n => `${n.label}|${n.concept}` === k);
      return `${k} "${h[0].glyph}" at ${[...new Set(h.map(n => n.w))].join('/')}px x${h.length}`;
    }).join(' | ')
    : `${emojiHits.length} declared, ${nodes.filter(n => n.kind === 'emoji').length} emoji slots seen`);

ok('SWAP     and no declared exemption has been fixed without being un-declared',
  swapGone.length === 0,
  swapGone.length ? swapGone.join(', ') + ' — delete these rows from SWAP_OK' : `${Object.keys(SWAP_OK).length} declared`);

/* ---- STEP. Whole steps only, and the box the attribute promised. ---- */
const offStep = pixImgs.filter(i => !STEPS.includes(i.w) || (i.attrW && Math.abs(i.w - i.attrW) > 0.5));
ok('STEP     every pixel <img> renders at a whole step and at its own declared width',
  offStep.length === 0,
  offStep.length
    ? [...new Set(offStep.map(i => `${i.src.split('/').slice(-2).join('/')} @${i.w}px (attr ${i.attrW})`))].join(', ')
    : `sizes seen: ${[...new Set(pixImgs.map(i => i.w))].sort((a, b) => a - b).join(', ')}`);

/* ==========================================================================
 * 6. THE SOURCE ROWS, off icon-inventory-audit's own printed inventory.
 * ======================================================================== */
const inv = spawnSync(process.execPath, [path.join(ROOT, 'tests/icon-inventory-audit.mjs')], { encoding: 'utf8' });
const jsLines = {};
const srcLine = (file, n) => ((jsLines[file] ||= readFileSync(path.join(ROOT, file), 'utf8').split('\n'))[n - 1] || '');
/* `screen file:line drawer concept size MEDIUM`, one per site. */
const sites = [];
for (const L of (inv.stdout || '').split('\n')) {
  const m = L.match(/^(\S+)\s+(js\/[\w.-]+):(\d+)\s+(\S+)\s+(\S+)\s+(\d+|DYNAMIC)\s+(PIXEL|VECTOR|VECTOR-FALLBACK|VARIES)\s*$/);
  if (m) sites.push({ screen: m[1], file: m[2], line: +m[3], drawer: m[4], concept: m[5], size: m[6], medium: m[7] });
}
ok('CONTROL  the icon inventory was re-derived and parsed (an empty parse is a failure)',
  sites.length >= 300,
  `${sites.length} call sites parsed from tests/icon-inventory-audit.mjs`);

/* A drawer call that is the RHS of a `pixCur(...) ||` is the FALLBACK ARM: the
   art is on disk, pixCur serves it, and this arm never runs. Counting those is
   how a scan reports the Today hero row (four 24px pixel tiles) as four vector
   defects. Derived from the line, not exempted by hand. */
const isFallbackArm = (s) => {
  const L = srcLine(s.file, s.line);
  const i = L.indexOf(`${s.drawer.replace(/^ICONS\./, '')}(`);
  return /(pixCur|pixPrizeImg)\s*\([^)]*\)\s*\|\|/.test(i > 0 ? L.slice(0, i) : L);
};

/* ---- CALLSITE. A vector drawer asked >= 16 for a concept that has art. ---- */
const tinted = s => (srcLine(s.file, s.line).match(new RegExp(`bhIcon\\(\\s*'${s.concept}'\\s*,[^,)]+,`)) ? true : false);
const callHits = sites.filter(s => s.drawer === 'bhIcon' && s.medium === 'VECTOR' && s.size !== 'DYNAMIC'
  && +s.size >= FLOOR && twinOf(s.concept) && !isFallbackArm(s) && !tinted(s));
const callNew = callHits.filter(s => !CALLSITE_OK[`${s.file}:${s.screen}|${s.concept}@${s.size}`]);
ok('CALLSITE no bhIcon() call asks >= 16px for a pack id that has pixel art',
  callNew.length === 0,
  callNew.length
    ? callNew.map(s => `${s.file}:${s.line} ${s.screen} draws vector '${s.concept}' at ${s.size}, art is ${twinOf(s.concept)}`).join(' | ')
    : `${sites.filter(s => s.drawer === 'bhIcon').length} bhIcon sites checked, ${callHits.length} declared`);

/* ---- SHORTFALL. The request snapped down by more than a fifth. ---- */
const snap = s => (s >= 48 ? Math.floor(s / 48) * 48 : s >= 24 ? 24 : s >= FLOOR ? FLOOR : 0);
const shortHits = sites.filter(s => s.medium === 'PIXEL' && s.size !== 'DYNAMIC' && !isFallbackArm(s)
  && snap(+s.size) > 0 && snap(+s.size) / +s.size < SHORTFALL_KEEP);
/* KEYED BY SCREEN AND CONCEPT AND SIZE, NEVER BY LINE NUMBER. A ledger keyed to
   a line re-keys itself every time anything above it in js/app.js grows a line,
   so the whole table goes red on an unrelated edit and gets "fixed" by pasting
   new numbers in, which is how a ledger stops being read. */
const shortKey = s => `${s.file}:${s.screen}|${s.concept}@${s.size}`;
const shortNew = shortHits.filter(s => !SHORTFALL_OK[shortKey(s)]);
ok('SHORTFALL no call site reserves space the snapped art loses more than a fifth of',
  shortNew.length === 0,
  shortNew.length
    ? shortNew.map(s => `${shortKey(s)} (${s.file}:${s.line}, ${s.drawer}) asks ${s.size}, serves ${snap(+s.size)}`).join(' | ')
    : `${shortHits.length} declared, of ${sites.filter(s => s.medium === 'PIXEL').length} pixel sites`);
const shortGone = Object.keys(SHORTFALL_OK).filter(k => !shortHits.some(s => shortKey(s) === k)).sort();
ok('SHORTFALL and no declared shortfall has been fixed or moved without being un-declared',
  shortGone.length === 0,
  shortGone.length ? shortGone.join(', ') + ' — delete these rows from SHORTFALL_OK' : `${Object.keys(SHORTFALL_OK).length} declared`);

console.log('\n' + out.join('\n'));
console.log(fails ? `\n${fails} FAILED` : '\nevery screen draws one medium');

/* PROVEN-RED-BY. Every row below was reddened against a REAL defect in a
 * throwaway worktree off this branch, 2026-08-21. Each run's exit code was
 * written to its own file and read back from that file, never through a pipe,
 * and the tree was `git checkout -- .`d between mutations.
 *
 * IN TWO SITTINGS, and the second is the one that matters. The first proved
 * thirteen of the sixteen rows and left three CONTROLS unproven when the session
 * died; this note claimed all sixteen before that was true, which is the exact
 * shape of the unverified claim this repo keeps paying for. The three below
 * marked (2nd) were proved afterwards, against the rebased tip, with a green
 * baseline run of the SAME file immediately before them. CONTROL distinct in
 * particular had already been ATTEMPTED and come back exit 0: the row's
 * signature carried each node's rendered width, two renders of one screen
 * measured differently, and a driver that plainly no-oped passed. That is why
 * the signature is structural now, and why the row is listed as re-proved.
 *
 *   CONTROL painted      renderTrends returns before writing any markup ->
 *                        "progress: ZERO pictures rendered".
 *   CONTROL distinct (2nd) `id="stableBtn"` renamed on the hero tile, so the
 *                        Stable driver silently grades Today a second time ->
 *                        "stable is identical to today".
 *   CONTROL three media  the wheel's .dw-hub 💀 replaced with markup ->
 *                        "found ZERO of: emoji slot".
 *   CONTROL seeded dish (2nd) activeFoodBuffs returns [] -> "0 icon slots in the
 *                        Backpack tab's dish rows".
 *   CONTROL any decoded (2nd) assets/icons-pix AND assets/crates both moved away
 *                        -> "122 pixel imgs, 0 decoded", and all 35 named by the
 *                        all-decoded row beside it.
 *   CONTROL all decoded  assets/icons-pix moved away -> all 33 named; and with
 *                        ONLY coin.png moved -> "assets/icons-pix/coin.png".
 *   CONTROL fingerprint  bhIcon inlines its tint in place of currentColor, so
 *                        the pack markup stops round-tripping -> "24 pack ids
 *                        with a pixel twin, 0 matched on screen".
 *   CONTROL emoji table  cooking.js renames its `icon:` field -> "8 emoji stand
 *                        for a concept with art" against a floor of 10.
 *   CONTROL inventory    icon-inventory-audit's print format drifts by one
 *                        separator -> "0 call sites parsed".
 *   SWAP                 js/wheel.js reverted to v420 -> all six hits named:
 *                        wheel|crate and wheel-reveal|crate at 34.9px,
 *                        |crates/golden/f0 at 38.6px, |sinew at 37.5 and 40px.
 *   SWAP un-declared     badgeIconHtml wired to pixCur, ledger left alone ->
 *                        six progress| rows named as needing deletion.
 *   EMOJI                recipeIconHtml reverted to pre-v411 (emoji only) ->
 *                        "backpack|dish-broth 🍲 at 24px" plus six Kitchen
 *                        dishes. That 24px is .crate-ico's font-size, and it is
 *                        the measurement this file's header quotes.
 *   STEP                 `transform: scale(.82)` on .ico.pix-cur -> "coin.png
 *                        @13.1px (attr 16)" and 30 more. The .leg-ico bug that
 *                        boneyard-icon-audit caught on the map, off the map.
 *   CALLSITE             js/app.js:10470 reverted to bhIcon('egg', 18) ->
 *                        "renderOnboarding draws vector 'egg' at 18".
 *   SHORTFALL            badgePixHtml('badge-crown', 34) changed to 40 ->
 *                        "NEWS|badge-crown@40 asks 40, serves 24".
 *   SHORTFALL un-decl.   the same call changed to 24, so the declared hole
 *                        closes -> "js/app.js:NEWS|badge-crown@34 — delete
 *                        these rows from SHORTFALL_OK".
 */
process.exit(fails ? 1 : 0);
