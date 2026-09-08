// Bounded lexical sink inventory. Not a proof about arbitrary subprocesses,
// computed method names, native extensions or concurrent symlink replacement.
import { codeOnly } from './lookup-guard-scan.mjs';
const first = new Set(['writeFile', 'writeFileSync', 'appendFile', 'appendFileSync',
  'mkdir', 'mkdirSync', 'mkdtemp', 'mkdtempSync', 'createWriteStream',
  'unlink', 'unlinkSync', 'rm', 'rmSync', 'rmdir', 'rmdirSync',
  'truncate', 'truncateSync', 'chmod', 'chmodSync', 'open', 'openSync']);
const second = new Set(['copyFile', 'copyFileSync', 'cp', 'cpSync', 'symlink', 'symlinkSync', 'link', 'linkSync']);
const both = new Set(['rename', 'renameSync']);
function parts(code, start, close) {
  const rows = []; let from = start, depth = 0;
  for (let i = start; i < code.length; i++) {
    const c = code[i];
    if (depth === 0 && (c === ',' || c === close)) {
      rows.push([from, i]); from = i + 1;
      if (c === close) return { rows, end: i };
    }
    if ('([{'.includes(c)) depth++;
    if (')]}'.includes(c)) depth--;
  }
  return { rows: [], end: code.length };
}
export function writeSinks(source) {
  const code = codeOnly(source), sinks = [];
  const aliases = new Map();
  const namespaces = new Set();
  for (const imp of source.matchAll(/import\s+([^;]*?)\s+from\s+['"](?:node:)?fs(?:\/promises)?['"]/g)) {
    const clause = imp[1];
    for (const item of (clause.match(/\{([^}]+)\}/)?.[1] || '').split(',')) {
      const [name, alias] = item.trim().split(/\s+as\s+/);
      if (name) aliases.set(alias || name, name);
    }
    const ns = clause.match(/\*\s+as\s+(\w+)/)?.[1] || clause.match(/^\s*(\w+)/)?.[1];
    if (ns) namespaces.add(ns);
  }
  const add = (api, span) => {
    if (!span) return;
    let [start, end] = span;
    while (/\s/.test(source[start] || '') && start < end) start++;
    while (/\s/.test(source[end - 1] || '') && end > start) end--;
    const wrapper = source.slice(start, end).match(/^auditOutputPath\s*\(/);
    const guarded = !!wrapper && parts(code, start + wrapper[0].length, ')').end === end - 1;
    if (start < end) sinks.push({ api, start, end, line: source.slice(0, start).split('\n').length, guarded });
  };
  for (const m of code.matchAll(/\b([A-Za-z_$][\w$]*)\s*\(/g)) {
    const api = aliases.get(m[1]) || m[1], start = m.index + m[0].length;
    // IndexedDB.open and page.open are not filesystem writes.
    if (api === 'open' || api === 'openSync') {
      const receiver = code.slice(0, m.index).match(/(\w+)\s*\.\s*$/)?.[1];
      if (!aliases.has(m[1]) && !namespaces.has(receiver)) continue;
    }
    if (first.has(api) || second.has(api) || both.has(api)) {
      const { rows } = parts(code, start, ')');
      if (first.has(api) || both.has(api)) add(api, rows[0]);
      if (second.has(api) || both.has(api)) add(api, rows[1]);
    }
    if (api === 'screenshot' || (api === 'start' && /\.tracing\.\s*$/.test(code.slice(0, m.index)))) {
      const { end } = parts(code, start, ')');
      for (const prop of code.slice(start, end).matchAll(/\bpath\s*:/g)) {
        const at = start + prop.index + prop[0].length;
        add(api, parts(code, at, '}').rows[0]);
      }
    }
  }
  return sinks;
}
