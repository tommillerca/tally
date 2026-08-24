/* THE RELEASE GATE.
 *
 * Tom, 2026-08-10, after finding the News tab broken a day after it was fixed:
 * "you need to create guard rails to fix these things and then not have them slip
 * back to some bullshit broken code."
 *
 * The guard rails mostly EXISTED. The problem is that `npm test` runs two files
 * (unit + pit) and the forty-odd browser audits are all run by hand, one at a
 * time, from memory, which means the ones I do not happen to think about that day
 * are not run at all. An audit nobody runs is not a guard rail, it is a file.
 *
 * So this is one command that runs the audits guarding SHIPPED, PLAYER-FACING
 * surfaces, and exits non-zero if any of them fails. It is deliberately not all
 * forty: a gate that takes half an hour gets skipped, and a skipped gate is the
 * thing we are fixing. Anything guarding a surface a player touches every day
 * belongs on this list; add to it rather than running something on the side.
 *
 *   node tests/release-gate.mjs [baseUrl]
 *
 * Run it against localhost BEFORE pushing, and against the live URL AFTER, per
 * the standing ritual (localhost passing is not "a player can use it").
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
/* THE GATE OWNS ITS SERVER. Passing no argument used to mean localhost:8765 and
   hope: whatever happened to be serving that port. With two sessions open on this
   machine that is a green about somebody else's working tree, which has bitten
   this project before. With no argument it now serves THIS repo on a free port
   and tears it down after. Pass a URL (the live site) to skip all of that. */
import { createServer } from 'node:http';
import { readFile, stat, readdir } from 'node:fs/promises';
import { extname, join as pjoin, normalize } from 'node:path';
import { resolve as presolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const repoRoot = pjoin(here, '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2' };

async function serveRepo() {
  const server = createServer(async (req, res) => {
    try {
      let rel = decodeURIComponent((req.url || '/').split('?')[0]);
      if (rel.endsWith('/')) rel += 'index.html';
      // never serve outside the repo, however creative the request is
      const full = pjoin(repoRoot, normalize(rel).replace(/^(\.\.[/\\])+/, ''));
      if (!full.startsWith(repoRoot)) { res.writeHead(403).end(); return; }
      const st = await stat(full).catch(() => null);
      if (!st || !st.isFile()) { res.writeHead(404).end('not found'); return; }
      res.writeHead(200, { 'content-type': MIME[extname(full)] || 'application/octet-stream',
        'cache-control': 'no-store' });
      res.end(await readFile(full));
    } catch { res.writeHead(500).end(); }
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  return { server, url: `http://127.0.0.1:${server.address().port}/` };
}

/* ARGV[2] IS NOT NECESSARILY A URL. `npm run gate:all` passes `--all`, so this
   read the literal string "--all" as the base, skipped spawning the server
   (because argUrl was truthy), and handed "--all" to all 42 suites: every
   browser suite died in ~1s at page.goto with a CDP error, and the run looked
   like 42 catastrophic failures on a tree that is 15/15 green.
   So gate:all has NEVER once worked, and it failed in the direction that looks
   like real breakage, which is the expensive direction: I nearly sent Reggie a
   triage list of 42 phantom failures. Flags are flags; the URL is the first
   argument that is not one. */
const argUrl = process.argv.slice(2).find(a => !a.startsWith('--'));
const own = argUrl ? null : await serveRepo();
const base = argUrl || own.url;
if (own) console.log(`serving this repo at ${base}\n`);

/* Node-only checks first: they are seconds, and there is no point burning four
   minutes of browser time on a build whose pure logic is already broken. */
/* first-fight-audit is here and not in BROWSER because it boots nothing: it
   imports ../js/pit.js and runs 400 seeded sims, exactly quest-daymore's shape,
   and BROWSER hands every entry a URL it would ignore. ~1s, 4/4 green on main,
   and it carries its own CONTROL row so it cannot pass vacuously. */
/* icon-inventory-audit is PURE for the same reason first-fight-audit is: it boots
   nothing, reads js/*.js, and finishes in well under a second. It is the register
   of every icon site in the game and it fails when a new one appears undeclared,
   which is the class of leftover three separate icon sweeps have each shipped. */
/* boneyard-supply-audit is PURE for the same reason: it boots nothing, runs the
   real spawn generator and the real drop tables over a 40,000-cell grid in about
   a second, and pins the Boneyard's faucet (coins and XP per cell as ratchets,
   ingredients per cell as a floor) now that the map has to feed the Kitchen
   without the Bone Garden. */
/* guard-hygiene-lint is PURE and it is the cheapest file here: no browser, no
   app, it reads tests/ and finishes instantly. It exists because on 2026-08-19
   FOUR guards in this repo reported green while blind to the bug they were
   written for, and none was caught by running the tests. It pins the two failure
   modes that can be checked statically: a case stranded below the runner, and
   the count of audits carrying no positive control, which it ratchets so the
   number can only fall. */
/* loot-fallback-audit is PURE for the same reason again: no browser, ~1.5s. It
   pins the terminal cosmetic fallback, which used to pick uniformly from 362
   items and so paid legendaries 3.41x their drop weight, ignored the crate's
   rarity floor, and handed back pet-slot items that cannot drop from crates. */
/* pet-accessory-lint is PURE for the same reason: it imports data/boneheadz.js,
   reads five PNG headers and finishes instantly. It pins the one string that
   separates a sellable pet accessory from a pet species: an accessory carrying
   slot 'C' joins the Mystery Egg's hatch pool and is handed out free on the same
   screen that sells it, with nothing in the UI looking wrong. It also keeps pet
   slot codes out of BH_SLOTS (nine app.js sites iterate it to draw the PLAYER),
   holds the glasses on top of the pet stack, and grades every layer against the
   clipping budget croppedPetImg's own scale leaves it. */
/* pet-pool-audit is PURE for the same reason: it imports js/loot.js and
   data/boneheadz.js, boots nothing, and finishes in ~5s. It is the price tag on
   Gwart's Emporium as an assertion. Bumbleseal is 50,000 coins and her
   accessories 3,500 to 12,000, and all of that scarcity is four filter calls in
   js/loot.js that nothing measured. It pins her hatch rate at 1% over 200,000
   draws in BOTH pool shapes (+/- 0.0015, 6.7 sigma, red at the 25% an even share
   would give her), that no pet accessory can come out of a crate at either
   floor, and, statically, that there is exactly ONE pet pool and ONE crate
   predicate in the module. That last row is the point: the two pet pools had
   already drifted once (the Day One Lizard reachable from a random grant), and
   the two crate pools were drifted when this was written, which is how 0.993%
   of Common Crate fallback rolls and 2.938% of Golden Crate rolls came back a
   pet accessory revealed as a duplicate of an item the player never owned.
   Carries SAMPLE, REACH and LEAK as controls: LEAK rebuilds the pre-fix pool and
   REQUIRES it to leak, because three of its rows assert a zero. */
/* guard-provenance-lint is PURE for the same reason guard-hygiene-lint is: a
   static scan of tests/, no browser, no network, well under a second. It is the
   staleness twin of that file. Hygiene catches a guard that cannot SEE its bug;
   provenance catches one still enforcing an instruction that was reversed. */
/* xp-curve-audit is PURE for the same reason the lints are: it imports js/pit.js
   and js/game.js, walks 200 Gauntlet ranks in arithmetic and exits, no browser
   and well under a second. It guards the SHAPE of the Gauntlet XP curve (a rank
   high up must not pay a bigger share of a level than a rank low down), which is
   the ROADMAP decision "reshape the GAUNTLET XP CURVE" as an assertion. Its
   CONTROL row rebuilds the pre-fix linear payouts and REQUIRES them to fail,
   because SHAPE asserts an ordering and an ordering passes on any flat data.

   feedback-status-lint is PURE: a static read of docs/, no browser, instant. It
   is in the gate rather than in a habit because the thing it guards is exactly
   what a habit failed at. It also PRINTS what Tom is still waiting on, on every
   run, which is the point: an open item nobody can miss.

  live-api-register-lint is PURE for the same reason guard-hygiene-lint is: it
   reads server/ and tests/ and finishes instantly. It exists because four dev
   sessions each pointed a server suite at the DEPLOYED worker and left a burst
   of dead accounts in Tom's Crew (47 total, docs/BOT-CENSUS-2026-08-22.md). It
   pins the one line that makes that harmless: every POST /register in a test
   carries `test: IS_TEST`, bound to flagFor(BASE), so a non-local run mints only
   accounts players.is_test hides. */
const PURE = ['unit.test.js', 'first-session-audit.mjs', 'facegate-audit.mjs', 'garden-appetite-guard.mjs', 'pit.test.js', 'quest-daymore-audit.mjs', 'quest-pick-audit.mjs', 'first-fight-audit.mjs', 'analytics-tag-audit.mjs', 'icon-inventory-audit.mjs', 'version-stamp-audit.mjs', 'boneyard-supply-audit.mjs', 'loot-fallback-audit.mjs', 'guard-hygiene-lint.mjs', 'guard-provenance-lint.mjs', 'feedback-status-lint.mjs', 'rack-theme-lint.mjs', 'pet-accessory-lint.mjs', 'pet-pool-audit.mjs', 'manifest-exports-audit.mjs', 'xp-curve-audit.mjs', 'live-api-register-lint.mjs'];
const BROWSER = [
  'write-failure-seam-audit.mjs', // a rejected write is announced and re-thrown, and the ATOMIC primitives are in the seam: the reward SOP routes every payout through addIfAbsent/take/kvUpdate, which bypass db.put entirely
  'write-failure-toast-audit.mjs', // the OTHER half of that seam: it ends in `if (!writeFailureSink) return;` and until now nothing in the app called onWriteFailure, so every rejection returned early and a lost meal, weight, crate or coin row stayed as silent as before the seam existed. The seam audit cannot catch that and should not: it registers its OWN sink to observe the seam, which is exactly why it stays green while the app has none. This file registers nothing, breaks a real write in the real page and reads the real #toast. REJECTS is the positive control (a write that quietly succeeded would make every other row vacuous); LOUD fails on SILENCE; QUIET, THROTTLE, QUOTA and NORECURSE cover the four ways announcing it can go wrong. Proven red against main's js/app.js: LOUD, THROTTLE and QUOTA go red together. Self-serving, ~50s, 6 checks
  'fight-tray-audit.mjs',    // move-button text inside its own box, and a scrolling tray that says it scrolls
  'fight-exit-audit.mjs',    // where a finished fight puts you; its COVERAGE half fails on any new fight mode that never declares an exit. Its six LIVE rows need a reachable vector tile host (the only route to a spire fight is a marker on the Boneyard) and report UNPROVEN with exit 97 without one: four of them used to be nested inside `if (launcher)` and simply vanish, taking the denominator with them (22 assertions instead of 26, summarised as 20/22). It stays in FAST because the static COVERAGE half needs no browser and is the half that catches a new fight mode with no exit rule
  'precache-audit.mjs',      // a module missing from PRECACHE = a blank app on one bad bar
  'precache-assets-audit.mjs', // non-module assets: blocks each and grades FATAL vs BOOTS-WITHOUT + records install byte-weight
  'foods-delete-audit.mjs',  // deleting a custom food must not take your logged history with it
  'recovery-audit.mjs',      // a FAILED restore must never destroy the save it was meant to replace
  'spire-intro-audit.mjs',   // the announcement fires from BOOT: the same shape that once shipped silently dead
  'dead-shell-audit.mjs',    // a dead shell recovers itself once, and never loops
  'boot-flash-audit.mjs',    // the first painted frame is never bare furniture. #tabbar and #gearBtn are static markup in index.html, so before the fix they painted at first paint on EVERY boot, ahead of the JS-built splash: an empty Today with the bottom bar on it, which is what Tom reported on 2026-08-19. Grades PIXELS off a CDP screencast started before navigation, cold AND warm, at 440x956 and 393x852, at CPU x6 so the window is ~20 frames wide instead of one. Bound is ZERO bare frames, not fewer. Carries its own controls: the capture must contain a frame from before the app had content (else the run could not hold the bug), and some frame must score a real tab bar over real content (else the detector is blind). FAILSAFE blocks a module so the app can never render and asserts app.css's 8s keyframe brings the shell back with no reload, ahead of index.html's 12s recovery, which is anti-regression rule 8 as an assertion. NAVIGATION is the regression the fix could most easily cause and pins it: the bar never blinks out on a real tab click. Self-serving, measured 54s, 35 checks. FAST because it is the app's first impression and because the failsafe row is the only thing standing between this fix and a permanently hidden shell
  'route-flash-audit.mjs',   // and no NAVIGATION shows the tray either. Same bug class one layer in, reported by Tom on 2026-08-21: route() stripped `screen-in` before the new screen existed, so every real tab change opened a hole onto the body gradient and the bare bar. Measured on pristine main at 440x956 through a CDP screencast, Boneyard -> Today: 4 bare frames / 108ms at CPU x1, 6 / 136ms at x6. Bound is ZERO, not fewer. Grades two swaps (the full-bleed `.screen--map` Boneyard, and a padded screen to one full of canvas art) plus a reduced-motion pass. CONTROL re-runs the same graded swap with `.screen-held { display: none }` injected, which puts the app back to exactly the bug, and REQUIRES bare frames: a green FLASH beside a green CONTROL is an audit grading nothing and fails. FAILSAFE and SWEEP are the regression this fix could most easily cause and the reason it is FAST, not full: the fix parks a copy of the outgoing screen over the live app on every single navigation, so a copy that is ever stranded is a frozen app, and FAILSAFE serves a revealWhenReady that never resolves to prove the 1200ms cap takes it off anyway. Self-serving, measured 119s, 39 checks
  'handover-audit.mjs',     // and the swap ITSELF hands over on one frame. Tom, 2026-08-21, after the tray flash above was fixed: "switching between tabs is not smooth it's showing a staggered preview of the the existing page as you swap". The fix for the flash parks a copy of the outgoing screen over #screen, and that copy then DISSOLVED over .18s on a 260ms timer, so from the moment the new screen was ready both screens sat on the glass together: measured at 440x956, CPU x6, through a CDP screencast on a real tab tap, Boneyard -> Today held the old paint whole to 144ms and then showed the two superimposed until 418ms, Crew -> Today to 503ms. It grades dOld, one number per frame: the distance from a screenshot of the settled OUTGOING screen, taken on the run, with the bands calibrated per pair against that screen's own idle churn. A healthy handover steps old -> new in ONE captured frame at 0.977 to 0.998 of the old/new distance; the dissolve holds a plateau at 0.78 to 0.80 for a quarter of a second. The edge is 0.90, it sits in a gap with 0.077 of headroom either side, and the arrival's actual score prints in every row so drift is visible before it is a red. Bound is ZERO ghost frames, not fewer. It grades the HUB CHIPS too, which were the worst case in the app and the one tab-like control reaching neither route() nor openSheet(): Wardrobe -> Shop threw the old panel away at 34ms and assembled the new one in four visible stages to 395ms. CONTROL serves a js/app.js and a stylesheet with the dissolve put back and REQUIRES ghost frames, because a green GHOST beside a green CONTROL grades nothing, and the FIRST draft of that control was itself the bug: it declared the transition inside drop(), which runs in the same task that schedules the reveal, so nothing animated and it reported zero. CAP is the other row and it is a DOM fact rather than a millisecond budget on purpose: no image the reveal waits on may still be undecoded once a screen has settled, across all four tray destinations and all four hub tabs, which is the condition that pins an arrival to revealWhenReady's 700ms cap (the Shop sat on it, cold and warm, waiting on ten `loading="lazy"` thumbnails laid out at zero width that decode() never settles for: content in the DOM at 21ms, reveal at 815ms, against 61-72ms everywhere else). FAST, next to the two flash audits, because it is the same surface and the same complaint one layer in. Self-serving, measured 251s, 26 checks. Proven red in four cp -R copies, one mutation each, listed in the file header
  'nav-perf-audit.mjs',      // and a navigation does not redo work it has already done. Tom on v421: "things are buggy, choppy, not smooth moving between pages". drawTrimmedArt found a sprite's alpha box by reading the image back off a canvas and walking every pixel in JS, and nothing remembered the answer, so every arrival at the Bonehead hub re-scanned the same fifteen files: 2,789,376 source pixels, 101ms of script, 20 dropped frames and a 76ms gap between presented frames, the app's worst navigation on all four numbers. Grades a COUNT of source pixels re-scanned across a warm lap of all four tray destinations and all four hub tabs, driven by real taps, and the bound is ZERO. It is a count and not a millisecond deliberately: an absolute ms threshold was measured here (99-109ms with the bug, 12-31ms without) and REJECTED as a property of this laptop, so the one timing row is a RATIO of two laps in the same run and the machine cancels out of it. SAMPLE and DECODED are why the zero means anything: an app that scanned nothing because it had stopped DRAWING would score perfectly, and IDENTICAL pins the one regression the fix itself can cause by comparing a genuine cache miss against a hit. Self-serving, measured 46s, 6 checks, nine consecutive greens at ratio 0.32-0.44. Proven red four ways: the memo reverted (RESCAN 8,777,728 px + WARM 0.93), keyed on the canvas instead of the src (SAMPLE + DECODED), no canvas drawn at all (SAMPLE + DECODED), and a box corrupted only on a cache hit (IDENTICAL alone, which the first draft could not see)
  'news-tab-audit.mjs',      // every announcement still opens with its art
  'art-register-audit.mjs',  // cosmetics register on ink, not on boxes; node-only and half a second, and it REPLACES grill-fit-audit.mjs, which belonged to no tier and so failed the coverage assertion below on every run
  'mini-theme-audit.mjs',    // roaming mini-bosses are drawn as themed monsters
  'remote-den-audit.mjs',    // the daily free boss reads as beaten, and moves the cap
  'bestiary-audit.mjs',      // the teaser stays a teaser, and since 2026-08-21 Today names no hunt at all: its row went with the "Out there today" card, so the Today half of that file is now an ABSENCE graded against the teaser wall as its control
  'pet-ownership-audit.mjs', // a pet you OWN must exist on the two screens that list what you own. v421 sold Bumbleseal for 50,000 coins and buyPetItem wrote the inv 'cos' row and the paper-doll slot and never a petInst row, so she drew perfectly on Today (which reads the equipped SPECIES) and was absent from the Stable and the Paddock, where the Paddock fell through to lockedCardHtml and showed a silhouette carrying the Day One Lizard's copy on a pet Tom had just bought. Nothing threw and nothing looked broken. MINT is the row that catches the NEXT one, statically: every js/loot.js function that calls grantCosmetic must mint a copy in the same function or be listed pet-proof with a reason, so a battle-pass or promo pet written next year fails before it ships. TABLES pins the same shape one module over, found the same day: C6 was missing from PET_ASSIGN, whose absence makes buildBattlePet return null, so equipping the legendary gave you NO pet in the Pit, and from PET_STATS, which silently gave her a common stat line. OWNED, STABLE and PADDOCK then drive every species in the catalogue through its REAL path (the shop for anything PET_SHOP sells, grantPet otherwise, never a hand-written petInst row) and assert the real Stable draws a card and the real Paddock an unlocked tile and a non-silhouette card. RECLAIM reproduces v421's exact broken write and requires the next boot to heal it, once, without minting a second 50,000-coin pet on the boot after that. Derived from BH_ITEMS, so a new species is covered the day it lands; SAMPLE exits 2 on an empty roster rather than passing on nothing. Self-serving, ~70s, 13 checks. Proven red in a cp -R copy: v421's buyPetItem alone gives 3 FAILED, plus a deleted reclaim gives 7 FAILED including the literal 'Check your inbox, bony buddy' silhouette Tom reported, and removing C6 from the pet tables reds TABLES on its own
  'pet-wardrobe-audit.mjs', // an accessory you BOUGHT is one you can put on, and see. v422 sold five pieces at 3,500 to 12,000 coins each and shipped no way to wear them: the renderer had taken a `wear` argument since v421 and nothing in the app ever passed one, so 38,500 coins of pet clothes had nowhere to go. Tom: "did you make it possible to put the accessories on bumbleseal yet people are waiting." It drives the whole chain through the REAL controls: buy through buyPetItem, tap each of the five tiles in the Stable's wardrobe, and assert the composited layers on the pet (decoded, naturalWidth > 0, non-zero rect, never a CSS box over a blank frame). SLOT pins one item per slot, ZORDER pins the stack against PET_SLOTS with the glasses last (Tom: "the glasses are ALWAYS on top"), RELOAD pins persistence across a real page reload, SPECIES pins that an accessory drawn for one body is refused by every other pet, and SURFACES drives all four screens she is drawn on (Today's hero companion, the Stable card, the Paddock scene and a real fight plate) because equipping somewhere is not wearing everywhere. CONTROL is the negative that makes the rest mean anything: a save that owns all five and wears none draws exactly ONE layer. SNAPSHOT is static, and it is the shiny bug in a new coat: any call site drawing somebody ELSE's pet must name wear, or the viewer's wardrobe dresses a rival. FAST rather than full: 65s, and this is money the player has already spent. Proven red in a cp -R copy, mutation list in the file header
  'hype-banner-audit.mjs',   // the Today hype banner, on the app's default screen: the two new Boneyard creatures and the new pet, in ONE banner above the step winner. Three ways this fails silently and none of them throw: a creature that never decodes (graded on naturalWidth after an awaited decode, because an empty box measures perfectly), the banner growing until it pushes the ring further down than the 275px banner stack it replaced did (bounded against 1133 / 973, measured on 6212e75), and the copy clipping (scrollWidth against clientWidth, not a character count). Both viewports, because the ten words and the three figures fail differently at 320 than at 393. SETUP refuses to grade anything unless Today rendered AND the banner is on it, and the two ROUTE rows drive the real buttons because the whole point of the two halves is that they land in two different places
  /* 'nudge-skip-audit.mjs' guarded the first-meal nudge's "Not right now"
     button. Both are gone (Tom, 2026-08-22: "remove the 'start with breakfast'
     button that's there"), so the audit went with them rather than being left
     to grade a screen that can no longer render what it measures. */
  'today-container-audit.mjs', // the day is ONE container and a PAST day is not a stripped one: the orphan day-nav row cannot come back, every day-scoped section is DOM-nested inside .dayblk, a past day keeps the same sections today has, quests sit directly under the four doors with no nudge above them, and a day change preserves scroll (refresh(), never route())
  'wardrobe-reset-audit.mjs', // the Wardrobe's "Take it all off": a player suggested one tap that clears the Bonehead so a new outfit starts from nothing, and Tom approved it. The feature is four lines and the RISK is everything: a button that touches worn cosmetics sits one careless line from touching OWNED ones, and a reset that bins a legendary somebody paid for is not a bug you apologise for. OWNED compares the `inv` store ROW BY ROW rather than by count, because deleting a legendary and adding a common leaves the count alone; STATS and GEAR pin that `gearloadout` never moves and that a slot holding a statted piece keeps BOTH its stats and its art, since the two desyncing is how a look change silently becomes a power change; PET pins slot C and petWear (v423); FITS pins the saved outfits; FREE pins the paid-look receipts, because paidLooks() grandfathers v221-era purchases from the LIVE transmog map and clearing that map without banking first re-charges dust for a look already owned. Driven through the REAL chip, tapped twice (ARM proves one tap does not commit), on a seeded save that is genuinely dressed: CONTROL fails the run if fewer than six slots were on, because "every slot is empty now" passes perfectly on a naked Bonehead. Eleven cp -R mutations, list in the file header

  'idle-perf-audit.mjs',     // a cinematic plays ONCE and a settled screen does no per-frame style work. Two things Tom measured on v422 and approved: Gwart's 2.4s entrance on Today restarted on every arrival because Today is rebuilt by innerHTML, and zEnterCine animates `filter`, which no compositor takes (871 style recalcs / 115ms across three arrivals, against 376 / 57ms once it plays once a session); and .blip-dot.rare animated `box-shadow` infinitely, so a settled Boneyard cost 119.9 style recalcs per SECOND, forever, for one 13px dot, while every other settled surface measured 0.0. The cost is per-screen and not per-element (1 element = 119.9/s, 16 = 119.9/s, measured both ways), so one dot was worth the change. The entrance is graded on LIVE zEnterCine animation objects, not on a recalc window and not on sampled motion, and BOTH of those were built and thrown away first: a recalc window only separates the two states after the talk box stops typing, which depends on a randomly picked line's length, and real-time frame sampling turned out to be measuring route()'s reveal fade, scoring 100.00% on a first arrival and 0.56% on every later one no matter what the app did, with `visibility: hidden` on the whole scene passing at 100.00%. Seeking the animation instead reads perfectly on the main thread and moves 0.014% of the plaque, because headless keeps the composited opacity it already had. So ONCE counts the objects the app's own render created and SCENE grades decoded pixels for the half pixels are good for: the plaque is still DRAWN (>= 15% ink, sources decoded), so "play it once" cannot be satisfied by deleting him. IDLE grades a rate whose healthy value is 0.0-3.5 and whose broken value is 119.9, ceiling 20; METER injects a real box-shadow loop into the live page every run and requires the same meter to see it, so the zeros cannot be a blind probe. KNOWN_HOT carries Gwart's Emporium at 119.9/s with a date, a number and the four dodges that were measured and failed, and it is an assertion in BOTH directions: a listed screen that stops being hot fails this row, so the exemption cannot outlive its bug. Self-serving, measured 106s, 6 checks. Proven red five ways in cp -R trees, each reddening EXACTLY one row: the `seen` class dropped from renderToday (ONCE, 3 of 3 arrivals carry one), the .wz-enter.seen rule deleted (ONCE), the scene hidden i.e. "fixed" by deletion (SCENE at 2.9% ink, with ONCE green, which is why both rows exist), the rare dot put back on the box-shadow keyframe (IDLE at 120.3/s), and the injected probe neutered (METER at 0.0/s). FAST because Today is the app's default screen and the Boneyard is where the phone gets warm
  'today-peek-audit.mjs',    // the Today status column and the scroll peek, both of them things Tom asked for three times: the currencies at the TOP of the screen with Gwart UNDER them, and a card genuinely half on the screen at the bottom edge so a player knows there is more ("i have a feeling they wont know unless we show half a banner width or something to make them go look"). Measured on the shipped tree before the change, the first card below the doors cleared the fold by 60px at 393x852, by 1.2px at --sat 59, by 14.8px at 320x568 and by nothing at all with an inset there, so the peek is arithmetic against the fold rather than a tuned height and this is what stops it drifting back. Four configurations, both widths and both insets, and the peek is asked of SOMETHING with a card's shape rather than of the hype banner by name, because which card lands there depends on the account. The rows that are not ORDER or PEEK are the ways those two pass on a broken screen: an empty plate orders perfectly (GWART grades his ink off the render plus a decode on the sources), the peek is cheapest to buy by shrinking the hero until the Bonehead is a thumbnail (FIGURE floors the stage per viewport, rule 11), and the plaque is drawn OVER the figure so a collision is invisible in the composite (CLEAR differences the figure against a frame without it and pins both animations to their worst frame). PLATE and TEXT pin two corrections Tom has already had to make once: #d5c8b0 is his "split the difference between A and B", and --text must still be #f2e9d7 because the plate hex and the talk box's type colour were the same string. FAST because Today is the app's default screen and every one of these is a one-line revert
  'gwart-guide-audit.mjs',   // Gwart is the one place answers live, and he is tappable everywhere he stands. Tom, 2026-08-22: "ectoplasm needs an explanation the transmute thing as confused almost all of my friends... clicking on gwart should take you to an explainer FAQ page". REACH-TODAY and REACH-SHOP drive real mouse clicks at both surfaces he is drawn on; COVERAGE is the static half those two structurally cannot do, requiring every gwart.png draw site in js/app.js to sit inside a control that opens the Guide, so a third Gwart panel added next month with no tap fails before it ships. ENTRIES and INK are why the rest mean anything: an EMPTY sheet opens, scrolls and dismisses flawlessly, so the launch set is asserted by id AND the open sheet is scored for paint off a real screenshot. TRUTH is the row that outlives this branch: it reads TRANSMUTE out of js/cooking.js at run time and requires the Transmute entry to still name that cost, that yield and that cooldown, so re-costing the transmute goes red until the words are rewritten. Nothing in it is pinned copy. DEEPLINK drives the real Kitchen and the real "What is this?". FAST because Today is the app's default screen and the plaque is on it. Self-serving, measured 34s, 20 checks. Proven red two ways, list in the file header
  'mage-audit.mjs',          // the Live Wire on every surface he belongs on
  'art-resolution-audit.mjs',  // no gear art drawn above the resolution Cam's masters actually carry, and no nearest-neighbour on continuous-tone art
  'fight-layout-audit.mjs',  // the fight screen holds still
  'batch-audit.mjs',         // Cam's FX, the two-enemy read, the result screen
  'teaser-fire-audit.mjs',   // the drop announcement fires from BOOT, not by hand
  'error-telemetry-audit.mjs', // crashes queue, and never leave a test device
  'contrast-audit.mjs',      // Walt gave it an exit code; it could not fail before
  'year-readout-audit.mjs',  // Walt: every Year bucket names a DIFFERENT month
  'notif-audit.mjs',         // Notification tiers do what they say (measured, not toggle-position); boot-asker webdriver-skip guard behaviourally verified
  'notif-tier-audit.mjs',    // Essentials is a bounded strict subset of Everything, the toast copy is graded against the DEVICE QUEUE both ways, fully off queues nothing, and every notifyNow call site names its kind
  'petlevel-audit.mjs',      // openPetLevelUp: sheet renders + PWR/HP/REF deltas match petBattleStats between prev and cur, + no re-open on repeat
  'backup-roundtrip-audit.mjs', // Settings YOUR-DATA export/import: seven stores, deep-equal round trip, findings for the toast-count undercount and the non-transactional import
  'wheel-audit.mjs',         // daily spin appears + double-dip refused + each of five silent-retirement gates named + every label/icon rests upright across five pinned landings (net rotation composed from real matrices, flip-band landings in the sample)
  'den-ceiling-audit.mjs',   // every kind of boss raises the Gauntlet ceiling, or none do
  'health-intake-audit.mjs', // Apple Health intake: parseHkPayload happy + rejection, syncFromClipboard writes valid + drops malformed, overlay preserves manual sleep, and a stale clipboard re-synced across a day rollover never counts the same walk twice
  'redeem-audit.mjs',        // Settings REDEEM A CODE: rewarded-actions SOP applied to redeemCode (first grants, second pays 0, invalid rejects, dupe branch reachability)
  'redeem-dupe-audit.mjs',   // redeeming a code for a species you ALREADY OWN: the stacked copy gets its own toast, and the dead consolation copy stays dead. Same Settings surface as redeem-audit above, self-serving, 23s. Prove-red: revert either half of the fix and PIN-1 goes red on two byte-equal toasts
  'weight-edit-audit.mjs',   // Log weight (kg + lb conversion) + entry edit/delete: real UI clicks, deep read-back
  'gate-audit.mjs',          // hunts guards that cannot fail: belongs in every run
  'selector-audit.mjs',      // a query nothing emits: the .pit-sect class of dead guard
  'lb-memory-audit.mjs',     // the board defers its art: 312MB in one open killed the WKWebView renderer
  'log-write-failure-audit.mjs', // a failed save must not look like a saved meal
  'freeze-reveal-audit.mjs', // a backgrounded app must not come back invisible: rAF does not run in a frozen page
  'screen-sweep.mjs',        // no screen renders blank or throws
  'crash-guard-audit.mjs',   // a '%' in the URL fragment must not brick boot; a dead network must not freeze the name-builder Save button; the vault diagnostic must not call an unreadable vault "empty"
  'crate-palette-audit.mjs', // the nine authored 48x48 crate frames render as the authored pixels: EXACT against the source PNG upscaled 3x nearest-neighbour, PALETTE, SCALE, ALIGN, MOTION, and a CONTROL row so a blank screenshot cannot pass by having nothing to compare. Landed with v388 and belonged to no tier, which failed the coverage assertion below before a browser started. Self-serving, 19s, 8 checks, green on four consecutive runs of fc9bb0f
  'xp-cap-audit.mjs',        // a repeatable action cannot pay forever: STATIC (no award() key built from a clock or a random source, so the bug class is caught in sources that do not exist yet) plus CAP, ROLLOVER and CONTROL driven through the real awardCapped against a real IndexedDB. Landed with #29 and belonged to no tier. Self-serving, 16s, 11 checks, green on four consecutive runs of fc9bb0f
  'purchase-firewall.mjs',   // COSMETIC ONLY: coins must never reach a statted item (Tom's call, locked 2026-08-07). The rack is the first surface where a player spends a balance on an item, and grantCosmetic sits eleven lines from grantGear in the same module taking the same shape of argument. Two halves because each is blind to the other: RUNTIME measures inv / gearloadout / equipped / looks / paidlooks and both balances around a real buy driven through buyRackItem against a real IndexedDB, STATIC fails on any reference from the purchase path to grantGear, grantCrate, buyWeapon, equipGear, db.put('inv', kvSet('gearloadout' or kvSet('equipped'. It also pins ONCE (a second buy pays nothing, sequentially AND with three concurrent callers) and WEAR (a bought look is free to wear, graded against a negative control in the same slot so a transmogPrice that returns 0 for everything cannot pass). FAST because this one spends the player's money and every failure it catches is silent from the UI. Proven red four ways on this tree: a gear grant in the purchase path (7 FAILED), the paidlooks write deleted (3 FAILED, and the player is charged 60 dust for a look they bought), a kvGet/kvSet claim (2 FAILED, 3 concurrent callers charged 7,200 for a 2,400 item and got three grants), and paying before the claim (1 FAILED, 7,200 charged for one grant). It also drains the reroll ladder to exhaustion, because a spend with no ceiling is the other way this screen takes unbounded money: each rung charges exactly its price, the total is 2,000 coins, and a refused reroll spends nothing. Self-serving, measured 25s, 28 checks
  'admin-grant-audit.mjs',   // the make-good channel, at the end of the chain: a grant row on the server is not a lizard in the player's Stable. Drives the REAL ingest (social.__testApplyGrant) and asserts the granted species arrives in BOTH places ownership lives, that the payload moves no coins/dust/XP, that the companion the player CHOSE is not displaced, and that the same key delivered twice mints one copy, sequentially and concurrently. Its KEEPS row is why it is FAST rather than full: it walks every store either side of the grant and requires every pre-existing row and every kv container entry to survive, so the day this channel gains an arm that overwrites something instead of adding to it, that is a red row and not a support ticket. Self-serving, measured 17s, 9 checks plus 3 controls. Six prove-red modes in its header, all run
  'reward-sop-audit.mjs',    // every paying action against the rewarded-actions SOP: COVERAGE derives the paying call sites from js/*.js (158 sites in 53 actions across 44 modules) so a NEW payout nobody registered fails, UNDRIVEN prints the 34 registered-but-not-driven actions with their reasons every run, and REPEAT performs 20 actions twice against a real IndexedDB, sequentially AND concurrently. NO-OP pins the other half of a kv-backed claim: an action that decides nothing is owed must not write over the record it consulted, which every REPEAT row is blind to because the second attempt correctly pays nothing while destroying the record on its way out. Self-serving, measured 21s, 75 checks, green on the reconcile branch. Fast rather than full because it is the guard for the class that has now shipped three times, and every one of its eleven reintroductions was proven red on this tree
  'garden-closed-audit.mjs', // the Hollow and the Bone Garden are off the player's path and the Kitchen stands alone without them: every known entrance (the GROW door, the compost button, the Today ripe-crop banner and its CTA, the Kitchen badge, the speech lines, the boot popup, the News row, two quests, the seed on a map collect) operated on a real boot, plus a Kitchen with ZERO seeds and ZERO plots that renders, names the Boneyard, routes there and really cooks a dish. Its CONTROL row opens the Hollow through window.__openHollow first, so it is grading closed doors and not a deleted feature; the ripe-crop rows are graded on a save seeded with three ripe crops, because on an empty save they are absent on main too. Proven red at 405b5df: 26 FAILED. FAST because every row is a player-facing route and the whole suite is a list of ABSENT selectors, which is the class that rots into a vacuous green
  'garden-retire-audit.mjs', // the garden's closing payout pays EXACTLY once. It refunds up to 5,500 coins on BOOT, which is the shape a coin printer is made of. PAYS asserts specific non-zero numbers first so the no-op rows cannot be vacuous, then ONCE, ten repeats, a real page reload and three CONCURRENT callers each measure the coin and ingredient deltas. Proven red three ways at 405b5df: absent function (1 FAILED), an unguarded payout (10 FAILED, +16,500 coins on the race), and a non-atomic kvGet/kvSet ledger that passes ONCE and BOOT and still prints 16,500 coins on the race (4 FAILED)
  'tab-chip-audit.mjs',      // the selected tab chip stays inside a BAND, because both directions are failure: a FILL ceiling (the solid coral fill made navigation 89.8% saturated by its own area, louder than every product on the Shop) and, against over-correcting, floors on dE76 separation, greyscale ring contrast and 4.5:1 label contrast selected AND unselected. Empty is a failure: all 8 states (4 tabs x 2 viewports) must yield a selected chip and three siblings before a number is graded. Takes the gate URL via argv (env.URL second), measured 23s. Proven red four ways on pristine a181b1f: the shipped fill (FILL 89.8%, TEXT 2.39:1, RING 1.25, ARIA), a neutralised selected state (MARGIN 1.2, RING 1.00), and a removed chip row (SAMPLE 0/8)
  'tray-destination-audit.mjs', // the four bottom-tray buttons are four DESTINATIONS, and a tap on one always lands there. Tom, v421: "if i tap on the bottom bonehead icon on the home tray when im in shop it does nothign. bonehead and wardrobe are not the same part of the app but they act like it sometimes based on clicks." Root cause measured, not guessed: bindTabs() navigated by ASSIGNING location.hash, and assigning a hash its current value fires no hashchange, so route() never ran; the hub's chips move the SURFACE without touching the hash, so from inside the hub the hash reports where you came IN. Same tap, same Shop screen, opposite outcomes depending on whether you arrived by chip (#/bonehead, dead) or by deep link (#/shop, works). Grades the whole 8x4 matrix: eight start surfaces including all four hub siblings, four tray buttons, a REAL mouse click at each button's centre (godmode's own note: programmatic .click() does not reach some handlers) hit-tested with elementFromPoint first. Cannot pass blind: EXCLUSIVE requires each landing to match EXACTLY ONE of four surface predicates, so a blank screen (zero) and an over-broad predicate (two) both fail before LAND is graded, and every start surface is asserted reached before its tap. Proven red four ways on this tree: the shipped bindTabs restored (EXCLUSIVE/LAND/BONEHEAD, the three hub cells landing NOWHERE), a predicate forced true (EXCLUSIVE), a lid over the tab bar (HITTEST plus four more), and a broken chip reach (SAMPLE). FAST, 8 checks, measured 150s: it is the bottom navigation, every screen has it, and the fix is one line in the one handler every tab shares
  'dvh-fallback-audit.mjs',  // a browser that cannot parse dvh must still reach the tab bar: #app carried no height fallback, which put the navigation 2173px below the fold on Today. 24s: static coverage of every dvh/svh in the sheet, plus four boots
  'overscroll-wordmark-audit.mjs', // the Today overscroll wordmark is INVISIBLE until you pull: REST (zero ink pixels in the band at scrollTop 0, and the band byte-identical with the feature on and off), CLAMP (the engine refuses a negative scrollTop, which is why ordinary scrolling can never reach it), ABOVE, TODAY (present on Today and on none of five other screens), NO-SHIFT (all 556 element rects identical with the mark present and absent, animations frozen first and the freeze proven, because Today's idle Bonehead really does move 31 of 400 rects on an untouched tree) and INK (the revealed mark composites to rgb(142,135,126) against --text-3's rgb(143,133,120)). It does NOT test the rubber band and says so at the top: iOS overscroll is a WKWebView behaviour and no headless Chromium bounces. MECHANISM is the closest honest proxy and the row that matters most: displaced on screen, the mark's ink moves up by exactly the scroll delta, so it is proven to live in the scrolled content layer that a bounce translates. A mark that had drifted onto the viewport would sit still under a pull and reveal nothing while every other row here stayed green. Self-serving, measured 34s, 18 checks. Proven red five ways: a positive `top` (4 FAILED), position: fixed (1, and silent to every other row while the feature would be dead on the device), the class dropped from the selector so every screen gets the mark (1), opacity 1 (1), and route()'s classList.toggle deleted (7). The third of those is why TODAY grades the PAINTED pseudo-element and not the class: the first version required both, route() still applies the class on Today, and the selector rewrite that put the wordmark on all six screens left the row green at 18/18
  'talkbox-audit.mjs',       // the typing dialogue box on Today, which is the app's one talking surface and sits on the default home screen. Four pins, all on PIXELS off the box's own clipped rect because a computed style reads a visible caret off a frame nobody painted: TYPE (the ink takes 14+ intermediate amounts, so a print-at-once cannot pass, cross-checked against the DOM prefix sequence), SKIP (a real mouse click MID-LINE completes the line, with a precondition row that refuses to grade unless the tap landed between the first character and the last, and both wrong answers pinned: a no-op AND a restart), EXCLUSIVE (across every frame of a held box, never a caret and a chevron at once, which is the box saying "wait" twice) and REDUCED (every one of 39 fast samples already carries the whole line, and the caret detector that fires on the animated run sees nothing). Carries four controls because three of its rows assert a ZERO and that is the shape which passes on a blank frame: CONTROL-CARET and CONTROL-CHEVRON require each detector to fire somewhere, and CONTROL-ISOLATION requires the caret region to score zero on a finished box that HAS a name label in the same #a5e847, so a caret count is a caret and not the speaker's name bleeding in past the 2-degree rotation. Plus HITTEST in both directions (anti-regression rule 6: the box owns its centre while the line is live or it can never be skipped, and hands it back once a self-dismissing line is done or it eats a 42%-wide Backpack target) and COVERAGE, which derives the graded set from js/*.js so the NEXT chat bubble converted to a talk box fails this audit until it is driven or excused. Self-serving, measured 24s, 40 checks. FAST because it is on the app's first screen and because being unable to hurry a talking box along is, in Tom's words, the single most irritating thing about this pattern
  'gwart-crate-audit.mjs',   // and the wizard who talks through that box does not say the same THING all session: the unopened-crate reminder fires ONCE per app open. Tom, 2026-08-22: "If you have an unopened crate it's all Gwart talks about that many reminders is annoying." The crate bucket is gwartPool's top early-return, so a crate sitting in the bag swallowed every other state for the whole session. Grants a real crate through grantCrate, reloads so the session under test OPENS with it (the cap is module state, which is what "per app open" means), then taps the plaque ten times with real mouse clicks and reads the box's own data-tb target line. Graded in BOTH directions, because a cap that silences him is not a fix: ONCE and ONCE-TAPS bound the reminder to the opening line, VOICE requires the ten taps after it to come back from the rest of the catalogue. CONTROL is the blind-detector, requiring the opening line to BE a crate line, so a seed that never reached Gwart or a CRATE_LINES that drifted fails by name instead of letting ONCE pass on an empty search. Proven red on the pre-fix js/app.js in a git-archive throwaway: 11 crate lines out of 11 sampled, all ten taps, 0 other lines. ~25s
  'tab-doubletap-audit.mjs', // double-tap the tab you are already on: Today scrolls to the top, the Boneyard recentres via the map's OWN #mapRecenter. Tom, 2026-08-22. The guard is the risk, not the two actions: a same-tab tap route()s, and route() rebuilds the screen, which on the Boneyard tears down the live map the second tap is meant to move. Every tap is a real mouse click on the real bar, and each position row is PAIRED with an identity row (a dataset marker on the rendered child, an expando on the map instance) because on the broken tree both position rows pass for the wrong reason: a rebuild also lands at the top and also reopens centred on you. TODAY-SINGLE is the control that a lone same-tab tap still re-routes exactly as tray-destination-audit requires. FALLBACK pins the no-map case (a tray tap that does nothing is the complaint bindTabs' header answers) and STALE pins that leaving a tab inside the 300ms window builds the next screen once, counted at the app's own window.__map assignment. Boneyard rows go UNPROVEN (97) without a live map. Proven red three ways: the pre-fix app.js, the fallback dropped, the cancel moved. ~70s
  /* THE TWO ICON-RENDER AUDITS. boneyard-icon-audit landed on main with NO
     TIER, which means the coverage assertion below has been red and `npm run
     gate` has been exiting 1 before a browser started, for the fourth time (see
     the crate-palette, xp-cap and nine-that-landed entries below). Declared here
     rather than left, because everything in this branch runs behind it. */
  'boneyard-icon-audit.mjs',    // the Boneyard map and its key draw the same pixel art at whole steps and it actually decodes. Six rows and four controls, self-serving, measured 35s green at 41 decoded pixel imgs. Its VECTOR row fails in BOTH directions on purpose: a new spawn falling back to vector is the v416 bug returning, and it went red on 2026-08-21 the moment the food-find drawing was wired, which is what took its exemption list to EMPTY. It can also exit 97 UNPROVEN when the map draws no Mystery Egg to compare the key against (two independent dice rolls: an 8% rare roll per cell per 45-minute instance, then app.js placeWalkable vetoing any anchor that snaps to no walkable ground); it declares that row by name rather than passing or reporting it as an art regression
  'pixel-art-swap-audit.mjs',   // the TEN screens the Boneyard audit does not reach, rendered: no screen draws a vector or an emoji at >= 16px for a concept that has pixel art on disk, no pixel <img> lands off a whole step, and no call site reserves space the snapped art loses more than a fifth of. Identifies a drawing by its own path data normalised through the page's serializer, never by a class name, because the defect is a SILENT fallback that looks right in source and right in the DOM: it is why 305 graded sites and a 7/7 green icon-inventory coexisted with three vector wedges on the daily wheel. Also pins the wheel's WORDS against its pictures (LABEL): each wedge's tag must be a whole word of the Shop's own label for the thing that wedge draws, resolved by hit-testing which sector <path> the word and the picture each sit inside. That is the defect a medium swap creates and no other row can see: the gold wedge came out of the swap with the right art, the right grant and the word GOLD over a picture of a bone chest. Carries TEN controls, including "all three media present", "no two drivers landed on the same screen" and "every wheel word paired to exactly one named picture", so a row for a medium the probe cannot see, or a screen a driver silently missed, fails instead of passing on nothing. FAST because this class has now shipped four separate times and Tom has found every instance of it by playing. Self-serving, measured 65s, 18 checks
  'nickname-private-audit.mjs', // the pet nickname is PRIVATE, and a leak is invisible from the UI: a nickname that reached the Crew would still render, still reload, still clear, so nothing would look broken and nobody would report it. Points the app at a fake API with social.js's own ?api= hook, drives the real controls, and reads the bytes off page.on('request') rather than grepping the source: WIRE asserts the nickname is in zero request bodies and zero URLs, with a POSITIVE CONTROL that the pet fields that ARE meant to upload were found in the same captured body, so a blind capture fails instead of passing. Also HOSTILE (a 23-char payload that really would fire, escaped at both innerHTML sites), REFUSE, CLEAR and reload. FAST rather than full because a privacy leak is silent and permanent once shipped. Self-serving, measured 58s, 58 checks
  'cloud-optout-audit.mjs',    // Settings -> Cloud backup -> Off must actually STOP THE UPLOAD, and until 2026-08-23 it did not: `cloudOff` was read in exactly one place, bootSync's RESTORE path, so the encrypted save kept going up on every boot and resume through autoSync while the toast said "your progress will only live on this phone" and privacy.html said the same. FAST for the same reason nickname-private-audit is FAST: a privacy control that silently does nothing looks identical to one that works, from the UI and from the player's side, so nobody reports it. Points the app at a fake API with the ?api= hook, presses the REAL Settings toggle, and grades the SERVER's received log rather than the browser's attempts. PREMISE proves an upload happens while backup is on, so the zeros mean something; BACKON proves the guard cannot wedge a player off backup forever, which would be the worse bug. Proven red against the missing guard (OFF: 1 PUT /backup, 116 KB, after opting out). Self-serving, ~45s, 9 checks
];

function run(file, args) {
  return new Promise(res => {
    const t0 = Date.now();
    const p = spawn(process.execPath, [join(here, file), ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    p.stdout.on('data', d => { out += d; });
    p.stderr.on('data', d => { out += d; });
    p.on('close', code => res({ file, code, out, secs: Math.round((Date.now() - t0) / 1000) }));
  });
}

/* THERE ARE THREE OUTCOMES, NOT TWO.
 *
 * This gate read every exit code as pass-or-fail, which forces any suite that
 * CANNOT run on a given machine into one of two lies: exit 0 and be counted as
 * evidence it never gathered, or exit 1 and be indistinguishable from a real
 * defect. The first is how a suite retires into silence. The second is the
 * false red that teaches people to ignore the gate, which is the failure mode
 * this file's own header is written against.
 *
 * So exit 97 is UNPROVEN: the suite ran, measured that this machine lacks a
 * property it needs, and graded nothing on that surface. See godmode.js
 * (UNPROVEN_EXIT, boneyardCapability) for how a suite is allowed to claim it:
 * only against a measurement taken in the same run, never against a hostname,
 * an env var or a hand-set flag.
 *
 * UNPROVEN IS NEVER COUNTED AS GREEN. It gets its own column in the run, its
 * own block in the summary, and it keeps the gate's own exit non-zero, because
 * a gate that could not run part of itself has not certified a release. The
 * exit is 97 rather than 1 when nothing actually failed, so the difference
 * between "the app is broken" and "this machine cannot check it" survives all
 * the way out to whatever is reading the exit code. */
const UNPROVEN = 97;
/* The suites print their own banner; this pulls it back out for the summary so
   the reason is on screen next to the verdict rather than 200 lines above it. */
function unprovenLines(out) {
  const lines = out.split('\n');
  const rows = lines.filter(l => l.startsWith('UNPRV ')).length;
  const missing = lines.filter(l => /is UNREACHABLE|no webgl|will not link|read back as|measured NOTHING/.test(l));
  return { rows, why: [...new Set(missing.map(l => l.trim()))].slice(0, 3) };
}

/* A SUITE THAT CRASHES MUST NOT LOOK LIKE A QUIET FAILURE. This printed only
   lines matching /^FAIL/, so a suite that died during boot (no assertions run,
   no FAIL lines, exit 1) reported as a blank blocker and read like a flake. Show
   the assertion failures when there are any, and the tail of the output when
   there are not, which is where the stack will be. */
function failLines(out) {
  const lines = out.split('\n');
  const hits = lines.filter(l => /^FAIL|FAILED/.test(l));
  const show = hits.length ? hits.slice(0, 12) : ['(no assertions failed: the suite itself died)', ...lines.filter(Boolean).slice(-8)];
  return show.map(l => '        ' + l).join('\n');
}

/* NO AUDIT MAY EXIST WITHOUT RUNNING. The BROWSER list above is hand-written, so
   a new *-audit.mjs could sit in tests/ forever without the gate ever calling it,
   which is worse than not having written it: it reads as coverage. Anything
   deliberately out of the gate goes in SKIP with a reason, so the omission is a
   decision on the record rather than an oversight. */
/* THE NET USED TO BE /-audit\.mjs$/, AND A FILENAME WAS ENOUGH TO ESCAPE IT.
   mockup-parity.mjs sat RED on main and no one knew: it is a real guard, it
   exits non-zero, and it was invisible here purely because it is not called
   "-audit". Fourteen other runnable checks were in the same position, among
   them balance.mjs (35 assertions on the exact exploit class we keep finding)
   and race-you.mjs. The rule above says an audit may not exist without
   running; naming it something else is not a decision, it is an accident.
   So the net is now EVERY runnable file in tests/, and the only way out is
   HELPERS, which is a list of modules that assert nothing and are imported by
   the checks themselves. A new guard is covered whatever it is called. */
const HELPERS = new Set([
  'release-gate.mjs',  // this file
  'godmode.js',        // the harness: boot, seed, serveTree
  'fight-sim.mjs',     // a sim library balance.mjs drives; no assertions of its own
]);
const onDisk = (await readdir(here))
  .filter(f => /\.(mjs|js)$/.test(f) && !HELPERS.has(f))
  .sort();
/* TWO TIERS, BECAUSE THE ALTERNATIVE IS THEATRE EITHER WAY.
   The hand-written list above was the only thing the gate ran, and 43 other
   audits sat in tests/ never executed: guards against a dust exploit, a Glutton
   farm on its third fix, literal ${...} printing in the UI, onboarding on a fresh
   profile. Not throwaways. Unrun guards are worse than no guards, because they
   read as coverage.
   But running all 53 takes the better part of an hour, and Reggie's own warning
   holds: a gate that takes half an hour gets skipped, and a skipped gate is what
   we were fixing. So FAST runs on every push and FULL is everything else, run
   before a release with `--all`. The coverage assertion below is the point: a file
   in NEITHER tier fails the gate, so a new audit cannot quietly go unrun. */
/* EVERY AUDIT NOT IN FAST IS DECLARED HERE, WITH A TIER AND A REASON.
 *   'full' runs under --all, before a release.
 *   'skip' never runs: it needs an argument, a stub, or it is a screenshot script.
 * A *-audit.mjs in neither FAST nor this map FAILS the gate, by name, before a
 * single browser starts. An EMPTY reason counts as undeclared: a blank string is
 * not a decision.
 *
 * WHY A HAND-WRITTEN MAP and not the complement of FAST. The previous version was
 * `FULL = onDisk.filter(f => !BROWSER.includes(f) && !SKIP[f])` with SKIP empty,
 * plus `const unrun = runAll ? [] : []` that nothing read. Every new file was in a
 * tier by construction, so the check had nothing to catch while its comment claimed
 * protection. Proven dead by dropping an empty tests/zzz-audit.mjs in: the gate
 * printed "52 more audits are in the FULL tier" and exited 0. Anti-regression rule
 * 1, in the gate itself. The complement cannot be computed AND have teeth. One line
 * per file is the price, and it puts each omission on the record as a decision. */
const DECLARED = {
  'boot-backfill-audit.mjs': ['full', "the first-v385-boot backfill is checkpointed, resumable and behind the paint: PAINT (#screen has content while the retroactive replay is still unfinished), RESUME (twice interrupted by a real page reload, the save still reaches the exact ledger and XP total of an uninterrupted run) and WORK (a resumed boot re-reads at most 75% of the xp store a cold one does). Seeds a 365-day diary and drives four throttled boots with reloads, several minutes, far too slow for the fast tier."],
  'xp-total-audit.mjs': ['full', "the XP running total: SHAPE (full scans of the xp store do not grow with row count across a burst of awards) plus TRUTH (the cached total equals a from-scratch recount after every award), at 900 / 5400 / 10950 rows. Seeds ~17k rows across three browser passes, about 40s, too slow for the fast tier."],
  /* FOUND UNDECLARED ON PRISTINE origin/main AT 405b5df, 2026-08-18, by replaying
     this file's own coverage assertion. Both files exist in tests/ and neither is
     named anywhere in this gate, which means the assertion below has been RED on
     main and the whole gate has been exiting 1 before a browser started. That is
     the third time (see the crate-palette and xp-cap entries below, both landed
     the same way). Declared here rather than left for somebody else, because
     every audit in this branch runs behind that assertion. Tiers chosen from what
     each file does; move them if their authors disagree. */
  'fight-hint-audit.mjs': ['full', "the move tray's hint labels fit ONE line, measured on real buttons at 375 and 393 wide: a hint two words too long silently costs a whole row off the bottom of a three-row tray. Proven red by its own header against v399 (33a2dc0). Boots and drives a loaded tray, so it is not FAST-shaped; self-serves through serveTree."],
  'version-stamp-audit.mjs': ['full', 'the three version stamps (sw.js VERSION, js/app.js APP_BUILD, js/changelog.js n) agree. Pure source reading, no browser, and it is a RELEASE check rather than a per-push one: it is meaningless until a renumber has happened, and it goes red on every branch that has not renumbered on purpose. Belongs in the pre-release --all run, next to the release ritual it guards.'],
  /* PULLED OUT OF FAST 2026-08-18, NOT BECAUSE IT BROKE. Its whole subject is
     an announcement whose CTA opens a SHEET instead of navigating, and the Bone
     Garden's row was the only one in NEWS that did that. With the row gone the
     suite has nothing to drive, and it says so honestly: its SETUP rows go red
     rather than passing on an empty sample. The guard it pins (the
     `if (sheetStack.length) return;` early exit in the news-return poll,
     js/app.js) is UNTOUCHED, and this goes back in FAST the moment another
     sheet-opening announcement ships. Leaving it in FAST red would teach people
     to ignore the gate, which is the failure this file's header is written
     against. */
  'newsrow-return-audit.mjs': ['skip', "a news story puts you back where you were, not on a sheet you never opened. Needs an announcement whose CTA opens a sheet; the Bone Garden's row was the only one and it left NEWS on 2026-08-18. Restore to FAST when another one lands."],
  'garden-sim.mjs': ['skip', 'a balance MODEL, not a guard: 30 days x 60 seeded runs of the garden against the kitchen. It reports numbers for a decision and asserts nothing about the app. tests/garden-appetite-guard.mjs is the guard that pins the outcome.'],
  'hollow-audit.mjs': ['full', 'drives the Hollow at two viewports with and without reduced motion, including a real harvest tap and the modal contract. About 90s, too slow for the fast tier.'],
  'hollow-backdrop-audit.mjs': ['full', 'renders all three time bands and hit-tests an 800-point grid to prove the backdrop takes no taps. Slow by construction.'],
  'hollow-beds-audit.mjs': ['full', 'renders every plot state and measures them apart by pixels. Slow by construction.'],
  'arena-static-probe.mjs': ['skip', 'a PROBE by its own first line: it measures whether .arena shifts when the action tray changes button count, and prints the numbers. The guard for that behaviour is fight-layout-audit.mjs.'],
  'today-d2-shots.mjs': ['skip', "capture only: the four Today states at 390x844 dark, for review. tests/today-container-audit.mjs is the guard, and it is in FAST."],
  'badges-audit.mjs': ['skip', 'seeds the four Warden badges and shoots the wall for review; a screenshot script, not a regression guard.'],
  'ledger-voice-audit.mjs': ['skip', 'shoots the ledger copy for reading, into a fixed scratch dir; asserts nothing about layout.'],
  'small-fixes-audit.mjs': ['skip', 'a one-off batch for three named fixes, kept as the record of how they were verified.'],
  'v279-audit.mjs': ['skip', 'the v279 bug batch, one check per reported bug, kept as the record of that release.'],
  'newart-audit.mjs': ['skip', 'needs a <base> argument and a mode (see tally/CLAUDE.md), so it cannot join a URL-only run list.'],
  'siege-client-audit.mjs': ['skip', 'drives sieges against a stubbed server payload; the demo profile has no online crew.'],
  /* PROMOTED OUT OF SKIP, 2026-08-12. The skip's claim was true (the farm is
     closed; re-claims measured at +0 coins, +0 xp, ledger stuck at one row) but
     its REASONING was not: unit.test.js's generalised guard is a static source
     scan, and that scan was proven blindable by an ordinary destructuring
     refactor (it passed 175/175 on a tree where it analysed nothing). Skipping a
     green, one-minute, genuinely BEHAVIOURAL guard because a static scan covers
     the same ground is backwards. It now also asserts the payout deltas, which
     is the half no source scan can do. */
  'glutton-audit.mjs': ['full', 'the Glutton farm stays closed, proven by fighting him and then re-claiming: no coins, no XP, no second ledger row.'],

  'paddock-card-audit.mjs': ['full', "the Paddock's per-copy cards: the bond reload round trip, the cap, the badge, the burst, scroll-driven dots. PROMOTE TO FAST when the Paddock ships to players; it is a daily affection surface, it is just not routed on main yet."],
  'boneyard-audit.mjs': ['full', "the Boneyard loading and its action bar; run it on any map or action-bar change. All 22 rows need a reachable vector tile host and the suite reports UNPROVEN with exit 97 without one. Measured 2026-08-17 on a container with no route to tiles.openfreemap.org it read 11 green and 11 red, and SEVEN of those greens were vacuous: three straggler rows on 0 stragglers, a beat row on 0 beats, a pop-time row on all-zero counts and two INTERACTED rows where false stays false because there is no map to interact with. Its own ARRIVAL-SLOW latency row carries the `stragglers.length > 0` empty-sample guard and went red correctly; the identical ARRIVAL row one section up never got that guard."],
  'endless-look-audit.mjs': ['full', 'the Gauntlet equips the roster face pit.js chose: rank 51+ was 0% approved monsters.'],
  'pit-cap-paths-audit.mjs': ['full', 'every boss-shaped claim path either raises the Gauntlet ceiling or is excluded by name.'],
  'mimic-audit.mjs': ['full', "the Mimic: a chest that is not a chest, its reveal, and both new drawn bosses in the Gauntlet. "
    + 'Run it on any change to js/mimic.js, the Boneyard chest spawn, or the drawn-boss list in js/pit.js. Full rather than fast '
    + 'because it boots the Boneyard and drives a real reveal, whose animation IS assets/bh/mimic/mimic-loop.gif: without that '
    + 'file precached the chest never opens, which is why sw.js carries it. Its REVEAL section also owns the half of the feature '
    + 'that is a JUDGEMENT: Tom asked for the Wanderer\'s encounter "but not quite as intense", so the SMALLER rows turn that into '
    + 'measurements off a CDP screencast of the real overlay over the real lit app: no choice at all, a scrim bounded on BOTH sides '
    + '(a full blackout fails it, which the prove-red caught), a sequence that only ever darkens so a strobe cannot creep in, and a '
    + 'length under 60% of the Wanderer\'s own exported constants. COVER and HANDOVER are the quiet pair, the same shape as the '
    + "Wanderer's: the overlay hands over on a black frame it still owns, and app.js builds the arena before it lifts it."],
  'wanderer-boneyard-audit.mjs': ['full', 'the Wanderer outdoors, the map\'s only PATROLLING agent: his position and heading are a pure '
    + 'function of (date, cell, clock), so a 5-second refreshWorld cannot teleport him, a second device computes the same metre, '
    + 'and closing the app cannot reroll him off your back. Purity is proved in a SECOND browser page with its own module realm, '
    + 'the heading against the real path bearing, and the cone with the player inside it and outside it on both axes, then read '
    + 'back out of the paint function so the drawn wedge and the wedge that catches you are one shape. '
    + 'Run it on any change to js/wanderer.js or refreshWanderer / the wanderer settle branch in js/app.js. It also pins '
    + 'the ceiling decision: a Boneyard Wanderer mints NO bossfirst marker, so five wins move endlessCeiling by 0, with the '
    + 'Glutton driven in the same session as the control that the instrument can move at all. Full rather than fast because it '
    + 'boots two pages and claims against the real IndexedDB; about 30s.'],
  'marker-anchor-audit.mjs': ['full', 'EVERY MAP MARKER LANDS WHERE MAPLIBRE PUT IT. MapLibre places a marker by writing a transform '
    + 'onto a root it has already taken out of flow, and that rule (.maplibregl-marker) is ONE class, so any other one-class rule naming a '
    + 'marker root that lands later in the head wins and puts the element back into normal flow. Nothing throws: the marker draws, it is '
    + 'the right marker, it is simply on the wrong ground. Found 2026-08-23 on the Wanderer, whose stylesheet is injected at runtime and '
    + 'so landed after the lazily-loaded maplibre-gl.css: absolute siblings take no space, so the FIRST Wanderer was correct and every one '
    + 'after him stacked by his own height, measured 0/200/400 offsetTop with three up, which is 238 m and 474 m of ground. His cone and '
    + 'inWandererCone use his true position, so the light a player could see was not the light that caught them, invisible whenever only '
    + 'one is in range. ANCHORED grades every marker on the screen against MapLibres OWN transform (anchor percentages and margins '
    + 'included), GROUND unprojects the drawn box and compares it in metres to the position js/app.js handed the marker, and CONTROL puts '
    + 'the bug back from a later stylesheet mid-run and requires the instrument to report the stack, so a green ANCHORED cannot come from '
    + 'a measurement that is blind. The static half runs anywhere: the marker-root classes are DERIVED from POI_CLASSES in js/map.js, no '
    + 'runtime-injected stylesheet may give one of them a position MapLibre did not ask for, and ORDER pins the premise that lets app.css '
    + 'keep its relatives (it is a head link, so the appended vendor sheet always wins). Needs WebGL and a tile host; reports UNPROVEN with '
    + 'exit 97 rather than green without them. Four mutations proven red, listed in the file header. About 60s.'],
  'wanderer-patrol-live-audit.mjs': ['full', "the Wanderer's TRIP WIRE, fired for real: the sibling suite proves his derivation, his cone geometry, "
    + 'his ledger key and the ceiling by calling the module, and none of that can see the thing the feature actually IS, which is a GPS '
    + 'fix arriving on the open Boneyard, landing inside a cone nobody tapped, and a fight starting on its own. Two boots of the real app '
    + "with the device position overridden off his REAL heading: 45 m behind him he is drawn and lit and nothing happens, 45 m into his "
    + 'light the arena opens on his name. Each boot is the other\'s control. Run it on any change to refreshWanderer, the geolocation '
    + 'watch, or the cone. MapLibre needs WebGL and vector tiles, so on a machine with neither it reports UNPROVEN with exit 97 by name '
    + 'rather than green, the same contract boneyard-audit.mjs runs under. About 60s.'],
  'wanderer-arena-audit.mjs': ['full', "the Wanderer LOOMS in the Pit, and nothing else on that stage moved. Tom's mockup has him filling the "
    + 'arena with the player small at the bottom left, and the gap is the design rather than the size. Every row is measured off the '
    + 'INK, never the stage box: his plate is a 640-square whose drawing occupies 562x417 of it, so 35% of the element is transparent '
    + 'and its rect says nothing about what he covers. Graded at 393x852 AND 320x568 because the arena height is a clamp on the '
    + 'viewport and those are two genuinely different boxes (330px and 283px). It also PINS the three other drawn bosses: the Mimic is '
    + 'held to the default stage, exactly the player\'s size, because he is a chest that bit you and not a wall, and the player is only '
    + 'scaled down in front of the Wanderer. Needs no map: it drives window.__denFight with wanderer:true, which is the field the arena '
    + 'class, the stage class and the plate all key off. Run it on any change to .arena.boss-wanderer, #foeStage.wanderer-foe, .fstage '
    + 'or the arena height. About 40s.'],
  'pit-figures-audit.mjs': ['full', 'the three figures in the Pit, graded in PAINTED pixels rather than boxes: hide one element, screenshot, diff, '
    + 'and what changed is what that element paints, shadow and halo included. It exists because four of Tom\'s complaints in one message '
    + '(2026-08-22) were each invisible to a getBoundingClientRect: the Wanderer overlapping the bonehead by 78.5px of ink while both '
    + 'stage boxes looked fine, Bumbleseal drawn 22% taller than the pet in the middle of the roster because croppedPetImg fills against '
    + 'the LONGEST ink edge, a rarity drop-shadow painting 350 warm pixels outside her silhouette, and a mirror that changes no box at '
    + 'all. 25 rows at 393x852 and 320x568: CLEAR, LOOMS as a BAND with the Live Wire measured as its floor, FILLS, TAIL (proportion AND '
    + 'a margin clear of the arena wall, because an uncropped tail is sliced by the container and keeps the right proportion), INSIDE, '
    + 'STANDS, PET-MASS, PET-GLOW, PET-FACING, PET-UNTOUCHED and MAGE-UNCHANGED. Every loop in the arena is frozen and the toast removed '
    + 'before any diff, or the mask comes back as the whole arena. Run it on any change to .arena.boss-wanderer, #foeStage.wanderer-foe, '
    + '.fstage.petmini or petFightPx. Needs no map. About 100s and ten seam fights, so full rather than fast.'],
  'wanderer-water-audit.mjs': ['full', "the Wanderer is BOUND TO LAND, and every device has to agree where. Tom, 2026-08-22: "
    + '"The wanderer is out in the lake where I am right now. He shouldn\'t be." wandererAt was pure math on a lat/lng grid, so a cell '
    + 'over a lake put his whole loop on the water; js/water.js classifies a point against the basemap\'s own z14 vector tiles and the '
    + 'derivation walks a seeded fallback of beat centres until the lap is dry. The lake is the easy half. The half that could ship a '
    + 'worse bug than the lake is DISAGREEMENT, because a water answer that moves with the zoom, the viewport or whichever tiles happen '
    + 'to be loaded puts two friends\' wanderers in two different places, so the determinism rows are the headline here and each carries '
    + 'a control: four cold child processes fetching tiles again in four different ARRIVAL ORDERS derive the same men byte-for-byte, an '
    + 'evicted-and-refetched tile re-answers identically, and MAP-STATE classifies one fixed grid with the real MapLibre map parked at '
    + 'four zooms and centres while CONTROL-MAP-STATE requires queryRenderedFeatures to DISAGREE with itself across those same four, '
    + 'which is the hazard measured rather than asserted. LIVE is the end of the chain: the Boneyard open on a waterfront position picked '
    + "at run time for today's seeds, the marker THE MAP DREW unprojected off its own centre and classified, with the same nine cells "
    + 'under the legacy derivation as its control. Needs the tile host, and the browser rows need a drawable map; both report UNPROVEN '
    + 'with exit 97 by name rather than green. Full rather than fast: four child processes and a browser boot, about 140s.'],
  'wanderer-despawn-audit.mjs': ['full', 'a beaten Wanderer is GONE from the Boneyard and the next instance still walks. Tom, 2026-08-22: '
    + '"after defeating the wanderer he was still just there in the boneyard and didnt disappear." wandererDone gated the encounter but '
    + 'never the marker. Fired for real: a GPS fix 45m into his real cone, the encounter it triggers, Fight, and the win resolved through '
    + 'window.__bhFight.finish rather than a dispatched event. Markers are matched BY ID off el.dataset.w, because the first cut graded '
    + 'distance to a projected point, could not reach the map object and passed on null. Five rows: BEFORE (the positive control), '
    + 'DESPAWN (gone while the module still derives his instance as live, so a rollover cannot pass for a despawn), LEDGER, NEIGHBOURS '
    + '(the Wanderer nobody beat is still drawn) and NEXT (the clock moved one lap, a new instance on an unclaimed key, the beaten key '
    + 'still on the ledger). Needs WebGL and vector tiles, so it reports UNPROVEN with exit 97 rather than green on a machine that cannot '
    + 'draw the map: full, never fast.'],
  'wanderer-patrol-sim.mjs': ['skip', "a MEASURING INSTRUMENT, not a pass/fail check, the same shape as gauntlet-sim.mjs: it prints "
    + 'catches per hour of walking against the Wanderer at a sweep of cone ranges and asserts nothing about them, so running it on '
    + 'every gate would burn a minute to prove nothing. Run it BY HAND whenever CONE_RANGE_M, CONE_HALF_DEG, WANDER_LAP_MIN or the '
    + 'cell size changes. It is where the shipped 300 m came from: 90 m measured 0.12 catches/h and 88% of hour-long walks meeting '
    + 'him not at all, which is a headline feature nobody meets. It imports the real js/wanderer.js and its FIRST line is a control '
    + 'that its own range-sweep cone agrees with inWandererCone at the shipped range, because a sim with a private copy of the '
    + "geometry measures the copy. Exits 1 if that control fails."],
  'gauntlet-sim.mjs': ['skip', "a MEASURING INSTRUMENT, not a pass/fail check: it prints win rates and asserts nothing, "
    + 'so running it on every gate would burn minutes to prove nothing. Declared skip rather than hidden in HELPERS, because '
    + 'HELPERS is for modules the checks themselves import and nothing imports this one. Run it BY HAND whenever a Gauntlet '
    + 'multiplier, a talent tree or a drawn boss changes. Its own header records why it exists: the Mimic was specced at 1.05x '
    + 'and measured 12.0% player win against 28.8% for an ordinary rung, and the Wanderer was specced at 1.22x to sit above the '
    + "Glutton's 1.18x and measured EASIER than him. Reading the multiplier is not the same as knowing the difficulty."],
  'boneyard-icon-audit.mjs': ['full', "the Boneyard and its map key draw the same pixel art at whole steps, and it decodes. "
    + 'Run it on any change to pixCur, crateIcon, the map key or the marker sizes. It is full rather than fast because it '
    + 'boots the Boneyard map, so it wants the same reachable vector tile host as boneyard-audit. '
    + 'It has an UNPROVEN exit as of 2026-08-21, but only for the Mystery Egg sample: when no rare spawn in the running '
    + "45-minute instance survives app.js placeWalkable's veto, the map draws no egg, and the row is declared by name and "
    + 'the suite exits 97 instead of exiting 1 with an art-regression message about a placement outcome. '
    + 'STILL WORTH FIXING SEPARATELY: unlike boneyard-audit it carries no capability probe, so on a host with no route to '
    + 'the tile server its CONTROL rows are the only thing standing between a tile-less run and a vacuous pass.'],
  'purchase-write-failure-audit.mjs': ['full', "a rejected write during a rack purchase must not cost the player the coins AND the piece. "
    + 'Run it on any change to buyRackItem, grantCosmetic, markPaid or the db write paths. It makes the real db.addIfAbsent reject '
    + 'for the one row grantCosmetic writes, which is what quota, abort and the wipe-protocol freeze do to that same call, so no app '
    + 'logic is stubbed. Proven red on origin/main c3b7bc9 (3 rows) before the fix existed: 300 coins charged, no piece granted, and '
    + 'the retry answered owned while the player owned nothing, which made the piece unbuyable forever.'],
  'hero-share-audit.mjs': ['full', "a big pet shares the Today frame, the PAIR reads centred, and a normal pet changes nothing. "
    + 'Run it on any change to the Today hero, PET_HERO_REL, the --fig arithmetic in .hero-scene, or the bhIdle keyframes. Full '
    + 'because it equips two pets and renders the screen at five configurations. Its CONTROL row is the point: the shift composes '
    + 'through --bh-shift INSIDE bhIdle (a static translate on .hero-char is overwritten by the animation), and --bh-shift is a '
    + 'custom property, so setting it one level up walks the PET left by the same amount. Proven red both ways on 2026-08-21: '
    + 'flagging every pet as sharing reddens CONTROL, and moving the property to the scene reddens the pet-inheritance row. The '
    + 'composition rows were re-proven on 2026-08-21 against the four declarations they own; see the header of the file.'],
  'emporium-audit.mjs': ['full', "Gwart's Emporium: the shopkeeper takes the header's room, not the shelves'. "
    + 'Run it on any change to gwartHeroHtml, the .gw-* block in app.css, or the hub tab scoping. Full because it drives four hub '
    + 'tabs and reads pixels back. WRITTEN BECAUSE app.css PROMISED IT: the block ended with \"Guard: tests/emporium-audit.mjs\" '
    + 'and that file existed on no ref, which reads as covered to the next person. Proven red twice on 2026-08-21: restoring '
    + '--gw-off (the union-of-both-layers centring) puts CENTRED at 202.0 against 196.5, and hiding the floating gear without '
    + 'giving it back reddens SCOPE.'],
  'wanderer-encounter-audit.mjs': ['full', "the beat between stepping into his light and the arena: two typed lines, "
    + 'a real Fight/Flee choice, and a stepped retro zoom on Fight. Run it on any change to showWandererEncounter, the '
    + '.wnd-enc block, or startWandererEncounter in js/app.js. Full because it drives the real buttons and screenshots the '
    + 'transition. The two rows that matter most are the quiet ones: FLEE must open no fight (a prompt whose second button '
    + 'still starts the fight is decoration) and COVER must find the overlay STILL UP when the choice resolves, because the '
    + 'arena is built underneath its hold frame and tearing it down one line early brings the map back mid-handover. '
    + 'All eight rows proven red on 2026-08-21 in a throwaway tree; the mutations are listed in the file header.'],
  'device-open.mjs': ['skip', "not an audit: it is the tool that OPENS the app on a booted simulator, "
    + 'serves the tree on a fresh port and hands back the URL. Declared here because the gate refuses to start while any '
    + 'file in tests/ is undeclared, which is the assertion that has already blocked this gate four separate times. '
    + 'Running it would boot a simulator and sit in the foreground serving, which is the opposite of what a gate wants.'],
  'rebuild-lossless-audit.mjs': ['full', "re-running scripts/build-cosmetics.py must not delete, rename or "
    + 're-rarity a single item that ships today. Run it on any change to that script, to SPECIALS/OVERRIDES, or to the art '
    + 'library. Tiered full rather than pure because it shells out to python3 and rebuilds the whole catalogue against Cam\'s '
    + 'library, about a minute; it needs no browser. THIS IS A MIGRATION GUARD, NOT A BUILD CHECK: every cosmetic a player owns '
    + 'is keyed by an id in the generated file, and its name and rarity are what the game shows them, so re-running the script '
    + 'edits live inventory. Measured on 2026-08-21 before the fix: 63 items DELETED, 172 RENAMED and 3 DEMOTED, including '
    + 'Nightfall Katana going legendary to common, and the script exited 0 and printed a cheerful item count either way. '
    + 'It SKIPS with a reason when the art library is absent, because a guard that fails on a teammate\'s laptop for an '
    + 'environmental reason is one people learn to ignore. Four mutations proven red; they are in the file header.'],
  'tabbar-contrast-audit.mjs': ['full', "the tab bar's per-destination colour must not cost a label its legibility, "
    + 'nor the centre FAB its dominance. Run it on any change to #tabbar, its colours, or its padding. Full rather than fast '
    + 'because it drives all four destinations and reads the composited colours back. Contrast is computed from RENDERED values, '
    + 'not from tokens: this bar layers a plate under a glyph under a label, and a token says what was asked for rather than what '
    + 'the player got. Proven red twice on 2026-08-21: sinking one tab dim colour into the bar ground (CONTRAST, 1.07:1 on '
    + 'boneyard) and growing the tab padding until the active plate matched the FAB (FAB, 0.5x).'],
  'boneyard-geo-intent-audit.mjs': ['full', 'the map only asks for location when the player asked for the map: a self-reload that restores #/boneyard must show the button, not fire the iOS permission prompt. Run it on any change to route(), the hashchange listener, or the Boneyard auto-start.'],
  'community-audit.mjs': ['full', 'the Discord card: real invite link, plain-words copy, once from boot, lives on in News and Settings.'],
  'gift-confirm-audit.mjs': ['full', 'one tap must never send coins to another player: the gift chips arm, commit and cool off.'],
  'beta-thanks-audit.mjs': ['full', 'the beta thank-you card: real TestFlight and Discord links, the Android instruction, a hero with real pixels, once from boot, and the Crew strip opens it.'],
  'crate-advance-audit.mjs': ['full', 'tap-to-advance inside the crate reveal.'],
  'day-strip-audit.mjs': ['full', 'the day strip decides which day every food write lands on: arrows, picker, and the stored row read back.'],
  'readiness-audit.mjs': ['full', 'readiness is relative to YOUR baseline: calibrating instead of a made-up 72, a real spread between a good and a bad day, and a nap is not a night.'],
  'crate-reveal-audit.mjs': ['full', 'the crate cracks open and the lid is cut in the right place.'],
  'crate-exit-flicker-audit.mjs': ['full', "a takeover leaves STRAIGHT DOWN. sheetOut carries the -50% the base .sheet centres with and .sheet.takeover has transform: none, so every takeover in the app used to drift half its own width to the left on the way out: measured on the Common Crate at 440x956, the sheet's right edge marched from x=436 to x=338 in ~100ms with a vertical seam up to 98% of the viewport height sweeping the Backpack behind it (Tom: \"leaving a common great seems kind of glitchy on the way out\"). Graded in decoded pixels off a CDP screencast, with a MIDSLIDE control that fails unless the takeover was genuinely caught half-gone, so a frozen clock or a blank page cannot pass it. Two boots, two viewports, a real Backpack OPEN click and real pointer taps per card, about 40s: full, not fast."],
  /* WAS MEASUREMENT-ONLY AND EXITED 0 WHILE PRINTING "FINDING XP per clock
     reset 176.4". Reggie, 2026-08-17: a suite that documents a live exploit and
     reports success applies no pressure and gets scrolled past, which is the
     same failure the suite-rot entry exists to avoid. Now that the monotonic
     day guard exists (claimDay, js/db.js) everything the guard BOUNDS is a
     real assertion, and this goes red if the guard regresses.
     v397 CLOSED THE ONE THAT WAS LEFT. The forward walk was the measurement
     this comment used to say could never be asserted, at ~176 XP per reset,
     on the reasoning that Date.now() and dateKey() read the same device
     setting and performance.now() dies with the page. That reasoning ended
     "a server timestamp would work", and it does: rule 3 takes the newest day
     GET /health has been seen to report as a ceiling, with WITNESS_GRACE days
     of headroom so offline players keep playing. The walk is now asserted to
     zero past that ceiling, both sides required to differ, and section 7
     asserts the ceiling itself (wire, monotonicity, offline edge, heal, both
     import paths). No server change and no migration: /health already existed.
     STILL FINDINGS, unchanged and unfixed, so nobody reads green as clean: the
     date-seeded quest rotation is pre-computable a year ahead, the redeem-code
     one-shot is per-device kv that an erase resets, a refused day still pays
     the per-ENTRY food-logging XP, and everything here is devtools-defeatable
     client code, which the suite's closing FINDING states in full. */
  'clock-trust-audit.mjs': ['full', 'ASSERTS the monotonic day guard and MEASURES what is left. Installs a Date shim before any app module runs, and owns a loopback /health so the real API is never contacted. Asserts: a never-visited day below the high-water mark pays zero of every daily gate (quest coins, quest claims, free Pit fights, day-close crate, all-quests bonus) with any coin/crate movement attributed to a level-up or it is a leak; an honest forward day more than 20h later still pays the full day; the DAY_GRACE ceiling on BOTH sides of the edge; that an idle month banks no allowance; that the evening-then-morning player, the eastbound traveller, both NTP corrections and an existing player mid-migration are none of them refused; that a 14-day forward clock walk pays ZERO of those same gates past witness + WITNESS_GRACE while every day inside the allowance still pays in full; and rule 3 on its own terms against a loopback /health it owns (the wire, monotonicity, both sides of the offline allowance, the heal, and that neither import path can lower the ceiling). FINDINGs, not assertions: the pre-computable quest rotation, the per-ENTRY food-logging XP, and the redeem-code one-shot. Fails on an empty sample set. About 60s.'],
  'crew-fan-audit.mjs': ['full', 'the Crew fan acceptance suite, 42 checks, about two minutes.'],
  'crew-pair-audit.mjs': ['full', 'the friend and crew flow with TWO real browsers against a real Worker it starts itself: add, accept, gift, the delivery-once guard, the daily caps, self-directed cases, removal, and BOARD, the client/server contract for the three leaderboard-fed Add surfaces, asserted off the WIRE (route, field name and the server\'s own handle for that player) and carried to Crew membership on both sides; every one read from BOTH sides. FULL rather than FAST because it boots two Chrome profiles and a wrangler dev with a local D1 (about four minutes), and because a box with no wrangler cannot run it at all. Every other social audit in this directory drives one browser against a seeded fixture, so this is the only coverage of anything that needs two participants.'],
  'debuff-chips-audit.mjs': ['full', 'tapping a debuff chip explains it.'],
  'den-two-target-audit.mjs': ['full', 'two health bars in a two-enemy den; batch-audit gates the two-enemy read every run.'],
  'dust-safeguard-audit.mjs': ['full', 'one curious tap must not spend dust.'],
  'ember-cohesion-audit.mjs': ['full', 'a lit cosmetic stays lit on every surface.'],
  'faq-audit.mjs': ['full', 'the FAQ copy still matches what the engine does.'],
  'feel-audit.mjs': ['full', 'toast queue, exits, dialogs, haptics.'],
  'figure-audit.mjs': ['full', 'THE FIGURE CONTRACT, 32 checks. Mandatory per tally/CLAUDE.md before any figure work.'],
  /* THE FOUR GARDEN-DOOR SUITES BELOW ARE RETIRED, NOT BROKEN. 2026-08-18: the
     Hollow and the Bone Garden left the player's path, so every one of them opens
     a door that is deliberately gone and would report a fix as a defect. They are
     'skip' rather than deleted because the feature is PARKED, not removed: the
     modules, the art and the data all survive, and reviving it means reviving
     these. tests/garden-closed-audit.mjs is the guard that replaces them, and it
     asserts the OPPOSITE: that no door is open. suite-rot-audit.mjs is expected to
     start naming these files; that is the signal working, not a failure. */
  'garden-audit.mjs': ['skip', 'drives #doorGrow, which was removed with the garden on 2026-08-18. Kept for the revival, replaced by garden-closed-audit.mjs.'],
  'garden-intro-audit.mjs': ['skip', 'the garden intro popup no longer fires from boot (2026-08-18) and the Kitchen no longer lands on two doors. garden-closed-audit.mjs pins both absences instead.'],
  'garden-reach-audit.mjs': ['skip', 'its whole subject is REACH into the garden: the Today banner, the GROW door and the seed pouch, all removed 2026-08-18. Its one surviving row (the food-log boundary line) is not worth a boot on its own; if it ever matters again it moves to a diary suite.'],
  'glyph-audit.mjs': ['full', 'no dingbats standing in for icons.'],
  'kitchen-queue-audit.mjs': ['full', 'the cook queue fired from the real Cook button (a SECOND cook really starts with one pot in one visit, and the queued one takes the pot on its own with the dish time untouched), plus the starter-pouch backfill including its second-run no-op (rewarded-actions SOP). Its compost-ordering section came out on 2026-08-18 with the compost button; the pouch half now reads the larder rather than the seed pouch, because the pouch pays ingredients. Self-serves this checkout when given no URL.'],
  'hide-glow-audit.mjs': ['full', 'hidden garments keep their stats; the glow toggle stays cosmetic.'],
  'levelup-audit.mjs': ['full', 'the level-up moment plays and shows the right numbers.'],
  'fight-hint-audit.mjs': ['full', "pins the width of every move-button hint string against the box it has to fit in, at 393/375/320. It is what caught the wrapping v400 fixed, and it goes red again the moment a hint string grows. ~68s, which is why it is full and not FAST."],
  'fight-press-audit.mjs': ['full', "press-and-hold on a move opens the detail popup and uses NOTHING, and a tap still uses the move. Drives real CDP pointer sequences and reads the outcome from AP and boss HP, never by calling a handler. Both viewports, so it is the slowest of the three Pit audits."],
  'transmog-clarity-audit.mjs': ['full', "the ?mogv2 look panel, graded the way the new-player grill found it broken (v424 item 11). The finding that outranks the rest is geometric: tapping a look already restaged the paper doll CORRECTLY, with the doll 480px above the top of a 430x932 viewport, so the feature's whole output landed off screen and the player bought a look they had never seen (measured cost of going to look: a 934px scroll up, one whole viewport, then back down to press the button). So PREVIEW asserts the After figure is fully in frame AT the moment a real pointer taps a real tile, that its art is DECODED, and that it actually changes. BAR pins Tom's three sentences (what you keep, what you get, what you pay) and measures their WIDTH, because the shipped v1 bar renders its own status text at ZERO pixels: .btn is width:100% and .look-bar .btn only sets flex:none, so the button lies across all 398px of the bar. CURRENCY pins the price to the wallet's own art after the grill found three renderings of Bone Dust on one screen (pixCur crystals in the wallet, a Unicode ' ◆' from .look-cost::after on the tile, and a tan vector diamond in the note because ICONS.dust(12) is under pixCur's 16px floor). EVERY SLOT fails if any gear slot leaves the section silently missing. VARIANT fails if the rework leaks without ?mogv2. ECONOMY is there to prove the interface pass moved NO number: the button quotes what transmogPrice charges, one tap only arms, the confirm charges exactly that, and the cost table is pinned in source. Self-serves this checkout when given no URL. One boot, about 50s."],
  'melt-ui-audit.mjs': ['full', 'the Salvage Bench: entrance visible without a tap, every row actionable, melt pays exactly once (SOP), every rarity meltable, and transmog on a stat-less slot is offered AND free AND actually changes the look.'],
  'offline-boot-audit.mjs': ['full', "the other half of v197's network-first shell: the app has to boot with no network. The old note here said it was RED for a missing PRECACHE entry; that was fixed, and it stayed red for a second reason that was not the app at all. Its offline proof is 'the worker's cache did not grow', which assumes the worker only puts after a network response, and sw.js's static branch fetches at default cache mode so a warm Chrome HTTP cache answers with res.ok and the entry is put with nothing crossing the wire: measured 137 -> 156 with the server stopped and the origin refusing, 137 -> 137 with Network.clearBrowserCache first. setOffline now clears it, which is also the harsher test. 16/16, exit 0, 2026-08-17. Owns its server (it has to stop it), so it takes ~90s."],
  /* THE NETWORK BETWEEN OFF AND ON, which nothing here had ever driven. */
  'flaky-network-audit.mjs': ['full', "offline-boot proves the app BOOTS with no network; this drives what happens when you press things, in the three states that are not 'on': GONE, HANGING (accepted and never answered, which no catch in this app could ever reach) and FLAP (the server acts, the answer is lost). Grades what reached the store AND what the player was told, with an online CONTROL twin on every offline row and every gift row gated on the sheet having opened, so an empty sample set cannot read green. Proven red at ddbb079 with only this file copied into a throwaway tree: 11/31 there against 31/31 here, and the 20 red rows are the findings, not a broken harness (its OFFLINE-FIRST rows and every online CONTROL twin are green in BOTH trees). 32/32 and 191s measured on the final file, green on three consecutive runs. Self-serving, and it stops its own server and clears the browser HTTP cache, so 'full' rather than fast."],
  'onb-audit.mjs': ['full', 'onboarding on a virgin IndexedDB, the only suite that sees the launch funnel.'],
  'out-there-audit.mjs': ['skip', 'its whole subject is the "Out there today" card, which came off Today on 2026-08-21 when Tom asked for every banner except the step winner to go and one hype banner to replace them. outThereHtml and its four row builders are intact and unreachable in js/app.js (revival is one call plus the heldSpires read), so this file is kept as the record of what the card had to do. tests/hype-banner-audit.mjs guards what stands there now, including a GONE row that fails if the card comes back unasked.'],
  'pit-refresh-audit.mjs': ['full', 'the Pit re-renders when a fight ends: beaten remote den stops offering FIGHT without a reopen.'],
  'paddock-scene-audit.mjs': ['full', 'the Paddock end-to-end: real chip tap, decoded herd, band rule in the live DOM, motion as rendered pixels.'],
  /* FOUND UNDECLARED ON ext/today-hype-banner AT 1784d1e4, 2026-08-21, and it is
     the FOURTH time this has landed (see the fight-hint, crate-palette and
     xp-cap entries). It arrived with v418 and nothing named it here, so the
     coverage assertion below has been RED on this branch and the whole gate has
     been exiting 1 before a browser started. Declared rather than left, because
     every audit on this branch, including the motion one under it, runs behind
     that assertion. Tier chosen from what the file does; move it if its author
     disagrees. */
  'boneyard-icon-audit.mjs': ['full', 'the Boneyard and its map key draw the same pixel art, at WHOLE steps, and it decodes. Written against the five v416 defects that were one mechanism: pixCur() snaps to 48/24/16 and returns null under 16, so a call site asking for a size that snaps down silently gets smaller art than its box, and one under the floor silently gets the old vector next to a pixel map. Boots the map and grades decoded naturalWidth plus rendered box, with a positive control that refuses to pass on a blank screen.'],
  'motion-truth-audit.mjs': ['full', "a surface said to move must MOVE IN THE APP, in decoded pixels, and every motion claim must print what the other half of the players get. Tom, 2026-08-21: \"the hype banners you made before had moving components to them? ... that NEVER showed on the live app it was always a static grid.\" The animation was never missing: measured on the LIVE site the drop wall moves 50% of its pixels and the reel 31%. The one state where they are a permanently static grid is prefers-reduced-motion: reduce, which app.css collapses globally on `*` and which gates the reel's JS driver so #tzReel never gets a beat class at all. Both are defensible; neither was verified, so every review happened in the one state where it moved. Grades both states end to end: MOVES (peak changed-pixel fraction >= 3%), REDUCE (EXACTLY 0%), BEATS (the reel's own class advances, so a pixel delta from the art behind it cannot pass for the reel running), STILL on a banner declared static as the instrument's negative control, and COVERAGE, which fails by name on any animated Today banner missing from the REGISTER. Two boots with a media feature emulated before the first navigation (js/fx.js reads reducedMotion once at import), about 70s: full, not fast."],
  'pit-cap-audit.mjs': ['full', 'the Gauntlet ceiling reads as a ceiling.'],
  'placeholder-audit.mjs': ['full', 'nothing prints a literal template placeholder.'],
  'podium-audit.mjs': ['full', 'the Crew top three shows and still opens the full list.'],
  'race-audit.mjs': ['full', 'the step race shows one set of numbers everywhere.'],
  'respec-audit.mjs': ['full', 'refund-and-respend needs two taps and really returns the points.'],
  'reward-art-audit.mjs': ['full', 'the victory gear card, read as pixels.'],
  'scout-audit.mjs': ['full', "the world follows where you look and stays the same size. All six rows need a reachable vector tile host and the suite reports UNPROVEN with exit 97 without one. Measured 2026-08-17: three red, and both greens vacuous. 'BOUNDED: scouting does not grow the marker count' passed on `0 -> 0 markers`, which is tally/CLAUDE.md rule 11 in one line, a ceiling satisfied by an empty set; 'ANCHORED: a den you only looked at is not enterable' passed because there was no map, not because the distance rule held. window.__map is assigned before the map's error handler runs, so its presence proved nothing either."],
  'spawn-quiet-audit.mjs': ['full', "the quiet Boneyard collect: bones, coins and herbs must never regain the full-screen reveal, and crate + rare must keep it. Four STATIC rows grade everywhere and pin the write-cost arithmetic to its sources (openSheet is the only emitter of feat_open/feat_time; the D1 events table carries 3 indexes, so one sheet is 2 events is 8 row-writes of the 100k/day free tier). The driven half walks onto a real spawn of each of the five types on a real map, so it needs a reachable vector tile host and declares itself UNPROVEN with exit 97 without one rather than passing on an empty sample. Counts analytics by serving a one-line patched js/analytics.js over request interception, because the real queue refuses to record under ?demo; the two ceremony collects are the control that proves the zero on the quiet path is a measurement."],
  'speech-audit.mjs': ['full', 'sweeps every salt of the chatter pools.'],
  'spire-explainer-audit.mjs': ['skip', 'it opens the spire explainer through details.spire-banner on Today, and that row went with the "Out there today" card on 2026-08-21. The explainer copy it grades is still built by spireBannerHtml, which nothing calls; when the spires get a surface again this file is the check that comes back with it.'],
  'spire-phase3-audit.mjs': ['full', 'a refused spire claim must not leave the client owning a tower.'],
  't1-audit.mjs': ['full', 'Tier 1 daily loop, 33 checks through the real add-food flow. Section 7 (the Boneyard, 11 rows) needs a reachable vector tile host and declares itself UNPROVEN with exit 97 where there is not one, rather than letting two `count(...) === 0` rows pass on a map with nothing on it. Sections 1 to 6 need no map and still grade there.'],
  't2-audit.mjs': ['full', 'Tier 2 payoff moments, each provoked.'],
  't3-audit.mjs': ['full', 'Tier 3 depth screens render their mockup language.'],
  'two-tap-audit.mjs': ['full', 'one tap must never spend coins.'],
  'wardrobe-audit.mjs': ['full', 'equipping does not flash the page; the background does not follow the character.'],
  'looks-door-audit.mjs': ['full', "the Looks collection is REACHABLE. v395 took the LOOKS card off the hub and it was the only entry point, so tab === 'looks' rendered perfectly for nobody. Drives the Wardrobe door with a real mouse click and asserts the collection actually paints (tiles, locked tiles, the tally), and that the hub row is still 4 chips with LEVEL still gone. Proven red against origin/main at 7c36465, the shipped regression: 9 of 14 red there, 14 of 14 here, with the HUB rows green in both so a broken harness cannot read as the finding. Self-serves this checkout when given no URL."],
  /* REPORTS PRE-EXISTING ROT, so it exits 1 on a healthy tree and cannot sit in
     FAST. This project's own rule is that a gate people skip is worse than no
     gate, and a FAST tier that is permanently red is the fastest way to teach
     everyone to ignore it. It runs under --all, where a non-zero exit reads as
     the worklist it is, until the rot it names is cleared. */
  'suite-rot-audit.mjs': ['full', 'audits that never run, and audits aimed at deleted UI. Exits 1 by design on a tree that still has rot; see gwart/dead-audits for the first two.'],
  'weapon-charge-audit.mjs': ['full', 'the weapon charge, sampled as decoded pixels while it runs.'],

  /* THE FIFTEEN THE OLD NET COULD NOT SEE. Every one of these is a real guard
     that has never been run by the gate, only because it is not named
     "-audit". Each was executed before being given a tier here, so none of
     these is a guess: 7 green, 3 red only under headless 'new' (see
     godmode.js), 1 genuinely red, 2 that need an argument, 2 tools. */
  /* Arrives with ext/godmode-detach-guard. Declared HERE rather than there
     because this branch is what widened the net to see it at all: the old
     /-audit\.mjs$/ filter was blind to a *.test.mjs, so the two branches are
     green apart and red together. Landing them in either order now works. */
  'detach-guard.test.mjs': ['full', 'the harness-wide detached-frame retry, with its prove-red trio. Not FAST: it deliberately induces detaches and is slow.'],
  'balance.mjs':          ['full', '35 assertions on the exact exploit class we keep re-finding (free lives, stamina, gear-granted action economy). Ran green; belongs in the release run.'],
  'talent-badge.mjs':     ['full', 'the talent badge updates in place after a spend. Ran green.'],
  'gift-open.mjs':        ['full', 'opening a gift, 9 assertions. Ran green.'],
  'lb-profile.mjs':       ['full', 'leaderboard profile cards. Ran green.'],
  'milestones.mjs':       ['full', 'milestone awards. Ran green.'],
  'remote-routines.mjs':  ['full', 'the remote routine calls. Ran green.'],
  'spire-poster.mjs':     ['full', 'the spire poster art. Ran green.'],
  'mockup-parity.mjs':    ['full', 'every approved mockup is really in the app. Was RED on main and unseen: it is the reason this net was widened.'],
  'crew-inbox.mjs':       ['full', '15 assertions on the deliveries inbox. Green under HEADLESS_MODE=shell; its one failure under headless new is the sheet sitting un-animated, not a bug.'],
  'friend-paddock-audit.mjs': ['full', 'a friend\'s Paddock on their profile, 15 checks, about 70s, and the guard for the FIRST TIME pets have ever left the device. Tom, 2026-08-22: "lets make it so when you click on a friend in the crew you can see their paddock and how many cool pets they have". The whole risk is that PLAINTEXT and CREW-ONLY are two different promises and only one of them is enforced by the channel the data rides. The roster rides players.profile, the plaintext social snapshot, deliberately: the alternative is players.backups, which is the end-to-end encrypted vault and is useless here because a friend cannot decrypt it either. Crew-only is then a property of WHICH ROUTE returns the blob, so it is graded as one: PUBLIC reads the real /leaderboard SELECT out of server/src/index.js and fails if `yard` ever appears in its json_extract list (that list is what any authenticated caller can read off the top 100; GET /friends, which returns the whole blob, is joined through an ACCEPTED friendship). WEARHOME pins the one-line version of the same mistake: the pet wardrobe must NOT hang off `pet`, because `pet` IS in that public list. VAULT pins that the yard is built in the snapshot and never reaches the backup path. SHAPE and MINIMAL grade the payload the app REALLY builds through a __socialSnapshot seam rather than a copy of the field list typed into the test, so a field added later fails until somebody decides it belongs on the wire: species and shiny only, no instance ids, nicknames, bonds, lineage or per-pet levels. CAP pins the 24-pet wire cap against the server\'s 24KB 413. THEIRS is the figure contract\'s rule 1 in a new coat and the one this feature could most easily ship: the VIEWER wears a different item in the same slot during the same run, so a render that reached for S.petWear dresses the friend\'s pet in the auditor\'s bag and the row names both files. OLDBUILD requires the sheet to have RENDERED before grading the strip absent, because without that a profile that threw outright passes as "no strip" (measured: a mutation that did exactly this went green). Proven red in seven isolated non-worktree copies, mutation list and full output in the file header.'],
  'crew-cheers-audit.mjs': ['full', 'the CHEERS inbox, 14 checks, about 95s. Tom, 2026-08-22: "there needs to be a better interface in crew where you can see the cheers that friends have sent you, right now it\'s very easy to pass them by." The cause was one hop above the UI, not in it: /cheer sends { from, cheer, cheerFrom, note } and js/social.js applyPayload called awardOnce(key, type, xp, note), a signature with nowhere to put the phrase INDEX or the SENDER id, so both were dropped at the one line that turns a grant into a ledger row. Every cheer therefore read as the server\'s sentence whichever of the twelve was sent, and there was no id left to address a reply to. It grades the CHAIN through the real path: grants go in through social.__testApplyGrant, which IS applyGrant (hand-written ledger rows would be green with the transport bug still in place, which is the whole bug), then the real Crew tab, then a real mouse click on Cheer back. CARRIED is the transport row and the one the shipped bug reds; WHAT requires three different cheers to read as three different things, so a renderer printing the note passes nothing; BACK hit-tests the control with elementFromPoint before clicking and requires the send sheet to name that player; UNREAD pins the card count and the tab badge together; KEPT expands the archive after a real reload because the promise is REACHABLE, not RENDERED, and counting the collapsed list would go red on correct behaviour; SPLIT pins that cheers left DELIVERIES and the gift did not; LEGACY pins that a row written before the fix still LISTS, with the server sentence and no reply button, because a cheer you cannot answer beats a cheer you were never shown. WATERMARK is the one STATIC row and it is static because it was MEASURED to be ungradeable live: the two inboxes share one read of the seen-watermark and one write of it, and putting the per-painter read and stamp back (the race verbatim) left the entire live suite green at exit 0, so the lint pins the structure instead. Proven red in five isolated non-worktree copies (.git removed, mutation grepped in the copy, all three test seams grepped intact so nothing fails for the wrong reason); the first round found three faults in the AUDIT rather than the app, all fixed, and the second round gives every mutation its own single-row signature. Mutation list and full output in the file header.'],

  /* Lane C, 2026-08-13: data-safety additions. Data-store contract audits and
     a Finding-C demonstration; all self-serving via godmode.serveTree. */
  'db-upgrade-audit.mjs': ['full', 'IndexedDB v1->v3 and v2->v3 upgrades preserve every seeded row (js/db.js:2 says upgrades must be additive; this proves it). 20 assertions, per-run fresh scratch name, upgradeneeded oldVersion asserted directly.'],
  'db-export-completeness-lint.mjs': ['full', 'static lint: every createObjectStore in js/db.js must appear in exportAll and importAll. New store added later without export coverage = silent backup gap. Same class as the PRECACHE list bug of 2026-08-12. Fast (no browser).'],
  'importall-interrupt-finding.mjs': ['full', 'FINDING C demonstration (Reg-authorised 2026-08-13, no fix): interrupts importAll mid-loop, prints per-store distribution across N runs, boots the app on the mixed DB and observes what the player sees. Deliverable is the finding text; exit 0 as long as the demo runs.'],
  'grid-min-width-audit.mjs': ['full', "no control lands outside a 320x568 viewport, and no equal-track grid spills its cells out of its own box: app.css had 22 `repeat(N, 1fr)` rules and zero minmax(0, 1fr), and a 1fr track's automatic minimum is min-content, so a long label widened the track past the equal share (.badge-grid reached x=347 in a 320 viewport). Carries its own canary, which plants an over-wide control and requires the detector to name it, because the first version of the exclusion rule excused every control on every screen. Three full walks of every route and hub tab at 320, 360 and 375: about 100s, and only tests/batch-audit.mjs otherwise ever sets a 320 viewport."],
  'erase-completeness-audit.mjs': ['full', "Settings > Erase all data clears EVERY store js/db.js defines, and erase-then-start-over pays one welcome kit rather than one per cycle. The erase carried its own six-name literal that was missing 'inv', so the wardrobe survived a dialog promising it was gone and the kit was re-paid on every cycle, unbounded. Two virgin non-demo onboardings and a reload, so it is onb-audit-shaped and not FAST-shaped; ?demo is useless for it because boot re-seeds the demo DB on the reload the erase performs."],
  'db-quota-finding.mjs': ['full', 'C4 IndexedDB quota behaviour: measures real per-year growth (~2.4MB), extrapolates to device-realistic quotas (Chrome allocates ~60% of free disk; a 500MB-free budget phone hits quota inside ~4 years). Attempts to force a real failure via CDP Storage.overrideQuotaForOrigin, records honest outcome. Not a fail-if-red audit; the finding IS the deliverable.'],
  'garden-doors.mjs':     ['skip', 'asserts the Kitchen opens on COOK and GROW. It opens on the Kitchen now (2026-08-18); garden-closed-audit.mjs asserts the doors are gone.'],
  'hero-flash.mjs':       ['full', 'no coral frame behind an equipped backdrop, sampled as pixels. Needs HEADLESS_MODE=shell: page.screenshot never returns under headless new on macOS.'],
  'race-you.mjs':         ['full', 'your own lane in the step race. Red on main for a date reason tracked separately; declared rather than hidden.'],
  'spire-gate.mjs':       ['full', "the spire day-gate, which is a rewarded action and has been exploited twice. The old 'RED under both headless modes' note was wrong about the cause: measured 2026-08-17, the reds were an unreachable vector tile host (https://tiles.openfreemap.org, net::ERR_CERT_AUTHORITY_INVALID from a sandboxed container), not the headless mode and not the GPU, and one row PASSED on `sheets 0 -> 0` because there was no map to open a sheet on. It now measures that property and reports its ten map rows as UNPROVEN with exit 97 where the host is unreachable, so a machine that cannot host it says so by name instead of producing a mixture of reds and vacuous greens. Green with 10 assertions on a connected machine."],
  'balance-audit.js':     ['skip', 'takes a URL argument and is run by hand against live; it has no self-served mode to give the gate.'],
  'fx-audit.js':          ['skip', 'the FX pixel audit, run by hand per tally/CLAUDE.md with a URL. Mandatory before FX work, but not gate-shaped.'],
  'ui-audit.js':          ['skip', 'pasted into the app console and awaited; it is not a node entry point.'],
  'reap-orphans.mjs':     ['skip', 'a maintenance tool that deletes dead files, not a check.'],

  /* THE NINE THAT LANDED ON MAIN WITHOUT A TIER, 2026-08-15. Every one of these
     is a real guard that arrived on its own branch, and none of them touched
     this file on the way in, so the coverage assertion above was failing by name
     before a browser started: `npm run gate` and `gate:all` both exited 1 on a
     clean checkout of main. The assertion did its job. Nobody had done theirs.
     (first-fight-audit.mjs is the tenth; it is node-only and went into PURE.) */
  'breed-sheet-scroll-audit.mjs': ['full', "the breeding sheet can be SCROLLED where its content is, at 375x667 with the precious-pet warning mounted. The other half of sheet-action-reachable's report, which grades whether the action can be TAPPED and cannot see scroll room: Brock could only swipe the grey area under the window. Proven red at 19c3a99 (401px of padding AFTER the sticky bar un-sticks it; a swipe on the sheet moved #stableBody 0 -> 0). Boots a real Stable and drives the breed picker, so it is not FAST-shaped."],
  'cloud-restore-silent-audit.mjs': ['full', 'a failed cloud restore must SPEAK and must be RETRIED: stubs the vault at 500 / 404 / empty / already-restored and reads the bootRestored flag out of IndexedDB plus the toast off the screen. Behavioural, not a source parse (REG-PLAN 2D calls this rewrite the template). Boots WITHOUT ?demo with navigator.webdriver spoofed, because app.js NOSOCIAL skips bootSync entirely otherwise, and spends nine seconds per scenario watching for a toast that must not come. Prove-red is a worktree at 17a977f^.'],
  'fav-skull-audit.mjs': ['full', "a fave chip whose skull never arrives must not be an empty canvas (anti-regression rule 8). Has to read the alpha channel: the <canvas> exists either way, so every presence-based assertion passes on the bug. Two full boots, healthy then request-blocked, so it costs double a one-boot audit."],
  'memory-census.mjs': ['full', 'the eight-layer memory ceiling on every screen that mounts art in a loop, sampled at the PEAK after a full scroll of every scroller, twice (tally/CLAUDE.md rules 11 and 12) - lb-memory-audit budgets ONE screen against a two-layer fixture, and that is how six more screens with the same defect stayed invisible. Drives and scrolls most of the app, so it is among the longest suites here. Its own header names what it cannot see (CSS backgrounds, off-DOM Images, the Boneyard map: no WebGL headless), so a pass is "not caught by this instrument", not "clean".'],
  'newcomers-audit.mjs': ['full', 'all six branches of hydrateNewcomers, so "the new player section of the Crew tab is gone" is answered by measurement instead of by picking one of three explanations. Six sequential seeded scenarios at ~3s of settle each; prove-red inverts playing() and rows A and E go red while B, C, D and F stay green.'],
  'race-results-audit.mjs': ['full', 'the settled step-race podium shown is the one that was PAID, which is why it reads /steps/settled and not /steps/week: measured on production 2026-08-14, three of the five paid players had already rolled into the new week and vanished from the live board, promoting 5th to 2nd. Plus VISIBLE-not-merely-present (three opacity-0 bugs in eight days), shows once, and never renders an empty podium. The fixture is the real production result byte for byte, so row 1 cannot be decorative.'],
  /* THE ROAD EVERY FIX TAKES TO A PLAYER, and until 2026-08-17 nothing had ever
     driven it. Serves this checkout as version A and version B out of one tree
     over real https (the app registers its worker only on https, so an http run
     would grade a page with no update machinery on it), installs the worker on
     A, flips the server to B without clearing anything, and reports which of
     index.html / js / css the player is running after a return visit, a reload,
     a visibilitychange, and the Progress update banner.
     'full' and not FAST for two reasons: it is six full boots plus onboarding
     and an offline pass, about eight minutes, and it is DELIBERATELY RED on main
     today. The reds are the deliverable and both are pre-existing:
       - sw.js:174 serves a non-OK response as the answer instead of falling back
         to the cache, so one 404 at deploy time is a dead shell for every
         returning player while a good cached copy sits unused;
       - app.js:519-520 promises "Update ready. Leave this screen to apply" and
         nothing applies it on sheet close.
     Declared 'full' rather than 'skip' precisely so those two stay visible on
     every gate:all instead of being retired into silence, same reasoning as
     suite-rot-audit. It goes green the moment either is fixed.
     Prove-red: --prove-red=cache-first | stale-version | 404, each landing on a
     different row; each verifies it really changed the served bytes before a
     browser starts, so a prove-red that matches nothing cannot read as green. */
  /* THE MAP LOOKS FULL, AND THE HEADER AGREES WITH IT. The pure supply audit
     cannot answer either question: it counts what the generator produces, and
     its own viewport model was four times the real screen because it used the
     256px-tile metres-per-pixel constant against a 512px-tile zoom. So the
     rendered claim lives in a browser audit and the pure one keeps the faucet.
     'full' for the same reason as map-offline-audit: it boots MapLibre and
     fetches real tiles at four locations, ~70s, far too slow for fast.
     Prove-red on the parent commit bfacd28: VISIBLE 4.00 against a floor of 10,
     the emptiest location 3 against a floor of 5, and HEADER saying 6, 6, 8, 8
     over 4, 3, 6, 3 markers, with all four CONTROL rows still green. */
  'boneyard-density-audit.mjs': ['full', "the Boneyard reads full on a 440x956 phone and the 'N nearby' header equals the markers actually inside the canvas. VISIBLE has a floor (an empty map is the complaint), BUDGET has a ceiling of 100 live DOM markers (measured: 60fps to ~84, first dropped frames near 107), and CONTROL fails the run if the canvas, the markers or the count line are missing so the other three cannot pass on a blank screen."],

  'map-offline-audit.mjs': ['full', "opening the Boneyard with the tile host blocked must give the offline message and throw NOTHING. Arrived with #33 and belonged to no tier, which is the same coverage failure my own two audits caused. 'full' rather than fast: 25s, and it boots MapLibre and aborts real tile requests. It earned the tier the hard way, failing 1 run in 2 on an intermittent null deref that read as flakiness and was a real error; six consecutive green runs after the fix."],

  /* ONE ACCOUNT, TWO TABS, and until 2026-08-17 nothing in this repo had ever
     opened the app twice. Every other suite here drives ONE page, and a single
     page cannot produce this failure because the failure IS the second
     consumer. Two puppeteer pages on one served tree, one origin, one
     IndexedDB, plus a fake Worker on loopback so the grant rows run the real
     social.pullGrants() rather than a re-implementation of it.
     Measured on ddbb079 before the fix and all now assertions: 50 coin awards
     across two tabs landed on 1280 instead of 1500; a 12-grant feed pulled by
     both tabs paid 140 of an expected 120 while leaving exactly one ledger row
     per key; ten gear ids granted twice left twenty inv rows, each melting for
     full dust; a 12/day XP ceiling paid 190; and Erase all data with a second
     tab writing left rows standing in three stores.
     'full' rather than FAST for the ordinary reason: 34s measured, two
     concurrent browser pages plus two node servers, and the erase block
     navigates both tabs off ?demo mid-run so it must not race a parallel suite.
     Seven prove-red modes, each reintroducing exactly one old shape in the
     bytes on their way out of the server, and each verifying it really
     substituted before the run is graded. */
  'multitab-audit.mjs': ['full', "the app open TWICE: exact currency across two tabs, one payout per grant key, one inv row per ownable item, a daily XP ceiling that holds, a stale tab that cannot revert the other one's settings, a returning tab that shows the current balance without losing its open sheet, and an erase that leaves zero rows while the other tab is writing. 28 checks, 38s measured, two live pages, a fake Worker for the real pull path, ten prove-red modes."],

  'sw-upgrade-audit.mjs': ['full', 'the end-to-end upgrade: two versions served from one tree, and the player must end up fully on the new one. Was deliberately red on main while it pinned two unfixed findings; both are fixed as of v391 and it is GREEN, 35 checks. Stays full rather than fast: it installs and upgrades a real service worker across two builds, which is slow and must not race a parallel suite.'],

  'input-validation-audit.mjs': ['full', 'every number a player can type, driven through the real controls: weight (kg and lb), quick add, custom food, the portion sheet, daily targets and the plan form, each against empty, whitespace, a partial parse ("12abc"), scientific notation, a grouped thousands comma, an absurd integer, negative and zero. Grades what REACHES THE STORE (bound ZERO, not a trend), whether the player is TOLD, and that legitimate values including a decimal comma still land exactly, so it cannot pass on an app that refuses everything. Carries a COVERAGE half derived from js/app.js, so a new numeric field nobody drove FAILS. Eleven surfaces at ~25 sheet round trips each with toast-queue settles, so it is minutes, not seconds: full, never fast.'],
  'sheet-action-reachable-audit.mjs': ['full', "a primary action must be tappable in the WORST content state, hit-tested with elementFromPoint at the button's centre rather than by rectangle, because a clipped button still measures 132x44 at a fine position. DELIBERATELY RED as of today: gwart/REG-PLAN-2026-08-15.md item 2B parks it outside FAST until 1B and 1C land, at which point it goes green or what remains gets written down. Declared 'full' and not 'skip' precisely so that deadline is visible on every gate:all instead of being retired into silence, which is the same reasoning as suite-rot-audit above. 2026-08-18: it now exits 0. Its only remaining failures were the three garden-buybed rows, and that action left the player's path with the Bone Garden, so the row came out. The 1B/1C deadline in REG-PLAN still stands on its own; this entry no longer proves it."],
};

/* COVERAGE, BEFORE A SINGLE BROWSER STARTS. An undeclared audit is a one-second
   failure here or a four-minute one at the end, and the four-minute version is the
   one people stop running. */
/* PURE counts as a tier too. It always did; the old net just never saw a PURE
   file, because neither is named "-audit". */
const undeclared = onDisk.filter(f => !BROWSER.includes(f) && !PURE.includes(f) && !(DECLARED[f] && DECLARED[f][1]));
if (undeclared.length) {
  console.log(`FAIL  coverage: ${undeclared.length} audit file(s) belong to no tier:`);
  for (const f of undeclared) console.log(`        ${f}`);
  console.log("        Add each to BROWSER (fast), or to DECLARED as ['full', reason] or ['skip', reason].");
  console.log('        An audit that exists but never runs radiates false confidence.');
  process.exit(1);
}

/* AND EVERY FAST SUITE MUST BE POINTABLE AT THIS TREE.
   contrast-audit sat in FAST reading process.env.URL ONLY while the gate passes the
   URL as argv, so it booted godmode's default, https://tommillerca.github.io/tally/:
   the row graded PRODUCTION and read as coverage of the code under test. Measured at
   the time, 0 requests reached the local tree. Teaching the GATE to export env.URL
   would have been worse: 24 suites spawn their own server when it is unset, so that
   one line changes what tree all of them test. The rule lives here instead.
   Static scanners are exempt, they need no URL (gate-audit reads sources and never
   boots), and self-servers are exempt, they cannot fall through to the default. */
/* EVERY TIER, NOT JUST FAST. My first version checked only the fast list, and
   `--all` runs the FULL tier, so twenty env-URL-only audits sat in FULL silently
   grading PRODUCTION on every gate:all. That is the same defect as contrast-audit's,
   at ten times the scale, missed because the guard's scope was narrower than the
   runner's. Guard what the runner runs. */
/* THE EXEMPTION IS A CAPABILITY, NOT A STRING. This tested for the literal
   `http.server`, which was how a self-serving audit was recognised. walt/serve-bind
   then did the right thing and moved that spawn into godmode's serveTree (OS-assigned
   port, stderr kept, a failed bind now loud), which deleted the string from all 26
   audits: at merge time this guard failed FIFTEEN suites, screen-sweep among them, so
   the gate hard-failed before a browser started and accused them of grading
   production. They do not. I ran five of them on the merged tree (onb 15/15, t1
   34/34, figure 32/32, crate-reveal 13/13, weapon-charge clean) and serveTree's own
   happy path serves THIS tree, verified by reading tally-v365 back out of it.
   So the guard went red because the code got better, which is the failure mode of a
   check pinned to an incidental. Match the capability: argv, an inline server, or
   serveTree. `http.server` stays for anything not yet migrated. */
const notPointable = [];
for (const f of [...BROWSER, ...onDisk.filter(x => DECLARED[x] && DECLARED[x][0] === 'full')]) {
  const src = await readFile(join(here, f), 'utf8');
  const boots = /\bboot\s*\(|puppeteer/.test(src);
  const pointable = /process\.argv/.test(src) || /http\.server/.test(src) || /\bserveTree\s*\(/.test(src);
  if (boots && !pointable) notPointable.push(f);
}
if (notPointable.length) {
  console.log(`FAIL  ${notPointable.length} gated suite(s) cannot be pointed at this tree, so they would grade PRODUCTION:`);
  for (const f of notPointable) console.log(`        ${f}`);
  console.log('        Read `process.argv[2] || process.env.URL` (see error-telemetry-audit), or serve your own tree.');
  process.exit(1);
}

const FULL = onDisk.filter(f => DECLARED[f] && DECLARED[f][0] === 'full');
const runAll = process.argv.includes('--all');
const fastAudits = BROWSER.filter(f => onDisk.includes(f)).length;
console.log(`coverage: ${onDisk.length} audits on disk, ${fastAudits} fast, ${FULL.length} full, ${onDisk.length - fastAudits - FULL.length} skipped`);
if (runAll) BROWSER.push(...FULL);

/* READ THE GATE LOCK BEFORE RUNNING. NOT after, and not by assuming.
 *
 * Three sessions share this machine and the lock is a line in CHAT-HANDOFF.md. It
 * collided TWICE on 2026-08-11 in opposite directions, and both failures were the
 * same shape: a claim written with a `sed` keyed to the line's CURRENT text, which
 * silently matches nothing when somebody else has rewritten it. Walt's claim failed
 * that way, then mine did, and neither of us noticed because a no-op sed exits 0.
 * I then started a gate ~26s into a run he was holding.
 *
 * "Everyone remembers to read the line first" is not a protocol, it is a hope, and
 * a green taken under contention certifies nothing. So the runner reads it, and
 * refuses. Escape hatch is explicit: --no-lock, which prints that it was used, so
 * skipping is a decision on the record rather than a silent default.
 * Identity via --as <name> (or GATE_OWNER), because the release has to know whose
 * claim to leave and whose to respect. */
/* THE LOCK HAS TO RESOLVE TO ONE FILE FROM EVERY WORKTREE, AND IT DID NOT.
   It was `pjoin(repoRoot, '..', 'CHAT-HANDOFF.md')`, and repoRoot is wherever the
   suite is running from. From the main clone that is the real handoff file. From
   a DETACHED WORKTREE it is <scratchpad>/CHAT-HANDOFF.md, which does not exist,
   so readLock() threw, returned null, and the gate printed "no lock line found,
   continuing (nothing to contend with)" and ran. A fail-open lock that announces
   it is safe.
   Every worktree therefore had its own private lock and none of them excluded any
   other. The protocol was added 2026-08-10 after three concurrent suite runs; on
   2026-08-23 it happened again, three sessions and two release-gate runs at once,
   because agents work in worktrees and physically could not claim it. The suites
   do not fail honestly under that load, they fail as if the code were broken:
   ARRIVAL-SLOW straggler latency reads 42ms idle and 342-461ms loaded against a
   250ms budget, and two sessions separately came close to filing the machine as a
   defect.
   git-common-dir is the same path from the main clone and from every worktree it
   owns (<main>/.git), so two levels up is the handoff directory for all of them. */
function handoffDir() {
  try {
    const common = execFileSync('git', ['rev-parse', '--git-common-dir'],
      { cwd: repoRoot, encoding: 'utf8' }).trim();
    return presolve(repoRoot, common, '..', '..');
  } catch {
    return pjoin(repoRoot, '..');   // not a git checkout: behave as before
  }
}
const lockPath = pjoin(handoffDir(), 'CHAT-HANDOFF.md');
const owner = (process.argv.find(a => a.startsWith('--as='))?.slice(5)) || process.env.GATE_OWNER || '';
const noLock = process.argv.includes('--no-lock');
const LOCK_RE = /^(\s*GATE LOCK:\s*)(.*)$/m;
let lockClaimed = false;
let lockReadable = true;
async function readLock() {
  try { return (await readFile(lockPath, 'utf8')).match(LOCK_RE)?.[2]?.trim() ?? null; }
  catch { lockReadable = false; return null; }
}
async function writeLock(text) {
  try {
    const src = await readFile(lockPath, 'utf8');
    if (!LOCK_RE.test(src)) return false;
    const { writeFile } = await import('node:fs/promises');
    await writeFile(lockPath, src.replace(LOCK_RE, (_m, head) => `${head}${text}`));
    return true;
  } catch { return false; }
}
const held = await readLock();
if (noLock) {
  console.log(`GATE LOCK: SKIPPED via --no-lock (line currently reads: ${held ?? 'unreadable'})\n`);
} else if (held === null && !lockReadable) {
  /* NOT "nothing to contend with". The lock could not be READ, so this run is
     serialised against nothing and the operator cannot know that from a green
     suite. Say the path, because the whole bug was this line reassuring people. */
  console.log(`GATE LOCK: UNREADABLE at ${lockPath}`);
  console.log('        This run is NOT serialised against other sessions. Timing rows');
  console.log('        on a shared machine cannot be trusted. Create the file with a');
  console.log('        "GATE LOCK: (free)" line, or pass --no-lock deliberately.\n');
} else if (held === null) {
  console.log('GATE LOCK: no lock line found, continuing (nothing to contend with).\n');
} else if (!/^\(free\)/i.test(held)) {
  console.log(`FAIL  the machine is claimed, so this run would certify nothing:\n        ${held}`);
  console.log('        Wait for it to clear, or pass --no-lock if you know it is stale.');
  process.exit(1);
} else if (owner) {
  const stamp = new Date().toTimeString().slice(0, 5);
  lockClaimed = await writeLock(`${owner} — release-gate${runAll ? ' --all' : ''} — taken ${stamp}`);
  console.log(lockClaimed ? `GATE LOCK: taken by ${owner}\n` : 'GATE LOCK: could not write the claim, continuing unclaimed\n');
} else {
  console.log('GATE LOCK: free, but no --as <name> given, so nothing was claimed.\n');
}
async function releaseLock() {
  if (!lockClaimed) return;
  const stamp = new Date().toTimeString().slice(0, 5);
  await writeLock(`(free) — released ${stamp} by ${owner}.`);
}

/* SWEEP ORPHANS FIRST. A SIGKILLed audit (harness timeout) strands 11 browser
   processes that no in-process hook can catch, and they are still holding ~1.3GB
   each when the next run starts: measured, that is what turned a healthy tree
   into "five suites blocked". Only processes whose parent is already dead, so a
   concurrent run in another session is untouched. */
try {
  const { execFileSync } = await import('node:child_process');
  const out = execFileSync(process.execPath, [pjoin(here, 'reap-orphans.mjs'), '--kill']).toString().trim();
  if (!/^no orphaned/.test(out)) console.log(out.split('\n').pop() + '\n');
} catch { /* never block a gate run on housekeeping */ }

/* WHICH BROWSER STACK IS ABOUT TO GRADE THIS RELEASE. Nothing printed this
   before, and a stale puppeteer resolved out of an unrelated project on the
   same machine reported its own missing API as an app defect (see
   godmode.loadPuppeteer). A gate that cannot name its instrument is not
   certifying anything. Never fatal here: the PURE tier needs no browser. */
try {
  const gm = await import('./godmode.js');
  await gm.loadPuppeteer();
  console.log(`instrument: ${gm.puppeteerOriginLine()}\n`);
} catch (e) {
  console.log(`instrument: puppeteer UNRESOLVED, so every browser suite below will die at launch:\n        ${String(e.message).split('\n')[0]}\n`);
}

const results = [];
const verdict = r => (r.code === 0 ? 'PASS ' : r.code === UNPROVEN ? 'UNPRV' : 'FAIL ');
function report(r) {
  console.log(`${verdict(r)} ${r.file.padEnd(24)} ${r.secs}s`);
  if (r.code === UNPROVEN) {
    const u = unprovenLines(r.out);
    console.log(`        ${u.rows} check(s) DID NOT RUN on this machine. Not a pass.`);
    for (const w of u.why) console.log(`        ${w}`);
  } else if (r.code !== 0) console.log(failLines(r.out));
}
/* ============================================================================
   RUNNING THEM AT THE SAME TIME
   ============================================================================
   This loop was `for (const f of LIST) await run(f)`: strictly one suite at a
   time. Measured on this Mac, --all is 174 suites averaging ~45s, so about two
   hours of wall clock on a 16-core machine with fourteen cores idle throughout.
   That cost is not academic. It is why `node tests/release-gate.mjs` runs the
   FAST tier only (69 of 174), why a release is usually verified on 40% of the
   suite, and why sixteen audits were able to rot red on main without anyone
   noticing. The serial loop is the reason the gate stopped being run.

   Each suite is already a separate PROCESS with its own browser, its own
   IndexedDB and its own page, so nothing about them was ever ordered. Only the
   driver was.

   WHAT STOPS IT FROM BEING FAST AND FLAKY, which is worse than slow:

   1. SERIAL, below, names the suites that genuinely cannot share the machine,
      each with a reason. Adding to it is cheap; assuming everything is safe is
      how a parallel gate starts lying.
   2. The concurrency is bounded by MEMORY, not by cores. A Chromium under one
      of these holds ~1.3GB (measured when eleven orphans turned a healthy tree
      into "five suites blocked"), so the cap is derived from total RAM and then
      clamped by cores, rather than being a number somebody liked.
   3. The orphan reaper runs ONCE, before any of this, and only kills processes
      whose parent is already dead. It cannot reap a live sibling.
   4. OUTPUT STAYS IN DECLARED ORDER. Results are held until every earlier suite
      has printed, so two runs of the same tree produce the same transcript and a
      diff between runs means something. A gate whose output order depends on
      which suite happened to finish first cannot be diffed, and diffing two runs
      is exactly how "is this red mine?" gets answered.

   GATE_JOBS=1 restores the old behaviour exactly, for bisecting a suite that
   only fails with company. */
const SERIAL = {
  'offline-boot-audit.mjs': 'binds a FIXED port (serveTree forcePort) because it '
    + 'must survive the service worker across a restart on the same origin. Two of '
    + 'anything on that port is a bind error, not a finding.',
  /* MEASURED, not assumed. This one went red on the first parallel --all run and
     PASSED standalone on the same tree, which is the signature the whole SERIAL
     list exists for. It catches a takeover mid-slide by sampling PIXELS on a
     specific frame, so it needs the frame budget it thinks it has; six browsers
     competing for the CPU move the frame it lands on and it reports the
     transition as broken when nothing is. A timing audit under contention
     measures the machine, not the app. */
  'crate-exit-flicker-audit.mjs': 'samples pixels on a specific frame of a slide, '
    + 'so it is measuring frame timing. Red under six-way contention on the v422 '
    + 'gate, green standalone on the identical tree.',
  'fight-exit-audit.mjs': 'waits for the world to OFFER a spire and then a fight, so '
    + 'it is sampling a state that has to arrive rather than reading a settled one. Its '
    + 'own failure text says so ("no offer means the audit did not run"). Red under '
    + 'contention on the v423 gate, green standalone twice on the identical tree.',
  'gift-confirm-audit.mjs': 'polls for the DIP in a coin balance during a two-tap '
    + 'confirm, so it is sampling a value inside a window rather than reading a '
    + 'settled one. Red under contention on the v422 gate ("lowest seen 5000, '
    + 'expected 4500"), green standalone twice on the identical tree.',
};

/* THE SHAPE THAT NEEDS THIS LIST, so the next one takes a minute instead of an
   hour. Both entries above sample a value AT A MOMENT rather than reading a
   settled one: a pixel on a chosen frame, a balance during a transaction. Under
   contention the moment moves and the sample misses, and the suite reports the
   app as broken when nothing is.
   THE TEST IS ALWAYS THE SAME and it is cheap: run the suite ALONE on the same
   tree. Green alone plus red in the pack means contention, and it belongs here
   with that measurement written down. Red both ways is a real defect and does
   not. Never add a suite to this list without running that comparison, because
   a genuinely broken suite parked here is a red that has been made invisible. */

const CPUS = (await import('node:os')).cpus().length;
const GB = (await import('node:os')).totalmem() / 1e9;
/* ~1.3GB per browser, and leave 8GB for everything else on the machine */
const BY_RAM = Math.max(1, Math.floor((GB - 8) / 1.3));
const JOBS = Math.max(1, Number(process.env.GATE_JOBS) || Math.min(6, CPUS - 2, BY_RAM));

async function runPool(files, args) {
  const out = new Array(files.length);
  const done = new Array(files.length).fill(false);
  let next = 0, printed = 0;
  const flush = () => {
    while (printed < files.length && done[printed]) { results.push(out[printed]); report(out[printed]); printed++; }
  };
  const worker = async () => {
    for (let i = next++; i < files.length; i = next++) {
      out[i] = await run(files[i], args);
      done[i] = true;
      flush();
    }
  };
  await Promise.all(Array.from({ length: Math.min(JOBS, files.length) }, worker));
  flush();
}

const isSerial = f => Object.prototype.hasOwnProperty.call(SERIAL, f);
const purePar = PURE.filter(f => !isSerial(f)), pureSer = PURE.filter(isSerial);
const browPar = BROWSER.filter(f => !isSerial(f)), browSer = BROWSER.filter(isSerial);

console.log(`running ${PURE.length + BROWSER.length} suite(s), ${JOBS} at a time`
  + ` (${CPUS} cores, ${GB.toFixed(0)}GB; GATE_JOBS=1 to go back to one at a time)`);
if (pureSer.length + browSer.length) {
  console.log(`  ${pureSer.length + browSer.length} run alone: `
    + [...pureSer, ...browSer].join(', '));
}

await runPool(purePar, []);
for (const f of pureSer) { const r = await run(f, []); results.push(r); report(r); }
await runPool(browPar, [base]);
for (const f of browSer) { const r = await run(f, [base]); results.push(r); report(r); }

if (own) own.server.close();
if (!runAll && FULL.length) {
  console.log(`\n${FULL.length} audit(s) not in FAST were skipped (everything not named in FAST lands here).`);
  console.log('Run them before a release:  node tests/release-gate.mjs --all');
  console.log('NOTE: this is a tally, not a guard, but a new audit can no longer be swept');
  console.log('      in here silently: the COVERAGE assertion above refuses to start a');
  console.log('      browser until every file on disk is DECLARED with a reason.');
}
const unprv = results.filter(r => r.code === UNPROVEN);
const bad = results.filter(r => r.code !== 0 && r.code !== UNPROVEN);
/* GREEN IS COUNTED OUT OF WHAT WAS ACTUALLY GRADED, and the unproven suites are
   never folded into either half of that fraction. "50/53 suites green" with
   three unproven reads as three failures; "50/50 suites green" with three
   unproven reads as a clean run. Both are wrong, so the count says how many
   were run at all and the unproven ones are named on their own line. */
const graded = results.length - unprv.length;
console.log(`\n${graded - bad.length}/${graded} suites green against ${base}`);
if (bad.length) console.log(`BLOCKED: ${bad.map(r => r.file).join(', ')}`);
if (unprv.length) {
  console.log(`\nUNPROVEN HERE: ${unprv.length} suite(s) did NOT run and are NOT green.`);
  for (const r of unprv) {
    const u = unprovenLines(r.out);
    console.log(`        ${r.file.padEnd(26)} ${u.rows} check(s) not graded`);
    for (const w of u.why) console.log(`          ${w}`);
  }
  console.log('        These guard shipped surfaces and this machine cannot host them.');
  console.log('        Run the gate somewhere that can before calling a release checked.');
}
/* Release on the way out, pass or fail: a lock only ever left behind on a RED run
   trains everyone to ignore the line, which is how it stopped meaning anything. */
await releaseLock();
/* A real failure outranks an unproven suite: if something was driven and
   misbehaved, that is the headline and it exits 1. With nothing failing but
   something unrun, the gate exits 97, which is non-zero (this run certified
   nothing) and distinguishable (nobody should go hunting for a defect). */
process.exit(bad.length ? 1 : unprv.length ? UNPROVEN : 0);
