/* THE FACE THE FIGHT ACTUALLY EQUIPS, not the face pit.js computed.
 *
 * Tom, 2026-08-15: "high enough up the ladder the pit bosses are still random
 * sometimes and not the approved monsters we created together." He was right,
 * and the numbers are stark: ranks 1 to 48 were 100% approved-roster monsters
 * and rank 51 upward was 0%. Rank 51 is the first ordinary rank on the deep
 * cast, which needs 15 den wins to reach, which is why only a deep player ever
 * saw it.
 *
 * WHY THE EXISTING GUARD DID NOT CATCH IT, which is the lesson worth keeping.
 * tests/unit.test.js:2276 asserts `endlessFoe(rank).look` has a body and a
 * skull. It always does. pit.js was never the broken hop. `endlessFightCfg`
 * (js/app.js) listed the fields it copied BY HAND and never copied `look`, so
 * `openFight` fell through to `foeOutfitFor` and dressed the enemy in a starter
 * body plus random catalogue items. A guard pointed one hop upstream of the
 * defect passes forever while 425 fights render junk.
 *
 * So this audit reads the outfit at the LAST hop before makeFighter, through
 * the app's own `window.__endlessCfg` seam, and compares it against the roster
 * look pit.js computed for the same rank. It needs a browser for no other
 * reason than that endlessFightCfg lives in app.js.
 *
 *   node tests/endless-look-audit.mjs        (self-serves this checkout)
 *   URL=https://... node tests/endless-look-audit.mjs
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boot, sleep, serveTree } from './godmode.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let fails = 0;
const ok = (label, pass, detail = '') => {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}${detail ? `  | ${detail}` : ''}`);
  if (!pass) fails = 1;
};

const srv = process.env.URL ? null : await serveTree(ROOT);
const base = process.env.URL || srv.url;
const { browser, page } = await boot(base);
const errs = [];
page.on('pageerror', e => errs.push(String(e)));

try {
  /* Ranks chosen to straddle the boundary rather than to flatter the fix: the
     designed-cast range, the re-dressed range, and well past rank 51 where it
     was 0%. 51 itself is included by name because it is the first failing rank. */
  const RANKS = [1, 4, 8, 12, 24, 40, 48,
    /* every rank across the boundary, because roughly half of them are drawn
       bosses (glutton/mage) that bring their own art and are skipped: sampling
       sparsely up here left THREE ordinary ranks to grade, and a three-row
       sample is how a check ends up asserting almost nothing. */
    51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65,
    75, 90, 120, 160, 200, 300, 400, 600];

  const rows = await page.evaluate(async ranks => {
    const pit = await import('./js/pit.js');
    const bosses = await import('./js/bosses.js');
    /* "APPROVED" IS BOTH POOLS, and getting this wrong is easy: my first version
       checked LOOKS only and went red on healthy ranks. LOOKS is the fixed cast
       (rung 4 is The Gravedigger every time). FAMILIES is the curated pool that
       ladderLook draws from and that repeat cycles re-dress out of, so a rank
       wearing a FAMILIES outfit is wearing hand-authored art, not a coin flip.
       The thing that must never appear is an outfit from NEITHER, which is what
       foeOutfitFor's generator produces. */
    const approved = new Set([...Object.values(bosses.LOOKS), ...Object.values(bosses.FAMILIES).flat()]
      .map(l => JSON.stringify(l)));
    return ranks.map(r => {
      const foe = pit.endlessFoe(r);
      const cfg = window.__endlessCfg ? window.__endlessCfg(r) : null;
      /* what pit.js decided this rank should wear */
      const want = foe.look || null;
      /* what the fight will actually equip: the cfg's outfit if it carries one,
         otherwise whatever openFight's fallback generator produces */
      const got = cfg ? (cfg.foeOutfit || null) : null;
      return {
        rank: r, name: foe.name, drawn: !!(foe.glutton || foe.mage),
        want, got,
        carried: !!(got && want && JSON.stringify(got) === JSON.stringify(want)),
        approvedFace: !!(got && approved.has(JSON.stringify(got))),
      };
    });
  }, RANKS);

  /* AN EMPTY SAMPLE IS A FAILURE. No seam, no rows, nothing graded. */
  ok('SAMPLE the __endlessCfg seam answered for every rank', rows.length === RANKS.length && rows.every(r => r.got || r.drawn),
    `${rows.filter(r => r.got).length}/${rows.length} ranks returned a config outfit`);

  const ordinary = rows.filter(r => !r.drawn);
  const dropped = ordinary.filter(r => !r.carried);
  ok('the fight equips the face pit.js chose, at every rank', dropped.length === 0,
    dropped.length ? `dropped at rank(s) ${dropped.map(r => `${r.rank} (${r.name})`).join(', ')}`
                   : `${ordinary.length}/${ordinary.length} ranks carried their look`);

  /* The stronger claim, and the one Tom actually asked about: it is an APPROVED
     monster, not merely a non-empty object. A random catalogue outfit has a body
     and a skull too, which is exactly how the old guard stayed green. */
  const strangers = ordinary.filter(r => !r.approvedFace);
  ok('and it is a monster from the roster, not a generated one', strangers.length === 0,
    strangers.length ? `off-roster at rank(s) ${strangers.map(r => `${r.rank} (${r.name})`).join(', ')}`
                     : `${ordinary.length}/${ordinary.length} ranks wear a LOOKS entry`);

  /* The boundary named explicitly, so a future regression says WHERE it broke
     rather than just how many. */
  const deep = ordinary.filter(r => r.rank >= 51);
  ok('the deep cast (rank 51+) is covered, which is where it was 0%', deep.length >= 6 && deep.every(r => r.approvedFace),
    `${deep.filter(r => r.approvedFace).length}/${deep.length} deep ranks approved`);

  ok('NO page errors', errs.length === 0, errs.join(' | '));
} finally {
  await browser.close();
  srv?.close?.();
}
console.log(fails ? '\nENDLESS LOOK: FAILED' : '\nENDLESS LOOK: every rank fights a monster we drew');
process.exit(fails);
