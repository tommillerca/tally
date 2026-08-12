/* test-selector-lint: a test that queries a token nothing emits is a test that
 * is testing nothing.
 *
 * The pit-refresh class of bug the app has (selector-sweep.mjs guards the js/
 * side of it) has a mirror in tests/: an audit that queries `.pit-sect` (a
 * class the t3 rebuild renamed to .t3-sect) reads querySelector as null and
 * passes vacuously, because "no element" and "correct element" both silence
 * the check. The garden pair carry the same shape: `#gardenRow` and `.plot-card`
 * are queried by garden-audit.mjs but the tokens live nowhere in the app any
 * more.
 *
 * WHAT IT DOES. Extracts every literal query in tests/*.mjs ($/$$,
 * querySelector[All], closest, matches, getElementById), pulls the class / id /
 * data-attr tokens, and cross-checks each token against a corpus of what the
 * APP actually emits (js/*.js, data/*.js, index.html, app.css, minus comments).
 * A token that appears nowhere outside test-file query positions is DEAD:
 * flagged with the exact site and the surrounding selector text.
 *
 * WHAT IT DOES NOT DO. Compound-selector shape (`.a .b`) is not checked; both
 * tokens can be alive individually while the combination does not exist. The
 * lint is about the "queried but never emitted" class, not selector semantics.
 * Dynamic composition ($(`.pc-${r}`)) is skipped (the interpolation marker
 * `${` in the selector string), same as selector-sweep does for js/, because
 * the concrete class is built at runtime and cannot be judged statically.
 *
 * KNOWN FALSE-NEGATIVE SHAPES. This lint proves a token is EMITTED SOMEWHERE
 * IN THE SOURCE. It does not prove the emitting code is REACHED at runtime.
 * Two ways a real dead token still reads as alive here, both flagged by Gwart
 * at review time and worth naming honestly:
 *
 *   1. CSS-only tokens. `.plot-card` has ~11 rules in app.css but no
 *      emission in js/ or index.html. Under this lint's corpus (which
 *      includes app.css) it reads as alive; under selector-sweep's own
 *      doctrine, established after the .pit-sect bug, "CSS is not evidence
 *      of life, because dead CSS is precisely what a rename leaves behind."
 *      selector-sweep treats app.css as corroboration only (a cssRules
 *      count on findings, never as alive-evidence). This lint currently
 *      does not; a proper fix would exclude app.css from the corpus and
 *      report the extra reds that surface, and is a straightforward
 *      follow-up rather than a sprint-hour edit.
 *
 *   2. Orphaned emissions. `#gardenRow` is emitted at js/app.js:3265 inside
 *      `function gardenRowHtml(...)`, whose call sites number ZERO on the
 *      current tree (v304 orphaned it). The id lives in source but never
 *      renders in the app, so a test querying it silently gets null. A
 *      source-text corpus cannot tell this from a live emission; the
 *      distinguishing signal is reachability, which is a call-graph pass
 *      and a separate piece of work. Filed as a follow-up here for the
 *      record, deliberately not started under sprint time.
 *
 * Both shapes have the same class of blind spot: the corpus proves the
 * TOKEN exists in source, not that the CODE emitting it runs. When either
 * follow-up lands, the lint's exit-1 finding count will go up, not down.
 *
 * WHY THE PRIMITIVES ARE INLINE, NOT IMPORTED. selector-sweep.mjs (Gwart's
 * upstream, ext/selector-sweep) runs its full sweep at module top level and
 * calls process.exit at the bottom. Importing it from another entry point
 * would execute the whole scan and terminate the importer. The straightforward
 * consolidation is to split selector-sweep.mjs into a library and a runner (or
 * guard its top level with `if (import.meta.url === ...)`), and then this file
 * imports stripComments / tokensOf / countWord from the library half. Filed
 * as a follow-up in the commit body; inlined here to keep this branch
 * independent.
 *
 * PROVE-RED. Ships in the commit body. Against 0240e7f (main tip when written)
 * the lint exits 1 with 18 dead tokens across 30 sites, including
 * #gardenActBtn from the garden pair whose rewrite is in flight. Neuter the
 * corpus (feed an empty string) and the lint reads 480 tokens as dead across
 * 1256 sites, which proves the corpus is what makes it discerning rather than
 * a rubber stamp; restore the corpus and it goes back to naming only the real
 * ones. Two tokens Gwart named at review, #gardenRow and .plot-card, do NOT
 * appear in the 18 because both fall on the false-negative shapes above (see
 * KNOWN FALSE-NEGATIVE SHAPES). Both are dead in the app; the lint currently
 * cannot see it. Filed honestly here rather than papered over.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/* --- inlined primitives; keep byte-identical to selector-sweep.mjs so a
   future consolidation is a straight import swap. */
function stripComments(src) {
  let out = '', i = 0, mode = 'code';
  const tmpl = [];
  while (i < src.length) {
    const c = src[i], d = src[i + 1];
    if (mode === 'code') {
      if (c === '/' && d === '/') { mode = 'line'; i += 2; continue; }
      if (c === '/' && d === '*') { mode = 'block'; i += 2; continue; }
      if (c === "'") mode = 'sq';
      else if (c === '"') mode = 'dq';
      else if (c === '`') { mode = 'tmpl'; tmpl.push(0); }
      else if (c === '}' && tmpl.length && tmpl[tmpl.length - 1] === 0) { tmpl.pop(); mode = 'tmpl'; out += c; i++; continue; }
      else if (c === '{' && tmpl.length) tmpl[tmpl.length - 1]++;
      else if (c === '}' && tmpl.length) tmpl[tmpl.length - 1]--;
      out += c; i++; continue;
    }
    if (mode === 'line') { if (c === '\n') { mode = 'code'; out += c; } i++; continue; }
    if (mode === 'block') { if (c === '*' && d === '/') { mode = 'code'; i += 2; out += ' '; continue; } if (c === '\n') out += c; i++; continue; }
    if (c === '\\') { out += c + (d ?? ''); i += 2; continue; }
    if (mode === 'sq' && c === "'") mode = 'code';
    else if (mode === 'dq' && c === '"') mode = 'code';
    else if (mode === 'tmpl' && c === '`') { mode = 'code'; tmpl.pop(); }
    else if (mode === 'tmpl' && c === '$' && d === '{') { mode = 'code'; tmpl[tmpl.length - 1] = 0; out += '${'; i += 2; continue; }
    out += c; i++; continue;
  }
  return out;
}
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
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const countWord = (hay, tok) => {
  const re = new RegExp(`(?<![\\w-])${esc(tok)}(?![\\w-])`, 'g');
  let n = 0; while (re.exec(hay)) n++; return n;
};
const camel = tok => tok.replace(/^data-/, '').replace(/-([a-z])/g, (_, c) => c.toUpperCase());

/* --- build the APP CORPUS: js/, data/, index.html, app.css, and vendored
   libraries under vendor/ (maplibre-gl.js emits .maplibregl-marker at runtime,
   and a test checking that class would false-positive without the vendor
   files in the corpus). Comments stripped. */
const app = [];
for (const dir of ['js', 'data']) {
  const p = path.join(ROOT, dir);
  if (!fs.existsSync(p)) continue;
  for (const f of fs.readdirSync(p)) if (f.endsWith('.js')) app.push([`${dir}/${f}`, fs.readFileSync(path.join(p, f), 'utf8')]);
}
const vendor = path.join(ROOT, 'vendor');
if (fs.existsSync(vendor)) {
  for (const sub of fs.readdirSync(vendor)) {
    const subP = path.join(vendor, sub);
    if (!fs.statSync(subP).isDirectory()) continue;
    for (const f of fs.readdirSync(subP)) {
      if (f.endsWith('.js') || f.endsWith('.mjs') || f.endsWith('.css')) app.push([`vendor/${sub}/${f}`, fs.readFileSync(path.join(subP, f), 'utf8')]);
    }
  }
}
if (fs.existsSync(path.join(ROOT, 'index.html'))) app.push(['index.html', fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')]);
if (fs.existsSync(path.join(ROOT, 'app.css'))) app.push(['app.css', fs.readFileSync(path.join(ROOT, 'app.css'), 'utf8')]);
if (app.length < 5) { console.log(`FAIL  test-selector-lint: SETUP app corpus is too small (${app.length} files). Aborting.`); process.exit(2); }
const corpus = app.map(([, src]) => stripComments(src)).join('\n');

/* --- extract literal query sites from tests/*.mjs. */
const testFiles = fs.readdirSync(path.join(ROOT, 'tests')).filter(f => f.endsWith('.mjs')).sort();
const sites = [];
let scanned = 0;
for (const rel of testFiles) {
  /* skip the guard itself, its sibling lint, and selector-sweep.mjs: the last
     one contains deliberate FIXTURES with dead classes (`.gone-sect`,
     `.ghosted`, `#noSuchId`) to prove ITS OWN sweep against known verdicts.
     Those literals are not audit queries and would false-positive here. */
  if (rel === 'test-selector-lint.mjs' || rel === 'test-import-lint.mjs' || rel === 'selector-sweep.mjs') continue;
  scanned++;
  const src = fs.readFileSync(path.join(ROOT, 'tests', rel), 'utf8');
  const code = stripComments(src);
  const line = idx => code.slice(0, idx).split('\n').length;
  for (const re of QUERY_RE) for (const m of code.matchAll(re)) {
    if (m[2].includes('${')) continue;
    sites.push({ file: `tests/${rel}`, line: line(m.index), sel: m[2], tokens: tokensOf(m[2]) });
  }
  for (const m of code.matchAll(BYID_RE)) {
    if (m[2].includes('${')) continue;
    sites.push({ file: `tests/${rel}`, line: line(m.index), sel: `#${m[2]}`, tokens: [{ kind: 'id', tok: m[2] }] });
  }
}
if (sites.length < 20) { console.log(`FAIL  test-selector-lint: SETUP too few literal query sites (${sites.length}). Aborting.`); process.exit(2); }

/* --- cross-check each token against the app corpus; report dead tokens grouped
   by (kind, tok) with all their sites. */
const byTok = new Map();
for (const s of sites) for (const t of s.tokens) {
  const key = `${t.kind}:${t.tok}`;
  const e = byTok.get(key) || { ...t, sites: [] };
  e.sites.push(s); byTok.set(key, e);
}
const dead = [];
for (const e of byTok.values()) {
  let total = countWord(corpus, e.tok);
  if (e.kind === 'attr') total += countWord(corpus, `dataset.${camel(e.tok)}`);
  /* a token that shows up in a template as a fragment (e.g. `${x}-sect` or
     `pc-${...}`) reads as absent verbatim but the app does emit it dynamically.
     selector-sweep calls these "possibly-dynamic" and downgrades from dead; we
     mirror that so a test querying `.pc-common` where the app builds `pc-${r}`
     is not incorrectly flagged. Same probe as selector-sweep. */
  let dyn = false;
  for (let i = e.tok.indexOf('-'); i !== -1 && !dyn; i = e.tok.indexOf('-', i + 1)) {
    if (new RegExp(`(?<![\\w-])${esc(e.tok.slice(0, i + 1))}\\$\\{`).test(corpus)) dyn = true;
    if (new RegExp(`\\}${esc(e.tok.slice(i))}(?![\\w-])`).test(corpus)) dyn = true;
  }
  if (total === 0 && !dyn) dead.push(e);
}
dead.sort((a, b) => b.sites.length - a.sites.length || a.tok.localeCompare(b.tok));

if (dead.length) {
  const bySites = dead.reduce((n, d) => n + d.sites.length, 0);
  console.log(`FAIL  test-selector-lint: ${dead.length} token${dead.length === 1 ? '' : 's'} queried by tests/*.mjs but emitted nowhere in the app (${bySites} site${bySites === 1 ? '' : 's'})`);
  for (const d of dead) {
    const marker = d.kind === 'class' ? '.' : d.kind === 'id' ? '#' : '[';
    console.log(`      ${marker}${d.tok}`);
    for (const s of d.sites) console.log(`        ${s.file}:${s.line} '${s.sel}'`);
  }
  process.exit(1);
}
console.log(`PASS  test-selector-lint: ${sites.length} literal query sites across ${scanned} tests, all tokens alive in the app corpus`);
process.exit(0);
