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
const PURE = ['unit.test.js', 'facegate-audit.mjs', 'garden-appetite-guard.mjs', 'pit.test.js', 'quest-daymore-audit.mjs', 'quest-pick-audit.mjs', 'first-fight-audit.mjs', 'analytics-tag-audit.mjs', 'icon-inventory-audit.mjs', 'version-stamp-audit.mjs', 'boneyard-supply-audit.mjs', 'loot-fallback-audit.mjs', 'guard-hygiene-lint.mjs', 'rack-theme-lint.mjs', 'pet-accessory-lint.mjs'];
const BROWSER = [
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
  'news-tab-audit.mjs',      // every announcement still opens with its art
  'art-register-audit.mjs',  // cosmetics register on ink, not on boxes; node-only and half a second, and it REPLACES grill-fit-audit.mjs, which belonged to no tier and so failed the coverage assertion below on every run
  'mini-theme-audit.mjs',    // roaming mini-bosses are drawn as themed monsters
  'remote-den-audit.mjs',    // the daily free boss reads as beaten, and moves the cap
  'bestiary-audit.mjs',      // the teaser stays a teaser, and since 2026-08-21 Today names no hunt at all: its row went with the "Out there today" card, so the Today half of that file is now an ABSENCE graded against the teaser wall as its control
  'hype-banner-audit.mjs',   // the Today hype banner, on the app's default screen: the two new Boneyard creatures and the new pet, in ONE banner above the step winner. Three ways this fails silently and none of them throw: a creature that never decodes (graded on naturalWidth after an awaited decode, because an empty box measures perfectly), the banner growing until it pushes the ring further down than the 275px banner stack it replaced did (bounded against 1133 / 973, measured on 6212e75), and the copy clipping (scrollWidth against clientWidth, not a character count). Both viewports, because the ten words and the three figures fail differently at 320 than at 393. SETUP refuses to grade anything unless Today rendered AND the banner is on it, and the two ROUTE rows drive the real buttons because the whole point of the two halves is that they land in two different places

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
  'wheel-audit.mjs',         // daily spin appears + double-dip refused + each of five silent-retirement gates named
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
  'reward-sop-audit.mjs',    // every paying action against the rewarded-actions SOP: COVERAGE derives the paying call sites from js/*.js (158 sites in 53 actions across 44 modules) so a NEW payout nobody registered fails, UNDRIVEN prints the 34 registered-but-not-driven actions with their reasons every run, and REPEAT performs 20 actions twice against a real IndexedDB, sequentially AND concurrently. NO-OP pins the other half of a kv-backed claim: an action that decides nothing is owed must not write over the record it consulted, which every REPEAT row is blind to because the second attempt correctly pays nothing while destroying the record on its way out. Self-serving, measured 21s, 75 checks, green on the reconcile branch. Fast rather than full because it is the guard for the class that has now shipped three times, and every one of its eleven reintroductions was proven red on this tree
  'garden-closed-audit.mjs', // the Hollow and the Bone Garden are off the player's path and the Kitchen stands alone without them: every known entrance (the GROW door, the compost button, the Today ripe-crop banner and its CTA, the Kitchen badge, the speech lines, the boot popup, the News row, two quests, the seed on a map collect) operated on a real boot, plus a Kitchen with ZERO seeds and ZERO plots that renders, names the Boneyard, routes there and really cooks a dish. Its CONTROL row opens the Hollow through window.__openHollow first, so it is grading closed doors and not a deleted feature; the ripe-crop rows are graded on a save seeded with three ripe crops, because on an empty save they are absent on main too. Proven red at 405b5df: 26 FAILED. FAST because every row is a player-facing route and the whole suite is a list of ABSENT selectors, which is the class that rots into a vacuous green
  'garden-retire-audit.mjs', // the garden's closing payout pays EXACTLY once. It refunds up to 5,500 coins on BOOT, which is the shape a coin printer is made of. PAYS asserts specific non-zero numbers first so the no-op rows cannot be vacuous, then ONCE, ten repeats, a real page reload and three CONCURRENT callers each measure the coin and ingredient deltas. Proven red three ways at 405b5df: absent function (1 FAILED), an unguarded payout (10 FAILED, +16,500 coins on the race), and a non-atomic kvGet/kvSet ledger that passes ONCE and BOOT and still prints 16,500 coins on the race (4 FAILED)
  'tab-chip-audit.mjs',      // the selected tab chip stays inside a BAND, because both directions are failure: a FILL ceiling (the solid coral fill made navigation 89.8% saturated by its own area, louder than every product on the Shop) and, against over-correcting, floors on dE76 separation, greyscale ring contrast and 4.5:1 label contrast selected AND unselected. Empty is a failure: all 8 states (4 tabs x 2 viewports) must yield a selected chip and three siblings before a number is graded. Takes the gate URL via argv (env.URL second), measured 23s. Proven red four ways on pristine a181b1f: the shipped fill (FILL 89.8%, TEXT 2.39:1, RING 1.25, ARIA), a neutralised selected state (MARGIN 1.2, RING 1.00), and a removed chip row (SAMPLE 0/8)
  'dvh-fallback-audit.mjs',  // a browser that cannot parse dvh must still reach the tab bar: #app carried no height fallback, which put the navigation 2173px below the fold on Today. 24s: static coverage of every dvh/svh in the sheet, plus four boots
  'overscroll-wordmark-audit.mjs', // the Today overscroll wordmark is INVISIBLE until you pull: REST (zero ink pixels in the band at scrollTop 0, and the band byte-identical with the feature on and off), CLAMP (the engine refuses a negative scrollTop, which is why ordinary scrolling can never reach it), ABOVE, TODAY (present on Today and on none of five other screens), NO-SHIFT (all 556 element rects identical with the mark present and absent, animations frozen first and the freeze proven, because Today's idle Bonehead really does move 31 of 400 rects on an untouched tree) and INK (the revealed mark composites to rgb(142,135,126) against --text-3's rgb(143,133,120)). It does NOT test the rubber band and says so at the top: iOS overscroll is a WKWebView behaviour and no headless Chromium bounces. MECHANISM is the closest honest proxy and the row that matters most: displaced on screen, the mark's ink moves up by exactly the scroll delta, so it is proven to live in the scrolled content layer that a bounce translates. A mark that had drifted onto the viewport would sit still under a pull and reveal nothing while every other row here stayed green. Self-serving, measured 34s, 18 checks. Proven red five ways: a positive `top` (4 FAILED), position: fixed (1, and silent to every other row while the feature would be dead on the device), the class dropped from the selector so every screen gets the mark (1), opacity 1 (1), and route()'s classList.toggle deleted (7). The third of those is why TODAY grades the PAINTED pseudo-element and not the class: the first version required both, route() still applies the class on Today, and the selector rewrite that put the wordmark on all six screens left the row green at 18/18
  'talkbox-audit.mjs',       // the typing dialogue box on Today, which is the app's one talking surface and sits on the default home screen. Four pins, all on PIXELS off the box's own clipped rect because a computed style reads a visible caret off a frame nobody painted: TYPE (the ink takes 14+ intermediate amounts, so a print-at-once cannot pass, cross-checked against the DOM prefix sequence), SKIP (a real mouse click MID-LINE completes the line, with a precondition row that refuses to grade unless the tap landed between the first character and the last, and both wrong answers pinned: a no-op AND a restart), EXCLUSIVE (across every frame of a held box, never a caret and a chevron at once, which is the box saying "wait" twice) and REDUCED (every one of 39 fast samples already carries the whole line, and the caret detector that fires on the animated run sees nothing). Carries four controls because three of its rows assert a ZERO and that is the shape which passes on a blank frame: CONTROL-CARET and CONTROL-CHEVRON require each detector to fire somewhere, and CONTROL-ISOLATION requires the caret region to score zero on a finished box that HAS a name label in the same #a5e847, so a caret count is a caret and not the speaker's name bleeding in past the 2-degree rotation. Plus HITTEST in both directions (anti-regression rule 6: the box owns its centre while the line is live or it can never be skipped, and hands it back once a self-dismissing line is done or it eats a 42%-wide Backpack target) and COVERAGE, which derives the graded set from js/*.js so the NEXT chat bubble converted to a talk box fails this audit until it is driven or excused. Self-serving, measured 24s, 40 checks. FAST because it is on the app's first screen and because being unable to hurry a talking box along is, in Tom's words, the single most irritating thing about this pattern
  /* THE TWO ICON-RENDER AUDITS. boneyard-icon-audit landed on main with NO
     TIER, which means the coverage assertion below has been red and `npm run
     gate` has been exiting 1 before a browser started, for the fourth time (see
     the crate-palette, xp-cap and nine-that-landed entries below). Declared here
     rather than left, because everything in this branch runs behind it. */
  'boneyard-icon-audit.mjs',    // the Boneyard map and its key draw the same pixel art at whole steps and it actually decodes. Six rows and four controls, self-serving, measured 35s green at 41 decoded pixel imgs. Its VECTOR row fails in BOTH directions on purpose: a new spawn falling back to vector is the v416 bug returning, and the day the food-find drawing lands it goes red and says to wire it
  'pixel-art-swap-audit.mjs',   // the TEN screens the Boneyard audit does not reach, rendered: no screen draws a vector or an emoji at >= 16px for a concept that has pixel art on disk, no pixel <img> lands off a whole step, and no call site reserves space the snapped art loses more than a fifth of. Identifies a drawing by its own path data normalised through the page's serializer, never by a class name, because the defect is a SILENT fallback that looks right in source and right in the DOM: it is why 305 graded sites and a 7/7 green icon-inventory coexisted with three vector wedges on the daily wheel. Also pins the wheel's WORDS against its pictures (LABEL): each wedge's tag must be a whole word of the Shop's own label for the thing that wedge draws, resolved by hit-testing which sector <path> the word and the picture each sit inside. That is the defect a medium swap creates and no other row can see: the gold wedge came out of the swap with the right art, the right grant and the word GOLD over a picture of a bone chest. Carries TEN controls, including "all three media present", "no two drivers landed on the same screen" and "every wheel word paired to exactly one named picture", so a row for a medium the probe cannot see, or a screen a driver silently missed, fails instead of passing on nothing. FAST because this class has now shipped four separate times and Tom has found every instance of it by playing. Self-serving, measured 65s, 18 checks
  'nickname-private-audit.mjs', // the pet nickname is PRIVATE, and a leak is invisible from the UI: a nickname that reached the Crew would still render, still reload, still clear, so nothing would look broken and nobody would report it. Points the app at a fake API with social.js's own ?api= hook, drives the real controls, and reads the bytes off page.on('request') rather than grepping the source: WIRE asserts the nickname is in zero request bodies and zero URLs, with a POSITIVE CONTROL that the pet fields that ARE meant to upload were found in the same captured body, so a blind capture fails instead of passing. Also HOSTILE (a 23-char payload that really would fire, escaped at both innerHTML sites), REFUSE, CLEAR and reload. FAST rather than full because a privacy leak is silent and permanent once shipped. Self-serving, measured 58s, 58 checks
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
    + 'file precached the chest never opens, which is why sw.js carries it.'],
  'wanderer-boneyard-audit.mjs': ['full', 'the Wanderer outdoors: one RARE spawn in four is him, DERIVED from the spawn id so a guarded egg '
    + 'stays guarded across refreshWorld, offline and on every device, and re-rolls when the 45-minute instance turns over. '
    + 'Run it on any change to js/wanderer.js, the rare spawn in js/hunt.js, or the collect handler in js/app.js. It also pins '
    + 'the ceiling decision: a Boneyard Wanderer mints NO bossfirst marker, so five wins move endlessCeiling by 0, with the '
    + 'Glutton driven in the same session as the control that the instrument can move at all. Full rather than fast because it '
    + 'boots a page and claims against the real IndexedDB; about 25s.'],
  'gauntlet-sim.mjs': ['skip', "a MEASURING INSTRUMENT, not a pass/fail check: it prints win rates and asserts nothing, "
    + 'so running it on every gate would burn minutes to prove nothing. Declared skip rather than hidden in HELPERS, because '
    + 'HELPERS is for modules the checks themselves import and nothing imports this one. Run it BY HAND whenever a Gauntlet '
    + 'multiplier, a talent tree or a drawn boss changes. Its own header records why it exists: the Mimic was specced at 1.05x '
    + 'and measured 12.0% player win against 28.8% for an ordinary rung, and the Wanderer was specced at 1.22x to sit above the '
    + "Glutton's 1.18x and measured EASIER than him. Reading the multiplier is not the same as knowing the difficulty."],
  'boneyard-icon-audit.mjs': ['full', "the Boneyard and its map key draw the same pixel art at whole steps, and it decodes. "
    + 'Run it on any change to pixCur, crateIcon, the map key or the marker sizes. It is full rather than fast because it '
    + 'boots the Boneyard map, so it wants the same reachable vector tile host as boneyard-audit. '
    + 'NOTE, worth fixing separately: unlike boneyard-audit it carries no capability probe and no UNPROVEN exit, so on a host '
    + 'with no route to the tile server its CONTROL row is the only thing standing between a tile-less run and a vacuous pass.'],
  'purchase-write-failure-audit.mjs': ['full', "a rejected write during a rack purchase must not cost the player the coins AND the piece. "
    + 'Run it on any change to buyRackItem, grantCosmetic, markPaid or the db write paths. It makes the real db.addIfAbsent reject '
    + 'for the one row grantCosmetic writes, which is what quota, abort and the wipe-protocol freeze do to that same call, so no app '
    + 'logic is stubbed. Proven red on origin/main c3b7bc9 (3 rows) before the fix existed: 300 coins charged, no piece granted, and '
    + 'the retry answered owned while the player owned nothing, which made the piece unbuyable forever.'],
  'hero-share-audit.mjs': ['full', "a big pet shares the Today frame, and a normal pet changes nothing. "
    + 'Run it on any change to the Today hero, PET_HERO_PX, or the bhIdle keyframes. Full because it equips two pets and '
    + 'renders the screen for each. Its CONTROL row is the point: the shift composes through --bh-shift INSIDE bhIdle (a static '
    + 'translate on .hero-char is overwritten by the animation), and --bh-shift is a custom property, so setting it one level up '
    + 'walks the PET left by the same 58px. Proven red both ways on 2026-08-21: flagging every pet as sharing reddens CONTROL, '
    + 'and moving the property to the scene reddens the pet-inheritance row.'],
  'emporium-audit.mjs': ['full', "Gwart's Emporium: the shopkeeper takes the header's room, not the shelves'. "
    + 'Run it on any change to gwartHeroHtml, the .gw-* block in app.css, or the hub tab scoping. Full because it drives four hub '
    + 'tabs and reads pixels back. WRITTEN BECAUSE app.css PROMISED IT: the block ended with \"Guard: tests/emporium-audit.mjs\" '
    + 'and that file existed on no ref, which reads as covered to the next person. Proven red twice on 2026-08-21: restoring '
    + '--gw-off (the union-of-both-layers centring) puts CENTRED at 202.0 against 196.5, and hiding the floating gear without '
    + 'giving it back reddens SCOPE.'],
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
  'crew-pair-audit.mjs': ['full', 'the friend and crew flow with TWO real browsers against a real Worker it starts itself: add, accept, gift, the delivery-once guard, the daily caps, self-directed cases and removal, every one read from BOTH sides. FULL rather than FAST because it boots two Chrome profiles and a wrangler dev with a local D1 (about four minutes), and because a box with no wrangler cannot run it at all. Every other social audit in this directory drives one browser against a seeded fixture, so this is the only coverage of anything that needs two participants.'],
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
  'melt-ui-audit.mjs': ['full', 'the Salvage Bench: entrance visible without a tap, every row actionable, melt pays exactly once (SOP), every rarity meltable, and transmog on a stat-less slot is offered AND free AND actually changes the look.'],
  'offline-boot-audit.mjs': ['full', "the other half of v197's network-first shell: the app has to boot with no network. The old note here said it was RED for a missing PRECACHE entry; that was fixed, and it stayed red for a second reason that was not the app at all. Its offline proof is 'the worker's cache did not grow', which assumes the worker only puts after a network response, and sw.js's static branch fetches at default cache mode so a warm Chrome HTTP cache answers with res.ok and the entry is put with nothing crossing the wire: measured 137 -> 156 with the server stopped and the origin refusing, 137 -> 137 with Network.clearBrowserCache first. setOffline now clears it, which is also the harsher test. 16/16, exit 0, 2026-08-17. Owns its server (it has to stop it), so it takes ~90s."],
  /* THE NETWORK BETWEEN OFF AND ON, which nothing here had ever driven. */
  'flaky-network-audit.mjs': ['full', "offline-boot proves the app BOOTS with no network; this drives what happens when you press things, in the three states that are not 'on': GONE, HANGING (accepted and never answered, which no catch in this app could ever reach) and FLAP (the server acts, the answer is lost). Grades what reached the store AND what the player was told, with an online CONTROL twin on every offline row and every gift row gated on the sheet having opened, so an empty sample set cannot read green. Proven red at ddbb079 with only this file copied into a throwaway tree: 11/31 there against 31/31 here, and the 20 red rows are the findings, not a broken harness (its OFFLINE-FIRST rows and every online CONTROL twin are green in BOTH trees). 32/32 and 191s measured on the final file, green on three consecutive runs. Self-serving, and it stops its own server and clears the browser HTTP cache, so 'full' rather than fast."],
  'onb-audit.mjs': ['full', 'onboarding on a virgin IndexedDB, the only suite that sees the launch funnel.'],
  'out-there-audit.mjs': ['skip', 'its whole subject is the "Out there today" card, which came off Today on 2026-08-21 when Tom asked for every banner except the step winner to go and one hype banner to replace them. outThereHtml and its four row builders are intact and unreachable in js/app.js (revival is one call plus the heldSpires read), so this file is kept as the record of what the card had to do. tests/hype-banner-audit.mjs guards what stands there now, including a GONE row that fails if the card comes back unasked.'],
  'pit-refresh-audit.mjs': ['full', 'the Pit re-renders when a fight ends: beaten remote den stops offering FIGHT without a reopen.'],
  'paddock-scene-audit.mjs': ['full', 'the Paddock end-to-end: real chip tap, decoded herd, band rule in the live DOM, motion as rendered pixels.'],
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
const lockPath = pjoin(repoRoot, '..', 'CHAT-HANDOFF.md');
const owner = (process.argv.find(a => a.startsWith('--as='))?.slice(5)) || process.env.GATE_OWNER || '';
const noLock = process.argv.includes('--no-lock');
const LOCK_RE = /^(\s*GATE LOCK:\s*)(.*)$/m;
let lockClaimed = false;
async function readLock() {
  try { return (await readFile(lockPath, 'utf8')).match(LOCK_RE)?.[2]?.trim() ?? null; } catch { return null; }
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
for (const f of PURE) { const r = await run(f, []); results.push(r); report(r); }
for (const f of BROWSER) { const r = await run(f, [base]); results.push(r); report(r); }

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
