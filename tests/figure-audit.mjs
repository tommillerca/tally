/* THE FIGURE CONTRACT: every screen that draws a Bonehead and a pet draws them
 * the same way, and this is the thing that fails when one of them does not.
 *
 * WHY THIS EXISTS. Tom, 2026-08-07, on the spire keeper poster: "shiny's arent
 * showing up in the new spire hero spotlight and the pet is too far away from the
 * bonehead. this is something that we have had multiple problems with across the
 * entire app. create a framework and guard rails for yourself so that this STOPS
 * HAPPENING."
 *
 * He is right that it is a class, not an incident. Every one of these was the
 * same mistake in a different screen: a new screen placed a figure by hand instead
 * of using the contract, and lost one property of it.
 *   - shiny lost, because the screen built a pet out of `outfit.C`, which is a
 *     SPECIES id and has no shiny field, so `!!eq.shiny` is always false
 *   - pet parked in a corner instead of standing next to the character
 *   - pet sized off its 640² canvas rather than its drawing, so a flat species
 *     came out half the size of a round one
 *   - a friend's shiny drawn in base colours because the render consulted
 *     S.shinyPets, which is the VIEWER's collection
 *   - avatar layers laid out fine but never decoded, so the stage was blank
 *
 * THE FRAMEWORK (js/app.js):
 *   petFrom(snapshotPet, ownSpecies)  the only two honest sources of a pet
 *                                     instance. Never read shiny off an outfit.
 *   petAsideHtml(pet, px)             draw it beside a Bonehead: same baseline,
 *                                     seated unless the species hovers, mass
 *                                     normalised.
 *
 * THE GUARD RAILS (this file):
 *   COVERAGE  every pet call site in js/app.js must be claimed by a SITE below.
 *             A new screen that draws a pet and is not registered here FAILS,
 *             the same way tests/fx-audit.js derives its coverage from STRIKE_FX.
 *   STATIC    the source may not build a pet from an outfit slot ({ id: x.C }),
 *             which is the exact shape that silently drops shiny.
 *   SHINY     with a shiny instance seeded, every driven site must render the
 *             shiny wrapper. This is the check that would have caught the spire.
 *   DECODE    every layer has naturalWidth > 0 WHILE VISIBLE. A CSS box measures
 *             fine over a blank frame (tally/CLAUDE.md rule 1).
 *   STACK     a pet drawn INSIDE the avatar stack must say whose shiny it is.
 *   PLANE     the pet's INK baseline sits within 14px of the Bonehead's.
 *   NEAR      the pet is beside the character, not exiled: under 40px of daylight
 *             between the two DRAWINGS.
 *   CLIP      nothing with words on it is sliced by its own container.
 *   An empty sample set is a FAILURE, never a pass (rule 3).
 *
 * PROVE-RED. Every one of these was RUN and the failure text below is what it
 * actually printed (2026-08-07). Two earlier claims here were guesses that turned
 * out to be false when finally run, which is the exact failure tally/CLAUDE.md
 * rule 2 exists to prevent, so nothing goes in this list unmeasured:
 *   SHINY     force `shiny: false` in petAsideHtml
 *             -> spire-keeper SHINY {"wrapper":false,"shinyArt":false}
 *   STATIC    restore `{ id: keeperFit.C }`
 *             -> STATIC fails naming js/app.js and the line
 *   STACK     drop shinyPetId from the splash's final frame
 *             -> STACK fails naming the call site
 *   PLANE     drop `object-position: bottom center` from `.spp .bh img`
 *             -> spire-keeper PLANE, ink baselines 471 vs 504 (33px apart)
 *   NEAR      `.spp .pet { right: 2px; width: 38px }` (a genuine corner exile;
 *             the earlier `right: 22px` guess did NOT go red, it still overlapped)
 *             -> spire-keeper NEAR, 87px of daylight
 *   CLIP      `.hero-top { right: -46px }`, Tom's chip-off-the-edge bug exactly
 *             -> today-hero CLIP, "2" in .hero-scene sliced 44px off the right
 *   COVERAGE  add a petSpriteHtml call away from any claim token
 *             -> COVERAGE fails naming js/app.js:418
 *             (at the original +/-3 line window it did NOT go red: the new call
 *             borrowed petAsideHtml's claim three lines up. Window is +/-1 now.)
 *
 * Usage: node tests/figure-audit.mjs        (URL=... for live)
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { boot, seed, sleep, serveTree} from './godmode.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const results = [];
const ok = (name, pass, detail = '') => { results.push({ name, pass }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`); };

/* The shiny species the whole run is built around. C1 has a shiny variant and
   does not hover, so it must also SIT on the baseline. */
const SP = 'C1';

/* ---------------------------------------------------------------- the registry
   `claim` is a string that must appear within ONE line of a pet call site. `drive`
   opens the screen and returns the selectors to measure; a site with no driver
   must say why, in `undriven`, and it is printed on every run so it cannot rot
   quietly into "covered". */
const SITES = [
  {
    key: 'today-hero', claim: 'hero-companion', paired: true,
    bh: '#bhStage .hero-char', pet: '#bhStage .hero-companion',
    /* The Today card STAGES the pet forward, nearer the viewer, with its own
       contact shadow lower on the ground than the Bonehead's (88px vs 80px in
       design_handoff_today_home, option 1d). That is depth, and it is the
       approved design, so the tolerance here is the staging depth rather than
       the flat 14px the sheets use. The failure this still catches is the one
       that actually happened: a pet FLOATING above the feet. */
    planeTol: 40,
    drive: async page => { await page.evaluate(() => { location.hash = '#/today'; }); await sleep(1800); },
  },
  {
    key: 'spire-keeper', claim: 'keeperPet', paired: true,
    bh: '.spp .bh', pet: '.spp .pet',
    drive: async page => {
      await page.evaluate(async sp => {
        await window.__spireSheet({
          s: { name: 'Queen Street Spire', dist: 40 }, view: { tribute: null },
          held: false, dormant: false, besieged: false, siegeUntil: 0, siegeName: null,
          lvl: 4, heldSince: Date.now() - 34 * 86400000,
          rival: { ownerName: 'Bony Wrecker', defender: {
            outfit: { B: 'B6-3', SK: 'SK3-1', IL: 'IL8-2', H: 'H6-2', FW: 'FW8-3', IR: 'IR7-3', P: 'P6-1' },
            pet: { id: sp, level: 10, shiny: true },
          } },
        });
      }, SP);
      await sleep(1400);
    },
  },
  {
    key: 'friend-profile', claim: 'fp-pet', paired: true,
    bh: '.fp-hero .bh-stage', pet: '.fp-pet',
    drive: async page => {
      await page.evaluate(async sp => {
        await window.__friendProfile({
          playerId: 'fig-audit', name: 'Bony Wrecker', alias: null,
          lastSeen: Date.now(),
          profile: {
            level: 16, levelName: 'Gainz Engineer',
            outfit: { B: 'B6-3', SK: 'SK3-1', IL: 'IL8-2', H: 'H6-2', FW: 'FW8-3', IR: 'IR7-3', P: 'P6-1' },
            pet: { id: sp, level: 10, shiny: true },
          },
        });
      }, SP);
      await sleep(1400);
    },
  },
  {
    key: 'crew-fan', claim: 'cfan-pet', paired: true,
    bh: '.cfan-card.feat .bh-anim', pet: '.cfan-card.feat .cfan-pet',
    /* v323: the Crew list became the fan; unlike the old grid it IS drivable now,
       via the webdriver-gated __testMe/__testFriends fixtures in renderFriends.
       The card letterboxes a 640-canvas Bonehead above the plate and seats the
       pet on the plate's top edge, staged nearer the viewer, so the pet's ink may
       sit lower than the Bonehead's feet: the tolerance is the staging depth. */
    planeTol: 40,
    drive: async page => {
      await page.evaluate(sp => {
        window.__testMe = { name: 'Fig Audit', handle: 'fig', friendCode: 'BONE-0000' };
        window.__testFriends = { incoming: [], outgoing: [], friends: [{
          playerId: 'fig-audit-fan', name: 'Bony Wrecker', alias: null, lastSeen: Date.now(),
          profile: { level: 16, levelName: 'Gainz Engineer',
            outfit: { B: 'B6-3', SK: 'SK3-1', IL: 'IL8-2', H: 'H6-2', FW: 'FW8-3', IR: 'IR7-3', P: 'P6-1', BG: 'BG4-1' },
            pet: { id: sp, level: 10, shiny: true } },
        }] };
        location.hash = '#/friends';
      }, SP);
      await sleep(1800);
    },
  },
  {
    key: 'fight-arena', claim: 'petStage', paired: false, undriven:
      'reaching it means winning into a live fight; the arena stage is covered for '
      + 'decode by tests/fx-audit.js, which drives real moves',
  },
  {
    key: 'pet-card', claim: 'pet-card', paired: false, undriven:
      'petPanelHtml has no caller in js/app.js (dead render, left alone deliberately)',
  },
  { key: 'helper', claim: '!petHovers(pet.id)', paired: false, undriven: 'this IS petAsideHtml, the contract itself' },
  {
    /* THE PADDOCK herd (Lane R scene, 2026-08-11). One petSpriteHtml call
       renders every owned COPY; shiny comes off the INSTANCE row from
       paddockRoster (contract rule 1), and placement runs through
       placePaddock's band allocator, unit-pinned in unit.test.js. The claim
       matches the roster-row destructure on the call line. */
    key: 'paddock-herd', claim: 'petSpriteHtml(r.sp', paired: false, undriven:
      'the scene is driven end-to-end by tests/paddock-scene-audit.mjs '
      + '(gate FULL tier): real Stable chip tap, decoded herd from a real '
      + 'roster, band-overlap assertion in the live DOM, and motion asserted '
      + 'as rendered pixels (headless freezes the main-thread animation clock, '
      + 'so gBCR lies; screenshots are the layer the player sees).',
  },
  /* Pet-only surfaces. No Bonehead beside them, so PLANE and NEAR do not apply,
     but they are registered because COVERAGE has to see every call site: an
     unregistered one is how a new screen quietly starts drawing a pet its own
     way. All four already read shiny off the INSTANCE, which is the contract. */
  {
    key: 'pet-levelup', claim: 'petlvl-avatar', paired: false, undriven:
      'the celebration overlay only opens on a real pet level-up, which needs the '
      + 'step threshold to be crossed inside the run',
  },
  {
    key: 'stable-roster', claim: 'cf-art', paired: false, undriven:
      'the Stable roster is now a coverflow ring with no Bonehead beside it (v317, '
      + 'was the t3-petcard grid); it passes x.shiny off the instance row and draws '
      + 'through petPortraitHtml(..., {mass:true}), which is the contract',
  },
  {
    key: 'breed-trade', claim: 'bt-pet', paired: false, undriven:
      'the breeding result only renders after a real breed completes; guarded '
      + 'separately by the breeding checks in tests/t2-audit.mjs',
  },
  {
    key: 'breed-fused', claim: 'gone-pet', paired: false, undriven:
      'same overlay as breed-trade, the parents strip inside it',
  },
  {
    /* Added 2026-08-10 with the Stable's "now pick the second pet" banner. This
       audit had never been run by the gate, so it caught the omission hours
       later on its first-ever execution rather than at the moment I wrote it:
       the coverage rule works, it simply had nobody running it. */
    key: 'breed-waiting', claim: 'bw-pet', paired: false, undriven:
      'only rendered while exactly one pet is flagged for breeding; the state is '
      + 'driven by the Stable checks rather than from here',
  },
];

/* ------------------------------------------------------ COVERAGE + STATIC ---- */
const APP = readFileSync(path.join(ROOT, 'js/app.js'), 'utf8');
const LINES = APP.split('\n');
const CALL = /pet(?:SpriteHtml|PortraitHtml|AsideHtml)\s*\(/;
const callSites = [];
LINES.forEach((ln, i) => {
  if (!CALL.test(ln)) return;
  if (/^\s*(?:function|\/\/|\*)/.test(ln)) return;         // the declarations themselves
  /* ONE line either side, not three. At ±3 a brand-new unregistered call site
     inserted just above petSpriteHtml was "claimed" by petAsideHtml's own body
     three lines up, so COVERAGE passed on a screen nobody had registered: the
     window was wide enough to borrow somebody else's claim. */
  callSites.push({ line: i + 1, text: ln.trim(), ctx: LINES.slice(Math.max(0, i - 1), i + 2).join('\n') });
});
ok('COVERAGE there are pet call sites to audit at all (zero is a FAILURE)', callSites.length > 0, `${callSites.length} found`);
const unclaimed = callSites.filter(c => !SITES.some(s => c.ctx.includes(s.claim)));
ok('COVERAGE every pet call site in the app is registered here',
  unclaimed.length === 0,
  unclaimed.length ? unclaimed.map(c => `js/app.js:${c.line}  ${c.text.slice(0, 90)}`).join('\n      ') : `${callSites.length} sites, all claimed`);

/* The exact shape that drops shiny: a pet object built out of an outfit slot.
   An outfit has a species id and nothing else, so shiny/level/lineage are gone
   the moment anyone writes this. */
const OUTFIT_PET = /\{\s*id:\s*[\w.]+\.C\b/g;
const badLines = [];
LINES.forEach((ln, i) => { if (/^\s*(?:\*|\/\/|\/\*)/.test(ln)) return;   // prose about the bug is not the bug
  if (OUTFIT_PET.test(ln)) badLines.push(`js/app.js:${i + 1}  ${ln.trim().slice(0, 90)}`); OUTFIT_PET.lastIndex = 0; });
ok('STATIC nothing builds a pet out of an outfit slot (that is how shiny is lost)',
  badLines.length === 0, badLines.length ? '\n      ' + badLines.join('\n      ') : 'no { id: x.C } constructions');
ok('STATIC the contract helpers exist to be used',
  /function petFrom\(/.test(APP) && /function petAsideHtml\(/.test(APP), 'petFrom + petAsideHtml present');

/* STACK: the pet drawn INSIDE the avatar stack.
 * Tom, 2026-08-07: "also on the app startup montage btw". avatarLayersHtml can
 * swap the shiny recolour itself, but only if it is told which species is shiny,
 * and every caller that renders the C slot without saying so draws a shiny pet in
 * base colours. Six screens were doing it, including the first thing you see when
 * you open the app.
 * So: render the C slot, or say whose shiny it is. There is no third option.
 *   yours       shinyPetId: await ownShinyPetId(eq)
 *   theirs      shinyPetId: snapShinyPetId(profile.pet)
 * PROVE-RED (confirmed 2026-08-07): drop shinyPetId from the splash's final frame
 * and STACK fails naming js/app.js and the line. */
const STACK_EXEMPT = [
  { token: 'splash-word', why: 'the montage frames are randomOutfit(), nobody\'s real Bonehead, so there is no shiny to honour' },
];
const stackBad = [];
LINES.forEach((ln, i) => {
  if (!/avatarLayersHtml\s*\(/.test(ln)) return;
  if (/^\s*(?:function|\/\/|\*)/.test(ln)) return;
  const win = LINES.slice(i, i + 2).join('\n');          // the opts can wrap to the next line
  const skipsPet = /skip:\s*\[[^\]]*'C'/.test(win);
  if (skipsPet || /shinyPetId/.test(win)) return;
  if (STACK_EXEMPT.some(e => win.includes(e.token))) return;
  stackBad.push(`js/app.js:${i + 1}  ${ln.trim().slice(0, 88)}`);
});
ok('STACK every avatar that draws the pet slot says whose shiny it is',
  stackBad.length === 0, stackBad.length ? '\n      ' + stackBad.join('\n      ') : 'all C-slot renders carry a shinyPetId');
STACK_EXEMPT.forEach(e => console.log(`      STACK EXEMPT  ${e.token}: ${e.why}`));

const undriven = SITES.filter(s => s.undriven);
ok('COVERAGE every undriven site states why it cannot be driven',
  undriven.every(s => s.undriven.length > 20), undriven.map(s => s.key).join(', '));
undriven.forEach(s => console.log(`      NOT DRIVEN  ${s.key}: ${s.undriven}`));

/* ------------------------------------------------------------- driven checks -- */
let srv = null, srvHandle = null;
let base = process.env.URL;
if (!base) {
  /* serveTree: a free port from the OS, and a HARD ERROR if python never
     bound. The hard-coded port with stdio:'ignore' meant a stranded server
     already holding it made this audit talk to whatever was listening. */
  srvHandle = await serveTree(ROOT);
  srv = { kill: () => srvHandle.close() };
  base = srvHandle.url;
}
const { browser, page } = await boot(base);
await page.setViewport({ width: 393, height: 852, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await seed(page, { level: 18, coins: 500 });

// A SHINY instance of the species, equipped. This is the state that has been
// silently rendering in base colours.
await page.evaluate(async sp => {
  const { kvGet, kvSet, db } = await import('./js/db.js');
  await db.put('inv', { id: `cos-${sp}`, kind: 'cos', itemId: sp });
  await kvSet('petInst', [{ iid: 'fig-audit-1', sp, lineage: 0, shiny: true, hatchedAtSteps: 0 }]);
  const eq = (await kvGet('equipped', {})) || {};
  await kvSet('equipped', { ...eq, C: sp });
}, SP);
await page.reload({ waitUntil: 'networkidle2' });
await sleep(2400);

/* WHERE THE DRAWING ACTUALLY ENDS, not where its box does.
 *
 * Container boxes are useless for this: Cam's art sits inside a 640² canvas with
 * a lot of transparent air, and most of these stages letterbox it with
 * object-fit: contain on top of that. Two figures can have perfectly aligned
 * boxes and visibly different footing, which is exactly the complaint. So the ink
 * bottom is computed from the source PNG's real alpha bounding box, mapped
 * through the element's rendered geometry.
 *
 * The bbox comes from the asset on disk (identical to the one live serves), read
 * once per src and cached. */
const bboxCache = new Map();
function alphaBox(src) {
  // src is an absolute URL from the page; take its path and strip the app root,
  // which is "/" served locally and "/tally/" on GitHub Pages
  let rel;
  try { rel = new URL(String(src)).pathname; } catch { rel = String(src); }
  rel = rel.replace(/^\/tally\//, '').replace(/^\//, '').split('?')[0];
  if (bboxCache.has(rel)) return bboxCache.get(rel);
  let out = null;
  try {
    const r = spawnSync('python3', ['-c',
      'import sys;from PIL import Image;im=Image.open(sys.argv[1]).convert("RGBA");b=im.getchannel("A").getbbox();print(im.size[0],im.size[1],*(b or (0,0,0,0)))',
      path.join(ROOT, rel)], { encoding: 'utf8' });
    const n = (r.stdout || '').trim().split(/\s+/).map(Number);
    if (n.length === 6 && n[5] > 0) out = { w: n[0], h: n[1], x0: n[2], y0: n[3], x1: n[4], y1: n[5] };
  } catch { /* an unreadable asset is reported as a null bbox, not silently skipped */ }
  bboxCache.set(rel, out);
  return out;
}
/* Map an element's rendered geometry + its source bbox to the ink's screen edges. */
function inkEdges(layers) {
  let bottom = null, left = null, right = null;
  for (const L of layers) {
    const bb = alphaBox(L.src);
    if (!bb || !L.nw || !L.nh) continue;
    // contain letterboxes inside the box; anything else (the inline-sized crops)
    // maps the box 1:1 onto the image
    const s = L.fit === 'contain' ? Math.min(L.w / L.nw, L.h / L.nh)
      : L.fit === 'cover' ? Math.max(L.w / L.nw, L.h / L.nh)
        : L.w / L.nw;
    /* object-position decides where the slack goes. Reading only the fit and
       assuming centre is how a correct CSS fix read as "no change": the keeper's
       art was bottom-aligned on screen while this still measured it centred. */
    const pos = String(L.pos || '50% 50%').split(/\s+/);
    const frac = (t, i) => {
      const v = t || (i ? '50%' : '50%');
      if (/^-?[\d.]+%$/.test(v)) return parseFloat(v) / 100;
      if (v === 'left' || v === 'top') return 0;
      if (v === 'right' || v === 'bottom') return 1;
      return 0.5;                                     // center, or a length we do not use
    };
    const ox = L.x + (L.w - L.nw * s) * frac(pos[0], 0);
    const oy = L.y + (L.h - L.nh * s) * frac(pos[1] ?? pos[0], 1);
    const b = oy + bb.y1 * s, l = ox + bb.x0 * s, r = ox + bb.x1 * s;
    bottom = bottom === null ? b : Math.max(bottom, b);
    left = left === null ? l : Math.min(left, l);
    right = right === null ? r : Math.max(right, r);
  }
  return bottom === null ? null : { b: Math.round(bottom), l: Math.round(left), r: Math.round(right) };
}

const measure = async (bhSel, petSel) => {
  const raw = await page.evaluate(([b, p]) => {
    const vis = el => {
      if (!el) return false;
      const cs = getComputedStyle(el);
      return cs.display !== 'none' && cs.visibility !== 'hidden' && +cs.opacity > 0 && el.getBoundingClientRect().height > 0;
    };
    const bh = document.querySelector(b), pet = document.querySelector(p);
    if (!bh || !pet) return { found: false, bh: !!bh, pet: !!pet };
    const grab = el => [...el.querySelectorAll('img')].map(i => {
      const r = i.getBoundingClientRect();
      return {
        src: i.currentSrc || i.src, nw: i.naturalWidth, nh: i.naturalHeight,
        x: r.left, y: r.top, w: r.width, h: r.height,
        fit: getComputedStyle(i).objectFit, pos: getComputedStyle(i).objectPosition,
      };
    });
    const bhI = grab(bh), petI = grab(pet);
    return {
      found: true,
      bhVisible: vis(bh), petVisible: vis(pet),
      bhLayersRaw: bhI, petLayersRaw: petI,
      bhLayers: bhI.length, bhDecoded: bhI.filter(i => i.nw > 0).length,
      petLayers: petI.length, petDecoded: petI.filter(i => i.nw > 0).length,
      shinyWrap: !!pet.querySelector('.pet-shiny-wrap'),
      /* A shiny is proven by it being DRAWN DIFFERENTLY from the base pet, and
         there are now two honest ways that happens. A still shiny loads the
         recoloured art from /shiny/. An ANIMATED species has no shiny animation
         assets, so it reuses the animation under a measured hue-rotate instead
         (SHINY_TINT in js/app.js). Checking only for the /shiny/ file would fail
         the animated case while it is working correctly, and checking only for
         the wrapper would pass a plain base pet in a shiny box. */
      shinySrc: petI.some(i => /\/shiny\//.test(i.src || ''))
        || !!(pet && pet.querySelector('.pa-shiny') && /hue-rotate/.test(getComputedStyle(pet.querySelector('.pa-shiny')).filter || '')),
    };
  }, [bhSel, petSel]);
  if (!raw.found) return raw;
  raw.bhInk = inkEdges(raw.bhLayersRaw);
  raw.petInk = inkEdges(raw.petLayersRaw);
  return raw;
};

/* NOTHING WITH WORDS ON IT MAY BE SLICED BY ITS OWN CONTAINER.
 * Tom, 2026-08-07: "it looks like youre also cutting off a pill at the top right
 * for chests? you ened to have guardrails on all these things clearly."
 * Same class as the figure bugs: a row was laid out wider than the box that clips
 * it, and the only thing that noticed was him. Art crops are deliberate and are
 * skipped by construction (they have no text); a real scroller is allowed to
 * extend along its scroll axis. Everything else that carries text and escapes its
 * clipping ancestor by more than a pixel is a finding. */
const clipCheck = () => page.evaluate(() => {
  const out = [];
  for (const el of document.querySelectorAll('#screen *, .sheet *')) {
    const own = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent.trim()).join('');
    if (!own) continue;                                   // art and wrappers, not labels
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    let a = el.parentElement, clip = null;
    while (a) {
      const acs = getComputedStyle(a);
      if (/hidden|clip|auto|scroll/.test(acs.overflowX + ' ' + acs.overflowY)) { clip = { el: a, cs: acs }; break; }
      a = a.parentElement;
    }
    if (!clip) continue;
    const ar = clip.el.getBoundingClientRect();
    /* SLICED, not HIDDEN. Content that lies ENTIRELY outside its clipper is a
       collapsed panel doing its job (the Glutton banner's body is six paragraphs
       parked below a 0-height box). Content that straddles the edge is the bug:
       half a word, half a pill. Only the straddle counts. */
    const ovX = Math.min(r.right, ar.right) - Math.max(r.left, ar.left);
    const ovY = Math.min(r.bottom, ar.bottom) - Math.max(r.top, ar.top);
    if (ovX <= 0 || ovY <= 0) continue;
    /* A COLLAPSED PANEL IS NOT A SLICE. A closed <details> clips its body by
       design, and the body's first heading straddles the summary's bottom edge,
       which looks identical to a sliced label from the geometry alone. Same for
       any box whose content is taller than its clipped height on purpose. Only
       the bottom edge is forgiven: a collapse never slices sideways, so the
       horizontal check (which is the one Tom reported, a chest pill cut off the
       right) still bites. */
    const collapsed = clip.el.tagName === 'DETAILS' ? !clip.el.open
      : clip.el.scrollHeight > clip.el.clientHeight + 20;
    const sx = /auto|scroll/.test(clip.cs.overflowX), sy = /auto|scroll/.test(clip.cs.overflowY) || collapsed;
    const bad = [];
    if (!sx && ar.left - r.left > 1) bad.push(`${Math.round(ar.left - r.left)}px off the left`);
    if (!sx && r.right - ar.right > 1) bad.push(`${Math.round(r.right - ar.right)}px off the right`);
    if (!sy && ar.top - r.top > 1) bad.push(`${Math.round(ar.top - r.top)}px off the top`);
    if (!sy && r.bottom - ar.bottom > 1) bad.push(`${Math.round(r.bottom - ar.bottom)}px off the bottom`);
    if (bad.length) out.push(`"${own.slice(0, 24)}" in .${(clip.el.className || clip.el.tagName).toString().split(' ')[0]} — ${bad.join(', ')}`);
  }
  return out;
});

for (const site of SITES.filter(s => s.drive)) {
  await site.drive(page);
  const clips = await clipCheck();
  ok(`${site.key} CLIP nothing with words on it is sliced by its container`,
    clips.length === 0, clips.length ? '\n      ' + clips.slice(0, 6).join('\n      ') : 'no clipped labels');
  const m = await measure(site.bh, site.pet);
  if (!m.found) {
    ok(`${site.key} the figure renders at all`, false, JSON.stringify(m));
    await page.evaluate(() => { if (document.querySelector('.sheet')) history.back(); });
    await sleep(500);
    continue;
  }
  ok(`${site.key} DECODE the Bonehead is drawn, not an empty stage`,
    m.bhLayers > 0 && m.bhDecoded === m.bhLayers && m.bhVisible,
    JSON.stringify({ layers: m.bhLayers, decoded: m.bhDecoded, visible: m.bhVisible }));
  ok(`${site.key} DECODE the pet is drawn`,
    m.petLayers > 0 && m.petDecoded === m.petLayers && m.petVisible,
    JSON.stringify({ layers: m.petLayers, decoded: m.petDecoded, visible: m.petVisible }));
  ok(`${site.key} SHINY a shiny pet renders as shiny`,
    m.shinyWrap && m.shinySrc,
    JSON.stringify({ wrapper: m.shinyWrap, shinyArt: m.shinySrc }));
  if (site.paired) {
    if (!m.bhInk || !m.petInk) {
      ok(`${site.key} PLANE measurable at all (an unreadable figure is a FAILURE)`, false,
        JSON.stringify({ bhInk: m.bhInk, petInk: m.petInk }));
    } else {
      /* Two different failures, and only one of them is symmetrical. A pet ABOVE
         the Bonehead's feet is floating, which is always wrong and is what shipped
         on this very screen (15px) and on the friend profile (18px). A pet BELOW
         them may be staged forward on purpose, so that side gets the site's own
         tolerance. */
      const drop = m.petInk.b - m.bhInk.b;          // + = pet is lower/nearer
      const tol = site.planeTol || 14;
      ok(`${site.key} PLANE the pet stands on the same ground as the Bonehead`,
        drop >= -6 && drop <= tol,
        `ink baselines ${m.bhInk.b} vs ${m.petInk.b} (${drop > 0 ? '+' : ''}${drop}px, allowed -6..${tol})`);
      const gap = Math.max(0, Math.max(m.petInk.l - m.bhInk.r, m.bhInk.l - m.petInk.r));
      ok(`${site.key} NEAR the pet is beside the Bonehead, not in a corner`,
        gap < 40, `${gap}px of daylight between the drawings`);
    }
  }
  await page.evaluate(() => { if (document.querySelector('.sheet')) history.back(); });
  await sleep(500);
}

/* EVERY SPECIES, NOT THE ONE YOU HAPPENED TO HAVE EQUIPPED.
 * Tom, 2026-08-07: "also check that all pets arent cut off for instance currently
 * the duck and lizard are cut off that cant be happening."
 * They were. `mass: true` scales a wide species UP so a flat creature reads at the
 * same visual weight as a round one, and the Today card's pet slot had a FIXED
 * width, so the widened box grew RIGHTWARD: the duck went 108 -> 154px and ran
 * 14px past the plate, which clips. Only the pet you own shows the bug, which is
 * why it shipped.
 * The species list is read from the item table, so a pet Cam draws next month is
 * covered the day it lands rather than the day somebody remembers this check.
 * PROVE-RED (confirmed 2026-08-07): put `width: 108px` back on .hero-companion
 * and CUTOFF fails naming C2 at 14px and both lizards at 3px. */
const species = await page.evaluate(async () => {
  const m = await import('./data/boneheadz.js').catch(() => null);
  const items = (m && (m.BH_ITEMS || m.default)) || window.__bhItems || null;
  if (items) return items.filter(i => i.slot === 'C').map(i => i.id);
  return null;
});
ok('CUTOFF the pet roster could be read at all (an empty list is a FAILURE)',
  Array.isArray(species) && species.length >= 3, JSON.stringify(species));
const cut = [];
for (const sp of species || []) {
  await page.evaluate(async s => {
    const { kvGet, kvSet, db } = await import('./js/db.js');
    await db.put('inv', { id: 'cos-' + s, kind: 'cos', itemId: s });
    await kvSet('petInst', [{ iid: 'p-' + s, sp: s, lineage: 0, shiny: false, hatchedAtSteps: 0 }]);
    const eq = (await kvGet('equipped', {})) || {};
    await kvSet('equipped', { ...eq, C: s });
    /* CUTOFF measures the Today hero, but the hash is whatever the LAST driven
       site left it on (crew-fan leaves #/friends), and reload keeps it: pin the
       route or every species reads "no pet slot rendered". */
    location.hash = '#/today';
  }, sp);
  await page.reload({ waitUntil: 'networkidle2' });
  await sleep(1500);
  const over = await page.evaluate(() => {
    const host = document.querySelector('.hero-companion');
    if (!host) return null;
    const crop = host.querySelector('.petcrop, .petanim') || host;
    const p = document.querySelector('#bhStage').getBoundingClientRect();
    const c = crop.getBoundingClientRect();
    return { right: Math.round(c.right - p.right), left: Math.round(p.left - c.left),
      top: Math.round(p.top - c.top), w: Math.round(c.width) };
  });
  if (!over) { cut.push(`${sp}: no pet slot rendered`); continue; }
  const worst = Math.max(over.right, over.left, over.top);
  if (worst > 1) cut.push(`${sp} (${over.w}px wide) escapes by ${JSON.stringify(over)}`);
}
ok('CUTOFF no pet is clipped by the card, at any width',
  cut.length === 0, cut.length ? '\n      ' + cut.join('\n      ') : `${(species || []).length} species all inside the plate`);

await browser.close();
if (srv) srv.kill();
const failed = results.filter(r => !r.pass).length;
console.log(`\n${results.length - failed}/${results.length} passed  (${SITES.filter(s => s.drive).length} sites driven, ${undriven.length} not)`);
if (!results.length) { console.log('FAIL: no checks ran'); process.exit(1); }
process.exit(failed ? 1 : 0);
