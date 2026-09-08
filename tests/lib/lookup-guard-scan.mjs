/* M5, 2026-09-07. Bounded source lint, not a JavaScript dataflow analyser.
 * It recognises indexed lookups after bare truth tests, one local result alias,
 * and truth-only collection filters feeding registered id consumers. It does
 * not prove reachability or follow arbitrary assignments/calls across modules.
 * Strings/comments are masked; template expression code stays visible.
 */
export function codeOnly(source) {
  const out = source.split('');
  const blank = i => { if (out[i] !== '\n') out[i] = ' '; };
  let i = 0;
  function quoted(quote) {
    blank(i++);
    while (i < source.length) {
      if (source[i] === '\\') { blank(i++); if (i < source.length) blank(i++); }
      else if (source[i] === quote) { blank(i++); return; }
      else if (quote === '`' && source[i] === '$' && source[i + 1] === '{') {
        blank(i++); blank(i++); code(true);
      } else blank(i++);
    }
  }
  function code(hole = false) {
    let depth = 0;
    while (i < source.length) {
      const c = source[i], d = source[i + 1];
      if (c === "'" || c === '"' || c === '`') { quoted(c); continue; }
      if (c === '/' && d === '/') {
        while (i < source.length && source[i] !== '\n') blank(i++);
        continue;
      }
      if (c === '/' && d === '*') {
        blank(i++); blank(i++);
        while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) blank(i++);
        if (i < source.length) { blank(i++); blank(i++); }
        continue;
      }
      // Regex literals after expression-opening punctuation or return. Division
      // remains code. This is lexical context only, not the full JS grammar.
      if (c === '/' && /(?:[=(:,!&|?;{}]|\breturn)\s*$/.test(out.slice(Math.max(0, i - 30), i).join(''))) {
        blank(i++); let cls = false;
        while (i < source.length) {
          const r = source[i];
          if (r === '\\') { blank(i++); if (i < source.length) blank(i++); continue; }
          if (r === '[') cls = true;
          if (r === ']') cls = false;
          blank(i++);
          if (r === '/' && !cls) break;
        }
        while (/[a-z]/i.test(source[i] || '') && i < source.length) blank(i++);
        continue;
      }
      if (c === '{') depth++;
      if (c === '}') {
        if (hole && depth === 0) { blank(i++); return; }
        depth--;
      }
      i++;
    }
  }
  code();
  return out.join('');
}
const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const expr = '[A-Za-z_$][\\w$]*(?:\\s*\\.\\s*[A-Za-z_$][\\w$]*)*';
const compact = s => s.replace(/\s+/g, '');
const expressionRE = s => escape(compact(s)).replaceAll('\\.', '\\s*\\.\\s*');

// 2026-09-07: these consume catalogue records/ids. Even if a terminal fallback
// now prevents a throw, passing an unresolved id remains a boundary finding.
const recordConsumers = ['bhAsset'];
const idConsumers = ['petSpriteHtml', 'petPortraitHtml'];

export function scanLookupGuards(source) {
  const code = codeOnly(source), findings = [];
  const blocks = [], stack = [];
  for (let i = 0; i < code.length; i++) {
    if (code[i] === '{') stack.push(i);
    if (code[i] === '}' && stack.length) blocks.push([stack.pop(), i]);
  }
  function scope(at) {
    return blocks.filter(([a, b]) => a < at && b > at).sort((a, b) => b[0] - a[0])[0] || [0, code.length];
  }
  const line = at => code.slice(0, at).split('\n').length;
  const add = (at, rule, key, lookup, sink) => {
    const row = { line: line(at), rule, key: compact(key), lookup: compact(lookup), sink: compact(sink) };
    if (!findings.some(f => JSON.stringify(f) === JSON.stringify(row))) findings.push(row);
  };
  // A bare key guard followed by an indexed lookup in its enclosing block.
  // No arbitrary line-distance cutoff; scope boundaries stop unrelated functions.
  const guards = new RegExp(`\\bif\\s*\\(\\s*!\\s*(${expr})\\s*\\)\\s*(?:return\\b[^;]*;|continue\\s*;)`, 'g');
  for (const guard of code.matchAll(guards)) {
    const key = guard[1], [, end] = scope(guard.index);
    const tail = code.slice(guard.index + guard[0].length, end);
    inspect(guard.index, key, tail);
    // The lookup can precede the guard, with its result consumed afterwards.
    const aliases = new RegExp(`\\b(?:const|let)\\s+\\w+\\s*=\\s*\\w+\\s*\\[\\s*${expressionRE(key)}\\s*\\]\\s*;`, 'g');
    for (const alias of code.slice(0, guard.index).matchAll(aliases)) {
      const [a, b] = scope(alias.index);
      if (a < guard.index && b > guard.index) inspect(guard.index, key, alias[0] + tail);
    }
  }
  // Positive short circuit and ternary forms. The RHS is bounded to the
  // statement, since a truth test in one statement guards no later statement.
  const positives = new RegExp(`(?<![\\w$.!])(${expr})\\s*(?:&&|\\?(?![.?]))`, 'g');
  for (const guard of code.matchAll(positives)) {
    if (/[=!<>]\s*$/.test(code.slice(Math.max(0, guard.index - 4), guard.index))) continue;
    const [, end] = scope(guard.index);
    const tail = code.slice(guard.index + guard[0].length, end).split(';')[0];
    inspect(guard.index, guard[1], tail);
  }
  function inspect(at, key, tail) {
    const idSink = tail.match(new RegExp(`\\b(?:${idConsumers.join('|')})\\s*\\(\\s*${expressionRE(key)}\\s*[,)]`));
    if (idSink) add(at, 'id-boundary', key, 'catalogue via helper', idSink[0]);
    const index = new RegExp(`\\b([A-Za-z_$][\\w$]*)\\s*\\[\\s*${expressionRE(key)}\\s*\\]`, 'g');
    for (const lookup of tail.matchAll(index)) {
      const before = tail.slice(0, lookup.index), after = tail.slice(lookup.index + lookup[0].length);
      const checked = new RegExp(`${escape(lookup[1])}\\s*\\[\\s*${expressionRE(key)}\\s*\\]\\s*(?:&&|\\?(?![.?])|\\))`);
      if (checked.test(before)) continue;
      // A guard on the lookup itself, optional access, or an explicit fallback
      // resolves the absent/unresolvable distinction at this boundary.
      if (/^\s*(?:\?\.|\|\||\?\?|&&)/.test(after)) continue;
      if (/^\s*\.(?!\s*\?)/.test(after)) {
        add(at, 'guarded-index', key, lookup[0], lookup[0] + after.match(/^\s*\.\s*\w+/)?.[0]);
      } else if (recordConsumers.some(fn => new RegExp(`\\b${fn}\\s*\\(\\s*$`).test(before))) {
        add(at, 'record-boundary', key, lookup[0], 'bhAsset');
      } else {
        const alias = before.match(/\b(?:const|let)\s+(\w+)\s*=\s*$/)?.[1];
        if (!alias) continue;
        // A one-alias chain only. Any explicit guard on the result excludes it.
        if (new RegExp(`(?:if\\s*\\(\\s*!?\\s*${alias}\\b|\\b${alias}\\s*(?:&&|\\?\\.|\\|\\||\\?\\?))`).test(after)) continue;
        const sink = after.match(new RegExp(`\\b${alias}\\s*\\.\\s*\\w+|\\b(?:${recordConsumers.join('|')})\\s*\\(\\s*${alias}\\s*\\)`));
        if (sink) add(at, 'lookup-alias', key, lookup[0], sink[0]);
      }
    }
  }
  // A filter that proves only a row/property is present. Link the filtered
  // collection to a callback consumer, or to a derived collection in the same
  // block. The latter is a candidate requiring review, not a reachability proof.
  const filters = /\b(?:const|let)\s+(\w+)\s*=\s*\w+\.filter\(\s*(\w+)\s*=>\s*\2\s*&&\s*\2\.(\w+)\s*\)/g;
  for (const guard of code.matchAll(filters)) {
    const [, collection, parameter, property] = guard;
    const [, end] = scope(guard.index), tail = code.slice(guard.index + guard[0].length, end);
    if (!new RegExp(`\\b${collection}\\b`).test(tail)) continue;
    const sink = tail.match(new RegExp(`\\b(?:${idConsumers.join('|')})\\s*\\(\\s*\\w+\\.${property}\\b`))
      || tail.match(new RegExp(`\\b\\w+\\s*\\[\\s*\\w+\\.${property}\\s*\\]\\s*\\.\\s*\\w+`));
    if (sink) add(guard.index, 'filtered-id-boundary', `${parameter}.${property}`, collection, sink[0]);
  }
  return findings.sort((a, b) => a.line - b.line || a.rule.localeCompare(b.rule));
}
