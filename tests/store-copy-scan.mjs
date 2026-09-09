/* THE REACHABILITY SCAN, IN ONE PLACE.
 *
 * Two callers need it and they must never drift: tests/store-copy-lint.mjs
 * grades js/app.js in the repo, and native/submission-preflight.mjs grades
 * native/www/js/app.js in the bundle that is about to be archived. The scan was
 * duplicated once, and this project has already paid for a shared scanner whose
 * two copies disagreed (a comment stripper that silently stopped stripping a
 * third of the way through a file, so the word `fetch` in an English sentence
 * failed a check). One copy, two callers. */
import { importAuditPackage } from './lib/audit-dependencies.mjs';
const { default: esprima } = await importAuditPackage('esprima');

export const FORBIDDEN = /testflight\.apple\.com|testflight|\bbeta\b/i;

/* The invitation implementation stays in source for internal builds. Its two
   entry points are guarded by STORE_BUILD, so blank that unreachable island
   (preserving line numbers) before scanning every remaining player-facing
   string. Leaving one store surface ungated makes its literal survive the scan
   and names its source line. */
export function scanReachable(source, label) {
  const failures = [];
  const start = source.indexOf('const TESTFLIGHT_URL =');
  const end = source.indexOf('// Test hook (webdriver only), same reasoning as __community above.', start);
  if (!(start >= 0 && end > start)) {
    failures.push(`beta invitation block was not found in ${label}`);
    return failures;
  }
  const reachable = source.slice(0, start)
    + '\n'.repeat(source.slice(start, end).split('\n').length - 1)
    + source.slice(end);
  // Esprima is already locked and installed through Puppeteer's dependencies.
  // Use its tokenizer (not its older grammar parser) to distinguish comments
  // from strings, regex literals and nested template expressions. Blank only
  // comment ranges, preserving offsets and line numbers. Never accept a partial
  // token stream as a clean scan if the tokenizer cannot read future syntax.
  let codeOnly;
  try {
    const tokens = esprima.tokenize(reachable, { comment: true, range: true });
    let cursor = 0;
    const parts = [];
    for (const token of tokens) {
      if (token.type !== 'LineComment' && token.type !== 'BlockComment') continue;
      const [from, to] = token.range;
      parts.push(reachable.slice(cursor, from), reachable.slice(from, to).replace(/[^\r\n]/g, ' '));
      cursor = to;
    }
    parts.push(reachable.slice(cursor));
    codeOnly = parts.join('');
  } catch (error) {
    return [`cannot tokenize ${label}: ${error.message}`];
  }
  for (const [n, code] of codeOnly.split('\n').entries()) {
    const hit = code.match(FORBIDDEN);
    if (hit) failures.push(`reachable "${hit[0]}" at ${label}:${n + 1}`);
  }
  return failures;
}
