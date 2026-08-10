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
 * surfaces, and exits non-zero if any of them fails. The FAST tier is deliberately
 * not all fifty: a gate that takes half an hour gets skipped, and a skipped gate is
 * the thing we are fixing.
 *
 *   node tests/release-gate.mjs            # FAST, serving THIS checkout
 *   node tests/release-gate.mjs --all      # FAST + FULL, before a release
 *   node tests/release-gate.mjs <baseUrl>  # against whatever is at that URL
 *
 * Run it bare BEFORE pushing, and against the live URL AFTER, per the standing
 * ritual (localhost passing is not "a player can use it").
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

const runAll = process.argv.includes('--all');
const argUrl = process.argv.slice(2).find(a => !a.startsWith('--'));

/* Node-only checks first: they are seconds, and there is no point burning four
   minutes of browser time on a build whose pure logic is already broken. */
const PURE = ['unit.test.js', 'pit.test.js'];
const FAST = [
  'news-tab-audit.mjs',      // every announcement still opens with its art
  'mini-theme-audit.mjs',    // roaming mini-bosses are drawn as themed monsters
  'remote-den-audit.mjs',    // the daily free boss reads as beaten, and moves the cap
  'bestiary-audit.mjs',      // the teaser stays a teaser; Today names the hunt
  'mage-audit.mjs',          // the Live Wire on every surface he belongs on
  'fight-layout-audit.mjs',  // the fight screen holds still
  'batch-audit.mjs',         // Cam's FX, the two-enemy read, the result screen
  'gate-audit.mjs',          // hunts guards that cannot fail: belongs in every run
  'screen-sweep.mjs',        // no screen renders blank or throws
  'contrast-audit.mjs',      // every text pair on Today is still legible
  'onb-audit.mjs',           // the launch funnel, on a fresh profile nothing else sees
];

/* EVERY AUDIT NOT IN FAST IS DECLARED HERE, WITH A TIER AND A REASON.
 *   'full' runs under --all, before a release.
 *   'skip' never runs: it needs an argument, a stub, or it is a screenshot script.
 * A *-audit.mjs in neither FAST nor this map FAILS the gate, by name, before a
 * single browser starts.
 *
 * WHY IT IS A HAND-WRITTEN MAP and not the complement of FAST. The complement
 * cannot fail: computing "FULL = everything not in FAST" means every new file is
 * automatically in a tier, so the coverage check has nothing to catch and a new
 * audit still goes unrun with nobody told. Verified against 61dd854: dropping an
 * empty tests/zzz-audit.mjs into the tree and running the gate printed "52 more
 * audits are in the FULL tier" and exited 0. That is anti-regression rule 1, in
 * the gate itself. Declaring the file is the whole point: it costs one line and it
 * puts the omission on the record as a decision.
 */
const DECLARED = {
  'badges-audit.mjs': ['skip', 'seeds the four Warden badges and shoots the wall for review; a screenshot script, not a regression guard.'],
  'ledger-voice-audit.mjs': ['skip', 'shoots the ledger copy for reading, into a fixed scratch dir; asserts nothing about layout.'],
  'small-fixes-audit.mjs': ['skip', 'a one-off batch for three named fixes, kept as the record of how they were verified.'],
  'v279-audit.mjs': ['skip', 'the v279 bug batch, one check per reported bug, kept as the record of that release.'],
  'newart-audit.mjs': ['skip', 'needs a <base> argument and a mode (see tally/CLAUDE.md), so it cannot join a URL-only run list.'],
  'siege-client-audit.mjs': ['skip', 'drives sieges against a stubbed server payload; the demo profile has no online crew.'],
  'glutton-audit.mjs': ['skip', 'the Glutton farm, closed. unit.test.js carries the generalised rewarded-actions guard now.'],

  'boneyard-audit.mjs': ['full', 'the Boneyard loading and its action bar; run it on any map or action-bar change.'],
  'crate-advance-audit.mjs': ['full', 'tap-to-advance inside the crate reveal.'],
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
  'melt-ui-audit.mjs': ['full', 'the melt confirm bar is opaque and does not swallow a row tap.'],
  'out-there-audit.mjs': ['full', 'Out There Today still offers the gear drop.'],
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
  /* Declared here rather than in FAST on purpose: the file arrives with
     walt/year-readout, and naming it in FAST would make THIS branch try to spawn a
     file it does not have. A DECLARED entry for an absent file is inert, since the
     tiers are built from what is on disk, so this is correct before and after that
     branch lands. Promote it to FAST once both are in: it is 25s and it guards a
     surface a player taps. */
  'year-readout-audit.mjs': ['full', 'the Year chart names the month you tapped, instead of one letter three months share.'],
  'weapon-charge-audit.mjs': ['full', 'the weapon charge, sampled as decoded pixels while it runs.'],
};

/* COVERAGE FIRST, before a single browser starts. An undeclared audit is a
   one-second failure here or a four-minute one at the end, and the four-minute
   version is the one people stop running. */
const onDisk = (await readdir(here)).filter(f => /-audit\.mjs$/.test(f)).sort();
const undeclared = onDisk.filter(f => !FAST.includes(f) && !(DECLARED[f] && DECLARED[f][1]));
if (undeclared.length) {
  console.log(`FAIL  coverage: ${undeclared.length} audit file(s) belong to no tier:`);
  for (const f of undeclared) console.log(`        ${f}`);
  console.log("        Add each to FAST, or to DECLARED as ['full', reason] or ['skip', reason].");
  console.log('        An audit that exists but never runs radiates false confidence.');
  process.exit(1);
}
const FULL = onDisk.filter(f => DECLARED[f] && DECLARED[f][0] === 'full');
const BROWSER = runAll ? [...FAST, ...FULL] : [...FAST];
console.log(`coverage: ${onDisk.length} audits on disk, ${FAST.filter(f => onDisk.includes(f)).length} fast, ${FULL.length} full, ${onDisk.length - FAST.filter(f => onDisk.includes(f)).length - FULL.length} skipped`);

const own = argUrl ? null : await serveRepo();
const base = argUrl || own.url;
console.log(own ? `serving this repo at ${base}\n` : `testing ${base}\n`);

function run(file, url) {
  return new Promise(res => {
    const t0 = Date.now();
    /* BOTH CONVENTIONS. Most suites read argv[2], but contrast-audit and onb-audit
       read process.env.URL, and contrast-audit passes it to godmode's boot(),
       whose own default is the LIVE site. Handing it args only would have had the
       gate quietly grading production. Set both and neither can fall back to
       something that is not the tree under test. */
    const p = spawn(process.execPath, url ? [join(here, file), url] : [join(here, file)], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: url ? { ...process.env, URL: url } : process.env,
    });
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

const results = [];
for (const f of PURE) {
  const r = await run(f, null);
  results.push(r);
  console.log(`${r.code === 0 ? 'PASS' : 'FAIL'}  ${f.padEnd(24)} ${r.secs}s`);
  if (r.code !== 0) console.log(failLines(r.out));
}
for (const f of BROWSER) {
  const r = await run(f, base);
  results.push(r);
  console.log(`${r.code === 0 ? 'PASS' : 'FAIL'}  ${f.padEnd(24)} ${r.secs}s`);
  if (r.code !== 0) console.log(failLines(r.out));
}

if (own) own.server.close();
if (!runAll && FULL.length) {
  console.log(`\n${FULL.length} more audit(s) are in the FULL tier and did not run here.`);
  console.log('Run them before a release:  node tests/release-gate.mjs --all');
}
const bad = results.filter(r => r.code !== 0);
console.log(`\n${results.length - bad.length}/${results.length} suites green against ${base}`);
if (bad.length) console.log(`BLOCKED: ${bad.map(r => r.file).join(', ')}`);
process.exit(bad.length ? 1 : 0);
