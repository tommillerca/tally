/* tests/xp-key-provenance-lint.mjs: NO AWARD KEY IS BUILT FROM A CLOCK OR A
 * RANDOM SOURCE, TRACED TO WHERE THE VALUE COMES FROM.
 *
 * THE CLASS. award(key) is idempotent on `key` and nothing else, so a key that
 * changes on every call is a reward that pays on every call. Six call sites
 * once built theirs from Date.now() (a level 80 account, 214 Pit wins in a day,
 * 2026-08-16), and tests/xp-cap-audit.mjs grew a STATIC lint that regexed the
 * literal key text for Date.now|Math.random.
 *
 * WHY THAT LINT WAS NOT ENOUGH. QA round A (2026-09-03, L1): the log award was
 * `award(`log-${entry.id}`)`, and entry.id is newId() (js/db.js), which is
 * Date.now().toString(36) plus Math.random(). The clock was two hops away
 * (entry.id <- caller's `{ id: newId() }` <- newId's body) and the key text
 * contained neither word, so the guard written for this exact bug class passed
 * it while the farm paid 245 XP a minute. Pattern-matching the string is not
 * the check; PROVENANCE is.
 *
 * WHAT THIS DOES. For every award(/awardCapped(/awardOnce( call in js/, take
 * every identifier chain in the key (`entry.id`, `d`, `b.id`) and resolve it:
 *   - a LOCAL (`const copy = {...}`, `for (const d of ...)`, `let n`) resolves
 *     to its initialiser; an object literal resolves the chain's property;
 *     a chain initialiser recurses; a ternary taints if either arm does;
 *   - a PARAMETER resolves through every call site of its function across
 *     js/, taking the argument in that position and resolving THAT in the
 *     caller's scope; any tainted caller taints the key;
 *   - a SOURCE is Date.now, Math.random, performance.now, crypto.randomUUID,
 *     `new Date()` used as a value, or newId(), whose body is read from
 *     js/db.js and required to contain a source, so the seed is derived and
 *     not asserted.
 * A chain the tracer cannot follow (a destructure, a spread it cannot see
 * through, an anonymous callback's parameter, a store row) is UNRESOLVED and
 * COUNTED, never silently passed: the REACH row fails if the tracer stops
 * resolving most of what it sees, which is what a broken regex looks like.
 *
 * SELF-TEST. A fixture with the exact shape of the L1 bug (key <- param <- call
 * site <- object literal <- newId()) must come out TAINTED, and a date-keyed
 * neighbour CLEAN, before the real tree is graded. The fixture is the
 * prove-red that lives in the file.
 *
 * PROVE-RED ON THE REAL TREE. `node tests/xp-key-provenance-lint.mjs <root>`
 * against integ/playtest-round-a at 28f4e1bb reports js/game.js onFoodLogged's
 * `log-${entry.id}` TAINTED via app.js `copy.id <- newId()` (three call sites)
 * and `e.id <- editing ? entry.id : newId()`. Green on the fixed tree.
 *
 * ponytail: scope is "nearest preceding definition", not a real lexical
 * scope walk. Right for every shape in this tree today; if a same-named local
 * in an earlier sibling block ever shadows a use, the answer is a printed
 * UNRESOLVED or a visible false red, never a silent green.
 *
 * PURE: node only, no browser, ~0.3s.
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = [];
let fails = 0;
const ok = (m, cond, detail = '') => {
  if (cond) out.push(`ok   ${m}${detail ? '  ' + detail : ''}`);
  else { fails++; out.push(`FAIL ${m}${detail ? '  ' + detail : ''}`); }
};

const SOURCE = /\b(Date\.now|Math\.random|performance\.now|crypto\.randomUUID|new\s+Date)\s*\(|\bnewId\s*\(/;
const ID = String.raw`[A-Za-z_$][\w$]*`;
const CHAIN = new RegExp(String.raw`\b${ID}(?:\.${ID})*`, 'g');
const KEYWORDS = new Set(['true', 'false', 'null', 'undefined', 'await', 'typeof', 'new', 'async']);

/* ---- tiny string-aware scanner: balanced spans, top-level splits ---- */
function skipLiteral(src, i) {   // i at a quote: return index after the closing quote
  const q = src[i];
  for (let j = i + 1; j < src.length; j++) {
    if (src[j] === '\\') { j++; continue; }
    if (src[j] === q) return j + 1;
  }
  return src.length;
}
/* From `i` (just after an opening bracket) to the index of its closer, depth 0.
   Strings and templates are skipped whole (a `${}` inside a template is
   opaque here, which is fine: we only balance the outer expression). */
function closeFrom(src, i, open, close) {
  for (let j = i; j < src.length; j++) {
    const c = src[j];
    if (c === '"' || c === "'" || c === '`') { j = skipLiteral(src, j) - 1; continue; }
    if (c === '/' && src[j + 1] === '/') { const e = src.indexOf('\n', j); if (e < 0) return src.length; j = e; continue; }
    if (c === '/' && src[j + 1] === '*') { const e = src.indexOf('*/', j); if (e < 0) return src.length; j = e + 1; continue; }
    if (c === '(' || c === '[' || c === '{') { j = closeFrom(src, j + 1, c, c === '(' ? ')' : c === '[' ? ']' : '}'); continue; }
    if (c === close) return j;
  }
  return src.length;
}
/* An expression starting at `i`, up to (not including) a top-level `,` `;` `}` `)` or a newline that ends the statement. */
function exprFrom(src, i, stops = ',;)}]') {
  let j = i;
  while (j < src.length) {
    const c = src[j];
    if (c === '"' || c === "'" || c === '`') { j = skipLiteral(src, j); continue; }
    if (c === '(' || c === '[' || c === '{') { j = closeFrom(src, j + 1, c, c === '(' ? ')' : c === '[' ? ']' : '}') + 1; continue; }
    if (stops.includes(c)) break;
    j++;
  }
  return src.slice(i, j).trim();
}
function splitTop(s) {   // split on top-level commas
  const parts = []; let cur = '';
  for (let j = 0; j < s.length; j++) {
    const c = s[j];
    if (c === '"' || c === "'" || c === '`') { const e = skipLiteral(s, j); cur += s.slice(j, e); j = e - 1; continue; }
    if (c === '(' || c === '[' || c === '{') { const e = closeFrom(s, j + 1, c, c === '(' ? ')' : c === '[' ? ']' : '}'); cur += s.slice(j, e + 1); j = e; continue; }
    if (c === ',') { parts.push(cur.trim()); cur = ''; continue; }
    cur += c;
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts;
}
const lineOf = (src, i) => src.slice(0, i).split('\n').length;
const isChain = s => new RegExp(`^${ID}(?:\\.${ID})*$`).test(s);

/* ---- definitions: nearest preceding local or parameter ---- */
/* Every way a name can be bound in a file, indexed ONCE per file by name:
   nearestDef is asked thousands of times per run (every call site of every
   function a key's parameter routes through), and a per-query regex sweep of
   the 1MB app.js took the lint from 0.3s to minutes. Parameter bindings carry
   the function's name (null for anonymous) and the argument index. */
const CONTROL = /^(?:if|for|while|switch|catch|return|await|else|function)$/;
const defIndex = new Map();   // src -> Map<name, def[]> (defs sorted by idx)
function defsOf(src) {
  if (defIndex.has(src)) return defIndex.get(src);
  const byName = new Map();
  const add = (name, def) => { if (!byName.has(name)) byName.set(name, []); byName.get(name).push(def); };
  for (const m of src.matchAll(new RegExp(String.raw`\b(?:const|let|var)\s+(${ID})\s*=(?!=)`, 'g'))) {
    add(m[1], { idx: m.index, kind: 'local', at: m.index + m[0].length });   // expr is cut lazily
  }
  for (const m of src.matchAll(new RegExp(String.raw`\bfor\s*\(\s*(?:const|let|var)\s+(${ID})\s+(?:of|in)\b`, 'g'))) add(m[1], { idx: m.index, kind: 'loop' });
  for (const m of src.matchAll(new RegExp(String.raw`\bfor\s*\(\s*(?:let|var)\s+(${ID})\s*=`, 'g'))) add(m[1], { idx: m.index, kind: 'counter' });
  /* The function-header shapes this tree writes (QA round A, 2026-09-03, read
     off js/: `function f(`, `const f = async (a) =>`, `f: (a) =>`, method
     shorthand). A shape missing here is a parameter the tracer cannot bind,
     which prints as UNRESOLVED and counts against REACH, never as CLEAN. */
  const HEADERS = [
    // function foo(a, b) {     |  async function foo(a, b)
    new RegExp(String.raw`\bfunction\s*\*?\s*(${ID})?\s*\(`, 'g'),
    // const foo = async (a, b) =>   |  foo: (a) =>   |  foo = (a) =>
    new RegExp(String.raw`(?:(?:const|let|var)\s+)?(${ID})\s*[:=]\s*(?:async\s*)?\((?=[^)]*\)\s*=>)`, 'g'),
    // method shorthand: async foo(a, b) {   (control keywords are not functions)
    new RegExp(String.raw`(?:^|\n)\s*(?:async\s+)?(${ID})\s*\((?=[^)]*\)\s*\{)`, 'g'),
  ];
  for (const re of HEADERS) {
    for (const m of src.matchAll(re)) {
      if (m[1] && CONTROL.test(m[1])) continue;
      const open = m.index + m[0].length;
      const close = closeFrom(src, open, '(', ')');
      splitTop(src.slice(open, close)).forEach((p, k) => {
        const nm = p.replace(/^\.\.\./, '').match(new RegExp(`^${ID}`));
        const destructured = /^[{[]/.test(p);
        if (nm) add(nm[0], { idx: m.index, kind: 'param', fn: m[1] || null, index: k, destructured });
        else if (destructured) for (const inner of p.match(new RegExp(ID, 'g')) || []) add(inner, { idx: m.index, kind: 'param', fn: m[1] || null, index: k, destructured: true });
      });
    }
  }
  // bare arrow param:  name =>   |  (name) =>
  for (const m of src.matchAll(new RegExp(String.raw`(?:\(\s*(${ID})\s*\)|(?<![\w$.])(${ID}))\s*=>`, 'g'))) {
    add(m[1] || m[2], { idx: m.index, kind: 'param', fn: null, index: 0, anonymous: true });
  }
  for (const list of byName.values()) list.sort((x, y) => x.idx - y.idx);
  defIndex.set(src, byName);
  return byName;
}
function nearestDef(src, name, pos) {
  const list = defsOf(src).get(name);
  if (!list) return null;
  let best = null;
  for (const d of list) { if (d.idx >= pos) break; best = d; }
  if (best && best.kind === 'local' && best.expr == null) best.expr = exprFrom(src, best.at);
  return best;
}

/* ---- the tracer ---- */
function makeTracer(files) {   // files: Map<name, src>
  const callSitesOf = new Map();
  const memo = new Map();       // resolveChain results by file:pos:chain
  function callSites(fn) {
    if (callSitesOf.has(fn)) return callSitesOf.get(fn);
    const res = [];
    for (const [f, src] of files) {
      for (const m of src.matchAll(new RegExp(String.raw`(?<![\w$.])${fn.replace(/\$/g, '\\$')}\s*\(`, 'g'))) {
        if (/function\s*$/.test(src.slice(Math.max(0, m.index - 12), m.index))) continue;   // its own header
        const open = m.index + m[0].length;
        const close = closeFrom(src, open, '(', ')');
        res.push({ file: f, pos: m.index, args: splitTop(src.slice(open, close)) });
      }
    }
    callSitesOf.set(fn, res);
    return res;
  }
  /* Resolve `expr` (arbitrary expression text) with a remaining property path.
     Returns { state: 'TAINTED'|'CLEAN'|'UNRESOLVED', trail: [...] }. */
  function resolveExpr(expr, rest, file, pos, depth, seen) {
    const trail = [`${file}:${lineOf(files.get(file), pos)} ${expr}${rest.length ? '.' + rest.join('.') : ''}`];
    const r = (state, why) => ({ state, trail: why ? [...trail, why] : trail });
    if (depth > 16) return r('UNRESOLVED', 'depth');
    /* An object literal is looked into BEFORE the whole-text source test: the
       key reads ONE property, and `{ id: newId(), date: S.date, ts: Date.now() }`
       taints `.id` but not `.date`. Tested the other way round this tainted
       every date key in onFoodLogged (six false reds, 2026-09-03). */
    if (expr.startsWith('{')) {
      if (!rest.length) return r('CLEAN', 'object as key text');
      const body = expr.slice(1, closeFrom(expr, 1, '{', '}'));
      const props = splitTop(body);
      const hit = props.find(p => new RegExp(String.raw`^${rest[0].replace(/\$/g, '\\$')}\s*:`).test(p));
      if (hit) return resolveExpr(hit.slice(hit.indexOf(':') + 1).trim(), rest.slice(1), file, pos, depth + 1, seen);
      if (props.some(p => p === rest[0])) return resolveChain(rest[0], rest.slice(1), file, pos, depth + 1, seen, trail);
      if (props.some(p => p.startsWith('...'))) return r('UNRESOLVED', `.${rest[0]} hidden behind a spread`);
      return r('UNRESOLVED', `.${rest[0]} not a literal property`);
    }
    if (SOURCE.test(expr)) return r('TAINTED', `source in: ${expr.slice(0, 60)}`);
    // ternary: either arm
    const tern = expr.match(/^([^?]+)\?(.+):(.+)$/s);
    if (tern && !/^[{[(]/.test(expr)) {
      for (const arm of [tern[2], tern[3]]) {
        const a = resolveExpr(arm.trim(), rest, file, pos, depth + 1, seen);
        if (a.state === 'TAINTED') return { state: 'TAINTED', trail: [...trail, ...a.trail] };
      }
      return r('CLEAN', 'both arms clean');
    }
    const chainish = expr.replace(/^await\s+/, '');
    if (isChain(chainish)) {
      const segs = chainish.split('.');
      return resolveChain(segs[0], [...segs.slice(1), ...rest], file, pos, depth + 1, seen, trail);
    }
    return r('CLEAN', 'terminal expression, no source');
  }
  function resolveChain(root, rest, file, pos, depth, seen, trailIn = []) {
    const src = files.get(file);
    const trail = [...trailIn, `${file}:${lineOf(src, pos)} ${[root, ...rest].join('.')}`];
    const r = (state, why) => ({ state, trail: why ? [...trail, why] : trail });
    const tag = `${file}:${pos}:${root}.${rest.join('.')}`;
    if (memo.has(tag)) return memo.get(tag);
    if (seen.has(tag)) return r('UNRESOLVED', 'cycle');
    seen.add(tag);
    const res = resolveChainUncached(root, rest, file, pos, depth, seen, trail, r, tag);
    if (!(res.state === 'UNRESOLVED' && /cycle|depth/.test(res.trail.at(-1)))) memo.set(tag, res);
    return res;
  }
  function resolveChainUncached(root, rest, file, pos, depth, seen, trail, r, tag) {
    const src = files.get(file);
    if (depth > 16) return r('UNRESOLVED', 'depth');
    if (KEYWORDS.has(root)) return r('CLEAN', 'keyword');
    if (root === 'newId' || root === 'Date' || root === 'Math' || root === 'performance' || root === 'crypto') {
      return SOURCE.test([root, ...rest].join('.') + '(') ? r('TAINTED', 'is a source') : r('CLEAN', 'global, not a source');
    }
    const def = nearestDef(src, root, pos);
    if (!def) return r('UNRESOLVED', `no definition of ${root} before use`);
    if (def.kind === 'loop') return r('UNRESOLVED', `${root} is a loop item`);
    if (def.kind === 'counter') return r('CLEAN', `${root} is a for-counter`);
    if (def.kind === 'local') {
      const sub = resolveExpr(def.expr, rest, file, def.idx, depth + 1, seen);
      return { state: sub.state, trail: [...trail, ...sub.trail] };
    }
    // parameter
    if (def.destructured) return r('UNRESOLVED', `${root} is destructured in a parameter list`);
    if (!def.fn) return r('UNRESOLVED', `${root} is a parameter of an anonymous function`);
    const sites = callSites(def.fn);
    if (!sites.length) return r('UNRESOLVED', `${def.fn}() has no call site in js/`);
    let anyUnresolved = null;
    for (const s of sites) {
      const arg = s.args[def.index];
      if (arg == null) continue;
      const sub = resolveExpr(arg, rest, s.file, s.pos, depth + 1, seen);
      if (sub.state === 'TAINTED') return { state: 'TAINTED', trail: [...trail, `param ${root} of ${def.fn}() <- call site`, ...sub.trail] };
      if (sub.state === 'UNRESOLVED') anyUnresolved = sub;
    }
    return anyUnresolved
      ? { state: 'UNRESOLVED', trail: [...trail, `param ${root} of ${def.fn}(), ${sites.length} call site(s)`, ...anyUnresolved.trail] }
      : r('CLEAN', `param ${root} of ${def.fn}(), all ${sites.length} call site(s) clean`);
  }

  /* Every award key in `files`, graded. */
  function grade() {
    const rows = [];
    const re = /\baward(?:Capped|Once)?\(\s*((?:[^,()`]|`[^`]*`|\([^()]*\))*)/g;
    for (const [f, src] of files) {
      for (const m of src.matchAll(re)) {
        const key = m[1].trim();
        const pos = m.index;
        // identifier chains in the key: template ${...} contents, or the key with string literals removed
        const noStrings = t => t.replace(/(["'])(?:\\.|(?!\1).)*\1/g, ' ');   // 'nofood' in `${a || 'nofood'}` is not an identifier
        const parts = key.startsWith('`')
          ? [...key.matchAll(/\$\{([^}]*)\}/g)].map(x => noStrings(x[1]))
          : [noStrings(key)];
        const chains = [];
        for (const p of parts) {
          if (SOURCE.test(p)) { chains.push({ text: p, res: { state: 'TAINTED', trail: [`${f}:${lineOf(src, pos)} source written in the key: ${p}`] } }); continue; }
          for (const c of p.replace(/\b[\w$.]+\s*\(/g, ' ').match(CHAIN) || []) {   // calls are terminal (dateKey(), String())
            if (KEYWORDS.has(c)) continue;
            const segs = c.split('.');
            chains.push({ text: c, res: resolveChain(segs[0], segs.slice(1), f, pos, 0, new Set()) });
          }
        }
        rows.push({ file: f, line: lineOf(src, pos), key, chains });
      }
    }
    return rows;
  }
  return { grade };
}

/* ---- SELF-TEST: the L1 shape must come out TAINTED, its neighbour CLEAN ---- */
{
  const fixture = new Map([
    ['db.js', `export function newId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }\n`],
    ['game.js', `export async function onFoodLogged(entry, { via = null } = {}) {\n  await award(\`log-\${entry.id}\`, 'log', 10, 'x', entry.date);\n  await award(\`firstlog-\${entry.date}\`, 'firstlog', 15, 'x', entry.date);\n  for (let n = 1; n <= 5; n++) await award(\`cap-\${d}-\${n}\`, 't', 1, 'x');\n}\n`],
    ['app.js', `b.addEventListener('click', async () => {\n  const copy = { ...src, id: newId(), date: S.date, ts: 5 };\n  await db.put('log', copy);\n  const game = await onFoodLogged(copy, { via: 'x' });\n});\n`],
  ]);
  const rows = makeTracer(fixture).grade();
  const byKey = k => rows.find(r => r.key.startsWith(k));
  const st = (k, chain) => byKey(k)?.chains.find(c => c.text === chain)?.res.state;
  ok('SELF the L1 shape (key <- param <- call site <- object literal <- newId()) is TAINTED', st('`log-', 'entry.id') === 'TAINTED',
    byKey('`log-')?.chains[0].res.trail.join(' -> '));
  ok('SELF a date read off the same parameter is not tainted', st('`firstlog-', 'entry.date') !== 'TAINTED', st('`firstlog-', 'entry.date'));
  ok('SELF a for-counter in the key is CLEAN', st('`cap-', 'n') === 'CLEAN', st('`cap-', 'n'));
}

/* ---- the SEED is derived: newId() really is a clock ---- */
const files = new Map();
const jsDir = path.join(ROOT, 'js');
for (const f of readdirSync(jsDir).filter(n => n.endsWith('.js'))) files.set(f, readFileSync(path.join(jsDir, f), 'utf8'));
const newIdBody = (files.get('db.js') || '').match(/export function newId\(\)\s*\{([^}]*)\}/);
ok('SEED js/db.js newId() is built from a clock or a random source (so treating it as one is derived, not asserted)',
  !!newIdBody && /\b(Date\.now|Math\.random|crypto\.randomUUID)\b/.test(newIdBody[1]), newIdBody ? newIdBody[1].trim().slice(0, 70) : 'newId not found');

/* ---- the real tree ---- */
const rows = makeTracer(files).grade();
const chains = rows.flatMap(r => r.chains);
const n = s => chains.filter(c => c.res.state === s).length;
ok('REACH the scanner found award call sites to grade', rows.length >= 20, `${rows.length} call sites across ${files.size} module(s), ${chains.length} identifier chains in their keys`);
ok('REACH the tracer resolves most chains (a broken regex reads as everything UNRESOLVED)', chains.length > 0 && n('UNRESOLVED') / chains.length <= 0.5,
  `${n('CLEAN')} clean, ${n('TAINTED')} tainted, ${n('UNRESOLVED')} unresolved`);
/* DECIDED, NOT HIDDEN. A key that derives from a clock through the identity of
   a PERSISTED entity the player creates once (a custom food's id is
   'c-' + newId(), js/app.js openFoodForm) is bounded by entities created
   through a form, not by taps on a button, and "once per food, ever" is the
   design of these two awards. They are still printed every run, matched on the
   exact key text so a changed key has to be re-decided, and they are not a
   pattern: a new key that reaches a clock is red until someone writes its
   reason here. Flagged in QA round A's report (2026-09-03) as a candidate for a
   per-day cap. */
const ALLOW = [
  { file: 'game.js', key: "`scan-${entry.date}-${entry.foodId || 'nofood'}`", why: 'per date per food; a custom food id is minted once per food the player creates' },
  { file: 'game.js', key: "`label-${entry.foodId || 'nofood'}`", why: 'once per food ever; a custom food id is minted once per food the player creates' },
];
const tainted = rows.filter(r => r.chains.some(c => c.res.state === 'TAINTED'));
const isAllowed = r => ALLOW.find(a => a.file === r.file && a.key === r.key);
if (!tainted.some(r => !isAllowed(r))) ok('PROVENANCE no award key resolves to a clock or a random source', true, `${chains.length} chains traced`);
for (const r of tainted) {
  const c = r.chains.find(c => c.res.state === 'TAINTED');
  const a = isAllowed(r);
  if (a) { ok(`ALLOWED ${r.file}:${r.line} ${r.key} reaches a clock through a persisted entity id`, true, `${a.why}; last hop: ${c.res.trail.at(-1)}`); continue; }
  ok(`PROVENANCE ${r.file}:${r.line} award key ${r.key.slice(0, 50)} resolves to a clock or random source, so award() can never dedupe it`, false,
    '\n       ' + c.res.trail.join('\n       -> '));
}
if (process.env.VERBOSE) for (const c of chains.filter(c => c.res.state === 'UNRESOLVED')) console.log('unresolved:', c.res.trail.join(' -> '));

console.log(out.join('\n'));
console.log(fails ? `\nFAIL (${fails})` : `\nall green, ${out.length} checks`);
process.exit(fails ? 1 : 0);
