/* TAUTOLOGY AUDIT: assertions that cannot fail, found by structure.
 *
 * WHY THIS EXISTS. tests/gate-audit.mjs was described in the release gate as
 * "hunts guards that cannot fail". It does not. It checks exactly one shape,
 * that an {ok} result object is tested via `.ok` and never for truthiness, and
 * it exits 0 on a tree that provably carried two guards that could not fail.
 * A description that claims more reach than the tool has is the same defect the
 * gate warns about one level up: it reads as coverage.
 *
 * THE THREE INSTANCES THAT DEFINED THIS FILE, all reproduced and measured
 * before a line of it was written:
 *
 *   1. tests/fight-tray-audit.mjs, CLIP and AFFORDANCE. Both are written
 *      `<the defect is absent> || <the app announced the defect>`. The second
 *      disjunct is a CSS class the app itself toggles from the same overflow
 *      the first disjunct measures (js/app.js:15634), so whenever the antecedent
 *      fires the escape fires with it. MEASURED: with `.fight-actions` squeezed
 *      to max-height:90px the tray hid 138px with 5 buttons past the edge, and
 *      the audit printed 22/22 and exited 0.
 *
 *   2. tests/fight-layout-audit.mjs at gwart/layout d7b9e65, COMPOSE. inkOf()
 *      screenshots with `clip` set to the ARENA'S OWN RECT, so every pixel it
 *      can possibly find is inside the arena by construction, and then asserts
 *      the ink is inside the arena. MEASURED: with the boss translated 130px up
 *      so the arena cut his head off, boss ink at 375x667 fell 38395 -> 1636 and
 *      COMPOSE still printed PASS "2.1px is the tightest clearance", exit 0.
 *
 *   3. An empty sample set treated as a pass. `xs.filter(bad).length === 0` is
 *      true when nothing was collected, so a selector that stopped matching
 *      turns a guard green. Several audits have SETUP gates for exactly this;
 *      the ones that do not are what rule V reports.
 *
 * FOUR RULES, EACH DECIDABLE, EACH NARROW ON PURPOSE. This file makes no claim
 * to decide "can this assertion fail" in general, which is undecidable. It
 * decides four specific structural questions:
 *
 *   K  CONSTANT     the pass expression is constant whatever the branch above it
 *                   decided: `xs.length >= 0`, `n > -1` on a count, `x || !x`.
 *                   Deliberately NOT `ok(name, true)`, which is a legitimate
 *                   idiom here; see the note at rule K for why and what it costs.
 *   V  VACUOUS      the pass expression is `filter(...).length === 0`,
 *                   `every(...)` or `!some(...)` over a collection the audit
 *                   gathered from the page, and NO assertion in the file
 *                   demands that collection be non-empty.
 *   C  CLIPPED      the measurement was restricted to element E's own rect (a
 *                   screenshot `clip`) and an assertion then bounds the result
 *                   by E. The domain is the bound; the answer is arithmetic.
 *   E  ESCAPE       the assertion is `A || B`, B reads a state the APP derives
 *                   from the same element A measures (a class the app toggles
 *                   from a DOM metric, or a CSS property that class controls).
 *                   An escape clause computed from the antecedent's own subject
 *                   is not independent evidence; it is the antecedent again.
 *
 * WHAT THIS FILE PROVABLY CANNOT DETECT, stated so nobody reads it as more:
 *   - a guard whose assertion is honest but whose SETUP never reaches the state
 *     it means to grade (a fight that never opened, a sheet that never mounted).
 *     Rule V catches the collection-shaped half of that and nothing else.
 *   - a bound that is real but too loose to fire on the actual defect
 *     (fight-layout's old "arena >= 258" passed a decapitated boss). That is a
 *     wrong NUMBER, not a wrong SHAPE, and only mutation can see it: see
 *     tests/mutation-sweep.mjs.
 *   - any tautology whose two halves are linked through the app in a way that is
 *     not a class flag or a screenshot clip. Rule E's provenance chain is
 *     metric -> classList.toggle -> app.css, and it is blind outside it.
 *   - anything at all in an audit whose assertions do not go through a call
 *     named ok(...) or check(...). Both idioms are used repo-wide; a third
 *     would be invisible here, so the SELF-COVERAGE block below fails if the
 *     share of tests/ files this parser understands ever drops.
 *
 * PROVE-RED (all four confirmed and measured; the PROOF block at the bottom of
 * this file carries the exact commands, counts and exit codes):
 *   K  append `ok('x', hits.length >= 0, 'inert')` to glyph-audit; named, exit 1.
 *   V  delete melt-ui-audit's `an empty row sample is a failure` check; two rows
 *      report, and restoring it silences both.
 *   C  `git show d7b9e65:tests/fight-layout-audit.mjs` into tests/; one finding.
 *   E  shipped main, nothing edited: fight-tray-audit CLIP and AFFORDANCE.
 *
 * Usage: node tests/tautology-audit.mjs          (reads sources; no browser)
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TESTS = path.join(ROOT, 'tests');
const JSDIR = path.join(ROOT, 'js');

/* Files that assert nothing about the app, so they carry no assertions to grade.
   Kept identical in spirit to release-gate's HELPERS: a short list, each with a
   reason, rather than a pattern that could swallow a real guard by accident. */
const NOT_A_CHECK = new Set([
  'godmode.js',        // the harness
  'fight-sim.mjs',     // a sim library
  'release-gate.mjs',  // the runner
  'tautology-audit.mjs', // this file
  'mutation-sweep.mjs',  // the runtime half of this pair
  'reap-orphans.mjs',  // a maintenance tool
  'ui-audit.js',       // pasted into the console, not a node entry point
]);

// ---------------------------------------------------------------- parsing ---

/* Split a call's argument list at TOP-LEVEL commas only. Assertion conditions in
   this repo routinely contain object literals, arrow functions and template
   strings with commas inside them, so a plain split(',') mis-reads roughly one
   assertion in four. */
function splitArgs(text) {
  const out = [];
  let depth = 0, start = 0, q = null, tick = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i], p = text[i - 1];
    if (q) { if (c === q && p !== '\\') q = null; continue; }
    if (c === '`' && p !== '\\') { tick ^= 1; continue; }
    if (tick) continue;
    if (c === '"' || c === "'") { q = c; continue; }
    if ('([{'.includes(c)) depth++;
    else if (')]}'.includes(c)) depth--;
    else if (c === ',' && depth === 0) { out.push(text.slice(start, i)); start = i + 1; }
  }
  out.push(text.slice(start));
  return out;
}

/* Find every `name(...)` call and return its raw argument text, by scanning for
   the matching close paren rather than by regex, for the same reason as above. */
function callsOf(src, name) {
  const out = [];
  const re = new RegExp(`(?<![\\w$.])${name}\\s*\\(`, 'g');
  let m;
  while ((m = re.exec(src))) {
    let i = m.index + m[0].length, depth = 1, q = null, tick = 0;
    for (; i < src.length && depth; i++) {
      const c = src[i], p = src[i - 1];
      if (q) { if (c === q && p !== '\\') q = null; continue; }
      if (c === '`' && p !== '\\') { tick ^= 1; continue; }
      if (tick) continue;
      if (c === '"' || c === "'") { q = c; continue; }
      if ('([{'.includes(c)) depth++;
      else if (')]}'.includes(c)) depth--;
    }
    out.push({ index: m.index, args: src.slice(m.index + m[0].length, i - 1) });
  }
  return out;
}

const lineAt = (src, idx) => src.slice(0, idx).split('\n').length;

/* Top-level `||` split, used by rule E. Same balance rules as splitArgs. */
function splitOr(text) {
  const out = [];
  let depth = 0, start = 0, q = null, tick = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i], p = text[i - 1];
    if (q) { if (c === q && p !== '\\') q = null; continue; }
    if (c === '`' && p !== '\\') { tick ^= 1; continue; }
    if (tick) continue;
    if (c === '"' || c === "'") { q = c; continue; }
    if ('([{'.includes(c)) depth++;
    else if (')]}'.includes(c)) depth--;
    else if (c === '|' && text[i + 1] === '|' && depth === 0) { out.push(text.slice(start, i)); start = i + 2; i++; }
  }
  out.push(text.slice(start));
  return out.map(s => s.trim()).filter(Boolean);
}

/* DEFINITIONS, for the backward slice. `const x = <rhs>` where the rhs may span
   lines and may be an object literal or an await. Also object-literal FIELDS
   (`arena: g('.arena')`), because the repo's audits overwhelmingly return one
   object out of page.evaluate and then read its fields, so a slice that cannot
   cross that boundary sees nothing. */
/* EVERY DEFINITION IS CAPPED AT 300 CHARACTERS, and that cap is the difference
   between a slice and a smear. Half the audits in tests/ are one giant
   `const m = await page.evaluate(() => { ...forty lines... })`, so storing the
   whole right-hand side makes every identifier inside that block look like the
   provenance of every field read off it: on the first run rule C fired 34 times
   and rule E blamed the wrong class, purely from that. 300 keeps the leading
   `document.querySelector('#factions')` (which is the element identity the rules
   need) and drops the body (which is forty unrelated measurements). The body is
   not lost: the object-literal pass below indexes its FIELDS by name, which is
   how `m.hidden` still resolves to `tray.scrollHeight - tray.clientHeight`. */
const DEF_CAP = 300;

function definitions(src) {
  const defs = new Map();
  const push = (k, v, at) => {
    if (!k) return;
    const prev = defs.get(k) || [];
    prev.push({ text: v.slice(0, DEF_CAP), line: lineAt(src, at) });
    defs.set(k, prev);
  };

  const declRe = /(?:^|[;{}\n])\s*(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/g;
  let m;
  while ((m = declRe.exec(src))) {
    // take to the end of the statement: balanced to depth 0 then `;` or newline
    let i = declRe.lastIndex, depth = 0, q = null, tick = 0, end = i;
    for (; i < src.length; i++) {
      const c = src[i], p = src[i - 1];
      if (q) { if (c === q && p !== '\\') q = null; continue; }
      if (c === '`' && p !== '\\') { tick ^= 1; continue; }
      if (tick) continue;
      if (c === '"' || c === "'") { q = c; continue; }
      if ('([{'.includes(c)) depth++;
      else if (')]}'.includes(c)) { if (depth === 0) break; depth--; }
      else if (depth === 0 && (c === ';' || c === '\n')) { end = i; break; }
      end = i + 1;
    }
    push(m[1], src.slice(declRe.lastIndex, end), m.index);
  }

  /* object-literal fields: `name: <expr>` up to the next top-level comma. Keyed
     by the BARE field name, so `m.hidden` and `frame.arena` both resolve. */
  const fieldRe = /(?:[{,]\s*|^\s*)([A-Za-z_$][\w$]*)\s*:\s*(?!\s)/gm;
  while ((m = fieldRe.exec(src))) {
    const rest = src.slice(fieldRe.lastIndex, fieldRe.lastIndex + 400);
    push(m[1], splitArgs(rest)[0] || '', m.index);
  }
  return defs;
}

/* BACKWARD SLICE. Expand every identifier in `expr` through `defs`, four hops
   deep, and return the union of the text seen. Four is not arbitrary: the
   deepest real chain in the validation set is
   worst <- over <- frame.arena / ink.box <- clip <- querySelector('.arena'),
   which is four, and going deeper drags in most of a file and turns every rule
   into noise. Cycles are cut by the `seen` set. */
function slice(expr, defs, depth = 4, window = null) {
  let text = expr;
  const seen = new Set();
  const near = d => !window || (d.line <= window.line && d.line >= window.line - window.back);
  for (let d = 0; d < depth; d++) {
    let added = '';
    for (const id of text.match(/[A-Za-z_$][\w$]*/g) || []) {
      if (seen.has(id)) continue;
      seen.add(id);
      for (const t of defs.get(id) || []) if (near(t)) added += '\n' + t.text;
    }
    if (!added) break;
    text += added;
  }
  return text;
}

// ------------------------------------------------- app-side provenance (E) ---

const METRICS = ['scrollHeight', 'clientHeight', 'offsetHeight', 'scrollWidth',
  'clientWidth', 'offsetWidth', 'scrollTop', 'scrollLeft'];

/* Every class the APP toggles from a DOM metric, with the element it lives on.
   These are the "affordance flags": the app measured something and wrote the
   answer into the DOM. An audit that measures the same thing and then accepts
   the flag as its escape hatch has asked the same question twice. */
function metricFlags() {
  const flags = [];
  if (!existsSync(JSDIR)) return flags;
  for (const f of readdirSync(JSDIR).filter(x => x.endsWith('.js'))) {
    const src = readFileSync(path.join(JSDIR, f), 'utf8');
    const defs = definitions(src);
    const re = /([A-Za-z_$][\w$.]*)\.classList\.(?:toggle|add|remove)\(\s*['"]([\w-]+)['"]\s*(?:,([^;]*?))?\)/g;
    let m;
    while ((m = re.exec(src))) {
      const [, target, cls, cond] = m;
      if (!cond) continue;
      /* SCOPED, not file-wide. app.js is 15k lines and `const on = ...` is
         redefined dozens of times, so a file-wide slice made `toggle('on', on)`
         look metric-derived 50 times over and inflated the watched-flag count
         from 2 to 52. Only definitions in the 60 lines above the toggle count,
         which is the size of a render function here. */
      const win = { line: lineAt(src, m.index), back: 60 };
      const kernel = METRICS.filter(k => slice(cond, defs, 3, win).includes(k));
      if (!kernel.length) continue;
      /* which element? follow the target name to an id or a selector string. */
      /* The ELEMENT binding gets a wider window than the metric. `const factions
         = el('factions')` sits at js/app.js:15479 and the toggle it feeds is at
         :15635, 156 lines below, at the top of the same render function: a
         60-line window resolved the id to null and rule E went silent on the
         instance it was written for. The kernel must be local (that is the
         measurement); the element handle only has to be in the same function. */
      const owner = slice(target, defs, 3, { line: win.line, back: 400 });
      const id = owner.match(/(?:getElementById|el)\(\s*['"]([\w-]+)['"]/)?.[1]
        || owner.match(/querySelector(?:All)?\(\s*['"]#([\w-]+)['"]/)?.[1] || null;
      flags.push({ file: f, line: lineAt(src, m.index), cls, kernel, id, target });
    }
  }
  return flags;
}

/* Which CSS properties a flag class controls, so an audit reading the RENDERED
   property (getComputedStyle(...).maskImage) is recognised as reading the flag
   by another name. Instance 1's escape is `scrolls && masked`, and `masked` is
   exactly this second spelling of the same bit. */
function classProps(classes) {
  const css = path.join(ROOT, 'app.css');
  const out = new Map(classes.map(c => [c, new Set()]));
  if (!existsSync(css)) return out;
  const src = readFileSync(css, 'utf8');
  const re = /([^{}]+)\{([^}]*)\}/g;
  let m;
  while ((m = re.exec(src))) {
    const sel = m[1];
    for (const c of classes) {
      if (!new RegExp(`\\.${c}\\b`).test(sel)) continue;
      for (const p of m[2].split(';')) {
        const k = p.split(':')[0].trim();
        if (k) out.get(c).add(k.replace(/^-webkit-/, '').replace(/-([a-z])/g, (_, ch) => ch.toUpperCase()));
      }
    }
  }
  return out;
}

// ------------------------------------------------------------------ rules ---

/* THE DERIVATION CHAIN of a collection: `dropped <- ordinary <- rows`. Used both
   to find the SOURCE a sub-cohort was filtered out of, and to spread a gate
   upstream: error-telemetry gates `As.length >= 1` where As <- live <- q, and
   without the spread all three read as ungated. */
function ancestry(name, defs, hops = 5) {
  const chain = [name];
  let cur = name;
  for (let h = 0; h < hops; h++) {
    const via = ((defs.get(cur) || [])[0]?.text || '')
      .match(/^\s*([A-Za-z_$][\w$.]*)\s*\.\s*(?:map|slice|flat|flatMap|concat|sort|filter|find)\s*\(/);
    if (!via) break;
    cur = via[1].split('.').pop();
    if (chain.includes(cur)) break;
    chain.push(cur);
  }
  return chain;
}

const findings = [];
const note = (rule, file, line, name, why) => findings.push({ rule, file, line, name, why });

const FLAGS = metricFlags();
const FLAG_PROPS = classProps([...new Set(FLAGS.map(f => f.cls))]);

const files = readdirSync(TESTS)
  .filter(f => /\.(mjs|js)$/.test(f) && !NOT_A_CHECK.has(f))
  .sort();

let parsed = 0, assertions = 0;

for (const file of files) {
  const src = readFileSync(path.join(TESTS, file), 'utf8');
  const defs = definitions(src);
  const asserts = [...callsOf(src, 'ok'), ...callsOf(src, 'check')]
    .map(c => ({ line: lineAt(src, c.index), parts: splitArgs(c.args) }))
    .filter(c => c.parts.length >= 2);
  if (!asserts.length) continue;
  parsed++;
  assertions += asserts.length;

  /* Which collections does THIS file demand be non-empty? Only an assertion
     counts. `if (!xs.length) continue;` is a skip, not a gate, and skipping
     quietly is the failure mode rule V exists to name. */
  const gated = new Set();
  const lengthGated = new Set();
  for (const a of asserts) {
    const cond = a.parts[1];
    /* `> 0` HAS TO BE IN HERE. The first version wrote the numeric class as
       [1-9] and so did not match `cohort.length > 0`, which is the single most
       common way this repo spells the gate: art-register-audit's own row is
       literally named "an empty cohort is a FAILURE, not a pass" and rule V
       reported it as ungated. A guard that cannot see the guard it is looking
       for is the joke this whole file is about. */
    for (const g of cond.matchAll(/([A-Za-z_$][\w$.]*)\.length\s*(?:>=?\s*[1-9]|>\s*0|!==?\s*0|===?\s*[1-9])/g)) { gated.add(g[1].split('.').pop()); lengthGated.add(g[1].split('.').pop()); }
    /* A SIBLING COUNT GATES ITS OBJECT. crew-fan reads one evaluate into
       `{ cards, ids }` and asserts `fanOn.cards > 0`; the collection it then
       sweeps is `fanOn.ids`. Textually those are different names, but the
       assertion did state that this sample is non-empty, which is the whole
       question rule V asks. Keyed on the OBJECT root, so a gate on one evaluate
       result cannot vouch for a different one. */
    for (const g of cond.matchAll(/([A-Za-z_$][\w$]*)\.([\w$]+)\s*(?:>\s*0|>=\s*[1-9])/g)) gated.add('@' + g[1]);
    /* `rows.length === RANKS.length` gates rows, but ONLY if RANKS is a literal
       list with something in it. Comparing two lengths that can both be zero
       gates nothing, and endless-look's SAMPLE row is the case that made the
       difference worth writing down. */
    for (const g of cond.matchAll(/([A-Za-z_$][\w$.]*)\.length\s*===?\s*([A-Za-z_$][\w$.]*)\.length/g)) {
      const other = ((defs.get(g[2].split('.').pop()) || [])[0]?.text || '').trim();
      if (/^\[[^\]]+\]/.test(other)) gated.add(g[1].split('.').pop());
    }
    for (const g of cond.matchAll(/([A-Za-z_$][\w$.]*)\.length\s*&&/g)) gated.add(g[1].split('.').pop());
    // `!!m.btns.length` and bare `xs.length` as the whole condition
    for (const g of cond.matchAll(/!!\s*([A-Za-z_$][\w$.]*)\.length/g)) gated.add(g[1].split('.').pop());
    if (/^\s*!?!?\s*[A-Za-z_$][\w$.]*\.length\s*$/.test(cond)) gated.add(cond.trim().replace(/^!+/, '').split('.').pop());
    /* A POSITIVE EXISTENCE CLAIM IS A NON-EMPTINESS GATE, and missing that was
       rule V's second-worst false positive. out-there-audit asserts `no Glutton
       row` and `no Puffer Pack row` over card.rows, and three lines later asserts
       `the cosmetics drop row is there` as `card.rows.some(r => /teaser/...)`,
       which is FALSE on an empty rows. The set is gated; it is just gated by a
       sibling assertion rather than by a length. Only an UNNEGATED some() counts:
       `!xs.some(bad)` is the vacuous shape itself. */
    for (const g of cond.matchAll(/(?:^|[^!\w$.])([A-Za-z_$][\w$.]*)\.(?:some|find)\s*\(/g)) gated.add(g[1].split('.').pop());
  }
  /* `X.length === Y.length` GATES X WHENEVER Y IS GATED, to a fixpoint.
     year-readout asserts `withVal.length === 12` and then `readouts.length ===
     withVal.length`, which together pin readouts at 12. Reading only the first
     of those called readouts ungated and reported a guard that is in fact
     gated, one assertion away. */
  const eqPairs = [...src.matchAll(/([A-Za-z_$][\w$.]*)\.length\s*===?\s*([A-Za-z_$][\w$.]*)\.length/g)]
    .map(x => [x[1].split('.').pop(), x[2].split('.').pop()]);
  for (let pass = 0; pass < 4; pass++) for (const [a, b] of eqPairs) {
    if (gated.has(b)) gated.add(a);
    if (gated.has(a)) gated.add(b);
  }

  /* SPREAD EACH GATE UP ITS OWN DERIVATION CHAIN. A gate on a descendant is a
     gate on every ancestor: if `As.length >= 1` holds and As came from
     live.filter(), then live was not empty and neither was q. */
  for (const g of [...gated]) for (const a of ancestry(g, defs)) gated.add(a);
  for (const g of [...lengthGated]) for (const a of ancestry(g, defs)) lengthGated.add(a);

  /* AND GATE BY SELECTOR, NOT ONLY BY NAME. melt-ui asserts `an empty row sample
     is a failure, not a pass` over rowsProbe, and then sweeps `rows` in a
     LATER, separate page.evaluate. Different variables, different evaluates,
     but `[...document.querySelectorAll('.melt-row')]` both times: the sample
     source is the same DOM query and it has already been asserted non-empty.
     Without this the rule reported a guard whose non-emptiness gate is sitting
     forty lines above it. The residual risk is real and worth naming: the two
     evaluates run at different moments, so a state change between them could
     empty the second while the first passed. Rule V cannot see time. */
  /* SEEDED ONLY FROM NAMES GATED BY AN EXPLICIT LENGTH, and only from their
     DECLARATION. Seeding it from every gated name pulled in the sibling-object
     gates, whose names are things like `r`, and `r` is re-declared inside half
     the page.evaluate bodies in a file: one of those happened to contain
     `.melt-row`, so melt-ui vouched for its own sample through a variable that
     has nothing to do with it, and the rule stayed silent with its gate deleted.
     A one-letter local is not evidence about a DOM query. */
  const gatedSel = new Set();
  for (const g of lengthGated) {
    const d = (defs.get(g) || [])[0];
    if (!d) continue;
    for (const q of d.text.matchAll(/querySelectorAll\(\s*['"]([^'"]+)['"]/g)) gatedSel.add(q[1]);
  }

  /* A hard stop counts too: an audit that exits or throws on an empty set has
     made empty a failure, which is the rule. */
  for (const g of src.matchAll(/if\s*\(\s*!\s*([A-Za-z_$][\w$.]*)\.length\s*\)\s*(?:\{[^}]*)?(?:throw|process\.exit)/g)) gated.add(g[1].split('.').pop());

  /* ---- C: the measurement domain IS the assertion bound (FILE level) -----
     REPORTED PER FILE, NOT PER ASSERTION, and that is a deliberate retreat. The
     assertion-level version needed a backward slice through object fields, and
     field names in these audits are `top`, `bottom`, `height`, `x`: indexing
     them globally smeared every assertion in a file into every other one, so on
     d7b9e65's fight-layout-audit it reported 12 assertions where 2 are wrong.
     Reporting at 12 when the answer is 2 is noise, and noise in a gate teaches
     people to skip the gate.
     The MECHANISM is what is decidable, and it lives in one function, so that is
     what gets named. Four facts, each a line number the reader can open:
       1. a page.screenshot() whose clip is a variable,
       2. that clip is built from element E's own getBoundingClientRect,
       3. the pixel result is re-based onto the clip's origin (`clip.y + ...`),
          so no coordinate it produces can leave E,
       4. E's rect is read a SECOND time, somewhere else, as a bound.
     Together those say: this file measures inside E and then asks whether the
     measurement is inside E. Which assertion does it is left to the reader,
     because the honest answer is "all of the containment ones". */
  if (/screenshot\s*\(/.test(src)) {
    const shotLine = (src.match(/[\s\S]*?screenshot\s*\(\s*\{[^})]*clip/) || [''])[0];
    if (shotLine) {
      const shotAt = lineAt(src, shotLine.length);
      for (const d of defs.get('clip') || []) {
        const sel = d.text.match(/querySelector(?:All)?\(\s*['"]([^'"]+)['"]\s*\)\s*\.getBoundingClientRect/)?.[1];
        if (!sel) continue;
        const rebase = src.match(new RegExp("clip\\s*\\.\\s*(?:x|y|left|top)\\s*\\+"));
        if (!rebase) continue;
        const rebaseAt = lineAt(src, src.indexOf(rebase[0]));
        /* the SECOND read of the same element's rect: the bound. Must not be the
           clip binding itself, or a file that clips to E and never compares to E
           reads as a tautology it does not have. */
        const esc = sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const reads = [...src.matchAll(new RegExp(`['"]${esc}['"]`, 'g'))]
          .map(x => lineAt(src, x.index))
          .filter(l => Math.abs(l - d.line) > 2);
        if (!reads.length) continue;
        note('C', file, shotAt, 'the pixel measurement itself',
          `screenshot clip is \`${sel}\`'s own rect (line ${d.line}) and the result is re-based onto that clip's origin (line ${rebaseAt}), so no coordinate it returns can lie outside \`${sel}\`. \`${sel}\` is read again at line ${reads[0]} as a bound. Any containment assertion against \`${sel}\` in this file is arithmetic, not evidence`);
        break;
      }
    }
  }

  for (const { line, parts } of asserts) {
    const name = (parts[0] || '').trim().slice(0, 72).replace(/\s+/g, ' ');
    const cond = parts[1].trim();

    /* ---- K: the pass expression is a literal truth ------------------------
       NOT `ok(name, true)`. That is a legitimate idiom in this repo: figure-audit
       throws, selector-audit calls process.exit(2), and redeem-audit sits in an
       `else if`, all BEFORE the ok() line, so the branch has already decided and
       the literal is a report, not an assertion. Flagging it printed five reds,
       none of them real. The cost of the exclusion is stated plainly: a genuinely
       inert top-level `ok(name, true)` is invisible to rule K. Deciding which is
       which needs control flow, and a rule that guesses is worse than a rule with
       a hole in it that says so. What K keeps is the arithmetic that is constant
       whatever the branch: a length is never negative, and x || !x is a law. */
    const K = [
      [/^[A-Za-z_$][\w$.]*\.length\s*>=\s*0$/, 'a length is never negative'],
      [/^[A-Za-z_$][\w$.]*\.length\s*>\s*-1$/, 'a length is never negative'],
      [/^[A-Za-z_$][\w$.]*(?:\.length|Count|\.size)\s*>=\s*0$/, 'a count is never negative'],
    ].find(([re]) => re.test(cond));
    if (K) { note('K', file, line, name, `pass expression is constant: ${K[1]} (${cond.slice(0, 60)})`); continue; }
    const ors = splitOr(cond);
    if (ors.length === 2) {
      const [a, b] = ors.map(s => s.replace(/[()\s]/g, ''));
      if (b === '!' + a || a === '!' + b) { note('K', file, line, name, `\`${cond.slice(0, 60)}\` is x || !x`); continue; }
    }

    // ---- V: vacuously true on an empty collection ---------------------------
    let root = null;
    let m2 = cond.match(/^([A-Za-z_$][\w$.]*)\s*\.\s*(?:filter|findAll)\s*\([\s\S]*\)\s*\.length\s*===?\s*0$/)
      || cond.match(/^!\s*([A-Za-z_$][\w$.]*)\s*\.\s*(?:filter)\s*\([\s\S]*\)\s*\.length$/)
      || cond.match(/^([A-Za-z_$][\w$.]*)\s*\.\s*every\s*\([\s\S]*\)$/)
      || cond.match(/^!\s*([A-Za-z_$][\w$.]*)\s*\.\s*some\s*\([\s\S]*\)$/);
    if (!m2) {
      // the same shape one variable removed: `const bad = xs.filter(...)` then `bad.length === 0`
      const v = cond.match(/^([A-Za-z_$][\w$.]*)\.length\s*===?\s*0$/) || cond.match(/^!\s*([A-Za-z_$][\w$.]*)\.length$/);
      if (v) {
        /* THE DECLARATION, NOT EVERY BINDING OF THE NAME. defs indexes object
           literal FIELDS by their bare name as well as declarations, and short
           names collide across a 400-line audit: `dead` is declared `const dead
           = []` in suite-rot and also appears as a field `dead: [...]` inside a
           scanner's return, so merging both traced an accumulator to a token
           list in an unrelated function. Declarations are pushed first, so [0]
           is the declaration whenever there is one. */
        const rhs = ((defs.get(v[1].split('.').pop()) || [])[0]?.text) || '';
        const via = rhs.match(/([A-Za-z_$][\w$.]*)\s*\.\s*filter\s*\(/);
        if (via) m2 = [null, via[1]];
      }
    }
    if (m2) {
      root = m2[1].split('.').pop();
      const rootDef = (defs.get(root) || []).map(d => d.text).join('\n');
      /* CHASE THE ROOT THROUGH map/slice/flat. year-readout builds
         `whens = readouts.map(r => r.when)` and the non-emptiness gate, if there
         were one, would be written about `readouts`. Looking only at `whens`
         would call a gated set ungated. */
      const chain = ancestry(root, defs);
      /* ERROR ACCUMULATORS ARE NOT SAMPLES. `errors.filter(known).length === 0`
         is not "we examined nothing", it is "nothing went wrong", and empty is
         the SUCCESS state rather than the missing-evidence state. godmode's
         harness hands every audit an `errors` array of exactly this kind, so
         without this exclusion rule V reports a red on the healthiest possible
         run. The cost: a genuinely broken error CAPTURE would look like a clean
         run to rule V. That is a real hole and it is stated rather than closed,
         because closing it needs to know whether the collector ran, which is not
         in the text. */
      const ACCUMULATOR = /^(errors?|pageErrors|consoleErrors|fails|failures|problems|violations|warnings)$/i;
      const isAccumulator = chain.some(c => ACCUMULATOR.test(c));
      /* Only page-derived collections. A local literal array is a fixture the
         author wrote down, and asserting `every` over it is not a vacuity risk
         because its length is on the page in front of you. */
      const fromPage = /querySelectorAll|page\.\$\$|page\.evaluate|\.map\(|\.filter\(|Array\.from|\[\.\.\./.test(rootDef)
        || /^\s*\[\s*\]/.test(rootDef) === false && rootDef.trim() === '' /* a field of an evaluate result */;
      const literal = /^\s*\[[^\]]*\]\s*$/.test(rootDef.trim());
      const selOf = new Set();
      for (const c of chain) for (const d of defs.get(c) || [])
        for (const q of d.text.matchAll(/querySelectorAll\(\s*['"]([^'"]+)['"]/g)) selOf.add(q[1]);
      const selGated = [...selOf].some(x => gatedSel.has(x));
      /* A FIXED-COUNT LOOP CANNOT PRODUCE AN EMPTY SET. glutton pushes exactly
         twice: `for (let i = 0; i < 2; i++) out.push(await claimGluttonWin(...))`.
         If that call throws, page.evaluate rejects and the audit dies loudly,
         which is the opposite of a quiet vacuous pass, so there is nothing here
         to report. The bound has to be a LITERAL: `i < n` proves nothing. */
      const fixedLoop = new RegExp(`for\\s*\\([^)]*<\\s*[1-9]\\d*\\s*;[^)]*\\)[\\s\\S]{0,200}?\\b${root}\\.push\\(`).test(src);
      const objRoot = m2[1].includes('.') ? m2[1].split('.')[0] : null;
      const siblingGated = objRoot ? gated.has('@' + objRoot) : false;
      if (fromPage && !literal && !isAccumulator && !siblingGated && !selGated && !fixedLoop && !chain.some(c => gated.has(c))) {
        note('V', file, line, name, `passes when \`${chain[chain.length - 1]}\` is EMPTY, and no assertion in this file requires it to be non-empty` + (chain.length > 1 ? ` (reached as ${chain.reverse().join(' -> ')})` : ''));
        continue;
      }
    }

    // ---- E: the escape clause is derived from the antecedent's subject ------
    if (ors.length >= 2 && FLAGS.length) {
      const cands = [];
      for (let i = 0; i < ors.length; i++) {
        const escSl = slice(ors[i], defs);
        for (const flag of FLAGS) {
          /* NAMED beats INFERRED. `contains('scrolls')` says which flag by name;
             a getComputedStyle read of maskImage only says "a property some flag
             controls", and .scrolls and .scrolls.at-end both control maskImage.
             Ranking them let the first run blame at-end for scrolls's tautology,
             which is a true finding pointing at the wrong line. */
          const named = new RegExp(`contains\\(\\s*['"]${flag.cls}['"]`).test(escSl);
          const viaCss = [...FLAG_PROPS.get(flag.cls) || []]
            .some(p => new RegExp(`(?:getComputedStyle|computedStyle)[\\s\\S]{0,200}\\b${p}\\b`).test(escSl));
          if (!named && !viaCss) continue;
          const others = ors.filter((_, j) => j !== i).join(' && ');
          const antSl = slice(others, defs);
          /* is the antecedent measuring the SAME element the flag is derived
             from? by id, or by the same variable name the app uses. */
          const sameEl = flag.id
            ? new RegExp(`['"]#?${flag.id}['"]`).test(antSl) || new RegExp(`\\b${flag.id}\\b`).test(antSl)
            : false;
          if (!sameEl) continue;
          /* the escape must not ALSO be what the antecedent reads, or the two
             halves are the same text and this is a parse artefact, not a finding */
          if (named && new RegExp(`contains\\(\\s*['"]${flag.cls}['"]`).test(antSl)) continue;
          cands.push({ flag, sameKernel: flag.kernel.every(k => antSl.includes(k)), others, rank: named ? 0 : 1 });
        }
      }
      cands.sort((a, b) => a.rank - b.rank || (b.sameKernel - a.sameKernel));
      const hit = cands[0] || null;
      if (hit) {
        const { flag, sameKernel, others } = hit;
        note('E', file, line, name, sameKernel
          ? `\`${others.trim().slice(0, 50)}\` and the escape clause are the same measurement: ${flag.file}:${flag.line} toggles .${flag.cls} from ${flag.kernel.join(' / ')} on #${flag.id}, so the escape fires exactly when the antecedent does`
          : `the escape clause reads .${flag.cls}, which ${flag.file}:${flag.line} derives from #${flag.id}'s own ${flag.kernel.join(' / ')} - the same element \`${others.trim().slice(0, 40)}\` measures. An escape computed from the antecedent's subject is not independent evidence`);
      }
    }
  }
}

// ------------------------------------------------------------- self-cover ---

/* AN EMPTY SAMPLE SET IS A FAILURE HERE TOO. If a refactor renamed the ok()
   idiom, this file would find nothing and print "clean", which is the precise
   defect it was written to hunt. So it fails unless it actually parsed most of
   tests/. 60 is the floor, measured: shipped main parses 111 of 124 candidate
   files and 2286 assertions. */
const COVER_FLOOR = 60;
if (parsed < COVER_FLOOR) {
  console.log(`FAIL  self-coverage: only ${parsed} of ${files.length} test files yielded a parseable assertion (floor ${COVER_FLOOR}).`);
  console.log('        The ok()/check() idiom moved and this sweep is now grading almost nothing.');
  process.exit(1);
}
if (!FLAGS.length) {
  console.log('FAIL  self-coverage: rule E found no metric-derived class flag in js/, so it checked nothing.');
  console.log('        If the app really has none, delete rule E rather than letting it read as coverage.');
  process.exit(1);
}

// ---------------------------------------------------------------- verdict ---

const RULE = { K: 'CONSTANT', V: 'VACUOUS', C: 'CLIPPED', E: 'ESCAPE' };
console.log(`tautology-audit: ${assertions} assertions across ${parsed} files; rule E watching ${FLAGS.length} metric-derived class flag(s)\n`);
for (const f of findings) {
  console.log(`FAIL  [${f.rule} ${RULE[f.rule]}] tests/${f.file}:${f.line}  ${f.name}`);
  console.log(`        ${f.why}`);
}
if (findings.length) {
  console.log(`\n${findings.length} assertion(s) cannot fail. Each one is a green light nobody earned.`);
  process.exit(1);
}
console.log(`clean: no assertion matched rules K, V, C or E. This is NOT "every guard works":`);
console.log('  read the WHAT THIS CANNOT DETECT block at the top of this file, then run tests/mutation-sweep.mjs.');

/* PROOF. Every row below was run on this checkout on 2026-08-17 and its exit code
 * read from a file, never through a pipe.
 *
 *   E  shipped main, NOTHING edited: exit 1, naming fight-tray-audit.mjs:163 CLIP
 *      and :168 AFFORDANCE, and pointing at js/app.js:15635 as the source of the
 *      class the escape clause reads. Independently confirmed by running the audit
 *      itself against a tree with `.fight-actions{max-height:90px}`: it printed
 *      22/22 and exited 0 while reporting, in its own PASS detail, "5 past the
 *      edge" and "hides 138px".
 *   C  `git show d7b9e65:tests/fight-layout-audit.mjs` dropped into tests/: exit 1,
 *      ONE finding, naming the screenshot at :41, the clip binding at :24, the
 *      re-basing at :71 and the second read of `.arena` at :87. Removing the file
 *      returns the count to 2. Independently confirmed by running that audit
 *      against a tree with the boss translated 130px up: boss ink at 375x667 fell
 *      38395 -> 1636 and COMPOSE printed PASS "2.1px is the tightest clearance",
 *      exit 0.
 *   V  delete `check('an empty row sample is a failure, not a pass', ...)` from
 *      melt-ui-audit and this reports melt-ui-audit.mjs:92 and :131. Restore it and
 *      both go quiet. On shipped main rule V finds NOTHING, and that is a result,
 *      not an absence: every collection-shaped sweep in tests/ that this parser
 *      understands is gated, several of them by a sibling assertion or by a
 *      non-emptiness claim on a different variable drawn from the same DOM query,
 *      which is why the gate detection here is more elaborate than a length check.
 *   K  append `ok('K PROVE-RED', hits.length >= 0, 'inert')` to glyph-audit: exit 1,
 *      naming it. Remove it and the count returns to 2.
 *
 * WHAT A CLEAN RUN OF THIS FILE MEANS: four structural questions came back no. It
 * does not mean the guards work. The tool for that is tests/mutation-sweep.mjs,
 * and even that speaks only for the 8 files in its catalog.
 */
