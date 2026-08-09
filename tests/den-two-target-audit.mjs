/* A BOSS DEN WITH TWO ENEMIES SHOWS TWO HEALTH BARS.
 *
 * Tom, 2026-08-08: "fighting a boss den with two enemy targets doesn't have a
 * clear health bar for the second target at all. I've brought this up like 3
 * times. You think you've fixed it but you haven't."
 *
 * He was right every time. Measured before the fix: the captain's bar was a
 * 155x11 track with a 151x7 fill, and the second target's was a 67x4 track whose
 * fill computed to height ZERO. Not small. Absent.
 *
 * This went untested because a 2-target den needs 5 den wins AND standing inside
 * a den's radius, which no audit can arrange, so `window.__denFight` exists as
 * the opt-in seam (same idiom as __crateForce / __spireForce).
 *
 * Checks are about what a PLAYER can see: a bar with real pixels, at a size
 * comparable to the captain's, that actually moves when the thing takes damage.
 *
 * Usage: node tests/den-two-target-audit.mjs
 */
import { boot, seed, sleep } from './godmode.js';

const base = process.argv[2] || 'http://127.0.0.1:8321/';
let fails = 0;
const ok = (label, pass, detail = '') => {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}${detail ? '  | ' + detail : ''}`);
  if (!pass) fails++;
};

const { browser, page } = await boot(base);
await page.setViewport({ width: 393, height: 852, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await seed(page, { level: 20, coins: 800 });
await page.evaluate(() => window.__denFight(1.6, 0.5));
await sleep(4000);

const geom = await page.evaluate(() => {
  const box = sel => {
    const e = document.querySelector(sel); if (!e) return null;
    const r = e.getBoundingClientRect(); const cs = getComputedStyle(e);
    return { w: Math.round(r.width), h: Math.round(r.height),
      shown: r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && +cs.opacity > 0.05 };
  };
  return {
    secondFighterOnScreen: !!document.querySelector('#addG'),
    captainFill: box('#foeHp'),
    addFill: box('#addHp'),
    addBlock: box('#hudAdd'),
    addName: document.querySelector('#hudAdd .aname')?.textContent?.trim() || null,
    // it must not wear the ally styling used for YOUR pet on the other side
    looksLikeYourPet: !!document.querySelector('#hudAdd.hud-pet'),
  };
});

ok('SETUP the fight actually has a second enemy (an absent one proves nothing)',
  geom.secondFighterOnScreen && !!geom.addFill, JSON.stringify({ add: geom.secondFighterOnScreen }));
ok('BAR the second target has a health bar with real pixels',
  !!geom.addFill && geom.addFill.shown && geom.addFill.h > 0,
  JSON.stringify(geom.addFill));
ok('BAR it is legible next to the captain, not a sliver',
  !!geom.addFill && !!geom.captainFill
    && geom.addFill.w >= geom.captainFill.w * 0.6
    && geom.addFill.h >= geom.captainFill.h * 0.5,
  `captain ${geom.captainFill?.w}x${geom.captainFill?.h}, second ${geom.addFill?.w}x${geom.addFill?.h}`);
ok('BAR the second target is named', !!geom.addName, String(geom.addName));
ok('BAR it does not wear your pet\'s ally styling', !geom.looksLikeYourPet);

/* A bar that never moves is a decoration. Drive real turns and require the
   second target's fill to actually change width. */
const before = await page.evaluate(() => document.querySelector('#addHp')?.style.width || null);
// You have to PICK the second enemy first; attacking on default hits the captain
// and the add would never take a scratch, which would fake this result.
await page.evaluate(() => document.querySelector('#addG')?.click());
await sleep(700);
const targeted = await page.evaluate(() => !!document.querySelector('#addG.targeted'));
ok('LIVE the second target can actually be selected', targeted, `#addG.targeted=${targeted}`);
for (let i = 0; i < 16; i++) {
  const acted = await page.evaluate(() => {
    document.querySelector('#addG')?.click();       // keep it selected between turns
    const b = [...document.querySelectorAll('#factions button')].find(x => !x.disabled);
    if (b) { b.click(); return true; } return false;
  });
  if (!acted) break;
  await sleep(950);
  const now = await page.evaluate(() => document.querySelector('#addHp')?.style.width || null);
  if (now && now !== before) break;
}
const after = await page.evaluate(() => document.querySelector('#addHp')?.style.width || null);
ok('LIVE the second target\'s bar actually moves when it takes damage',
  !!before && !!after && before !== after, `${before} -> ${after}`);


/* THE PET'S BAR TOO. Tom, 2026-08-09: "why is my pets health always looking
   empty". Same defect as the add's, and in v341 I fixed only the add, so the
   class came straight back through the other bar. This guard covers BOTH. */
const petBar = await page.evaluate(() => {
  const w = document.getElementById('hudPet'); if (!w) return { none: true };
  const bar = w.querySelector('.bar'), fill = document.getElementById('petHp');
  const b = bar.getBoundingClientRect(), f = fill.getBoundingClientRect();
  return { none: false, track: [Math.round(b.width), Math.round(b.height)],
           fill: [Math.round(f.width), Math.round(f.height)], shown: f.height > 2 && f.width > 2 };
});
/* Assert the TRACK has room, not just the fill. My first version of this guard
   passed with the 4px bug reintroduced, because a min-height on the fill papered
   over a track that had no content box left. A check that cannot fail is not a
   check: the track is the thing that was broken, so the track is what is tested. */
ok('BAR the PET\'s bar has a track with room in it', !petBar.none && petBar.track[1] >= 8, JSON.stringify(petBar));
ok('BAR the PET\'s fill draws inside it', !petBar.none && petBar.fill[1] >= 4 && petBar.fill[0] > 2, JSON.stringify(petBar));

await browser.close();
console.log(fails ? '\nDEN TWO-TARGET AUDIT FAILED' : '\nDEN TWO-TARGET VERIFIED');
process.exit(fails);
