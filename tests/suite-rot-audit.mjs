/* AN AUDIT THAT CANNOT RUN IS WORSE THAN NO AUDIT, because it is counted.
 *
 * WHY THIS EXISTS. Triaging the garden pair (2026-08-12) turned up two audits
 * that were not testing anything, in two different ways, and neither announced
 * itself:
 *   - tests/t2-audit.mjs calls serveTree(ROOT) at line 70 but never destructures
 *     serveTree from its dynamic godmode import. ReferenceError on EVERY machine
 *     the moment the static half finishes, so its entire browser half has run
 *     nowhere, ever. It exits non-zero, which reads as "a finding", not as
 *     "this file is broken".
 *   - tests/garden-intro-audit.mjs counts beds with '.plot-card', a class this
 *     app has never emitted (beds are '.t3-bed'). Its check "no bed grid in the
 *     Kitchen at all" therefore passes on an empty set, forever, on any screen.
 *     tally/CLAUDE.md rule 1: a check that cannot fail is not a check. Rule 3:
 *     an empty sample set is a FAILURE, never a pass.
 * Both also show the aging shape: the v304 doors landing deleted '#gardenRow',
 * and four audits still drive it, crash on the null click, and silently drop
 * every assertion that came after.
 *
 * This is the same bug class tests/selector-sweep.mjs guards in js/, a name
 * that nothing answers to, pointed at the suite itself. 80 audit files, an
 * app that renames things weekly, and nobody re-reads a green suite.
 *
 * TWO CHECKS, both static, both report-only:
 *   IMPORT  a godmode helper CALLED but neither imported nor declared locally.
 *           The file dies at that call, so everything after it never runs.
 *           Handles both import forms this suite uses: the static
 *           `import { a, b } from './godmode.js'` and the dynamic
 *           `const { a, b } = await import(path.join(ROOT, 'tests/godmode.js'))`.
 *           Names are checked against godmode's REAL exports, read from the
 *           file, so this cannot drift from what godmode actually offers.
 *   STALE   a selector queried by a test whose class/id/data token the app
 *           never emits. The query can only ever return null: either the audit
 *           crashes on it, or it "passes" against an empty set.
 *
 * PRECISION IS THE POINT, and my first attempt at this had none. A regex pass
 * flagged six files; five were the word "state" or "sleep" sitting in ordinary
 * prose inside a check's own label string, and the one file that was genuinely
 * broken (t2-audit) was missed because its import is dynamic. So: strings and
 * comments are BLANKED by a real lexer before any identifier is read (the
 * inverse of selector-sweep, which keeps string bodies because emissions live
 * in them), and both import forms are parsed. A tool that cries wolf about a
 * test suite gets muted, and then it is one more thing that is not a check.
 *
 * WHAT IT DOES NOT CLAIM. Static only: an audit that boots, runs and asserts
 * nonsense is invisible here, as is one that dies inside page.evaluate. Green
 * means "these two rot classes are absent", not "the suite is healthy".
 *
 * NEGATIVE-ASSERTION QUERIES, and why they are now DECLARED rather than guessed.
 *   A test that queries a token to prove the DOM does NOT have it is doing the
 *   right thing when the token has no emission anywhere. garden-doors.mjs:82 is
 *   the original case:
 *
 *       gardenTile: !!document.querySelector('#gardenActBtn'),
 *       ...
 *       ok('TILE there is no separate Garden tile', row.gardenTile === false, ...);
 *
 *   That query MUST return null on a healthy build (the v304 doors landing
 *   removed the tile) and the assertion is a negative one. From a source-only
 *   view it looks identical to accidental rot pointing at a dead token, and a
 *   static scanner cannot tell them apart without the ASSERTION context of the
 *   query result. This file shipped 2026-08-12 filing that as a scope limit and
 *   telling the reader to cross-check by hand.
 *
 *   THAT WAS NOT GOOD ENOUGH, because the scope limit fails the build. On
 *   2026-08-16 two of the three STALE rows on main were exactly this shape:
 *   bestiary-audit.mjs:28 '.bst-name, .bst-label' and :42 '#bestiaryOpen'. Both
 *   name markup that v350 (974e98f, 2026-08-09) shipped and v352 (9d6d2c6, same
 *   day) deleted on Tom's instruction, and that commit says so in as many words:
 *   "tests/bestiary-audit.mjs now guards the ABSENCE of a catalogue". Reproduced
 *   in a throwaway tree by putting the v350 markup back: both rows go red, 16
 *   labels and seeWholeBtn true. They are live checks, and this file was the one
 *   that was wrong. A gate that cries wolf gets muted, and then it is one more
 *   thing that is not a check.
 *
 *   So a negative-assertion query DECLARES itself, on its own line or the line
 *   above, and must give a reason:
 *
 *       rot-audit: negative  v352 deleted the roster, this proves it stayed gone
 *
 *   Declared rows are demoted out of STALE into their own advisory section and
 *   PRINTED on every run with the reason, so they stay on the record instead of
 *   going quiet. A bare marker with no reason is ignored and still fails, so the
 *   marker cannot be used as a blanket mute. Write the reason without naming the
 *   token, or authored() counts the mention and the row reads ALIVE for the
 *   wrong reason.
 *
 * WHAT IT STILL DOES NOT CATCH:
 *     - a genuine dead selector reads as ALIVE here if the file happens to name
 *       the token in a comment or a label template string, because authored()
 *       counts any mention on raw source (a false negative that reads as
 *       absence-of-rot). Cross-check a surprising GREEN by looking whether the
 *       token is only in prose.
 *
 * Exit 1 = findings. Exit 2 = the gate below failed, meaning THIS file is
 * broken and no verdict under it is worth reading (same split as
 * figure-audit's SETUP and selector-sweep's).
 *
 * Usage: node tests/suite-rot-audit.mjs
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const results = [];
const ok = (name, pass, detail = '') => { results.push({ name, pass }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`); };
const die = (why, detail) => {
  console.log('FAIL  SETUP suite-rot-audit is broken, this is the HARNESS, not the suite');
  console.log(`      ${why}`);
  if (detail) console.log(`      ${detail}`);
  process.exit(2);
};

/* Blank comments AND the INSIDE of every string/template, preserving offsets so
   reported line numbers stay true. Identifiers are read from what survives.
   Template ${...} holes are re-opened as code, because a call can live there. */
export function codeOnly(src) {
  const out = src.split('');
  const blank = (a, b) => { for (let k = a; k < b; k++) if (out[k] !== '\n') out[k] = ' '; };
  let i = 0, mode = 'code';
  const tmpl = [];
  while (i < src.length) {
    const c = src[i], d = src[i + 1];
    if (mode === 'code') {
      if (c === '/' && d === '/') { const e = src.indexOf('\n', i); const end = e === -1 ? src.length : e; blank(i, end); i = end; continue; }
      if (c === '/' && d === '*') { const e = src.indexOf('*/', i + 2); const end = e === -1 ? src.length : e + 2; blank(i, end); i = end; continue; }
      if (c === "'" || c === '"') { mode = c; i++; continue; }
      if (c === '`') { mode = '`'; tmpl.push(0); i++; continue; }
      if (c === '{' && tmpl.length) tmpl[tmpl.length - 1]++;
      else if (c === '}' && tmpl.length) {
        if (tmpl[tmpl.length - 1] === 0) { mode = '`'; i++; continue; }   // close a ${ } hole
        tmpl[tmpl.length - 1]--;
      }
      i++; continue;
    }
    if (c === '\\') { blank(i, i + 2); i += 2; continue; }
    if (c === mode) { mode = 'code'; if (c === '`') tmpl.pop(); i++; continue; }
    if (mode === '`' && c === '$' && d === '{') { mode = 'code'; tmpl[tmpl.length - 1] = 0; i += 2; continue; }
    blank(i, i + 1); i++;
  }
  return out.join('');
}

const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const lineOf = (src, idx) => src.slice(0, idx).split('\n').length;

/* ------------------------------------------------------------------ IMPORT -- */
export function importRot(code, exports) {
  // both forms, anywhere in the file
  const bound = new Set();
  /* No module path in either pattern, deliberately: `code` has been through
     codeOnly(), which blanks string bodies, so './godmode.js' is whitespace by
     the time we get here, matching on it silently bound NOTHING and flagged
     every helper (the gate caught exactly that). It is also more correct: a
     name imported from anywhere is bound, whoever exports it. */
  for (const re of [/import\s*{([^}]*)}\s*from\b/g,
    /(?:const|let|var)\s*{([^}]*)}\s*=\s*await\s+import\s*\(/g]) {
    for (const m of code.matchAll(re)) {
      for (const part of m[1].split(',')) {
        const n = part.trim().split(/\s+as\s+/).pop().trim();
        if (n) bound.add(n);
      }
    }
  }
  const out = [];
  for (const name of exports) {
    if (bound.has(name)) continue;
    // declared locally? const/let/var/function, or a destructure of any kind
    if (new RegExp(`(?:const|let|var|function|async\\s+function)\\s+${esc(name)}\\b`).test(code)) continue;
    if (new RegExp(`{[^}]*\\b${esc(name)}\\b[^}]*}\\s*=`).test(code)) continue;
    const m = new RegExp(`(?<![\\w.$])${esc(name)}\\s*\\(`).exec(code);
    if (m) out.push({ name, index: m.index });
  }
  return out;
}

/* ------------------------------------------------------------------- STALE -- */
const QUERY_RE = [
  /(?<![\w$.])\$\$?\(\s*(['"`])((?:(?!\1)[^\\]|\\.)*?)\1/g,
  /\.(?:querySelector(?:All)?|closest|matches)\(\s*(['"`])((?:(?!\1)[^\\]|\\.)*?)\1/g,
];
const BYID_RE = /\.getElementById\(\s*(['"`])((?:(?!\1)[^\\]|\\.)*?)\1/g;
const tokensOf = sel => {
  const t = [];
  for (const m of sel.matchAll(/\.([A-Za-z_][\w-]*)/g)) t.push({ kind: 'class', tok: m[1] });
  for (const m of sel.matchAll(/#([A-Za-z_][\w-]*)/g)) t.push({ kind: 'id', tok: m[1] });
  for (const m of sel.matchAll(/\[([A-Za-z_][\w-]*)/g)) t.push({ kind: 'attr', tok: m[1] });
  return t;
};
const has = (hay, tok) => new RegExp(`(?<![\\w-])${esc(tok)}(?![\\w-])`).test(hay);
const camel = tok => tok.replace(/^data-/, '').replace(/-([a-z])/g, (_, c) => c.toUpperCase());

/* THE EMISSION-ONLY CORPUS: the insides of class= and id= attributes, plus the
   classList and className/id assignment sites. Used ONLY by the indexed-template
   rule below, which needs a much narrower haystack than the whole app source,
   because its prefixes can be a single letter and a single letter matches
   everything in 30k lines. Cached on the corpus string, since the runner passes
   the same one for all 135 files. */
const EMIT_RE = [
  /\b(?:class|id)\s*=\s*(["'])([\s\S]*?)\1/g,
  /\bclassList\s*\.\s*(?:add|remove|toggle|replace)\(([^)]*)\)/g,
  /\.(?:className|id)\s*=\s*([^;\n]*)/g,
  /\bsetAttribute\(\s*(["'])(?:class|id)\1\s*,([^)]*)\)/g,
];
let emitCacheKey = null, emitCacheVal = '';
export function emissionCorpus(appCorpus) {
  if (appCorpus === emitCacheKey) return emitCacheVal;
  const parts = [];
  for (const re of EMIT_RE) for (const m of appCorpus.matchAll(re)) parts.push(m[m.length - 1]);
  emitCacheKey = appCorpus; emitCacheVal = parts.join('\n');
  return emitCacheVal;
}

/* `src` is the RAW test source: selector literals live in strings, so this one
   reads strings, unlike the IMPORT half. `appCorpus` is app source + vendor.
 *
 * A token is ALIVE if the app emits it, if the TEST ITSELF authors it (probes
 * are routinely injected, `st.id = 'freeze-idle'`, `setAttribute('data-probe'…)`
 *, so "outside a query position in this file" is the same liveness test
 * selector-sweep uses on js/), or if a template could compose it.
 *
 * Comma arms are graded separately and this is the difference between a finding
 * and noise. `'.pack-reveal .sheet-close, .pack-done'` is a deliberate fallback:
 * if any arm is alive the query still works, so a dead arm is rename residue
 * worth SAYING and not worth failing over. Only a selector whose every arm is
 * dead can return nothing but null, that one is a finding. */
export function staleRot(src, appCorpus) {
  const sels = [];
  for (const re of QUERY_RE) for (const m of src.matchAll(re)) if (!m[2].includes('${')) sels.push({ sel: m[2], raw: m[2], index: m.index });
  /* `raw` is the literal as WRITTEN, `sel` the normalised form. They differ for
     getElementById, whose source text carries no '#': removing the normalised
     '#gardenRow' deleted nothing, the bare word survived in the file, and the
     token read as one the test authors itself. The gate caught it. */
  for (const m of src.matchAll(BYID_RE)) if (!m[2].includes('${')) sels.push({ sel: `#${m[2]}`, raw: m[2], index: m.index });

  /* Does the test AUTHOR this name rather than only look it up? Deleting the
     literal cannot answer that, the authoring site `st.id = 'freeze-idle'` is
     the same bare string as the query, so removing one removed both and a
     genuine probe read as rot (the gate caught it). Count instead: appearing
     MORE often than it appears inside query strings means something else in the
     file writes it. Same liveness test selector-sweep applies to js/. */
  const countIn = (hay, tok) => (hay.match(new RegExp(`(?<![\\w-])${esc(tok)}(?![\\w-])`, 'g')) || []).length;
  const selText = sels.map(s => s.raw).join('\n');
  const authored = tok => countIn(src, tok) > countIn(selText, tok);

  const aliveTok = tok => {
    if (has(appCorpus, tok) || authored(tok)) return true;
    if (has(appCorpus, `dataset.${camel(tok)}`) || authored(`dataset.${camel(tok)}`)) return true;
    for (let i = tok.indexOf('-'); i !== -1; i = tok.indexOf('-', i + 1)) {
      if (new RegExp(`(?<![\\w-])${esc(tok.slice(0, i + 1))}\\$\\{`).test(appCorpus)) return true;
      if (new RegExp(`\\}${esc(tok.slice(i))}(?![\\w-])`).test(appCorpus)) return true;
    }
    /* THE INDEXED FORM, which the hyphen loop above cannot see. The rank classes
       are written `class="race-lane r${p.place}"` (js/app.js:1123), so '.r5' has
       no hyphen to split on and read as rot while the browser answered it every
       time: race-results-audit.mjs:188 queries '.race-lane.r5 .rr-prize' and gets
       the real 5th purse back.
       NARROW ON PURPOSE, TWICE, because both looser versions were measured wrong.
       1. Splitting at every digit BOUNDARY silenced a real row: '#t1Search'
          (token t1Search, log-write-failure-audit.mjs:57) split to prefix 't',
          and some template somewhere writes `t${`, so a name nothing emits read
          as alive. Only name + TRAILING index qualifies now, which is the pattern
          that actually exists here, and t1Search does not match it.
       2. Searching the WHOLE corpus for the prefix was still too loose: prefix
          'r' matches js/wellness.js:88, which mints routine ids as
          `r${Date.now().toString(36)}`. Nothing there is a class, so a renamed
          rank class would have gone on reading alive off an unrelated id. The
          prefix is looked up in emissionCorpus() instead, which is class= and
          id= attributes and the classList/className sites and nothing else.
       Prefix only, never the suffix: `}5` matches all over minified vendor code
       and would turn real rot green, the expensive direction to be wrong in.
       app.css stays out of the corpus (styling a class is not evidence anything
       emits it), so this is the js-side answer to a js-side naming pattern. */
    const indexed = /^(.*[^0-9])[0-9]+$/.exec(tok);
    if (indexed && new RegExp(`(?<![\\w-])${esc(indexed[1])}\\$\\{`).test(emissionCorpus(appCorpus))) return true;
    return false;
  };

  /* A DECLARED negative assertion, on the query's own line or the one above it.
     The reason is mandatory and at least 4 characters: a bare marker is treated
     as no marker at all, so this cannot be pasted around as a mute switch. */
  const srcLines = src.split('\n');
  const NEG_RE = /rot-audit:\s*negative\b[ \t]*([^\n]*)/;
  const declaredNegative = line => {
    for (const L of [srcLines[line - 1], srcLines[line - 2]]) {
      const m = L === undefined ? null : NEG_RE.exec(L);
      if (!m) continue;
      const why = m[1].replace(/\*\/\s*$/, '').replace(/[,;]\s*$/, '').trim();
      if (why.length >= 4) return why;
    }
    return null;
  };

  const dead = [], residue = [], negative = [];
  for (const { sel, index } of sels) {
    const arms = sel.split(',').map(a => a.trim()).filter(Boolean);
    const graded = arms.map(a => {
      const toks = tokensOf(a);
      return { arm: a, toks, dead: toks.filter(t => !aliveTok(t.tok)) };
    });
    // an arm with no tokens at all is a bare tag ('button'), always live
    const anyLive = graded.some(g => g.dead.length === 0);
    const deadToks = [...new Map(graded.flatMap(g => g.dead).map(t => [t.tok, t])).values()];
    if (!deadToks.length) continue;
    const rec = { sel, line: lineOf(src, index), toks: deadToks };
    if (!anyLive) {
      const why = declaredNegative(rec.line);
      if (why) { negative.push({ ...rec, why }); continue; }
    }
    (anyLive ? residue : dead).push(rec);
  }
  const uniq = list => [...new Map(list.map(r => [r.sel + r.line, r])).values()];
  return { dead: uniq(dead), residue: uniq(residue), negative: uniq(negative) };
}

/* -------------------------------------------------------------- SETUP GATE -- */
{
  const gm = ['sleep', 'serveTree', 'state'];
  const fxImport = `
    import { boot, sleep } from './godmode.js';
    const { seed } = await import(path.join(ROOT, 'tests/godmode.js'));
    const srv = await serveTree(ROOT);            // NOT imported: a real finding
    await sleep(10); await seed(page, {});        // both bound: not findings
    ok('each door states its own live state (an empty door is a FAILURE)', x);
  `;                                              // ^ prose that must NOT match
  const r1 = importRot(codeOnly(fxImport), gm);
  const fxStale = `
    const beds = document.querySelectorAll('.plot-card').length;   // never emitted
    const row = document.getElementById('gardenRow');              // never emitted
    const live = document.querySelector('.t3-bed');                // emitted
    const dyn = document.querySelector('.pc-common');              // constructible
    st.id = 'freeze-idle';                                         // authored here
    document.getElementById('freeze-idle')?.remove();
    document.querySelector('.t3-bed, .old-arm');                   // live + dead arm
    document.querySelector('.race-lane.r5');                       // indexed, emitted
    document.querySelector('.k7');                                 // indexed, NOT emitted
    /* rot-audit: negative the roster button was deleted on purpose */
    const goneFx = document.getElementById('rosterOpenFx');        // declared negative
    /* rot-audit: negative */
    const bareFx = document.getElementById('unreasonedFx');        // no reason: still rot
  `;
  const app = 'html += `<div class="t3-bed"></div><span class="pc-${r}"></span>`;'
    + '\nhtml += `<div class="race-lane r${p.place}"></div>`;'
    /* the wellness.js shape: an indexed template that is NOT a class or an id,
       so '.k7' must stay a finding. This is the row that failed before the
       prefix lookup was moved onto emissionCorpus(). */
    + '\nlist.push({ id: `k${Date.now()}`, name: clean });';
  const S = staleRot(fxStale, app);
  const r2 = S.dead.flatMap(d => d.toks.map(t => t.tok)).sort();
  const res = S.residue.flatMap(d => d.toks.map(t => t.tok));
  const neg = S.negative.flatMap(d => d.toks.map(t => t.tok));
  const checks = [
    ['IMPORT flags the unbound call', r1.length === 1 && r1[0].name === 'serveTree'],
    ['IMPORT ignores prose inside a label string', !r1.some(x => x.name === 'state')],
    ['IMPORT accepts the dynamic destructured form', !r1.some(x => x.name === 'seed')],
    ['STALE flags a class the app never emits', r2.includes('plot-card')],
    ['STALE flags an id the app never emits', r2.includes('gardenRow')],
    ['STALE spares an emitted class', !r2.includes('t3-bed') && !res.includes('t3-bed')],
    ['STALE spares a template-constructible class', !r2.includes('pc-common')],
    ['STALE spares a probe the test authors itself', !r2.includes('freeze-idle')],
    ['STALE demotes a dead arm of a live fallback to residue', r2.includes('old-arm') === false && res.includes('old-arm')],
    ['STALE spares an indexed class an r${n} template builds', !r2.includes('r5') && !res.includes('r5')],
    ['STALE still flags an indexed name no class= site builds', r2.includes('k7')],
    ['STALE demotes a DECLARED negative assertion out of the failing set',
      !r2.includes('rosterOpenFx') && neg.includes('rosterOpenFx')],
    ['STALE ignores a negative marker that gives no reason', r2.includes('unreasonedFx')],
  ];
  const bad = checks.filter(([, p]) => !p);
  if (bad.length) die(`gate fixtures failed: ${bad.map(([n]) => n).join('; ')}`,
    `got import=[${r1.map(x => x.name)}] stale=[${r2}]`);
  ok('SETUP audit-rot proves itself on known verdicts', true, `${checks.length} fixtures`);
}

/* ------------------------------------------------------------------- run --- */
const gmSrc = readFileSync(path.join(ROOT, 'tests/godmode.js'), 'utf8');
const EXPORTS = [...gmSrc.matchAll(/^export\s+(?:async\s+)?(?:function\s+|const\s+)([A-Za-z_$][\w$]*)/gm)].map(m => m[1]);
if (EXPORTS.length < 5) die('could not read godmode.js exports', `found ${EXPORTS.length}`);

const appFiles = [];
for (const dir of ['js', 'data']) {
  const p = path.join(ROOT, dir);
  if (existsSync(p)) for (const f of readdirSync(p)) if (f.endsWith('.js')) appFiles.push(path.join(p, f));
}
/* vendor/ counts: maplibre creates .maplibregl-* elements at runtime, and the
   map audits query them. Leaving it out reported a live library as rot. */
const vend = path.join(ROOT, 'vendor');
if (existsSync(vend)) for (const d of readdirSync(vend, { withFileTypes: true })) {
  const sub = path.join(vend, d.name);
  if (d.isDirectory()) { for (const f of readdirSync(sub)) if (f.endsWith('.js')) appFiles.push(path.join(sub, f)); }
  else if (d.name.endsWith('.js')) appFiles.push(sub);
}
if (existsSync(path.join(ROOT, 'index.html'))) appFiles.push(path.join(ROOT, 'index.html'));
if (!appFiles.length) die('no app source found to compare against');
const appCorpus = appFiles.map(f => readFileSync(f, 'utf8')).join('\n');

const files = readdirSync(path.join(ROOT, 'tests'))
  .filter(f => /\.(mjs|js)$/.test(f) && f !== 'godmode.js' && f !== 'suite-rot-audit.mjs')
  .sort();
if (!files.length) die('no audit files found');

const mark = t => `${t.kind === 'class' ? '.' : t.kind === 'id' ? '#' : '['}${t.tok}`;
const dead = [], stale = [], residue = [], negative = [];
let scanned = 0;
for (const f of files) {
  const src = readFileSync(path.join(ROOT, 'tests', f), 'utf8');
  /* IMPORTING godmode, not merely mentioning it. unit.test.js only names it in
     prose and has no import at all, so every helper read as unbound, and its
     line 550 holds a regex built out of quote characters, which desyncs any
     lexer that does not model regex literals (this one does not). Both reasons
     point the same way: this check is about files that BIND these helpers. */
  if (!/(import\s*{[^}]*}\s*from\s*['"][^'"]*godmode\.js|await\s+import\s*\([^)]*godmode\.js)/.test(src)) continue;
  scanned++;
  for (const hit of importRot(codeOnly(src), EXPORTS)) {
    dead.push({ file: f, name: hit.name, line: lineOf(src, hit.index) });
  }
  const S = staleRot(src, appCorpus);
  for (const hit of S.dead) stale.push({ file: f, ...hit });
  for (const hit of S.residue) residue.push({ file: f, ...hit });
  for (const hit of S.negative) negative.push({ file: f, ...hit });
}

console.log(`\n--- DEAD ON ARRIVAL: calls a godmode helper it never bound (${dead.length}) ---`);
for (const d of dead) console.log(`ROT   tests/${d.file}:${d.line}  ${d.name}() is never imported or declared: ReferenceError, so everything after it never runs`);
console.log(`\n--- STALE: every arm dead, so the query can only return null (${stale.length}) ---`);
for (const s of stale) console.log(`ROT   tests/${s.file}:${s.line}  ${s.toks.map(mark).join(' ')}  in ${JSON.stringify(s.sel)}`);
console.log(`\n--- RESIDUE (advisory, does not fail): a dead arm of a fallback that still works (${residue.length}) ---`);
for (const s of residue) console.log(`      tests/${s.file}:${s.line}  ${s.toks.map(mark).join(' ')}  in ${JSON.stringify(s.sel)}`);
/* PRINTED, NOT SWALLOWED. These must return null on a healthy build, so they do
   not fail, but they are the rows most likely to be a real rename hiding behind
   a stale reason. Reading them is the review job this section exists to enable. */
console.log(`\n--- DECLARED NEGATIVE (advisory, does not fail): queried to prove ABSENCE (${negative.length}) ---`);
for (const s of negative) console.log(`      tests/${s.file}:${s.line}  ${s.toks.map(mark).join(' ')}  in ${JSON.stringify(s.sel)}  because: ${s.why}`);

ok('IMPORT every audit binds the helpers it calls', dead.length === 0, `${dead.length} file(s) die at first call`);
ok('STALE every query has at least one arm the app can answer', stale.length === 0, `${stale.length} dead selector(s) across ${new Set(stale.map(s => s.file)).size} file(s)`);

/* ----------------------------------------------------------- SCRATCH ------ */
/* SCRATCH PROBES KEEP LEAKING INTO COMMITS: twice in the week of 2026-08-24 a
   throwaway tests/_*.mjs / tests/*probe*.mjs file rode along in a commit. Those
   names are the scratch convention here, so being TRACKED IN GIT is the defect,
   not being on disk: an untracked probe on a dev machine is normal work.
   arena-static-probe.mjs is exempt by name: it is a deliberate, kept probe,
   SKIP-listed with a reason in release-gate.mjs. A new deliberate probe earns
   its exemption the same way: a SKIP entry there AND a name here. */
{
  let tracked = null;
  try {
    tracked = execSync('git ls-files -- tests', { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString().trim().split('\n').filter(Boolean);
  } catch { /* not a git checkout */ }
  if (tracked === null) {
    console.log('      SCRATCH not graded: this tree is not a git checkout, so "tracked" has no answer here');
  } else {
    const DELIBERATE = new Set(['tests/arena-static-probe.mjs']);
    const leaked = tracked.filter(f =>
      /^tests\/(?:_[^/]*\.mjs|[^/]*probe[^/]*\.mjs)$/.test(f) && !DELIBERATE.has(f));
    ok('SCRATCH no scratch probe (tests/_*.mjs, tests/*probe*.mjs) is tracked in git',
      leaked.length === 0,
      leaked.length ? leaked.join(' ')
        : `${tracked.length} tracked files under tests/, 1 deliberate probe exempt (arena-static-probe.mjs)`);
  }
}

const failed = results.filter(r => !r.pass).length;
console.log(`\n${results.length - failed}/${results.length} passed  (${files.length} audit files scanned)`);
process.exit(failed ? 1 : 0);
