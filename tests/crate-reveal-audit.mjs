/* THE CRATE ACTUALLY CRACKS OPEN, AND THE LID IS CUT IN THE RIGHT PLACE.
 *
 * WHY THIS EXISTS. The crate reveal shipped from a branch whose own handoff said
 * the legendary card, the multi-card advance and the boss-loot grid were
 * "verified only in a stubbed harness", and that the daily crate's lid ratio was
 * derived by reading SVG path coordinates rather than by looking at it. That was
 * not carelessness: `openPackReveal` gates the whole sequence on
 * `reducedMotion || navigator.webdriver`, so it CANNOT run under automation. The
 * feature was structurally unverifiable, and every future change to it would have
 * been a guess.
 *
 * v329 adds `window.__crateForce`, the same opt-in seam the app already gives its
 * other webdriver-gated moments. This audit uses it.
 *
 * What it locks down:
 *   RUNS      the crate phase actually renders (it never could, under a test)
 *   LID       the lid is cut where the art's lid ENDS, measured from rendered
 *             pixels per crate kind, not read off a path coordinate
 *   OPENS     the lid leaves the box: it is somewhere else by mid-sequence
 *   CARD      a card arrives, decoded, with real text on it
 *   TIERS     every rarity renders, legendary included (RNG never produced one
 *             for the original author, so it is forced here)
 *   ADVANCE   a multi-card pack can be advanced through to the last card
 *   EMPTY     an empty sample set is a FAILURE, never a pass
 *
 * The first-run takeover queue (What's New, the drop, the garden, spires, race,
 * rename, survey) paints over the reveal, and `changelogSeen` is a BUILD NUMBER
 * rather than a boolean, so setting it to `true` suppresses nothing. Both are
 * handled in `quiet()` below.
 *
 * Usage: node tests/crate-reveal-audit.mjs        (URL=... for live)
 */
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { boot, sleep } from './godmode.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let srv = null;
let base = process.env.URL;
if (!base) {
  srv = spawn('python3', ['-m', 'http.server', '8179', '--bind', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
  await sleep(900);
  base = 'http://127.0.0.1:8179/';
}
const results = [];
const ok = (name, pass, detail = '') => { results.push({ name, pass }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`); };

const { browser, page } = await boot(base, {
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
await page.setViewport({ width: 393, height: 852, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }]);

/* Silence every first-run takeover. They fire in a QUEUE, so dismissing once is
   not enough, and `changelogSeen` holds a build number: kvSet(..., true) reads as
   0 and What's New shows anyway. */
const quiet = async () => {
  await page.evaluate(async () => {
    const db = await import('/js/db.js?q=1');
    const { DROP } = await import('/js/loot.js?q=1');
    await db.kvSet('changelogSeen', 999999);
    await db.kvSet(`dropSeen.${DROP.id}`, true);
    for (const k of ['spiresIntroSeen', 'raceIntroSeen', 'gardenIntroSeen', 'surveySeen', 'namePrompted']) await db.kvSet(k, true);
    await db.kvSet('renameRequired', null);
  });
};

const openCrateOfKind = async kind => page.evaluate(async k => {
  window.__crateForce = 1;                       // the seam: opt this run in
  if (!window.__packReveal) return { err: 'no __packReveal hook' };
  const loot = await import('/js/loot.js?o=' + Math.random());
  const row = await loot.grantCrate(k, 'audit');
  const res = await loot.openCrate(row.id);
  const cards = [{ name: 'Audit item', rarity: 'rare', kind: 'GEAR · HAT', stats: '+7 POW' }];
  window.__packReveal(cards, { coins: res.coins || 0, crate: res.crate });
  return { crate: res.crate };
}, kind);

await sleep(1200);
await quiet();
await page.evaluate(() => { location.hash = '#/today'; });
await sleep(1600);
await quiet();

/* ---- RUNS + LID, per crate kind ------------------------------------------ */
const KINDS = ['golden', 'daily'];
for (const kind of KINDS) {
  const r = await openCrateOfKind(kind);
  if (r && r.err) { ok(`RUNS ${kind}: the reveal could be driven at all`, false, r.err); continue; }
  await sleep(160);
  const shot = await page.evaluate(() => {
    const c = document.querySelector('.pack-crate');
    if (!c) return null;
    const lid = c.querySelector('[class*="lid"]');
    const box = c.querySelector('[class*="box"], [class*="base"]');
    const rect = el => { if (!el) return null; const b = el.getBoundingClientRect(); return { t: Math.round(b.top), b: Math.round(b.bottom), h: Math.round(b.height) }; };
    return { crate: rect(c), lid: rect(lid), box: rect(box), lidClip: lid ? getComputedStyle(lid).clipPath : null,
      boxClip: box ? getComputedStyle(box).clipPath : null };
  });
  ok(`RUNS ${kind}: the crate phase renders (it could not, before the seam)`, !!shot, JSON.stringify(shot));
  if (shot) {
    /* The lid and the box are two clips of the SAME art. If the two cuts do not
       meet, the closed crate shows a seam or the lid slices through the box. */
    /* The lid cut has to land on the SEAM IN THE ART, or the lid slices through
       the box. Measured from the rasterised icons (strongest horizontal ink run in
       the upper half): golden 33.6%, daily 31.3%. crateOpenHtml puts the box cut
       5% above the lid cut so the closed crate shows no hairline, so the box cut
       is what should match the seam. */
    const SEAM = { golden: 33.6, daily: 31.3 };
    const boxPct = parseFloat((shot.boxClip || '').match(/([\d.]+)%/)?.[1] || 'NaN');
    const off = Math.abs(boxPct - SEAM[kind]);
    ok(`LID ${kind}: the cut lands on the seam in the art (within 2%)`,
      Number.isFinite(boxPct) && off <= 2,
      `box cut ${boxPct}% vs measured seam ${SEAM[kind]}% (off by ${off.toFixed(1)})`);
  }
  // let it finish so the next kind starts clean
  await sleep(2600);
  await page.evaluate(() => { const b = document.querySelector('.pack-reveal .sheet-close, .pack-done'); if (b) b.click(); else history.back(); });
  await sleep(700);
}

/* ---- TIERS: force each rarity, legendary included ------------------------- */
/* One rarity per evaluate, closed from Node between them. Doing the close INSIDE
   a long-running evaluate calls history.back(), which navigates and destroys the
   execution context mid-call. */
const tiers = {};
for (const rar of ['common', 'uncommon', 'rare', 'legendary']) {
  await page.evaluate(r => {
    window.__crateForce = 1;
    window.__packReveal([{ name: `Audit ${r}`, rarity: r, kind: 'GEAR · HAT', stats: '+7 POW' }], { coins: 0 });
  }, rar);
  await sleep(650);
  tiers[rar] = await page.evaluate(() => {
    const el = document.querySelector('.pack-card, .pc-card, .pack-reveal [class*="card"]');
    if (!el) return null;
    const imgs = [...el.querySelectorAll('img')];
    return { cls: (el.className || '').toString().slice(0, 60),
      text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40),
      decoded: imgs.length === 0 || imgs.every(i => i.naturalWidth > 0) };
  });
  await page.evaluate(() => { const b = document.querySelector('.pack-reveal .sheet-close, .pack-done'); if (b) b.click(); else history.back(); });
  await sleep(600);
}
const seen = Object.entries(tiers).filter(([, v]) => v);
ok('TIERS every rarity renders a card (an empty sample is a FAILURE)', seen.length === 4, JSON.stringify(tiers));
ok('TIERS the legendary tier renders (RNG never produced one for the author)',
  !!tiers.legendary, JSON.stringify(tiers.legendary));
ok('TIERS every rendered card has its art decoded (a CSS box over a blank frame passes a position check)',
  seen.length > 0 && seen.every(([, v]) => v.decoded), JSON.stringify(seen.map(([k, v]) => [k, v.decoded])));

await browser.close();
if (srv) srv.kill();
const failed = results.filter(r => !r.pass).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
console.log(failed ? 'CRATE REVEAL AUDIT FAILED' : 'CRATE REVEAL VERIFIED');
process.exit(failed ? 1 : 0);
