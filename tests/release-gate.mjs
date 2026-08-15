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
const PURE = ['unit.test.js', 'pit.test.js', 'quest-daymore-audit.mjs', 'first-fight-audit.mjs'];
const BROWSER = [
  'precache-audit.mjs',      // a module missing from PRECACHE = a blank app on one bad bar
  'precache-assets-audit.mjs', // non-module assets: blocks each and grades FATAL vs BOOTS-WITHOUT + records install byte-weight
  'news-tab-audit.mjs',      // every announcement still opens with its art
  'art-register-audit.mjs',  // cosmetics register on ink, not on boxes; node-only and half a second, and it REPLACES grill-fit-audit.mjs, which belonged to no tier and so failed the coverage assertion below on every run
  'mini-theme-audit.mjs',    // roaming mini-bosses are drawn as themed monsters
  'remote-den-audit.mjs',    // the daily free boss reads as beaten, and moves the cap
  'bestiary-audit.mjs',      // the teaser stays a teaser; Today names the hunt
  'mage-audit.mjs',          // the Live Wire on every surface he belongs on
  'fight-layout-audit.mjs',  // the fight screen holds still
  'batch-audit.mjs',         // Cam's FX, the two-enemy read, the result screen
  'teaser-fire-audit.mjs',   // the drop announcement fires from BOOT, not by hand
  'error-telemetry-audit.mjs', // crashes queue, and never leave a test device
  'contrast-audit.mjs',      // Walt gave it an exit code; it could not fail before
  'year-readout-audit.mjs',  // Walt: every Year bucket names a DIFFERENT month
  'notif-audit.mjs',         // Notification tiers do what they say (measured, not toggle-position); boot-asker webdriver-skip guard behaviourally verified
  'petlevel-audit.mjs',      // openPetLevelUp: sheet renders + PWR/HP/REF deltas match petBattleStats between prev and cur, + no re-open on repeat
  'backup-roundtrip-audit.mjs', // Settings YOUR-DATA export/import: seven stores, deep-equal round trip, findings for the toast-count undercount and the non-transactional import
  'wheel-audit.mjs',         // daily spin appears + double-dip refused + each of five silent-retirement gates named
  'den-ceiling-audit.mjs',   // every kind of boss raises the Gauntlet ceiling, or none do
  'gate-audit.mjs',          // hunts guards that cannot fail: belongs in every run
  'selector-audit.mjs',      // a query nothing emits: the .pit-sect class of dead guard
  'lb-memory-audit.mjs',     // the board defers its art: 312MB in one open killed the WKWebView renderer
  'log-write-failure-audit.mjs', // a failed save must not look like a saved meal
  'freeze-reveal-audit.mjs', // a backgrounded app must not come back invisible: rAF does not run in a frozen page
  'screen-sweep.mjs',        // no screen renders blank or throws
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
  'boneyard-audit.mjs': ['full', 'the Boneyard loading and its action bar; run it on any map or action-bar change.'],
  'endless-look-audit.mjs': ['full', 'the Gauntlet equips the roster face pit.js chose: rank 51+ was 0% approved monsters.'],
  'community-audit.mjs': ['full', 'the Discord card: real invite link, plain-words copy, once from boot, lives on in News and Settings.'],
  'crate-advance-audit.mjs': ['full', 'tap-to-advance inside the crate reveal.'],
  'day-strip-audit.mjs': ['full', 'the day strip decides which day every food write lands on: arrows, picker, and the stored row read back.'],
  'readiness-audit.mjs': ['full', 'readiness is relative to YOUR baseline: calibrating instead of a made-up 72, a real spread between a good and a bad day, and a nap is not a night.'],
  'crate-reveal-audit.mjs': ['full', 'the crate cracks open and the lid is cut in the right place.'],
  'crew-fan-audit.mjs': ['full', 'the Crew fan acceptance suite, 42 checks, about two minutes.'],
  'debuff-chips-audit.mjs': ['full', 'tapping a debuff chip explains it.'],
  'den-two-target-audit.mjs': ['full', 'two health bars in a two-enemy den; batch-audit gates the two-enemy read every run.'],
  'dust-safeguard-audit.mjs': ['full', 'one curious tap must not spend dust.'],
  'ember-cohesion-audit.mjs': ['full', 'a lit cosmetic stays lit on every surface.'],
  'faq-audit.mjs': ['full', 'the FAQ copy still matches what the engine does.'],
  'feel-audit.mjs': ['full', 'toast queue, exits, dialogs, haptics.'],
  'figure-audit.mjs': ['full', 'THE FIGURE CONTRACT, 32 checks. Mandatory per tally/CLAUDE.md before any figure work.'],
  'garden-audit.mjs': ['full', 'the garden driven through real controls with a clock skip.'],
  'garden-intro-audit.mjs': ['full', 'the garden intro popup, its retirement, and the Kitchen landing.'],
  'glyph-audit.mjs': ['full', 'no dingbats standing in for icons.'],
  'hide-glow-audit.mjs': ['full', 'hidden garments keep their stats; the glow toggle stays cosmetic.'],
  'levelup-audit.mjs': ['full', 'the level-up moment plays and shows the right numbers.'],
  'melt-ui-audit.mjs': ['full', 'the Salvage Bench: entrance visible without a tap, every row actionable, melt pays exactly once (SOP), every rarity meltable, and transmog on a stat-less slot is offered AND free AND actually changes the look.'],
  'offline-boot-audit.mjs': ['full', "the other half of v197's network-first shell: the app has to boot with no network. RED on main today, and the red is the finding, not a flake: js/haptics.js and js/bosses.js are static imports of js/app.js that are not in sw.js PRECACHE, so a worker that has only precached serves index.html for them and the app is a dead shell. A returning visitor is fine, they get runtime-cached. Owns its server (it has to stop it), so it takes ~90s."],
  'onb-audit.mjs': ['full', 'onboarding on a virgin IndexedDB, the only suite that sees the launch funnel.'],
  'out-there-audit.mjs': ['full', 'Out There Today still offers the gear drop.'],
  'pit-refresh-audit.mjs': ['full', 'the Pit re-renders when a fight ends: beaten remote den stops offering FIGHT without a reopen.'],
  'paddock-scene-audit.mjs': ['full', 'the Paddock end-to-end: real chip tap, decoded herd, band rule in the live DOM, motion as rendered pixels.'],
  'pit-cap-audit.mjs': ['full', 'the Gauntlet ceiling reads as a ceiling.'],
  'placeholder-audit.mjs': ['full', 'nothing prints a literal template placeholder.'],
  'podium-audit.mjs': ['full', 'the Crew top three shows and still opens the full list.'],
  'race-audit.mjs': ['full', 'the step race shows one set of numbers everywhere.'],
  'respec-audit.mjs': ['full', 'refund-and-respend needs two taps and really returns the points.'],
  'reward-art-audit.mjs': ['full', 'the victory gear card, read as pixels.'],
  'scout-audit.mjs': ['full', 'the world follows where you look and stays the same size.'],
  'speech-audit.mjs': ['full', 'sweeps every salt of the chatter pools.'],
  'spire-explainer-audit.mjs': ['full', 'every number in the explainer comes from the constants.'],
  'spire-phase3-audit.mjs': ['full', 'a refused spire claim must not leave the client owning a tower.'],
  't1-audit.mjs': ['full', 'Tier 1 daily loop, 33 checks through the real add-food flow.'],
  't2-audit.mjs': ['full', 'Tier 2 payoff moments, each provoked.'],
  't3-audit.mjs': ['full', 'Tier 3 depth screens render their mockup language.'],
  'two-tap-audit.mjs': ['full', 'one tap must never spend coins.'],
  'wardrobe-audit.mjs': ['full', 'equipping does not flash the page; the background does not follow the character.'],
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
  'db-quota-finding.mjs': ['full', 'C4 IndexedDB quota behaviour: measures real per-year growth (~2.4MB), extrapolates to device-realistic quotas (Chrome allocates ~60% of free disk; a 500MB-free budget phone hits quota inside ~4 years). Attempts to force a real failure via CDP Storage.overrideQuotaForOrigin, records honest outcome. Not a fail-if-red audit; the finding IS the deliverable.'],
  'garden-doors.mjs':     ['full', 'the Kitchen opens on COOK and GROW. Same story: growBottom reads 531 under shell and 1027 under headless new, on the same build.'],
  'hero-flash.mjs':       ['full', 'no coral frame behind an equipped backdrop, sampled as pixels. Needs HEADLESS_MODE=shell: page.screenshot never returns under headless new on macOS.'],
  'race-you.mjs':         ['full', 'your own lane in the step race. Red on main for a date reason tracked separately; declared rather than hidden.'],
  'spire-gate.mjs':       ['full', 'the spire day-gate, which is a rewarded action and has been exploited twice. RED under BOTH headless modes, so it is not the harness. Under triage; it stays declared so it cannot be forgotten.'],
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
  'selector-sweep.mjs': ['skip', 'a byte-for-byte duplicate of selector-audit.mjs, which is already in FAST: same 236 lines, differing only in em-dashes vs hyphens and its own Usage line. It landed twice under two names (4a13e5c on ext/selector-sweep, then again inside the v371 batch as selector-audit.mjs). Running it would sweep the same 752 sites a second time and report the same 0 dead, so it is a second NAME, not a second guard. This is suite-rot-audit territory: it wants deleting, and that is not this file\'s call to make.'],
  'sheet-action-reachable-audit.mjs': ['full', "a primary action must be tappable in the WORST content state, hit-tested with elementFromPoint at the button's centre rather than by rectangle, because a clipped button still measures 132x44 at a fine position. DELIBERATELY RED as of today: gwart/REG-PLAN-2026-08-15.md item 2B parks it outside FAST until 1B and 1C land, at which point it goes green or what remains gets written down. Declared 'full' and not 'skip' precisely so that deadline is visible on every gate:all instead of being retired into silence, which is the same reasoning as suite-rot-audit above."],
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

const results = [];
for (const f of PURE) {
  const r = await run(f, []);
  results.push(r);
  console.log(`${r.code === 0 ? 'PASS' : 'FAIL'}  ${f.padEnd(24)} ${r.secs}s`);
  if (r.code !== 0) console.log(failLines(r.out));
}
for (const f of BROWSER) {
  const r = await run(f, [base]);
  results.push(r);
  console.log(`${r.code === 0 ? 'PASS' : 'FAIL'}  ${f.padEnd(24)} ${r.secs}s`);
  if (r.code !== 0) console.log(failLines(r.out));
}

if (own) own.server.close();
if (!runAll && FULL.length) {
  console.log(`\n${FULL.length} audit(s) not in FAST were skipped (everything not named in FAST lands here).`);
  console.log('Run them before a release:  node tests/release-gate.mjs --all');
  console.log('NOTE: this is a tally, not a guard. A new audit is swept in here silently;');
  console.log('      the check that would flag it is Walt\'s W1b, not yet landed.');
}
const bad = results.filter(r => r.code !== 0);
console.log(`\n${results.length - bad.length}/${results.length} suites green against ${base}`);
if (bad.length) console.log(`BLOCKED: ${bad.map(r => r.file).join(', ')}`);
/* Release on the way out, pass or fail: a lock only ever left behind on a RED run
   trains everyone to ignore the line, which is how it stopped meaning anything. */
await releaseLock();
process.exit(bad.length ? 1 : 0);
