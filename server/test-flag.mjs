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

/* AND THE ROW A LOCAL RUN LEAVES BEHIND. 2026-09-02.
 *
 * flagFor above answers "will this hurt anyone", and for a local run the answer
 * is no, so it returns false and the row is born looking exactly like a real
 * player. That is deliberate and it is not negotiable: MEASURED 2026-09-02, on a
 * cp -R copy with flagFor hard-coded to true, 49 of 174 server assertions went
 * red (api 43/23, spires 6/22, security 22/4). is_test does not mean "a test
 * made this", it means "suppress this everywhere", and the suites whose whole
 * job is to grade the leaderboard, the friend graph, the race and the spires
 * need an account the server will actually show. Mark them with is_test and the
 * suite stops grading the path a player takes.
 *
 * So the row gets a SECOND mark that nothing filters on. Every registration also
 * passes `run: RUN`, and the server stores it in players.test_run. A row with a
 * test_run behaves identically to a real one, and it says, in its own column and
 * at the moment it was made, which file made it and when. No operator has to
 * reverse-engineer registration timing and grant counts to find out, which is
 * what the 2026-08-22 census had to do.
 *
 * ONE LABEL PER PROCESS, so every account a run mints shares it and the run can
 * be selected out whole. argv[1] is the suite; the timestamp is taken once, at
 * import, rather than per registration.
 */
export const RUN = `${String(process.argv[1] || 'node').split('/').pop()} ${new Date().toISOString()}`;

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
  /* RUN is checked too, because an empty or undated label is the failure that
     would leave an operator guessing again while this file still said PASS. */
  const runOk = /^test-flag\.mjs \d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(RUN);
  if (!runOk) { bad++; console.log(`FAIL  RUN = ${JSON.stringify(RUN)}, want "<suite> <ISO date>"`); }
  console.log(`${bad ? 'FAIL' : 'PASS'}  flagFor: ${cases.length} cases, RUN: ${JSON.stringify(RUN)}, ${bad} wrong`);
  process.exit(bad ? 1 : 0);
}
