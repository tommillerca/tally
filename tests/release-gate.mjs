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
   accounts players.is_test hides. Its second section (2026-09-02) pins the
   registration NO test file makes: a masked audit lets the app itself register
   against PROD_API, which is how production went 73 -> 93 players in a day. It
   drives godmode's maskWebdriver with a stand-in page rather than grepping for
   it, so it is still instant and still needs no browser. */
/* render-sink-lint is PURE for the same reason guard-hygiene-lint is: it reads
   js/*.js and finishes instantly. It exists because packCardHtml's `stats` slot
   and openPackReveal's `footerNote` were raw HTML held up by ONE caller
   remembering to esc() a server sentence built around another player's typed
   name (proven executable on 2026-09-01 against 996f28b9: a payload fed through
   the real window.__packReveal set its flag and left two live img[onerror]
   nodes). It is deliberately narrow: js/app.js has 570 raw ${obj.prop}
   interpolations inside markup and virtually all of them are numbers, widths,
   colours and catalog ids, so the rule names the FIELDS that can only ever hold
   another player's text rather than flagging raw interpolation as such. Measured
   both ways: two findings on the pre-fix tree, zero on this one. */
/* thumb-freshness-lint is PURE and takes ~3s: no browser, it shells out to
   scripts/build-bh-thumbs.py --check, which regenerates every square thumbnail
   in memory and diffs it against the committed file. assets/bh/thumb is
   GENERATED and committed BY HAND, so a redrawn master with no re-run leaves
   every tiled surface serving old art with nothing thrown: eight cosmetics were
   in that state from 2026-08-16 to 2026-08-24 (IL9 differed on 24.6% of its
   tile) because v385 redrew the masters two days after the sheet was built.
   And C6, the 50,000-coin pet, had no square tiers at all, which the Collection
   asks for by name on any account that owns her: measured on e2cb252d, a 404
   and a broken-image icon over the alt text "Bumbleseal", because that grid's
   <img> carries no onerror to fall back with. Its two CONTROL rows run the real
   checker against a deliberately broken three-file tree, so a blind checker
   cannot report clean, and PARITY pins the generator's slot list against
   js/app.js's BH_THUMB_RE, which is the enumeration both of them share and the
   one mutation the first draft could not see. */
/* backup-key-audit is PURE and belongs in EVERY gate run, not the --all tier:
   it guards the E2E cloud backup's key discipline, which is total-loss class
   (the 2026-08-31 chain: a device's first-ever blob embedded a keyless
   identity, the boot/cloud MERGE let that blob overwrite a second device's
   good key, the second device re-minted, and the two devices then encrypted
   under different keys with the cloud copy's decryptability flipping on
   whoever pushed last, reported to the player as "no save to pull"). No
   browser: an in-memory IndexedDB + fetch shim under the REAL js/social.js
   and js/db.js, two devices as two dbNames, ~2s. Rows: the first blob carries
   the key, the merge never overwrites a device key the device holds (with
   payload-wins and fresh-install controls), the full two-device round trip
   ends with A still able to decrypt, a wrong-key blob is named
   reason:'decrypt' at both surfaces instead of "no save", plus pet-pool-style
   source rows so the next rewrite of pushBackup / importAll / the two toasts
   fails by name. Proven red on a pre-fix snapshot of 61249c4b: 12 of 24 rows
   red, controls green; the exact measured output is in the file header. Run
   it on any change to pushBackup, pullBackup, adoptIdentity, importAll,
   DEVICE_KV or the restore toasts. */
/* backup-encoder-audit sits beside backup-key-audit for the same reason, and it
   is the one that has to run FIRST in spirit: the key discipline protects a blob
   that, before 2026-08-31, a mature save could never write at all. The encoder
   spread the whole ciphertext into one call, blew the stack past roughly 110KB,
   and pushBackup's blanket catch turned the throw into a silent false on every
   push path. Node-only and milliseconds, so there is no reason it should not
   run on every gate rather than only the full tier. */
const PURE = ['backup-encoder-audit.mjs', 'backup-key-audit.mjs','unit.test.js', 'facegate-audit.mjs', 'garden-appetite-guard.mjs', 'pit.test.js', 'quest-daymore-audit.mjs', 'quest-pick-audit.mjs', 'first-fight-audit.mjs', 'analytics-tag-audit.mjs', 'icon-inventory-audit.mjs', 'version-stamp-audit.mjs', 'boneyard-supply-audit.mjs', 'loot-fallback-audit.mjs', 'guard-hygiene-lint.mjs', 'guard-provenance-lint.mjs', 'feedback-status-lint.mjs', 'rack-theme-lint.mjs', 'rack-rotate-audit.mjs', 'pet-accessory-lint.mjs', 'pet-pool-audit.mjs', 'manifest-exports-audit.mjs', 'xp-curve-audit.mjs', 'live-api-register-lint.mjs', 'claim-evidence-lint.mjs', 'thumb-freshness-lint.mjs', 'render-sink-lint.mjs'];
const BROWSER = [
  /* the raw-sink fix's STATE half. render-sink-lint pins the source, and this
     repo has watched shape assertions stay green over broken state, so this one
     feeds a real `<img src=x onerror=...>` through the real window.__packReveal
     and reads the real DOM back: FIRED, NODES, and the payload arriving as TEXT
     rather than merely being absent. Its two CONTROL rows are the ones that stop
     a fix that simply drops the field: a legitimate note carrying an ampersand,
     a quote and angle brackets must read back verbatim with no visible entities,
     which is red on the PRE-FIX tree too (the raw sink ate "<Graveholt>" as an
     unknown tag). Measured on 996f28b9: 2/6. On this tree: 6/6. One boot, ~15s */
  'pack-sink-audit.mjs',
  'write-failure-seam-audit.mjs', // a rejected write is announced and re-thrown, and the ATOMIC primitives are in the seam: the reward SOP routes every payout through addIfAbsent/take/kvUpdate, which bypass db.put entirely
  'write-failure-toast-audit.mjs', // the OTHER half of that seam: it ends in `if (!writeFailureSink) return;` and until now nothing in the app called onWriteFailure, so every rejection returned early and a lost meal, weight, crate or coin row stayed as silent as before the seam existed. The seam audit cannot catch that and should not: it registers its OWN sink to observe the seam, which is exactly why it stays green while the app has none. This file registers nothing, breaks a real write in the real page and reads the real #toast. REJECTS is the positive control (a write that quietly succeeded would make every other row vacuous); LOUD fails on SILENCE; QUIET, THROTTLE, QUOTA and NORECURSE cover the four ways announcing it can go wrong. Proven red against main's js/app.js: LOUD, THROTTLE and QUOTA go red together. Self-serving, ~50s, 6 checks
  'fight-tray-audit.mjs',    // move-button text inside its own box, and a scrolling tray that says it scrolls
  'fight-exit-audit.mjs',    // where a finished fight puts you; its COVERAGE half fails on any new fight mode that never declares an exit. Its six LIVE rows need a reachable vector tile host (the only route to a spire fight is a marker on the Boneyard) and report UNPROVEN with exit 97 without one: four of them used to be nested inside `if (launcher)` and simply vanish, taking the denominator with them (22 assertions instead of 26, summarised as 20/22). It stays in FAST because the static COVERAGE half needs no browser and is the half that catches a new fight mode with no exit rule
  'precache-audit.mjs',      // a module missing from PRECACHE = a blank app on one bad bar
  'precache-assets-audit.mjs', // non-module assets: blocks each and grades FATAL vs BOOTS-WITHOUT + records install byte-weight
  'foods-delete-audit.mjs',  // deleting a custom food must not take your logged history with it
  'recovery-audit.mjs',      // a FAILED restore must never destroy the save it was meant to replace
  /* 'spire-intro-audit.mjs' and 'teaser-fire-audit.mjs' both graded that an
     announcement FIRES FROM BOOT, which was the right guard while announcements
     fired from boot. On 2026-08-25 every one of them left the launch path (Tom:
     "i see in the simulator you have popups showing i told you to remove all
     those from the game?"), so both files were deleted with the behaviour they
     guarded rather than left to drive a path that no longer exists. Same
     treatment nudge-skip-audit.mjs got below, for the same reason. The cards
     themselves are still guarded: news-tab-audit.mjs opens every one of them
     through its News row and requires real art. */
  'first-session-audit.mjs', // and the guard that replaces both: ZERO sheets, veils or posts across 40s of a real cold launch, with navigator.webdriver MASKED so the app cannot self-suppress the way it does for every other suite here. It also grades the launch queue statically, so a new announcement scheduled in boot() fails by name before it can ship. Was PURE and a source scan; a source scan for `claimBootSheet(` was green through all six of the interruptions Tom counted on 2026-08-25, because three of them never claimed. Measured on origin/main at 23de102b: COLD 2. On this tree: COLD 0. Proven red by restoring one call: QUEUE and COLD go red together
  'shell-watchdog-audit.mjs',  // the dead-shell watchdog reloads a dead shell and NEVER a live one. It read #screen.children.length at ONE instant 12,000ms after load, and #screen has a legitimate transient zero: route() clears it and rebuilds, about 11ms wide. Land the timer in that window and a healthy app is declared dead and RELOADED under the player mid-session. Tom hit it on 2026-08-27 tapping a news row shortly after opening ("i clicked on one, it reset the app"), and it is what made newcomers-audit fail about one run in six on EVERY build including v456, whose setup lands its first evaluate at ~12,000ms. Empty must now be SUSTAINED across ten samples over a second: a dead shell is empty forever, a route gap is empty for one. Deliberately NOT a flag set by js/app.js, because this watchdog exists for the case where app.js died and a flag it never set would be no evidence. Grades the SHIPPED script, read out of index.html and driven against a fake DOM, in BOTH directions: LIVE (a momentarily empty healthy app is not reloaded), DEAD (a shell that never renders is), ONCE (and only once, so a broken build cannot reload-loop). Proven red by restoring the one-shot sample: LIVE alone red at 1 reload. Node-only, instant.
  'dead-shell-audit.mjs',    // a dead shell recovers itself once, and never loops
  'water-cache-audit.mjs',   // THE GROUND UNDER YOUR FEET DOES NOT BECOME UNKNOWN. js/water.js caps its tile cache and swept it by iterating the Map, which iterates in INSERTION order, so it threw away the OLDEST-FETCHED tiles: the ones under the player, fetched first when the map opened and read on every pass since. One wanderersNear call walks nine cells whose candidate laps reach past the warmed block, trips the cap, and the sweep takes the home tiles with it; isWater then answers undefined for the cell the player is standing in, which wandererAt cannot tell apart from "all water", so THE WANDERER VANISHES and returns on the next 5s world pass. Observed while fixing the Wanderer audits: realWanderer returned w:null while a probe a second later said wandererAt(2464,-6156) was true. Grades the PROPERTY, not the policy: a point that HAS answered keeps answering while the player walks and the cache churns, so it stays true if the eviction is ever replaced. HOLD records EVERY pass rather than the last, because a read of an evicted tile also re-fetches it and re-inserts it at the tail, which immunises it against the very sweep under test: my first version checked only the end and its prove-red PASSED. Proven red on the restored insertion-order sweep: 1 of 11 passes read undefined, first blank after 77 points, WARM and CHURN still green.
  'harness-leak-audit.mjs',  // A KILLED AUDIT DOES NOT LEAVE A BROWSER BEHIND. Tom, 2026-08-27: "can you find a way to not just leave insane 1200% cpu loops melting my computer in the future??" He was looking at an orphaned chrome-headless-shell (ppid 1) whose GPU child sat at 1200% CPU, eleven cores of SwiftShader software rendering, for 1h37m with no parent and no page doing anything, left by an audit a 2-minute harness timeout SIGKILLed. EVERY backstop in godmode.js runs inside the node process, so SIGKILL beats all of them; the file said as much in a comment and delegated the case to the census, which only pays out on runs the census performs. The fix is a detached /bin/sh nanny that watches OUR pid and kills the browser when we are gone, so it cannot be killed with us. This grades the property against the operating system: launch a real browser, SIGKILL its audit the way the harness does, then ask whether the browser is still there. ALIVE and KILLED are controls so "the browser is gone" cannot pass on a run that never launched one or on a process still tidying up after itself. STRAY grades the separate ppid-1 sweep that bounds anything escaping the nanny, and kills the nanny first so it cannot pass as a second copy of REAPED. Measured: reaped 1258ms after the kill. Proven red twice, each isolating its own row: removing the _nanny call reds REAPED alone with the pid still alive at 20s; disabling the sweep reds STRAY alone at "swept 0".
  'boot-flash-audit.mjs',    // the first painted frame is never bare furniture. #tabbar and #gearBtn are static markup in index.html, so before the fix they painted at first paint on EVERY boot, ahead of the JS-built splash: an empty Today with the bottom bar on it, which is what Tom reported on 2026-08-19. Grades PIXELS off a CDP screencast started before navigation, cold AND warm, at 440x956 and 393x852, at CPU x6 so the window is ~20 frames wide instead of one. Bound is ZERO bare frames, not fewer. Carries its own controls: the capture must contain a frame from before the app had content (else the run could not hold the bug), and some frame must score a real tab bar over real content (else the detector is blind). FAILSAFE blocks a module so the app can never render and asserts app.css's 8s keyframe brings the shell back with no reload, ahead of index.html's 12s recovery, which is anti-regression rule 8 as an assertion. NAVIGATION is the regression the fix could most easily cause and pins it: the bar never blinks out on a real tab click. Self-serving, measured 54s, 35 checks. FAST because it is the app's first impression and because the failsafe row is the only thing standing between this fix and a permanently hidden shell
  'route-flash-audit.mjs',   // and no NAVIGATION shows the tray either. Same bug class one layer in, reported by Tom on 2026-08-21: route() stripped `screen-in` before the new screen existed, so every real tab change opened a hole onto the body gradient and the bare bar. Measured on pristine main at 440x956 through a CDP screencast, Boneyard -> Today: 4 bare frames / 108ms at CPU x1, 6 / 136ms at x6. Bound is ZERO, not fewer. Grades two swaps (the full-bleed `.screen--map` Boneyard, and a padded screen to one full of canvas art) plus a reduced-motion pass. CONTROL re-runs the same graded swap with `.screen-held { display: none }` injected, which puts the app back to exactly the bug, and REQUIRES bare frames: a green FLASH beside a green CONTROL is an audit grading nothing and fails. FAILSAFE and SWEEP are the regression this fix could most easily cause and the reason it is FAST, not full: the fix parks a copy of the outgoing screen over the live app on every single navigation, so a copy that is ever stranded is a frozen app, and FAILSAFE serves a revealWhenReady that never resolves to prove the 1200ms cap takes it off anyway. Self-serving, measured 119s, 39 checks
  'handover-audit.mjs',     // and the swap ITSELF hands over on one frame. Tom, 2026-08-21, after the tray flash above was fixed: "switching between tabs is not smooth it's showing a staggered preview of the the existing page as you swap". The fix for the flash parks a copy of the outgoing screen over #screen, and that copy then DISSOLVED over .18s on a 260ms timer, so from the moment the new screen was ready both screens sat on the glass together: measured at 440x956, CPU x6, through a CDP screencast on a real tab tap, Boneyard -> Today held the old paint whole to 144ms and then showed the two superimposed until 418ms, Crew -> Today to 503ms. It grades dOld, one number per frame: the distance from a screenshot of the settled OUTGOING screen, taken on the run, with the bands calibrated per pair against that screen's own idle churn. A healthy handover steps old -> new in ONE captured frame at 0.977 to 0.998 of the old/new distance; the dissolve holds a plateau at 0.78 to 0.80 for a quarter of a second. The edge is 0.90, it sits in a gap with 0.077 of headroom either side, and the arrival's actual score prints in every row so drift is visible before it is a red. Bound is ZERO ghost frames, not fewer. It grades the HUB CHIPS too, which were the worst case in the app and the one tab-like control reaching neither route() nor openSheet(): Wardrobe -> Shop threw the old panel away at 34ms and assembled the new one in four visible stages to 395ms. CONTROL serves a js/app.js and a stylesheet with the dissolve put back and REQUIRES ghost frames, because a green GHOST beside a green CONTROL grades nothing, and the FIRST draft of that control was itself the bug: it declared the transition inside drop(), which runs in the same task that schedules the reveal, so nothing animated and it reported zero. CAP is the other row and it is a DOM fact rather than a millisecond budget on purpose: no image the reveal waits on may still be undecoded once a screen has settled, across all four tray destinations and all four hub tabs, which is the condition that pins an arrival to revealWhenReady's 700ms cap (the Shop sat on it, cold and warm, waiting on ten `loading="lazy"` thumbnails laid out at zero width that decode() never settles for: content in the DOM at 21ms, reveal at 815ms, against 61-72ms everywhere else). FAST, next to the two flash audits, because it is the same surface and the same complaint one layer in. Self-serving, measured 251s, 26 checks. Proven red in four cp -R copies, one mutation each, listed in the file header
  'nav-perf-audit.mjs',      // and a navigation does not redo work it has already done. Tom on v421: "things are buggy, choppy, not smooth moving between pages". drawTrimmedArt found a sprite's alpha box by reading the image back off a canvas and walking every pixel in JS, and nothing remembered the answer, so every arrival at the Bonehead hub re-scanned the same fifteen files: 2,789,376 source pixels, 101ms of script, 20 dropped frames and a 76ms gap between presented frames, the app's worst navigation on all four numbers. Grades a COUNT of source pixels re-scanned across a warm lap of all four tray destinations and all four hub tabs, driven by real taps, and the bound is ZERO. It is a count and not a millisecond deliberately: an absolute ms threshold was measured here (99-109ms with the bug, 12-31ms without) and REJECTED as a property of this laptop, so the one timing row is a RATIO of two laps in the same run and the machine cancels out of it. SAMPLE and DECODED are why the zero means anything: an app that scanned nothing because it had stopped DRAWING would score perfectly, and IDENTICAL pins the one regression the fix itself can cause by comparing a genuine cache miss against a hit. Self-serving, measured 46s, 6 checks, nine consecutive greens at ratio 0.32-0.44. Proven red four ways: the memo reverted (RESCAN 8,777,728 px + WARM 0.93), keyed on the canvas instead of the src (SAMPLE + DECODED), no canvas drawn at all (SAMPLE + DECODED), and a box corrupted only on a cache hit (IDENTICAL alone, which the first draft could not see)
  'news-banner-audit.mjs',   // the collapsed news banner on Today: CLOSED on arrival (a banner that opens itself is v448's launch-takeover decision quietly reversed), every NEWS row present so the banner and the News tab cannot drift, and every thumbnail bounded to one longest side and centred. Tom: "your icons are aligned right now theyre different themes with different centreing and scaling it looks sloppy", and he was right: measured 0.36 to 3.80 of a 40px tile, a ten-fold spread, with the Discord tile 19px off centre because its art is a fixed 78px square. The News tab normalises with per-class scales (.nw-fit .42, .nw-wall .52) which covers two shapes and leaves tz-head and dc-app overflowing, so a tenth row would need an eleventh rule; this measures what each tile rendered and scales it, which is correct for art nobody has drawn yet. SAFE exists because the step-race thumb takes the player's outfit and calling it with nothing threw on `.B`, blanking the ENTIRE home screen with no page error and no console error, found by bisecting rather than reading. Proven red with the normalisation pass deleted: 24-78px, spread 54, 19px off centre, 6 overflowing.
  'news-tab-audit.mjs',      // every announcement still opens with its art
  'art-register-audit.mjs',  // cosmetics register on ink, not on boxes; node-only and half a second, and it REPLACES grill-fit-audit.mjs, which belonged to no tier and so failed the coverage assertion below on every run
  'mini-theme-audit.mjs',    // roaming mini-bosses are drawn as themed monsters
  'remote-den-audit.mjs',    // the daily free boss reads as beaten, and moves the cap
  'bestiary-audit.mjs',      // the teaser stays a teaser, and since 2026-08-21 Today names no hunt at all: its row went with the "Out there today" card, so the Today half of that file is now an ABSENCE graded against the teaser wall as its control
  'pet-ownership-audit.mjs', // a pet you OWN must exist on the two screens that list what you own. v421 sold Bumbleseal for 50,000 coins and buyPetItem wrote the inv 'cos' row and the paper-doll slot and never a petInst row, so she drew perfectly on Today (which reads the equipped SPECIES) and was absent from the Stable and the Paddock, where the Paddock fell through to lockedCardHtml and showed a silhouette carrying the Day One Lizard's copy on a pet Tom had just bought. Nothing threw and nothing looked broken. MINT is the row that catches the NEXT one, statically: every js/loot.js function that calls grantCosmetic must mint a copy in the same function or be listed pet-proof with a reason, so a battle-pass or promo pet written next year fails before it ships. TABLES pins the same shape one module over, found the same day: C6 was missing from PET_ASSIGN, whose absence makes buildBattlePet return null, so equipping the legendary gave you NO pet in the Pit, and from PET_STATS, which silently gave her a common stat line. OWNED, STABLE and PADDOCK then drive every species in the catalogue through its REAL path (the shop for anything PET_SHOP sells, grantPet otherwise, never a hand-written petInst row) and assert the real Stable draws a card and the real Paddock an unlocked tile and a non-silhouette card. RECLAIM reproduces v421's exact broken write and requires the next boot to heal it, once, without minting a second 50,000-coin pet on the boot after that. Derived from BH_ITEMS, so a new species is covered the day it lands; SAMPLE exits 2 on an empty roster rather than passing on nothing. Self-serving, ~70s, 13 checks. Proven red in a cp -R copy: v421's buyPetItem alone gives 3 FAILED, plus a deleted reclaim gives 7 FAILED including the literal 'Check your inbox, bony buddy' silhouette Tom reported, and removing C6 from the pet tables reds TABLES on its own
  'pet-wardrobe-audit.mjs', // an accessory you BOUGHT is one you can put on, and see. v422 sold five pieces at 3,500 to 12,000 coins each and shipped no way to wear them: the renderer had taken a `wear` argument since v421 and nothing in the app ever passed one, so 38,500 coins of pet clothes had nowhere to go. Tom: "did you make it possible to put the accessories on bumbleseal yet people are waiting." It drives the whole chain through the REAL controls: buy through buyPetItem, tap each of the five tiles in the Stable's wardrobe, and assert the composited layers on the pet (decoded, naturalWidth > 0, non-zero rect, never a CSS box over a blank frame). SLOT pins one item per slot, ZORDER pins the stack against PET_SLOTS with the glasses last (Tom: "the glasses are ALWAYS on top"), RELOAD pins persistence across a real page reload, SPECIES pins that an accessory drawn for one body is refused by every other pet, and SURFACES drives all four screens she is drawn on (Today's hero companion, the Stable card, the Paddock scene and a real fight plate) because equipping somewhere is not wearing everywhere. CONTROL is the negative that makes the rest mean anything: a save that owns all five and wears none draws exactly ONE layer. SNAPSHOT is static, and it is the shiny bug in a new coat: any call site drawing somebody ELSE's pet must name wear, or the viewer's wardrobe dresses a rival. FAST rather than full: 65s, and this is money the player has already spent. Proven red in a cp -R copy, mutation list in the file header
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
  'purchase-firewall.mjs',   // COSMETIC ONLY: coins must never reach a statted item (Tom's call, locked 2026-08-07). The rack is the first surface where a player spends a balance on an item, and grantCosmetic sits eleven lines from grantGear in the same module taking the same shape of argument. Two halves because each is blind to the other: RUNTIME measures inv / gearloadout / equipped / looks / paidlooks and both balances around a real buy driven through buyRackItem against a real IndexedDB, STATIC fails on any reference from the purchase path to grantGear, grantCrate, buyWeapon, equipGear, db.put('inv', kvSet('gearloadout' or kvSet('equipped'. It also pins ONCE (a second buy pays nothing, sequentially AND with three concurrent callers) and WEAR (a bought look is free to wear, graded against a negative control in the same slot so a transmogPrice that returns 0 for everything cannot pass). FAST because this one spends the player's money and every failure it catches is silent from the UI. Proven red four ways on this tree: a gear grant in the purchase path (7 FAILED), the paidlooks write deleted (3 FAILED, and the player is charged 60 dust for a look they bought), a kvGet/kvSet claim (2 FAILED, 3 concurrent callers charged 7,200 for a 2,400 item and got three grants), and paying before the claim (1 FAILED, 7,200 charged for one grant). It also drains the reroll ladder to exhaustion, because a spend with no ceiling is the other way this screen takes unbounded money: each rung charges exactly its price, the total is 2,000 coins, and a refused reroll spends nothing. SPEND (added 2026-08-31, R5-P1) grades the two shops that have NO per-item receipt because their items are meant to be re-bought: the coin shop's consumables and the drop. Both were read-then-debit across two kv transactions, so concurrent callers passed one stale check and kvBump's min:0 clamp made every overdrawn debit free. Driven with MORE concurrent callers than the wallet funds. Proven red on a cp -R of origin/main 13583e42: SPEND-MINT 4 callers granted 4 Vigor Draughts on a wallet funded for 2, SPEND-EXACT took 180 for 4 x 90, SPEND-ONCE charged 9,000 for one 3,000 jacket; SPEND-FLOOR and the CONTROL stayed green there, so the leg was really running. CROSS (added 2026-08-31) closes what every ONCE row structurally could not see: those drive the SAME item repeatedly, which a per-item receipt passes trivially, so two DIFFERENT things bought in the same instant each passed their own stale balance read, claimed their own receipt, and both clamped debits were free. Five legs on one currency-agnostic invariant, the value delivered never exceeds what was taken, with the wallet funded for the dearer item only. Proven red on a cp -R of origin/main 2faa73b6 (post-#338, pre-reorder): CROSS-RACK delivered 2,500 for 1,500, CROSS-DUST 165 for 90, CROSS-PET 15,000 for 9,000, CROSS-REROLL 800 for 500, and CROSS-TRANSMOG charged 24 dust for one 12-dust look; both CONTROL rows green there. Self-serving, measured 25s, 51 checks
  'admin-grant-audit.mjs',   // the make-good channel, at the end of the chain: a grant row on the server is not a lizard in the player's Stable. Drives the REAL ingest (social.__testApplyGrant) and asserts the granted species arrives in BOTH places ownership lives, that the payload moves no coins/dust/XP, that the companion the player CHOSE is not displaced, and that the same key delivered twice mints one copy, sequentially and concurrently. Its KEEPS row is why it is FAST rather than full: it walks every store either side of the grant and requires every pre-existing row and every kv container entry to survive, so the day this channel gains an arm that overwrites something instead of adding to it, that is a red row and not a support ticket. Self-serving, measured 17s, 9 checks plus 3 controls. Six prove-red modes in its header, all run
  'reward-sop-audit.mjs',    // every paying action against the rewarded-actions SOP: COVERAGE derives the paying call sites from js/*.js (177 sites in 61 actions across 49 modules) so a NEW payout nobody registered fails, UNDRIVEN prints the 41 registered-but-not-driven actions with their reasons every run, and REPEAT performs 22 actions twice against a real IndexedDB, sequentially AND concurrently. NO-OP pins the other half of a kv-backed claim: an action that decides nothing is owed must not write over the record it consulted, which every REPEAT row is blind to because the second attempt correctly pays nothing while destroying the record on its way out. CEILING is the half added 2026-09-01 after the round-9 sweep, and it is why three of these shipped: every other row races the SAME key, which the per-item addIfAbsent already protects by construction, so a ceiling that several DISTINCT keys share was never once tested. It races distinct quest ids against a period cap already at cap-1 (a shared COUNT) and overlapping spends against one Pit charge (a shared GATE), each with a control beside it on an unreached ceiling so a lock that never opens cannot pass. Self-serving, measured 21s, 88 checks, green on this branch. Fast rather than full because it is the guard for the class that has now shipped six times, and every one of its reintroductions was proven red on this tree
  'claimed-row-audit.mjs',   // the SIBLINGS of an atomic claim, which reward-sop-audit misses by construction: its scanner enumerates PAYOUTS, and the writer that undoes a claim usually hands nothing over. COVERAGE derives the claimed rows from the source (any row passed to kvUpdate/kvBump) and requires every plain kvSet of one of those rows to be listed as safe with a reason, so a new read-modify-write on a claimed row has to be argued for in writing; STALE fails on a listing whose site is gone, so the list cannot rot into excuses. The live half drives the measured defect: refreshPitEnergy pays nobody, runs on every Pit/home/wallet render, and on origin/main 620e852e handed the charge back on 12 of 12 renders overlapping a spend, with three fights running off zero charges against FREE_FIGHTS 3. Proven red three ways on cp -R throwaways (main's energy.js: 3 FAILED; a regressed plantSeed: 2 FAILED; a stale ACCEPTED entry: STALE), every CONTROL green in all three. Its own header records the run that was GREEN on a broken tree because the driver called the harvest before the plant and IndexedDB queued the read behind it. FAST because this is the class that has now shipped seven times and the whole static half runs before a browser starts. Self-serving, measured 40s, 12 checks
  'garden-closed-audit.mjs', // the Hollow and the Bone Garden are off the player's path and the Kitchen stands alone without them: every known entrance (the GROW door, the compost button, the Today ripe-crop banner and its CTA, the Kitchen badge, the speech lines, the boot popup, the News row, two quests, the seed on a map collect) operated on a real boot, plus a Kitchen with ZERO seeds and ZERO plots that renders, names the Boneyard, routes there and really cooks a dish. Its CONTROL row opens the Hollow through window.__openHollow first, so it is grading closed doors and not a deleted feature; the ripe-crop rows are graded on a save seeded with three ripe crops, because on an empty save they are absent on main too. Proven red at 405b5df: 26 FAILED. FAST because every row is a player-facing route and the whole suite is a list of ABSENT selectors, which is the class that rots into a vacuous green
  'merchant-retire-audit.mjs', // the Bone Merchant's closing payout pays EXACTLY once, and it is the LARGEST payout the app makes: 33,300 coins and 1,030 Bone Dust for a full rack, on BOOT, which is the shape a coin printer is made of. Same instrument as garden-retire beside it and the same reason it is FAST: PAYS asserts specific non-zero numbers first so the no-op rows cannot be vacuous, then ONCE, ten repeats, a real page reload and three CONCURRENT callers each measure the coin AND dust deltas. ROWS pins that no inventory row is deleted (plan §8: additive-only), PARTIAL pins that a duplicated inv row is paid once, and PRIZE pins that a Bonecrusher won from the Champion pays nothing because it was never for sale. Proven red on this tree by swapping the db.addIfAbsent claim for a kvGet/kvSet pair, which passes ONCE and BOOT and still prints 99,900 coins and 3,090 dust to three concurrent callers (3 FAILED)
  'freeze-refund-audit.mjs', // the Streak Freeze make-good pays EXACTLY once. Third of the closing-payout family, same instrument and same reason it is FAST: it runs on BOOT, and until v446 its claim was a kvGet/kvSet pair with the payout BETWEEN them, so two tabs both cleared the read and both paid. PAYS asserts specific non-zero numbers first so the no-op rows cannot be vacuous, then ONCE, ten repeats, a real page reload and three CONCURRENT callers each measure the coin delta. MIGRATION is the row the other two in this family do not need: the kv key is REUSED, so an install already settled by the old kvSet must read as claimed and be paid 0, because a fresh key would have paid the entire existing player base a second time. NOTHING pins that an empty save still burns the flag and is not re-checked forever. Proven red twice: on the shipped v445 code (2 FAILED, [300,300,300] and +900 for 300 owed) and on this tree by swapping the db.addIfAbsent claim back for kvGet/kvSet, which passes ONCE, BOOT and MIGRATION and still prints +900 to three concurrent callers (2 FAILED)
  'garden-retire-audit.mjs', // the garden's closing payout pays EXACTLY once. It refunds up to 5,500 coins on BOOT, which is the shape a coin printer is made of. PAYS asserts specific non-zero numbers first so the no-op rows cannot be vacuous, then ONCE, ten repeats, a real page reload and three CONCURRENT callers each measure the coin and ingredient deltas. Proven red three ways at 405b5df: absent function (1 FAILED), an unguarded payout (10 FAILED, +16,500 coins on the race), and a non-atomic kvGet/kvSet ledger that passes ONCE and BOOT and still prints 16,500 coins on the race (4 FAILED)
  'a11y-audit.mjs',          // the round-5 accessibility cluster at 375x667 AND 390x844: tap targets against Apple's 44x44 floor, the toast that ate the taps under it, contrast sampled off the render, wardrobe rarity that was colour and nothing else, the toast live region, and five Pit buttons a screen reader could not tell apart. FAST because five of the six live on Today or one tap from it, every fix is a one-line revert away, and this is App Store review surface for a submission that is imminent; 163s measured, in line with tray-destination-audit above. THE MEASUREMENT IS THE POINT. The tap-target fix is a transparent ::before, so #vigorBtn still reports a 24.9x15.5 box and a getBoundingClientRect assertion would have FAILED a correct fix; it walks outward from each centre with elementFromPoint instead, which also means a NEIGHBOUR stealing the overlap shows up as a smaller number (that is why .wallet-pill's gap went 12 to 20 and .settings-row .seg stopped shrinking, and both are measured rather than assumed). The toast is graded in TWO rendered states, the same buttons hit-tested with a real toast up and without one, keyed by index so the two passes cannot drift onto different buttons, and only a control that LOSES its tap counts, so a row already covered by the FAB cannot redden this forever. The live region is read at PARSE time through an evaluateOnNewDocument observer, because the app fires a toast during boot and reading #toast afterwards was green on the exact tree that shipped the bug. Contrast comes off a screenshot, because the failing backgrounds are a soft-light grain and a radial coral wash and neither is a backgroundColor any DOM walk can read; the sampler takes the modal pixel that is NOT the ink, after a first cut reported .hype-eye at 1:1 by electing the glyph colour. Rarity is graded as "does each tile name its OWN tier without colour", never as "do the tiers differ", because four gear pieces have four different NAMES and the first version of that row passed on origin/main where rarity was a border colour and nothing else. Controls: a 20x20 probe button that must measure under the floor, a cream-on-coral pair that must measure 2.39:1, a neighbour sweep that fails on an empty sample, and a non-empty requirement on every section. Proven red on a cp -R copy of origin/main 13583e42 carrying this exact file, with all controls still green
  'tab-chip-audit.mjs',      // the selected tab chip stays inside a BAND, because both directions are failure: a FILL ceiling (the solid coral fill made navigation 89.8% saturated by its own area, louder than every product on the Shop) and, against over-correcting, floors on dE76 separation, greyscale ring contrast and 4.5:1 label contrast selected AND unselected. Empty is a failure: all 8 states (4 tabs x 2 viewports) must yield a selected chip and three siblings before a number is graded. Takes the gate URL via argv (env.URL second), measured 23s. Proven red four ways on pristine a181b1f: the shipped fill (FILL 89.8%, TEXT 2.39:1, RING 1.25, ARIA), a neutralised selected state (MARGIN 1.2, RING 1.00), and a removed chip row (SAMPLE 0/8)
  'tray-destination-audit.mjs', // the four bottom-tray buttons are four DESTINATIONS, and a tap on one always lands there. Tom, v421: "if i tap on the bottom bonehead icon on the home tray when im in shop it does nothign. bonehead and wardrobe are not the same part of the app but they act like it sometimes based on clicks." Root cause measured, not guessed: bindTabs() navigated by ASSIGNING location.hash, and assigning a hash its current value fires no hashchange, so route() never ran; the hub's chips move the SURFACE without touching the hash, so from inside the hub the hash reports where you came IN. Same tap, same Shop screen, opposite outcomes depending on whether you arrived by chip (#/bonehead, dead) or by deep link (#/shop, works). Grades the whole 8x4 matrix: eight start surfaces including all four hub siblings, four tray buttons, a REAL mouse click at each button's centre (godmode's own note: programmatic .click() does not reach some handlers) hit-tested with elementFromPoint first. Cannot pass blind: EXCLUSIVE requires each landing to match EXACTLY ONE of four surface predicates, so a blank screen (zero) and an over-broad predicate (two) both fail before LAND is graded, and every start surface is asserted reached before its tap. Proven red four ways on this tree: the shipped bindTabs restored (EXCLUSIVE/LAND/BONEHEAD, the three hub cells landing NOWHERE), a predicate forced true (EXCLUSIVE), a lid over the tab bar (HITTEST plus four more), and a broken chip reach (SAMPLE). FAST, 8 checks, measured 150s: it is the bottom navigation, every screen has it, and the fix is one line in the one handler every tab shares
  'dvh-fallback-audit.mjs',  // a browser that cannot parse dvh must still reach the tab bar: #app carried no height fallback, which put the navigation 2173px below the fold on Today. 24s: static coverage of every dvh/svh in the sheet, plus four boots
  /* 'overscroll-wordmark-audit.mjs' graded the Today overscroll wordmark, which
     was removed on 2026-08-26 (Tom, after five releases of it: "i've lost faith
     in you being able to do this so i think we should just remove it from the
     game ... no seam, no wordmark"). Deleted with the behaviour it guarded
     rather than left driving a feature that no longer exists, the same treatment
     spire-intro and teaser-fire got.
     ITS REAL LESSON IS CARRIED FORWARD, and it is about the guard rather than
     the feature: all 53 of its rows ran on the seeded default save, so the whole
     thing was only ever tested with ONE backdrop equipped. Tom's black band was
     the empty-slot case, which the file was structurally blind to, and it stayed
     green through both releases that shipped it. hero-edge-audit.mjs below
     replaces it and sweeps EVERY backdrop plus the empty slot. */
  'hero-edge-audit.mjs',     // the wallpaper runs off the top of Today for every backdrop in the catalogue AND for none, which is the whole of that feature now that the wordmark is gone. iOS paints exactly one thing in the rubber-band region, the scroller's own background-color (measured across v434/v435/v436: a rectangle parked above the scroll origin paints NOTHING there), so this grades the resolved background-color of #screen against data/hero-edge.js, per backdrop, driven by really equipping each one. TABLE recomputes every row off the real PNG through the BROWSER's canvas filter, while the table was generated by a colour matrix in python, so agreement means two independent methods match rather than one agreeing with itself; art and table cannot drift silently. VARIED requires more than 3 distinct colours across the sweep so a build handing everybody one constant fails. NOBG is Tom's actual bug: the BG slot has NO default, so "nothing equipped" is a state real players are in, and it shipped as 110px of page background sitting on top of the hero art. GONE asserts the wordmark is removed rather than hidden, statically and in pixels. Self-serving, 22 real equips, ~60s, 6 checks
  'talkbox-audit.mjs',       // the typing dialogue box on Today, which is the app's one talking surface and sits on the default home screen. Four pins, all on PIXELS off the box's own clipped rect because a computed style reads a visible caret off a frame nobody painted: TYPE (the ink takes 14+ intermediate amounts, so a print-at-once cannot pass, cross-checked against the DOM prefix sequence), SKIP (a real mouse click MID-LINE completes the line, with a precondition row that refuses to grade unless the tap landed between the first character and the last, and both wrong answers pinned: a no-op AND a restart), EXCLUSIVE (across every frame of a held box, never a caret and a chevron at once, which is the box saying "wait" twice) and REDUCED (every one of 39 fast samples already carries the whole line, and the caret detector that fires on the animated run sees nothing). Carries four controls because three of its rows assert a ZERO and that is the shape which passes on a blank frame: CONTROL-CARET and CONTROL-CHEVRON require each detector to fire somewhere, and CONTROL-ISOLATION requires the caret region to score zero on a finished box that HAS a name label in the same #a5e847, so a caret count is a caret and not the speaker's name bleeding in past the 2-degree rotation. Plus HITTEST in both directions (anti-regression rule 6: the box owns its centre while the line is live or it can never be skipped, and hands it back once a self-dismissing line is done or it eats a 42%-wide Backpack target) and COVERAGE, which derives the graded set from js/*.js so the NEXT chat bubble converted to a talk box fails this audit until it is driven or excused. Self-serving, measured 24s, 40 checks. FAST because it is on the app's first screen and because being unable to hurry a talking box along is, in Tom's words, the single most irritating thing about this pattern
  'gwart-crate-audit.mjs',   // and the wizard who talks through that box does not say the same THING all session: the unopened-crate reminder fires ONCE per app open. Tom, 2026-08-22: "If you have an unopened crate it's all Gwart talks about that many reminders is annoying." The crate bucket is gwartPool's top early-return, so a crate sitting in the bag swallowed every other state for the whole session. Grants a real crate through grantCrate, reloads so the session under test OPENS with it (the cap is module state, which is what "per app open" means), then taps the plaque ten times with real mouse clicks and reads the box's own data-tb target line. Graded in BOTH directions, because a cap that silences him is not a fix: ONCE and ONCE-TAPS bound the reminder to the opening line, VOICE requires the ten taps after it to come back from the rest of the catalogue. CONTROL is the blind-detector, requiring the opening line to BE a crate line, so a seed that never reached Gwart or a CRATE_LINES that drifted fails by name instead of letting ONCE pass on an empty search. Proven red on the pre-fix js/app.js in a git-archive throwaway: 11 crate lines out of 11 sampled, all ten taps, 0 other lines. ~25s
  'tab-doubletap-audit.mjs', // double-tap the tab you are already on: Today and Crew scroll to the top, the Boneyard recentres via the map's OWN #mapRecenter. Tom, 2026-08-22, then 2026-08-25 for the tab that was left out: "double tapping on the crew tab doesnt take you back up to the top like it should (same as today tab) instead it refreshes it in annoying way." The guard is the risk, not the three actions: a same-tab tap route()s, and route() rebuilds the screen, which on the Boneyard tears down the live map the second tap is meant to move and on Today and Crew throws away the scroll offset it is meant to animate. Every tap is a real mouse click on the real bar, and each position row is PAIRED with an identity row (a dataset marker on the rendered child, an expando on the map instance) because on the broken tree EVERY position row passes for the wrong reason: a rebuild also lands at the top and also reopens centred on you. Measured on the pre-Crew-fix tree, signed in and scrolled: 62 childList mutations on #screen, 0 of 12 rendered children survived, scrollTop 933 -> 0 in one frame. The CREW rows sign in through renderFriends' own webdriver fixtures and assert real scrollable overflow before tapping, because the signed-out Crew is one screenful and a "scrolls to the top" row taken there starts at 0 and ends at 0 whatever the app does (anti-regression rule 3). TODAY-SINGLE and CREW-SINGLE are the controls that a lone same-tab tap still re-routes exactly as tray-destination-audit requires. FALLBACK pins the no-map case (a tray tap that does nothing is the complaint bindTabs' header answers) and STALE pins that leaving a tab inside the 300ms window builds the next screen once, counted at the app's own window.__map assignment. Boneyard rows go UNPROVEN (97) without a live map. Proven red four ways: the pre-fix app.js, the fallback dropped, the cancel moved, and (2026-08-25, a cp -R throwaway with only `friends: toTop` deleted) EXACTLY the CREW-DBL identity row, 1 FAILED, with CREW-DBL's own position row still green at scrollTop 0 on the broken tree, which is the pairing earning its keep. ~90s
  /* THE TWO ICON-RENDER AUDITS. boneyard-icon-audit landed on main with NO
     TIER, which means the coverage assertion below has been red and `npm run
     gate` has been exiting 1 before a browser started, for the fourth time (see
     the crate-palette, xp-cap and nine-that-landed entries below). Declared here
     rather than left, because everything in this branch runs behind it. */
  'boneyard-icon-audit.mjs',    // the Boneyard map and its key draw the same pixel art at whole steps and it actually decodes. Six rows and four controls, self-serving, measured 35s green at 41 decoded pixel imgs. Its VECTOR row fails in BOTH directions on purpose: a new spawn falling back to vector is the v416 bug returning, and it went red on 2026-08-21 the moment the food-find drawing was wired, which is what took its exemption list to EMPTY. It can also exit 97 UNPROVEN when the map draws no Mystery Egg to compare the key against (two independent dice rolls: an 8% rare roll per cell per 45-minute instance, then app.js placeWalkable vetoing any anchor that snaps to no walkable ground); it declares that row by name rather than passing or reporting it as an art regression
  'pet-hold-audit.mjs',         // press and hold a dressed pet and her CLOTHES light up, not the pet. Tom, v424-19: "Press and hold on bumble seal highlights her sunglasses." Fires the REAL gesture (a real pointer, at the real coordinates, held past HOLD_MS) and grades the DIFFERENCE between captures of the running screen, because tally/CLAUDE.md's FX rule was written after v245 shipped an animation nobody could see and a getBoundingClientRect reads perfectly over a blank frame. She is BOUGHT through buyPetItem and the glasses are worn by tapping their real tile, so nothing here grades a save row somebody hand-wrote. The glasses are resolved from the PET_SLOTS slot LABELLED "Glasses", never by a name regex: the first cut matched nothing, fell through to a default, and returned seven green rows about the PATCHES. FOOTPRINT measures where the piece actually is (one capture with the worn layer visibility:hidden) and every later row is compared against that centroid, so ON-THE-PIECE separates "her sunglasses are highlighted" from "the pet glows": a whole-figure glow lands its centroid on her middle, not her face. Measured 3.9px apart on a 124px pet. RESTRAINT is a CEILING, not a trend (anti-regression rule 11): 7.2% of her box lights, and the row fails above 25%, because "it lit up" with no bound passes because the app is too loud. Plus RELEASE (the released frame is byte-identical to the resting frame) and NOT-A-TAP (a 120ms press changes nothing, or she flashes on all four screens that draw her). No map and no tiles, ~50s, 7 checks
  'badge-centre-audit.mjs',     // a drawing in a ROUND badge sits in the middle of it, measured off the render rather than remembered. Tom, v424-20: "Too fast to loot icon doesn't have lightning bolt centred in the circle. Stop doing that shit." Third sighting of one mechanism in two batches (v424-7 is the same words about the Crew banner: "up in the top left ... you did this with the first step challenge foot too"), so it gets a guard rather than a promise. ROOT CAUSE of the reported one, measured not guessed: the readout wrote class="ic warn" and app.css carries a GLOBAL .warn BANNER utility with padding 10px 12px, which on a 40px border-box disc with a 3px border left a 10x14 content box around a 24px bolt, and Chrome pins an oversized grid item to the START of its area instead of centring it. Before: box (7.00,5.00)px = 43.0% of the disc radius, ink centroid 38.4%. After renaming the modifier to .fast: box 0.0%, ink 7.7%. TWO graded rows with SEPARATELY DERIVED thresholds, because they see different bugs: BOX (glyph box vs disc centre, <= 8%; every shipped badge measures 0.0%, and 8% of the smallest graded disc is 1.3px so it cannot go red on rounding) catches the layout class, and INK (ink centroid vs disc centre, <= 25%; the widest-leaning honest drawing is the Today trend arrow at 10.1% with a 0.0% box, so 25% is 2.5x the widest lean and still under the 38.4% defect) catches a drawing that is perfectly boxed and still lopsided. Weighs ink as the DIFFERENCE two captures of the same screen make with the glyph visibility:hidden, so it works identically for a PNG and an inline SVG and cannot be fooled by an <img> that laid out perfectly and never decoded (that reads NO-INK and is a FAILURE). Refuses to grade what it cannot weigh and names every such row: COVERED (hit-tested with elementFromPoint, because ink another element covers contributes no difference and vanishes from the centroid; a half-covered Bone cache read 35.3% on a 0.0% box, the same 5.38,-5.10px three runs running, reproducible and wrong every time), OVERLAP, MOVING. CONTROL refuses a pass on an empty graded set and COVERAGE requires the reported badge itself to be in the sample, driven into the real too-fast state with six real position deltas rather than by calling the readout's own render. Boots the Boneyard, so full: exits 97 UNPROVEN on a machine that cannot draw the map
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
/* THE SUITE ALREADY SAID WHY; READ THAT, DO NOT GUESS AT IT. godmode's
   unproven() prints `UNPRV <name>  DID NOT RUN: <why>`, so the reason is on the
   line this function is already counting. It was instead sniffed out of OTHER
   lines with a fixed list of machine-capability phrases, which meant any suite
   whose reason was NOT about hardware reported no reason at all.
   Measured on the 2026-08-27 gate: wanderer-water printed "3 check(s) not
   graded" and nothing else, under a banner asserting "this machine cannot host
   them", while its actual reason was "today's seeds put no relocatable Wanderer
   in the Toronto waterfront band" -- a DATE SEED. No machine on earth fixes
   that, so the advice sent whoever read it hunting for different hardware.
   The capability sniff is kept as a supplement, because some suites print that
   detail on a separate line, but the authoritative reason now comes first. */
function unprovenLines(out) {
  const lines = out.split('\n');
  const unprv = lines.filter(l => l.startsWith('UNPRV '));
  const stated = unprv.map(l => (l.split('DID NOT RUN:')[1] || '').trim()).filter(Boolean);
  const missing = lines.filter(l => /is UNREACHABLE|no webgl|will not link|read back as|measured NOTHING/.test(l));
  const why = [...new Set([...stated, ...missing.map(l => l.trim())])].slice(0, 3);
  /* A reason is a MACHINE reason only when it says so. Anything else (a date
     seed, an empty data state) is not fixed by running somewhere else. */
  const machine = why.some(w => /machine|webgl|tile host|unreachable|cannot draw|cannot host|hardware/i.test(w));
  return { rows: unprv.length, why, machine };
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
  'badge-centre-lib.mjs', // the badge measurement badge-centre-audit.mjs drives; no assertions of its own
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
  'version-align-lint.mjs': ['fast', 'web versions (app.js APP_BUILD, sw.js VERSION, version.json) are consistent, and each native shell (iOS, Android) is marked with which web build it last wrapped via WRAPPED_WEB_BUILD comment. Node-only, sub-second. Pins version alignment so release notes and support can correlate tickets with the web version each native shell bundled.'],
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
  'hollow-backdrop-audit.mjs': ['full', 'renders all three time bands and hit-tests an 800-point grid to prove the backdrop takes no taps. Slow by construction.'],
  'hollow-beds-audit.mjs': ['full', 'renders every plot state and measures them apart by pixels. Slow by construction.'],
  'arena-static-probe.mjs': ['skip', 'a PROBE by its own first line: it measures whether .arena shifts when the action tray changes button count, and prints the numbers. The guard for that behaviour is fight-layout-audit.mjs.'],
  'today-d2-shots.mjs': ['skip', "capture only: the four Today states at 390x844 dark, for review. tests/today-container-audit.mjs is the guard, and it is in FAST."],
  'badges-audit.mjs': ['skip', 'seeds the four Warden badges and shoots the wall for review; a screenshot script, not a regression guard.'],
  /* UN-SKIPPED 2026-09-03. Both halves of that note had gone stale: the fixed
     scratch dir became godmode's shotDir, and it does assert layout, six rows
     of it. The one that matters is DAY TAIL, which grades that the day ends on
     the sign-off with the micronutrient line before it, re-anchored in #370 to
     the day block rather than the page (the promo slot and the log-only line
     are queued below the whole day on purpose). Verified green twice solo on
     this tree, on a machine that was NOT quiet, before it was added here. */
  'ledger-voice-audit.mjs': ['full', 'the ledger speaks in his voice and the day ends on him, not on a lab result.'],
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
    + 'rather than green, the same contract boneyard-audit.mjs runs under. It needs a THIRD thing the capability probe does not cover and '
    + "which used to exit 97 in silence: js/water.js's land oracle reads z14 .pbf tiles UNDER the style's one remote endpoint, and without "
    + 'them every candidate reads as water, so the suite blamed his 45-minute loop for a network fault and named no missing property. It '
    + 'now measures the oracle and reports it as ORACLE beside WEBGL and TILES (proven 2026-09-02 on a cp -R throwaway with TILEJSON_URL '
    + 'pointed at a dead path). His loop really can carry him past WANDER_SHOW_M, but it is a 0 to 2% state: all 1440 minutes of five days '
    + 'swept from HOME against the real oracle, 1414 to 1440 in range. About 60s.'],
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
  'pet-hold-audit.mjs': ['full', "press and hold a dressed pet and her clothes light up. Run it on any change to croppedPetImg's "
    + 'layer markup, to the .petcrop press-and-hold listener, or to the wardrobe. Full rather than fast because it buys a 50,000-coin '
    + 'pet and an accessory through the real shop path and reloads, which is most of its ~50s, and because the surface is one gesture '
    + 'on a pet rather than a route, a payout or a privacy control. It needs no map and no vector tiles, so it has no UNPROVEN exit: '
    + 'every row it declares, it grades.'],
  'badge-centre-audit.mjs': ['full', "a drawing in a round badge sits in the middle of it. Run it on any change to a badge's disc, "
    + 'to the classes a badge carries, or to the art inside one. Full rather than fast because it boots the Boneyard map to reach the '
    + 'badge the report was about, so it wants the same reachable vector tile host as boneyard-audit and reports UNPROVEN with exit 97 '
    + 'rather than green on a machine that cannot draw it. Its scope is CIRCLES: one uniform border-radius of at least 45% of the box, '
    + 'a square-ish box of at least 20px, exactly one visible img/svg child and no text. `.gbn-ico` on the Crew banners is the same '
    + 'top-left glyph at a 26% radius and is feedback item v424-7 in its own workstream; widening this file to cover it is the '
    + 'ROUND_MIN_PCT constant in tests/badge-centre-lib.mjs and nothing else.'],
  'boneyard-icon-audit.mjs': ['full', "the Boneyard and its map key draw the same pixel art at whole steps, and it decodes. "
    + 'Run it on any change to pixCur, crateIcon, the map key or the marker sizes. It is full rather than fast because it '
    + 'boots the Boneyard map, so it wants the same reachable vector tile host as boneyard-audit. '
    + 'It has an UNPROVEN exit as of 2026-08-21, but only for the Mystery Egg sample: when no rare spawn in the running '
    + "45-minute instance survives app.js placeWalkable's veto, the map draws no egg, and the row is declared by name and "
    + 'the suite exits 97 instead of exiting 1 with an art-regression message about a placement outcome. '
    + 'STILL WORTH FIXING SEPARATELY: unlike boneyard-audit it carries no capability probe, so on a host with no route to '
    + 'the tile server its CONTROL rows are the only thing standing between a tile-less run and a vacuous pass.'],
  'dust-egg-audit.mjs': ['full', "the dust Mystery Egg (restored 2026-08-31, Tom's ruling: the S0 removal was unintentional) charges exactly its "
    + 'historical 60 dust, is bounded to one per ISO week by the dustegg:<isoWeek> receipt, pays exactly once under three concurrent '
    + 'callers, and a rejected egg write cannot take the dust without the retry granting for free (the same shape as '
    + 'purchase-write-failure-audit, with the receipt\'s granted flag standing in for cosmetic ownership, because a hatched egg row is '
    + 'deleted and inventory absence proves nothing). Run it on any change to buyDustEgg, grantEgg or the db write paths. '
    + 'HONESTY NOTE: written 2026-08-31 under a no-run release gate; neither it nor its five listed prove-reds have been executed yet. '
    + 'VERIFY.md carries both as the browser pass, and this note comes out when that pass lands.'],
  'gap-settle-audit.mjs': ['full', 'the lapsed-player cluster (round 4, 2026-08-31): a 2+ day gap settles the LAST LOGGED day\'s day-close '
    + '(bounded at exactly one day, the ledger still dedupes, and the day guard still pays nothing when it refuses); a day-guard '
    + 'refusal in claimQuest returns { dayGuard: reason } so the Claim button toasts why instead of doing nothing (the guard\'s '
    + 'DECISION is asserted unchanged); and the 20:30 streak reminder only schedules while the streak is alive, as a one-shot, so '
    + 'it cannot nag a dead streak forever from a repeating schedule. Run it on any change to awardDayCloseIfDue, claimQuest, '
    + 'claimDay or syncNotifications. Proven red on pre-fix origin/main in a throwaway tree.'],
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
  /* Registered 2026-09-03, one gate run after the suite was added. The gate's
     coverage check caught it belonging to no tier, which is the whole point of
     that check: a guard nobody runs is not coverage, it is a green light with
     nothing behind it. FULL for the same reason crew-pair-audit is: it starts a
     wrangler dev with a local D1, so a box without wrangler cannot run it. */
  'erase-vault-line-audit.mjs': ['full', 'the erase confirmation tells the truth about the cloud copy in all THREE states, because a backup that exists, one that does not, and one the app could not ask about are three different facts and a destructive confirmation must not collapse them; plus the clamped-field signal reaching the diagnostics dump.'],
  'crew-pair-audit.mjs': ['full', 'the friend and crew flow with TWO real browsers against a real Worker it starts itself: add, accept, gift, the delivery-once guard, the daily caps, self-directed cases, removal, and BOARD, the client/server contract for the three leaderboard-fed Add surfaces, asserted off the WIRE (route, field name and the server\'s own handle for that player) and carried to Crew membership on both sides; every one read from BOTH sides. FULL rather than FAST because it boots two Chrome profiles and a wrangler dev with a local D1 (about four minutes), and because a box with no wrangler cannot run it at all. Every other social audit in this directory drives one browser against a seeded fixture, so this is the only coverage of anything that needs two participants.'],
  'debuff-chips-audit.mjs': ['full', 'tapping a debuff chip explains it.'],
  'den-two-target-audit.mjs': ['full', 'two health bars in a two-enemy den; batch-audit gates the two-enemy read every run.'],
  /* dust-safeguard-audit.mjs stood here. It graded ONE property, that the Bone
     Dust shop's charm cell needed two taps to spend, and the Bone Dust shop
     closed on 2026-08-25 (dust is cosmetic-only now). Deleted rather than
     skipped: unlike the four garden suites below, the surface it drove is gone
     for good, not parked. The one-tap rule it defended is still enforced
     tree-wide by unit.test.js's "no control that spends coins or dust buys on a
     single tap", which sweeps every spend control including ones not yet
     written. */
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
  /* 'hollow-audit.mjs' and 'garden-intro-audit.mjs' were DELETED on 2026-08-27,
     with the feature they guarded rather than left to drive a path that no longer
     exists. Same treatment spire-intro-audit and teaser-fire-audit got.

     v404 ("the Bone Garden closes, and the Boneyard feeds the Kitchen instead",
     #53) took the Hollow and the Bone Garden out of the player's path on purpose.
     Verified in the tree, not assumed: openHollow() is called from exactly ONE
     place, the CTA inside the garden intro popup, and the only thing that ever
     showed that popup, maybeShowGardenPopup(), is called from nowhere at all. No
     route, no hash, no other door. Both audits were therefore grading a feature
     no player can reach, which is why they read `beds: 0` and `#doorGrow` was
     dead in seven places across the suite.

     THE CLOSURE ITSELF IS STILL GUARDED, which is the part that matters:
     garden-closed-audit.mjs pins both absences and is green. t3-audit's GARDEN
     section went in the same pass.

     The garden CODE is still in the tree (openHollow, maybeShowGardenPopup,
     js/hollow-art.js, js/hollow-beds.js, js/hollow-scene.js), flagged to Tom as
     dead weight rather than deleted here. */
  'garden-reach-audit.mjs': ['skip', 'its whole subject is REACH into the garden: the Today banner, the GROW door and the seed pouch, all removed 2026-08-18. Its one surviving row (the food-log boundary line) is not worth a boot on its own; if it ever matters again it moves to a diary suite.'],
  'glyph-audit.mjs': ['full', 'no dingbats standing in for icons.'],
  'kitchen-queue-audit.mjs': ['full', 'the cook queue fired from the real Cook button (a SECOND cook really starts with one pot in one visit, and the queued one takes the pot on its own with the dish time untouched), plus the starter-pouch backfill including its second-run no-op (rewarded-actions SOP). Its compost-ordering section came out on 2026-08-18 with the compost button; the pouch half now reads the larder rather than the seed pouch, because the pouch pays ingredients. Self-serves this checkout when given no URL.'],
  'hide-glow-audit.mjs': ['full', 'hidden garments keep their stats; the glow toggle stays cosmetic.'],
  'levelup-audit.mjs': ['full', 'the level-up moment plays and shows the right numbers.'],
  'ceremony-once-audit.mjs': ['full', 'levelup-audit grades what ONE moment says; this grades HOW MANY of them open. Round-9, 2026-09-01: logging a food that crossed a level played it twice, the second sheet reading "+0" and stacking on top of the real one, because awardOnce dispatched bh-levelup AND onFoodLogged recomputed the same crossing for the log handler to queue again. The payout was always correct (levelpaid-<L> is claimed with addIfAbsent), so nothing in the reward SOP could see it. Counts CEREMONIES off the live DOM, tagging every .lu-take it has ever seen so a sequential double counts as well as a stacked one, and reads the coin figure off the reward pill because "+0" was the visible defect. FOOD drives the real Quick add sheet; OTHER crosses the same boundary with a direct award() of a non-food type, so a fix that silences steps and quests along with food cannot pass. CONTROL plants a twin and requires the sampler to see one more than it started with. Proven red on a cp -R of 3d4b208c: FOOD ONCE 2 ceremonies and FOOD REWARDS [65, 0], with OTHER and CONTROL green there. Self-serving, one boot, ~70s.'],
  'fight-hint-audit.mjs': ['full', "pins the width of every move-button hint string against the box it has to fit in, at 393/375/320. It is what caught the wrapping v400 fixed, and it goes red again the moment a hint string grows. ~68s, which is why it is full and not FAST."],
  'fight-press-audit.mjs': ['full', "press-and-hold on a move opens the detail popup and uses NOTHING, and a tap still uses the move. Drives real CDP pointer sequences and reads the outcome from AP and boss HP, never by calling a handler. Both viewports, so it is the slowest of the three Pit audits."],
  'transmog-clarity-audit.mjs': ['full', "the ?mogv2 look panel, graded the way the new-player grill found it broken (v424 item 11). The finding that outranks the rest is geometric: tapping a look already restaged the paper doll CORRECTLY, with the doll 480px above the top of a 430x932 viewport, so the feature's whole output landed off screen and the player bought a look they had never seen (measured cost of going to look: a 934px scroll up, one whole viewport, then back down to press the button). So PREVIEW asserts the After figure is fully in frame AT the moment a real pointer taps a real tile, that its art is DECODED, and that it actually changes. BAR pins Tom's three sentences (what you keep, what you get, what you pay) and measures their WIDTH, because the shipped v1 bar renders its own status text at ZERO pixels: .btn is width:100% and .look-bar .btn only sets flex:none, so the button lies across all 398px of the bar. CURRENCY pins the price to the wallet's own art after the grill found three renderings of Bone Dust on one screen (pixCur crystals in the wallet, a Unicode ' ◆' from .look-cost::after on the tile, and a tan vector diamond in the note because ICONS.dust(12) is under pixCur's 16px floor). EVERY SLOT fails if any gear slot leaves the section silently missing. VARIANT fails if the rework leaks without ?mogv2. ECONOMY is there to prove the interface pass moved NO number: the button quotes what transmogPrice charges, one tap only arms, the confirm charges exactly that, and the cost table is pinned in source. Self-serves this checkout when given no URL. One boot, about 50s."],
  'melt-ui-audit.mjs': ['full', 'the Salvage Bench: entrance visible without a tap, every row actionable, melt pays exactly once (SOP), every rarity meltable, and transmog on a stat-less slot is offered AND free AND actually changes the look.'],
  'offline-boot-audit.mjs': ['full', "the other half of v197's network-first shell: the app has to boot with no network. The old note here said it was RED for a missing PRECACHE entry; that was fixed, and it stayed red for a second reason that was not the app at all. Its offline proof is 'the worker's cache did not grow', which assumes the worker only puts after a network response, and sw.js's static branch fetches at default cache mode so a warm Chrome HTTP cache answers with res.ok and the entry is put with nothing crossing the wire: measured 137 -> 156 with the server stopped and the origin refusing, 137 -> 137 with Network.clearBrowserCache first. setOffline now clears it, which is also the harsher test. 16/16, exit 0, 2026-08-17. Owns its server (it has to stop it), so it takes ~90s."],
  /* THE NETWORK BETWEEN OFF AND ON, which nothing here had ever driven. */
  'flaky-network-audit.mjs': ['full', "offline-boot proves the app BOOTS with no network; this drives what happens when you press things, in the three states that are not 'on': GONE, HANGING (accepted and never answered, which no catch in this app could ever reach) and FLAP (the server acts, the answer is lost). Grades what reached the store AND what the player was told, with an online CONTROL twin on every offline row and every gift row gated on the sheet having opened, so an empty sample set cannot read green. Proven red at ddbb079 with only this file copied into a throwaway tree: 11/31 there against 31/31 here, and the 20 red rows are the findings, not a broken harness (its OFFLINE-FIRST rows and every online CONTROL twin are green in BOTH trees). 32/32 and 191s measured on the final file, green on three consecutive runs. Self-serving, and it stops its own server and clears the browser HTTP cache, so 'full' rather than fast."],
  'onb-audit.mjs': ['full', 'onboarding on a virgin IndexedDB, the only suite that sees the launch funnel.'],
  'profile-units-audit.mjs': ['full', "the plan form's sharp edges, from the 100-persona onboarding census (2026-09-02). onb-audit drives the funnel but never touches the unit segment, so none of this was visible to it. The one that outranks the rest is a data-correctness bug: re-tapping the ALREADY-LIT unit button converted a weight that was already correct, because switchUnits() converts by the NEW unit alone with no memory of the unit the field is in. Select kg, type 80, tap 'kg / cm' again to confirm the choice, and the field reads 36.3 and Save stores a plan for a 36 kg body (1,920 kcal / 80 g protein) with nothing on screen saying anything moved. A guard that tested ONE switch passed throughout that bug's life, so DOUBLE-TAP drives the SECOND tap and compares the saved body against a single-tap run of the same input, with a CONTROL row proving an honest switch still converts (without it, a unit segment broken to do nothing would read green). Also HEIGHT-FOLLOWS (165 cm survives a switch instead of becoming the 5'10 render default), CHIPS-TRUTH (the lit Activity and Goal chips are what Save stores, which is also the drift guard between profileFormHtml's defaults and bindProfileForm's), REROLL-RESUMES (the name on screen at quit is the name you come back to) and STEP-TOP (every step opens at its own top, at 390/375/320: step 2 opened at scrollTop 233 with its back arrow at y=-203 on the SE 1). Masks navigator.webdriver so the REAL first run plays rather than CALM_BOOT, and MASK is a hard row. Proven red on a cp -R of 6bf08cc: 6/13, with MASK, both CONTROL/SETUP rows and NO-page-errors green there. Self-serving, 7 virgin boots, ~90s."],
  /* RETIRED WITH ITS SUBJECT, 2026-09-03. Tom: "today still has the step
     challenge winner and monster banner at the bottom these should be gone now
     things will live in the collapsed news pill." The banner it grades no longer
     renders, and its premise is the 2026-08-21 instruction ("remove all banners
     ... except the step winner but above it we need to create a new hypebanner")
     that this one supersedes. Kept, not deleted, for the same reason
     out-there-audit is: it is the record of what the banner had to do. */
  'hype-banner-audit.mjs': ['skip', 'its whole subject is the Today hype banner, which came off Today on 2026-09-03 when Tom asked for the step-winner and monster banners to go and for news to live in the collapsed news pill instead. hypeBannerHtml, hypePlateHtml and HYPE_PLATES were deleted with it (app.css still carries the .hype rules). The settled step race did NOT go with it: #raceResultCard moved into the news pill and tests/race-results-audit.mjs still drives it there.'],
  'out-there-audit.mjs': ['skip', 'its whole subject is the "Out there today" card, which came off Today on 2026-08-21 when Tom asked for every banner except the step winner to go and one hype banner to replace them. outThereHtml and its four row builders are intact and unreachable in js/app.js (revival is one call plus the heldSpires read), so this file is kept as the record of what the card had to do. the hype banner that replaced it came off Today on 2026-09-03 in its turn, so nothing stands there now: the row above retires its audit for the same reason.'],
  'pit-refresh-audit.mjs': ['full', 'the Pit re-renders when a fight ends: beaten remote den stops offering FIGHT without a reopen. Also ONE-TAP (2026-09-01): with two charges in hand, a double tap on a rung opens ONE arena and spends ONE charge, with a single-tap control so a dead button cannot pass.'],
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
  't3-audit.mjs': ['full', "Tier 3 depth screens render their mockup language. It also owns the BUTTON half of the arm-to-confirm promise, "
    + "which nothing else could see: armToConfirm called restore() ABOVE its await, so the button unarmed inside the same frame and a "
    + "thumb roll re-armed and committed over and over. Six synchronous clicks on the real coin-shop button must buy ONE thing on a "
    + "wallet that could afford several. Proven red on a cp -R of origin/main 13583e42: 6 taps, 3 Vigor Draughts, 270 coins, with the "
    + "first-tap ARM row still green there so the leg was really running. The module-level half is SPEND-* in purchase-firewall.mjs. 14 checks."],
  'levelpaid-repro.mjs': ['skip', "not an audit: the on-demand reproducer for the 2026-08-28 levelpaid-2 ghost (#265). It deliberately aligns a reseed with boot's award tail and exits 1 where the machine is too fast to mint, so in the gate it would read as a red on healthy code. Run it by hand when the ghost is suspected."],
  'levelpaid-trace.mjs': ['skip', "not an audit: the IDBObjectStore-layer tracer that captures every xp-store write with an async stack (#265). Evidence tooling for a human investigation; it asserts nothing and a suite that cannot fail must not sit in a tier."],
  'onb-gwart-audit.mjs': ['full', "Gwart meets the new player: a PLAIN-url fresh boot (never ?demo, which seeds settings and skips onboarding entirely) lands on onboarding with his portrait drawn AT SIZE, his box off the headline, his line typed, and the funnel still completing to Today with the shell latch intact."],
  'toast-map-audit.mjs': ['full', "the toast must not land on the Boneyard's action card. The shipped `bottom: calc(var(--sab) + 96px)` put every toast exactly on #mapAct (measured 2026-08-28: toast 30.1,771.5 369.8x64.5 over card 14.0,787.8 402.0x64.0), so the 'Slow down' nag hid the 'Grab it'/'Slow down' card it was nagging about. Grades the REAL toast (a webdriver-only __toast seam onto the module-scoped queue) against the card driven into its real too-fast state by six geolocation fixes, plus SEAT, the regression the fix could most easily cause: the override leaking and moving every toast in the app. Boneyard rows go UNPROVEN (97) without a live map; SEAT grades regardless. Proven red one mutation per throwaway copy: rule deleted (CLEAR), rule unconditional (SEAT 157.9px), toast display:none (VISIBLE, with CLEAR deliberately still green, which is the vacuous pass VISIBLE blocks). ~45s."],
  'two-tap-audit.mjs': ['full', 'one tap must never spend coins.'],
  'wardrobe-audit.mjs': ['full', 'equipping does not flash the page; the background does not follow the character.'],
  'hub-tab-telemetry-audit.mjs': ['full', "opening a hub sub-tab leaves a NUMBER. Tom, 2026-08-18: \"hide the Looks tab, check the stats first\" — and the stats did not exist, because the only trackScreen() call in js/app.js is the bottom-nav tab and no sub-tab open was ever recorded. openCharacter() now fires trackEvent('hub_tab', { t }), which is the one funnel both the #chTabs chips and the .ward-looks door pass through. CONTROL is the row that keeps it honest in the other direction: without window.__evProbe a webdriver session must queue NOTHING, so audit runs can never inflate the counts Tom is about to read, and QUEUED cannot pass on rows an earlier boot left behind. COVERAGE clicks a hub chip as well, so a change that special-cased Looks and left every other sub-tab dark still fails. Proven red in a cp -R copy with the trackEvent line deleted: QUEUED and COVERAGE red, CONTROL green, exit 1. Self-serves this checkout when given no URL."],
  'gwart-guide-audit.mjs': ['full', "the guide's answers stay reachable now that it is grouped. Tom, 2026-08-26: \"it is super bland with no real hierarchy or anything to it ... make sure that players know they should click on gwart if they get confused.\" Grouping introduced a failure mode a flat list does not have: an entry added to GUIDE_ENTRIES and not named in GUIDE_GROUPS renders NOWHERE, present in source and reachable by its deep link and invisible in the guide, which is the v395 LOOKS bug one surface over. COVERED grades the BOOKKEEPING rather than the rendering, and that distinction is the row: openGwartGuide falls back to a More bucket for any ungrouped entry, which is right for players and makes \"is it rendered\" true by construction, so the first version of this row stayed GREEN on the mutation it existed to catch (10 declared / 10 rendered). It now asserts the fallback never had to fire. ASK grades the hero card, which is the half of the brief that is not decoration: before it the only thing saying the wizard on Today was a button was an aria-label. DEEPLINK drives a real [data-guide] control, and it took three attempts to point at a screen that carries one: measured across six routes, only #/bonehead has one on load. Proven red twice in cp -R trees, one row each: an id dropped from every group (COVERED), the hero card deleted (ASK). Self-serves this checkout when given no URL."],
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
  'header-freshness-audit.mjs': ['full', 'the Today header keeps up with a payout, measured as RENDERED text against the STORE at the same instant (a guard on storage alone would have passed throughout this bug\'s life: the arithmetic was never wrong, the screen was). Two payouts, both on a page with navigator.webdriver MASKED so the genuine first run plays: the Daily Spin\'s COLLECT, and the first open of a new day. The wheel prize is date-seeded, so it walks forward a day at a time on a wiped database until it lands on a coin-paying wedge and FAILS BY NAME if it never does. The new-day half takes two boots on purpose: a single fresh open cannot show it, because the history backfill settles every past day it can see and awardDayCloseIfDue then has nothing left to pay. REACH, READER and BOOT CONTROL are the rows that stop a null reader or a payout that never happened from passing this. Measured on origin/main 6bf08ccd: COLLECT header 340 against 490 stored, never agreeing in 4s; BOOT header 525 into the level against 550 stored. On this tree: 408ms and 5ms. One browser, about 90s'],
  'meal-memory-audit.mjs': ['full', 'the add sheet reopens on the meal you were just logging, driven through #fab (the one control that asks mealDefault; the per-meal rows on Today pass an explicit meal and could never show this). Four paths commit a log row and Quick add was the one that never called recordMealUsed, which is the path a brand-new player is likeliest to use first. The target meal is CHOSEN AT RUN TIME from whatever chip the app opens on with nothing remembered, because a written-down target passes for the wrong reason on any run started in that meal\'s hours. CONTROL drives the search path, which has always recorded, so QUICK going red means the feature is missing rather than the check looking in the wrong place. Measured on origin/main 6bf08ccd: logged to Breakfast, reopened on Snacks. One browser, about 40s'],
  'honest-surfaces-audit.mjs': ['full', 'four surfaces that were LYING or SILENT, every row comparing two RENDERED states with both sample sets non-empty. (1) the Progress streak pill counted inside the 56-day heatmap window, so a 400-day run displayed 56: seeds 400 days and 9-logged-plus-3-walked and reads the pill both times. (2) the shop toast printed the wallet raw ("1234477 left"): buys the same item at a seven-digit and a three-digit balance and reads the real toast. (3) the Claim button keyed only on the unwitnessed day-guard reason, so backwards and too-fast shared one line naming no cause: forces all three rules through kv, fires the REAL button, reads three toasts. (4) pushBackup ended in a blanket `return false`, so a 413 too-large and a 401 stale-timestamp were both silent and `backupAt` simply stopped moving: stubs the three answers, boots for real (no ?demo, webdriver spoofed, ?calm so the daily wheel does not cover the toast) and reads BOTH the boot toast and the Settings cloud row. A fourth answer, added 2026-09-02, is the one that LIED rather than went quiet: a 200 from a captive portal carrying login HTML. pushBackup read `r.ok` alone, so it stamped backupAt and cleared any standing failure for a save that never left the phone, and Settings then read "On, last backup just now". It now requires the {ok:true} body the server actually sends, and HEALTHY CONTROL is the row that matters most here: a real success must still stamp backupAt, because a body check that refuses the server would be far worse than the bug. Prove-red on a cp -R of origin/main: 10 rows red, controls green; the portal rows proven red the same way on 2026-09-02 (backupAt stamped, row reading a fresh age), 3 red, every other row including HEALTHY CONTROL green.'],
  'fav-skull-audit.mjs': ['full', "a fave chip whose skull never arrives must not be an empty canvas (anti-regression rule 8). Has to read the alpha channel: the <canvas> exists either way, so every presence-based assertion passes on the bug. Two full boots, healthy then request-blocked, so it costs double a one-boot audit."],
  'memory-census.mjs': ['full', 'the eight-layer memory ceiling on every screen that mounts art in a loop, sampled at the PEAK after a full scroll of every scroller, twice (tally/CLAUDE.md rules 11 and 12) - lb-memory-audit budgets ONE screen against a two-layer fixture, and that is how six more screens with the same defect stayed invisible. Drives and scrolls most of the app, so it is among the longest suites here. Its own header names what it cannot see (CSS backgrounds, off-DOM Images, the Boneyard map: no WebGL headless), so a pass is "not caught by this instrument", not "clean".'],
  'newcomers-audit.mjs': ['full', 'all six branches of hydrateNewcomers, so "the new player section of the Crew tab is gone" is answered by measurement instead of by picking one of three explanations. Six sequential seeded scenarios at ~3s of settle each; prove-red inverts playing() and rows A and E go red while B, C, D and F stay green.'],
  'race-results-audit.mjs': ['full', 'the settled step-race podium shown is the one that was PAID, which is why it reads /steps/settled and not /steps/week: measured on production 2026-08-14, three of the five paid players had already rolled into the new week and vanished from the live board, promoting 5th to 2nd. Plus VISIBLE-not-merely-present (three opacity-0 bugs in eight days), the art actually decoding, and never rendering an empty podium. The fixture is the real production result byte for byte, so row 1 cannot be decorative. RETARGETED 2026-08-25 from the full-screen poster to the Today banner: the poster was a launch takeover and left with that class, and the banner reads the same settledPodium() and carries strictly more (every place\'s purse). The showing-budget rows went with it.'],
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
  /* ITS OWN TIER ENTRY ALREADY SAID SO and nobody acted on it: "it installs and
     upgrades a real service worker across two builds, which is slow and MUST NOT
     RACE A PARALLEL SUITE." It was still running six-up. Red on the 2026-08-28
     gate at 564s with SECOND OPEN reporting worker=tally-v465 when it wanted
     v466, and ALL GREEN standalone on the identical tree minutes later. A worker
     takeover is a race by nature; five siblings competing for the CPU decide it. */
  /* ---- ADDED 2026-08-29, the #250 signature again: green standalone on the
     same tree the same day, red only in a six-way gate. ---- */
  /* ---- ADDED 2026-08-30, same #250 signature, third round. The structural
     answer (a capped concurrency CLASS for map suites instead of one-by-one
     discovery) is written up for daylight; these two join the tail tonight on
     the same evidence as their eight siblings. ---- */
  /* ---- ADDED 2026-08-30, late: the #250 signature with the full evidence
     this tier demands, learned the hard way the same night a fake version of
     the signature (two audits poisoning their own IndexedDB) was evicted. ---- */
  'spire-gate.mjs': 'the SPIRE day-gate row races the Crew render for the machine: red in two '
    + 'consecutive six-up gates (offered-button row reading hidden:true on an unspent day), '
    + 'green three of three solo on the identical bytes the same evening.',
  'boneyard-icon-audit.mjs': 'grades map marker art against the drawn field; failed twice in the '
    + 'same six-way gate as its siblings and is green 2/2 standalone on the identical tree.',
  'mini-theme-audit.mjs': 'walks the map to real minis and grades their reach; red in the '
    + 'six-way gate with every miss reading "snapped away" (the placeWalkable tile race '
    + 'under load), green 3/3 standalone on the identical tree minutes later.',
  'tab-doubletap-audit.mjs': 'needs the Boneyard map up to grade the double-tap; UNPROVEN in '
    + 'the gate ("the Boneyard map never came up on this machine"), green 3/3 standalone.',
  'boneyard-audit.mjs': 'drag gestures, arrival timing and beat grouping are all '
    + 'races against the machine. PAN needed net-arrival counting for the moving '
    + 'Wanderer (#268, 9 standalone greens that day), and INTERACTED, a synthetic '
    + 'drag from the #242 dice family, then lost its race only in the gate.',
  'boneyard-density-audit.mjs': 'ten locations, each with a 12s settle window '
    + '(#262 tripled the surface from four). Under five siblings one canvas can '
    + 'miss its window entirely: gate 2026-08-29 drew 0 markers at location 8 and '
    + 'the CONTROL row correctly refused the vacuous sample, while the identical '
    + 'tree was 100 percent green standalone. It measures rendering capacity, and '
    + 'contention measures the machine instead.',
  'sw-upgrade-audit.mjs': 'installs and upgrades a REAL service worker across two '
    + 'builds and then asks which one is in charge. Its own tier note says it must not '
    + 'race a parallel suite. Red in the gate (worker=tally-v465, want tally-v466), ALL '
    + 'GREEN standalone on the same tree.',
  /* ---- ADDED 2026-08-28, each on the same evidence: green standalone, red in a
     six-way parallel gate, on the identical tree. That is the signature this
     list exists for, and the note above says adding to it is cheap while
     assuming everything is safe "is how a parallel gate starts lying". */
  'spawn-quiet-audit.mjs': 'walks a real map until it has collected one of EVERY '
    + 'spawn type, and the field is wildly uneven: measured today bones 311, coins 292, '
    + 'herbs 180, crate 62, rare ELEVEN. The collect bar offers the NEAREST spawn, so '
    + 'standing on one of eleven rare spawns usually offers something commoner and burns '
    + 'an attempt. Idle it finishes in 6 attempts; in the gate it spent 22 and never '
    + 'reached rare, taking 480s against a usual 90. It is measuring how much CPU it got.',
  'badge-centre-audit.mjs': 'grades a disc by hiding glyphs and diffing PIXELS across '
    + 'bracketing captures, then hit-tests the Boneyard readout disc. Under contention the '
    + 'map top bar has not finished arriving over that disc when the capture lands, so the '
    + 'disc reports COVERED or OVERLAP and COVERAGE goes red for a reason that has nothing '
    + 'to do with centring. 5/5 standalone, repeatedly; red in roughly half the parallel gates.',
  'marker-anchor-audit.mjs': 'stands the player in a searched-for crowd of Wanderers and '
    + 'measures marker geometry in METRES against a live MapLibre camera. It needs the map '
    + 'settled and the water tiles warm; six browsers competing move both. Green standalone '
    + 'three runs, red in the gate on the same tree.',
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
  /* Advise on what the suites actually SAID, not on an assumption. Telling
     somebody to find another machine when the reason is a date seed costs them
     an evening and fixes nothing. */
  const anyMachine = unprv.some(r => unprovenLines(r.out).machine);
  console.log('        These guard shipped surfaces and they did NOT run here.');
  if (anyMachine) console.log('        Where the reason is a missing machine capability, run the gate somewhere that has it.');
  console.log('        Where it is a data state (the date seed, an empty set), it grades on a day that offers the case.');
  console.log('        Either way this is not green: do not call a release checked on it.');
}
/* Release on the way out, pass or fail: a lock only ever left behind on a RED run
   trains everyone to ignore the line, which is how it stopped meaning anything. */
await releaseLock();
/* A real failure outranks an unproven suite: if something was driven and
   misbehaved, that is the headline and it exits 1. With nothing failing but
   something unrun, the gate exits 97, which is non-zero (this run certified
   nothing) and distinguishable (nobody should go hunting for a defect). */
process.exit(bad.length ? 1 : unprv.length ? UNPROVEN : 0);
