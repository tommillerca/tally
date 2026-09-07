/* THE REACHABILITY SCAN, IN ONE PLACE.
 *
 * Two callers need it and they must never drift: tests/store-copy-lint.mjs
 * grades js/app.js in the repo, and native/submission-preflight.mjs grades
 * native/www/js/app.js in the bundle that is about to be archived. The scan was
 * duplicated once, and this project has already paid for a shared scanner whose
 * two copies disagreed (a comment stripper that silently stopped stripping a
 * third of the way through a file, so the word `fetch` in an English sentence
 * failed a check). One copy, two callers. */
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
  let inComment = false;
  for (const [n, raw] of reachable.split('\n').entries()) {
    let line = raw, code = '';
    while (line) {
      if (inComment) {
        const close = line.indexOf('*/');
        if (close < 0) { line = ''; continue; }
        inComment = false;
        line = line.slice(close + 2);
      }
      const block = line.indexOf('/*');
      const slash = line.indexOf('//');
      if (slash >= 0 && (block < 0 || slash < block)) { code += line.slice(0, slash); break; }
      if (block < 0) { code += line; break; }
      code += line.slice(0, block);
      inComment = true;
      line = line.slice(block + 2);
    }
    const hit = code.match(FORBIDDEN);
    if (hit) failures.push(`reachable "${hit[0]}" at ${label}:${n + 1}`);
  }
  return failures;
}
