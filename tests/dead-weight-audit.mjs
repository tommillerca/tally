/* DEAD WEIGHT IS BYTES ON A PLAYER'S MOBILE DATA, NOT UNTIDINESS.
 *
 * app.css is 503 KB and js/app.js is about 1 MB, and sw.js precaches BOTH IN
 * FULL on first open along with 105 other entries. A player on one bar of LTE
 * pays for every byte of that before the app is usable, and pays it again on
 * every VERSION bump, because the precache is keyed on the version. A rule
 * nothing can match and a function nothing can call are not tidiness problems
 * here: they are download.
 *
 * WHY THIS EXISTS, AND WHY IT IS THE OTHER DIRECTION. This repo already sweeps
 * one direction: tests/selector-audit.mjs finds QUERIES that nothing emits (the
 * '.pit-sect' class of dead guard) and tests/suite-rot-audit.mjs finds AUDITS
 * aimed at deleted UI. Nothing swept the reverse: DEFINITIONS that nothing
 * reaches. Grid rules were sitting in app.css with no emitter at all
 * ('.gear-row', '.plot-row', '.tz-grid', '.hero-actions.five',
 * '.hero-actions.six'), and '.tz-grid' had been display:none with a comment
 * naming its own replacement since the .tz-wall rebuild. That is what this
 * catches, and it catches it every time someone adds another one.
 *
 * THE FAILURE MODE OF THIS TOOL IS DELETING WORKING UI, so it is built to
 * UNDER-REPORT. Read that as the design constraint, not as modesty:
 *
 *   1. A finding is DEAD only when the token appears NOWHERE the app could
 *      emit it from. Not "no class= attribute found" but "no class= attribute,
 *      no classList call, no className write, no setAttribute, and no short
 *      class-shaped string literal anywhere in js/, data/, native/, server/,
 *      scripts/, tests/ or ANY html file in the repo".
 *   2. Anything a template COULD build downgrades. Classes here are built as
 *      `class="foo ${x ? 'bar' : ''}"` and as `pc-${rarity}`, so every ${...}
 *      inside a class position contributes PREFIX, INFIX and SUFFIX fragments,
 *      and any token a fragment could complete is reported, never deleted.
 *   3. Anything named indirectly downgrades. `const c = 'gear-row'; el.className
 *      = c` is invisible to a class-position scan, so a token that appears in
 *      any class-shaped string literal at all is MENTIONED, not DEAD.
 *   4. Comments are not life. Same rule selector-audit learned the hard way:
 *      'pit-sect' survives on main today inside the comment explaining its own
 *      death. A real lexer strips comments before anything is counted.
 *   5. Long prose strings are not life either, and this is the one judgement
 *      call in the file, so it prints its evidence. "spreading five thin" in a
 *      FAQ answer is not an emission of `.five`. A string counts as a possible
 *      class list only if every whitespace-separated word is class-shaped and
 *      there are at most CLASSY_MAX_WORDS of them. Every DEAD finding names the
 *      token that killed it and whether that token was prose-only, so a
 *      reviewer can overrule it without re-deriving the search.
 *
 * WHAT IT CANNOT RESOLVE, stated so a green run is not read as "swept clean":
 *   - A class assembled from computed fragments ('ge' + 'ar-row'). Nothing here
 *     would see it. String-literal concatenation IS handled ('pc-' + r yields a
 *     prefix fragment); a fragment that is itself a variable is not.
 *   - A class attribute that is ENTIRELY interpolated, `class="${cls(x)}"`.
 *     The fragments are empty, so it constrains nothing. The count of these is
 *     printed on every run as a declared blind spot rather than swept under.
 *   - CSS reached from outside this repo: a WebView injection, a console paste.
 *     native/ and server/ ARE scanned, so this is a statement about code that
 *     is not in the tree at all.
 *   - A THIRD-PARTY BUNDLE'S OWN CLASSES cannot be analysed, so they are not
 *     analysed: every word in vendor/ is taken as emittable. This is not
 *     theoretical. .maplibregl-canvas was in the DEAD list until vendor was
 *     accounted for, and app.css styles it for a reason.
 *   - JS: only TOP-LEVEL declarations are analysed. A function nested inside
 *     another function may be dead and is not reported.
 *   - JS: a namespace import (`import * as social`) makes every export of that
 *     module reachable by a property name this cannot follow, so those exports
 *     are counted as namespace-reachable and never called dead.
 *   - JS: an unimported EXPORT is reported, never failed. Exports here are the
 *     module's public surface and several exist for the test suite; deciding
 *     one is surplus is a product call, not a static one.
 *   - Assets: anything under a directory some template interpolates into
 *     (`assets/bh/${sp}/${n}.png`) is DYNAMIC. That is most of assets/bh, and
 *     it is why the asset half deletes very little. Correctly so.
 *
 * THREE VERDICTS, and only the first is a deletion:
 *   DEAD       nothing in the tree can reach it. Exit 1.
 *   DYNAMIC    a template fragment or an interpolated directory could reach it.
 *   MENTIONED  named somewhere that is not an emission position. Eyes needed.
 * DYNAMIC and MENTIONED print on every run and are NOT failures, because a
 * sweep that goes red on things it cannot decide gets muted, and a muted sweep
 * is one more thing that is not a check.
 *
 * PROVE-RED: the SETUP gate runs the whole engine against fixtures whose
 * verdicts are known by construction, including the two directions that matter
 * most and pull against each other: a reintroduced dead rule must go RED, and a
 * live-but-dynamically-built class must NOT. That second one is the failure
 * that would get this audit deleted, so it is a gate fixture and not a hope.
 * Gate failure is exit 2, a code no app finding produces, and nothing below it
 * runs.
 *
 * THE GATE HAS ALREADY EARNED ITS KEEP FIVE TIMES, and the list is here because
 * every one of these produced a clean, confident, WRONG report, which is what
 * this class of tool does when it breaks:
 *   1. A space used as the ${} sentinel, so `pc-${r}` masked to the ordinary
 *      static class "pc-" and every `.pc-*` rule read as DEAD.
 *   2. String bodies inside a ${} dropped from the markup view, so
 *      `${curtains ? '<div class="curt l">' : ''}` emitted nothing and .curt
 *      and its family read as DEAD.
 *   3. The static half of `class="hv-card${cond}"` read as a prefix fragment
 *      and nothing else, so .hv-card, .spp, .fp-hero, .look-bar, .q-collapse
 *      and a dozen more read as DEAD while the app was rendering them.
 *   4. A skip pattern that matched the SUBSTRING "icons" and swallowed
 *      js/icons-pack.js, the module that puts class="bhi" on every icon.
 *   5. Unmodelled regex literals: js/app.js:88 is
 *      `.replace(/[&<>"']/g, ...)` and that lone quote opened a string, so the
 *      remaining 16,500 lines were lexed in the wrong mode.
 * Numbers 1, 3 and 5 were caught by the SETUP gate or by the LEXER HEALTH
 * check. Numbers 2 and 4 were caught by hand-checking findings against grep,
 * and both are gate fixtures now.
 *
 * AND THE STATIC HALF DOES NOT GET THE LAST WORD. Everything it calls DEAD is
 * checked against a running app by tests/dead-weight-live-audit.mjs, which
 * boots the real thing, walks every route, every hub tab, every sheet it can
 * open two levels deep and a real Pit fight, and records every class that ever
 * touches the DOM. Run BOTH before acting on a finding here.
 *
 * WHAT THE FIRST RUN REMOVED, so the next reader knows what "green" is worth
 * here. Against v385 it found 345 rules in app.css that nothing in 222 source
 * files, 45 modules and every html file in the repo can match, and every one of
 * those 184 class and id names was then checked against a running app across
 * 124 stops (dead-weight-live-audit) and appeared in the live DOM exactly zero
 * times. They were the residue of features that were rebuilt and not swept:
 * the pre-Tier-1 food rows and portion sheet, the action tiles and stepper, the
 * Kitchen hero and the whole cauldron stage, the Bone Garden's .plot-* beds,
 * the breeding grid, the .statx-* stat readout, the .hm-* heatmap, .pit-sect
 * (the class selector-audit is named after), and .hero-actions.five/.six, which
 * survived because only .four is ever written. Plus six module-local functions
 * and one orphaned stylesheet under assets/.
 *   app.css   503,020 -> 461,607 bytes   (-41,413, 8.2%)
 *   js/app.js 1,008,882 -> 1,006,995     (-1,887)
 *   js/pit.js and js/hollow-beds.js      (-435)
 *   assets/hollow/hollow-anim.css        (-6,268, deleted; not precached)
 *   the precache: 8,037,656 -> 7,993,921 bytes, so every first open and every
 *   VERSION bump after this one carries 43,735 fewer bytes.
 *
 * Usage: node tests/dead-weight-audit.mjs        (ROOT=/path to sweep elsewhere)
 *        PROBE=gear-row,tz-grid node tests/dead-weight-audit.mjs
 *          prints, per file, exactly why one token landed where it landed. A
 *          verdict a reviewer cannot re-derive is one they must take on faith,
 *          and this tool is asking permission to delete things.
 */
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/* The engine below is exported so it can be imported and probed on its own,
   and so any other audit can reuse the lexer. The SETUP gate and the app run
   are the MAIN behaviour, fenced off here: importing this file must not fire
   a process.exit in somebody else's harness. */
const RUN_AS_MAIN = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

const ROOT = process.env.ROOT
  ? path.resolve(process.env.ROOT)
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const results = [];
const ok = (name, pass, detail = '') => { results.push({ name, pass }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`); };

/* A class list a human would actually write. Six is generous: the widest real
   one in this tree is four words. */
const CLASSY_MAX_WORDS = 6;
const NAME_RE = /^[A-Za-z_][\w-]*$/;
/* One character standing in for one whole ${...}. It must not be a space and
   it must not be class-shaped. My first attempt used a space and the SETUP
   gate caught it on the first run: `pc-${r}` masked to "pc- r", split on
   whitespace into the perfectly ordinary-looking static class "pc-", produced
   NO prefix fragment, and would have called every `.pc-*` rule in the app
   DEAD. A sentinel that can be mistaken for content is not a sentinel. */
const SENT = '\u0000';
const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/* ---------------------------------------------------------------- the lexer
 * Two products from one walk, because the two halves of this sweep need
 * opposite things. `masked` keeps string and template BODIES (emissions live
 * inside them), blanks comments, and collapses each ${...} to a single SENT so
 * a class attribute reads as one flat value with its dynamic holes visible.
 * `strings` is every string literal as the author wrote it, tagged with whether
 * it sat inside a ${...}, because that tag is what separates an emission from
 * a mention. A regex cannot do either job: 'https://x' loses its tail to //.
 *
 * The subtlety worth stating: characters inside a ${...} are DROPPED from
 * masked (they are code, not markup) but a template literal opened INSIDE that
 * expression starts contributing again. That matters more than it sounds.
 * `${rows.map(r => \`<div class="row">\`).join('')}` is the commonest way this
 * app emits markup at all, and a lexer that blanked whole interpolations would
 * lose every class inside every list render and then call them dead.
 *
 * REGEX LITERALS ARE MODELLED, and skipping them was the single worst bug this
 * file has had. js/app.js line 88 is
 *     const esc = s => String(s ?? '').replace(/[&<>"']/g, ...)
 * and an unmodelled `/.../` means that lone `"` opens a string. Everything in
 * the remaining 16,500 lines of app.js was then lexed in the wrong mode: no
 * comment was stripped, no template was seen, and `{ cls: 'sheet-teaser' }`
 * never registered as a string at all. The sweep still ran and still printed a
 * confident list, which is the point: a broken lexer does not announce itself,
 * it just produces findings that look like the real ones. Telling a regex from
 * a division is context, not syntax, so the rule is the standard one (a '/'
 * after an identifier, number, ')' or ']' is division, unless the word before
 * it is a keyword that cannot end an expression) plus a newline bail-out: a
 * regex literal cannot span a line, so if we reach one we guessed wrong and
 * return to code rather than swallow the rest of the file. */
const RE_OK_AFTER = new Set(['return', 'typeof', 'case', 'in', 'of', 'new', 'delete', 'void', 'instanceof', 'do', 'else', 'yield', 'await', 'throw']);
/* THREE products, not two. `full` is the whole source with only comments and
   regex bodies blanked: it is the view the JS half needs and the markup view
   cannot provide, because `masked` deliberately drops the code inside every
   ${...} and in this codebase that is where most calls live. My first version
   counted call sites in `masked` and reported petAsideHtml, lootCardHtml and 72
   other plainly live functions as uncalled, purely because every call to them
   is written `${petAsideHtml(pet, 60)}`. One corpus cannot answer both
   questions, so there are two. */
export function lex(src) {
  let i = 0, mode = 'code', masked = '', cur = '', full = '';
  let prevSig = '', word = '', reClass = false;
  const strings = [];
  const frames = [];                                   // one per open template literal
  const inExpr = () => frames.length > 0 && frames[frames.length - 1].expr;
  /* Code characters inside a ${...} are dropped: they are identifiers and
     operators, not markup, and letting `pc-${r}` mask to "pc-r" is how a
     prefix fragment turns into a fake static class. STRING BODIES inside a
     ${...} are NOT dropped, they are markup, and dropping them was a real bug
     here: `${curtains ? '<div class="curt l"></div>' : ''}` is how this app
     writes conditional markup, and blanking it called .curt dead. They come
     back FENCED in whitespace so they cannot fuse with the static text either
     side and invent a fragment that no template can actually produce. */
  const put = ch => { if (ch === '\n' || !inExpr()) masked += ch; };  // newlines always: line numbers survive
  const putStr = ch => { masked += ch; };
  const fence = () => { if (inExpr()) masked += ' '; };
  const flush = () => { if (cur) strings.push({ text: cur, expr: inExpr() }); cur = ''; };
  while (i < src.length) {
    const c = src[i], d = src[i + 1];
    /* `full` is built here, once, before any branch can change the mode:
       comments and regex bodies become spaces, everything else survives.
       Newlines are always preserved so declaration line numbers hold. The
       two-character consumes below (a line-comment open, a block-comment open
       or close, and a template interpolation open) drop their second character
       from `full`, which is safe because none of those characters can ever be a
       newline; the string-escape branch handles its own second character. */
    full += (mode === 'line' || mode === 'block' || mode === 'regex') ? (c === '\n' ? '\n' : ' ') : c;
    if (mode === 'code') {
      if (c === '/' && d === '/') { mode = 'line'; i += 2; continue; }
      if (c === '/' && d === '*') { mode = 'block'; i += 2; continue; }
      if (c === '/' && (!/[\w$)\]]/.test(prevSig) || RE_OK_AFTER.has(word))) { mode = 'regex'; reClass = false; prevSig = ')'; word = ''; i++; continue; }
      if (c === "'") { mode = 'sq'; fence(); putStr(c); prevSig = c; word = ''; i++; continue; }
      if (c === '"') { mode = 'dq'; fence(); putStr(c); prevSig = c; word = ''; i++; continue; }
      if (c === '`') { fence(); frames.push({ expr: false, braces: 0 }); mode = 'tmpl'; putStr(c); prevSig = c; word = ''; i++; continue; }
      if (c === '}' && inExpr() && frames[frames.length - 1].braces === 0) { frames[frames.length - 1].expr = false; mode = 'tmpl'; prevSig = ')'; word = ''; i++; continue; }
      if (inExpr()) { if (c === '{') frames[frames.length - 1].braces++; else if (c === '}') frames[frames.length - 1].braces--; }
      if (!/\s/.test(c)) prevSig = c;
      word = /[\w$]/.test(c) ? word + c : '';
      put(c); i++; continue;
    }
    if (mode === 'line') { if (c === '\n') { mode = 'code'; masked += c; } i++; continue; }
    if (mode === 'block') { if (c === '*' && d === '/') { mode = 'code'; i += 2; continue; } if (c === '\n') masked += c; i++; continue; }
    if (mode === 'regex') {
      if (c === '\\') { i += 2; continue; }
      if (c === '\n') { mode = 'code'; masked += c; i++; continue; }   // a regex cannot span a line: we guessed wrong
      if (c === '[') { reClass = true; i++; continue; }
      if (c === ']') { reClass = false; i++; continue; }
      if (c === '/' && !reClass) { mode = 'code'; i++; while (i < src.length && /[a-z]/.test(src[i])) i++; continue; }
      i++; continue;
    }
    if (c === '\\') { putStr(' '); cur += ' '; full += (d === '\n' ? '\n' : ' '); i += 2; continue; }   // an escape never carries a class name
    if (mode === 'sq' && c === "'") { flush(); mode = 'code'; putStr(c); fence(); prevSig = c; word = ''; i++; continue; }
    if (mode === 'dq' && c === '"') { flush(); mode = 'code'; putStr(c); fence(); prevSig = c; word = ''; i++; continue; }
    if (mode === 'tmpl' && c === '`') { flush(); putStr(c); frames.pop(); mode = 'code'; fence(); prevSig = c; word = ''; i++; continue; }
    /* The '{' gets a SPACE in `full`, not nothing. Dropping it silently left
       `${fn()}` reading as `$fn()`, and countWord's own word boundary treats
       '$' as an identifier character, so every function called only from
       inside an interpolation still counted as uncalled. The gate caught it. */
    if (mode === 'tmpl' && c === '$' && d === '{') { flush(); masked += SENT; full += ' '; frames[frames.length - 1].expr = true; frames[frames.length - 1].braces = 0; mode = 'code'; i += 2; continue; }
    putStr(c); cur += c; i++; continue;
  }
  flush();
  return { masked, full, strings, endedClean: mode === 'code' && frames.length === 0 };
}

/* LEXER HEALTH, and this is a check the sweep needs more than the app does.
 * A desynced lexer does not throw; it produces a complete, confident, wrong
 * report, which is exactly what happened here (the app.js:88 regex). So every
 * run re-proves the lexer against an invariant no correct lex can violate: a
 * `//` line comment AT COLUMN ZERO is code, never string content, and must not
 * survive into masked. The two qualifiers are both load-bearing and both were
 * learned by watching this check cry wolf:
 *   - COLUMN ZERO, because js/crate-fx.js holds a GLSL shader in a template
 *     literal and its indented `//` lines are string content that correctly
 *     DOES survive.
 *   - `//` ONLY, because js/graverise.js holds a CSS block in a template
 *     literal whose column-zero `/* ... *\/` comments are also string content.
 * At the app.js:88 desync this fires on line 90 and every one after it. */
export function lexerHealth(sources) {
  let checked = 0; const survived = [];
  for (const [f, L] of sources) {
    if (!/\.(js|mjs|cjs)$/.test(f)) continue;
    const s = readFileSync(path.join(ROOT, f), 'utf8').split('\n'), m = L.masked.split('\n');
    if (s.length !== m.length) { survived.push(`${f}: masked lost ${s.length - m.length} lines`); continue; }
    for (let i = 0; i < s.length; i++) {
      if (!s[i].startsWith('//')) continue;
      checked++;
      const body = s[i].replace(/^\/\/\s*/, '').slice(0, 24);
      if (body.length > 8 && m[i].includes(body)) survived.push(`${f}:${i + 1} ${JSON.stringify(s[i].slice(0, 60))}`);
    }
    if (!L.endedClean) survived.push(`${f}: lexer ended mid-string or inside an unclosed template`);
  }
  return { checked, survived };
}

/* An html file has no js comments to strip but it does have <!-- --> and it
   does have inline <script>. Blank the html comments, then lex the rest: the
   markup outside any script is one long template body as far as this is
   concerned, which is exactly how it should be read. */
export const lexHtml = src => lex(src.replace(/<!--[\s\S]*?-->/g, m => ' '.repeat(m.length)));

/* --------------------------------------------------------------- css parsing
 * Byte ranges matter, because this file reports what a deletion is WORTH and
 * "smaller" is not a number. A rule spans from just past the previous rule's
 * closing brace, so its own leading comment travels with it, to its own close.
 * @keyframes bodies are skipped: '0%' and 'from' are not selectors, and a
 * keyframe NAME that collides with a dead class must not fake a finding. */
export function parseCss(css) {
  const rules = [];
  let i = 0, depth = 0, preludeStart = 0;
  const atStack = [];
  const strip = s => s.replace(/\/\*[\s\S]*?\*\//g, ' ').trim();
  while (i < css.length) {
    const c = css[i];
    if (c === '/' && css[i + 1] === '*') { const e = css.indexOf('*/', i + 2); i = e < 0 ? css.length : e + 2; continue; }
    if (c === '{') {
      const prelude = strip(css.slice(preludeStart, i));
      if (prelude.startsWith('@')) { atStack.push({ prelude, depth }); depth++; i++; preludeStart = i; continue; }
      let d2 = 1, j = i + 1;
      while (j < css.length && d2 > 0) {
        if (css[j] === '/' && css[j + 1] === '*') { const e = css.indexOf('*/', j + 2); j = e < 0 ? css.length : e + 2; continue; }
        if (css[j] === '{') d2++; else if (css[j] === '}') d2--;
        j++;
      }
      if (!atStack.some(a => /^@(-[\w]+-)?keyframes/.test(a.prelude))) {
        rules.push({ prelude, start: preludeStart, end: j, at: atStack.map(a => a.prelude), text: css.slice(preludeStart, j) });
      }
      i = j; preludeStart = i; continue;
    }
    if (c === '}') { depth--; if (atStack.length && atStack[atStack.length - 1].depth === depth) atStack.pop(); i++; preludeStart = i; continue; }
    i++;
  }
  return rules;
}

/* Split a selector list on TOP-LEVEL commas only. `:is(.a, .b)` is ONE
   selector and splitting inside it would invent two that do not exist. */
export const splitSelectors = sel => {
  const out = []; let depth = 0, cur = '', q = '';
  for (const ch of sel) {
    if (q) { cur += ch; if (ch === q) q = ''; continue; }
    if (ch === '"' || ch === "'") { q = ch; cur += ch; continue; }
    if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth--;
    if (ch === ',' && depth === 0) { if (cur.trim()) out.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
};

/* Tokens OUTSIDE any functional pseudo-class or attribute selector, and that
   exclusion is load-bearing. `.a:not(.b)` matches every .a in the document
   whether or not .b exists anywhere, so a dead .b inside :not() says nothing
   about the rule. Reading tokens out of :not()/:is()/:where()/:has() would
   delete live UI, which is this tool's whole failure mode. */
export function selectorTokens(sel) {
  let depth = 0; const out = []; let i = 0;
  while (i < sel.length) {
    const c = sel[i];
    if (c === '(' || c === '[') { depth++; i++; continue; }
    if (c === ')' || c === ']') { depth--; i++; continue; }
    if (depth === 0 && (c === '.' || c === '#')) {
      const m = /^[A-Za-z_][\w-]*/.exec(sel.slice(i + 1));
      if (m) { out.push({ kind: c === '.' ? 'class' : 'id', tok: m[0] }); i += 1 + m[0].length; continue; }
    }
    i++;
  }
  return out;
}

/* ------------------------------------------------------- emission extraction
 * Everything below reads the MASKED source, so a comment cannot vote. */
const classyWords = s => {
  const w = s.trim().split(/\s+/).filter(Boolean);
  if (!w.length || w.length > CLASSY_MAX_WORDS) return [];
  return w.every(x => NAME_RE.test(x)) ? w : [];
};

/* A class= value, a classList arg list or a className write. Each yields
   STATIC words, plus, wherever a SENT sits, the PREFIX / INFIX / SUFFIX
   fragments around it: `pc-${r}` can build 'pc-common', `${x}-sect` can build
   'wall-sect', and `t3-${a}-row` can build 't3-bed-row'. */
const addValue = (val, emit, frags, blind) => {
  for (const piece of val.split(/\s+/)) {
    if (!piece) continue;
    if (!piece.includes(SENT)) { if (NAME_RE.test(piece)) emit.add(piece); continue; }
    const parts = piece.split(SENT);
    /* THE STATIC HALF OF A DYNAMIC PIECE IS STILL EMITTED, and missing this
       was the worst false positive this file produced. `class="hv-card${one
       .bumper ? ' bumper' : ''}"` renders the literal string "hv-card" every
       time the condition is false, so .hv-card is as alive as any static
       class. Reading that piece as ONLY a prefix fragment, and then refusing
       to match a fragment against a token equal to it, called .hv-card,
       .spp, .fp-hero, .look-bar, .q-collapse and a dozen more DEAD while the
       app was rendering them. Every non-empty part is an emission AND a
       fragment. */
    for (const p of parts) if (p && NAME_RE.test(p)) emit.add(p);
    if (parts[0]) frags.push({ kind: 'prefix', s: parts[0] });
    const last = parts[parts.length - 1];
    if (last) frags.push({ kind: 'suffix', s: last });
    for (const mid of parts.slice(1, -1)) if (mid) frags.push({ kind: 'infix', s: mid });
    /* A piece that is nothing BUT sentinel constrains nothing at all. Counting
       these is the honest way to publish the blind spot instead of letting a
       clean-looking report imply it does not exist. */
    if (parts.every(p => !p)) blind.count++;
  }
};

export function emissions(masked, strings, full = masked) {
  const cls = new Set(), ids = new Set(), frags = [], classy = new Set(), any = new Set();
  const blind = { count: 0 };
  const grab = (re, sink) => { for (const m of masked.matchAll(re)) addValue(m[1] ?? m[2] ?? m[3] ?? '', sink, frags, blind); };

  grab(/\bclass\s*=\s*(?:"([^"]*)"|'([^']*)'|([\w-]+))/g, cls);
  grab(/\bid\s*=\s*(?:"([^"]*)"|'([^']*)'|([\w-]+))/g, ids);
  // classList.add / remove / toggle / replace / contains: every literal arg,
  // and the raw arg text too so `add(\`a-${b}\`)` still yields its fragments
  for (const m of masked.matchAll(/\.classList\s*\.\s*(?:add|remove|toggle|replace|contains)\s*\(([^)]*)\)/g)) {
    for (const s of m[1].matchAll(/(['"`])([^'"`]*)\1/g)) addValue(s[2], cls, frags, blind);
    if (m[1].includes(SENT)) addValue(m[1].replace(/['"`]/g, ' '), cls, frags, blind);
  }
  for (const m of masked.matchAll(/\.className\s*\+?=\s*([^;\n]*)/g)) {
    for (const s of m[1].matchAll(/(['"`])([^'"`]*)\1/g)) addValue(s[2], cls, frags, blind);
  }
  for (const m of masked.matchAll(/\.setAttribute\s*\(\s*['"`](class|id)['"`]\s*,([^)]*)\)/g)) {
    for (const s of m[2].matchAll(/(['"`])([^'"`]*)\1/g)) addValue(s[2], m[1] === 'class' ? cls : ids, frags, blind);
  }
  for (const m of masked.matchAll(/\.id\s*=\s*['"`]([\w-]+)['"`]/g)) ids.add(m[1]);

  /* String concatenation, the pre-template spelling of the same idea:
     'pc-' + rarity, and x + '-sect'. Both are fragments, same as ${}. */
  for (const m of masked.matchAll(/(['"`])([A-Za-z_][\w-]*[-_])\1\s*\+/g)) frags.push({ kind: 'prefix', s: m[2] });
  for (const m of masked.matchAll(/\+\s*(['"`])([-_][\w-]+)\1/g)) frags.push({ kind: 'suffix', s: m[2] });

  /* A short class-shaped string INSIDE a ${...} is the inline-conditional
     class idiom (`${on ? 'lit' : ''}`) and counts as a real emission. The same
     string outside one might be assigned to a variable and then to className,
     which is not proof of emission but is more than enough to forbid deletion:
     that is the MENTIONED bucket. */
  for (const s of strings) for (const w of classyWords(s.text)) (s.expr ? cls : classy).add(w);
  /* STRING SURGERY ON MARKUP, which the attribute regex above cannot see
     because the attribute being edited has no closing quote inside the literal:
         const act = h => h.replace('class="glutton-banner', 'class="glutton-banner has-action');
     That is a real emission of .has-action, and this sweep called it dead until
     this net went in. The net is narrow on purpose: only an UNTERMINATED class
     attribute, and only the words after it. My first version took every word
     out of any string that mentioned class= at all, which meant one FAQ answer
     ("stronger than spreading five thin") inside a template that also carried
     `class="faq-qa"` resurrected `.five` and hid a genuinely dead rule. A net
     that catches everything catches nothing. */
  for (const s of strings) {
    for (const m of s.text.matchAll(/\bclass\s*=\s*(["'])/g)) {
      const rest = s.text.slice(m.index + m[0].length);
      if (rest.includes(m[1])) continue;            // terminated: the masked pass already read it
      addValue(rest.replace(/[^\w\s-]/g, ' '), cls, frags, blind);
    }
  }
  /* The widest net: every word-shaped run in the masked source, code and
     string alike. A token absent from THIS is absent from the tree. */
  for (const m of full.matchAll(/[A-Za-z_][\w-]*/g)) any.add(m[0]);
  return { cls, ids, frags, classy, any, blind: blind.count };
}

/* Could a fragment build this token? Deliberately loose: a false DYNAMIC costs
   a rule that stays, a false DEAD costs working UI, and those prices are not
   close. A fragment equal to the whole token is the static case and is already
   handled above, so equality does not count here. */
/* A fragment has to CONSTRAIN something, and the test is not the fragment on
   its own but the fragment PAIRED WITH what the interpolation would have to
   produce. `class="g${i}"` yields the prefix "g". Read as a builder of any
   token starting with g, it keeps .gear-row, .grid3, .gear-chip and a few
   hundred others permanently undecidable and the sweep finds nothing. Read
   with the remainder in view it is exact: `g` + "1" is what that template
   writes, and `g` + "ear-row" is not something any template in this codebase
   produces.
   So a fragment builds a token when it is substantial in its own right (it
   ends or starts at a separator like `pc-` or `-sect`, or reaches MIN_FRAG
   characters), OR when what is left for the interpolation to supply is a bare
   number or one or two characters, which is what `g${i}` and `t${n}` do.
   This is the one place the tool trades conservatism for usefulness. It is
   bounded, it is stated, and the SETUP gate pins it in both directions: `.g1`
   must survive `class="g${i}"` and `.gear-row` must not. */
const MIN_FRAG = 3;
const substantial = f => f.s.length >= MIN_FRAG
  || (f.kind === 'prefix' ? /[-_]$/.test(f.s) : /^[-_]/.test(f.s));
const plausibleFill = rest => /^[0-9]+$/.test(rest) || rest.length <= 2;
const buildableBy = (tok, frags) => frags.some(f => {
  if (!f.s.length || tok === f.s) return false;
  if (f.kind === 'prefix') return tok.startsWith(f.s) && (substantial(f) || plausibleFill(tok.slice(f.s.length)));
  if (f.kind === 'suffix') return tok.endsWith(f.s) && (substantial(f) || plausibleFill(tok.slice(0, tok.length - f.s.length)));
  return f.s.length >= MIN_FRAG && tok.includes(f.s);
});

/* ------------------------------------------------------------- the css sweep */
/* SHIPPED code can emit a class. A test cannot. tests/*.mjs QUERY the app's
   DOM, they do not build it, so a bare `'.plot-card'` in an audit is not
   evidence that anything ever renders .plot-card. It is the opposite:
   tests/suite-rot-audit.mjs holds that exact string inside a fixture whose own
   comment reads "never emitted". Counting it as indirection kept a provably
   dead rule alive on the strength of the audit that documents its death.
   So the INDIRECTION net (a bare short string that might be assigned to
   className) is scoped to shipped code. The EMISSION net is not: a harness
   html that writes class="..." really does emit, and those still count from
   anywhere in the tree. */
export const isShipped = rel => !/^(tests|docs|gwart|scripts)[/\\]/.test(rel);
export function sweepCss(cssText, sources, vendorText = '') {
  const E = { cls: new Set(), ids: new Set(), frags: [], classy: new Set(), any: new Set(), blind: 0 };
  /* A THIRD-PARTY BUNDLE EMITS ITS OWN CLASSES AND CANNOT BE ANALYSED.
     vendor/maplibre/maplibre-gl.js writes .maplibregl-canvas, .maplibregl-map
     and a few dozen more from inside 800 KB of minified code, and app.css
     legitimately styles them. This sweep called .maplibregl-canvas DEAD until
     vendor was accounted for, which would have deleted the map's own outline
     reset. Minified code is exactly where the lexer's heuristics are weakest,
     so vendor is NOT lexed: every word-shaped token in it is taken as
     emittable. Maximally conservative on purpose. A vendor bundle is a thing
     we do not get to reason about, and pretending otherwise is how this class
     of tool deletes working UI. */
  for (const m of vendorText.matchAll(/[A-Za-z_][\w-]*/g)) { E.cls.add(m[0]); E.any.add(m[0]); }
  for (const [rel, { masked, strings, full }] of sources) {
    const e = emissions(masked, strings, full);
    for (const k of ['cls', 'ids', 'any']) for (const v of e[k]) E[k].add(v);
    if (isShipped(rel)) for (const v of e.classy) E.classy.add(v);
    E.frags.push(...e.frags);
    E.blind += e.blind;
  }
  const verdict = (kind, tok) => {
    if (kind === 'class' ? E.cls.has(tok) : E.ids.has(tok)) return 'alive';
    /* An id that is emitted as a CLASS somewhere (or the reverse) is a naming
       muddle, not a corpse. Report it, never delete it. */
    if (kind === 'id' && E.cls.has(tok)) return 'mentioned';
    if (kind === 'class' && E.ids.has(tok)) return 'mentioned';
    if (buildableBy(tok, E.frags)) return 'dynamic';
    if (E.classy.has(tok)) return 'mentioned';
    if (E.any.has(tok)) return 'prose';        // named only in prose or in code, never as a class
    return 'dead';
  };
  const rules = parseCss(cssText);
  const out = [];
  for (const r of rules) {
    const sels = splitSelectors(r.prelude);
    if (!sels.length) continue;
    const perSel = sels.map(s => {
      const toks = selectorTokens(s);
      if (!toks.length) return { sel: s, verdict: 'alive', why: [] };   // a tag/attribute selector is not this tool's business
      const v = toks.map(t => ({ ...t, v: verdict(t.kind, t.tok) }));
      // a selector dies on its WORST token: ONE unmatchable token in the chain
      // means the whole chain can never match, whatever the others do
      const gone = v.filter(x => x.v === 'dead' || x.v === 'prose');
      const men = v.filter(x => x.v === 'mentioned');
      const dyn = v.filter(x => x.v === 'dynamic');
      if (gone.length) return { sel: s, verdict: 'dead', why: gone };
      if (men.length) return { sel: s, verdict: 'mentioned', why: men };
      if (dyn.length) return { sel: s, verdict: 'dynamic', why: dyn };
      return { sel: s, verdict: 'alive', why: [] };
    });
    /* A RULE is only deletable when EVERY selector in its list is dead.
       `.alive, .corpse { }` still styles .alive, and deleting it for the
       corpse's sake is the exact accident this tool exists to not have. */
    let v = 'alive';
    if (perSel.every(p => p.verdict === 'dead')) v = 'dead';
    else if (perSel.every(p => p.verdict === 'dead' || p.verdict === 'mentioned')) v = 'mentioned';
    else if (perSel.every(p => p.verdict !== 'alive')) v = 'dynamic';
    if (v !== 'alive') out.push({ ...r, verdict: v, perSel, bytes: r.end - r.start });
  }
  return { rules, findings: out, E };
}

/* --------------------------------------------------------------- the js sweep
 * TOP-LEVEL declarations only: a line that starts one, no indentation. That is
 * the whole of this codebase's module surface and it keeps the parse honest
 * without pulling in an AST this repo has no dependency for. */
const DECL_RES = [
  [/^export\s+(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/gm, true],
  [/^export\s+(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)\s*=>|function\b|[A-Za-z_$][\w$]*\s*=>)/gm, true],
  [/^(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/gm, false],
  [/^(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)\s*=>|function\b|[A-Za-z_$][\w$]*\s*=>)/gm, false],
];
export const countWord = (hay, tok) => {
  const re = new RegExp(`(?<![\\w$-])${escRe(tok)}(?![\\w$-])`, 'g');
  let n = 0; while (re.exec(hay)) n++; return n;
};

export function sweepJs(jsFiles, allSources) {
  const decls = new Map();
  const namespaced = new Set();       // modules pulled in as `import * as x`
  const imported = new Set();         // every name any import binds, anywhere
  const reexported = new Set();
  for (const [, { full }] of allSources) {
    for (const m of full.matchAll(/import\s*\*\s*as\s*[A-Za-z_$][\w$]*\s*from\s*['"`]([^'"`]+)['"`]/g)) namespaced.add(path.basename(m[1]));
    for (const m of full.matchAll(/import\s*\{([^}]*)\}\s*from/g)) for (const p of m[1].split(',')) { const n = p.trim().split(/\s+as\s+/)[0].trim(); if (n) imported.add(n); }
    for (const m of full.matchAll(/(?:const|let|var)\s*\{([^}]*)\}\s*=\s*await\s+import/g)) for (const p of m[1].split(',')) { const n = p.trim().split(/\s*:\s*/)[0].trim(); if (n) imported.add(n); }
    for (const m of full.matchAll(/^export\s*\{([^}]*)\}/gm)) for (const p of m[1].split(',')) { const n = p.trim().split(/\s+as\s+/)[0].trim(); if (n) reexported.add(n); }
  }
  for (const [f, { full }] of jsFiles) {
    const list = [], seen = new Set();
    for (const [re, exported] of DECL_RES) for (const m of full.matchAll(re)) {
      if (seen.has(m[1])) continue; seen.add(m[1]);
      list.push({ name: m[1], exported, at: full.slice(0, m.index).split('\n').length });
    }
    decls.set(f, list);
  }
  const unusedExports = [], deadLocals = [], nsReachable = [];
  for (const [f, list] of decls) {
    const self = jsFiles.get(f).full;
    const base = path.basename(f);
    for (const d of list) {
      const inSelf = countWord(self, d.name);
      if (d.exported || reexported.has(d.name)) {
        if (namespaced.has(base)) { nsReachable.push({ file: f, ...d }); continue; }
        if (imported.has(d.name)) continue;
        unusedExports.push({ file: f, ...d, selfUses: inSelf - 1 });
        continue;
      }
      /* A local is dead only if its own file never names it again, and STRINGS
         count: this app dispatches on data-act names, so a handler named only
         inside a template string is live and must not be swept. */
      if (inSelf <= 1) deadLocals.push({ file: f, ...d });
    }
  }
  return { decls, unusedExports, deadLocals, nsReachable, namespaced, imported };
}

/* ------------------------------------------------------------ the asset sweep
 * An asset can be PRECACHED and still unused, which is the worst combination:
 * every player downloads it on first open and nothing ever draws it. So the
 * precache list is cross-checked rather than treated as a reference. */
/* Not every file under assets/ is an ASSET. assets/icons-proposal/ carries the
   generator that built it (gen_icons.mjs, make_fajita.py) alongside its own
   inputs. A build script beside its art is not weight a player downloads, and
   flagging it every run would make the asset half permanently red over
   something nobody can act on. Those extensions are excluded from the
   candidate list and their contents ARE added to the reference corpus, so the
   art they generate reads as referenced. */
const TOOL_EXT = /\.(mjs|cjs|py|sh|md)$/;
/* TWO corpora, and mixing them up cost a round here. `corpus` is the `full`
   view, because `img.src = \`${BASE}/assets/x.png\`` writes the path inside an
   interpolation and the markup view drops it. `dynCorpus` is the `masked`
   view, because only that one carries the SENT that marks where a path was
   interpolated. Passing `full` for both silently emptied the interpolated
   directory list and moved 815 KB of runtime-addressed art into DEAD. */
export function sweepAssets(assetPaths, corpus, precached, dynCorpus = corpus) {
  /* Directory prefixes some template interpolates into. `assets/bh/${sp}/x.png`
     makes every file under assets/bh DYNAMIC, and that is the correct answer:
     this app picks art by species id at runtime. */
  const dynDirs = new Set();
  for (const m of dynCorpus.matchAll(new RegExp(`assets/[A-Za-z0-9_/.-]*(?=${escRe(SENT)})`, 'g'))) {
    const p = m[0], cut = p.lastIndexOf('/');
    if (cut > 0) dynDirs.add(p.slice(0, cut + 1));
  }
  const out = { dead: [], dynamic: [], live: [], tools: [], dynDirs: [...dynDirs].sort() };
  for (const rel of assetPaths) {
    if (TOOL_EXT.test(rel)) { out.tools.push(rel); continue; }
    const base = path.basename(rel);
    if (corpus.includes(rel) || corpus.includes(base) || countWord(corpus, base.replace(/\.[^.]+$/, '')) > 0) { out.live.push(rel); continue; }
    if (out.dynDirs.some(d => rel.startsWith(d))) { out.dynamic.push(rel); continue; }
    out.dead.push(rel);
  }
  out.precachedButUnreferenced = precached.filter(p => out.dead.includes(p.replace(/^\.\//, '')));
  return out;
}

if (!RUN_AS_MAIN) { /* imported as a library: the gate and the app run are main-only */ } else {
/* =============================================================== SETUP GATE
 * The engine proves itself on fixtures whose verdicts are known by
 * construction before it may judge the app. Two of these are the prove-red
 * pair, and they pull in opposite directions on purpose:
 *   RED    a reintroduced dead rule ('.zombie-row') is reported DEAD.
 *   GREEN  a live-but-dynamically-built class ('pc-common', built only by
 *          `class="pc-${r}"`) is NOT reported DEAD.
 * Gate failure is exit 2: the HARNESS is broken and no finding below it counts. */
{
  const fxSrc = new Map([
    ['js/fx.js', [
      'const html = `<div class="alive-chip pc-${r}" id="realId">',
      '  <b class="ind-${n} tail-kept"></b>',
      '  <i class="${on ? \'lit\' : \'\'} plain"></i>',
      '  ${rows.map(x => `<u class="nested-only"></u>`).join(\'\')}',
      '  <s class="${x}-suffixed"></s>',
      '  <p class="static-head${one.bumper ? \' bumper\' : \'\'}"></p>',
      '  ${curtains ? \'<div class="cond-markup l"></div>\' : \'\'}',
      '  <em class="${whollyDynamic}"></em></div>`;',
      "el.classList.add('added-cls');",
      "node.className = 'assigned-cls';",
      "wrap.setAttribute('class', 'attr-cls');",
      "const built = 'cat-' + kind;",
      // the app.js:88 shape: a regex holding a lone quote. Everything after it
      // must still lex, or 16,500 lines get read in the wrong mode.
      'const esc = s => String(s ?? \'\').replace(/[&<>"\']/g, c => c);',
      "const ratio = width / height / 2;                 // division, not a regex",
      "const surg = h => h.replace('class=\"banner', 'class=\"banner has-action');",
      'const after = `<div class="after-the-regex"></div>`;',
      // a ONE-LETTER prefix constrains nothing and must not resurrect anything
      'const cell = `<span class="g${i}"></span>`;',
      '// .comment-cls only lives in this comment',
      "const msg = 'you should try spreading zombie thin across the whole week';",
      "const maybe = 'indirect-cls';",
      'export function usedExport() { return 1; }',
      'export function lonelyExport() { return 2; }',
      'function calledLocal() { return 3; }',
      'function deadLocal() { return 4; }',
      'const g = () => calledLocal();',
      // the ONLY call site is inside a ${...}, which is how most of this app calls things
      'function tmplOnlyLocal() { return 5; }',
      'const wrap = `<div>${tmplOnlyLocal()}</div>`;',
      'const h = () => usedExport();',
    ].join('\n')],
    ['js/other.js', "import { usedExport } from './fx.js'; usedExport();"],
  ]);
  const fx = new Map([...fxSrc].map(([k, v]) => [k, lex(v)]));
  const css = [
    '.alive-chip{a:1}',                      // emitted statically
    '.pc-common{b:1}',                       // built by pc-${r}: MUST NOT be dead
    '.ind-3.tail-kept{c:1}',                 // dynamic prefix beside a static class
    '.lit{d:1}',                             // string inside ${cond ? .. : ..}
    '.nested-only{e:1}',                     // class inside a template inside a ${}
    '.wall-suffixed{f:1}',                   // built by ${x}-suffixed
    '.static-head{f2:1}',                    // the STATIC half of `head${cond}`: alive
    '.bumper{f3:1}',                         // the conditional half of the same: alive
    '.cond-markup{f4:1}',                    // markup written inside ${cond ? '..' : ''}
    '.after-the-regex{f5:1}',                // emitted AFTER a regex holding a lone quote
    '.has-action{f6:1}',                     // emitted by string surgery on markup
    '.gear-row{f7:1}',                       // starts with "g": must NOT be saved by `class="g${i}"`
    '.g1{f8:1}',                             // IS what `class="g${i}"` writes: must survive
    '.vendorgl-canvas{f9:1}',                // named only inside the minified vendor bundle
    '.cat-big{g:1}',                         // built by 'cat-' + kind
    '.added-cls{h:1}',
    '.assigned-cls{i:1}',
    '.attr-cls{j:1}',
    '#realId{k:1}',
    '.indirect-cls{l:1}',                    // only ever a bare short string: MENTIONED
    '.zombie-row{m:1}',                      // THE REINTRODUCED DEAD RULE
    '.comment-cls{n:1}',                     // named only in a comment
    '.alive-chip:not(.zombie-row){o:1}',     // :not() must not kill a live rule
    '.alive-chip, .zombie-row{p:1}',         // mixed list: NOT deletable
    '@keyframes zombie-row{0%{opacity:0}}',  // a keyframe name is not a selector
    '@media (max-width:400px){.zombie-row{q:1}}',
  ].join('\n');
  const R = sweepCss(css, fx, 'function t(e){e.className="vendorgl-canvas vendorgl-map"}');
  const verdictOf = sel => R.findings.find(f => f.prelude === sel)?.verdict ?? 'alive';
  const J = sweepJs(fx, fx);
  const A = sweepAssets(['assets/used.png', 'assets/never.png', 'assets/bh/G/G1.png'],
    lex("img.src = 'assets/used.png'; img2.src = `assets/bh/${sp}/${n}.png`;").masked, ['./assets/never.png', './assets/used.png']);
  const checks = [
    ['PROVE-RED: a reintroduced dead rule is DEAD', verdictOf('.zombie-row') === 'dead'],
    ['PROVE-RED: it is dead inside a @media too', verdictOf('.zombie-row') === 'dead' && R.findings.filter(f => f.prelude === '.zombie-row').length === 2],
    ['PROVE-GREEN: a dynamically built class is NOT dead', verdictOf('.pc-common') === 'dynamic'],
    ['PROVE-GREEN: a ${}-prefixed compound is NOT dead', verdictOf('.ind-3.tail-kept') !== 'dead'],
    ['PROVE-GREEN: a ${}-SUFFIXED class is NOT dead', verdictOf('.wall-suffixed') !== 'dead'],
    ["PROVE-GREEN: a 'pre-' + x concatenation is NOT dead", verdictOf('.cat-big') !== 'dead'],
    ['a static class= emission is alive', verdictOf('.alive-chip') === 'alive'],
    ['a string inside ${cond ? .. : ..} is an emission', verdictOf('.lit') === 'alive'],
    ['a class inside a template inside a ${} is an emission', verdictOf('.nested-only') === 'alive'],
    ['PROVE-GREEN: the STATIC half of `head${cond}` is alive, not a bare fragment', verdictOf('.static-head') === 'alive'],
    ['PROVE-GREEN: the conditional half of `head${cond}` is alive', verdictOf('.bumper') === 'alive'],
    ["PROVE-GREEN: markup written inside ${c ? '<div class=..>' : ''} is an emission", verdictOf('.cond-markup') === 'alive'],
    ['PROVE-GREEN: a regex holding a lone quote does not desync the rest of the file', verdictOf('.after-the-regex') === 'alive'],
    ['PROVE-RED: a one-letter ${} prefix does not resurrect an unrelated class', verdictOf('.gear-row') === 'dead'],
    ['PROVE-GREEN: the same one-letter prefix DOES keep what it really writes', verdictOf('.g1') === 'dynamic'],
    ['PROVE-GREEN: a class only a vendor bundle emits is never called dead', verdictOf('.vendorgl-canvas') === 'alive'],
    ['PROVE-GREEN: markup edited by string surgery is an emission', verdictOf('.has-action') === 'alive'],
    ['the lexer still reads a plain division as division', lex('const r = a / b / c;\nconst t = `<i class="post-division"></i>`;').masked.includes('post-division')],
    ['classList.add is an emission', verdictOf('.added-cls') === 'alive'],
    ['className = is an emission', verdictOf('.assigned-cls') === 'alive'],
    ["setAttribute('class') is an emission", verdictOf('.attr-cls') === 'alive'],
    ['an id= emission is alive', verdictOf('#realId') === 'alive'],
    ['a comment does not resurrect a corpse', verdictOf('.comment-cls') === 'dead'],
    ['a bare short string downgrades to MENTIONED, never DEAD', verdictOf('.indirect-cls') === 'mentioned'],
    ['prose is not an emission (zombie in a sentence stays dead)', verdictOf('.zombie-row') === 'dead'],
    [':not() cannot kill a live rule', verdictOf('.alive-chip:not(.zombie-row)') === 'alive'],
    ['a mixed selector list is NOT deletable', verdictOf('.alive-chip, .zombie-row') === 'alive'],
    ['a @keyframes name is not swept as a selector', !R.findings.some(f => f.prelude === '0%')],
    ['a wholly interpolated class= is counted as a blind spot', R.E.blind >= 1],
    ['byte cost is measured, not asserted', (R.findings.find(f => f.prelude === '.zombie-row')?.bytes ?? 0) > 0],
    ['JS: an export nobody imports is reported', J.unusedExports.some(u => u.name === 'lonelyExport')],
    ['JS: an imported export is not reported', !J.unusedExports.some(u => u.name === 'usedExport')],
    ['JS: an uncalled local is reported', J.deadLocals.some(u => u.name === 'deadLocal')],
    ['JS: a called local is not reported', !J.deadLocals.some(u => u.name === 'calledLocal')],
    ['JS PROVE-GREEN: a local called only from inside a ${} is not reported', !J.deadLocals.some(u => u.name === 'tmplOnlyLocal')],
    ['ASSET: an unreferenced file is dead', A.dead.includes('assets/never.png')],
    ['ASSET: a literally referenced file is live', A.live.includes('assets/used.png')],
    ['ASSET: an interpolated directory keeps its files alive', A.dynamic.includes('assets/bh/G/G1.png')],
    ['ASSET: precached-but-unreferenced is called out by name', A.precachedButUnreferenced.join() === './assets/never.png'],
  ];
  const bad = checks.filter(([, p]) => !p);
  if (bad.length) {
    console.log('FAIL  SETUP the sweep is broken, this is the HARNESS, not the app');
    bad.forEach(([n]) => console.log(`      gate fixture: ${n}`));
    console.log(`      css verdicts: ${R.findings.map(f => f.prelude + '=' + f.verdict).join(' | ')}`);
    console.log(`      js: unusedExports=[${J.unusedExports.map(u => u.name)}] deadLocals=[${J.deadLocals.map(u => u.name)}]`);
    console.log(`      assets: dead=[${A.dead}] dynamic=[${A.dynamic}] live=[${A.live}]`);
    process.exit(2);
  }
  ok('SETUP the sweep proves itself on known verdicts', true, `${checks.length} fixtures, both prove-red directions`);
}

/* ============================================================== run on ROOT */
const SRC_DIRS = ['js', 'data', 'native', 'server', 'scripts', 'help', 'gwart', 'tests', 'docs'];
/* Whole path SEGMENTS, not substrings. My first version was
   /...|[/\\]icons|.../ and it silently excluded js/ICONS-pack.js, the module
   that emits `class="bhi"` on every icon in the app, which put .bhi and its
   whole family in the DEAD list. A skip pattern that can swallow a source file
   is the same bug as a selector that can never match: it fails quietly and in
   the expensive direction. */
const SKIP_DIR = /[/\\](node_modules|\.git|assets|icons|vendor|_feedback_shots)([/\\]|$)/;
const walkFiles = (dir, out = []) => {
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (SKIP_DIR.test(full)) continue;
    if (e.isDirectory()) walkFiles(full, out); else out.push(full);
  }
  return out;
};
const sources = new Map();
const jsFiles = new Map();
const addSource = rel => {
  const full = path.join(ROOT, rel);
  if (!existsSync(full) || sources.has(rel)) return;
  const src = readFileSync(full, 'utf8');
  const L = /\.html?$/.test(rel) ? lexHtml(src) : lex(src);
  sources.set(rel, L);
  if (rel.startsWith('js/') && rel.endsWith('.js')) jsFiles.set(rel, L);
};
for (const d of SRC_DIRS) for (const f of walkFiles(path.join(ROOT, d))) {
  if (/\.(js|mjs|cjs|html?|json|webmanifest)$/.test(f)) addSource(path.relative(ROOT, f));
}
for (const f of readdirSync(ROOT)) {
  const full = path.join(ROOT, f);
  if (statSync(full).isFile() && /\.(js|mjs|html?|json|webmanifest)$/.test(f)) addSource(f);
}

ok('COVERAGE source files were read at all (an empty sample set is a FAILURE)', sources.size > 40, `${sources.size} files, ${jsFiles.size} in js/`);

const LH = lexerHealth(sources);
LH.survived.slice(0, 10).forEach(s => console.log(`      lexer desync: ${s}`));
ok('SETUP the lexer did not desync on any source (a desynced lexer reports confidently and wrongly)',
  LH.survived.length === 0 && LH.checked > 200, `${LH.checked} column-zero comments checked, ${LH.survived.length} survived into masked`);
if (LH.survived.length) { console.log('      HARNESS BROKEN: every finding below was derived from a mis-lexed corpus.'); process.exit(2); }

const walkRaw = (dir, out = []) => {
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.')) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walkRaw(full, out); else out.push(full);
  }
  return out;
};
const cssText = existsSync(path.join(ROOT, 'app.css')) ? readFileSync(path.join(ROOT, 'app.css'), 'utf8') : '';
/* vendor/ is read RAW, never lexed: see sweepCss. It is the map, the OCR
   engine and the barcode reader, all minified, all emitting their own DOM. */
const vendorText = existsSync(path.join(ROOT, 'vendor'))
  ? walkRaw(path.join(ROOT, 'vendor')).filter(f => /\.(js|mjs|css)$/.test(f)).map(f => readFileSync(f, 'utf8')).join('\n')
  : '';
const CSS = sweepCss(cssText, sources, vendorText);
ok('COVERAGE vendor/ was read as an unanalysable emitter (a third-party bundle writes its own classes)',
  vendorText.length > 100000, `${vendorText.length} bytes of vendor js/css treated as emitting every name it contains`);
ok('COVERAGE app.css parsed into rules', CSS.rules.length > 500, `${CSS.rules.length} rules, ${cssText.length} bytes`);

/* PROBE=tok,tok prints WHY one token landed where it landed, per file. A
   verdict a reviewer cannot re-derive is a verdict they have to take on faith,
   and this tool is asking permission to delete things. */
if (process.env.PROBE) {
  for (const tok of process.env.PROBE.split(',').map(s => s.trim().replace(/^[.#]/, '')).filter(Boolean)) {
    const by = CSS.E.frags.filter(f => f.s.length > 0 && tok !== f.s && (
      (f.kind === 'prefix' && tok.startsWith(f.s)) || (f.kind === 'suffix' && tok.endsWith(f.s)) || (f.kind === 'infix' && tok.includes(f.s))));
    console.log(`\nPROBE ${tok}: class-emitted=${CSS.E.cls.has(tok)} id-emitted=${CSS.E.ids.has(tok)} classy-string=${CSS.E.classy.has(tok)} anywhere=${CSS.E.any.has(tok)} buildable-by=${JSON.stringify([...new Set(by.map(f => f.kind + ':' + f.s))])}`);
    for (const [f, { masked }] of sources) {
      const n = countWord(masked, tok);
      if (!n) continue;
      const idx = masked.search(new RegExp(`(?<![\\w$-])${escRe(tok)}(?![\\w$-])`));
      console.log(`      ${f}  x${n}  line ${masked.slice(0, idx).split('\n').length}  ...${masked.slice(Math.max(0, idx - 60), idx + 40).replace(/\s+/g, ' ').replace(new RegExp(escRe(SENT), 'g'), '{}')}...`);
    }
  }
}

const JS = sweepJs(jsFiles, sources);
const declCount = [...JS.decls.values()].reduce((n, l) => n + l.length, 0);
ok('COVERAGE js/ top-level declarations were found', declCount > 200, `${declCount} declarations across ${jsFiles.size} modules`);

const assetPaths = walkRaw(path.join(ROOT, 'assets')).map(f => path.relative(ROOT, f).split(path.sep).join('/'));
/* The asset corpus is built from `full`, not `masked`. `masked` drops the code
   inside every ${...}, and `img.src = \`${BASE}/assets/x.png\`` puts the path
   there, so the markup view would call half the art unreferenced. It also
   includes the text files that live INSIDE assets/ (a generator's manifest
   names the art it produced) and app.css itself, which loads art by url(). */
const corpus = [...sources.values()].map(s => s.full).join('\n') + '\n' + cssText + '\n'
  + walkRaw(path.join(ROOT, 'assets')).filter(f => /\.(mjs|cjs|js|json|css|html?|txt|md)$/.test(f))
    .map(f => readFileSync(f, 'utf8')).join('\n');
const swText = existsSync(path.join(ROOT, 'sw.js')) ? readFileSync(path.join(ROOT, 'sw.js'), 'utf8') : '';
const preArr = swText.slice(swText.indexOf('PRECACHE'), swText.indexOf('];', swText.indexOf('PRECACHE')));
const precached = [...preArr.matchAll(/['"](\.\/[^'"]*)['"]/g)].map(m => m[1]);
const dynCorpus = [...sources.values()].map(s => s.masked).join('\n');
const AS = sweepAssets(assetPaths, corpus, precached, dynCorpus);
ok('COVERAGE assets/ was walked and PRECACHE parsed', assetPaths.length > 100 && precached.length > 50,
  `${assetPaths.length} asset files, ${precached.length} precache entries`);

/* --------------------------------------------------------------- the report */
const grp = v => CSS.findings.filter(f => f.verdict === v);
const bytes = a => a.reduce((n, f) => n + f.bytes, 0);
const dead = grp('dead'), dyn = grp('dynamic'), men = grp('mentioned');
const lineOf = i => cssText.slice(0, i).split('\n').length;

console.log(`\n--- CSS DEAD: no emitter, no template fragment, no mention anywhere (${dead.length} rules, ${bytes(dead)} bytes) ---`);
for (const f of dead) {
  const killers = f.perSel.flatMap(p => p.why.map(w => (w.kind === 'class' ? '.' : '#') + w.tok + (w.v === 'prose' ? ' [prose-only]' : '')));
  console.log(`DEAD  app.css:${lineOf(f.start)}  ${JSON.stringify(f.prelude)}  ${f.bytes}B  killed-by: ${[...new Set(killers)].join(', ')}`);
}
console.log(`\n--- CSS DYNAMIC: a template fragment could build it, NOT a deletion (${dyn.length} rules, ${bytes(dyn)} bytes) ---`);
for (const f of dyn.slice(0, 30)) console.log(`DYN?  app.css:${lineOf(f.start)}  ${JSON.stringify(f.prelude)}  ${f.bytes}B`);
if (dyn.length > 30) console.log(`      ... and ${dyn.length - 30} more`);
console.log(`\n--- CSS MENTIONED: named outside an emission position, eyes needed (${men.length} rules, ${bytes(men)} bytes) ---`);
for (const f of men.slice(0, 30)) console.log(`MENT  app.css:${lineOf(f.start)}  ${JSON.stringify(f.prelude)}  ${f.bytes}B  via: ${[...new Set(f.perSel.flatMap(p => p.why.map(w => w.tok)))].join(', ')}`);
if (men.length > 30) console.log(`      ... and ${men.length - 30} more`);
console.log(`      BLIND SPOT, declared: ${CSS.E.blind} class/id attributes are WHOLLY interpolated, so they constrain nothing and could carry any name.`);

console.log(`\n--- JS DEAD LOCALS: top-level, not exported, its own file never names it again (${JS.deadLocals.length}) ---`);
for (const d of JS.deadLocals) console.log(`DEAD  ${d.file}:${d.at}  ${d.name}`);
console.log(`\n--- JS UNIMPORTED EXPORTS: exported, no import binds the name anywhere in the tree (${JS.unusedExports.length}) ---`);
for (const d of JS.unusedExports.slice(0, 50)) console.log(`EXP?  ${d.file}:${d.at}  ${d.name}  own-file-uses:${d.selfUses}`);
if (JS.unusedExports.length > 50) console.log(`      ... and ${JS.unusedExports.length - 50} more`);
console.log(`      ${JS.nsReachable.length} further exports live in namespace-imported modules (${[...JS.namespaced].join(', ')}) and cannot be judged statically.`);

console.log(`\n--- ASSETS: ${AS.live.length} referenced by name, ${AS.dynamic.length} reachable only through an interpolated path, ${AS.dead.length} unreferenced ---`);
console.log(`      interpolated directories: ${AS.dynDirs.join(' ')}`);
console.log(`      ${AS.tools.length} build scripts under assets/ are not graded as shipped weight: ${AS.tools.join(' ')}`);
for (const a of AS.dynamic) console.log(`DYN?  ${a}  ${statSync(path.join(ROOT, a)).size}B  under an interpolated directory but named nowhere: the likeliest dead weight in assets/, and not this tool's call`);
for (const a of AS.dead) console.log(`DEAD  ${a}  ${statSync(path.join(ROOT, a)).size}B${precached.includes('./' + a) ? '  *** AND PRECACHED: every player downloads it ***' : ''}`);

/* ------------------------------------------------------------------ verdicts
 * Only DEAD fails. DYNAMIC and MENTIONED are the buckets this tool refuses to
 * decide, and a sweep that goes red on its own uncertainty gets muted. */
ok('CSS carries no rule that nothing in the tree can match', dead.length === 0,
  dead.length ? `${dead.length} rules / ${bytes(dead)} bytes of app.css can never match` : `0 dead of ${CSS.rules.length} rules`);
/* FOUR DEAD RENDERS ARE KEPT ON PURPOSE, and they are listed here BY NAME with
   the reason, not waved through by a pattern. Each is a module-local function
   its own file never calls again, so this sweep is right about all four; the
   judgement is whether the repo wants them gone, and in each case an existing
   audit already answered. Anything NOT on this list still fails, so the check
   can still go red, and a name that stops being dead has to be removed from the
   list or the coverage line below says so. Same shape as release-gate's tier
   map: an exemption nobody can read is an exemption nobody can revoke. */
const KNOWN_DEAD_LOCALS = {
  'js/app.js:petPanelHtml': "tests/figure-audit.mjs:169 already carries this exact verdict, in those words: 'petPanelHtml has no caller in js/app.js (dead render, left alone deliberately)'. That decision is not this sweep's to reverse.",
  'js/app.js:lbHeadHtml': "tests/lb-memory-audit.mjs:28 uses it as its PROVE-RED anchor: 'restore the eager ${lbHeadHtml(p, 52)} in openLeaderboard's row'. Deleting it turns a one-line red-proof into a rewrite.",
  'js/app.js:gardenRowHtml': "tests/garden-doors.mjs:20 does the same: 'BURIED  put gardenRowHtml(garden, seedTotal) back in the cook view'.",
  'js/app.js:openGardenSheet': 'the Garden doors landing (v304) left this behind and three audits still describe it as the old entry point. It is dead and it is also the only surviving description of how that door used to work; removing it is a Garden call, not a sweep call.',
};
const unexpectedDead = JS.deadLocals.filter(d => !KNOWN_DEAD_LOCALS[`${d.file}:${d.name}`]);
const staleExemptions = Object.keys(KNOWN_DEAD_LOCALS).filter(k => !JS.deadLocals.some(d => `${d.file}:${d.name}` === k));
for (const [k, why] of Object.entries(KNOWN_DEAD_LOCALS)) console.log(`KEPT  ${k}  ${why}`);
ok('js/ carries no top-level local its own file never names again, beyond the four kept on purpose',
  unexpectedDead.length === 0,
  unexpectedDead.length ? unexpectedDead.map(d => `${d.file}:${d.name}`).join(', ') : `${JS.deadLocals.length} dead of ${declCount} declarations, all four declared above`);
ok('no exemption above has gone stale (a kept name that is alive again must be removed from the list)',
  staleExemptions.length === 0, staleExemptions.length ? `no longer dead: ${staleExemptions.join(', ')}` : `all ${Object.keys(KNOWN_DEAD_LOCALS).length} still apply`);
ok('assets/ carries no file the tree never references', AS.dead.length === 0,
  AS.dead.length ? `${AS.dead.length} unreferenced, ${AS.precachedButUnreferenced.length} of them precached` : `all ${assetPaths.length} referenced or dynamically reachable`);

const failed = results.filter(r => !r.pass).length;
console.log(`\n${results.length - failed}/${results.length} passed  (${CSS.rules.length} css rules, ${declCount} js decls, ${assetPaths.length} assets)`);
process.exit(failed ? 1 : 0);

}
