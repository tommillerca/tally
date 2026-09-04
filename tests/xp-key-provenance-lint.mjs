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
 * QA ROUND 28 G2 (2026-09-04). The lint above was GREEN on the same bug spelled
 * through a callback: `run: e => award(`log-${e.id}`)` (js/game.js:881 on the
 * v470 tree, 00979897), because an anonymous callback's parameter resolved
 * UNRESOLVED and UNRESOLVED was tolerated (REACH allowed 50%, the tree sat at
 * 42%). Three changes, each printed in its trail:
 *   - a callback parameter is bound to the COLLECTION it iterates: the receiver
 *     of `.map/.forEach/.filter/...(p =>`, or the `items:` of the enclosing
 *     phase object; elementOf peels `.slice/.filter/.sort`, `[...X]`,
 *     `new Set(X)` and follows `X.map(p => body)` into body;
 *   - a callback parameter that STILL cannot be resolved is TAINTED unless the
 *     chain is date-shaped (last segment `date`): a row can hand a key its date
 *     and nothing else that is stable across calls;
 *   - a store read (`db.all/get/byIndex(`) is no longer a CLEAN terminal: `.id`
 *     of a row is newId() at its write site, TAINTED; other properties UNRESOLVED.
 * Named arrows (`const start = async (foeCfg) =>`, `const f = g =>`) were also
 * being double-bound as anonymous, hiding 14 foeCfg chains; fixed in defsOf.
 * REACH after the fix: 26 of 81 chains UNRESOLVED (32%; was 34, 42%). The row
 * now allows 35%, a two-chain margin; never lower it back.
 * PROVE-RED: `node tests/xp-key-provenance-lint.mjs <v470 tree>` reports
 * game.js:881 `log-${e.id}` TAINTED (e is a parameter of an anonymous callback
 * ... iterates log.slice(-400)), alongside the three L1 keys. Green on main.
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
/* The receiver expression ending just before `dot` (the `.` of `.map(`): walks
   back over identifier chains and balanced `(...)`/`[...]` groups, so both
   `log` in `log.map(` and `$$('[data-x]', body)` in `$$('[data-x]', body).forEach(`
   come back whole. QA round 28 G2. */
function receiverBefore(src, dot) {
  let j = dot - 1;
  while (j >= 0) {
    while (j >= 0 && /\s/.test(src[j])) j--;
    if (src[j] === ')' || src[j] === ']') {
      const close = src[j], open = close === ')' ? '(' : '[';
      let depth = 0;
      for (; j >= 0; j--) {
        if (src[j] === '"' || src[j] === "'" || src[j] === '`') { const q = src[j]; j--; while (j >= 0 && !(src[j] === q && src[j - 1] !== '\\')) j--; continue; }
        if (src[j] === close) depth++;
        else if (src[j] === open && --depth === 0) { j--; break; }
      }
      continue;
    }
    if (/[\w$]/.test(src[j])) { while (j >= 0 && /[\w$]/.test(src[j])) j--; if (src[j] === '.') { j--; continue; } break; }
    break;
  }
  return { expr: src.slice(j + 1, dot).trim(), at: j + 1 };
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
    const before = src.slice(Math.max(0, m.index - 120), m.index);
    /* QA round 28 G2 (1 of 3): `const start = async (foeCfg) =>` was bound TWICE,
       once by HEADERS[1] as a parameter of start() and once here as anonymous,
       and nearestDef took the later (anonymous) one, so every foeCfg key ended
       UNRESOLVED (14 chains). A parenthesised list that a named header already
       claimed is not re-added. */
    const named = before.match(new RegExp(String.raw`(?:const|let|var)?\s*(${ID})\s*=\s*(?:async\s*)?$`));
    if (m[1] && named) continue;
    // `export const f = g => ...` (js/social.js __testApplyGrant): a NAMED function with a bare parameter
    if (named) { add(m[2], { idx: m.index, kind: 'param', fn: named[1], index: 0 }); continue; }
    /* QA round 28 G2 (2 of 3): an anonymous callback's parameter is bound to the
       COLLECTION it iterates, so `e` in `log.map(e => ...)` or in a
       `{ items: X, run: e => ... }` phase object resolves through X. Two shapes,
       read off the tree: an array-method receiver, and the `items:` of the
       enclosing object literal (js/game.js runInitBackfill). Anything else stays
       an unbound anonymous parameter, which the tracer now grades TAINTED unless
       the chain is date-shaped (see resolveChainUncached). */
    let iter = null;
    const recv = before.match(/\.(?:map|forEach|filter|some|every|find|findIndex|flatMap|reduce)\(\s*(?:async\s*)?$/);
    if (recv) iter = receiverBefore(src, m.index - (before.length - recv.index));
    else if (/\b[\w$]+\s*:\s*(?:async\s*)?$/.test(before)) {
      const items = src.lastIndexOf('items', m.index);
      const open = items < 0 ? -1 : src.lastIndexOf('{', items);
      if (open >= 0 && /^items\s*:/.test(src.slice(items, items + 12)) && closeFrom(src, open + 1, '{', '}') > m.index) {
        const c = src.indexOf(':', items) + 1;
        iter = { expr: exprFrom(src, c), at: c + src.slice(c, c + 80).match(/^\s*/)[0].length };
      }
    }
    add(m[1] || m[2], { idx: m.index, kind: 'param', fn: null, index: 0, anonymous: true, iter });
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
    /* A STORE ROW (QA round 28 G2). `db.all('log')` used to fall through to
       "terminal expression, no source" and read CLEAN, so `const log = await
       db.all('log'); ... award(\`log-${row.id}\`)` was one refactor away from a
       silent green. A row's `.id` in this tree is minted by newId() at the write
       site (js/db.js keyPath 'id' stores: foods, log, inv), so it is TAINTED; any
       other property of a row is UNRESOLVED and counted, never CLEAN. */
    if (/^(?:await\s+)?db\.(?:all|get|byIndex)\s*\(/.test(expr)) {
      if (rest[0] === 'id') return r('TAINTED', `.id of a store row is newId() at its write site (${expr.slice(0, 40)})`);
      return r('UNRESOLVED', `property .${rest[0] ?? '?'} of a store row (${expr.slice(0, 40)})`);
    }
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
  /* ONE ELEMENT of a collection expression, with `rest` still to read off it.
     Peels what does not change the element (`.slice/.filter/.sort/.reverse/
     .concat(...)`, `[...X]`, `new Set(X)`, `Array.from(X)`), follows `X.map(p =>
     BODY)` into BODY with p bound (p's own def carries iter = X, indexed by
     defsOf), and hands anything else to resolveExpr. QA round 28 G2. */
  function elementOf(expr, rest, file, at, depth, seen) {
    const src = files.get(file);
    expr = expr.replace(/^await\s+/, '');
    if (depth > 16) return { state: 'UNRESOLVED', trail: ['depth'] };
    let m;
    if ((m = expr.match(/^\[\s*\.\.\.(.+)\]$/s)) && closeFrom(m[1], 0, '[', ']') === m[1].length) return elementOf(m[1].trim(), rest, file, at + expr.indexOf(m[1]), depth + 1, seen);
    if ((m = expr.match(/^(?:new\s+Set|Array\.from)\s*\((.+)\)$/s)) && closeFrom(m[1], 0, '(', ')') === m[1].length) return elementOf(m[1].trim(), rest, file, at + expr.indexOf(m[1]), depth + 1, seen);
    // trailing `.method(...)`: find the last top-level `.name(` whose parens run to the end
    for (let i = expr.length - 2; i > 0; i--) {
      if (expr[i] !== '(') continue;
      if (closeFrom(expr, i + 1, '(', ')') !== expr.length - 1) continue;
      const head = expr.slice(0, i).match(/\.([\w$]+)$/);
      if (!head) break;
      const recvText = expr.slice(0, i - head[0].length);
      if (/^(slice|filter|sort|reverse|concat|toSorted)$/.test(head[1])) return elementOf(recvText, rest, file, at, depth + 1, seen);
      if (head[1] === 'map' || head[1] === 'flatMap') {
        const arrow = expr.slice(i + 1, expr.length - 1).match(/^\s*(?:async\s*)?(?:\(\s*[\w$]+\s*\)|[\w$]+)\s*=>\s*/);
        if (!arrow) break;
        const bodyAt = at + i + 1 + arrow[0].length;
        let body = expr.slice(i + 1 + arrow[0].length, expr.length - 1).trim();
        if (body.startsWith('{')) return { state: 'UNRESOLVED', trail: [`${file}:${lineOf(src, at)} map body is a block`] };
        return resolveExpr(body, rest, file, bodyAt, depth + 1, seen);
      }
      break;
    }
    // a bare name for a collection (`items: dates`): an element of the LOCAL's initialiser, not the local itself
    if (isChain(expr) && !expr.includes('.')) {
      const def = nearestDef(src, expr, at);
      if (def && def.kind === 'local') return elementOf(def.expr, rest, file, def.at + src.slice(def.at, def.at + 80).match(/^\s*/)[0].length, depth + 1, seen);
    }
    return resolveExpr(expr, rest, file, at, depth + 1, seen);
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
      // positioned at the initialiser itself, so a `.map(p => ...)` body inside it can bind p (QA round 28 G2)
      const sub = resolveExpr(def.expr, rest, file, def.at + src.slice(def.at, def.at + 80).match(/^\s*/)[0].length, depth + 1, seen);
      return { state: sub.state, trail: [...trail, ...sub.trail] };
    }
    // parameter
    if (def.destructured) return r('UNRESOLVED', `${root} is destructured in a parameter list`);
    if (!def.fn) {
      /* QA round 28 G2: the hole. `run: e => award(\`log-${e.id}\`)` (js/game.js:881
         on the v470 tree, the L1 farm spelled through a phase callback) read
         UNRESOLVED here, and UNRESOLVED was tolerated, so the lint written for
         that exact bug was green on it. Now the parameter follows the collection
         it iterates (elementOf), and if that still cannot be resolved the chain
         is TAINTED unless it is date-shaped: a `.date` read is the one thing a
         row or a date list can hand a key that is stable across calls. */
      const sub = def.iter ? elementOf(def.iter.expr, rest, file, def.iter.at, depth + 1, seen) : null;
      if (sub && sub.state !== 'UNRESOLVED') return { state: sub.state, trail: [...trail, `param ${root} of a callback <- element of ${def.iter.expr.slice(0, 50)}`, ...sub.trail] };
      if (rest.at(-1) === 'date') return r('CLEAN', `${root}${rest.length ? '.' + rest.join('.') : ''}: date-shaped read off an anonymous callback parameter${sub ? ' (collection unresolved: ' + sub.trail.at(-1) + ')' : ''}`);
      return r('TAINTED', `${root} is a parameter of an anonymous callback the tracer cannot follow${def.iter ? ' (iterates ' + def.iter.expr.slice(0, 40) + ', ' + sub.trail.at(-1) + ')' : ''}, and .${rest.at(-1) ?? root} is not date-shaped: a per-row id here is a clock (QA round 28 G2)`);
    }
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
    /* QA round 28 G2: the v470 spelling of the same bug, through a phase
       callback whose parameter iterates store rows, beside its date-keyed
       neighbours (bare `d` over a dates list, `w.date` off a row). */
    ['init.js', `async function backfill() {\n  const log = await db.all('log');\n  const weights = await db.all('weights');\n  const dates = [...new Set(log.map(e => e.date))].sort();\n  const phases = [\n    { id: 'log', items: log.slice(-400), key: e => \`log-\${e.id}\`, run: e => award(\`rlog-\${e.id}\`, 'log', 10, 'x', e.date) },\n    { id: 'firstlog', items: dates, run: d => award(\`rfirst-\${d}\`, 'firstlog', 15, 'x', d) },\n    { id: 'weigh', items: weights.slice(-60), run: w => award(\`rweigh-\${w.date}\`, 'weigh', 15, 'x', w.date) },\n  ];\n}\n`],
  ]);
  const rows = makeTracer(fixture).grade();
  const byKey = k => rows.find(r => r.key.startsWith(k));
  const st = (k, chain) => byKey(k)?.chains.find(c => c.text === chain)?.res.state;
  ok('SELF the L1 shape (key <- param <- call site <- object literal <- newId()) is TAINTED', st('`log-', 'entry.id') === 'TAINTED',
    byKey('`log-')?.chains[0].res.trail.join(' -> '));
  ok('SELF a date read off the same parameter is not tainted', st('`firstlog-', 'entry.date') !== 'TAINTED', st('`firstlog-', 'entry.date'));
  ok('SELF a for-counter in the key is CLEAN', st('`cap-', 'n') === 'CLEAN', st('`cap-', 'n'));
  ok('SELF G2: a callback parameter iterating store rows, keyed on .id, is TAINTED', st('`rlog-', 'e.id') === 'TAINTED',
    byKey('`rlog-')?.chains[0].res.trail.at(-1));
  ok('SELF G2: a bare callback parameter over a dates list is CLEAN', st('`rfirst-', 'd') === 'CLEAN', byKey('`rfirst-')?.chains[0].res.trail.at(-1));
  ok('SELF G2: a .date read off a row callback parameter is CLEAN', st('`rweigh-', 'w.date') === 'CLEAN', byKey('`rweigh-')?.chains[0].res.trail.at(-1));
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
/* 0.35, not 0.5 (QA round 28 G2): the tree resolves 68% (26 of 81 UNRESOLVED,
   all loop items or params whose call sites hand an object without the property,
   every one printed under VERBOSE). A hole that hides behind UNRESOLVED now has a
   two-chain margin to hide in, not a nineteen-chain one. Never raise this back. */
ok('REACH the tracer resolves most chains (a broken regex reads as everything UNRESOLVED)', chains.length > 0 && n('UNRESOLVED') / chains.length <= 0.35,
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
