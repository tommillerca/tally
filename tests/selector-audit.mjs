/* A SELECTOR THAT NOTHING EMITS IS A QUERY THAT CAN NEVER MATCH, and this app
 * fails that class of bug SILENTLY: `$()` returns null, the guard around it
 * quietly declines, and a feature dies with no error anywhere.
 *
 * WHY THIS EXISTS. The post-fight Pit re-render was pinned to '.pit-sect', a
 * class the t3 Build rebuild (v280) renamed to '.t3-sect'. The guard shipped
 * at v307 ALREADY dead, a selector that could never match again, and every
 * Pit fight from then on left a stale FIGHT button behind. Tom hit it live:
 * "I beat the remote den and it still says FIGHT and my cap did not move"
 * (2026-08-11, the comment above the fix at js/app.js:15200 tells the story).
 * Months of a dead feature, zero errors. This sweep makes that shape of bug a
 * finding instead of an archaeology project.
 *
 * WHAT IT DOES. Statically extract every literal selector js/ queries -
 * $()/$$() (app.js:87-88), querySelector/All, closest, matches, getElementById -
 * break each into class/id/data-attribute tokens, and flag any token that
 * appears NOWHERE else in the client source (js/, data/, index.html) outside
 * query positions. "Exactly once" from the task spec is generalised to
 * "emitted zero times": a token queried in two places and emitted in none is
 * twice as dead, not alive.
 *
 * TWO DECISIONS THE MOTIVATING BUG DICTATES, both proven by the gate below:
 *   1. app.css IS NOT EVIDENCE OF LIFE. At the buggy rev (2a9aa48) app.css
 *      still carried 7 '.pit-sect' rules, it does today, because dead CSS is
 *      exactly what a rename leaves behind. Counting CSS as liveness would have
 *      MASKED the one bug this sweep is named for. CSS is only reported as
 *      corroboration ("styled but never emitted" = rename residue).
 *   2. COMMENTS ARE NOT EVIDENCE OF LIFE. The string 'pit-sect' survives on
 *      main today inside the comment explaining its own bug. Comments are
 *      stripped (a real lexer over strings/templates, not a regex) before
 *      anything is counted.
 *
 * WHAT A FINDING MEANS, AND DOES NOT MEAN. DEAD = no static emission and no
 * plausible dynamic construction; the query cannot match unless a class is
 * added by a path this cannot see. POSSIBLY-DYNAMIC = absent statically but a
 * template fragment could build it (`pc-${rarity}` can build 'pc-common');
 * these need eyes, not deletion. Selectors passed as variables cannot be
 * scanned and are LISTED, never silently dropped, a count that hides its
 * blind spots reads as "covered everything" when it did not.
 *
 * THE DELIVERABLE IS THE REPORT. Per the task brief this file proposes no
 * fixes: whether a finding means "delete the query", "restore the class", or
 * "the render is gone too" is a product call. Exit 1 on DEAD findings so red
 * means look; exit 2 means THIS HARNESS is broken (the gate failed) and no
 * finding below it is trustworthy, same code split as figure-audit's SETUP.
 *
 * PROVE-RED (run, not intended): the gate fixtures below fail the sweep if a
 * dead token is missed, a live one is flagged, a comment or CSS mention
 * resurrects a corpse, or a dynamic prefix is read as dead. And the engine was
 * run against the real buggy tree, `git worktree` at 2a9aa48 (v307), where
 * it flags `.pit-sect` DEAD at the exact guard the fix comment blames:
 *     DEAD  .pit-sect  js/app.js  $('.pit-sect', pitWrap)  css-rules:7
 *
 * Usage: node tests/selector-audit.mjs          (ROOT=/path to sweep a
 *        different checkout, e.g. a worktree at an old rev)
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = process.env.ROOT
  ? path.resolve(process.env.ROOT)
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const results = [];
const ok = (name, pass, detail = '') => { results.push({ name, pass }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`); };

/* ------------------------------------------------------------------ the lexer
 * Strip comments, KEEP string and template contents (emissions live inside
 * them). A regex cannot do this, 'https://x' would lose its tail, so walk
 * the file: code / 'sq' / "dq" / `template` (with ${ } nesting back into
 * code) / line and block comments. Regex literals are not modelled; a token
 * inside /re/ would count as alive, which errs toward silence, not noise. */
export function stripComments(src) {
  let out = '', i = 0, mode = 'code';
  const tmpl = [];                       // brace depth per nested template
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
    // inside a quoted string or template: escapes pass through whole
    if (c === '\\') { out += c + (d ?? ''); i += 2; continue; }
    if (mode === 'sq' && c === "'") mode = 'code';
    else if (mode === 'dq' && c === '"') mode = 'code';
    else if (mode === 'tmpl' && c === '`') { mode = 'code'; tmpl.pop(); }
    else if (mode === 'tmpl' && c === '$' && d === '{') { mode = 'code'; tmpl[tmpl.length - 1] = 0; out += '${'; i += 2; continue; }
    out += c; i++; continue;
  }
  return out;
}

/* ------------------------------------------------------- extraction + verdicts */
const QUERY_RE = [
  /(?<![\w$.])\$\$?\(\s*(['"`])((?:(?!\1)[^\\]|\\.)*?)\1/g,          // $('x') / $$('x')
  /\.(?:querySelector(?:All)?|closest|matches)\(\s*(['"`])((?:(?!\1)[^\\]|\\.)*?)\1/g,
];
const BYID_RE = /\.getElementById\(\s*(['"`])((?:(?!\1)[^\\]|\\.)*?)\1/g;
const NONLIT_RE = /(?<![\w$.])\$\$?\(\s*[^'"`)\s]|\.(?:querySelector(?:All)?|getElementById)\(\s*[^'"`)\s]/g;

/* DEDUPED per site, and that is load-bearing. inQueries below adds
   countWord(sel, tok) once per entry returned here, so a selector that names
   the same token more than once (`#s svg, #s .x, #s [y]`) used to be counted
   squared: 3 entries x 3 occurrences = 9 against 3 real ones. That pushed
   inQueries past the corpus total and reported a LIVE id as dead. Returning
   each token once per site makes the two sides count the same thing. */
const tokensOf = sel => {
  const seen = new Set(), t = [];
  const add = (kind, tok) => { const k = `${kind}:${tok}`; if (!seen.has(k)) { seen.add(k); t.push({ kind, tok }); } };
  for (const m of sel.matchAll(/\.([A-Za-z_][\w-]*)/g)) add('class', m[1]);
  for (const m of sel.matchAll(/#([A-Za-z_][\w-]*)/g)) add('id', m[1]);
  for (const m of sel.matchAll(/\[([A-Za-z_][\w-]*)/g)) add('attr', m[1]);
  return t;
};
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const countWord = (hay, tok) => {
  const re = new RegExp(`(?<![\\w-])${esc(tok)}(?![\\w-])`, 'g');
  let n = 0; while (re.exec(hay)) n++; return n;
};
// data-fit-del is also written as dataset.fitDel; both spellings are one token
const camel = tok => tok.replace(/^data-/, '').replace(/-([a-z])/g, (_, c) => c.toUpperCase());

/* files: Map<relPath, source>. cssText: app.css, corroboration only. */
export function sweep(files, cssText = '') {
  const sites = [], unscanned = [];
  const stripped = new Map([...files].map(([p, src]) => [p, stripComments(src)]));
  for (const [p, code] of stripped) {
    if (!p.startsWith('js/')) continue;                  // queries live in js/, per the brief
    const line = idx => code.slice(0, idx).split('\n').length;
    for (const re of QUERY_RE) for (const m of code.matchAll(re)) {
      if (m[2].includes('${')) { unscanned.push({ file: p, line: line(m.index), why: 'interpolated', src: m[0] }); continue; }
      sites.push({ file: p, line: line(m.index), sel: m[2], tokens: tokensOf(m[2]) });
    }
    for (const m of code.matchAll(BYID_RE)) {
      if (m[2].includes('${')) { unscanned.push({ file: p, line: line(m.index), why: 'interpolated', src: m[0] }); continue; }
      sites.push({ file: p, line: line(m.index), sel: `#${m[2]}`, tokens: [{ kind: 'id', tok: m[2] }] });
    }
    for (const m of code.matchAll(NONLIT_RE)) unscanned.push({ file: p, line: line(m.index), why: 'non-literal', src: m[0].trim() });
  }
  const corpus = [...stripped.values()].join('\n');
  const byTok = new Map();
  for (const s of sites) for (const t of s.tokens) {
    const e = byTok.get(t.tok) || { ...t, sites: [], inQueries: 0 };
    e.sites.push(s); e.inQueries += countWord(s.sel, t.tok); byTok.set(t.tok, e);
  }
  const dead = [], dynamic = [];
  for (const e of byTok.values()) {
    let total = countWord(corpus, e.tok);
    if (e.kind === 'attr') total += countWord(corpus, `dataset.${camel(e.tok)}`) ? 1 : 0;
    if (total - e.inQueries > 0) continue;               // referenced outside queries: alive
    // could a template build it? 'pc-common' matches an emitted `pc-${`; and
    // `${x}-sect` leaves '}-sect' behind after ${…} closes
    let dyn = false;
    for (let i = e.tok.indexOf('-'); i !== -1 && !dyn; i = e.tok.indexOf('-', i + 1)) {
      if (new RegExp(`(?<![\\w-])${esc(e.tok.slice(0, i + 1))}\\$\\{`).test(corpus)) dyn = true;
      if (new RegExp(`\\}${esc(e.tok.slice(i))}(?![\\w-])`).test(corpus)) dyn = true;
    }
    const f = { ...e, cssRules: cssText ? countWord(cssText, e.tok) : 0 };
    (dyn ? dynamic : dead).push(f);
  }
  const bySites = (a, b) => b.sites.length - a.sites.length || a.tok.localeCompare(b.tok);
  return { sites, unscanned, dead: dead.sort(bySites), dynamic: dynamic.sort(bySites) };
}

/* ------------------------------------------------------------------ SETUP GATE
 * The sweep proves itself on fixtures whose verdicts are known by construction
 * before it may judge the app. Every fixture is one of the ways the motivating
 * bug could have been missed. Failing here is the HARNESS broken: exit 2, a
 * code no app finding produces, and nothing below it runs. */
{
  const fx = new Map([
    ['js/a.js', `
      const dead = $('.gone-sect');                    // no emission anywhere
      const live = $$('.alive-chip');
      const byId = document.getElementById('noSuchId');
      const dyn  = $('.pc-common');
      const attr = wrap.querySelector('[data-fit-del]');
      const tag  = e.closest('button');                // tag-only: no tokens
      const vari = $(sel);                             // non-literal: listed
      /* .ghosted lives only in this comment and must stay dead */
      const ghost = $('.ghosted');
      html += \`<div class="alive-chip pc-\${r}" data-fit-del="1"></div>\`;
    `],
  ]);
  const r = sweep(fx, '.ghosted{color:red}.gone-sect{display:none}');
  const deadToks = r.dead.map(d => d.tok).sort();
  const checks = [
    ['flags the dead class', deadToks.includes('gone-sect')],
    ['flags the dead id', deadToks.includes('noSuchId')],
    ['a comment does not resurrect a corpse', deadToks.includes('ghosted')],
    ['CSS does not resurrect a corpse, it corroborates', r.dead.find(d => d.tok === 'gone-sect')?.cssRules === 1],
    ['the emitted class is not flagged', !deadToks.includes('alive-chip')],
    ['the emitted data-attr is not flagged', !deadToks.includes('data-fit-del')],
    ['a dynamic prefix downgrades, never passes silently', r.dynamic.some(d => d.tok === 'pc-common') && !deadToks.includes('pc-common')],
    ['the non-literal call is listed, not dropped', r.unscanned.some(u => u.why === 'non-literal')],
  ];
  const bad = checks.filter(([, p]) => !p);
  if (bad.length) {
    console.log('FAIL  SETUP the sweep is broken, this is the HARNESS, not the app');
    bad.forEach(([n]) => console.log(`      gate fixture: ${n}`));
    console.log(`      got dead=[${deadToks}] dynamic=[${r.dynamic.map(d => d.tok)}]`);
    process.exit(2);
  }
  ok('SETUP the sweep proves itself on known verdicts', true, `${checks.length} fixtures`);
}

/* --------------------------------------------------------------- run on ROOT */
const files = new Map();
for (const dir of ['js', 'data']) {
  if (!existsSync(path.join(ROOT, dir))) continue;
  for (const f of readdirSync(path.join(ROOT, dir))) if (f.endsWith('.js')) files.set(`${dir}/${f}`, readFileSync(path.join(ROOT, dir, f), 'utf8'));
}
if (existsSync(path.join(ROOT, 'index.html'))) files.set('index.html', readFileSync(path.join(ROOT, 'index.html'), 'utf8'));
const css = existsSync(path.join(ROOT, 'app.css')) ? readFileSync(path.join(ROOT, 'app.css'), 'utf8') : '';
const R = sweep(files, css);

ok('COVERAGE query sites were found at all (an empty sample set is a FAILURE)', R.sites.length > 50, `${R.sites.length} literal sites, ${R.unscanned.length} unscannable`);

console.log(`\n--- DEAD: queried, emitted nowhere, no dynamic path (${R.dead.length}) ---`);
for (const d of R.dead) {
  const where = d.sites.map(s => `${s.file}:${s.line} ${JSON.stringify(s.sel)}`).join('; ');
  console.log(`DEAD  ${d.kind === 'class' ? '.' : d.kind === 'id' ? '#' : '['}${d.tok}  ${where}${d.cssRules ? `  css-rules:${d.cssRules} (rename residue?)` : ''}`);
}
console.log(`\n--- POSSIBLY-DYNAMIC: absent statically, a template could build it (${R.dynamic.length}) ---`);
for (const d of R.dynamic) console.log(`DYN?  ${d.tok}  ${d.sites.map(s => `${s.file}:${s.line}`).join('; ')}`);
console.log(`\n--- UNSCANNABLE: selector is not a literal, eyes needed (${R.unscanned.length}) ---`);
for (const u of R.unscanned) console.log(`      ${u.file}:${u.line}  (${u.why})  ${u.src}`);

ok('SWEEP no query targets a token nothing emits', R.dead.length === 0, `${R.dead.length} dead across ${R.dead.reduce((n, d) => n + d.sites.length, 0)} sites`);

const failed = results.filter(r => !r.pass).length;
console.log(`\n${results.length - failed}/${results.length} passed  (${R.sites.length} sites swept)`);
if (!results.length) { console.log('FAIL: no checks ran'); process.exit(1); }
process.exit(failed ? 1 : 0);
