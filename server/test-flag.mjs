/* IS THIS RUN TALKING TO A REAL DATABASE WITH REAL PLAYERS IN IT?
 *
 * Every suite in server/ defaults to http://127.0.0.1:8788 and takes BASE= or
 * API= to point anywhere. Four evening dev sessions pointed one at the deployed
 * Worker and left 28 dead accounts in Tom's game (docs/BOT-CENSUS-2026-08-22.md).
 *
 * So the suites stopped depending on anyone remembering. Every registration now
 * passes `test: flagFor(BASE)`:
 *
 *   local  -> false -> a normal account, and the suites' own leaderboard,
 *             friend and race assertions keep working exactly as before.
 *   remote -> true  -> players.is_test = 1, and the account is invisible on
 *             every public surface from the moment it exists.
 *
 * The one guard is here rather than copied into eight files so there is one
 * thing to get right, and tests/live-api-register-lint.mjs fails any suite that
 * registers without it.
 *
 * Deliberately NOT a general "is this a URL I trust": loopback only. A LAN
 * address or a staging host is treated as live, which is the safe direction to
 * be wrong in.
 */
export const flagFor = base =>
  !/^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])([:/]|$)/i.test(String(base || ''));

/* Self-check: node server/test-flag.mjs */
if (process.argv[1] && process.argv[1].endsWith('test-flag.mjs')) {
  const cases = [
    ['http://127.0.0.1:8788', false],
    ['http://localhost:8788', false],
    ['http://127.0.0.1', false],
    ['http://[::1]:8788', false],
    ['https://bonez-api.boneheadz.workers.dev', true],
    ['http://192.168.1.20:8788', true],
    ['', true],
    ['http://127.0.0.1.evil.com', true],   // the prefix trick: still live
  ];
  let bad = 0;
  for (const [url, want] of cases) {
    const got = flagFor(url);
    if (got !== want) { bad++; console.log(`FAIL  flagFor(${JSON.stringify(url)}) = ${got}, want ${want}`); }
  }
  console.log(`${bad ? 'FAIL' : 'PASS'}  flagFor: ${cases.length} cases, ${bad} wrong`);
  process.exit(bad ? 1 : 0);
}
