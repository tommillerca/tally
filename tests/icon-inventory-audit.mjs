/* THE ICON INVENTORY: where is every icon in this game, and what draws it.
 *
 * WHY THIS EXISTS. Three separate rounds of icon work have each shipped with
 * leftovers, and each time Tom found them by playing:
 *   "you missed changing the coins and currency icons in a lot of places ...
 *    like on the spinning daily wheel"                        (2026-08-17)
 *   "level up screen still doesnt have the pixel art correct for coins and
 *    golden chest, you need to be able to easily find every icon in the game
 *    for future swaaps"                                       (2026-08-18)
 * Every one of those sweeps was a grep of js/app.js, and js/app.js is 8 of the
 * 44 modules' worth of icons. js/wheel.js draws its own prize icons and js/fx.js
 * carries its own confetti coin; neither was touched by any of the three passes.
 *
 * THE SILENT HALF IS THE EXPENSIVE HALF. pixCur(kind, s) in js/icons-pix.js
 * returns art at 48, 24 and 16 and returns NULL below 16, and crateIcon(kind, s)
 * has a floor of 24. A site asking for 11, 13 or 15 therefore renders the vector
 * and looks, in the source, exactly like a site that renders pixel art. That is
 * not a bug in the helpers (a 48px drawing crushed to 12px inline is mush, and
 * declining is the right call); it is a bug in VISIBILITY. Nobody can see which
 * sites are on which side without evaluating the helper in their head, 321 times.
 *
 * So this file is the inventory, DERIVED FROM THE SOURCE on every run, and it is
 * also the guard that stops the inventory rotting:
 *
 *   EMITTERS   every function in js/ that emits <svg>, <img> or a pixel-art
 *              asset path must be DECLARED below as an icon drawer or as
 *              something-that-is-not-an-icon (a chart, a scene, a character).
 *              A new one FAILS, by name. This is the half that would have
 *              caught js/wheel.js and js/fx.js in the first pass.
 *   SITES      every call to a sizing icon drawer, with its file, line, screen
 *              (the enclosing function), concept, requested size, and whether
 *              it renders PIXEL or VECTOR. Printed in full on every run: this
 *              IS the inventory, and running the file regenerates it.
 *   SUBFLOOR   every site whose concept HAS pixel art but asks for less than
 *              that art's floor, and is therefore SILENTLY still vector. Each
 *              must be declared with a reason. A new one FAILS. This is the
 *              list to work from for the next swap.
 *   ASSETS     every pixel file a drawer can ask for exists on disk. Found a
 *              live landmine on first run: crateIcon('egg', s) builds
 *              assets/icons-pix/egg-24.png for any 24 <= s < 48 and that file
 *              has never existed, so the first caller to ask gets a broken img.
 *   CONTROL    an empty sample set is a FAILURE, never a pass.
 *
 *   DRAWERS    a drawer declared vector-only must not quietly grow a pixCur
 *              call. v399 did exactly that to ingIconHtml while this audit was
 *              being written, and the audit stayed GREEN while reporting all 13
 *              of its sites as vector. A false green is worse than a red, so
 *              that shape now has its own row.
 *
 * NOT EVERY SITE CAN BE GRADED FROM SOURCE, and the ones that cannot are printed
 * under DECIDED AT RUNTIME rather than guessed at: spawnIcon and ingIconHtml
 * serve pixel art for some concepts and vector for others, so a call with a
 * computed concept genuinely depends on the value. Grading those needs a browser.
 *
 * PROVE-RED (all six run in a throwaway copy of the tree, 2026-08-18, each red
 * with a message that names the thing):
 *   EMITTERS  append `function zzIcon(){ return `<svg class="ico"></svg>`; }` to
 *             js/energy.js -> FAIL "js/energy.js:zzIcon (1 line(s))".
 *   EMITTERS  delete js/wheel.js and js/fx.js -> FAIL naming all four emitters
 *             that vanished with them.
 *   SUBFLOOR  put the level-up coin back to ICONS.coin(15) -> FAIL
 *             "js/app.js:openLevelUpMoment|coin ... asking 15 against a floor
 *             of 16".
 *   DRAWERS   add a pixCur call to recipeIconHtml -> FAIL naming it.
 *   ASSETS    move assets/icons-pix/crate.png away -> FAIL naming the path.
 *   CONTROL   rename the ICONS table so its call sites stop matching -> FAIL at
 *             131 sites / 7 members, rather than a green run over a smaller set.
 *
 * Node only, no browser, well under a second. Run: node tests/icon-inventory-audit.mjs
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const JS = path.join(ROOT, 'js');
const results = [];
const ok = (name, pass, detail = '') => { results.push({ name, pass }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`); };

/* Strip prose but keep every newline, so reported line numbers are real. Comments
   in this project describe icons constantly ("the coin sits at 14px"), and a scan
   that reads them finds sites that do not exist. */
const stripProse = src => src
  .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
  .replace(/(^|[^:])\/\/[^\n]*/g, (m, p) => p + ' '.repeat(m.length - p.length));

/* ==========================================================================
 * 1. THE DRAWERS. What each one can put on screen, and its pixel floor.
 *
 * `floor` is the smallest size at which this drawer serves PIXEL art. null
 * means the drawer has no pixel art at all and the vector is the finished
 * answer, not a fallback -- those sites are inventory, not debt.
 * ======================================================================== */
const DRAWERS = {
  // arg index of the size, arg index of the concept (null = fixed), default size, pixel floor
  'pixCur':         { size: 1, kindArg: 0, floor: 16, art: 'PIX_CUR', note: "Tom's 48px currency set (js/icons-pix.js)" },
  'crateIcon':      { size: 1, kindArg: 0, def: 22, floor: 24, prefix: 'crate/', art: 'CRATE', note: 'the closed chest / egg art' },
  'crateChip':      { size: 1, kindArg: 0, def: 16, floor: 16, prefix: 'cratechip/', art: 'FIXED:crate', note: 'the plain chest at 16 with rarity as a glow' },
  'consumableIcon': { size: 1, kindArg: 0, def: 20, floor: 16, art: 'PIX_CUR', note: 'vigor draught / battle charm' },
  'spawnIcon':      { size: 1, kindArg: 0, def: 20, floor: 24, prefix: 'spawn/', art: 'SPAWN', note: 'a Boneyard map spawn; routes to coin, crate or bone' },
  /* v399 taught this one pixel art for the ONE rare ingredient that has a
     drawing, so its floor depends on the ingredient, not on the drawer. */
  'ingIconHtml':    { size: 1, kindArg: 0, def: 22, floor: 16, prefix: 'ingredient/', art: 'PIX_CUR' },
  // no pixel art exists for these; the vector IS the icon
  'bhIcon':         { size: 1, kindArg: 0, def: 22, floor: null, note: 'the generated game-icons.net vector pack' },
  /* v411: the 4-point sparkle has a drawing now. A caller passing a FILL is
     asking for a recolour a PNG cannot do (the level-up sparks are green), so
     the second argument forces the vector and is graded that way. */
  'sparkIco':       { size: 0, def: 14, floor: 16, art: 'PIX_CUR', fixed: 'sparkle', vectorIfArg: 1 },
  /* v411: all seven dishes have art, and the six potions share one vial. The
     concept is the recipe OBJECT at every site, so these grade at runtime. */
  'recipeIconHtml': { size: 1, kindArg: 0, def: 24, floor: 16, art: 'PIX_CUR', prefix: 'recipe/' },
  /* v411: the four pack badges that have a drawing. Sites that pass bhIcon a
     tint are deliberately NOT routed through this and stay vector. */
  'badgePixHtml':   { size: 1, kindArg: 0, floor: 16, art: 'PIX_CUR', note: 'badge-skull / trophy / crown / signpost / footprint' },
  'iconHtml':       { size: 1, kindArg: 0, floor: null, prefix: 'wheelprize/', note: 'js/wheel.js, the reveal card' },
  'iconAt':         { size: 3, kindArg: 0, floor: null, prefix: 'wheelprize/', note: 'js/wheel.js, inside the wheel svg' },
  'pixPrizeImg':    { size: null, floor: 16, fixed: 'wheelprize', art: 'ALWAYS', note: 'js/wheel.js, always asks pixCur for 48' },
};
for (const k of Object.keys(DRAWERS)) {
  if (k.startsWith('ICONS.')) continue;
  DRAWERS[k].re = new RegExp(`(?:^|[^\\w.$])${k}\\s*\\(`, 'g');
}
/* EVERY MEMBER OF THE ICONS TABLE, DERIVED. Hand-listing the 30-odd members and
   their default sizes is precisely the list that rots: ICONS.check was added in
   the dingbat sweep and ICONS.dust learned pixel art months later, and neither
   change would have touched a hand-written copy here. So read both shapes the
   table is written in (`coin: (s = 14) =>` inside the object literal, and
   `ICONS.close = (s = 18) =>` after it), and take the PIXEL FLOOR from whether
   the member's own definition calls pixCur. A member that grows pixel art
   becomes a pixel drawer here on the next run, with no edit to this file. */
const appForIcons = stripProse(readFileSync(path.join(JS, 'app.js'), 'utf8'));
let iconMembers = 0;
for (const m of appForIcons.matchAll(/(?:^\s{0,2}|ICONS\.)(\w+)\s*[:=]\s*\((?:(\w+)\s*=\s*(\d+))?[^)]*\)\s*=>/gm)) {
  const [, name, , def] = m;
  if (DRAWERS['ICONS.' + name]) continue;
  /* The body runs to the next member definition, so ICONS.star -- the one member
     written with a block body and a two-argument signature -- is read as fully as
     the one-line arrows, and no member can borrow the next one's <svg>. */
  const rest = appForIcons.slice(m.index + m[0].length, m.index + m[0].length + 900);
  const body = rest.split(/\n(?:ICONS\.\w+\s*=|\s{0,2}\w+\s*:\s*\()/)[0];
  if (!/<svg|t1Stroke\(|pixCur\(/.test(body)) continue;      // not an icon member
  DRAWERS['ICONS.' + name] = { size: 0, def: def ? +def : undefined, fixed: name,
    floor: /pixCur\(/.test(body) ? 16 : null };
  iconMembers++;
}


/* ==========================================================================
 * 2. EVERY FUNCTION IN js/ THAT PUTS A PICTURE ON SCREEN.
 *
 * One line each. `icon` means it belongs to the icon system above and a swap
 * has to consider it. The other kinds are the reason this list is not just the
 * icon drawers: they are what the net catches, and calling each one a decision
 * is what stops a real drawer hiding among them.
 *   chart  data drawn as svg; it has no icon in it
 *   scene  full-bleed backdrop, stage or character art, sized by layout not by
 *          an icon size, and not part of any icon swap
 *   brand  a fixed third-party or brand mark
 * ======================================================================== */
const EMITTERS = {
  /* ---- the icon system itself ---- */
  'js/icons-pix.js:pixCur':   ['icon', "THE PIXEL SOURCE. Tom's 48px art, served at 48/24/16 only; below 16 it returns null on purpose and the caller's vector renders."],
  'js/icons-pack.js:bhIcon':  ['icon', 'THE VECTOR SOURCE. Generated from assets/icons-proposal by gen_icons.mjs, so nothing hand-written survives in it.'],
  'js/app.js:ICONS':          ['icon', 'the vector icon table. coin, dust and pit try pixCur first; the rest are vector-only.'],
  'js/app.js:t1Stroke':       ['icon', 'the shared stroke-icon factory behind ICONS.close/chev/check/lock/camera and nine more. Vector by design: these are controls, not currency.'],
  'js/app.js:sparkIco':       ['icon', 'the 4-point sparkle that replaced the emoji stars. Vector, no pixel art exists.'],
  'js/app.js:crateIcon':      ['icon', 'the one function all crate/egg art goes through. Pixel at 24 and 48, vector below.'],
  'js/app.js:mapLegendHtml':  ['icon', 'the Boneyard map key: draws each marker with the same markup the map uses, so legend and map cannot drift.'],
  'js/wheel.js:pixPrizeImg':  ['icon', 'the daily wheel\'s pixel prize art. It became an EMITTER in v421: five of the seven prizes come back from pixCur, and the two crate wedges are built here as a direct <img> because assets/crates/{common,golden}/f0.png sit outside PIX_CUR, which is keyed to assets/icons-pix/. It reuses .crate-ico-pix so it inherits image-rendering:pixelated.'],
  'js/wheel.js:iconAt':       ['icon', 'daily wheel prize icons, positioned inside the wheel svg.'],
  'js/wheel.js:iconHtml':     ['icon', 'daily wheel prize icon on the reveal card.'],
  'js/wheel.js:wheelSvg':     ['icon', 'the wheel body. Its pixel prize art is placed as <img> siblings, not inside the svg, because the svg scales to a fractional viewport size.'],
  'js/fx.js:SVG':             ['icon', 'THE CONFETTI SPRITES: a bone, a skull and a hand-inlined COPY of the app coin, rasterised once at 52px to a canvas. Vector, and a duplicate of ICONS.coin that no icon sweep has ever touched. Swapping the coin means editing it here too.'],
  /* ---- fixed marks ---- */
  'js/app.js:DISCORD_MARK':      ['brand', 'the Discord wordmark on the community card.'],
  'js/app.js:DISCORD_APP_ICON':  ['brand', 'the Discord app tile.'],
  'js/app.js:THANKS_MARK':       ['brand', 'the TestFlight mark on the beta thank-you card.'],
  'js/app.js:SPK_ON':            ['icon', 'the sound-on speaker control.'],
  'js/app.js:SPK_OFF':           ['icon', 'the sound-off speaker control.'],
  'js/talkbox.js:talkBoxHtml':   ['icon', 'the talk box\'s "next" chevron, the only picture in the dialogue markup. Vector by design and no pixel art exists: it is a control glyph sized by the box, not currency, so an icon swap has nothing to do here. The box itself is dialogue UI, not iconography.'],
  /* ---- data drawn as svg ---- */
  'js/app.js:barChart':           ['chart', 'the day-total bars.'],
  'js/app.js:kcalChart':          ['chart', 'the calorie history line.'],
  'js/app.js:weightChart':        ['chart', 'the weight trend line.'],
  'js/app.js:proteinChart':       ['chart', 'the protein history.'],
  'js/app.js:metricSpark':        ['chart', 'the wellness sparkline.'],
  'js/app.js:metricDetailChart':  ['chart', 'the expanded wellness metric.'],
  'js/app.js:readinessHtml':      ['chart', 'the readiness dial.'],
  /* ---- scene, stage and character art: sized by layout, not by an icon size ---- */
  'js/app.js:avatarLayersHtml':     ['scene', 'the Bonehead figure: cosmetic layers stacked at stage size.'],
  'js/app.js:croppedPetImg':        ['scene', 'a pet sprite cropped to its own art box.'],
  'js/app.js:buildDenPin':          ['scene', 'a boss den marker on the map, built from the tombstone art.'],
  'js/app.js:crewCardArtHtml':      ['scene', 'a crew member card portrait.'],
  'js/app.js:crateSeqHtml':         ['scene', 'the nine-frame crate opening sequence at reveal size.'],
  'js/app.js:dropFitHtml':          ['scene', 'the drop announcement art.'],
  'js/app.js:bestiaryBannerHtml':   ['scene', 'the bestiary teaser banner.'],
  'js/app.js:spireBannerHtml':      ['scene', 'the spire banner art. Its coin and pit chips are icon SITES, listed below.'],
  'js/app.js:mealBlock':            ['scene', 'a logged meal photo.'],
  'js/app.js:openFoodForm':         ['scene', 'the food photo in the edit form.'],
  'js/app.js:openLabelFlow':        ['scene', 'the scanned label photo.'],
  'js/app.js:openFight':            ['scene', 'the fight stage: enemy plates, the arena and the result card.'],
  'js/app.js:openDenSheet':         ['scene', 'the den preview art.'],
  'js/app.js:openHatchReveal':      ['scene', 'the hatching egg.'],
  'js/app.js:openPackReveal':       ['scene', 'the cosmetic pack reveal stage.'],
  'js/app.js:presentGrantDelivery': ['scene', 'the delivered-grant card art.'],
  'js/app.js:revealGift':           ['scene', 'the gift reveal art.'],
  'js/app.js:openMageIntro':        ['scene', 'the Live Wire introduction art.'],
  'js/app.js:openSpireIntro':       ['scene', 'the spire announcement art.'],
  'js/app.js:openSpireSheet':       ['scene', 'the spire sheet art.'],
  'js/app.js:gwartHeroHtml':        ['scene', "Gwart's Emporium header: the shopkeeper's two art layers, the wordmark and the gear, at panel size. Five lines because the spell-cast animation stacks the body and three star strips."],
  'js/app.js:hypePlateHtml':        ['scene', 'the Today hype banner plate: the creature art behind its caption.'],
  'js/app.js:petShotHtml':          ['scene', "a pet cosmetic's product shot, cropped to the PART being sold rather than to the whole plate."],
  'js/wanderer.js:wandererMarkHtml':      ['scene', 'the Wanderer on the Boneyard map: his plate plus the lantern cone. The cone is painted by paintWandererCone off the map projection, so it is a light on the ground rather than an icon.'],
  'js/wanderer.js:showWandererEncounter': ['scene', 'the pre-fight encounter: his plate full-screen over the lantern glow. Scene and not icon on purpose: it is sized by the viewport.'],
  'js/app.js:openSpireInfoSheet':   ['scene', 'the spire explainer art.'],
  'js/app.js:openSiegeSheet':       ['scene', 'the siege art.'],
  /* WAS openPaddock. v433 rebuilt the paddock from a thumbnail strip into a real
     field, and the drawing moved into paddockSceneHtml, which both the player's
     own field and a friend's now render through. The declaration was not moved
     with it, so this table named a function that no longer exists and did not
     name the one that draws. */
  'js/app.js:paddockSceneHtml':     ['scene', 'the Paddock stage: the field, the herd standing in it, its keeper and the visiting player.'],
  'js/app.js:openHollow':           ['scene', 'the Hollow stage. Its coin price chip is an icon SITE, listed below.'],
  'js/app.js:openGardenSheet':      ['scene', 'the garden plot art. Its coin price chips are icon SITES, listed below.'],
  'js/app.js:openKitchen':          ['scene', 'the kitchen art. Its coin chips are icon SITES, listed below.'],
  'js/app.js:openWhatsNew':         ['scene', 'the release note art.'],
  'js/app.js:openFriendProfile':    ['scene', "a friend's figure."],
  'js/app.js:restageWardrobe':      ['scene', 'the wardrobe figure.'],
  'js/app.js:renderOnboarding':     ['scene', 'the onboarding art.'],
  'js/app.js:renderToday':          ['scene', 'the Today hero figure. Its currency chips are icon SITES, listed below.'],
  'js/app.js:renderCharacter':      ['scene', 'the Bonehead hub figure and cosmetic tiles. Its currency chips are icon SITES, listed below.'],
  'js/app.js:renderBoneyard':       ['scene', 'the map surface and its markers.'],
  'js/app.js:renderShop':           ['scene', 'the shop item art. Its price chips are icon SITES, listed below.'],
  'js/app.js:showSplash':           ['scene', 'the boot splash.'],
  'js/app.js:NEWS':                 ['scene', 'the news story art, one image per announcement.'],
  'js/glutton.js:gluttonHeroHtml':  ['scene', 'the Glutton portrait and speech bubbles.'],
  'js/glutton.js:gluttonStageHtml': ['scene', 'the Glutton combat plates.'],
  'js/graverise.js:mountGraveRise': ['scene', 'the grave-rise intro layers.'],
  'js/gateintro.js:showGateIntro':  ['scene', 'the Boneyard gate intro.'],
  'js/mimic.js:mimicPlateHtml':     ['scene', "the Mimic's three blink plates, drawn art not an icon."],
  'js/mimic.js:showMimicReveal':    ['scene', 'the Mimic chest-opening reveal.'],
  'js/hollow-art.js:hlwArt':        ['scene', 'a Hollow scene element, placed in stage coordinates.'],
  'js/hollow-beds.js:hlwPriceSignHtml': ['scene', 'the Hollow plot price sign.'],
  'js/hollow-scene.js:hollowBackdropHtml': ['scene', 'the Hollow backdrop.'],
  /* cardHtml no longer draws the pet itself: it and the species tiles in
     panelHtml both hand the figure to layeredArt, which stacks the pet and
     whatever it is wearing under ONE shared crop transform (v425, so a benched
     Bumbleseal keeps her swag on the collection card the way she already did
     out in the scene). The declaration moved with the drawing rather than being
     left behind on a function that now only lays out a row. */
  'js/paddock-cards.js:layeredArt':     ['scene', 'a Paddock pet portrait plus its worn accessories, one layer per piece.'],
  'js/paddock-cards.js:lockedCardHtml': ['scene', 'a locked Paddock card.'],
  'js/paddock-cards.js:panelHtml':      ['scene', 'the Paddock panel art.'],
  'js/wraith-fx.js:sprite':             ['scene', 'the wraith effect sprite.'],
};

/* ==========================================================================
 * 3. SITES THAT ASK BELOW THEIR ART'S FLOOR, AND SO STILL DRAW THE VECTOR.
 *
 * Keyed `js/<file>:<enclosing function>|<concept>` so it survives line drift.
 * Every entry is a decision on the record. A NEW one fails this audit, which is
 * the whole point: this is the class of leftover Tom keeps finding by playing.
 *
 * The map spawn markers and the ingredient chips are NOT here: spawnIcon and
 * ingIconHtml serve art for some concepts and not others, so the source cannot
 * say which way a given call goes. They print under DECIDED AT RUNTIME instead,
 * and grading them needs a browser. (For the record on the two that come up:
 * raising the map markers is a MAP change, not an icon change, because the
 * marker box is sized to 20 and the pins are laid out around it; and the map key
 * deliberately mirrors whatever the markers do, or the legend would lie.)
 *
 * THE STANDING RULE, so nobody has to re-derive it: text-height chips beside a
 * line of copy (11-13px) keep the vector because a 48px drawing reduced into
 * them is mush whatever we do. A site sitting at 14 or 15 is a DIFFERENT case:
 * it is one or two pixels off a whole step and should be bumped to 16, which is
 * exactly what the level-up pills were. Anything at 14 or 15 below needs a
 * reason that is not "it has always been that size".
 * ======================================================================== */
const SUBFLOOR = {
  'js/app.js:racePrizeHtml|coin':         '13px, inline with the prize copy.',
  'js/app.js:racePrizeHtml|crate/?':      '14px, inline with the prize copy; the crate floor is 24 and this row is text height.',
  'js/app.js:racePrizeHtml|dust':         '12px, inline with the prize copy.',
  'js/app.js:spireBannerHtml|coin':       '12px, inside a one-line banner.',
  'js/app.js:spireBannerHtml|pit':        '11px, inside a one-line banner.',
  'js/app.js:renderToday|crate/?':        '12-13px crate chips on the Today card; the crate floor is 24.',
  'js/app.js:renderToday|coin':           '11px, in the Today currency strip.',
  'js/app.js:renderToday|dust':           '13px, in the Today currency strip.',
  'js/app.js:openHollow|coin':            '14px price chip. CANDIDATE for 16: one step away.',
  'js/app.js:openGardenSheet|coin':       '12px seed price.',
  'js/app.js:openKitchen|coin':           '12-13px cook prices.',
  'js/app.js:renderShop|coin':            '12-13px shop price chips, set in the price line.',
  'js/app.js:renderShop|dust':            '13px dust price chips.',
  'js/app.js:openRenameNotice|coin':      '15px in the rename notice copy. CANDIDATE for 16: one step away.',
  'js/app.js:openRenameNotice|dust':      '15px in the rename notice copy. CANDIDATE for 16: one step away.',
  'js/app.js:renderFriends|coin':         '13px in the gift row.',
  'js/app.js:renderFriends|dust':         '12px in the gift row.',
  'js/app.js:renderFriends|crate/?':      '15px crate in the gift row; the crate floor is 24 so 16 would not help, it needs crateChip. CANDIDATE.',
  'js/app.js:openGiftSheet|coin':         '14px in the gift amount row. CANDIDATE for 16: one step away.',
  'js/app.js:openLevelUpMoment|crate/egg':'15px. Not bumped with the rest of this row: the 24 step for the egg is assets/icons-pix/egg-24.png and that file does not exist (see ASSETS below), and Tom rejected the small egg sprite on sight in the last pass ("i feel like the step egg looks worse for the icon maybe we keep the egg icon and just swap the chests"). Open question for Tom, not a silent choice.',
  'js/app.js:renderCharacter|coin':       '14px in the hub currency strip. CANDIDATE for 16: one step away.',
  'js/app.js:renderCharacter|dust':       '11-13px dust chips across the hub, talents and cosmetics.',
  'js/app.js:renderCharacter|xp2':        '14px battle-charm chip. CANDIDATE for 16: one step away.',
  'js/app.js:openPackReveal|coin':        '14px in the pack summary. CANDIDATE for 16: one step away.',
  'js/app.js:crateResultToCard|coin':     '11px in a crate result line.',
  'js/app.js:openStable|dust':            '13-14px dust chips in the stable.',
  'js/app.js:renderBoneyard|pit':         '15px in the map action bar. CANDIDATE for 16: one step away.',
  'js/app.js:renderPit|coin':             '12px in the Gauntlet reward lines.',
  'js/app.js:renderPit|crate/golden':     '22px golden crate on the Gauntlet card, two pixels under the 24 floor. The strongest CANDIDATE on this list: 24 is one step up and the row is 22px of art already.',
  'js/app.js:openFight|coin':             '15px on the fight result. CANDIDATE for 16: one step away.',

  /* ---- v411, the batch that gave star / bone / paw / bolt / sparkle / the four
     pack badges / all seven dishes their 48px drawings. Every row below is a
     site the new art CANNOT reach, and all but three are the standing rule:
     11-13px inline with a line of copy. The exceptions are named. ---- */
  'js/app.js:petSpriteHtml|sparkle':      '12 and 14px. The shiny badge pinned to the CORNER of a pet sprite: it is sized to the sprite it decorates, not to a whole step, and 14 -> 16 would push it off the 12px sibling it pairs with.',
  'js/app.js:petPortraitHtml|sparkle':    '12px shiny badge on a pet portrait, the same corner mark as petSpriteHtml.',
  'js/app.js:renderToday|boltIco':        '13px in the ready-fights chip and the hero-why line, both inline with text.',
  'js/app.js:crewCardHtml|star':          '15px favourite marker in a friend row. CANDIDATE for 16: one step away.',
  'js/app.js:renderCharacter|bone':       '14px in the "N found" pill, inline with the count. CANDIDATE for 16: one step away.',
  'js/app.js:renderCharacter|boltIco':    '11-14px talent and boost marks, every one inline with a gear label or a count.',
  'js/app.js:renderCharacter|sparkle':    '11-13px looks-tab count and the "look changed" tag.',
  'js/app.js:packCardHtml|sparkle':       '11, 12 and 15px. A deliberate SCATTER of four sparks at four different sizes around a pack card; the 16px one does draw the art. Bumping 15 to 16 would flatten the variation that makes it read as a scatter.',
  'js/app.js:petPanelHtml|sparkle':       '10px in the SHINY tag copy.',
  'js/app.js:petPanelHtml|star':          '11px in the lineage tag copy.',
  'js/app.js:openPetLevelUp|sparkle':     '11px in the SHINY tag copy.',
  'js/app.js:openPetLevelUp|star':        '11px in the lineage tag copy.',
  'js/app.js:openStable|sparkle':         '9 and 12px in the Species Signature header and a rarity chip.',
  'js/app.js:openStable|star':            '12px in the next-talent sentence.',
  'js/app.js:openHatchReveal|sparkle':    '11px in the SHINY tag copy.',
  'js/app.js:openPetBreedResult|sparkle': '11px in the SHINY tag copy.',
  'js/app.js:renderPit|boltIco':          '13px in the READY chip, inline with the count.',
  'js/app.js:renderTalents|star':         '11px inside a talent pip, which is a text glyph slot.',
  'js/app.js:openFight|star':             '14px in the XP reward pill, inline with "+N XP". CANDIDATE for 16: one step away.',
  'js/app.js:renderFriends|tombstone':    '11px in the leaderboard spire-count copy, inline with "N spires".',

  /* MAP FURNITURE IS THE EXCEPTION TO THE STANDING RULE, and these two are the
     ones that stay. Measured on the rendered map, 2026-08-20:
       renderBoneyard|pit  15px inline with "Fight the <name>" INSIDE the mini
         boss button, so it has a line of copy to sit in. CANDIDATE for 16.
       spireBannerHtml     the banner rows are .spire-row-r at font-size 13 with
         a name, a progress bar and a <small> line, so 11-12px is the row, not
         the map. A 16px icon would out-size its own number.
     What did NOT stay: renderBoneyard|coin, the spire marker's tribute label,
     which is a coin plus a number pinned under a marker with no copy anywhere
     near it. 11px filled 0.44 of its slot and Tom read it as too small. */
};

/* WHICH CONCEPTS ACTUALLY HAVE PIXEL ART, read from the two tables that decide
   it. A drawer's floor only applies to a concept the art tables know: v399 gave
   ingIconHtml a pixCur call for one rare ingredient, and without this every
   OTHER ingredient would have been reported as a silent vector fallback it can
   never escape, because no drawing for it exists. */
const pixSrc = readFileSync(path.join(JS, 'icons-pix.js'), 'utf8');
const appSrc = readFileSync(path.join(JS, 'app.js'), 'utf8');
const pairs = obj => [...obj.matchAll(/'?([\w-]+)'?\s*:\s*'([^']+)'/g)].map(m => [m[1], m[2]]);
const PIX_CUR = pairs((pixSrc.match(/const PIX_CUR = \{([\s\S]*?)\};/) || [, ''])[1]);
const CRATE = pairs((appSrc.match(/const CRATE_ICON_PIX = \{([\s\S]*?)\};/) || [, ''])[1]);
const PIX_KEYS = new Set(PIX_CUR.map(([k]) => k));
const CRATE_KEYS = new Set(CRATE.map(([k]) => k));
const SPAWN_ART = { coins: 'coin', crate: 'crate', rare: 'egg', herbs: 'herbs' };   // js/app.js spawnIcon

/* ==========================================================================
 * 4. DERIVE.
 * ======================================================================== */
const files = readdirSync(JS).filter(n => n.endsWith('.js')).sort();
const emitters = new Map();   // 'js/f:fn' -> hit count
const sites = [];
const SIG = /<svg\b|<img\b|assets\/(?:icons-pix|crates)\//;
const PLUMBING = new Set([...Object.keys(DRAWERS).map(n => n.replace('ICONS.', '')), 'ICONS', 't1Stroke']);
const litArg = a => { const m = a && a.match(/^['"`]([\w-]+)['"`]$/); return m ? m[1] : null; };

/* split a call's argument list, respecting nesting and strings */
function callArgs(line, open) {
  let depth = 0, quote = null, out = [], cur = '';
  for (let i = open; i < line.length; i++) {
    const c = line[i];
    if (quote) { if (c === '\\') { cur += c + line[++i]; continue; } cur += c; if (c === quote) quote = null; continue; }
    if (c === '"' || c === "'" || c === '`') { quote = c; cur += c; continue; }
    if (c === '(' || c === '[' || c === '{') { depth++; if (depth === 1) continue; }
    if (c === ')' || c === ']' || c === '}') { depth--; if (depth === 0) { out.push(cur.trim()); return out; } }
    if (c === ',' && depth === 1) { out.push(cur.trim()); cur = ''; continue; }
    cur += c;
  }
  return null;   // the call spans lines
}

for (const f of files) {
  const code = stripProse(readFileSync(path.join(JS, f), 'utf8')).split('\n');
  const owners = [];
  code.forEach((ln, i) => {
    const m = ln.match(/^(?:export\s+)?(?:async\s+)?function\s+(\w+)/) || ln.match(/^(?:export\s+)?(?:const|let)\s+(\w+)\s*=/);
    if (m) owners.push([i, m[1]]);
  });
  const ownerAt = i => { let n = '(top level)'; for (const [l, x] of owners) { if (l <= i) n = x; else break; } return n; };

  code.forEach((ln, i) => {
    if (SIG.test(ln)) {
      const k = `js/${f}:${ownerAt(i)}`;
      emitters.set(k, (emitters.get(k) || 0) + 1);
    }
    for (const [name, d] of Object.entries(DRAWERS)) {
      const re = d.re || new RegExp(`ICONS\\.${name.slice(6)}\\s*\\(`, 'g');
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(ln))) {
        const bare = name.replace('ICONS.', '');
        if (new RegExp(`function\\s+${bare}\\s*\\(`).test(ln)) continue;     // the definition is not a site
        const open = ln.indexOf('(', m.index + m[0].length - 1);
        const a = callArgs(ln, open);
        const concept = d.fixed || (a && d.kindArg != null ? (d.prefix || '') + (litArg(a[d.kindArg]) || '?') : '?');
        let size = 'DYNAMIC';
        if (d.size == null) size = 48;                                        // pixPrizeImg hard-codes it
        else if (a) {
          const raw = d.size < a.length && a[d.size] !== '' ? a[d.size] : null;
          if (raw == null) size = d.def ?? 'DYNAMIC';
          else if (/^\d+$/.test(raw)) size = +raw;
        }
        /* A drawer calling a drawer is PLUMBING, not a place an icon appears:
           ICONS.coin asking pixCur, spawnIcon routing to crateIcon. Those show
           up as sites with no size of their own and would pad the inventory
           with rows nobody can act on. The drawers are documented above. */
        const screen = ownerAt(i);
        if (PLUMBING.has(screen)) continue;
        /* Some drawers decline the pixel art when a given argument is present
           (sparkIco's fill). Without this the inventory would report PIXEL for
           a site that renders the svg, which is the false green this file
           exists to prevent. */
        const forcedVector = d.vectorIfArg != null && !!(a && a[d.vectorIfArg]);
        sites.push({ file: `js/${f}`, line: i + 1, drawer: name, concept, size,
          floor: d.floor, screen, forcedVector });
      }
    }
  });
}

/* Does THIS concept have pixel art? A null floor means the drawer has none at
   all; otherwise the drawer names the table that decides, and a concept the
   caller computes at runtime ('?') cannot be decided here. */
const hasArt = s => {
  const d = DRAWERS[s.drawer];
  if (!d || d.floor == null) return false;
  const kind = String(s.concept).includes('/') ? String(s.concept).split('/')[1] : String(s.concept);
  switch (d.art) {
    case 'ALWAYS': return true;
    /* A computed concept is only undecidable when the drawer's table is MIXED.
       Every crate kind has art, so crateIcon(kind, 14) is below the floor
       whatever kind is; spawnIcon and ingIconHtml serve art for some concepts
       and not others, so those genuinely cannot be graded from the source. */
    case 'PIX_CUR': return kind === '?' ? null : PIX_KEYS.has(kind);
    case 'CRATE': return kind === '?' ? true : CRATE_KEYS.has(kind);
    case 'SPAWN': return kind === '?' ? null : !!SPAWN_ART[kind];
    case 'FIXED:crate': return PIX_KEYS.has('crate');
    default: return true;                                     // ICONS members: the floor IS the answer
  }
};
const medium = s => {
  if (s.forcedVector) return 'VECTOR';        // the call declines the art by argument
  const art = hasArt(s);
  if (art === false) return 'VECTOR';                         // no pixel drawing exists for this concept
  if (art === null || typeof s.size !== 'number') return 'VARIES';
  return s.size >= s.floor ? 'PIXEL' : 'VECTOR-FALLBACK';
};
for (const s of sites) s.medium = medium(s);

/* ==========================================================================
 * 5. THE INVENTORY, printed in full. Running this file regenerates it.
 * ======================================================================== */
console.log('======================== ICON INVENTORY ========================');
console.log('screen (enclosing fn)          file:line               drawer          concept              size  renders');
let curFile = '';
for (const s of [...sites].sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line)) {
  if (s.file !== curFile) { curFile = s.file; console.log(`\n--- ${curFile} ---`); }
  console.log(`${s.screen.slice(0, 29).padEnd(30)} ${`${s.file}:${s.line}`.slice(-23).padEnd(23)} ${s.drawer.padEnd(15)} ${String(s.concept).padEnd(20)} ${String(s.size).padStart(4)}  ${s.medium}`);
}
const by = m => sites.filter(s => s.medium === m).length;
console.log(`\n${sites.length} icon sites across ${new Set(sites.map(s => s.file)).size} modules and ${new Set(sites.map(s => s.screen)).size} screens`);
console.log(`  PIXEL            ${by('PIXEL')}`);
console.log(`  VECTOR-FALLBACK  ${by('VECTOR-FALLBACK')}   (pixel art EXISTS but the site asks below its floor)`);
console.log(`  VECTOR           ${by('VECTOR')}   (no pixel art exists; the vector is the finished icon)`);
console.log(`  VARIES           ${by('VARIES')}   (the caller supplies the size or the concept, so it is decided at runtime)`);
const varies = sites.filter(s => s.medium === 'VARIES');
if (varies.length) {
  console.log('\nDECIDED AT RUNTIME (the caller supplies the concept, or the drawer serves art for');
  console.log('some concepts and not others). Source alone cannot grade these; a browser can:');
  for (const s of varies) console.log(`  ${s.file}:${s.line}  ${s.screen}  ${s.drawer}(${s.concept}, ${s.size})`);
}
console.log('===============================================================\n');

/* ==========================================================================
 * 6. THE GUARDS.
 * ======================================================================== */
ok('CONTROL the scan found icon sites, ICONS members and emitters to grade (an empty sample is a failure)',
  sites.length >= 250 && emitters.size >= 50 && iconMembers >= 20,
  `${sites.length} sites, ${iconMembers} derived ICONS members, ${emitters.size} emitters, ${files.length} modules`);

const undeclared = [...emitters.keys()].filter(k => !EMITTERS[k]).sort();
ok('EMITTERS every function in js/ that draws a picture is declared as an icon drawer or as not-an-icon',
  undeclared.length === 0,
  undeclared.length ? `\n     ${undeclared.map(k => `${k}  (${emitters.get(k)} line(s)) — add it to EMITTERS: is it an icon, a chart, a scene or a brand mark?`).join('\n     ')}` : `${emitters.size} declared`);

const goneEmitters = Object.keys(EMITTERS).filter(k => !emitters.has(k)).sort();
ok('EMITTERS and no declared emitter has been deleted without being un-declared',
  goneEmitters.length === 0, goneEmitters.join(', '));

const subKey = s => `${s.file}:${s.screen}|${s.concept}`;
const subNow = new Set(sites.filter(s => s.medium === 'VECTOR-FALLBACK').map(subKey));
const subNew = [...subNow].filter(k => !SUBFLOOR[k]).sort();
ok('SUBFLOOR every site that silently falls back to vector is declared with a reason',
  subNew.length === 0,
  subNew.length ? `\n     ${subNew.map(k => {
    const hit = sites.filter(s => s.medium === 'VECTOR-FALLBACK' && subKey(s) === k);
    return `${k}  at line(s) ${hit.map(s => s.line).join(', ')} asking ${[...new Set(hit.map(s => s.size))].join('/')} against a floor of ${hit[0].floor} — bump it to the floor, or declare why it stays vector`;
  }).join('\n     ')}` : `${subNow.size} declared`);

const subGone = Object.keys(SUBFLOOR).filter(k => !subNow.has(k)).sort();
ok('SUBFLOOR and no declared fallback has been fixed or deleted without being un-declared',
  subGone.length === 0, subGone.length ? `\n     ${subGone.join('\n     ')}   (now renders pixel art, or the site is gone: drop the row)` : '');

/* A DRAWER THAT LEARNS PIXEL ART MUST SAY SO. v399 added a pixCur call inside
   ingIconHtml and this audit stayed green while classifying all 13 of its sites
   as vector, which is the false green this whole file exists to prevent. Every
   function outside js/icons-pix.js that calls pixCur is now required to be a
   declared drawer carrying a floor, so the next one cannot slip through. */
/* A VECTOR-ONLY DRAWER THAT LEARNS PIXEL ART MUST SAY SO. v399 put a pixCur
   call inside ingIconHtml and this audit stayed green while reporting all 13 of
   its sites as vector: a false green, which is the one outcome worse than a red.
   Only the hand-declared drawers need this; the ICONS members above read their
   own floor out of their own body already. */
const vectorOnly = Object.keys(DRAWERS).filter(n => !n.startsWith('ICONS.') && DRAWERS[n].floor == null);
const grewArt = [];
for (const f of files) {
  const src = stripProse(readFileSync(path.join(JS, f), 'utf8'));
  for (const name of vectorOnly) {
    const m = src.match(new RegExp(`(?:function\\s+${name}\\s*\\(|(?:^|\\n)(?:export )?const ${name}\\s*=)`));
    if (!m) continue;
    const body = src.slice(m.index).split(/\n(?:export )?(?:async )?(?:function|const|let) /)[0];
    if (/(?:^|[^\w.$])pixCur\s*\(/.test(body)) grewArt.push(`js/${f}:${name}`);
  }
}
ok('DRAWERS no drawer declared vector-only has quietly grown a pixCur call',
  grewArt.length === 0 && vectorOnly.length >= 3,
  grewArt.length ? `\n     ${grewArt.map(n => `${n} draws pixel art now — give it a floor in DRAWERS and name the art table that decides its concepts`).join('\n     ')}` : `${vectorOnly.length} vector-only drawers checked`);

/* ASSETS: every pixel file a drawer can build a path to must exist. crateIcon
   has always been able to build assets/icons-pix/egg-24.png and that file has
   never shipped, so the first caller between 24 and 47 gets a broken image. */
const wanted = [];
for (const [, file] of PIX_CUR) wanted.push([`assets/icons-pix/${file}.png`, 'pixCur at 48/24/16']);
for (const [kind, base] of CRATE) {
  wanted.push([`assets/${base}.png`, `crateIcon('${kind}', >=48)`]);
  wanted.push([`assets/${base}-24.png`, `crateIcon('${kind}', 24..47)`]);
}
const missing = wanted.filter(([p]) => !existsSync(path.join(ROOT, p)));
ok('ASSETS every pixel file the drawers can ask for exists on disk',
  missing.length === 0 && wanted.length >= 10,
  missing.length ? `\n     ${missing.map(([p, why]) => `${p}  MISSING — ${why} would render a broken image`).join('\n     ')}` : `${wanted.length} paths`);

const failed = results.filter(r => !r.pass).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
console.log(failed ? 'ICON INVENTORY FAILED' : 'ICON INVENTORY VERIFIED');
process.exit(failed ? 1 : 0);
