/* tests/xp-cap-audit.mjs — A REPEATABLE ACTION CANNOT PAY FOREVER.
 *
 * WHY THIS EXISTS. Tom, 2026-08-16, on a level 80 account: "we need to fix how
 * able people are able to level that fast." The levels themselves are fine and
 * are deliberately uncapped; the RATE was not.
 *
 * The mechanism was one line, repeated six times. award(key, ...) is idempotent:
 * js/game.js returns 0 when the key already exists, and that key is the only
 * thing stopping a reward being claimed twice. Six call sites built theirs out
 * of Date.now(), so every single call produced a fresh key and the dedupe could
 * never fire. Pit wins, garden harvests, cooking and siege breaks had no cap and
 * no dedupe at all. Measured on the live D1: one device logged 214 Pit wins on
 * 2026-08-10, 200 the day before and 159 the day before that, and that is a
 * FLOOR, because js/analytics.js caps its queue at 300 and evicts oldest-first.
 *
 * WHAT IT ASSERTS
 *   (STATIC, the key-text lint, moved to tests/xp-key-provenance-lint.mjs; it
 *            traces provenance now, because the text of `log-${entry.id}`
 *            contained no clock while entry.id was one.)
 *   CAP      hammering each repeatable source 60 times grants exactly its daily
 *            ceiling and not one XP more, driven through the real awardCapped
 *            against a real IndexedDB rather than against a mock.
 *   ROLLOVER the ceiling is per DAY: yesterday being spent must not block today.
 *   CONTROL  the sources actually paid something, so a helper that silently
 *            granted nothing at all could not pass the cap check by paying zero.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boot, sleep, serveTree } from './godmode.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = [];
let fails = 0;
const ok = (m, cond, detail = '') => {
  if (cond) out.push(`ok   ${m}${detail ? '  ' + detail : ''}`);
  else { fails++; out.push(`FAIL ${m}${detail ? '  ' + detail : ''}`); }
};

/* ---- STATIC moved to tests/xp-key-provenance-lint.mjs (PURE tier) ----
   The regex that lived here graded the key TEXT for Date.now|Math.random and
   passed `log-${entry.id}` while entry.id was newId(), a clock two hops away
   (QA round A, 2026-09-03, L1). The lint that replaced it resolves each key's
   provenance through locals, object literals and call sites, and runs on
   every gate pass rather than only in this browser tier. */

/* ---- BEHAVIOUR: drive the real helper against a real IndexedDB ---- */
const srv = process.argv[2] ? null : await serveTree(ROOT);
const base = process.argv[2] || srv.url;
console.log(`URL UNDER TEST: ${base}`);
const { browser, page } = await boot(base);
await sleep(1200);

const res = await page.evaluate(async () => {
  const g = await import('/js/game.js');
  const caps = g.XP_DAILY_CAP;
  const SOURCES = [
    { prefix: 'fight', type: 'fight', xp: 10, cap: caps.fight },
    { prefix: 'harvest', type: 'garden', xp: 6, cap: caps.garden },
    { prefix: 'cook', type: 'cook', xp: 8, cap: caps.cook },
    { prefix: 'siege', type: 'siege', xp: 12, cap: caps.siege },
  ];
  const today = [], rollover = [];
  for (const s of SOURCES) {
    let got = 0, calls = 0;
    /* 60 attempts against a cap of 5 to 12: five times over, so a cap that is
       merely LARGE rather than enforced still comes out wrong. */
    for (let i = 0; i < 60; i++) { got += await g.awardCapped(s.prefix, s.type, s.xp, 'audit', s.cap); calls++; }
    today.push({ ...s, got, calls, want: s.cap * s.xp });
    /* the same source on a DIFFERENT date must pay again: the ceiling is daily */
    const y = await g.awardCapped(s.prefix, s.type, s.xp, 'audit', s.cap, '1999-01-02');
    rollover.push({ prefix: s.prefix, y });
  }
  return { caps, today, rollover, total: today.reduce((a, r) => a + r.got, 0) };
});

ok('CONTROL the repeatable sources paid something, so a no-op helper cannot pass',
  res.total > 0, `${res.total} XP granted across ${res.today.length} sources`);
for (const r of res.today) {
  ok(`CAP ${r.prefix} pays its daily ceiling and stops`, r.got === r.want,
    `${r.calls} attempts granted ${r.got} XP, ceiling is ${r.cap} x ${r.xp} = ${r.want}`);
}
for (const r of res.rollover) {
  ok(`ROLLOVER ${r.prefix} pays again on a different day`, r.y > 0,
    `a spent today did not block another date (granted ${r.y})`);
}

await browser.close();
if (srv) srv.close();
console.log(out.join('\n'));
console.log(fails ? `\nFAIL (${fails})` : `\nall green, ${out.length} checks`);
process.exit(fails ? 1 : 0);
