// Small static CSS reader. Preserve source offsets; ignore comments and quoted
// delimiters, and keep function arguments (including data URLs) together.
export function cssDeclarations(source) {
  const rows = [], stack = [];
  const lineStarts = [0];
  for (let i = 0; i < source.length; i++) if (source[i] === '\n') lineStarts.push(i + 1);
  const lineAt = offset => {
    let lo = 0, hi = lineStarts.length;
    while (lo + 1 < hi) {
      const mid = (lo + hi) >>> 1;
      if (lineStarts[mid] <= offset) lo = mid; else hi = mid;
    }
    return lo + 1;
  };
  let start = 0, depth = 0, quote = '', comment = false;
  const clean = text => text.replace(/\/\*[\s\S]*?\*\//g, ' ').trim();
  const emit = end => {
    const raw = source.slice(start, end).replace(/\/\*[\s\S]*?\*\//g, comment => comment.replace(/[^\n]/g, ' '));
    const match = raw.match(/^\s*([\w-]+)\s*:\s*([\s\S]+)$/);
    if (!match) return;
    const offset = start + raw.indexOf(match[1]);
    rows.push({ line: lineAt(offset),
      context: stack.join(' > '), property: match[1], value: match[2].trim() });
  };
  for (let i = 0; i < source.length; i++) {
    const ch = source[i], next = source[i + 1];
    if (comment) { if (ch === '*' && next === '/') { comment = false; i++; } continue; }
    if (quote) { if (ch === '\\') i++; else if (ch === quote) quote = ''; continue; }
    if (ch === '/' && next === '*') { comment = true; i++; continue; }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (ch === '(' || ch === '[') { depth++; continue; }
    if (ch === ')' || ch === ']') { depth--; continue; }
    if (depth) continue;
    if (ch === '{') {
      const context = clean(source.slice(start, i));
      if (/^@media\b/.test(context)) rows.push({ line: lineAt(start + source.slice(start, i).lastIndexOf('@media')),
        context, property: '@media', value: context.slice(6).trim() });
      stack.push(context); start = i + 1;
    } else if (ch === ';' || ch === '}') {
      emit(i); start = i + 1;
      if (ch === '}') stack.pop();
    }
  }
  return rows;
}

export const hasPx = value => /(?:\d|\.)px\b/i.test(value);
