/* A REVEAL SHOWS THE PIECE WORN, NOT THE LOOSE PNG.
 *
 * WHY THIS EXISTS. Tom, 2026-09-03: "all gear in the app should now be shown
 * like in the shop on a base skeleton with context ... it no longer just shows
 * the random PNG ... this will fix the grillz scaling issue and it will allow
 * the player to not see how the sausage is made as far as certain items having
 * strange cut outs in the png."
 *
 * Three distinct ways that can silently come back, so three distinct checks:
 *
 *   COVERAGE  a NEW reveal card built from Boneheadz art and no `wear` FAILS.
 *             Static, over js/app.js, because the live half can only grade the
 *             builders it happens to drive, and the failure mode Tom reported is
 *             "one more surface nobody converted".
 *   MANNEQUIN the rendered card carries the neutral BASE (body B0-1 + skull
 *             SK0-1) AND the awarded piece's own layer, all three DECODED. Base
 *             layers are the whole point: without them it is still a floating
 *             cut-out, just a differently framed one.
 *   FRAMED    the piece is CROPPED to the body part it goes on. This is the
 *             grillz half. A grill is ~1.5% of a 640 square, so a mannequin with
 *             no crop makes his complaint worse, not better: the check measures
 *             the rendered scale of the layer and requires it above 1x.
 *   TIER      the layer is drawn from a source sized to the box, never
 *             unconditionally from the 640 master. A QA round measured ~100MB of
 *             bitmaps on one surface from exactly one caller omitting `thumb`.
 *   EMPTY     zero cards examined is a FAILURE, never a pass (rule 3).
 *
 * The card builders are reached through `__gearCard` / `__crateCard`, the app's
 * OWN functions, so a builder that stops setting `wear` goes red here. A card
 * object typed into this file would agree with the renderer by construction.
 *
 * Usage: HEADLESS_MODE=shell node tests/reveal-mannequin-audit.mjs
 *        SHOTS=<dir> keeps a 390x844 screenshot of every case.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boot, sleep, serveTree } from './godmode.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const results = [];
const ok = (name, pass, detail = '') => { results.push({ name, pass }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`); };

/* ---- COVERAGE: static, and derived rather than listed -------------------- */
/* Every pack card whose art comes from the Boneheadz library must also name the
   piece to wear. Deriving the sites from the source (rather than keeping a list
   of known ones) is what makes a surface NOBODY REGISTERED fail: the day someone
   adds a ninth `imgSrc: bhAsset(...)` card, this goes red until they wear it. */
{
  const src = fs.readFileSync(path.join(ROOT, 'js/app.js'), 'utf8').split('\n');
  /* A pet is a creature that stands beside you, not a piece of gear that goes on
     you, and canWear() refuses slot C anyway (no crop). It is named here rather
     than pattern-matched so the exemption is a decision on the record. */
  const EXEMPT = [/p\.pet && BH_BY_ID\[p\.pet\]/];
  const bare = src
    .map((l, i) => ({ n: i + 1, l }))
    .filter(({ l }) => /imgSrc:\s*bhAsset\(/.test(l))
    .filter(({ l }) => !/\bwear:/.test(l))
    .filter(({ l }) => !EXEMPT.some(re => re.test(l)));
  const total = src.filter(l => /imgSrc:\s*bhAsset\(/.test(l)).length;
  ok('COVERAGE: an unregistered reveal card exists to grade at all', total > 0, `${total} card sites`);
  ok('COVERAGE: every Boneheadz-art reveal card names a piece to wear', bare.length === 0,
    bare.length ? bare.map(b => `js/app.js:${b.n}`).join(' ') : `${total} sites, 0 bare`);
}

/* ---- the live half ------------------------------------------------------- */
let srvHandle = null;
let base = process.env.URL;
if (!base) { srvHandle = await serveTree(ROOT); base = srvHandle.url; }
const shots = process.env.SHOTS ? path.resolve(process.env.SHOTS) : null;
if (shots) fs.mkdirSync(shots, { recursive: true });

const { browser, page } = await boot(base, {
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }]);

/* Silence every first-run takeover; they fire in a QUEUE and paint over the
   reveal, and `changelogSeen` holds a build number so `true` reads as 0. */
const quiet = async () => page.evaluate(async () => {
  const db = await import('/js/db.js?q=1');
  const { DROP } = await import('/js/loot.js?q=1');
  await db.kvSet('changelogSeen', 999999);
  await db.kvSet(`dropSeen.${DROP.id}`, true);
  for (const k of ['spiresIntroSeen', 'raceIntroSeen', 'gardenIntroSeen', 'surveySeen', 'namePrompted']) await db.kvSet(k, true);
  await db.kvSet('renameRequired', null);
});
await sleep(1200);
await quiet();
await page.evaluate(() => { location.hash = '#/today'; });
await sleep(1500);
await quiet();

const closeReveal = async () => {
  await page.evaluate(() => document.querySelector('.pack-reveal')?.remove());
  await page.evaluate(() => document.querySelectorAll('.sheet, .veil, .pack-wrap').forEach(e => e.remove()));
};

/* Build the card through the APP's builder, show it, and read the DOM back. */
async function showCard(kind, arg) {
  return page.evaluate(async ([k, a]) => {
    const card = k === 'gear' ? window.__gearCard(a) : window.__crateCard(a);
    if (!card) return { err: 'builder returned nothing' };
    window.__crateForce = 1;
    window.__packReveal([card], {});
    return { built: { wear: card.wear || null, name: card.name, rarity: card.rarity } };
  }, [kind, arg]);
}

/* THE MEASUREMENT. Read from the rendered card, never from the card object:
   the whole failure class is "the data said the right thing and the picture did
   not". `scale` is the drawn width of the 640 square divided by the width of the
   window it peeps through, taken from the live transform matrix, which is the
   only honest way to ask whether the piece is framed or lost on a whole body. */
const measure = () => page.evaluate(() => {
  const worn = document.querySelector('.pack-reveal .pc-worn');
  if (!worn) return { err: 'no .pc-worn on the card', canvas: !!document.querySelector('.pack-reveal .pc-canvas') };
  const anim = worn.querySelector('.bh-anim');
  const m = new DOMMatrixReadOnly(getComputedStyle(anim).transform);
  const box = worn.getBoundingClientRect();
  const panel = worn.parentElement.getBoundingClientRect();
  return {
    fit: [...worn.classList].find(c => c.startsWith('fit-')) || null,
    scale: +m.a.toFixed(3),
    boxW: Math.round(box.width), boxH: Math.round(box.height), panelW: Math.round(panel.width),
    layers: [...anim.querySelectorAll('img')].map(im => ({
      src: im.getAttribute('src'),
      nw: im.naturalWidth,
    })),
  };
});

/* The cases. Real ids, one per builder path, chosen so the two halves Tom named
   are both present: a grill (the scaling complaint) and a hat with a cut-out. */
const CASES = [
  ['grillz (his named case)', 'crate', { item: { id: 'G3', slot: 'G', name: 'Grillz', rarity: 'rare' } }],
  ['gear · hat', 'gear', 'g-H10-1-gravewarden'],
  ['gear · top', 'gear', 'g-T1-greyhound'],
  ['gear · kicks', 'gear', 'g-FW1-boneshaman'],
];
let examined = 0;
for (const [label, kind, arg] of CASES) {
  await closeReveal();
  const built = await showCard(kind, arg);
  if (built.err) { ok(`${label}: the card could be built at all`, false, built.err); continue; }
  await sleep(900);
  const m = await measure();
  if (shots) await page.screenshot({ path: path.join(shots, `${label.replace(/[^a-z0-9]+/gi, '-')}.png`) });
  if (m.err) { ok(`MANNEQUIN ${label}: the piece is drawn worn`, false, JSON.stringify(m)); continue; }
  examined++;
  const srcs = m.layers.map(l => l.src);
  const has = re => srcs.some(s => re.test(s));
  /* The NEUTRAL BASE, by id. "three layers are present" would pass on three
     copies of the item, and "a body layer" would pass on the player's own. */
  ok(`MANNEQUIN ${label}: the neutral base body B0-1 is on the card`, has(/\/B0-1\.png$/), srcs.join(' '));
  ok(`MANNEQUIN ${label}: the neutral base skull SK0-1 is on the card`, has(/\/SK0-1\.png$/), srcs.join(' '));
  ok(`MANNEQUIN ${label}: the awarded piece's own layer is on it (${built.built.wear})`,
    has(new RegExp(`/${built.built.wear}\\.png$`)), srcs.join(' '));
  ok(`MANNEQUIN ${label}: every layer DECODED (an undecoded layer paints nothing)`,
    m.layers.length > 0 && m.layers.every(l => l.nw > 0), JSON.stringify(m.layers.map(l => l.nw)));
  /* FRAMED. Above 1 means the crop pulls in on the body part; at exactly 1 the
     card is a whole skeleton and a grill is a speck, which is the complaint. */
  ok(`FRAMED ${label}: cropped to the body part (${m.fit}, scale ${m.scale}x)`,
    !!m.fit && m.scale > 1, JSON.stringify({ fit: m.fit, scale: m.scale, boxW: m.boxW }));
  /* BUDGET, AND IT IS A CEILING RATHER THAN A TREND (rule 11).
     Be straight about what this can and cannot catch. The obvious check here
     would be "the layer is a thumb tier, not the 640 master", and at this
     geometry that check CANNOT FAIL: .pc-worn is 212px under a crop of up to
     2.8x, which asks for ~1188 device pixels, so bhTierFor returns the master
     whether `thumb` is passed or not. Asserting it would be rule 1 exactly: a
     green light that means nothing.
     What CAN regress is the number of layers. A mannequin built from the
     player's live outfit instead of RACK_BASE, or one that stopped skipping the
     pet, silently multiplies a reveal's decoded bitmaps -- which is the failure
     the memory census caught on another surface at ~100MB. So the bound is on
     decoded bytes for the whole card, counted over UNIQUE srcs (the base pair is
     one decode shared by every card in a pack, and counting it per card would
     invent a cost that is not paid). Three 640 squares is 4.92MB; 6MB leaves
     room for a legitimately larger crop and none for a fourth full-size layer. */
  const bytes = [...new Map(m.layers.map(l => [l.src, l])).values()]
    .reduce((a, l) => a + l.nw * l.nw * 4, 0);
  ok(`BUDGET ${label}: the card's decoded art stays under 6MB (ceiling, not a trend)`,
    bytes > 0 && bytes <= 6e6,
    `${(bytes / 1e6).toFixed(2)}MB over ${new Set(m.layers.map(l => l.src)).size} unique layers`);
}
ok('EMPTY: cards were actually examined (an empty sample set is a failure)', examined === CASES.length, `${examined} of ${CASES.length}`);

await browser.close();
if (srvHandle) srvHandle.close();
const failed = results.filter(r => !r.pass).length;
console.log(`\n${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
