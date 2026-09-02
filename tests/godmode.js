/* God mode for tests: reach any state directly instead of playing to it.
 *
 * WHY. Checks here kept being written as "play the game and hope": mash JAB and
 * wait, spin the wheel, click through overlays. That is slow, flaky, and it
 * silently fails to reach the state at all (a ladder check once ran 140 turns
 * without finishing a fight because the pet healed while the foe guarded). When
 * reaching a state is hard, it stops being verified, which is how a beaten rung
 * shipped advertising rewards it would never pay.
 *
 * Two safety rules, both enforced below, not just intended:
 *   1. Gated on navigator.webdriver. NEVER on ?demo: Tom uses ?demo to show the
 *      game to people and it must behave exactly like the real thing.
 *   2. Writes are refused unless the open database is `tally-demo`. A test run
 *      must not be able to touch a real save. Data safety in this project is
 *      additive-only for a reason: an account has been wiped twice.
 *
 * Usage from a puppeteer script:
 *   import { boot, seed, openPit, finishFight, state } from '../tests/godmode.js';
 *   const { browser, page } = await boot('http://localhost:8765/');
 *   await seed(page, { level: 12, coins: 900, beatRungs: [1, 2, 3] });
 *   await openPit(page);
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { spawn, execSync } from 'node:child_process';

export const sleep = ms => new Promise(r => setTimeout(r, ms));

/* THE DETACHED-FRAME RACE IS A HARNESS FAULT, SO THE GUARD BELONGS HERE.
 *
 * Under CPU contention Chrome's CDP can flip a frame's execution-context id
 * between one call and the next, and puppeteer throws "Attempted to use
 * detached Frame" even though nothing navigated. It was first seen in the
 * gate (3 green : 1 red) and survived 156 clean solo runs, which is why it
 * read for weeks as year-readout's own bug. On 2026-08-12 it reproduced
 * TWICE in one hour, at load average 13, in two unrelated audits: once at a
 * plain post-click page.evaluate in wardrobe-audit, once during boot in a
 * newart run. Different files, same string. So it is not any one audit's
 * bug and no audit should have to remember it.
 *
 * ONE bounded retry, and the bounds are the whole point:
 *   - ONLY this error text is caught. Anything else propagates untouched.
 *   - EXACTLY one retry. A second detach propagates, so the guard can never
 *     become a blindfold that hides a genuinely broken page.
 *   - The caller passes `resync`, the wait for the condition its first call
 *     was reading, so the retry reads a settled page rather than guessing.
 *   - The retry LOGS. Silent recovery would hide a real regression that
 *     started throwing this shape for some reason other than starvation.
 *
 * Proven with synthetic injection (a real one cannot be summoned on demand):
 * one injected detach retries and passes, two exit non-zero, and a guard
 * downstream of the wrapped call still goes red on the bug it watches.
 */
export async function retryOnDetach(fn, resync) {
  try {
    return await fn();
  } catch (e) {
    if (!/Attempted to use detached Frame/i.test(String(e))) throw e;
    console.log(`RETRY  detached frame: "${String(e).split('\n')[0]}"; resyncing and retrying ONCE.`);
    if (resync) await resync();
    return await fn();
  }
}

/* PUPPETEER MUST BE RESOLVABLE ON A MACHINE THAT IS NOT TOM'S.
 *
 * This used to be one hardcoded path:
 *   $HOME/Documents/Hyperframes Editor/overlay-render-kit/node_modules/puppeteer
 * which is a SIBLING PROJECT, not a dependency of this repo, and package.json
 * declared no dependencies at all. So a fresh clone could run `npm test` (unit and
 * pit are pure, they only read source) and NOTHING else: every browser audit and
 * the release gate died at this import. That matters because the gate is the
 * mandatory pre-push check, so an outside contributor literally could not satisfy
 * the rule the project enforces.
 *
 * Order is deliberate. The repo's OWN node_modules wins, so a normal
 * `npm install` works anywhere. The kit path stays as a fallback so the three
 * machines already set up this way keep working with no install and no version
 * drift, and it is only consulted when a local copy is absent. If neither exists,
 * THROW with both paths and the fix named: a missing browser must not read as a
 * broken app. package.json pins the same version the kit carries (24.43.1) so the
 * two routes cannot behave differently.
 */
/* MEASURED 2026-08-17, and the paragraph above was wrong on its load-bearing
 * claim. "package.json pins the same version the kit carries (24.43.1) so the
 * two routes cannot behave differently" is false: package.json pins 24.43.1 and
 * the kit on this machine carries puppeteer AND puppeteer-core 21.11.0, which
 * bundles Chrome 121 and has no Browser.createBrowserContext at all (21.x calls
 * it createIncognitoBrowserContext; the rename landed in 22). So the two routes
 * differ by three majors, and the drift surfaced inside an audit as
 * "TypeError: browser.createBrowserContext is not a function" in onb-audit,
 * which reads like the APP broke. It did not. The harness was three years old.
 *
 * Two things were wrong with the resolution itself, beyond the stale kit:
 *
 * 1. A BARE `import('puppeteer')` IS NOT "THE REPO'S OWN node_modules". Node
 *    resolves a bare specifier by walking node_modules upward from the importing
 *    file, so it finds the repo's copy only by luck of where the repo sits. Any
 *    ancestor directory with its own node_modules wins silently, and a git
 *    worktree checked out beside the main clone has no node_modules of its own
 *    at all, so the walk leaves the repo entirely. Resolve from ROOT explicitly
 *    and assert the answer is under ROOT/node_modules.
 *
 * 2. THE FALLBACK SWALLOWED EVERY ERROR. `catch { }` treated "the repo's copy is
 *    absent" and "the repo's copy is present and threw" as the same thing, and
 *    both fell through to a three-major-old sibling project. A half-installed
 *    dependency became a wrong-API browser instead of a setup error.
 *
 * The kit stays as a fallback for the machines set up that way, but it is now
 * VERSION-CHECKED against package.json's pin and refuses on a major mismatch,
 * because a silently wrong puppeteer is worse than no puppeteer: no puppeteer
 * says SETUP, wrong puppeteer says the app is broken.
 */
const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const KIT = path.join(process.env.HOME || '', 'Documents/Hyperframes Editor/overlay-render-kit/node_modules/puppeteer');
const pinnedPuppeteer = () => {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'package.json'), 'utf8')).devDependencies?.puppeteer || null; }
  catch { return null; }
};
const majorOf = v => String(v || '').replace(/^[^\d]*/, '').split('.')[0];

/* WHICH BROWSER STACK GRADED THIS RUN, on the record. Nothing could answer that
   before, which is how a 2024 puppeteer graded a 2026 app for an unknown number
   of runs. Printed once per process and readable by the gate. */
export const puppeteerOrigin = { via: null, version: null, entry: null };
export const puppeteerOriginLine = () => (puppeteerOrigin.via
  ? `puppeteer ${puppeteerOrigin.version} via ${puppeteerOrigin.via}: ${puppeteerOrigin.entry}`
  : 'puppeteer not loaded');

let _pptr = null;
export async function loadPuppeteer() {
  if (_pptr) return _pptr;
  const pinned = pinnedPuppeteer();
  const repoPkg = path.join(ROOT_DIR, 'node_modules', 'puppeteer', 'package.json');
  if (fs.existsSync(repoPkg)) {
    /* createRequire rooted AT package.json, not at this file, and the answer is
       checked: a resolve that escaped ROOT/node_modules would be the exact bug
       this block exists to close, so it throws rather than being used. */
    const entry = createRequire(path.join(ROOT_DIR, 'package.json')).resolve('puppeteer');
    /* Compared through realpath on BOTH sides, because a symlinked node_modules
       is a legitimate setup (pnpm, and a worktree pointed at the main clone's
       install) and a plain prefix test rejects it: the resolver returns the
       link's target, which is outside ROOT by construction. What matters is
       that the file came from the package ROOT/node_modules/puppeteer names,
       not that its bytes live under ROOT. */
    const real = p => { try { return fs.realpathSync(p); } catch { return p; } };
    const inRepo = real(entry).startsWith(real(path.join(ROOT_DIR, 'node_modules', 'puppeteer')) + path.sep);
    if (!inRepo) throw new Error(
      `puppeteer resolved OUTSIDE this repo despite ${repoPkg} existing:\n  ${entry}\n` +
      '  Refusing: an audit graded by a foreign puppeteer reports harness drift as app breakage.');
    _pptr = (await import(pathToFileURL(entry).href)).default;
    Object.assign(puppeteerOrigin, { via: 'repo node_modules', version: JSON.parse(fs.readFileSync(repoPkg, 'utf8')).version, entry });
    process.stderr.write(`[godmode] ${puppeteerOriginLine()}\n`);
    return _pptr;
  }
  const kitEntry = path.join(KIT, 'lib/cjs/puppeteer/puppeteer.js');
  const kitPkg = path.join(KIT, 'package.json');
  if (fs.existsSync(kitEntry)) {
    const kitVer = fs.existsSync(kitPkg) ? JSON.parse(fs.readFileSync(kitPkg, 'utf8')).version : null;
    if (pinned && majorOf(kitVer) !== majorOf(pinned)) throw new Error(
      `puppeteer VERSION DRIFT, so no browser audit may run on this machine.\n` +
      `  package.json pins ${pinned}; the fallback kit carries ${kitVer || 'an unreadable version'}.\n` +
      `  kit: ${kitEntry}\n` +
      `  Fix: run \`npm install\` in ${ROOT_DIR}.\n` +
      '  This is a SETUP failure, not a test failure. A three-major-old puppeteer does\n' +
      '  not fail loudly, it fails as a missing API inside an assertion, and that reads\n' +
      '  as the app being broken. onb-audit died on browser.createBrowserContext this way.');
    _pptr = (await import(pathToFileURL(kitEntry).href)).default;
    Object.assign(puppeteerOrigin, { via: 'fallback kit', version: kitVer, entry: kitEntry });
    process.stderr.write(`[godmode] ${puppeteerOriginLine()}\n`);
    return _pptr;
  }
  throw new Error(
    'puppeteer not found, so no browser audit can run.\n' +
    // fileURLToPath, not URL.pathname: the latter percent-encodes, and this line
    // exists to be copy-pasted ("Hyperframes%20Editor" is not a directory).
    `  tried: the repo's own node_modules (run \`npm install\` in ${ROOT_DIR})\n` +
    `  tried: ${kitEntry}\n` +
    '  This is a SETUP failure, not a test failure: nothing about the app has been checked.');
}

/* A browser that is present but not where puppeteer looks is the same outage as
   no browser at all, and it reads as one: "Could not find Chrome". Take an
   explicit CHROME_PATH, else the browsers a CI image usually already ships, else
   nothing, and nothing means puppeteer resolves it exactly as it does today, so
   a machine with its own Chrome downloaded is untouched by this. */
export const chromePath = () => {
  const tries = [process.env.CHROME_PATH, ...(process.env.PLAYWRIGHT_BROWSERS_PATH
    ? fs.existsSync(process.env.PLAYWRIGHT_BROWSERS_PATH)
      ? fs.readdirSync(process.env.PLAYWRIGHT_BROWSERS_PATH)
        .filter(d => /^chromium-/.test(d))
        .map(d => path.join(process.env.PLAYWRIGHT_BROWSERS_PATH, d, 'chrome-linux/chrome'))
      : [] : []),
  '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome'];
  return tries.find(p => p && fs.existsSync(p)) || undefined;
};

/* Same reasoning as chromePath, hoisted so an audit that launches its own
   browser instead of calling boot() cannot silently miss it. fx-audit.js did
   exactly that and died at launch on every root container. */
export const sandboxArgs = () => (process.getuid?.() === 0 ? ['--no-sandbox', '--disable-setuid-sandbox'] : []);

/* =====================================================================
 * UNPROVEN: A CHECK THAT DID NOT RUN IS NOT A CHECK THAT PASSED.
 *
 * This project's oldest wound is the empty sample read as a pass
 * (tally/CLAUDE.md rules 1 and 3). The Boneyard suites are where it bites
 * hardest, because a map that never drew makes half their rows PASS on nothing:
 * measured on this container on 2026-08-17, spire-gate's row "SPIRE handler
 * refuses even if the button is re-enabled" passed with `sheets 0 -> 0` (there
 * was no button and no sheet to open), and t1-audit's "BONEYARD mini-boss uses
 * drawn art, not a dingbat" passed on 0 markers of 0. Both are vacuous. Worse,
 * fight-exit-audit's four deepest rows are nested inside `if (launcher)`, so on
 * a machine with no map they do not fail, they CEASE TO EXIST: 26 assertions on
 * a connected machine, 22 here, and nothing said which four went missing.
 *
 * So there are three outcomes, not two, and this is the third:
 *
 *   PASS   the app was driven and behaved.
 *   FAIL   the app was driven and misbehaved.
 *   UNPRV  the app was NOT driven, because this machine cannot host the check.
 *          Zero assertions of that row ran. Nothing was learned either way.
 *
 * UNPROVEN EXITS 97, NOT 0 AND NOT 1, and that choice is the whole design:
 *   - not 0, because exit 0 is how a suite retires into silence. Every runner,
 *     every CI, every human skimming a terminal reads 0 as "fine". A suite that
 *     did not run must never be able to say "fine".
 *   - not 1, because "I found a defect" and "I could not look" are different
 *     facts and a triager who cannot tell them apart wastes a day on the wrong
 *     one, then learns to distrust reds in general.
 *   - 97 rather than a marker file or a parsed string, because an exit code is
 *     the one channel every possible runner already reads. If somebody later
 *     deletes the gate's special-casing, an unproven suite still shows up as
 *     not-green rather than silently becoming a pass. It degrades safe.
 *
 * A row is only ever unproven against a MEASUREMENT taken in the same run (see
 * boneyardCapability below). Never against a hostname, never against an env
 * var, never against a flag somebody sets by hand: those are all ways of
 * writing "skip this" with extra steps, and they stay true after the reason
 * stops being true.
 * ===================================================================== */
export const UNPROVEN_EXIT = 97;
const _unproven = [];
/* Prints and records. Returns false so it can stand where an ok() call stood
   without changing the shape of the surrounding code. */
export function unproven(name, why) {
  _unproven.push({ name, why });
  console.log(`UNPRV ${name}  DID NOT RUN: ${why}`);
  return false;
}
export const unprovenRows = () => _unproven.slice();

/* THE BANNER. Loud, by name, and printed from the measurement taken this run,
   so it cannot go stale: the moment the machine gains the missing property the
   banner stops being printed and the rows are graded for real. */
export function unprovenReport(suite, cap) {
  if (!_unproven.length) return;
  const bar = '='.repeat(78);
  console.log(`\n${bar}`);
  console.log(`UNPROVEN  ${suite} did not fully run on this machine.`);
  console.log(`UNPROVEN  ${_unproven.length} check(s) were NOT graded. This is not a pass.`);
  console.log(bar);
  if (cap) {
    console.log('  MISSING, measured in this run:');
    for (const c of cap.checks.filter(c => !c.ok)) console.log(`    ${c.kind.padEnd(6)} ${c.detail}`);
    const present = cap.checks.filter(c => c.ok);
    if (present.length) {
      console.log('  PRESENT, measured in this run, so these are NOT the reason:');
      for (const c of present) console.log(`    ${c.kind.padEnd(6)} ${c.detail}`);
    }
  }
  console.log('  Rows that did not run:');
  for (const r of _unproven) console.log(`    ${r.name}`);
  console.log(`  Exit ${UNPROVEN_EXIT} means UNPROVEN. Run this suite where the missing property exists`);
  console.log('  before believing anything about the surface it guards.');
  console.log(bar);
}

/* The one place a suite decides its exit code. A real defect outranks an
   unproven row: if something was driven and misbehaved, that is the headline. */
export function exitFor(failCount) {
  if (failCount) return 1;
  return _unproven.length ? UNPROVEN_EXIT : 0;
}

/* EVERY ROW IN THE FILE MUST BE CLASSIFIED, or the unproven list rots.
 *
 * The failure mode this closes: somebody adds a tenth Boneyard assertion and
 * does not add it to the suite's MAP_ROWS list. On a machine that can draw the
 * map nothing looks wrong. On a machine that cannot, that one row is graded
 * against a dead map and passes on an empty sample, which is the exact
 * antipattern the unproven mechanism exists to end.
 *
 * STATIC, so it runs on EVERY machine including the ones that cannot draw the
 * map, and so it can be proven red here rather than only on somebody else's
 * laptop. Reads the suite's own source, pulls every ok('...') / okMap('...')
 * literal, and requires each to appear in exactly one of the declared groups.
 * Only single-quoted literals are visible to it, which it says out loud rather
 * than pretending to total coverage. */
export function unclassifiedRows(fileUrl, groups, { after = null } = {}) {
  let src = fs.readFileSync(fileURLToPath(fileUrl), 'utf8');
  if (after) {
    /* Positional form, for a suite whose map-dependent rows are one section at
       the end (t1-audit). Classifying its other two dozen rows would be pure
       bookkeeping; classifying everything after the section marker is the same
       guarantee where the guarantee is needed. A marker that no longer matches
       is a FAILURE, not an empty scan: that is how this check would rot. */
    const at = src.indexOf(after);
    if (at < 0) return { seen: 0, missing: [`(the section marker ${JSON.stringify(after)} is gone from this file, so nothing could be classified)`] };
    src = src.slice(at);
  }
  const named = new Set();
  for (const m of src.matchAll(/\bok(?:Map)?\(\s*'((?:[^'\\]|\\.)*)'/g)) named.add(m[1].replace(/\\'/g, "'"));
  const declared = new Set(groups.flat());
  /* callSites counts EVERY row in the scanned region, including the ones whose
     name is a template literal and therefore invisible to the matcher above.
     A suite where every row is environment-dependent can assert against this
     count instead of enumerating names, and a new row still cannot slip in
     unclassified. boneyard-audit has 22 rows and 2 of them are templates. */
  const callSites = (src.match(/^\s*ok(?:Map)?\(/gm) || []).length;
  return { seen: named.size, names: [...named], callSites, missing: [...named].filter(n => !declared.has(n)) };
}

/* ---------------------------------------------------------------------
 * BONEYARD CAPABILITY, MEASURED.
 *
 * The Boneyard is MapLibre over a REMOTE vector tile host. Two environment
 * properties have to hold, and this measures both rather than assuming either:
 *
 *   WEBGL  a real WebGL context that can compile and link a program and hand
 *          back the pixel it drew. Not `!!canvas.getContext('webgl2')`: a
 *          context object that cannot draw would pass that and fail the map.
 *   TILES  every remote URL the app's OWN map style names has to answer 2xx to
 *          a real CORS fetch, which is exactly the request MapLibre makes. A
 *          style that cannot load fires map.once('error'), and js/app.js
 *          replaces the whole Boneyard with "The Boneyard needs a network
 *          signal to draw the map" plus a Retry button. No canvas, no markers,
 *          no spire offer, no den.
 *
 * THE HOST IS NEVER HARDCODED HERE. The style path is read out of js/map.js and
 * the URLs are read out of the style file, so pointing the app at a different
 * tile provider moves this probe with it. A hardcoded host is how a probe rots
 * into always-green.
 *
 * AND THE PROBE CANNOT PASS VACUOUSLY. If the style names no remote URL at all,
 * that is reported as NOT ok, because a probe with an empty sample set has
 * measured nothing (rule 3), and silence there would hand every Boneyard suite
 * a free pass on a machine that genuinely cannot draw the map.
 * --------------------------------------------------------------------- */
export async function boneyardCapability(page) {
  const checks = [];

  /* 1. WEBGL, end to end: link a program, draw one triangle, read the pixel
        back and require it to be the colour the fragment shader wrote. */
  const gl = await page.evaluate(() => {
    const c = document.createElement('canvas'); c.width = 8; c.height = 8;
    let ctx = null, api = null;
    try { ctx = c.getContext('webgl2'); api = ctx ? 'webgl2' : null; } catch { /* reported below */ }
    if (!ctx) { try { ctx = c.getContext('webgl'); api = ctx ? 'webgl' : null; } catch { /* reported below */ } }
    if (!ctx) return { ok: false, why: 'no webgl or webgl2 context could be created at all' };
    const dbg = ctx.getExtension('WEBGL_debug_renderer_info');
    const renderer = dbg ? ctx.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : ctx.getParameter(ctx.RENDERER);
    const vs = ctx.createShader(ctx.VERTEX_SHADER);
    ctx.shaderSource(vs, 'attribute vec2 p; void main(){ gl_Position = vec4(p,0.,1.); }'); ctx.compileShader(vs);
    const fs = ctx.createShader(ctx.FRAGMENT_SHADER);
    ctx.shaderSource(fs, 'precision mediump float; void main(){ gl_FragColor = vec4(0.,1.,0.,1.); }'); ctx.compileShader(fs);
    const prog = ctx.createProgram(); ctx.attachShader(prog, vs); ctx.attachShader(prog, fs); ctx.linkProgram(prog);
    if (!ctx.getProgramParameter(prog, ctx.LINK_STATUS)) return { ok: false, why: `${api} context exists but a trivial program will not link`, renderer };
    ctx.useProgram(prog);
    const buf = ctx.createBuffer(); ctx.bindBuffer(ctx.ARRAY_BUFFER, buf);
    ctx.bufferData(ctx.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), ctx.STATIC_DRAW);
    const loc = ctx.getAttribLocation(prog, 'p');
    ctx.enableVertexAttribArray(loc); ctx.vertexAttribPointer(loc, 2, ctx.FLOAT, false, 0, 0);
    ctx.viewport(0, 0, 8, 8); ctx.clearColor(0, 0, 0, 1); ctx.clear(ctx.COLOR_BUFFER_BIT);
    ctx.drawArrays(ctx.TRIANGLES, 0, 3);
    const px = new Uint8Array(4); ctx.readPixels(4, 4, 1, 1, ctx.RGBA, ctx.UNSIGNED_BYTE, px);
    const drew = px[0] === 0 && px[1] === 255 && px[2] === 0;
    return { ok: drew, api, renderer, px: [...px],
      why: drew ? '' : `${api} drew, but the pixel read back as ${[...px]} instead of the green the shader wrote` };
  });
  checks.push({ kind: 'WEBGL', ok: !!gl.ok,
    detail: gl.ok ? `${gl.api} draws and reads back: ${gl.renderer}` : gl.why });

  /* 2. TILES. Style path out of js/map.js, URLs out of the style, fetched from
        the page so the answer is the browser's, not node's. */
  const mapSrc = fs.readFileSync(path.join(ROOT_DIR, 'js', 'map.js'), 'utf8');
  const stylePath = mapSrc.match(/style:\s*'([^']+)'/)?.[1] || null;
  if (!stylePath) {
    checks.push({ kind: 'TILES', ok: false,
      detail: "js/map.js no longer declares `style: '...'`, so this probe cannot find the map style. Fix the probe; do not assume the map works." });
    return { ok: false, checks };
  }
  /* "Failed to fetch" is what the page sees and it names no cause. Chrome's own
     net:: error text is the actionable half (ERR_CERT_AUTHORITY_INVALID reads
     very differently from ERR_NAME_NOT_RESOLVED to whoever has to fix the
     machine), and it is only available on the puppeteer side. */
  const netErr = new Map();
  const onFail = r => netErr.set(r.url(), r.failure()?.errorText || '');
  page.on('requestfailed', onFail);
  const net = await page.evaluate(async (sp) => {
    const styleUrl = new URL(sp, location.href).href;
    let style;
    try {
      const r = await fetch(styleUrl);
      if (!r.ok) return { fatal: `${styleUrl} answered HTTP ${r.status}` };
      style = await r.json();
    } catch (e) { return { fatal: `${styleUrl} could not be fetched: ${e.message}` }; }
    const urls = new Set();
    for (const s of Object.values(style.sources || {})) {
      if (s.url) urls.add(s.url);
      for (const t of s.tiles || []) urls.add(t);
    }
    if (style.glyphs) urls.add(style.glyphs);
    if (style.sprite) urls.add(String(style.sprite) + '.json');
    const remote = [...urls].filter(u => /^https?:\/\//i.test(u))
      // a tile template is not fetchable as written; the source URL above is
      .map(u => u.replace('{z}', '0').replace('{x}', '0').replace('{y}', '0'));
    if (!remote.length) return { empty: true, styleUrl };
    const out = [];
    for (const u of remote) {
      try { const r = await fetch(u); out.push({ u, ok: r.ok, status: r.status }); }
      catch (e) { out.push({ u, ok: false, status: 0, err: e.message }); }
    }
    return { results: out, styleUrl };
  }, stylePath);
  page.off('requestfailed', onFail);
  const why = u => netErr.get(u) || '';

  if (net.fatal) checks.push({ kind: 'TILES', ok: false, detail: net.fatal });
  else if (net.empty) checks.push({ kind: 'TILES', ok: false,
    detail: `${net.styleUrl} names no remote host at all, so this probe measured NOTHING. An empty sample set is a failure, not a pass.` });
  else for (const r of net.results) {
    checks.push({ kind: 'TILES', ok: r.ok,
      detail: r.ok ? `${r.u} answered HTTP ${r.status}`
        : `${r.u} is UNREACHABLE from this machine (${[why(r.u), r.err || (r.status ? 'HTTP ' + r.status : '')].filter(Boolean).join(', ')})` });
  }

  return { ok: checks.every(c => c.ok), checks };
}

/* AN AUDIT THAT MASKS webdriver STOPS TALKING TO THE REAL WORLD.
 *
 * WHY THE MASK IS CORRECT. Every automation gate in this app keys off the same
 * flag: NOSOCIAL (`S.demo || navigator.webdriver === true`, js/app.js),
 * CALM_BOOT, and the BOT gate in js/analytics.js. An unmasked page therefore
 * exercises the calm boot, not the first run a player gets, so the suites that
 * grade onboarding, the launch gates and the notification asks have to mask it.
 * That is not the bug and it is not being taken away.
 *
 * WHY IT NEEDS A WALL. The mask also removes the only thing that was keeping
 * those runs OFF the network. js/social.js falls back to PROD_API when no ?api=
 * override is stored, so a masked virgin install boots, completes onboarding and
 * registers for real. The server only stamps players.is_test when the client
 * sends {test:true} (server/src/index.js), which the app itself never does.
 *
 * MEASURED 2026-09-02, one run of tests/profile-units-audit.mjs with a request
 * log on every page: 20 requests to bonez-api.boneheadz.workers.dev, of which 3
 * were POST /register carrying a real P-256 pubkey and 3 were POST /events
 * shipping onboarding analytics. Production D1 went 73 -> 93 players in a day of
 * local runs, level-1 skeleton handles in clusters that line up with gate runs.
 *
 * WHY A WALL AND NOT {test:true}. A flag still mints rows, still needs the
 * server to honour it, and still depends on every future author remembering it.
 * The bug is not "the audit registered", it is "the audit reached the real
 * world"; the API is only the leak that left evidence. So the rule is the blunt
 * one: localhost in every spelling continues, everything else is refused.
 *
 * WHY IT IS LOUD BUT DOES NOT FAIL THE RUN. Refusing is already the correct
 * outcome and the app will keep TRYING (it has no local API to talk to), so a
 * suite that failed on a refusal would be permanently red on healthy code, which
 * is how a guard gets routed around. Instead each refused host is named once,
 * with the suite that reached for it, plus a summary at exit, so a NEW external
 * dependency is discovered the first time somebody runs the file. The hard
 * failure lives where it can only go red on a real defect: live-api-register-lint
 * refuses a mask installed without this wall.
 *
 * LOCALHOST MUST KEEP WORKING. serveTree hands out 127.0.0.1 URLs and several
 * suites stub an API on a local port, so every spelling of the loopback host is
 * allowed, on any port. Schemes with no host at all (data:, blob:, file:) never
 * leave the machine and are not egress.
 */
const LOOPBACK = /^(?:localhost|127(?:\.\d{1,3}){3}|\[::1\]|0\.0\.0\.0|.+\.localhost)$/i;
const _refused = new Map();          // host -> the first request that wanted it
export async function maskWebdriver(page) {
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false, configurable: true });
  });
  await page.setRequestInterception(true);
  page.on('request', req => {
    let host = null;
    try { host = new URL(req.url()).hostname; } catch { /* data:, blob:, about: */ }
    if (host && !LOOPBACK.test(host)) {
      if (!_refused.size) process.on('exit', () => {
        console.log(`\nEGRESS REFUSED  ${[..._refused.keys()].join(', ')}`);
        for (const [h, first] of _refused) console.log(`  ${h}  first wanted by  ${first}`);
        console.log('  A masked audit does not talk to the real world. If it needs an answer, serve');
        console.log('  one locally and point the app at it with ?api=<local url>.');
      });
      if (!_refused.has(host)) {
        const first = `${req.method()} ${req.url().slice(0, 120)}`;
        _refused.set(host, first);
        console.log(`EGRESS REFUSED  ${path.basename(process.argv[1] || 'audit')} -> ${host}  (${first})`);
      }
      /* Refused with no priority, so it lands immediately and nothing
         registered later can vote it back open. */
      req.abort('blockedbyclient').catch(() => {});
      return;
    }
    /* A PRIORITY VOTE, not a plain continue. cloud-restore-silent-audit and
       honest-surfaces-audit install their own stub handler AFTER the mask, and a
       legacy continue here would resolve the request before their stub ever saw
       it, which would silently un-stub them. A vote is deferred to the end of
       the listener chain, so their respond() still wins and a page with no other
       handler still gets its request through. */
    req.continue({}, 0).catch(() => {});
  });
}

/* NO BASE MEANS THIS CHECKOUT, NEVER PRODUCTION. This default used to be the
   literal live URL, and that is a footgun that fired repeatedly.

   In the release gate it never showed: release-gate passes `base` as argv[2] to
   every browser suite, so gate runs always graded the tree. The damage was to
   BARE runs, which is how every debugging session and every prove-red happens.
   MEASURED 2026-08-27: 26 audits called boot() with an unset argv/env and
   silently graded https://tommillerca.github.io/tally/.

   It cost a full investigation the same day. melt-ui-audit had one red row; it
   read the SAME red against a pristine origin/main worktree, so it was reported
   as pre-existing and structural. It was neither. Two cp -R mutations of the
   exact copy that row asserts on changed the output by NOTHING, because the
   mutated files were never served. An audit that cannot see your edit will agree
   with you about anything.

   Nothing wanted the old behaviour: checked, zero audits reference the live URL
   as a value rather than in a comment warning about this. Anything that ever
   does need production can still pass it explicitly, which is also the only way
   it should ever be a deliberate act.

   The server is closed on process exit rather than handed back, because these
   are short-lived test processes and every existing caller already owns its own
   teardown; giving boot() a second return value would mean editing all 26. */
export async function boot(base, opts = {}) {
  if (!base) {
    const own = await serveTree(ROOT_DIR);
    base = own.url;
    process.once('exit', () => { try { own.close(); } catch { /* already down */ } });
  }
  /* Sweep anything an earlier killed run stranded BEFORE launching ours, so a
     leak is bounded by "until the next audit runs" even on a machine where the
     nanny somehow never started. Only touches ppid-1 orphans, never a live
     suite's browser. */
  reapStrandedBrowsers();
  const puppeteer = await loadPuppeteer();
  /* Chrome refuses to start its sandbox as uid 0, so on a root container every
     check here dies at launch and reads as "the browser is broken". No-op on a
     normal machine: the flag is only added when we are already root, which is
     the only case where the sandbox was never going to come up anyway. */
  const rootArgs = sandboxArgs();
  const browser = await puppeteer.launch({
    /* HEADLESS_MODE exists so a machine where modern headless cannot screenshot
       can still run the pixel audits. On this Mac, Page.captureScreenshot never
       returns under headless 'new' OR true, for any page, including a bare
       data: URL with nothing in it: measured at 22ms under 'shell' and hung
       past 180s under both others, four runs each. hero-flash.mjs dies on it
       with a stack and no FAIL lines, which reads like a broken app.
       Default is unchanged until somebody proves 'shell' does not move any
       other result. */
    headless: process.env.HEADLESS_MODE || 'new',
    defaultViewport: { width: 430, height: 932, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
    executablePath: chromePath(),
    ...opts,
    args: [...rootArgs, ...(opts.args || [])],
  });
  /* TRACK THE BROWSER BEFORE ANYTHING ELSE CAN THROW.
   * A boot that throws AFTER launch is exactly the leak Gwart found on Tom's
   * machine on 2026-08-14: 16 orphaned Chrome parents + 176 helpers, one alive
   * 15 hours, from 39 audits that time out at page.goto every run. The audit's
   * code cannot close a browser it never received a reference to, so cleanup
   * belongs here, not there. Track NOW so the process-exit backstop covers
   * even the throw-inside-boot path, and set an internal try so we can close
   * synchronously and rethrow with the browser already gone. */
  _trackBrowser(browser);
  try {
    const page = await browser.newPage();
    /* COLLECTED, NOT JUST PRINTED, AND HOOKED BEFORE THE FIRST goto. A suite that
       attaches its own pageerror listener after boot() returns cannot see anything
       thrown during the very first load, which is exactly where a broken module
       import or a bad top-level await lands: the app comes up empty, every later
       assertion fails for its own reason, and the actual cause is nowhere in the
       output. Returned so callers can assert on it. Additive: callers that
       destructure only { browser, page } are unaffected. */
    const errors = [];
    page.on('pageerror', e => { errors.push(String(e)); console.log('PAGEERROR', e.message); });
    // ?demo puts us on the tally-demo database, which is what seed() insists on.
    await page.goto(base.replace(/\/?$/, '/') + '?demo', { waitUntil: 'networkidle2' });
    await sleep(2400);
    await dismissOverlays(page);
    return { browser, page, base: base.replace(/\/?$/, '/'), errors };
  } catch (e) {
    /* Close in the same throw so the caller does not have to. `catch (e) close;
       throw e` is enough: no try/finally in the caller can save a browser they
       never received a reference to. Swallow close errors, the caller cares
       about the ORIGINAL throw, not that cleanup also complained. */
    await browser.close().catch(() => {});
    throw e;
  }
}

/* The demo profile opens with a daily spin and assorted first-run cards. They are
   not what any check is about, so clear them once, up front. */
export async function dismissOverlays(page, rounds = 6) {
  for (let i = 0; i < rounds; i++) {
    /* NOTHING REACHABLE IS NOT NOTHING TO WAIT FOR. Before the hit-test below
       existed, a phantom match returned true, so this loop kept going and spent
       up to rounds*1500ms settling. Suites came to depend on that delay without
       anyone intending it: redeem-dupe-audit read a backup-tip toast instead of
       its redeem toast the moment the loop exited early. Removing a bug that was
       load-bearing needs the load carried somewhere honest, so keep the settle
       and drop only the bogus clicking. */
    if (!await click(page, /^(spin|nice|done|collect|claim|continue|ok|got it|next|skip|back to the pit)$/)) {
      await sleep(1500 * (rounds - i));
      return;
    }
    await sleep(1500);
  }
}

/* Click by visible label, with a real mouse event at the element's centre.
   Programmatic .click() does not reach some of this app's handlers, so do not
   swap this for one: a FIGHT button that silently ignores .click() is exactly the
   kind of thing that makes a check pass while testing nothing. */
export async function click(page, re) {
  const hit = await page.evaluate(src => {
    const rx = new RegExp(src, 'i');
    // A button below the fold measures fine but a mouse click at its coordinates
    // lands in dead space; a whole verification run once read as 7 failures
    // because of exactly this. Scroll first, like a thumb would.
    //
    // SCROLLING IS NOT ENOUGH, and this cost another seven. A button inside a
    // COLLAPSED <details> matches on textContent and reports a non-zero width,
    // but scrollIntoView cannot bring it into view because it is clipped by an
    // ancestor with overflow:hidden. The click then fires at coordinates that
    // belong to whatever is really there. Measured 2026-08-23: Today's quests
    // live in <details class="q-collapse">, so its "Claim" matched while
    // collapsed, and on one branch its phantom centre landed on the bonehead
    // TAB. Every suite using boot() then started on the hub instead of Today,
    // and seven unrelated audits failed at once looking like app regressions.
    // So HIT-TEST after scrolling and skip anything that is not really there.
    // Clicking the wrong element is worse than clicking nothing: nothing is a
    // visible no-op, wrong is a silent navigation.
    // FIRST MATCH ONLY, exactly as before. An earlier version of this fix hunted
    // for the next REACHABLE match instead, which quietly changed the contract:
    // it could now click a button the old code never would have, and
    // redeem-dupe-audit went red because a different overlay got dismissed and
    // it captured a backup-tip toast instead of the redeem toast. Skipping a
    // phantom click is a bug fix; clicking a different button is a new
    // behaviour. Do the first, never the second.
    const b = [...document.querySelectorAll('button')]
      .find(x => rx.test((x.textContent || '').trim()) && !x.disabled && x.getBoundingClientRect().width);
    if (!b) return null;
    b.scrollIntoView({ block: 'center' });
    const r = b.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const top = document.elementFromPoint(cx, cy);
    // Not really there: report "nothing to click" rather than clicking whatever
    // occupies those coordinates.
    if (!top || !(top === b || b.contains(top))) return null;
    return { x: cx, y: cy };
  }, re.source);
  if (!hit) return false;
  await page.mouse.click(hit.x, hit.y);
  return true;
}

/* Seed state by writing the SAME rows the game writes, then reloading so every
   selector and render reads it the normal way. Nothing here is a special test
   path through the UI, which is the point: the render being checked is the real
   one, fed real data.
     level      -> an xp award row worth enough to reach that level
     coins/dust -> the kv values the app reads
     beatRungs  -> ladder rungs marked beaten, exactly as a win records them
     champ      -> the Champion marked beaten
     xp         -> arbitrary extra award rows, if you need a specific shape
   Reloads by default; pass { reload: false } to batch several seeds. */
/* THE PLAYER'S DAY IS A LOCAL DAY, AND toISOString() IS NOT IT.
 * js/nutrition.js's dateKey formats the LOCAL date, because a food diary day is
 * the day the player is actually having. Every audit that reached for
 * `new Date().toISOString().slice(0, 10)` was therefore seeding UTC, and from
 * the moment UTC rolls over until local midnight the two disagree by a day.
 * That window is four hours in EDT and longer further west.
 *
 * MEASURED 2026-08-27 at 21:5x EDT, which is 01:5x UTC on the 28th:
 *   day-strip-audit   three rows red, demanding tomorrow's date from an app
 *                     that was correct (fixed in its own commit)
 *   readiness-audit   every scenario scored the base 72, better AND worse,
 *                     because the one differing reading was dated a day ahead
 *                     and never became "latest", so every delta cancelled
 * Both PASSED earlier the same day, before UTC rolled over. That is what makes
 * this class so durable: it looks like flake, and it is right two thirds of the
 * time.
 *
 * Exported so audits share one answer instead of each rolling their own. Page
 * context cannot import this, so the few that build dates inside
 * page.evaluate() format them the same way inline, with a comment pointing here. */
export const localDay = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export async function seed(page, opts = {}) {
  const res = await page.evaluate(async (o) => {
    // THE guard, and it has to be about THIS PAGE, not about what databases exist.
    // The first version only checked that a tally-demo database was present, which
    // is true on any origin that has ever loaded ?demo. It would happily have let a
    // non-demo page through. The app switches to tally-demo only when the ?demo
    // param is set (app.js: useDbName('tally-demo')), so that param is the real
    // signal that this page cannot be pointed at a live save.
    if (!new URLSearchParams(location.search).has('demo')) {
      return { error: 'refusing to seed: this page is NOT in ?demo mode, so it is on a real save. Load it with ?demo.' };
    }
    const dbs = (await indexedDB.databases()).map(d => d.name);
    const name = dbs.find(n => n === 'tally-demo');
    if (!name) return { error: `refusing to seed: no tally-demo database (saw: ${dbs.join(', ') || 'none'})` };
    const db = await new Promise((res2, rej) => {
      const r = indexedDB.open(name); r.onsuccess = () => res2(r.result); r.onerror = () => rej(r.error);
    });
    /* LOCAL, not UTC: see localDay above. seed() dates its XP rows, and a row
       dated a day ahead is not "today" to anything in the app that groups by
       dateKey, which is how a level seeded at 9pm EDT landed on tomorrow. */
    const today = (d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`)(new Date());
    const xpRows = [];
    if (o.level) xpRows.push({ key: 'godmode-level', type: 'quest', xp: o.level * o.level * 40, label: 'test seed', date: today, ts: Date.now() });
    for (const r of o.beatRungs || []) xpRows.push({ key: `pitrung-${r}`, type: 'pitrung', xp: 40, label: `Ladder: beat rung ${r}`, date: today, ts: Date.now() });
    if (o.champ) xpRows.push({ key: 'pitchamp', type: 'pitchamp', xp: 100, label: 'Champion beaten', date: today, ts: Date.now() });
    for (const r of o.xp || []) xpRows.push({ date: today, ts: Date.now(), ...r });
    if (xpRows.length) {
      await new Promise((res2, rej) => {
        const tx = db.transaction('xp', 'readwrite');
        xpRows.forEach(r => tx.objectStore('xp').put(r));
        tx.oncomplete = res2; tx.onerror = () => rej(tx.error);
      });
    }
    const kv = {};
    if (o.coins != null) kv.coins = o.coins;
    if (o.dust != null) kv.bonedust = o.dust;   // loot.js reads 'bonedust'; 'dust' seeded nothing
    if (Object.keys(kv).length) {
      await new Promise((res2, rej) => {
        const tx = db.transaction('kv', 'readwrite');
        for (const [k, v] of Object.entries(kv)) tx.objectStore('kv').put({ k, v });
        tx.oncomplete = res2; tx.onerror = () => rej(tx.error);
      });
    }
    return { db: name, xpRows: xpRows.map(r => r.key), kv: Object.keys(kv) };
  }, opts);
  if (res.error) throw new Error(res.error);
  if (opts.reload !== false) {
    await page.reload({ waitUntil: 'networkidle2' });
    await sleep(2400);
    await dismissOverlays(page);
  }
  return res;
}

/* Open the Pit, closing any sheet already open first. This matters: opening it
   twice leaves TWO Pit sheets in the DOM, and a querySelector then reads the
   stale one. That cost a real debugging round here, where the database correctly
   showed a rung beaten while the harness kept reading the old sheet and calling
   it a regression. */
export async function openPit(page) {
  for (let i = 0; i < 3; i++) {
    if (!await click(page, /^done$/)) break;
    await sleep(500);
  }
  await page.evaluate(() => document.getElementById('pitBtn')?.click());
  await sleep(1600);
  const sheets = await page.evaluate(() => document.querySelectorAll('.pit-sect').length);
  if (sheets > 4) throw new Error(`${sheets} pit sections on screen: more than one Pit sheet is open, so any row read here could be stale`);
}

/* Start a specific ladder fight by rung number, without climbing to it. */
export async function fightRung(page, rung) {
  await openPit(page);
  const started = await page.evaluate(r => {
    const btn = document.querySelector(`button[data-rung="${r}"]`);
    if (!btn || btn.disabled) return false;
    const b = btn.getBoundingClientRect();
    return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
  }, rung);
  if (!started) return false;
  await page.mouse.click(started.x, started.y);
  await sleep(2400);
  return page.evaluate(() => !!document.querySelector('#youStage'));
}

/* Resolve the current fight through the game's REAL engine (see __bhFight.finish
   in app.js). Returns the {winner} object, or false if it could not be reached,
   which is a failure to report, never a pass. */
export async function finishFight(page, winner = 'p') {
  const has = await page.evaluate(() => !!window.__bhFight);
  if (!has) throw new Error('__bhFight missing: not in a fight, or the build predates the test hook');
  const over = await page.evaluate(w => window.__bhFight.finish(w), winner);
  await sleep(1200);
  return over;
}

export const fightState = page => page.evaluate(() => window.__bhFight && window.__bhFight.state());

/* Read a Pit row's reward line and button, the thing a player actually reads.
   Takes the LAST match on purpose: if an older sheet is still in the DOM the
   first match is the stale one, which reads as a bug that is not there. */
export const pitRow = (page, name) => page.evaluate(n => {
  const rows = [...document.querySelectorAll('.crate-row')].filter(r => new RegExp(n).test(r.textContent));
  const row = rows[rows.length - 1];
  if (!row) return null;
  return {
    text: row.querySelector('small')?.textContent.trim(),
    button: row.querySelector('button')?.textContent.trim() || null,
    duplicateSheets: rows.length,
  };
}, name);

export const state = page => page.evaluate(() => ({
  build: (document.body.innerText.match(/v\d{3}/) || [])[0] || null,
  screen: document.querySelector('.screen')?.className || null,
}));


/* Headless Chrome here never advances CSS animations: a .sheet reports
   playState 'running' with currentTime stuck at 0, so it paints at the FROM
   keyframe, translate(-50%, 60%), and every getBoundingClientRect on a sheet
   reads ~545px too low. Any audit that measures a sheet against the viewport is
   measuring that artifact, not the app. Call this first. */
export async function settle(page, ms = 250) {
  await page.evaluate(() => document.getAnimations().forEach(a => { try { a.finish(); } catch {} }));
  await new Promise(r => setTimeout(r, ms));
}

/* CHANGE WIDTH THROUGH THIS, NEVER page.setViewport DIRECTLY.
 *
 * puppeteer reloads the page for you when isMobile or hasTouch CHANGE, and it
 * reads a missing key as false:
 *   cdp/Page.js:819           if (needsReload) { await this.reload(); }
 *   cdp/EmulationManager.js:335  const mobile = viewport?.isMobile || false;
 * boot() launches with both true (defaultViewport above), so a call that just
 * says { width, height, deviceScaleFactor } flips both to false and silently
 * throws the document away. On this app that costs a fresh 10-13s seeded boot in
 * the middle of a suite, and its route() closes every sheet the audit had open.
 * Measured on 54e359b, extra documents served after one setViewport:
 *   { w, h, dsf }                     [1, 1, 1]
 *   { w, h, dsf, isMobile, hasTouch } [0, 0, 0]
 * It was two lines in batch-audit that cost a week of chasing a "phantom reload".
 *
 * This always carries both flags, so the viewport changes and nothing reloads.
 * A desktop viewport is a legitimate thing to want, but it must be deliberate:
 * pass them yourself and expect the reload. tests/unit.test.js enforces that any
 * direct setViewport call states both keys.
 */
export async function setWidth(page, width, height = 932) {
  await page.setViewport({ width, height, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
}

/* SERVE THIS CHECKOUT, AND FAIL LOUDLY IF THE PORT WAS NOT OURS.
 *
 * The self-serving audits each did:
 *   spawn('python3', ['-m','http.server','8134','--bind','127.0.0.1'], { stdio: 'ignore' })
 * on a HARD-CODED port with stdio thrown away. Three problems, in rising order of
 * nastiness:
 *   1. A stranded server from a killed run already holds the port. python exits with
 *      "Address already in use" straight into /dev/null, and the audit then talks to
 *      whatever IS listening. It passes or fails about somebody else's tree.
 *   2. Three ports are double-booked INSIDE this repo: 8146 (crew-inbox, onb-audit),
 *      8147 (feel-audit, milestones), 8171 (race-you, scout-audit). One checkout is
 *      only honest because they never run at the same moment.
 *   3. `await sleep(900)` then carry on: a slow start reads as a dead server.
 *
 * So: ask the OS for a free port, keep the child's stderr, and wait for python to say
 * it is serving. If it exits first, that is a hard error naming what python said. A
 * failed bind can no longer be silent, which is the whole point.
 */
export async function serveTree(root, { timeoutMs = 15000, forcePort = null } = {}) {
  /* forcePort exists so the failure branches can be PROVEN: point it at a privileged
     port and python cannot bind, which is the stranded-server case without needing a
     stranded server (macOS happily lets two processes share a port with SO_REUSEADDR,
     so squatting does not reproduce it). */
  const net = await import('node:net');
  const port = forcePort || await new Promise((res, rej) => {
    const s = net.createServer();
    s.once('error', rej);
    s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => res(port)); });
  });
  const srv = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1'],
    { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
  /* Track BEFORE anything downstream can throw, same reason as boot(): the caller
     never saw this child, so cleanup on parent-throw belongs here. */
  _trackServer(srv);
  let err = '';
  srv.stderr.on('data', d => { err += d; });
  srv.stdout.on('data', () => {});
  let exited = null;
  srv.on('exit', (code, sig) => { exited = sig || `exit ${code}`; });

  const url = `http://127.0.0.1:${port}/`;
  const t0 = Date.now();
  for (;;) {
    if (exited) throw new Error(`serveTree: python died before serving ${url} (${exited}). stderr: ${err.trim().split('\n').pop() || '(silent)'}`);
    try { if ((await fetch(url + 'index.html')).ok) break; } catch { /* not up yet */ }
    if (Date.now() - t0 > timeoutMs) { srv.kill('SIGKILL'); throw new Error(`serveTree: nothing answered on ${url} within ${timeoutMs}ms. stderr: ${err.trim() || '(silent)'}`); }
    await new Promise(r => setTimeout(r, 100));
  }
  return { url, port, close: () => { try { srv.kill('SIGKILL'); } catch { /* already gone */ } } };
}

/* PROCESS-EXIT SAFETY NET for browsers and serveTree children.
 *
 * The observed leak Gwart found on 2026-08-14: 16 orphaned Chrome parents + 176
 * helpers on Tom's machine, one alive 15 HOURS, flattening his battery. It came
 * from the 39 census audits that time out at page.goto every run: boot() throws
 * INSIDE itself so the audit never gets a browser reference to close, and any
 * try/finally in the audit body cannot save what it never received. The
 * post-launch try/catch in boot() covers the specific throw-inside-boot leak.
 * This handles the wider class:
 *   - the audit gets its browser fine, then throws before browser.close().
 *   - the audit runs to completion but exits without calling close() at all.
 *   - the audit is interrupted (Ctrl-C, harness SIGTERM).
 *   - an unhandledRejection or uncaughtException tears the process down.
 *
 * What is deliberately NOT covered here: a timeout SIGKILL from the harness.
 * `process.on('exit')` does not fire when the OS kills the process, so nothing
 * inside node can clean up in that case. That's the census's job, and its
 * cwd-scoped reap between iterations handles it.
 *
 * Sync-only in the 'exit' handler (node does not await inside 'exit'); async
 * cleanup happens in the signal / uncaught handlers, with a sync SIGKILL fallback
 * afterwards. `Browser.process()` returns the Chrome parent ChildProcess so we can
 * send SIGKILL from the synchronous path; a graceful browser.close() reaps helper
 * processes properly and is preferred when we can await. Missing helper reaping is
 * exactly the "176 orphaned helpers" story, so both paths matter.
 */
const _browsers = new Set();
const _servers = new Set();

/* THE ONE HOLE NOTHING INSIDE NODE CAN PLUG, PLUGGED FROM OUTSIDE IT.
 * Everything above is a handler that runs INSIDE this process, so SIGKILL beats
 * all of it: the note above says so and delegated the case to the census, which
 * only helps on runs the census performs. A single audit killed by a harness
 * timeout left nothing to reap it.
 *
 * WHAT THAT COSTS, MEASURED ON TOM'S MACHINE 2026-08-27: an orphaned
 * chrome-headless-shell whose GPU child sat at 1200% CPU, eleven cores of
 * SwiftShader software rendering, for 1h37m with no parent (ppid 1) and no page
 * doing anything. It was started at 14:07:35 by an audit that a 2-minute
 * timeout SIGKILLed.
 *
 * So the reaper is a SEPARATE, DETACHED process that cannot be killed with us.
 * It watches OUR pid, and when we are gone it kills the browser. `sh` rather
 * than a second node: about 1MB, no module graph, and it is asleep the whole
 * time. It exits on its own the moment either side is gone, so it never
 * accumulates.
 *
 * kill -0 tests existence without signalling. The browser pid is Chrome's own
 * parent process (Browser.process()), which is what puppeteer reaps helpers
 * through, so killing it takes the renderers and the GPU child with it. */
function _nanny(browser) {
  const proc = browser.process();
  const pid = proc && proc.pid;
  if (!pid) return;
  const script = `while kill -0 ${process.pid} 2>/dev/null; do kill -0 ${pid} 2>/dev/null || exit 0; sleep 2; done; kill -9 -${pid} 2>/dev/null || kill -9 ${pid} 2>/dev/null; exit 0`;
  try {
    const n = spawn('/bin/sh', ['-c', script], { detached: true, stdio: 'ignore' });
    n.unref();
    browser.once('disconnected', () => { try { process.kill(n.pid, 'SIGKILL'); } catch { /* already gone */ } });
  } catch { /* a machine that cannot spawn sh has bigger problems than this */ }
}

/* AND CLEAN UP WHAT EARLIER RUNS ALREADY STRANDED. Orphans are identifiable
 * without guessing: ppid 1 (reparented to launchd because their launcher died)
 * AND a binary under the puppeteer cache. A browser belonging to a LIVE audit
 * has a live parent, so it is never matched, which is what makes this safe to
 * run while other suites are going. Best-effort and silent: this is hygiene,
 * not a check, and it must never be the reason a suite fails. */
export function reapStrandedBrowsers() {
  if (process.platform === 'win32') return 0;
  try {
    const out = execSync("ps -Ao pid,ppid,args", { encoding: 'utf8' });
    const dead = out.split('\n')
      .filter(l => /cache\/puppeteer/.test(l) && !/--type=/.test(l))
      .map(l => l.trim().split(/\s+/))
      .filter(f => f[1] === '1')
      .map(f => +f[0])
      .filter(Boolean);
    for (const pid of dead) { try { process.kill(pid, 'SIGKILL'); } catch { /* gone */ } }
    return dead.length;
  } catch { return 0; }
}

function _trackBrowser(browser) {
  _installExitHandlers();
  _nanny(browser);
  _browsers.add(browser);
  browser.once('disconnected', () => _browsers.delete(browser));
}
function _trackServer(srv) {
  _installExitHandlers();
  _servers.add(srv);
  srv.once('exit', () => _servers.delete(srv));
}

let _handlersInstalled = false;
function _installExitHandlers() {
  if (_handlersInstalled) return;
  _handlersInstalled = true;
  const syncReap = () => {
    for (const b of _browsers) { try { b.process()?.kill('SIGKILL'); } catch { /* already dead */ } }
    for (const s of _servers)  { try { s.kill('SIGKILL'); } catch { /* already dead */ } }
    _browsers.clear();
    _servers.clear();
  };
  process.once('exit', syncReap);
  /* async cleanup for signal / crash paths: graceful browser.close() reaps
     helpers properly, but bounded so a stuck close cannot hang the process. */
  const asyncReap = async (exitCode) => {
    await Promise.race([
      Promise.allSettled([
        ...[..._browsers].map(b => b.close().catch(() => {})),
        ...[..._servers].map(s => new Promise(res => {
          if (s.exitCode != null || s.killed) return res();
          s.once('exit', res);
          try { s.kill('SIGTERM'); } catch { res(); }
          setTimeout(() => { try { s.kill('SIGKILL'); } catch {} res(); }, 500);
        })),
      ]),
      new Promise(r => setTimeout(r, 3000)),
    ]);
    syncReap();
    process.exit(exitCode);
  };
  process.once('SIGINT',  () => asyncReap(130));
  process.once('SIGTERM', () => asyncReap(143));
  /* uncaughtException / unhandledRejection are the audit-throws-before-close
     path. Node's default is print+exit(1) which fires 'exit' where syncReap
     runs, but graceful close is better if we can arrange it. Print first so
     the error is not lost to our own logic. */
  process.once('uncaughtException', e => {
    console.error(e && e.stack || e);
    asyncReap(1);
  });
  process.once('unhandledRejection', e => {
    console.error(e && (e.stack || e) || 'unhandledRejection');
    asyncReap(1);
  });
}

/* Opt-in try/finally wrapper for new audits.
 *
 * Existing audits already do this pattern by hand and are fine. New audits get
 * one-line correctness: withBoot(base, async ({browser, page}) => {...}) always
 * calls browser.close() on any exit path, even a throw. The process-exit safety
 * net above catches everyone else; this makes the pattern obvious for the next
 * person writing an audit.
 */
export async function withBoot(base, fn, opts = {}) {
  const b = await boot(base, opts);
  try { return await fn(b); }
  finally { await b.browser.close().catch(() => {}); }
}

/* THE WANDERER THE APP WILL ACTUALLY DRAW, and a point at a bearing off him.
 *
 * The two live Wanderer suites both used to ask js/wanderer.js where he is with
 * `wanderersNear(date, lat, lng)` and no fourth argument. js/app.js asks with
 * one: js/water.js's land oracle. That is not a detail. wandererAt runs a SEEDED
 * FALLBACK over beat centres until the whole 45-minute lap is off the water
 * (Tom, 2026-08-22: "The wanderer is out in the lake where I am right now"), and
 * the candidate index k is not part of his id. So the oracle-free call returns
 * the RIGHT ID at the WRONG PLACE whenever candidate 0 is wet, and every suite
 * that then stands the player "45 m into his light" is standing in a cone that
 * does not exist.
 *
 * MEASURED, 2026-08-27, 224 (date, instance) samples at HOME over 7 days:
 *   CONE-OK    190   the oracle-free point really is inside the real cone
 *   CONE-MISS   25   he moved (331 m, 556 m, 599 m measured) and it is not
 *   ID-ABSENT    2   the oracle-free id is not in the real set at all
 *   WET-EMPTY    2   nobody in range once the land constraint applies
 *   NO-BARE      5   nobody in range at all: a real data state
 * 12% of instances put the player outside the light while the suite reported
 * "no arena and no __bhFight after taking the encounter", which reads as a dead
 * fight engine and is nothing of the kind.
 *
 * SO THE ORACLE IS WARMED AND PASSED, HERE, at the one place both suites ask.
 * isWater answers undefined until its z14 tile lands, and an undefined anywhere
 * on the lap makes wandererAt return null, so the tiles for the 3x3 cell block
 * around `home` are pulled first and the caller is told whether they all landed.
 *
 * RETURNS { w: null } WHEN NOBODY IS IN RANGE, which is a real data state: he
 * walks a 140-220 m loop and can leave WANDER_SHOW_M inside an instance. The
 * caller must DECLARE that, never index [0] into it. The patrol suite did index
 * into it and died with `Cannot read properties of undefined (reading 'lat')`,
 * exit 1, ZERO rows graded, four runs out of five on 2026-08-27.
 */
export async function realWanderer(page, home, { offsetDeg = 0, metres = 45, anyone = false, deadlineMs = 30000 } = {}) {
  return page.evaluate(async ({ home, offsetDeg, metres, anyone, deadlineMs }) => {
    const W = await import('./js/wanderer.js');
    const water = await import('./js/water.js');
    const { dateKey } = await import('./js/nutrition.js');
    /* One z14 tile is 0.022 deg of longitude and ~0.015 deg of latitude here, so
       a 0.008 deg lattice cannot step over one, and +-0.032 deg covers the 3x3
       cell block (WANDER_CELL_DEG 0.02) the derivation reads. */
    const pts = [];
    for (let a = -4; a <= 4; a++) for (let b = -4; b <= 4; b++) pts.push([home.latitude + a * 0.008, home.longitude + b * 0.008]);
    const cell = W.wandererCell(home.latitude, home.longitude);
    /* RETRIED, THE WAY THE APP RETRIES. Warming the lattice once is not enough:
       water.js caps its tile cache at MAX_TILES 64 and evicts to make room, and
       one wanderersNear pass walks nine cells whose candidate laps reach ~0.039
       deg out, past the warmed block. The far cells queue new tiles, the
       eviction takes the warm ones with it, and the HOME cell's own lap comes
       back undefined -- which wandererAt reports as "no wanderer", identical to
       an all-water cell. Measured 2026-08-27: realWanderer returned w:null while
       a probe one second later said wandererAt(2464,-6156) was true.
       js/app.js has the same race and answers it the same way, by asking again
       on the next 5 s world pass. So does this. */
    const t0 = Date.now();
    let near = [], w = null;
    for (;;) {
      await water.ensureWater(pts, Math.max(1000, deadlineMs - (Date.now() - t0)));
      near = W.wanderersNear(dateKey(), home.latitude, home.longitude, undefined, water.isWater);
      w = near[0] || (anyone ? W.wandererAt(cell.cx, cell.cy, dateKey(), undefined, water.isWater) : null);
      if (w || Date.now() - t0 > deadlineMs) break;
      await new Promise(r => setTimeout(r, 500));
    }
    const date = dateKey();
    /* COUNT THE POINTS THAT CAN ACTUALLY ANSWER, and report THAT as `tiles`.
       It used to report pts.length, which is the number of points ASKED about
       and is the constant 81 whatever happens, so every caller's sentence "N
       water tiles warmed" printed 81 on a machine where not one tile had
       loaded. A number that cannot move is not a measurement. */
    const decided = pts.filter(([la, ln]) => water.isWater(la, ln) !== undefined).length;
    if (!w) {
      /* WHICH EMPTY, and there are THREE, not two. "He is out there but past
         WANDER_SHOW_M" and "this cell is effectively all water this lap" are
         different facts and the caller has to be able to print the right one.
         The third one is the dangerous one because it is not a fact about the
         world at all: when js/water.js cannot reach its tile host, isWater
         answers undefined everywhere, wanderersNear filters every candidate out,
         and the empty set is IDENTICAL to "his loop carried him out of range".
         Measured 2026-09-02 on a `cp -R` throwaway with TILEJSON_URL pointed at
         a dead path: exit 97, seventeen rows ungraded, and the reason printed
         was "no Wanderer is within WANDER_SHOW_M of HOME right now (81 water
         tiles warmed over 30043ms: nobody within WANDER_SHOW_M (1 in range
         without the land constraint))". Every load-bearing word of that is
         wrong: he WAS in range, nothing was warmed, and the 30043ms is the
         deadline expiring rather than a wait for a lap. A suite is allowed to
         decline to grade; it is not allowed to blame the wrong thing while it
         declines. So the oracle is checked FIRST and named as a missing
         CAPABILITY, ahead of any claim about where he is standing. */
      const bare = W.wandererAt(cell.cx, cell.cy, date, undefined);
      const bareDist = bare ? Math.round(W.wanderersNear(date, home.latitude, home.longitude).length) : null;
      const why = decided === 0
        ? `the land oracle never answered: 0 of ${pts.length} lattice points around HOME could be classified in ${Date.now() - t0}ms, `
          + 'so js/water.js has no tiles and every candidate reads as water. This is the MACHINE, not his loop'
        : (bare ? `nobody within WANDER_SHOW_M (${bareDist} in range without the land constraint, ${decided}/${pts.length} lattice points classified)`
          : 'no wanderer derives here at all');
      return { date, tiles: decided, oracle: decided > 0, w: null, near: [], cell, waitedMs: Date.now() - t0, why };
    }
    const R = 6371000, r = Math.PI / 180, dr = metres / R, brg = (w.heading + offsetDeg) * r;
    const f1 = w.lat * r, l1 = w.lng * r;
    const f2 = Math.asin(Math.sin(f1) * Math.cos(dr) + Math.cos(f1) * Math.sin(dr) * Math.cos(brg));
    const l2 = l1 + Math.atan2(Math.sin(brg) * Math.sin(dr) * Math.cos(f1), Math.cos(dr) - Math.sin(f1) * Math.sin(f2));
    const p = { lat: f2 / r, lng: l2 / r };
    return { date, tiles: decided, oracle: true, p, cell, waitedMs: Date.now() - t0,
      w: { id: w.id, lat: w.lat, lng: w.lng, heading: w.heading, inst: w.inst, dist: Math.round(w.dist ?? 0) },
      near: near.map(x => x.id), predicted: W.inWandererCone(w, p.lat, p.lng) };
  }, { home, offsetDeg, metres, anyone, deadlineMs });
}
