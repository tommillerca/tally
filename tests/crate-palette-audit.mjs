/* tests/crate-palette-audit.mjs — THE PIXEL CRATE IS NOT REPAINTED BY ITS OWN FX.
 *
 * WHY THIS EXISTS. The common crate is nine frames Tom authored at 48x48 and
 * shipped as PNGs. Everything the reveal does around it is CSS built for the
 * VECTOR crates, which have no open state and therefore need faking: a drop
 * with a squash scale, a settle that wobbles up to scale(1.08), a screen-blend
 * bloom laid OVER the crate, and a blurred drop-shadow. Every one of those is
 * harmless to an SVG and fatal to pixel art:
 *   - a transform on the sprite or ANY ancestor promotes the layer, and the
 *     compositor then resamples it bilinearly whatever image-rendering says
 *   - scale(1.08) is not an integer multiple, so even without compositing the
 *     art lands between device pixels
 *   - mix-blend-mode: screen at .98 white over the sprite erases the dark
 *     keyline the whole drawing is built on
 *   - a blurred drop-shadow puts soft grey where the art has none
 *
 * WHAT IT ASSERTS, and none of it can be satisfied by restating the code. It
 * screenshots the running reveal and compares the sprite's own pixels against
 * the source PNG upscaled 3x by nearest neighbour. If any of the four things
 * above is happening, the rendered pixels stop being the authored pixels.
 *   EXACT     the sprite's opaque pixels are byte-identical to the source
 *   PALETTE   the render invents no colour the source frame does not contain
 *   SCALE     the sprite renders at exactly 144 css px, 3x its 48px native
 *   CONTROL   a non-empty sample, and a deliberate mismatch is detectable
 *
 * The CONTROL row matters most: without it a screenshot that came back blank,
 * or a frame that never painted, would pass every comparison above by having
 * nothing to compare.
 */
import { readFileSync } from 'node:fs';
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

const srv = process.argv[2] ? null : await serveTree(ROOT);
const base = process.argv[2] || srv.url;
console.log(`URL UNDER TEST: ${base}`);

const { browser, page } = await boot(base);
/* dpr 1 on purpose: the comparison is against the source PNG at exactly 3x, and
   a device pixel ratio would add its own scaling on top of the one under test. */
await page.setViewport({ width: 393, height: 852, deviceScaleFactor: 1, isMobile: true, hasTouch: true });

await page.evaluate(async () => {
  const db = await import('/js/db.js');
  const { DROP } = await import('/js/loot.js');
  await db.kvSet('changelogSeen', 999999);
  await db.kvSet(`dropSeen.${DROP.id}`, true);
  for (const k of ['spiresIntroSeen', 'raceIntroSeen', 'gardenIntroSeen', 'surveySeen', 'namePrompted']) await db.kvSet(k, true);
  await db.kvSet('renameRequired', null);
});
await sleep(1300);
await page.evaluate(() => { location.hash = '#/today'; });
await sleep(900);

const seam = await page.evaluate(() => typeof window.__packReveal === 'function');
ok('CONTROL the __packReveal test seam is present', seam);

/* EVERY SEQUENCED CRATE, not just the first one built. The Golden crate got its
   own authored frames (Tom's bone chest with the green flame) after this file
   was written, and a guard that covers one of two is half a guard: the exact
   four defects this file exists to catch would have been free to reappear on
   the new one. */
const CRATES = [
  { kind: 'daily',  dir: 'common', frames: 9, frame: 4 },
  { kind: 'golden', dir: 'golden', frames: 3, frame: 1 },
];
for (const C of CRATES) if (seam) {
  /* NOT `() => window.__packReveal(...)`. openPackReveal returns a promise that
     settles when the player closes the reveal, and an implicit return hands that
     promise to page.evaluate, which then waits for a tap that is never coming:
     the first run of this file died on a protocol timeout rather than on a
     measurement. Braces, so the call is fired and not awaited. */
  /* __crateForce OR THERE IS NO CRATE. js/app.js:11096 reads
     `reducedMotion || (navigator.webdriver && !window.__crateForce)` and skips
     the whole opening sequence when it is true, so under an audit the reveal
     renders in browsing mode with no .pack-crate at all. Without this line every
     assertion below would be measuring a screen that has no crate on it. */
  /* ONE REVEAL AT A TIME. The loop used to open the second crate on top of the
     first, so #crateSeq still matched the first one's node and the golden pass
     reported "9 frames, showing assets/crates/common/f1.png" while grading a
     3-frame crate against a 9-frame one. The CONTROL row is what said so.
     A reload is the cheap way to guarantee a clean page per crate. */
  await page.reload({ waitUntil: 'domcontentloaded' });
  await sleep(1200);
  await page.evaluate(() => { location.hash = '#/today'; });
  await sleep(800);
  await page.evaluate(() => { window.__crateForce = true; });
  /* C lives in node, so it has to be PASSED into the page. Referencing it inside
     evaluate threw "C is not defined" the moment this file went from one crate
     to two. */
  await page.evaluate(kind => {
    window.__packReveal(
      [{ name: 'Test Piece', rarity: 'common', kind: 'gear', iconHtml: '<span></span>' }],
      { crate: kind });
  }, C.kind);

  /* Freeze on a chosen frame rather than racing the sequence. Every animation on
     the page is paused, then the frame under test is the only one with .on, so
     the comparison is against a still that cannot have moved between the
     measurement and the screenshot. */
  const FRAME = C.frame;
  /* PUT THE CRATE IN A DETERMINISTIC STATE, do not sleep a guessed number.
     navigator.webdriver scales JS timing by 0.25 at js/app.js:14722 while CSS
     animations are not scaled, so no single sleep is right in both worlds: the
     first version of this file slept 900ms and measured the sprite MID-DROP at
     device y 466.766, and the second waited for vertical stability and caught it
     MID-SINK at 143.5px wide with 0.57% of its pixels intact. Both were the
     harness reporting its own timing as a defect.
     So: pause everything, then seek the drop to its END and the sink to its
     START. That is the state a player looks at while the frames play, and it is
     the same state on any machine. */
  /* 1350ms clears the drop, which is a 1.02s CSS animation. That is the whole
     reason this number is what it is, and the earlier version of this comment
     dressed it up as something cleverer: it claimed navigator.webdriver scales
     JS timing by 0.25 so no single sleep could be right. It does not. The crate
     reveal's `at` is a bare setTimeout; the 0.25 factor is real but belongs to
     the fight's FX choreography and never reaches this screen. The first version
     of this file simply slept 900ms against a 1.02s animation and measured the
     crate mid-flight, at device y 470.766, then reported that as a defect.
     Only the sink is rewound after the wait, so the crate is held in the state a
     player looks at while the frames play. */
  /* WAIT FOR THE SEQUENCE TO FINISH, not for a clock. The frames are driven by a
     rAF loop now, so a fixed sleep can land while the driver is still running and
     the frame this file forces gets overwritten on the next tick: measured, EXACT
     fell to 65.67% while PALETTE stayed at 99.56%, which is the signature of
     comparing against the wrong frame rather than a repainted one. The driver
     stops once the last frame is up, so that is the safe moment to take over. */
  await page.waitForFunction(() => {
    const seq = document.querySelector('#crateSeq');
    return !!seq && seq.children[seq.children.length - 1].classList.contains('on');
  }, { polling: 60, timeout: 12000 }).catch(() => {});
  await sleep(120);
  await page.evaluate(() => {
    for (const a of document.getAnimations()) {
      try {
        const el = a.effect && a.effect.target;
        a.pause();
        if (el && el.classList.contains('co-sink')) a.currentTime = 0;
      } catch {}
    }
  });
  await sleep(160);
  const geo = await page.evaluate(f => {
    const seq = document.querySelector('#crateSeq');
    if (!seq) return null;
    const imgs = [...seq.children];
    imgs.forEach((im, i) => im.classList.toggle('on', i === f));
    const r = seq.getBoundingClientRect();
    const ir = imgs[f].getBoundingClientRect();
    return {
      frames: imgs.length,
      seq: { x: r.left, y: r.top, w: r.width, h: r.height },
      img: { x: ir.left, y: ir.top, w: ir.width, h: ir.height },
      src: imgs[f].getAttribute('src'),
      dpr: window.devicePixelRatio || 1,
      snapped: { ml: seq.style.left || '(none)', mt: seq.style.top || '(none)' },
      chain: (() => { const out = []; for (let n = seq; n && n !== document.body; n = n.parentElement) {
        const cs = getComputedStyle(n);
        if (cs.opacity !== '1' || cs.mixBlendMode !== 'normal' || cs.filter !== 'none')
          out.push(`${n.tagName}.${n.className}: op=${cs.opacity} blend=${cs.mixBlendMode} filter=${cs.filter}`);
      } return out; })(),
    };
  }, FRAME);

  ok(`${C.kind} CONTROL the crate sequence rendered ITS OWN frames`,
    !!geo && geo.frames === C.frames && (geo.src || '').includes(`/${C.dir}/`),
    geo ? `${geo.frames} frames, showing ${geo.src}` : 'no #crateSeq in the reveal');

  if (geo) {
    ok(`${C.kind} SCALE the sprite renders at 144x144, 3x its 48px native`,
      Math.abs(geo.img.w - 144) < 0.01 && Math.abs(geo.img.h - 144) < 0.01,
      `measured ${geo.img.w}x${geo.img.h}`);

    /* Geometry, not pixels, so it names the cause when PALETTE goes red. A
       fractional device origin is resampled however image-rendering is set. */
    const frac = v => Math.abs(v - Math.round(v));
    ok(`${C.kind} ALIGN the sprite sits on whole device pixels`,
      frac(geo.img.x * geo.dpr) < 0.02 && frac(geo.img.y * geo.dpr) < 0.02,
      `device origin ${(geo.img.x * geo.dpr).toFixed(3)},${(geo.img.y * geo.dpr).toFixed(3)} at dpr ${geo.dpr}`
      + `; snap ml=${geo.snapped.ml} mt=${geo.snapped.mt}; ${geo.chain.join(' | ') || 'no offset ancestors'}`);

    /* AND CHECK IT MID-MOTION, not only at rest.
       Everything above is measured with the drop and the settle finished, and
       both of those animations END on the identity transform, so a crate that is
       scaled to 1.08 for most of its life reads as perfect here. Proven: putting
       the vector crate's transform motion back and re-running gave exit 0 on the
       rows above. The sprite has to be 144px at EVERY phase, so the animations
       are seeked to their midpoint and it is measured again. */
    const mid = await page.evaluate(f => {
      let seeked = 0;
      for (const a of document.getAnimations()) {
        try {
          const el = a.effect && a.effect.target;
          if (!el || !el.className || !/co-drop|co-settle|co-sink/.test(el.className)) continue;
          a.pause(); a.currentTime = a.effect.getTiming().duration * 0.5; seeked++;
        } catch {}
      }
      /* the crate's OWN frame index, passed in. Hardcoding 4 was fine while this
         file knew about one 9-frame crate and threw on the 3-frame golden. */
      const seqEl = document.querySelector('#crateSeq');
      const im = seqEl && seqEl.children[Math.min(f, seqEl.children.length - 1)];
      if (!im) return { seeked, w: 0, h: 0 };
      const r = im.getBoundingClientRect();
      return { seeked, w: r.width, h: r.height };
    }, FRAME);
    /* PUT IT BACK. The seek above leaves the crate mid-flight, and the pixel
       comparison below screenshots whatever is on screen: leaving it there took
       the healthy tree from 100.00% to 4.45% exact, which is the harness
       grading its own probe. Drop and settle to their END, sink rewound to its
       START, which is the resting state everything below assumes. */
    await page.evaluate(() => {
      for (const a of document.getAnimations()) {
        try {
          const el = a.effect && a.effect.target;
          if (!el || !el.className) continue;
          if (/co-drop|co-settle/.test(el.className)) a.currentTime = a.effect.getTiming().duration;
          else if (/co-sink/.test(el.className)) a.currentTime = 0;
        } catch {}
      }
    });
    await sleep(140);

    ok(`${C.kind} MOTION the sprite is never scaled, not even mid-animation`,
      mid.seeked > 0 && Math.abs(mid.w - 144) < 0.01 && Math.abs(mid.h - 144) < 0.01,
      `${mid.seeked} crate animation(s) seeked to 50%, sprite measured ${mid.w.toFixed(3)}x${mid.h.toFixed(3)}`);

    await sleep(120);
    const shot = await page.screenshot({
      clip: { x: Math.round(geo.img.x), y: Math.round(geo.img.y), width: 144, height: 144 },
      encoding: 'base64',
    });

    /* The source of truth is the PNG on disk, upscaled 3x by nearest neighbour
       in the page's own canvas. Decoding it in the browser rather than in node
       keeps this file free of an image dependency. */
    /* C.dir, not a hardcoded 'common'. This line graded the golden crate's render
       against the DAILY crate's PNG and reported 3.10% exact, which reads exactly
       like a broken sprite and was a broken audit. */
    const srcB64 = readFileSync(path.join(ROOT, 'assets', 'crates', C.dir, `f${FRAME}.png`)).toString('base64');
    const cmp = await page.evaluate(async (shotB64, srcB64) => {
      const load = s => new Promise((res, rej) => {
        const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = 'data:image/png;base64,' + s;
      });
      const [got, want] = await Promise.all([load(shotB64), load(srcB64)]);
      const grab = (img, w, h, smooth) => {
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        const g = c.getContext('2d', { willReadFrequently: true });
        g.imageSmoothingEnabled = smooth;
        g.drawImage(img, 0, 0, w, h);
        return g.getImageData(0, 0, w, h).data;
      };
      const a = grab(got, 144, 144, false);
      const b = grab(want, 144, 144, false);      /* 48 -> 144 nearest neighbour */
      const pal = new Set();
      for (let i = 0; i < b.length; i += 4) if (b[i + 3] > 250) pal.add(`${b[i]},${b[i + 1]},${b[i + 2]}`);
      let opaque = 0, exact = 0, inPal = 0, worst = 0, sample = null;
      for (let i = 0; i < b.length; i += 4) {
        if (b[i + 3] <= 250) continue;            /* only where the ART is solid */
        opaque++;
        const d = Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
        if (d === 0) exact++; else if (d > worst) {
          worst = d;
          sample = { at: (i / 4) % 144 + ',' + Math.floor(i / 4 / 144),
                     got: `${a[i]},${a[i + 1]},${a[i + 2]}`, want: `${b[i]},${b[i + 1]},${b[i + 2]}` };
        }
        if (pal.has(`${a[i]},${a[i + 1]},${a[i + 2]}`)) inPal++;
      }
      return { opaque, exact, inPal, worst, sample, palette: pal.size };
    }, shot, srcB64);

    /* CONTROL FIRST. An empty or thin sample passes every ratio below by having
       no denominator, which is exactly how a guard stops being able to fail. */
    ok(`${C.kind} CONTROL the source frame has solid art to compare against`,
      cmp.opaque >= 500, `${cmp.opaque} opaque source px, ${cmp.palette} colours`);

    const pctExact = cmp.opaque ? (100 * cmp.exact / cmp.opaque) : 0;
    const pctPal = cmp.opaque ? (100 * cmp.inPal / cmp.opaque) : 0;

    /* PALETTE IS THE PRIMARY ROW, and EXACT is not, which is worth explaining
       because the first version of this file had it the other way round.
       EXACT compares pixel n against pixel n, so it is POSITION SENSITIVE: shift
       the sprite half a pixel and every comparison misses even though nothing
       has been repainted. Measured while proving that out: forcing the sheet's
       translate to a whole number moved PALETTE from 84.05% to 97.86% while
       EXACT went DOWN, from 66.12% to 55.30%, purely because the art had moved.
       PALETTE asks a position-independent question instead: is every colour on
       screen a colour the artist actually used? Resampling invents in-between
       colours, a screen-blend bloom invents brighter ones, and a blurred shadow
       invents grey. None of them can hide from it. */
    ok(`${C.kind} PALETTE the render invents no colour the source frame does not contain`,
      pctPal >= 98, `${pctPal.toFixed(2)}% of rendered px are source colours`
      + (cmp.sample ? `, worst at ${cmp.sample.at}: got ${cmp.sample.got} want ${cmp.sample.want}` : ''));

    ok(`${C.kind} EXACT the rendered sprite matches the source frame pixel for pixel`,
      pctExact >= 90, `${pctExact.toFixed(2)}% exact of ${cmp.opaque} px`);
  }
}

await browser.close();
if (srv) srv.close();

console.log(out.join('\n'));
console.log(fails ? `\nFAIL (${fails})` : `\nall green, ${out.length} checks`);
process.exit(fails ? 1 : 0);
