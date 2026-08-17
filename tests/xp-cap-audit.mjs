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
 *   STATIC   no award() call site anywhere builds its key from a clock or a
 *            random source. This is the whole bug class, caught at the source,
 *            including call sites that do not exist yet.
 *   CAP      hammering each repeatable source 60 times grants exactly its daily
 *            ceiling and not one XP more, driven through the real awardCapped
 *            against a real IndexedDB rather than against a mock.
 *   ROLLOVER the ceiling is per DAY: yesterday being spent must not block today.
 *   CONTROL  the sources actually paid something, so a helper that silently
 *            granted nothing at all could not pass the cap check by paying zero.
 */
import { readFileSync, readdirSync } from 'node:fs';
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

/* ---- STATIC: the bug class, at the source ---- */
const CLOCKY = /(Date\.now|Math\.random|performance\.now|crypto\.randomUUID|Date\(\))/;
const jsDir = path.join(ROOT, 'js');
const offenders = [];
let scanned = 0, callSites = 0;
for (const f of readdirSync(jsDir).filter(n => n.endsWith('.js'))) {
  const src = readFileSync(path.join(jsDir, f), 'utf8');
  scanned++;
  /* The key is everything between `award(` and the first top-level comma. Only
     award( and awardCapped( are matched, and awardCapped's first argument is a
     PREFIX, which is exactly as forbidden: a clock in the prefix reintroduces
     the bug one level down. */
  const re = /\baward(?:Capped)?\(\s*((?:[^,()`]|`[^`]*`|\([^()]*\))*)/g;
  let m;
  while ((m = re.exec(src))) {
    callSites++;
    const key = m[1];
    if (CLOCKY.test(key)) {
      const line = src.slice(0, m.index).split('\n').length;
      offenders.push(`${f}:${line}  ${key.trim().slice(0, 70)}`);
    }
  }
}
ok(`CONTROL the scanner found award call sites to grade`, callSites >= 20,
  `${callSites} call sites across ${scanned} module(s)`);
if (!offenders.length) ok(`STATIC no award key is built from a clock or a random source`, true, `${callSites} keys checked`);
else for (const o of offenders) ok(`STATIC an award key is built from a clock or a random source, so award() can never dedupe it`, false, o);

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
